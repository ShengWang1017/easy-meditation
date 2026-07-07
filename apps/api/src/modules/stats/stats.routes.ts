import type { FastifyInstance } from 'fastify';
import { statsSummarySchema } from '@easy-meditation/shared';
import { prisma } from '../../db.js';
import { mapSession } from '../sessions/sessions.routes.js';
import { deriveCurrentStreak, startOfWeeklyWindow } from './stats.service.js';

export async function registerStatsRoutes(app: FastifyInstance) {
  app.get('/stats/summary', { preHandler: [app.authenticate] }, async (request) => {
    const now = new Date();
    const [recentSessionsSource, totalSessions, durationAggregate, weeklyDurationAggregate, streakSessions] = await prisma.$transaction([
      prisma.practiceSession.findMany({
        where: { userId: request.user.sub },
        orderBy: { endedAt: 'desc' },
        take: 10
      }),
      prisma.practiceSession.count({
        where: { userId: request.user.sub }
      }),
      prisma.practiceSession.aggregate({
        where: { userId: request.user.sub },
        _sum: { actualDurationSeconds: true }
      }),
      prisma.practiceSession.aggregate({
        where: {
          userId: request.user.sub,
          endedAt: {
            gte: startOfWeeklyWindow(now),
            lte: now
          }
        },
        _sum: { actualDurationSeconds: true }
      }),
      prisma.practiceSession.findMany({
        where: {
          userId: request.user.sub,
          endedAt: { lte: now }
        },
        select: { endedAt: true },
        orderBy: { endedAt: 'desc' }
      })
    ]);

    const recentSessions = recentSessionsSource.map(mapSession);

    return {
      data: statsSummarySchema.parse({
        totalSessions,
        totalPracticeSeconds: durationAggregate._sum.actualDurationSeconds ?? 0,
        weeklyPracticeSeconds: weeklyDurationAggregate._sum.actualDurationSeconds ?? 0,
        currentStreak: deriveCurrentStreak(streakSessions, now),
        recentSessions
      }),
      error: null
    };
  });
}
