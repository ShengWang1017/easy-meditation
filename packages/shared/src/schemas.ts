import { z } from 'zod';

export const phaseKindSchema = z.enum(['inhale', 'hold', 'exhale']);
export const methodTypeSchema = z.enum(['built_in', 'custom']);

export const breathingPhaseSchema = z.object({
  kind: phaseKindSchema,
  label: z.string().min(1),
  durationSeconds: z.number().int().min(1).max(60)
});

export const breathingMethodSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().min(1),
  category: z.enum(['classic', 'system']),
  defaultDurationSeconds: z.number().int().min(60).max(3600),
  phases: z.array(breathingPhaseSchema).min(1),
  sortOrder: z.number().int(),
  isActive: z.boolean()
});

export const authRegisterSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
  nickname: z.string().trim().min(1).max(40).optional()
});

export const authLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128)
});

export const tokenPairSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1)
});

export const meSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  nickname: z.string().nullable(),
  createdAt: z.string()
});

export const practiceSessionCreateSchema = z.object({
  clientSessionId: z.string().uuid(),
  methodType: methodTypeSchema,
  methodId: z.string().min(1).nullable(),
  customRhythmId: z.string().uuid().nullable(),
  methodTitleSnapshot: z.string().min(1),
  rhythmSnapshot: z.array(breathingPhaseSchema).min(1),
  plannedDurationSeconds: z.number().int().min(1).max(24 * 60 * 60),
  actualDurationSeconds: z.number().int().min(1).max(24 * 60 * 60),
  completed: z.boolean(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime()
});

export const practiceSessionSchema = practiceSessionCreateSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string()
});

const customRhythmFieldsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  inhaleSeconds: z.number().int().min(1).max(60),
  holdSeconds: z.number().int().min(0).max(60),
  exhaleSeconds: z.number().int().min(1).max(60),
  defaultDurationSeconds: z.number().int().min(60).max(3600)
});

function requireAtLeastOneField<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    'At least one field must be provided.'
  );
}

export const customRhythmCreateSchema = customRhythmFieldsSchema;
export const customRhythmUpdateSchema = requireAtLeastOneField(customRhythmFieldsSchema.partial());
export const customRhythmReadSchema = customRhythmFieldsSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export const customRhythmsListSchema = z.array(customRhythmReadSchema);

const userSettingsFieldsSchema = z.object({
  defaultMethodType: methodTypeSchema,
  defaultMethodId: z.string().min(1).nullable(),
  defaultCustomRhythmId: z.string().uuid().nullable(),
  defaultDurationSeconds: z.number().int().min(60).max(3600),
  soundEnabled: z.boolean(),
  hapticsEnabled: z.boolean()
});

export const userSettingsReadSchema = userSettingsFieldsSchema.extend({
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export const userSettingsUpdateSchema = requireAtLeastOneField(userSettingsFieldsSchema.partial());

export const statsSummarySchema = z.object({
  totalSessions: z.number().int().min(0),
  totalPracticeSeconds: z.number().int().min(0),
  weeklyPracticeSeconds: z.number().int().min(0),
  currentStreak: z.number().int().min(0),
  recentSessions: z.array(practiceSessionSchema).max(10)
});

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  fields: z.record(z.string()).optional()
});

export function dataEnvelope<T extends z.ZodTypeAny>(schema: T) {
  return z.object({
    data: schema,
    error: z.null()
  });
}

export const errorEnvelopeSchema = z.object({
  data: z.null(),
  error: apiErrorSchema
});

export type BreathingPhase = z.infer<typeof breathingPhaseSchema>;
export type BreathingMethod = z.infer<typeof breathingMethodSchema>;
export type MethodType = z.infer<typeof methodTypeSchema>;
export type AuthRegisterInput = z.infer<typeof authRegisterSchema>;
export type AuthLoginInput = z.infer<typeof authLoginSchema>;
export type TokenPair = z.infer<typeof tokenPairSchema>;
export type Me = z.infer<typeof meSchema>;
export type CustomRhythmCreateInput = z.infer<typeof customRhythmCreateSchema>;
export type CustomRhythmUpdateInput = z.infer<typeof customRhythmUpdateSchema>;
export type CustomRhythm = z.infer<typeof customRhythmReadSchema>;
export type CustomRhythmsList = z.infer<typeof customRhythmsListSchema>;
export type PracticeSessionCreateInput = z.infer<typeof practiceSessionCreateSchema>;
export type PracticeSession = z.infer<typeof practiceSessionSchema>;
export type UserSettings = z.infer<typeof userSettingsReadSchema>;
export type UserSettingsUpdateInput = z.infer<typeof userSettingsUpdateSchema>;
export type StatsSummary = z.infer<typeof statsSummarySchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
