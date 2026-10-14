import { z } from 'zod';
import { PERMISSIONS } from './permissions.js';

/** A label in each supported locale (configuration data, i18n standard): `en` always present. */
export const LocalisedTextSchema = z.object({ en: z.string(), ar: z.string().optional() });
export type LocalisedText = z.infer<typeof LocalisedTextSchema>;

/** A subsidiary as listed to a caller. */
export const EntitySummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: LocalisedTextSchema,
});

export type EntitySummaryDto = z.infer<typeof EntitySummarySchema>;

/**
 * GET /api/v1/me (docs/api/openapi.yaml): who the caller is, whose data they may touch, the
 * subsidiaries they can see and their effective permissions. Clients validate it: the API is
 * trusted, but not blindly. Unknown permissions (a newer API) are dropped, never trusted.
 */
export const MeSchema = z.object({
  userId: z.string(),
  username: z.string().nullable(),
  name: z.string().nullable(),
  roles: z.array(z.string()),
  scope: z.enum(['group', 'entity']),
  entityIds: z.array(z.string()).optional(),
  permissions: z
    .array(z.string())
    .transform((values) =>
      values.filter((value) => (PERMISSIONS as readonly string[]).includes(value)),
    )
    .pipe(z.array(z.enum(PERMISSIONS))),
  entities: z.array(EntitySummarySchema),
});

export type Me = z.infer<typeof MeSchema>;
