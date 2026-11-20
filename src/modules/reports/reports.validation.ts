import { z } from 'zod';

export const reportQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2200).default(new Date().getFullYear()),
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;
