import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { v2 as cloudinary } from 'cloudinary';
import { fail } from './chat.js';
export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 3, parts: 4 } }).single('image');
export function imageStorage(config) {
  cloudinary.config({ cloud_name: config.CLOUDINARY_CLOUD_NAME, api_key: config.CLOUDINARY_API_KEY, api_secret: config.CLOUDINARY_API_SECRET, secure: true });
  return {
    async upload(buffer) {
      if (!config.CLOUDINARY_CLOUD_NAME || !config.CLOUDINARY_API_KEY || !config.CLOUDINARY_API_SECRET) fail(503, 'Image sharing needs Cloudinary configuration. Text chat is available.');
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream({ folder: 'sapphire-chat', resource_type: 'image', allowed_formats: ['jpg', 'png', 'webp', 'gif'], unique_filename: true }, (error, result) => error ? reject(Object.assign(new Error('Image upload failed. Please try again.'), { status: 502 })) : resolve(result)).end(buffer);
      });
      return { url: result.secure_url, publicId: result.public_id, width: result.width, height: result.height };
    },
    async destroy(publicId) { await cloudinary.uploader.destroy(publicId); },
  };
}
export async function validateImage(file) {
  if (!file) fail(400, 'Choose an image');
  const detected = await fileTypeFromBuffer(file.buffer);
  if (!detected || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(detected.mime)) fail(400, 'Only JPEG, PNG, WebP and GIF images are supported');
}
