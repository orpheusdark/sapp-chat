import mongoose from 'mongoose';
import { readConfig } from './config.js';
import { initializeModels } from './models.js';
import { createApplication } from './app.js';
const config = readConfig();
await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
await initializeModels();
const { server, io } = createApplication(config);
server.listen(config.PORT, '0.0.0.0', () =>
  console.log(`orphchat API listening on port ${config.PORT}`),
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  io.close();
  server.close();
  await mongoose.disconnect();
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
