import mongoose from 'mongoose';
import { z } from 'zod';
import { Conversation, Message, User } from './models.js';
export const id = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ID');
export const messageInput = z.object({ text: z.string().trim().max(4000).default(''), clientId: z.string().uuid() });
export const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export async function member(conversationId, userId) {
  id.parse(conversationId);
  const c = await Conversation.findOne({ _id: conversationId, members: userId });
  if (!c) fail(404, 'Conversation not found');
  return c;
}
export async function serializeConversation(c, userId) {
  await c.populate('members', 'name email');
  const readSeq = c.readSeq.get(String(userId)) || 0;
  const unreadCount = await Message.countDocuments({ conversation: c._id, seq: { $gt: readSeq }, sender: { $ne: userId } });
  return { ...c.toObject({ flattenMaps: true }), unreadCount };
}
export async function findDirect(userId, peerId) {
  id.parse(peerId);
  if (String(userId) === peerId) fail(400, 'Choose another person');
  if (!await User.exists({ _id: peerId })) fail(404, 'User not found');
  const directKey = [String(userId), peerId].sort().join(':');
  try {
    return await Conversation.findOneAndUpdate({ directKey }, { $setOnInsert: { kind: 'direct', members: [userId, peerId], directKey } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    return Conversation.findOne({ directKey });
  }
}
export async function sendMessage(conversationId, userId, data, image) {
  const { text, clientId } = messageInput.parse(data);
  if (!text && !image) fail(400, 'Write a message or choose an image');
  await member(conversationId, userId);
  const filter = { conversation: conversationId, sender: userId, clientId };
  let message, created = false;
  try {
    await mongoose.connection.transaction(async session => {
      created = false;
      message = await Message.findOne(filter).session(session);
      if (message) return;
      const c = await Conversation.findOneAndUpdate({ _id: conversationId, members: userId }, {
        $inc: { seq: 1 }, $set: { lastMessage: { text, image: !!image, sender: userId, createdAt: new Date() } },
      }, { new: true, session });
      if (!c) fail(404, 'Conversation not found');
      [message] = await Message.create([{ ...filter, clientId, text, image, seq: c.seq }], { session });
      created = true;
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    message = await Message.findOne(filter);
    if (!message) throw error;
    created = false;
  }
  await message.populate('sender', 'name email');
  return { message, created };
}
export async function markRead(conversationId, userId, sequence) {
  const c = await member(conversationId, userId);
  const through = Math.min(z.number().int().nonnegative().parse(sequence), c.seq);
  const updated = await Conversation.findOneAndUpdate({ _id: c._id, members: userId }, { $max: { [`readSeq.${userId}`]: through } }, { new: true, timestamps: false });
  return updated.readSeq.get(String(userId)) || 0;
}
