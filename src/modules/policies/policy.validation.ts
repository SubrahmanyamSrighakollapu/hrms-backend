import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.literal('').transform(() => null), z.null()])
    .optional();

const policyStatusSchema = z.enum(['DRAFT', 'PUBLISHED']);

export const listPoliciesQuerySchema = z.object({
  status: policyStatusSchema.optional(),
  category: z.string().trim().min(1).max(60).optional(),
});

export const createPolicySchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(150),
  description: optionalText(1000),
  category: optionalText(60),
  effectiveDate: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: 'Effective date must be a valid date',
    })
    .optional()
    .or(z.literal('').transform(() => null)),
  status: policyStatusSchema.default('DRAFT'),
});

export const updatePolicySchema = createPolicySchema.partial();

export type ListPoliciesQuery = z.infer<typeof listPoliciesQuerySchema>;
export type CreatePolicyInput = z.infer<typeof createPolicySchema>;
export type UpdatePolicyInput = z.infer<typeof updatePolicySchema>;
