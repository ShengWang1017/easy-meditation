import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { BREATHING_METHODS_SEED } from '@easy-meditation/shared';

const prisma = new PrismaClient();

export async function seedBreathingMethods(client: Pick<PrismaClient, 'breathingMethod'> = prisma) {
  for (const method of BREATHING_METHODS_SEED) {
    await client.breathingMethod.upsert({
      where: { id: method.id },
      update: {
        slug: method.slug,
        title: method.title,
        subtitle: method.subtitle,
        category: method.category,
        defaultDurationSeconds: method.defaultDurationSeconds,
        phases: method.phases,
        sortOrder: method.sortOrder,
        isActive: method.isActive
      },
      create: {
        id: method.id,
        slug: method.slug,
        title: method.title,
        subtitle: method.subtitle,
        category: method.category,
        defaultDurationSeconds: method.defaultDurationSeconds,
        phases: method.phases,
        sortOrder: method.sortOrder,
        isActive: method.isActive
      }
    });
  }
}

async function main() {
  await seedBreathingMethods();
}

const isDirectRun =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main()
    .then(async () => prisma.$disconnect())
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
