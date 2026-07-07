import type { FastifyInstance } from 'fastify';
import { breathingMethodSchema, dataEnvelope } from '@easy-meditation/shared';
import { prisma } from '../../db.js';

export async function registerMethodsRoutes(app: FastifyInstance) {
  app.get('/breathing-methods', async () => {
    const methods = await prisma.breathingMethod.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' }
    });

    const data = methods.map((method) =>
      breathingMethodSchema.parse({
        id: method.id,
        slug: method.slug,
        title: method.title,
        subtitle: method.subtitle,
        category: method.category,
        defaultDurationSeconds: method.defaultDurationSeconds,
        phases: method.phases,
        sortOrder: method.sortOrder,
        isActive: method.isActive
      })
    );

    return dataEnvelope(breathingMethodSchema.array()).parse({ data, error: null });
  });
}
