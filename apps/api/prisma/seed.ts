import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { BREATHING_METHODS_SEED } from '@easy-meditation/shared';

const prisma = new PrismaClient();

async function main() {
  for (const method of BREATHING_METHODS_SEED) {
    await prisma.breathingMethod.upsert({
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

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
