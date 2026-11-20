import type { Request, Response } from 'express';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { saveUploadedFile } from './chat.storage';
import * as chatService from './chat.service';
import type {
  CreateDirectInput,
  CreateGroupInput,
  DirectoryQuery,
  EditMessageInput,
  ForwardMessageInput,
  ListConversationsQuery,
  MemberListInput,
  MemberSettingsInput,
  MessagePageQuery,
  PinInput,
  ReactionInput,
  ReadInput,
  SearchQuery,
  SendAttachmentInput,
  SendMessageInput,
  UpdateGroupInput,
  UpdateMemberRoleInput,
  UpdateSettingsInput,
} from './chat.validation';

function actorId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

/* =========================================================
   Directory & presence
   ========================================================= */

export const directory = asyncHandler(async (req: Request, res: Response) => {
  const employees = await chatService.listDirectory(actorId(req), req.query as unknown as DirectoryQuery);
  res.status(200).json({ success: true, data: { employees } });
});

export const online = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ success: true, data: { online: chatService.listOnlinePresence() } });
});

/* =========================================================
   Conversations
   ========================================================= */

export const listConversations = asyncHandler(async (req: Request, res: Response) => {
  const conversations = await chatService.listConversations(
    actorId(req),
    req.query as unknown as ListConversationsQuery,
  );
  res.status(200).json({ success: true, data: { conversations } });
});

export const getConversation = asyncHandler(async (req: Request, res: Response) => {
  const conversation = await chatService.getConversation(actorId(req), req.params.id);
  res.status(200).json({ success: true, data: { conversation } });
});

export const createDirect = asyncHandler(async (req: Request, res: Response) => {
  const { employeeId } = req.body as CreateDirectInput;
  const conversation = await chatService.createDirectConversation(actorId(req), employeeId);
  res.status(201).json({ success: true, data: { conversation } });
});

export const createGroup = asyncHandler(async (req: Request, res: Response) => {
  const conversation = await chatService.createGroupConversation(
    actorId(req),
    req.body as CreateGroupInput,
  );
  res.status(201).json({ success: true, data: { conversation } });
});

export const updateGroup = asyncHandler(async (req: Request, res: Response) => {
  const conversation = await chatService.updateGroup(
    actorId(req),
    req.params.id,
    req.body as UpdateGroupInput,
  );
  res.status(200).json({ success: true, data: { conversation } });
});

export const addMembers = asyncHandler(async (req: Request, res: Response) => {
  const conversation = await chatService.addGroupMembers(
    actorId(req),
    req.params.id,
    req.body as MemberListInput,
  );
  res.status(200).json({ success: true, data: { conversation } });
});

export const removeMember = asyncHandler(async (req: Request, res: Response) => {
  const conversation = await chatService.removeGroupMember(
    actorId(req),
    req.params.id,
    req.params.employeeId,
  );
  res.status(200).json({ success: true, data: { conversation } });
});

export const updateMemberRole = asyncHandler(async (req: Request, res: Response) => {
  const conversation = await chatService.updateGroupMemberRole(
    actorId(req),
    req.params.id,
    req.params.employeeId,
    req.body as UpdateMemberRoleInput,
  );
  res.status(200).json({ success: true, data: { conversation } });
});

export const leave = asyncHandler(async (req: Request, res: Response) => {
  await chatService.leaveGroup(actorId(req), req.params.id);
  res.status(200).json({ success: true, data: { left: true } });
});

export const updateMemberSettings = asyncHandler(async (req: Request, res: Response) => {
  const conversation = await chatService.updateMemberSettings(
    actorId(req),
    req.params.id,
    req.body as MemberSettingsInput,
  );
  res.status(200).json({ success: true, data: { conversation } });
});

export const uploadAvatar = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('No image uploaded');
  const conversation = await chatService.uploadGroupAvatar(actorId(req), req.params.id, req.file);
  res.status(200).json({ success: true, data: { conversation } });
});

export const getAvatar = asyncHandler(async (req: Request, res: Response) => {
  const file = await chatService.getGroupAvatarFile(actorId(req), req.params.id);
  res.sendFile(file.absolutePath);
});

/* =========================================================
   Messages
   ========================================================= */

export const listMessages = asyncHandler(async (req: Request, res: Response) => {
  const page = await chatService.listMessages(
    actorId(req),
    req.params.id,
    req.query as unknown as MessagePageQuery,
  );
  res.status(200).json({ success: true, data: page });
});

export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as SendMessageInput;
  const message = await chatService.createMessage(actorId(req), req.params.id, {
    content: body.content,
    clientMessageId: body.clientMessageId ?? null,
    replyToMessageId: body.replyToMessageId ?? null,
  });
  res.status(201).json({ success: true, data: { message } });
});

export const sendAttachment = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('No file uploaded');
  const body = req.body as SendAttachmentInput;
  const saved = await saveUploadedFile(req.file);
  const message = await chatService.createMessage(actorId(req), req.params.id, {
    content: body.content ?? null,
    clientMessageId: body.clientMessageId ?? null,
    replyToMessageId: body.replyToMessageId ?? null,
    attachment: saved,
  });
  res.status(201).json({ success: true, data: { message } });
});

export const editMessage = asyncHandler(async (req: Request, res: Response) => {
  const { content } = req.body as EditMessageInput;
  const message = await chatService.editMessage(actorId(req), req.params.id, content);
  res.status(200).json({ success: true, data: { message } });
});

export const deleteMessage = asyncHandler(async (req: Request, res: Response) => {
  await chatService.deleteMessage(actorId(req), req.params.id);
  res.status(200).json({ success: true, data: { deleted: true } });
});

export const forwardMessage = asyncHandler(async (req: Request, res: Response) => {
  const { conversationId } = req.body as ForwardMessageInput;
  const message = await chatService.forwardMessage(actorId(req), req.params.id, conversationId);
  res.status(201).json({ success: true, data: { message } });
});

export const addReaction = asyncHandler(async (req: Request, res: Response) => {
  const { reaction } = req.body as ReactionInput;
  const message = await chatService.addReaction(actorId(req), req.params.id, reaction);
  res.status(200).json({ success: true, data: { message } });
});

export const removeReaction = asyncHandler(async (req: Request, res: Response) => {
  const message = await chatService.removeReaction(actorId(req), req.params.id, req.params.reaction);
  res.status(200).json({ success: true, data: { message } });
});

export const markDelivered = asyncHandler(async (req: Request, res: Response) => {
  const result = await chatService.markDelivered(actorId(req), req.params.id);
  res.status(200).json({ success: true, data: result });
});

export const markRead = asyncHandler(async (req: Request, res: Response) => {
  const { messageId } = req.body as ReadInput;
  await chatService.markRead(actorId(req), req.params.id, messageId);
  res.status(200).json({ success: true, data: { read: true } });
});

/* =========================================================
   Pins
   ========================================================= */

export const listPinned = asyncHandler(async (req: Request, res: Response) => {
  const messages = await chatService.listPinned(actorId(req), req.params.id);
  res.status(200).json({ success: true, data: { messages } });
});

export const pinMessage = asyncHandler(async (req: Request, res: Response) => {
  const { messageId } = req.body as PinInput;
  const message = await chatService.pinMessage(actorId(req), req.params.id, messageId);
  res.status(200).json({ success: true, data: { message } });
});

export const unpinMessage = asyncHandler(async (req: Request, res: Response) => {
  await chatService.unpinMessage(actorId(req), req.params.id, req.params.messageId);
  res.status(200).json({ success: true, data: { unpinned: true } });
});

/* =========================================================
   Attachments
   ========================================================= */

export const downloadAttachment = asyncHandler(async (req: Request, res: Response) => {
  const file = await chatService.getAttachmentFile(actorId(req), req.params.attachmentId);
  res.download(file.absolutePath, file.filename);
});

export const thumbnail = asyncHandler(async (req: Request, res: Response) => {
  const file = await chatService.getAttachmentThumbnail(actorId(req), req.params.attachmentId);
  res.sendFile(file.absolutePath);
});

/* =========================================================
   Search, settings, unread
   ========================================================= */

export const search = asyncHandler(async (req: Request, res: Response) => {
  const results = await chatService.searchMessages(actorId(req), req.query as unknown as SearchQuery);
  res.status(200).json({ success: true, data: { results } });
});

export const getSettings = asyncHandler(async (req: Request, res: Response) => {
  const settings = await chatService.getSettings(actorId(req));
  res.status(200).json({ success: true, data: { settings } });
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const settings = await chatService.updateSettings(actorId(req), req.body as UpdateSettingsInput);
  res.status(200).json({ success: true, data: { settings } });
});

export const unread = asyncHandler(async (req: Request, res: Response) => {
  const summary = await chatService.getUnreadSummary(actorId(req));
  res.status(200).json({ success: true, data: summary });
});
