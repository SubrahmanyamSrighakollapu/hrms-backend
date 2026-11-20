import { z } from 'zod';

export const timeOffRequestTypeSchema = z.enum(['LEAVE', 'PERMISSION', 'REGULARIZATION', 'EXTRA_HOURS']);
export const timeOffRequestStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']);
export const leaveTypeSchema = z.enum(['CASUAL', 'SICK', 'EARNED', 'COMP_OFF', 'PERSONAL', 'UNPAID']);

const optionalText = (max: number, label: string) =>
  z
    .union([z.string().trim().max(max, `${label} must be at most ${max} characters`), z.literal('').transform(() => null)])
    .nullable()
    .optional();

const requiredDate = z.coerce.date();
const timeString = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in HH:mm format');

const reasonField = z.string().trim().min(1, 'Reason is required').max(500);

/** Discriminated union: the `type` selects which fields are required. */
const leaveSchema = z.object({
  type: z.literal('LEAVE'),
  reason: reasonField,
  leaveType: leaveTypeSchema,
  fromDate: requiredDate,
  toDate: requiredDate,
  days: z.coerce.number().positive().max(365),
});

const permissionSchema = z.object({
  type: z.literal('PERMISSION'),
  reason: reasonField,
  permissionDate: requiredDate,
  fromTime: timeString,
  toTime: timeString,
});

const regularizationSchema = z.object({
  type: z.literal('REGULARIZATION'),
  reason: reasonField,
  regularizationDate: requiredDate,
  actualInTime: timeString,
  actualOutTime: timeString,
});

const extraHoursSchema = z.object({
  type: z.literal('EXTRA_HOURS'),
  reason: reasonField,
  extraHoursDate: requiredDate,
  extraHoursFrom: timeString,
  extraHoursTo: timeString,
  extraHours: z.coerce.number().positive().max(24),
});

export const createTimeOffSchema = z
  .discriminatedUnion('type', [leaveSchema, permissionSchema, regularizationSchema, extraHoursSchema])
  .superRefine((val, ctx) => {
    if (val.type === 'LEAVE') {
      if (val.fromDate > val.toDate) {
        ctx.addIssue({ code: 'custom', message: '"From" date cannot be after "To" date', path: ['fromDate'] });
      }
      if (val.fromDate.getUTCFullYear() !== val.toDate.getUTCFullYear()) {
        ctx.addIssue({
          code: 'custom',
          message: 'A leave request must stay within one calendar year',
          path: ['toDate'],
        });
      }
    }
    if (val.type === 'PERMISSION' || val.type === 'EXTRA_HOURS') {
      const from = val.type === 'PERMISSION' ? val.fromTime : val.extraHoursFrom;
      const to = val.type === 'PERMISSION' ? val.toTime : val.extraHoursTo;
      if (from >= to) {
        ctx.addIssue({
          code: 'custom',
          message: 'End time must be after start time',
          path: [val.type === 'PERMISSION' ? 'fromTime' : 'extraHoursFrom'],
        });
      }
    }
  });

export const approveRejectSchema = z.object({
  comment: optionalText(300, 'Comment'),
});

export const listTimeOffQuerySchema = z.object({
  type: timeOffRequestTypeSchema.optional(),
  status: timeOffRequestStatusSchema.optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const updateApprovalFlowSchema = z.object({
  approverRoleId: z.string().trim().min(1, 'Approver role is required').max(64),
});

export type CreateTimeOffInput = z.infer<typeof createTimeOffSchema>;
export type ApproveRejectInput = z.infer<typeof approveRejectSchema>;
export type ListTimeOffQuery = z.infer<typeof listTimeOffQuerySchema>;
export type UpdateApprovalFlowInput = z.infer<typeof updateApprovalFlowSchema>;
