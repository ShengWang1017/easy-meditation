import 'dotenv/config';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BREATHING_METHODS_SEED } from '@easy-meditation/shared';
import { beforeAll, beforeEach, afterAll } from 'vitest';
import { seedBreathingMethods } from '../../prisma/seed.js';
import { prisma } from '../db.js';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const seededMethodIds = BREATHING_METHODS_SEED.map((method) => method.id);

function runPackageCommand(command: string) {
  execSync(command, {
    cwd: apiRoot,
    env: process.env,
    stdio: 'inherit'
  });
}

async function ensureSchemaReady() {
  runPackageCommand('npm exec -- prisma migrate deploy --schema prisma/schema.prisma');
}

async function resetAppTables() {
  await prisma.practiceSession.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.userSettings.deleteMany();
  await prisma.customRhythm.deleteMany();
  await prisma.user.deleteMany();
  await prisma.breathingMethod.deleteMany({
    where: {
      id: {
        notIn: seededMethodIds
      }
    }
  });
}

async function seedReferenceData() {
  await seedBreathingMethods();
}

beforeAll(async () => {
  await ensureSchemaReady();
});

beforeEach(async () => {
  await resetAppTables();
  await seedReferenceData();
});

afterAll(async () => {
  await resetAppTables();
  await prisma.$disconnect();
});
