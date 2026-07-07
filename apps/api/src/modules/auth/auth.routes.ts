import type { FastifyInstance } from 'fastify';
import {
  authLoginSchema,
  authLogoutSchema,
  authRefreshSchema,
  authRegisterSchema,
  tokenPairSchema
} from '@easy-meditation/shared';
import { prisma } from '../../db.js';
import {
  hashPassword,
  hashRefreshToken,
  isPrismaUniqueConstraintError,
  issueTokenPair,
  normalizeEmail,
  verifyPassword
} from './auth.service.js';

function emailAlreadyRegisteredError() {
  return {
    data: null,
    error: {
      code: 'EMAIL_ALREADY_REGISTERED',
      message: 'This email is already registered.',
      fields: { email: 'This email is already registered.' }
    }
  };
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (request, reply) => {
    const input = authRegisterSchema.parse(request.body);
    const email = normalizeEmail(input.email);
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      return reply.code(409).send(emailAlreadyRegisteredError());
    }

    const passwordHash = await hashPassword(input.password);
    let user;

    try {
      user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          nickname: input.nickname ?? null,
          settings: { create: {} }
        }
      });
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        return reply.code(409).send(emailAlreadyRegisteredError());
      }

      throw error;
    }

    const tokens = await issueTokenPair(app, user);

    return reply.code(201).send({
      data: {
        user: {
          id: user.id,
          email: user.email,
          nickname: user.nickname,
          createdAt: user.createdAt.toISOString()
        },
        tokens: tokenPairSchema.parse(tokens)
      },
      error: null
    });
  });

  app.post('/auth/login', async (request, reply) => {
    const input = authLoginSchema.parse(request.body);
    const email = normalizeEmail(input.email);
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await verifyPassword(user.passwordHash, input.password))) {
      return reply.code(401).send({
        data: null,
        error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' }
      });
    }

    const tokens = await issueTokenPair(app, user);
    return { data: tokenPairSchema.parse(tokens), error: null };
  });

  app.post('/auth/refresh', async (request, reply) => {
    const input = authRefreshSchema.parse(request.body);
    const tokenHash = hashRefreshToken(input.refreshToken);
    const now = new Date();
    const stored = await prisma.refreshToken.findFirst({
      where: {
        tokenHash
      },
      include: { user: true }
    });

    if (!stored) {
      return reply.code(401).send({
        data: null,
        error: { code: 'INVALID_REFRESH_TOKEN', message: 'Please log in again.' }
      });
    }

    const tokens = await prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: {
          id: stored.id,
          revokedAt: null,
          expiresAt: { gt: now }
        },
        data: { revokedAt: now }
      });

      if (revoked.count !== 1) {
        return null;
      }

      return issueTokenPair(app, stored.user, tx);
    });

    if (!tokens) {
      return reply.code(401).send({
        data: null,
        error: { code: 'INVALID_REFRESH_TOKEN', message: 'Please log in again.' }
      });
    }

    return { data: tokenPairSchema.parse(tokens), error: null };
  });

  app.post('/auth/logout', async (request) => {
    const input = authLogoutSchema.parse(request.body ?? {});
    if (input.refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashRefreshToken(input.refreshToken), revokedAt: null },
        data: { revokedAt: new Date() }
      });
    }

    return { data: { ok: true }, error: null };
  });
}
