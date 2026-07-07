import type { FastifyInstance } from 'fastify';
import { meSchema } from '@easy-meditation/shared';
import { prisma } from '../../db.js';

export async function registerMeRoutes(app: FastifyInstance) {
  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
    if (!user) {
      return reply.code(404).send({
        data: null,
        error: { code: 'USER_NOT_FOUND', message: 'User not found.' }
      });
    }

    return {
      data: meSchema.parse({
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        createdAt: user.createdAt.toISOString()
      }),
      error: null
    };
  });
}
