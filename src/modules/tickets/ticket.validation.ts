import { z } from 'zod';
import { paginationFields } from '../../utils/pagination';

export const ticketModuleSchema = z.enum(['IT_SUPPORT', 'HR_HELPDESK']);
export const ticketPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export const ticketStatusSchema = z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);

export const createTicketSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(150),
  description: z.string().trim().min(1, 'Description is required').max(4000),
  categoryId: z.string().trim().min(1, 'Category is required').max(64),
  priority: ticketPrioritySchema.optional(),
  status: ticketStatusSchema.optional(),
  assignedToId: z.string().trim().min(1).max(64).optional(),
});

export const updateTicketSchema = z.object({
  title: z.string().trim().min(3).max(150).optional(),
  description: z.string().trim().min(1).max(4000).optional(),
  categoryId: z.string().trim().min(1).max(64).optional(),
  priority: ticketPrioritySchema.optional(),
  status: ticketStatusSchema.optional(),
  assignedToId: z
    .union([z.string().trim().min(1).max(64), z.literal('').transform(() => null), z.null()])
    .optional(),
});

export const listTicketsQuerySchema = z.object({
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  categoryId: z.string().trim().min(1).max(64).optional(),
  assignedToId: z.string().trim().min(1).max(64).optional(),
  q: z.string().trim().max(80).optional(),
  scope: z.enum(['all', 'mine', 'assigned']).optional(),
  ...paginationFields(),
});

export const commentSchema = z.object({
  message: z.string().trim().min(1, 'Comment is required').max(2000),
});

export const categorySchema = z.object({
  name: z.string().trim().min(2, 'Category name must be at least 2 characters').max(80),
  icon: z.string().trim().max(40).optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  icon: z.string().trim().max(40).optional(),
  active: z.boolean().optional(),
});

export type TicketModule = z.infer<typeof ticketModuleSchema>;
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;
export type TicketStatus = z.infer<typeof ticketStatusSchema>;
export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;
export type CommentInput = z.infer<typeof commentSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
