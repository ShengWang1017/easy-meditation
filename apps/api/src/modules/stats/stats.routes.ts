import type { FastifyInstance } from 'fastify';
import { statsSummarySchema } from '@easy-meditation/shared';
import { prisma } from '../../db.js';
import { mapSession } from '../sessions/sessions.routes.js';
import { deriveCurrentStreak, deriveWeeklyPracticeSeconds } from './stats.service.js';

export async function registerStatsRoutes(app: FastifyInstance) {
  app.get('/stats/summary', { preHandler: [app.authenticate] }, async (request) => {
    const sessions = await prisma.practiceSession.findMany({
      where: { userId: request.user.sub },
      orderBy: { endedAt: 'desc' },
      take: 200
    });

    const recentSessions = sessions.slice(0, 10).map(mapSession);

    return {
      data: statsSummarySchema.parse({
        totalSessions: sessions.length,
        totalPracticeSeconds: sessions.reduce((sum, session) => sum + session.actualDurationSeconds, 0),
        weeklyPracticeSeconds: deriveWeeklyPracticeSeconds(sessions),
        currentStreak: deriveCurrentStreak(sessions),
        recentSessions
      }),
      error: null
    };
  });
}
