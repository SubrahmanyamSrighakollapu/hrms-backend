import { z } from 'zod';

const payrollPeriod = z
  .string()
  .regex(/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/, 'Payroll period must use YYYY-MM format');

export const uploadPayslipsSchema = z.object({ payrollPeriod });

export const listPayslipsSchema = z.object({
  payrollPeriod: payrollPeriod.optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type UploadPayslipsInput = z.infer<typeof uploadPayslipsSchema>;
export type ListPayslipsQuery = z.infer<typeof listPayslipsSchema>;
