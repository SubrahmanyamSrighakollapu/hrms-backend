import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as chatController from './chat.controller';
import { uploadChatFile } from './chat.upload';
import {
  createDirectSchema,
  createGroupSchema,
  directoryQuerySchema,
  editMessageSchema,
  forwardMessageSchema,
  listConversationsQuerySchema,
  memberListSchema,
  memberSettingsSchema,
  messagePageQuerySchema,
  pinSchema,
  reactionSchema,
  readSchema,
  searchQuerySchema,
  sendAttachmentSchema,
  sendMessageSchema,
  updateGroupSchema,
  updateMemberRoleSchema,
  updateSettingsSchema,
} from './chat.validation';

const router = Router();

// Chat is a signed-in feature; anyone with VIEW on the `chat` module may use it.
router.use(authenticate);
router.use(requirePermission('chat'));

/* ---- directory, presence, search, settings ---- */
router.get('/directory', validate(directoryQuerySchema, 'query'), chatController.directory);
router.get('/online', chatController.online);
router.get('/search', validate(searchQuerySchema, 'query'), chatController.search);
router.get('/settings', chatController.getSettings);
router.patch('/settings', validate(updateSettingsSchema), chatController.updateSettings);
router.get('/unread', chatController.unread);

/* ---- attachments (declare before /:id style routes) ---- */
router.get('/attachments/:attachmentId/download', chatController.downloadAttachment);
router.get('/attachments/:attachmentId/thumbnail', chatController.thumbnail);

/* ---- conversations ---- */
router.get('/conversations', validate(listConversationsQuerySchema, 'query'), chatController.listConversations);
router.post('/conversations/direct', validate(createDirectSchema), chatController.createDirect);
router.post('/conversations/group', validate(createGroupSchema), chatController.createGroup);

router.get('/conversations/:id', chatController.getConversation);
router.patch('/conversations/:id', validate(updateGroupSchema), chatController.updateGroup);
router.post('/conversations/:id/members', validate(memberListSchema), chatController.addMembers);
router.patch(
  '/conversations/:id/members/:employeeId/role',
  validate(updateMemberRoleSchema),
  chatController.updateMemberRole,
);
router.delete('/conversations/:id/members/:employeeId', chatController.removeMember);
router.post('/conversations/:id/leave', chatController.leave);
router.patch('/conversations/:id/member', validate(memberSettingsSchema), chatController.updateMemberSettings);
router.post('/conversations/:id/avatar', uploadChatFile, chatController.uploadAvatar);
router.get('/conversations/:id/avatar', chatController.getAvatar);

/* ---- messages ---- */
router.get('/conversations/:id/messages', validate(messagePageQuerySchema, 'query'), chatController.listMessages);
router.post('/conversations/:id/messages', validate(sendMessageSchema), chatController.sendMessage);
router.post(
  '/conversations/:id/attachments',
  uploadChatFile,
  validate(sendAttachmentSchema),
  chatController.sendAttachment,
);
router.post('/conversations/:id/delivered', chatController.markDelivered);
router.post('/conversations/:id/read', validate(readSchema), chatController.markRead);

/* ---- pins ---- */
router.get('/conversations/:id/pinned', chatController.listPinned);
router.post('/conversations/:id/pin', validate(pinSchema), chatController.pinMessage);
router.delete('/conversations/:id/pin/:messageId', chatController.unpinMessage);

/* ---- message actions ---- */
router.patch('/messages/:id', validate(editMessageSchema), chatController.editMessage);
router.delete('/messages/:id', chatController.deleteMessage);
router.post('/messages/:id/forward', validate(forwardMessageSchema), chatController.forwardMessage);
router.post('/messages/:id/reactions', validate(reactionSchema), chatController.addReaction);
router.delete('/messages/:id/reactions/:reaction', chatController.removeReaction);

export default router;
