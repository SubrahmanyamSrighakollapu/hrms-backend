import { z } from 'zod';

const optionalText = (max: number) =>
  z.union([z.string().trim().max(max), z.literal('').transform(() => null), z.null()]).optional();

const optionalRef = z
  .union([z.string().trim().min(1).max(64), z.literal('').transform(() => null), z.null()])
  .optional();

const holidayTypeSchema = z.enum(['PUBLIC', 'OPTIONAL']);
const statusSchema = z.enum(['ACTIVE', 'INACTIVE']);

export const createHolidaySchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  date: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Date must be a valid date',
  }),
  type: holidayTypeSchema.default('PUBLIC'),
  year: z.number().int().min(2000).max(2100).optional(),
  description: optionalText(240),
  locationId: optionalRef,
  status: statusSchema.optional(),
});

export const updateHolidaySchema = createHolidaySchema.partial();

export const listHolidaysQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  type: holidayTypeSchema.optional(),
});

export const holidaySettingsSchema = z.object({
  optionalHolidayAllowance: z.number().int().min(0, 'Allowance cannot be negative').max(365),
});

export type CreateHolidayInput = z.infer<typeof createHolidaySchema>;
export type UpdateHolidayInput = z.infer<typeof updateHolidaySchema>;
export type ListHolidaysQuery = z.infer<typeof listHolidaysQuerySchema>;
export type HolidaySettingsInput = z.infer<typeof holidaySettingsSchema>;
