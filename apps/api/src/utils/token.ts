// Named import: `@types/jsonwebtoken` uses plain ES exports and no default, so
// the default binding only exists via interop — which Vercel's CJS-mode
// resolver does not apply to a module namespace.
import { sign, verify, type JwtPayload as JwtLibPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { UserRole } from '../modules/user/user.interface.js';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: UserRole;
  type: 'access' | 'refresh';
}

type IssuePayload = Omit<JwtPayload, 'type'>;

/** `verify()` returns a plain object (or a string for JWT payload types it
 * can't decode); the `sub` claim we depend on is only guaranteed present
 * once we've asserted the shape. */
function asPayload(decoded: string | JwtLibPayload): JwtPayload {
  if (typeof decoded === 'string') throw new Error('Unexpected JWT payload');
  return decoded as JwtPayload;
}

export function signAccessToken(payload: IssuePayload): string {
  const opts: SignOptions = { expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'] };
  return sign({ ...payload, type: 'access' }, env.JWT_ACCESS_SECRET, opts);
}

export function signRefreshToken(payload: IssuePayload): string {
  const opts: SignOptions = { expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'] };
  return sign({ ...payload, type: 'refresh' }, env.JWT_REFRESH_SECRET, opts);
}

export function verifyAccessToken(token: string): JwtPayload {
  return asPayload(verify(token, env.JWT_ACCESS_SECRET));
}

export function verifyRefreshToken(token: string): JwtPayload {
  return asPayload(verify(token, env.JWT_REFRESH_SECRET));
}
