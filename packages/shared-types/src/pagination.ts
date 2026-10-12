import { z } from 'zod';

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

/**
 * Cursor pagination for every list endpoint. Cursors are opaque to clients; offset paging is
 * avoided because group-level tables grow per period and deep offsets degrade (NFR-PERF-01).
 */
export const PaginationQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export function pageSchema<T extends z.ZodType>(
  item: T,
): z.ZodObject<{ items: z.ZodArray<T>; nextCursor: z.ZodNullable<z.ZodString> }> {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}
