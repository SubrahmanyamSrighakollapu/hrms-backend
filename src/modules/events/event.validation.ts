import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.literal('').transform(() => null), z.null()])
    .optional();

const statusSchema = z.enum(['ACTIVE', 'INACTIVE']);
const rsvpResponseSchema = z.enum(['GOING', 'INTERESTED', 'NOT_GOING']);

const dateTimeString = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'Must be a valid date/time',
});

export const listEventsQuerySchema = z.object({
  upcoming: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((value) => value === 'true' || value === true),
});

export const createEventSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(150),
  description: optionalText(2000),
  date: dateTimeString,
  endDate: z.union([dateTimeString, z.literal('').transform(() => null), z.null()]).optional(),
  location: optionalText(200),
  category: optionalText(60),
  status: statusSchema.optional(),
});

export const updateEventSchema = createEventSchema.partial();

export const rsvpSchema = z.object({
  response: rsvpResponseSchema.default('GOING'),
});

export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type RsvpInput = z.infer<typeof rsvpSchema>;
