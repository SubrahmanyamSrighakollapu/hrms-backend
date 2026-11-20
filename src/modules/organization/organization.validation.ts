import { z } from 'zod';

const optionalText = (max: number) =>
  z.union([z.string().trim().max(max), z.literal('').transform(() => null), z.null()]).optional();

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: optionalText(16),
  description: optionalText(240),
});

export const updateDepartmentSchema = createDepartmentSchema.partial();

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
