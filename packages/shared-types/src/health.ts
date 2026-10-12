import { z } from 'zod';

export const DependencyStatusSchema = z.enum(['up', 'down']);

export const ReadinessResponseSchema = z.object({
  status: z.enum(['ready', 'not_ready']),
  checks: z.record(z.string(), DependencyStatusSchema),
});
export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>;

export const LivenessResponseSchema = z.object({
  status: z.literal('alive'),
});
export type LivenessResponse = z.infer<typeof LivenessResponseSchema>;
