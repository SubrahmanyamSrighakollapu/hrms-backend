import { z } from 'zod';

const leaveTypes = ['CASUAL', 'SICK', 'EARNED', 'COMP_OFF', 'PERSONAL', 'UNPAID'] as const;

const nullableEmail = z
  .union([z.string().trim().email().max(160), z.literal('').transform(() => null), z.null()])
  .optional();

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  supportEmail: nullableEmail,
  timezone: z.string().trim().min(1).max(80).optional(),
});

export const listLeaveBalancesSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2200).default(new Date().getFullYear()),
});

export const setLeaveBalanceSchema = z.object({
  employeeId: z.string().trim().min(1).max(64),
  leaveType: z.enum(leaveTypes),
  year: z.coerce.number().int().min(2000).max(2200),
  total: z.coerce.number().min(0).max(366),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ListLeaveBalancesQuery = z.infer<typeof listLeaveBalancesSchema>;
export type SetLeaveBalanceInput = z.infer<typeof setLeaveBalanceSchema>;
