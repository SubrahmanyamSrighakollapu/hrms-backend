import { z } from 'zod';
import { paginationFields } from '../../utils/pagination';

export const expenseStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'CLARIFICATION',
  'REIMBURSED',
]);

export const paymentModeSchema = z.enum(['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'OTHER']);

/** The three outcomes a manager can pick for a submitted claim. */
export const expenseDecisionSchema = z.enum(['APPROVED', 'REJECTED', 'CLARIFICATION']);

const amountValue = z.coerce
  .number()
  .positive('Amount must be greater than zero')
  .max(100_000_000);

/** `null` clears a per-category limit; a number sets it. */
const optionalAmount = z.union([amountValue, z.null()]);

export const expenseItemSchema = z.object({
  categoryId: z.string().trim().min(1, 'Category is required').max(64),
  expenseDate: z.coerce.date({ error: 'A valid expense date is required' }),
  amount: amountValue,
  description: z.string().trim().max(500).optional(),
  paymentMode: paymentModeSchema.optional(),
});

export const createClaimSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(150),
  description: z.string().trim().max(2000).optional(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  items: z.array(expenseItemSchema).min(1, 'Add at least one expense line').max(50),
  /** Submit immediately instead of leaving the claim in draft. */
  submit: z.boolean().optional(),
});

export const updateClaimSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(150).optional(),
  description: z.string().trim().max(2000).optional(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  items: z.array(expenseItemSchema).min(1, 'Add at least one expense line').max(50).optional(),
});

export const decisionSchema = z.object({
  decision: expenseDecisionSchema,
  note: z.string().trim().max(1000).optional(),
});

export const reimburseSchema = z.object({
  paymentMode: paymentModeSchema,
  reference: z.string().trim().max(120).optional(),
});

export const listClaimsQuerySchema = z.object({
  status: expenseStatusSchema.optional(),
  categoryId: z.string().trim().min(1).max(64).optional(),
  q: z.string().trim().max(80).optional(),
  /** `mine` = own claims, `approvals` = the submitted queue, `all` = everything visible. */
  scope: z.enum(['all', 'mine', 'approvals']).optional(),
  ...paginationFields(),
});

export const reportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  status: expenseStatusSchema.optional(),
  categoryId: z.string().trim().min(1).max(64).optional(),
  employeeId: z.string().trim().min(1).max(64).optional(),
  ...paginationFields(),
});

export const categorySchema = z.object({
  name: z.string().trim().min(2, 'Category name must be at least 2 characters').max(80),
  description: z.string().trim().max(300).optional(),
  icon: z.string().trim().max(40).optional(),
  maxAmount: optionalAmount.optional(),
  receiptRequiredAbove: optionalAmount.optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().trim().min(2, 'Category name must be at least 2 characters').max(80).optional(),
  description: z.string().trim().max(300).optional(),
  icon: z.string().trim().max(40).optional(),
  maxAmount: optionalAmount.optional(),
  receiptRequiredAbove: optionalAmount.optional(),
  active: z.boolean().optional(),
});

export type ExpenseStatus = z.infer<typeof expenseStatusSchema>;
export type ExpensePaymentMode = z.infer<typeof paymentModeSchema>;
export type ExpenseDecision = z.infer<typeof expenseDecisionSchema>;
export type ExpenseItemInput = z.infer<typeof expenseItemSchema>;
export type CreateClaimInput = z.infer<typeof createClaimSchema>;
export type UpdateClaimInput = z.infer<typeof updateClaimSchema>;
export type DecisionInput = z.infer<typeof decisionSchema>;
export type ReimburseInput = z.infer<typeof reimburseSchema>;
export type ListClaimsQuery = z.infer<typeof listClaimsQuerySchema>;
export type ReportQuery = z.infer<typeof reportQuerySchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
