import type { FastifyInstance } from 'fastify';
import { statsSummarySchema } from '@easy-meditation/shared';
import { prisma } from '../../db.js';
import { mapSession } from '../sessions/sessions.routes.js';
import { deriveCurrentStreak, deriveWeeklyPracticeSeconds } from './stats.service.js';

export async function registerStatsRoutes(app: FastifyInstance) {
  app.get('/stats/summary', { preHandler: [app.authenticate] }, async (request) => {
    const [sessions, totalSessions, durationAggregate] = await prisma.$transaction([
      prisma.practiceSession.findMany({
        where: { userId: request.user.sub },
        orderBy: { endedAt: 'desc' },
        take: 200
      }),
      prisma.practiceSession.count({
        where: { userId: request.user.sub }
      }),
      prisma.practiceSession.aggregate({
        where: { userId: request.user.sub },
        _sum: { actualDurationSeconds: true }
      })
    ]);

    const recentSessions = sessions.slice(0, 10).map(mapSession);

    return {
      data: statsSummarySchema.parse({
        totalSessions,
        totalPracticeSeconds: durationAggregate._sum.actualDurationSeconds ?? 0,
        weeklyPracticeSeconds: deriveWeeklyPracticeSeconds(sessions),
        currentStreak: deriveCurrentStreak(sessions),
        recentSessions
      }),
      error: null
    };
  });
}
