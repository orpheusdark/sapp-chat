import http from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { z, ZodError } from 'zod';
import { auth, signToken, publicUser } from './auth.js';
import { User, Conversation, Message } from './models.js';
import {
  id,
  fail,
  member,
  serializeConversation,
  findDirect,
  sendMessage,
  markRead,
  messageInput,
} from './chat.js';
import { attachRealtime } from './realtime.js';
import { upload, imageStorage, validateImage } from './images.js';

export function createApplication(config, options = {}) {
  const app = express();
  const server = http.createServer(app);
  const realtime = attachRealtime(server, config);
  const storage = options.storage || imageStorage(config);
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY === '1' ? 1 : false);
  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        cb(
          origin && !config.origins.includes(origin)
            ? Object.assign(new Error('Origin not allowed'), { status: 403 })
            : null,
          true,
        );
      },
    }),
  );
  app.use(express.json({ limit: '32kb' }));
  app.get('/api/health', (req, res) =>
    res
      .status(mongoose.connection.readyState === 1 ? 200 : 503)
      .json({ status: mongoose.connection.readyState === 1 ? 'ok' : 'unavailable' }),
  );
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 240,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many requests. Please wait a minute.' },
    }),
  );
  const authLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: config.NODE_ENV === 'test' ? 500 : 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Please try later.' },
  });
  const credentials = z.object({
    email: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    password: z.string().min(8).max(128),
  });
  app.post('/api/auth/register', authLimit, async (req, res) => {
    const body = credentials.extend({ name: z.string().trim().min(2).max(60) }).parse(req.body);
    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await User.create({ name: body.name, email: body.email, passwordHash });
    res.status(201).json({ user: publicUser(user), token: signToken(user, config) });
  });
  app.post('/api/auth/login', authLimit, async (req, res) => {
    const body = credentials.parse(req.body);
    const user = await User.findOne({ email: body.email }).select('+passwordHash');
    const hash =
      user?.passwordHash || '$2b$12$ZiEFXJ9T0LA0PxAMyIMVaOHTwF2we9HxOhvZDR0fL/BAgCyk9Z8uq';
    if (!(await bcrypt.compare(body.password, hash)) || !user)
      fail(401, 'Email or password is incorrect');
    res.json({ user: publicUser(user), token: signToken(user, config) });
  });
  app.use('/api', auth(config));
  app.get('/api/auth/me', (req, res) => res.json(publicUser(req.user)));
  app.get('/api/users', async (req, res) => {
    const q = z.string().trim().min(1).max(80).parse(req.query.q);
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    res.json(
      await User.find({
        _id: { $ne: req.user._id },
        $or: [{ name: new RegExp(escaped, 'i') }, { email: new RegExp(escaped, 'i') }],
      })
        .select('name email')
        .limit(20),
    );
  });
  app.get('/api/conversations', async (req, res) => {
    const conversations = await Conversation.find({ members: req.user._id }).sort({
      updatedAt: -1,
    });
    res.json(await Promise.all(conversations.map((c) => serializeConversation(c, req.user._id))));
  });
  app.post('/api/conversations/direct', async (req, res) => {
    const c = await findDirect(req.user._id, req.body.userId);
    await realtime.publishConversation(c);
    res.json(await serializeConversation(c, req.user._id));
  });
  app.post('/api/conversations/group', async (req, res) => {
    const body = z
      .object({ name: z.string().trim().min(2).max(80), memberIds: z.array(id).min(2).max(99) })
      .parse(req.body);
    const members = [...new Set([String(req.user._id), ...body.memberIds])];
    if (members.length < 3) fail(400, 'A group needs at least three people');
    if ((await User.countDocuments({ _id: { $in: members } })) !== members.length)
      fail(400, 'One or more users do not exist');
    const c = await Conversation.create({
      kind: 'group',
      name: body.name,
      members,
      admin: req.user._id,
    });
    await realtime.publishConversation(c);
    res.status(201).json(await serializeConversation(c, req.user._id));
  });
  app.post('/api/conversations/:id/members', async (req, res) => {
    const c = await member(req.params.id, req.user._id);
    if (c.kind !== 'group' || String(c.admin) !== String(req.user._id))
      fail(403, 'Only the group admin can add people');
    const { userId } = z.object({ userId: id }).parse(req.body);
    if (!(await User.exists({ _id: userId }))) fail(404, 'User not found');
    // Serialize additions with sends so the new member starts at the current read watermark.
    await mongoose.connection.transaction(async (session) => {
      const current = await Conversation.findById(c._id).session(session);
      if (current.members.some((m) => String(m) === userId)) return;
      if (current.members.length >= 100) fail(400, 'Group limit is 100 people');
      current.members.push(userId);
      current.readSeq.set(userId, current.seq);
      await current.save({ session });
    });
    const updated = await Conversation.findById(c._id);
    await realtime.publishConversation(updated);
    res.json(await serializeConversation(updated, req.user._id));
  });
  app.get('/api/conversations/:id/messages', async (req, res) => {
    await member(req.params.id, req.user._id);
    const { before, after, limit } = z
      .object({
        before: z.coerce.number().int().positive().optional(),
        after: z.coerce.number().int().nonnegative().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(req.query);
    if (before !== undefined && after !== undefined) fail(400, 'Choose either before or after');
    const forward = after !== undefined;
    const rows = await Message.find({
      conversation: req.params.id,
      ...(before ? { seq: { $lt: before } } : forward ? { seq: { $gt: after } } : {}),
    })
      .sort({ seq: forward ? 1 : -1 })
      .limit(limit + 1)
      .populate('sender', 'name email');
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const messages = forward ? page : page.reverse();
    res.json({
      messages,
      nextCursor: hasMore ? (forward ? messages.at(-1).seq : messages[0].seq) : null,
    });
  });
  app.post('/api/conversations/:id/messages', async (req, res) => {
    const result = await sendMessage(req.params.id, req.user._id, req.body);
    await realtime.publishMessage(result);
    res.status(result.created ? 201 : 200).json(result.message);
  });
  app.post('/api/conversations/:id/read', async (req, res) => {
    const seq = await markRead(req.params.id, req.user._id, req.body.seq);
    realtime.io.to(`conversation:${req.params.id}`).emit('conversation:read', {
      conversationId: req.params.id,
      userId: String(req.user._id),
      seq,
    });
    res.json({ seq });
  });
  const imageLimit = rateLimit({
    windowMs: 60000,
    limit: 12,
    message: { error: 'Image upload limit reached. Please wait a minute.' },
  });
  app.post(
    '/api/conversations/:id/images',
    imageLimit,
    async (req, res, next) => {
      await member(req.params.id, req.user._id);
      next();
    },
    upload,
    async (req, res) => {
      const data = messageInput.parse(req.body);
      const existing = await Message.findOne({
        conversation: req.params.id,
        sender: req.user._id,
        clientId: data.clientId,
      }).populate('sender', 'name email');
      if (existing) return res.json(existing);
      await validateImage(req.file);
      const image = await storage.upload(req.file.buffer);
      let result;
      try {
        result = await sendMessage(req.params.id, req.user._id, data, image);
      } catch (error) {
        await storage.destroy(image.publicId).catch(() => {});
        throw error;
      }
      if (!result.created) await storage.destroy(image.publicId).catch(() => {});
      await realtime.publishMessage(result);
      res.status(result.created ? 201 : 200).json(result.message);
    },
  );
  app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
  app.use((error, req, res, next) => {
    if (error instanceof ZodError)
      return res.status(400).json({
        error: error.issues.map((i) => `${i.path.join('.') || 'Request'}: ${i.message}`).join('; '),
      });
    if (error.code === 11000)
      return res.status(409).json({ error: 'This email is already registered' });
    if (error.code === 'LIMIT_FILE_SIZE')
      return res.status(413).json({ error: 'Image must be 5 MB or smaller' });
    if (error.name === 'MulterError')
      return res.status(400).json({ error: 'Invalid image upload' });
    const status = error.status || (error instanceof SyntaxError ? 400 : 500);
    if (status >= 500 && config.NODE_ENV !== 'test')
      console.error('Request failed:', error.message);
    res
      .status(status)
      .json({ error: status === 500 ? 'Something went wrong. Please try again.' : error.message });
  });
  return { app, server, ...realtime };
}
