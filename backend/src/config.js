import 'dotenv/config';
import { z } from 'zod';

export function readConfig(env = process.env) {
  const schema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(0).max(65535).default(4000),
    MONGODB_URI: z.string().min(1), JWT_SECRET: z.string().min(32),
    CLIENT_ORIGINS: z.string().min(1), TRUST_PROXY: z.enum(['0', '1']).default('0'),
    CLOUDINARY_CLOUD_NAME: z.string().optional(), CLOUDINARY_API_KEY: z.string().optional(), CLOUDINARY_API_SECRET: z.string().optional(),
  });
  const c = schema.parse(env);
  c.origins = c.CLIENT_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
  for (const origin of c.origins) {
    const url = new URL(origin);
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) throw new Error('CLIENT_ORIGINS must contain exact origins without paths or trailing slashes');
    if (c.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('Production origins must use HTTPS');
  }
  if (/replace-with|example|changeme/i.test(c.JWT_SECRET)) throw new Error('Replace the example JWT secret');
  return c;
}
