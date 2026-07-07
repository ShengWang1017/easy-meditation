import type { FastifyInstance } from 'fastify';
import { authLoginSchema, authRegisterSchema, tokenPairSchema } from '@easy-meditation/shared';
import { prisma } from '../../db.js';
import {
  hashPassword,
  hashRefreshToken,
  issueTokenPair,
  normalizeEmail,
  verifyPassword
} from './auth.service.js';

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (request, reply) => {
    const input = authRegisterSchema.parse(request.body);
    const email = normalizeEmail(input.email);
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      return reply.code(409).send({
        data: null,
        error: {
          code: 'EMAIL_ALREADY_REGISTERED',
          message: 'This email is already registered.',
          fields: { email: 'This email is already registered.' }
        }
      });
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(input.password),
        nickname: input.nickname ?? null,
        settings: { create: {} }
      }
    });
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
    const body = request.body as { refreshToken?: string };
    if (!body.refreshToken) {
      return reply.code(400).send({
        data: null,
        error: { code: 'REFRESH_TOKEN_REQUIRED', message: 'Refresh token is required.' }
      });
    }

    const tokenHash = hashRefreshToken(body.refreshToken);
    const stored = await prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      include: { user: true }
    });

    if (!stored) {
      return reply.code(401).send({
        data: null,
        error: { code: 'INVALID_REFRESH_TOKEN', message: 'Please log in again.' }
      });
    }

    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() }
    });

    const tokens = await issueTokenPair(app, stored.user);
    return { data: tokenPairSchema.parse(tokens), error: null };
  });

  app.post('/auth/logout', async (request) => {
    const body = request.body as { refreshToken?: string };
    if (body.refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashRefreshToken(body.refreshToken), revokedAt: null },
        data: { revokedAt: new Date() }
      });
    }

    return { data: { ok: true }, error: null };
  });
}
