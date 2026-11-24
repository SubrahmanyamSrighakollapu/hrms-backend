import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.literal('').transform(() => null), z.null()])
    .optional();

const optionalRef = z
  .union([z.string().trim().min(1).max(64), z.literal('').transform(() => null), z.null()])
  .optional();

const statusSchema = z.enum(['ACTIVE', 'INACTIVE']);

export const listDesksQuerySchema = z.object({
  locationId: optionalRef,
  date: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Invalid date' })
    .optional(),
});

export const createDeskSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  code: z.string().trim().min(1).max(50),
  locationId: optionalRef,
  status: statusSchema.optional(),
});

export const updateDeskSchema = createDeskSchema.partial();

export const bookDeskSchema = z.object({
  date: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Date must be a valid date',
  }),
  notes: optionalText(240),
});

export const listBookingsQuerySchema = z.object({
  date: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Invalid date' })
    .optional(),
  deskId: z.string().trim().min(1).optional(),
});

export type ListDesksQuery = z.infer<typeof listDesksQuerySchema>;
export type CreateDeskInput = z.infer<typeof createDeskSchema>;
export type UpdateDeskInput = z.infer<typeof updateDeskSchema>;
export type BookDeskInput = z.infer<typeof bookDeskSchema>;
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;
