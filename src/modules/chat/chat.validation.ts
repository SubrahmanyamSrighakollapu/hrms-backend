import { z } from 'zod';

const id = z.string().trim().min(1, 'Id is required').max(64);

const boolQuery = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === 'true'));

const optionalText = (max: number, label: string) =>
  z
    .union([z.string().trim().max(max, `${label} must be at most ${max} characters`), z.literal('').transform(() => null)])
    .nullable()
    .optional();

/* ---------------- directory + conversations ---------------- */

export const directoryQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
});

export const listConversationsQuerySchema = z.object({
  archived: boolQuery,
});

export const createDirectSchema = z.object({
  employeeId: id,
});

export const createGroupSchema = z.object({
  name: z.string().trim().min(1, 'Group name is required').max(120),
  description: optionalText(300, 'Description'),
  memberIds: z.array(id).min(1, 'Add at least one member').max(500),
});

export const updateGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: optionalText(300, 'Description'),
  })
  .refine((value) => value.name !== undefined || value.description !== undefined, {
    message: 'Nothing to update',
  });

export const memberListSchema = z.object({
  memberIds: z.array(id).min(1, 'Add at least one member').max(500),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER']),
});

export const memberSettingsSchema = z
  .object({
    isMuted: z.boolean().optional(),
    isArchived: z.boolean().optional(),
  })
  .refine((value) => value.isMuted !== undefined || value.isArchived !== undefined, {
    message: 'Nothing to update',
  });

/* ---------------- messages ---------------- */

export const messagePageQuerySchema = z.object({
  before: id.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1, 'Message cannot be empty').max(4000),
  clientMessageId: optionalText(80, 'Client message id'),
  replyToMessageId: id.nullable().optional(),
});

export const editMessageSchema = z.object({
  content: z.string().trim().min(1, 'Message cannot be empty').max(4000),
});

/** Multipart caption/ids sent alongside an attachment upload. */
export const sendAttachmentSchema = z.object({
  content: optionalText(4000, 'Message'),
  clientMessageId: optionalText(80, 'Client message id'),
  replyToMessageId: z
    .union([z.string().trim().max(64), z.literal('').transform(() => null)])
    .nullable()
    .optional(),
});

export const forwardMessageSchema = z.object({
  conversationId: id,
});

export const reactionSchema = z.object({
  reaction: z.string().trim().min(1, 'Reaction is required').max(16),
});

export const readSchema = z.object({
  messageId: id,
});

export const pinSchema = z.object({
  messageId: id,
});

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Search text is required').max(80),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/* ---------------- settings ---------------- */

export const updateSettingsSchema = z
  .object({
    notificationEnabled: z.boolean().optional(),
    soundEnabled: z.boolean().optional(),
  })
  .refine((value) => value.notificationEnabled !== undefined || value.soundEnabled !== undefined, {
    message: 'Nothing to update',
  });

export type DirectoryQuery = z.infer<typeof directoryQuerySchema>;
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;
export type CreateDirectInput = z.infer<typeof createDirectSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type MemberListInput = z.infer<typeof memberListSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type MemberSettingsInput = z.infer<typeof memberSettingsSchema>;
export type MessagePageQuery = z.infer<typeof messagePageQuerySchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type SendAttachmentInput = z.infer<typeof sendAttachmentSchema>;
export type EditMessageInput = z.infer<typeof editMessageSchema>;
export type ForwardMessageInput = z.infer<typeof forwardMessageSchema>;
export type ReactionInput = z.infer<typeof reactionSchema>;
export type ReadInput = z.infer<typeof readSchema>;
export type PinInput = z.infer<typeof pinSchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
