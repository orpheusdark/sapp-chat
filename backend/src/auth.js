import jwt from 'jsonwebtoken';
import { User } from './models.js';
export const publicUser = user => ({ _id: String(user._id), name: user.name, email: user.email });
export function signToken(user, config) {
  return jwt.sign({}, config.JWT_SECRET, { subject: String(user._id), expiresIn: '7d', algorithm: 'HS256', issuer: 'sapphire-chat', audience: 'sapphire-client' });
}
export async function verifyToken(token, config) {
  try {
    const claims = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'], issuer: 'sapphire-chat', audience: 'sapphire-client' });
    const user = await User.findById(claims.sub);
    if (!user) throw new Error();
    return { user, expiresAt: claims.exp * 1000 };
  } catch { throw Object.assign(new Error('Your session has expired. Please sign in again.'), { status: 401 }); }
}
export const auth = config => async (req, res, next) => {
  try {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    const { user } = await verifyToken(token, config);
    req.user = user; next();
  } catch (error) { next(error); }
};
