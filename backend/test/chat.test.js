import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import supertest from 'supertest';
import { io as client } from 'socket.io-client';
import { createApplication } from '../src/app.js';
import { initializeModels, Message, Conversation } from '../src/models.js';
import { readConfig } from '../src/config.js';

let mongo, runtime, api, url;
const sockets = [];
const people = [];
const config = {
  NODE_ENV: 'test',
  JWT_SECRET: 'a-test-secret-with-more-than-32-characters',
  origins: ['http://localhost:5173'],
  TRUST_PROXY: '0',
};
const fakeStorage = {
  upload: async () => ({
    url: 'https://res.cloudinary.com/test/image/upload/example.png',
    publicId: randomUUID(),
    width: 1,
    height: 1,
  }),
  destroy: async () => {},
};
const authorization = (person) => ({ Authorization: `Bearer ${person.token}` });
const send = (person, cid, text, clientId = randomUUID()) =>
  api
    .post(`/api/conversations/${cid}/messages`)
    .set(authorization(person))
    .send({ text, clientId });
async function connect(person) {
  const socket = client(url, {
    auth: { token: person.token },
    transports: ['websocket'],
    forceNew: true,
  });
  sockets.push(socket);
  await new Promise((resolve, reject) => {
    socket.once('session:ready', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}
const ack = (socket, event, data) =>
  new Promise((resolve, reject) =>
    socket
      .timeout(3000)
      .emit(event, data, (error, result) => (error ? reject(error) : resolve(result))),
  );
const event = (socket, name) =>
  Promise.race([
    once(socket, name).then(([data]) => data),
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${name}`)), 5000);
      timer.unref();
    }),
  ]);
before(
  async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    await mongoose.connect(mongo.getUri());
    await initializeModels();
    runtime = createApplication(config, { storage: fakeStorage });
    await new Promise((resolve) => runtime.server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${runtime.server.address().port}`;
    api = supertest(runtime.app);
    for (const name of ['Alice', 'Bob', 'Carol', 'Dylan']) {
      const result = await api
        .post('/api/auth/register')
        .send({ name, email: `${name.toLowerCase()}@example.com`, password: 'TestPassword!42' })
        .expect(201);
      people.push(result.body);
    }
  },
  { timeout: 180000 },
);
after(async () => {
  sockets.forEach((s) => s.disconnect());
  if (runtime) await new Promise((resolve) => runtime.io.close(resolve));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('configuration rejects placeholder secrets and unsafe production origins', () => {
  const env = {
    MONGODB_URI: 'mongodb://localhost/test',
    JWT_SECRET: config.JWT_SECRET,
    CLIENT_ORIGINS: 'https://app.example.com',
    NODE_ENV: 'production',
  };
  assert.equal(readConfig(env).origins[0], 'https://app.example.com');
  assert.throws(() =>
    readConfig({ ...env, JWT_SECRET: 'replace-with-a-random-secret-of-at-least-32-characters' }),
  );
  assert.throws(() => readConfig({ ...env, CLIENT_ORIGINS: 'http://app.example.com' }));
  assert.throws(() => readConfig({ ...env, CLIENT_ORIGINS: 'https://app.example.com/' }));
});
test('JWT login, protected routes, unique normalized emails and validation', async () => {
  await api.get('/api/auth/me').expect(401);
  const result = await api
    .post('/api/auth/login')
    .send({ email: 'ALICE@example.com', password: 'TestPassword!42' })
    .expect(200);
  assert.equal(result.body.user.name, 'Alice');
  assert.ok(!result.body.user.passwordHash);
  await api
    .post('/api/auth/login')
    .send({ email: 'alice@example.com', password: 'incorrect!' })
    .expect(401);
  await api
    .post('/api/auth/register')
    .send({ name: 'Other', email: 'ALICE@example.com', password: 'TestPassword!42' })
    .expect(409);
  await api
    .post('/api/auth/register')
    .send({ name: 'X', email: 'bad', password: 'tiny' })
    .expect(400);
  const me = await api.get('/api/auth/me').set(authorization(people[0])).expect(200);
  assert.equal(me.body._id, people[0].user._id);
  await api
    .get('/api/auth/me')
    .set('Origin', 'https://untrusted.example')
    .set(authorization(people[0]))
    .expect(403);
});
test('user search excludes self, escapes regex syntax and does not disclose password hashes', async () => {
  const result = await api.get('/api/users?q=bob').set(authorization(people[0])).expect(200);
  assert.equal(result.body.length, 1);
  assert.equal(result.body[0].name, 'Bob');
  assert.ok(!result.body[0].passwordHash);
  const escaped = await api.get('/api/users?q=%2E%2A').set(authorization(people[0])).expect(200);
  assert.equal(escaped.body.length, 0);
});
test('concurrent private conversation creation is idempotent and membership protects history', async () => {
  const [a, b, outsider] = people;
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      api
        .post('/api/conversations/direct')
        .set(authorization(i % 2 ? b : a))
        .send({ userId: (i % 2 ? a : b).user._id })
        .expect(200),
    ),
  );
  assert.equal(new Set(results.map((r) => r.body._id)).size, 1);
  const cid = results[0].body._id;
  await api.get(`/api/conversations/${cid}/messages`).set(authorization(outsider)).expect(404);
  await send(outsider, cid, 'intrusion').expect(404);
  await api
    .post('/api/conversations/direct')
    .set(authorization(a))
    .send({ userId: a.user._id })
    .expect(400);
  await api.get('/api/conversations/not-an-id/messages').set(authorization(a)).expect(400);
});
test('REST messages persist once under concurrent retries; cursor pages are stable during inserts', async () => {
  const [a, , c] = people;
  const { body: chat } = await api
    .post('/api/conversations/direct')
    .set(authorization(a))
    .send({ userId: c.user._id });
  const clientId = randomUUID();
  const results = await Promise.all(
    Array.from({ length: 6 }, () => send(a, chat._id, 'send once', clientId)),
  );
  assert.ok(results.every((r) => [200, 201].includes(r.status)));
  assert.equal(new Set(results.map((r) => r.body._id)).size, 1);
  for (let i = 0; i < 5; i++) await send(a, chat._id, `message ${i}`).expect(201);
  const page = await api
    .get(`/api/conversations/${chat._id}/messages?limit=3`)
    .set(authorization(c))
    .expect(200);
  assert.deepEqual(
    page.body.messages.map((m) => m.seq),
    [4, 5, 6],
  );
  await send(a, chat._id, 'concurrent new message').expect(201);
  const older = await api
    .get(`/api/conversations/${chat._id}/messages?limit=3&before=${page.body.nextCursor}`)
    .set(authorization(c))
    .expect(200);
  assert.deepEqual(
    older.body.messages.map((m) => m.seq),
    [1, 2, 3],
  );
  assert.equal(older.body.nextCursor, null);
  assert.equal(await Message.countDocuments({ conversation: chat._id }), 7);
  const catchup = await api
    .get(`/api/conversations/${chat._id}/messages?limit=2&after=3`)
    .set(authorization(c))
    .expect(200);
  assert.deepEqual(catchup.body.messages.map((m) => m.seq), [4, 5]);
  assert.equal(catchup.body.nextCursor, 5);
  const next = await api
    .get(`/api/conversations/${chat._id}/messages?limit=2&after=${catchup.body.nextCursor}`)
    .set(authorization(c))
    .expect(200);
  assert.deepEqual(next.body.messages.map((m) => m.seq), [6, 7]);
  assert.equal(next.body.nextCursor, null);
  await api.get(`/api/conversations/${chat._id}/messages?before=3&after=1`).set(authorization(c)).expect(400);
  await send(a, chat._id, '').expect(400);
  await send(a, chat._id, 'a'.repeat(4001)).expect(400);
});
test('authenticated rooms save before emitting and reject forged sender and unauthorized joins', async () => {
  const [a, b, outsider] = people;
  const { body: chat } = await api
    .post('/api/conversations/direct')
    .set(authorization(a))
    .send({ userId: b.user._id });
  const sa = await connect(a),
    sb = await connect(b),
    sc = await connect(outsider);
  assert.ok((await ack(sc, 'conversation:join', { conversationId: chat._id })).error);
  let leaked = false;
  sc.on('message:new', () => {
    leaked = true;
  });
  const incoming = event(sb, 'message:new');
  const result = await ack(sa, 'message:send', {
    conversationId: chat._id,
    text: 'live hello',
    clientId: randomUUID(),
    sender: outsider.user._id,
  });
  assert.ok(result.data);
  const message = await incoming;
  assert.equal(message.sender._id, a.user._id);
  assert.ok(await Message.exists({ _id: message._id }));
  assert.equal(leaked, false);
  const typingEvent = event(sb, 'typing');
  await ack(sa, 'typing', { conversationId: chat._id, active: true });
  assert.equal((await typingEvent).name, 'Alice');
  assert.ok((await ack(sc, 'typing', { conversationId: chat._id, active: true })).error);
  const bad = client(url, { auth: { token: 'invalid' }, forceNew: true });
  sockets.push(bad);
  assert.equal((await event(bad, 'connect_error')).message, 'Unauthorized');
});
test('read watermarks are monotonic and cannot clear messages newer than what was viewed', async () => {
  const [a, b] = people;
  const chat = await Conversation.findOne({ directKey: [a.user._id, b.user._id].sort().join(':') });
  const oldSeq = chat.seq;
  await send(a, chat._id, 'unread newer').expect(201);
  await api
    .post(`/api/conversations/${chat._id}/read`)
    .set(authorization(b))
    .send({ seq: oldSeq })
    .expect(200);
  let list = await api.get('/api/conversations').set(authorization(b)).expect(200);
  assert.equal(list.body.find((c) => c._id === String(chat._id)).unreadCount, 1);
  await api
    .post(`/api/conversations/${chat._id}/read`)
    .set(authorization(b))
    .send({ seq: 0 })
    .expect(200);
  list = await api.get('/api/conversations').set(authorization(b));
  assert.equal(list.body.find((c) => c._id === String(chat._id)).readSeq[b.user._id], oldSeq);
  await api
    .post(`/api/conversations/${chat._id}/read`)
    .set(authorization(b))
    .send({ seq: oldSeq + 1 })
    .expect(200);
  list = await api.get('/api/conversations').set(authorization(b));
  assert.equal(list.body.find((c) => c._id === String(chat._id)).unreadCount, 0);
});
test('presence keeps a user online until their last socket disconnects', async () => {
  const d = people[3];
  const one = await connect(d);
  const two = await connect(d);
  assert.equal(runtime.online.get(d.user._id), 2);
  const changed = event(two, 'presence');
  one.disconnect();
  assert.ok((await changed).includes(d.user._id));
  assert.equal(runtime.online.get(d.user._id), 1);
  two.disconnect();
});
test('groups restrict additions to admins and dynamically subscribe new members', async () => {
  const [a, b, c, d] = people;
  const { body: chat } = await api
    .post('/api/conversations/group')
    .set(authorization(a))
    .send({ name: 'Design studio', memberIds: [b.user._id, c.user._id] })
    .expect(201);
  await api
    .post(`/api/conversations/${chat._id}/members`)
    .set(authorization(b))
    .send({ userId: d.user._id })
    .expect(403);
  await send(c, chat._id, 'before addition').expect(201);
  const sd = await connect(d);
  await api
    .post(`/api/conversations/${chat._id}/members`)
    .set(authorization(a))
    .send({ userId: d.user._id })
    .expect(200);
  await api
    .post(`/api/conversations/${chat._id}/members`)
    .set(authorization(a))
    .send({ userId: d.user._id })
    .expect(200);
  const incoming = event(sd, 'message:new');
  await send(b, chat._id, 'welcome Dylan').expect(201);
  assert.equal((await incoming).text, 'welcome Dylan');
  const list = await api.get('/api/conversations').set(authorization(d));
  const group = list.body.find((c) => c._id === chat._id);
  assert.equal(group.members.length, 4);
  assert.equal(group.unreadCount, 1);
});
test('image uploads validate content, membership and limits and produce persisted image messages', async () => {
  const [a, b, outsider] = people;
  const { body: chat } = await api
    .post('/api/conversations/direct')
    .set(authorization(a))
    .send({ userId: b.user._id });
  await api
    .post(`/api/conversations/${chat._id}/images`)
    .set(authorization(outsider))
    .attach('image', Buffer.from('bad'), 'fake.png')
    .expect(404);
  await api
    .post(`/api/conversations/${chat._id}/images`)
    .set(authorization(a))
    .field('clientId', randomUUID())
    .attach('image', Buffer.from('<svg onload="alert(1)"/>'), 'fake.png')
    .expect(400);
  const buffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=',
    'base64',
  );
  const clientId = randomUUID();
  const response = await api
    .post(`/api/conversations/${chat._id}/images`)
    .set(authorization(a))
    .field('clientId', clientId)
    .field('text', 'a small moment')
    .attach('image', buffer, 'photo.png')
    .expect(201);
  assert.match(response.body.image.url, /^https:/);
  assert.ok(await Message.exists({ _id: response.body._id }));
  const retry = await api
    .post(`/api/conversations/${chat._id}/images`)
    .set(authorization(a))
    .field('clientId', clientId)
    .attach('image', buffer, 'photo.png')
    .expect(200);
  assert.equal(retry.body._id, response.body._id);
  await api
    .post(`/api/conversations/${chat._id}/images`)
    .set(authorization(a))
    .field('clientId', randomUUID())
    .attach('image', Buffer.alloc(5 * 1024 * 1024 + 1), 'large.png')
    .expect(413);
});
test('failed database writes never broadcast a new message', async () => {
  const [a, b] = people;
  const { body: chat } = await api
    .post('/api/conversations/direct')
    .set(authorization(a))
    .send({ userId: b.user._id });
  const sb = await connect(b);
  let delivered = false;
  const listener = () => {
    delivered = true;
  };
  sb.on('message:new', listener);
  const original = Message.create;
  Message.create = async () => {
    throw new Error('simulated storage failure');
  };
  const prior = (await Conversation.findById(chat._id)).seq;
  try {
    await send(a, chat._id, 'must roll back').expect(500);
  } finally {
    Message.create = original;
    sb.off('message:new', listener);
  }
  assert.equal(delivered, false);
  assert.equal((await Conversation.findById(chat._id)).seq, prior);
});
