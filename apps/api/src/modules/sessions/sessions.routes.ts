import type { PracticeSession } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import {
  practiceSessionCreateSchema,
  practiceSessionSchema
} from '@easy-meditation/shared';
import { prisma } from '../../db.js';
import { isPrismaUniqueConstraintError } from '../auth/auth.service.js';

function validationError(fields: Record<string, string>) {
  return {
    data: null,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Please check the highlighted fields.',
      fields
    }
  };
}

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

    if (input.methodType === 'built_in') {
      if (!input.methodId) {
        return reply.code(400).send(
          validationError({ methodId: 'A built-in breathing method is required.' })
        );
      }

      if (input.customRhythmId !== null) {
        return reply.code(400).send(
          validationError({ customRhythmId: 'Built-in sessions cannot use a custom rhythm.' })
        );
      }

      const method = await prisma.breathingMethod.findFirst({
        where: { id: input.methodId, isActive: true },
        select: { id: true }
      });

      if (!method) {
        return reply.code(404).send({
          data: null,
          error: {
            code: 'BREATHING_METHOD_NOT_FOUND',
            message: 'Breathing method was not found.'
          }
        });
      }
    }

    if (input.methodType === 'custom') {
      if (input.methodId !== null) {
        return reply.code(400).send(
          validationError({ methodId: 'Custom sessions cannot use a built-in method.' })
        );
      }

      if (!input.customRhythmId) {
        return reply.code(400).send(
          validationError({ customRhythmId: 'A custom rhythm is required.' })
        );
      }

      const customRhythm = await prisma.customRhythm.findFirst({
        where: {
          id: input.customRhythmId,
          userId: request.user.sub,
          deletedAt: null
        },
        select: { id: true }
      });

      if (!customRhythm) {
        return reply.code(404).send({
          data: null,
          error: {
            code: 'CUSTOM_RHYTHM_NOT_FOUND',
            message: 'Custom rhythm was not found.'
          }
        });
      }
    }

    try {
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
    } catch (error) {
      if (!isPrismaUniqueConstraintError(error)) {
        throw error;
      }

      const racedSession = await prisma.practiceSession.findUniqueOrThrow({
        where: { clientSessionId: input.clientSessionId }
      });

      if (racedSession.userId !== request.user.sub) {
        return reply.code(409).send({
          data: null,
          error: {
            code: 'PRACTICE_SESSION_CONFLICT',
            message: 'This session belongs to another user.'
          }
        });
      }

      return reply.code(200).send({ data: mapSession(racedSession), error: null });
    }
  });
}
