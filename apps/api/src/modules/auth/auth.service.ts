import crypto from 'node:crypto';
import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../db.js';
import { loadEnv } from '../../env.js';

export type AuthUser = {
  id: string;
  email: string;
  nickname: string | null;
  createdAt: Date;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export function isPrismaUniqueConstraintError(error: unknown): error is { code: 'P2002' } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

export async function issueTokenPair(app: FastifyInstance, user: AuthUser) {
  const env = loadEnv();
  const accessToken = app.jwt.sign({ sub: user.id, email: user.email }, {
    expiresIn: `${env.ACCESS_TOKEN_TTL_SECONDS}s`
  });
  const refreshToken = createRefreshToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt
    }
  });

  return { accessToken, refreshToken };
}
