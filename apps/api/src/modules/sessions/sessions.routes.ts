import type { PracticeSession } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import {
  practiceSessionCreateSchema,
  practiceSessionSchema
} from '@easy-meditation/shared';
import { prisma } from '../../db.js';

export function mapSession(session: Pick<
  PracticeSession,
  | 'id'
  | 'clientSessionId'
  | 'methodType'
  | 'methodId'
  | 'customRhythmId'
  | 'methodTitleSnapshot'
  | 'rhythmSnapshot'
  | 'plannedDurationSeconds'
  | 'actualDurationSeconds'
  | 'completed'
  | 'startedAt'
  | 'endedAt'
  | 'createdAt'
>) {
  return practiceSessionSchema.parse({
    id: session.id,
    clientSessionId: session.clientSessionId,
    methodType: session.methodType,
    methodId: session.methodId,
    customRhythmId: session.customRhythmId,
    methodTitleSnapshot: session.methodTitleSnapshot,
    rhythmSnapshot: session.rhythmSnapshot,
    plannedDurationSeconds: session.plannedDurationSeconds,
    actualDurationSeconds: session.actualDurationSeconds,
    completed: session.completed,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt.toISOString(),
    createdAt: session.createdAt.toISOString()
  });
}

export async function registerSessionRoutes(app: FastifyInstance) {
  app.get('/practice-sessions', { preHandler: [app.authenticate] }, async (request) => {
    const sessions = await prisma.practiceSession.findMany({
      where: { userId: request.user.sub },
      orderBy: { endedAt: 'desc' },
      take: 50
    });

    return { data: sessions.map(mapSession), error: null };
  });

  app.post('/practice-sessions', { preHandler: [app.authenticate] }, async (request, reply) => {
    const input = practiceSessionCreateSchema.parse(request.body);
    const existing = await prisma.practiceSession.findUnique({
      where: { clientSessionId: input.clientSessionId }
    });

    if (existing) {
      if (existing.userId !== request.user.sub) {
        return reply.code(409).send({
          data: null,
          error: {
            code: 'PRACTICE_SESSION_CONFLICT',
            message: 'This session belongs to another user.'
          }
        });
      }

      return { data: mapSession(existing), error: null };
    }

    const session = await prisma.practiceSession.create({
      data: {
        clientSessionId: input.clientSessionId,
        userId: request.user.sub,
        methodType: input.methodType,
        methodId: input.methodId,
        customRhythmId: input.customRhythmId,
        methodTitleSnapshot: input.methodTitleSnapshot,
        rhythmSnapshot: input.rhythmSnapshot,
        plannedDurationSeconds: input.plannedDurationSeconds,
        actualDurationSeconds: input.actualDurationSeconds,
        completed: input.completed,
        startedAt: new Date(input.startedAt),
        endedAt: new Date(input.endedAt)
      }
    });

    return reply.code(201).send({ data: mapSession(session), error: null });
  });
}
