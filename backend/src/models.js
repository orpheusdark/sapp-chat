import mongoose from 'mongoose';
const { Schema } = mongoose;
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true },
);
const conversationSchema = new Schema(
  {
    kind: { type: String, enum: ['direct', 'group'], required: true },
    name: { type: String, maxlength: 80 },
    members: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
    admin: { type: Schema.Types.ObjectId, ref: 'User' },
    directKey: String,
    seq: { type: Number, default: 0 },
    readSeq: { type: Map, of: Number, default: {} },
    lastMessage: {
      text: String,
      sender: { type: Schema.Types.ObjectId, ref: 'User' },
      image: Boolean,
      createdAt: Date,
    },
  },
  { timestamps: true },
);
conversationSchema.index(
  { directKey: 1 },
  { unique: true, partialFilterExpression: { directKey: { $type: 'string' } } },
);
conversationSchema.index({ members: 1, updatedAt: -1 });
const messageSchema = new Schema(
  {
    conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    seq: { type: Number, required: true },
    clientId: { type: String, required: true },
    text: { type: String, maxlength: 4000, default: '' },
    image: { url: String, publicId: String, width: Number, height: Number },
  },
  { timestamps: true },
);
messageSchema.index({ conversation: 1, seq: -1 }, { unique: true });
messageSchema.index({ conversation: 1, sender: 1, clientId: 1 }, { unique: true });
export const User = mongoose.model('User', userSchema);
export const Conversation = mongoose.model('Conversation', conversationSchema);
export const Message = mongoose.model('Message', messageSchema);
export async function initializeModels() {
  await Promise.all([User.init(), Conversation.init(), Message.init()]);
}
