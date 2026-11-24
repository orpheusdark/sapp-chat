import { Server } from 'socket.io';
import { verifyToken } from './auth.js';
import { Conversation } from './models.js';
import { member, sendMessage, markRead } from './chat.js';
const room = (id) => `conversation:${id}`;
const userRoom = (id) => `user:${id}`;
export function attachRealtime(server, config) {
  const io = new Server(server, {
    cors: { origin: config.origins, methods: ['GET', 'POST'] },
    maxHttpBufferSize: 16 * 1024,
    allowRequest: (req, callback) =>
      callback(null, !req.headers.origin || config.origins.includes(req.headers.origin)),
  });
  const online = new Map();
  io.use(async (socket, next) => {
    try {
      Object.assign(socket.data, await verifyToken(socket.handshake.auth?.token, config));
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });
  const presence = () => io.emit('presence', [...online.keys()]);
  async function publishConversation(c) {
    for (const uid of c.members.map(String)) {
      io.in(userRoom(uid)).socketsJoin(room(c._id));
      io.to(userRoom(uid)).emit('conversation:updated', { conversationId: String(c._id) });
    }
  }
  async function publishMessage(result) {
    if (result.created)
      io.to(room(result.message.conversation)).emit('message:new', result.message);
    return result.message;
  }
  io.on('connection', async (socket) => {
    const uid = String(socket.data.user._id);
    socket.join(userRoom(uid));
    online.set(uid, (online.get(uid) || 0) + 1);
    presence();
    const expiry = setTimeout(
      () => socket.disconnect(true),
      Math.max(1, socket.data.expiresAt - Date.now()),
    );
    let events = 0;
    const windowTimer = setInterval(() => {
      events = 0;
    }, 10000);
    const typingRooms = new Set();
    const handle =
      (fn) =>
      async (data, ack = () => {}) => {
        if (typeof ack !== 'function') ack = () => {};
        if (++events > 60) return ack({ error: 'Slow down and try again' });
        try {
          ack({ data: await fn(data || {}) });
        } catch (error) {
          ack({ error: error.status ? error.message : 'Invalid request' });
        }
      };
    socket.on(
      'conversation:join',
      handle(async ({ conversationId }) => {
        await member(conversationId, uid);
        await socket.join(room(conversationId));
        return true;
      }),
    );
    socket.on(
      'message:send',
      handle(async ({ conversationId, ...data }) =>
        publishMessage(await sendMessage(conversationId, uid, data)),
      ),
    );
    socket.on(
      'conversation:read',
      handle(async ({ conversationId, seq }) => {
        const readSeq = await markRead(conversationId, uid, seq);
        io.to(room(conversationId)).emit('conversation:read', {
          conversationId,
          userId: uid,
          seq: readSeq,
        });
        return readSeq;
      }),
    );
    socket.on(
      'typing',
      handle(async ({ conversationId, active }) => {
        await member(conversationId, uid);
        if (active) typingRooms.add(conversationId);
        else typingRooms.delete(conversationId);
        socket.to(room(conversationId)).emit('typing', {
          conversationId,
          userId: uid,
          name: socket.data.user.name,
          active: !!active,
        });
        return true;
      }),
    );
    socket.on('disconnect', () => {
      clearTimeout(expiry);
      clearInterval(windowTimer);
      online.set(uid, (online.get(uid) || 1) - 1);
      if (!online.get(uid)) online.delete(uid);
      for (const cid of typingRooms)
        socket.to(room(cid)).emit('typing', { conversationId: cid, userId: uid, active: false });
      presence();
    });
    try {
      const conversations = await Conversation.find({ members: uid }).select('_id');
      if (socket.connected) {
        await socket.join(conversations.map((c) => room(c._id)));
        socket.emit('session:ready');
      }
    } catch {
      socket.disconnect(true);
    }
  });
  return { io, online, publishMessage, publishConversation };
}
