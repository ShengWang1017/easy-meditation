import { practiceSessionCreateSchema } from '@easy-meditation/shared';
import { z } from 'zod';

export const builtInMethodIdSchema = z.enum(['box', 'four-seven-eight', 'coherent']);
export const customDurationMinutesSchema = z.union([
  z.literal(2),
  z.literal(3),
  z.literal(5),
  z.literal(10)
]);

const phaseSecondsSchema = z.number().int().min(1).max(12);

export const customRhythmPreferencesSchema = z
  .object({
    name: z.literal('自定义'),
    inhaleSeconds: phaseSecondsSchema,
    holdSeconds: phaseSecondsSchema,
    exhaleSeconds: phaseSecondsSchema,
    durationMinutes: customDurationMinutesSchema
  })
  .strict();

const durationOverrideMinutesSchema = z.number().int().min(1).max(60);

export const durationOverridesSchema = z
  .object({
    box: durationOverrideMinutesSchema.optional(),
    'four-seven-eight': durationOverrideMinutesSchema.optional(),
    coherent: durationOverrideMinutesSchema.optional()
  })
  .strict();

export const soundEnabledSchema = z.boolean();
export const beforeStartDismissedSchema = z.boolean();

const pendingLedgerEntrySchema = practiceSessionCreateSchema.extend({
  origin: z.literal('built_in'),
  state: z.literal('pending'),
  attemptCount: z.number().int().min(0),
  nextAttemptAt: z.string().datetime().nullable(),
  lastErrorCode: z.string().min(1).nullable()
});

const retryPausedLedgerEntrySchema = practiceSessionCreateSchema.extend({
  origin: z.literal('built_in'),
  state: z.literal('retry-paused'),
  attemptCount: z.number().int().min(0),
  nextAttemptAt: z.string().datetime().nullable(),
  lastErrorCode: z.string().min(1).nullable()
});

const terminalLedgerEntrySchema = practiceSessionCreateSchema.extend({
  origin: z.literal('built_in'),
  state: z.literal('failed-terminal'),
  lastErrorCode: z.string().min(1)
});

const customLedgerEntrySchema = practiceSessionCreateSchema.extend({
  origin: z.literal('custom'),
  state: z.literal('local-only')
});

export const localSessionLedgerEntrySchema = z
  .discriminatedUnion('state', [
    customLedgerEntrySchema,
    pendingLedgerEntrySchema,
    retryPausedLedgerEntrySchema,
    terminalLedgerEntrySchema
  ])
  .superRefine((entry, context) => {
    if (entry.state === 'local-only') {
      if (
        entry.methodType !== 'custom' ||
        entry.methodId !== null ||
        entry.customRhythmId !== null
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Local-only custom sessions require custom method fields.'
        });
      }
      return;
    }

    if (
      entry.methodType !== 'built_in' ||
      entry.methodId === null ||
      entry.customRhythmId !== null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Built-in ledger sessions require built-in method fields.'
      });
    }
  });

export const localSessionLedgerSchema = z.array(localSessionLedgerEntrySchema);

export type BuiltInMethodId = z.infer<typeof builtInMethodIdSchema>;
export type DurationOverrides = z.infer<typeof durationOverridesSchema>;
