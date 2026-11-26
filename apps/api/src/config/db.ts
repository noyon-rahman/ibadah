// Named import: under Vercel's CJS-mode resolution the CJS default export can
// be typed as the module namespace, so avoid `mongoose.connection` (namespace
// member access) on the default binding.
import mongoose, { connection } from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

mongoose.set('strictQuery', true);

export async function connectDatabase(): Promise<void> {
  try {
    await mongoose.connect(env.MONGODB_URI, {
      autoIndex: env.NODE_ENV !== 'production',
    });
    logger.info(`🗄️ MongoDB connected - db:${connection.name}`);
  } catch (err) {
    logger.error('MongoDB connection failed', err);
    throw err;
  }

  connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  connection.on('error', (err) => {
    logger.error('MongoDB error', err);
  });
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
