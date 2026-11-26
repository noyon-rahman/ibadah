// Named imports: `winston` declares `export = winston` (a namespace of values
// with no default). Members resolve identically under both the `require` and
// `import` declaration files, so Vercel's resolver can't degrade them.
import { createLogger, format, transports } from 'winston';
import { env } from '../config/env.js';

const { combine, timestamp, printf, colorize, errors } = format;

const devFormat = printf(({ level, message, timestamp: ts, stack }) => {
  return `${ts} [${level}] ${stack || message}`;
});

export const logger = createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    env.NODE_ENV === 'production' ? format.json() : combine(colorize(), devFormat),
  ),
  transports: [new transports.Console()],
});
