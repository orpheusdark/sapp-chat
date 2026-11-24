import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readConfig } from './config.js';
import { User, Conversation, Message, initializeModels } from './models.js';
import { findDirect, sendMessage } from './chat.js';

export async function seed(password) {
  if (!password || password.length < 12)
    throw new Error('Set SEED_PASSWORD to a password with at least 12 characters');
  const people = [];
  for (const [name, email] of [
    ['Alex Morgan', 'alex@sapphire.test'],
    ['Jamie Chen', 'jamie@sapphire.test'],
    ['Sofia Rivera', 'sofia@sapphire.test'],
    ['Noah Williams', 'noah@sapphire.test'],
  ]) {
    let user = await User.findOne({ email });
    if (!user)
      user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12) });
    people.push(user);
  }
  const [alex, jamie, sofia, noah] = people;
  const direct = await findDirect(alex._id, String(jamie._id));
  if (!(await Message.exists({ conversation: direct._id }))) {
    const exchanges = [
      [jamie, 'Hey Alex! Have you had a chance to look at the new moodboard?'],
      [alex, 'Just opened it. The colors feel so fresh — love where this is going.'],
      [
        jamie,
        'Right? I was thinking we could bring a little more of that lavender into the illustrations.',
      ],
      [
        alex,
        'Yes! Let’s try it on the welcome screen first. A little personality goes a long way.',
      ],
      [jamie, 'Perfect. I’ll put a few options together before our catch-up.'],
      [alex, 'Sounds like a plan. Coffee and good ideas? ☕'],
      [jamie, 'The best kind of afternoon. See you at 3!'],
    ];
    for (const [sender, text] of exchanges)
      await sendMessage(String(direct._id), sender._id, { text, clientId: randomUUID() });
  }
  for (const [peer, text] of [
    [sofia, 'The little details make all the difference. Thanks for your help today!'],
    [noah, 'Found a great spot for our next team lunch. I’ll send the details soon.'],
  ]) {
    const chat = await findDirect(alex._id, String(peer._id));
    if (!chat.seq) await sendMessage(String(chat._id), peer._id, { text, clientId: randomUUID() });
  }
  let group = await Conversation.findOne({
    kind: 'group',
    name: 'The creative corner',
    admin: alex._id,
  });
  if (!group)
    group = await Conversation.create({
      kind: 'group',
      name: 'The creative corner',
      admin: alex._id,
      members: people.map((p) => p._id),
    });
  if (!group.seq) {
    await sendMessage(String(group._id), alex._id, {
      text: 'A little space for big ideas. Welcome to the creative corner!',
      clientId: randomUUID(),
    });
    await sendMessage(String(group._id), sofia._id, {
      text: 'Already feeling inspired. What are we making next?',
      clientId: randomUUID(),
    });
  }
  return people;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = readConfig();
  if (config.NODE_ENV === 'production') throw new Error('Demo seed is disabled in production');
  try {
    await mongoose.connect(config.MONGODB_URI);
    await initializeModels();
    await seed(process.env.SEED_PASSWORD);
    console.log(
      'Seed ready: alex@sapphire.test, jamie@sapphire.test, sofia@sapphire.test, noah@sapphire.test. Password is your SEED_PASSWORD; existing passwords are unchanged.',
    );
  } finally {
    await mongoose.disconnect();
  }
}
