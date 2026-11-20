/**
 * Chat service - all conversation & message business logic.
 *
 * Broadcasts happen here (never in the controller/socket layer) so both the
 * REST API and the Socket.IO gateway share one guaranteed
 * "persist-then-broadcast" path.
 */
import { ChatMessageType, Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import { assertGroupAdmin, assertMember, memberIds, relatedEmployeeIds } from './chat.access';
import {
  emitToConversation,
  emitToUser,
  emitToUsers,
  isEmployeeOnline,
  onlineEmployeeIds,
} from './chat.realtime';
import {
  removeStoredFile,
  resolveWithinRoot,
  saveUploadedFile,
  toAttachmentFile,
  toThumbnailFile,
  type SavedFile,
} from './chat.storage';
import type {
  AttachmentDto,
  AttachmentFileDto,
  ChatEmployeeDto,
  ChatSettingsDto,
  ConversationDto,
  ConversationMemberDto,
  MessageDto,
  MessagePageDto,
  MessagePreviewDto,
  PresenceDto,
  ReactionSummaryDto,
  SearchResultDto,
} from './chat.types';
import type {
  CreateGroupInput,
  DirectoryQuery,
  ListConversationsQuery,
  MemberListInput,
  MemberSettingsInput,
  MessagePageQuery,
  SearchQuery,
  UpdateMemberRoleInput,
  UpdateGroupInput,
  UpdateSettingsInput,
} from './chat.validation';

/* =========================================================
   Prisma select shapes
   ========================================================= */

const employeeSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  employeeCode: true,
  designation: true,
  avatarUrl: true,
  department: { select: { name: true } },
  chatPresence: { select: { lastSeenAt: true } },
} satisfies Prisma.UserSelect;

const memberSelect = {
  employeeId: true,
  role: true,
  isMuted: true,
  isArchived: true,
  leftAt: true,
  joinedAt: true,
  employee: { select: employeeSelect },
} satisfies Prisma.ConversationMemberSelect;

const conversationSelect = {
  id: true,
  type: true,
  name: true,
  description: true,
  avatarPath: true,
  createdById: true,
  lastMessageId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  members: { where: { leftAt: null }, select: memberSelect },
} satisfies Prisma.ConversationSelect;

const messageSelect = {
  id: true,
  conversationId: true,
  senderId: true,
  messageType: true,
  content: true,
  replyToMessageId: true,
  forwardedFromMessageId: true,
  clientMessageId: true,
  isDeleted: true,
  editedAt: true,
  createdAt: true,
  sender: { select: employeeSelect },
  attachments: {
    select: {
      id: true,
      originalFilename: true,
      mimeType: true,
      fileExtension: true,
      fileSize: true,
      category: true,
      width: true,
      height: true,
      thumbnailPath: true,
      storagePath: true,
    },
  },
  reactions: { select: { reaction: true, employeeId: true } },
  receipts: { select: { employeeId: true, deliveredAt: true, readAt: true } },
  pins: { select: { id: true } },
} satisfies Prisma.MessageSelect;

const previewSelect = {
  id: true,
  senderId: true,
  messageType: true,
  content: true,
  isDeleted: true,
  createdAt: true,
  sender: { select: { firstName: true, lastName: true } },
  attachments: { select: { id: true }, take: 1 },
} satisfies Prisma.MessageSelect;

type EmployeeRow = Prisma.UserGetPayload<{ select: typeof employeeSelect }>;
type MemberRow = Prisma.ConversationMemberGetPayload<{ select: typeof memberSelect }>;
type ConversationRow = Prisma.ConversationGetPayload<{ select: typeof conversationSelect }>;
type MessageRow = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;
type PreviewRow = Prisma.MessageGetPayload<{ select: typeof previewSelect }>;

/* =========================================================
   Mappers
   ========================================================= */

function fullName(first: string, last: string): string {
  return `${first} ${last}`.trim();
}

function toEmployeeDto(employee: EmployeeRow): ChatEmployeeDto {
  return {
    id: employee.id,
    name: fullName(employee.firstName, employee.lastName),
    email: employee.email,
    employeeCode: employee.employeeCode,
    designation: employee.designation,
    department: employee.department?.name ?? null,
    avatarUrl: employee.avatarUrl,
    online: isEmployeeOnline(employee.id),
    lastSeenAt: employee.chatPresence?.lastSeenAt?.toISOString() ?? null,
  };
}

function toMemberDto(member: MemberRow): ConversationMemberDto {
  return {
    employeeId: member.employeeId,
    name: fullName(member.employee.firstName, member.employee.lastName),
    email: member.employee.email,
    employeeCode: member.employee.employeeCode,
    designation: member.employee.designation,
    department: member.employee.department?.name ?? null,
    avatarUrl: member.employee.avatarUrl,
    role: member.role,
    online: isEmployeeOnline(member.employeeId),
    lastSeenAt: member.employee.chatPresence?.lastSeenAt?.toISOString() ?? null,
  };
}

function attachmentUrl(id: string, kind: 'download' | 'thumbnail' = 'download'): string {
  return `${env.API_PREFIX}/chat/attachments/${id}/${kind}`;
}

function toAttachmentDto(attachment: MessageRow['attachments'][number]): AttachmentDto {
  return {
    id: attachment.id,
    originalFilename: attachment.originalFilename,
    mimeType: attachment.mimeType,
    fileExtension: attachment.fileExtension,
    fileSize: attachment.fileSize,
    category: attachment.category,
    width: attachment.width,
    height: attachment.height,
    hasThumbnail: Boolean(attachment.thumbnailPath),
    url: attachmentUrl(attachment.id, 'download'),
    thumbnailUrl: attachment.thumbnailPath ? attachmentUrl(attachment.id, 'thumbnail') : null,
  };
}

function summarizeReactions(
  rows: MessageRow['reactions'],
  actorId: string,
): ReactionSummaryDto[] {
  const map = new Map<string, ReactionSummaryDto>();
  for (const row of rows) {
    const entry = map.get(row.reaction) ?? { reaction: row.reaction, count: 0, mine: false, employeeIds: [] };
    entry.count += 1;
    entry.employeeIds.push(row.employeeId);
    if (row.employeeId === actorId) entry.mine = true;
    map.set(row.reaction, entry);
  }
  return [...map.values()];
}

function toPreview(row: PreviewRow): MessagePreviewDto {
  return {
    id: row.id,
    senderId: row.senderId,
    senderName: row.sender ? fullName(row.sender.firstName, row.sender.lastName) : null,
    messageType: row.messageType,
    content: row.isDeleted ? null : row.content,
    isDeleted: row.isDeleted,
    createdAt: row.createdAt.toISOString(),
    hasAttachment: !row.isDeleted && row.attachments.length > 0,
  };
}

function toMessageDto(row: MessageRow, replyMap: Map<string, MessagePreviewDto>, actorId: string): MessageDto {
  const receipts = row.receipts;
  const recipientCount = receipts.length;
  const deliveredCount = receipts.filter((r) => r.deliveredAt).length;
  const readCount = receipts.filter((r) => r.readAt).length;
  const mine = receipts.find((r) => r.employeeId === actorId);

  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    senderName: row.sender ? fullName(row.sender.firstName, row.sender.lastName) : null,
    senderAvatarUrl: row.sender?.avatarUrl ?? null,
    senderDesignation: row.sender?.designation ?? null,
    messageType: row.messageType,
    content: row.isDeleted ? null : row.content,
    isDeleted: row.isDeleted,
    editedAt: row.editedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    clientMessageId: row.clientMessageId,
    replyTo: row.replyToMessageId ? replyMap.get(row.replyToMessageId) ?? null : null,
    forwardedFromMessageId: row.forwardedFromMessageId,
    attachments: row.isDeleted ? [] : row.attachments.map(toAttachmentDto),
    reactions: row.isDeleted ? [] : summarizeReactions(row.reactions, actorId),
    pinned: row.pins.length > 0,
    status: {
      recipientCount,
      deliveredCount,
      readCount,
      deliveredAll: recipientCount > 0 && deliveredCount === recipientCount,
      readAll: recipientCount > 0 && readCount === recipientCount,
      myDeliveredAt: mine?.deliveredAt?.toISOString() ?? null,
      myReadAt: mine?.readAt?.toISOString() ?? null,
    },
  };
}

/** Turns the DTO we already built into the compact preview used in lists. */
function dtoToPreview(message: MessageDto): MessagePreviewDto {
  return {
    id: message.id,
    senderId: message.senderId,
    senderName: message.senderName,
    messageType: message.messageType,
    content: message.isDeleted ? null : message.content,
    isDeleted: message.isDeleted,
    createdAt: message.createdAt,
    hasAttachment: message.attachments.length > 0,
  };
}

function mapConversation(
  conversation: ConversationRow,
  member: { role: 'MEMBER' | 'ADMIN'; isMuted: boolean; isArchived: boolean },
  actorId: string,
  lastMessage: MessagePreviewDto | null,
  unreadCount: number,
  full: boolean,
): ConversationDto {
  const counterpartRow =
    conversation.type === 'DIRECT'
      ? conversation.members.find((m) => m.employeeId !== actorId) ?? null
      : null;
  const counterpart = counterpartRow ? toMemberDto(counterpartRow) : null;

  const name =
    conversation.type === 'DIRECT'
      ? counterpart?.name ?? 'Direct message'
      : conversation.name ?? 'Group';
  const avatarUrl =
    conversation.type === 'DIRECT'
      ? counterpart?.avatarUrl ?? null
      : conversation.avatarPath
        ? `${env.API_PREFIX}/chat/conversations/${conversation.id}/avatar`
        : null;

  return {
    id: conversation.id,
    type: conversation.type,
    name,
    createdById: conversation.createdById,
    description: conversation.description,
    avatarUrl,
    isGroup: conversation.type === 'GROUP',
    memberCount: conversation.members.length,
    members: full ? conversation.members.map(toMemberDto) : [],
    counterpart,
    lastMessage,
    unreadCount,
    isMuted: member.isMuted,
    isArchived: member.isArchived,
    myRole: member.role,
    isActive: conversation.isActive,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

/** Batch-loads reply previews and maps a set of message rows. */
async function mapMessages(rows: MessageRow[], actorId: string): Promise<MessageDto[]> {
  const replyIds = [...new Set(rows.map((r) => r.replyToMessageId).filter((id): id is string => Boolean(id)))];
  const replyRows = replyIds.length
    ? await prisma.message.findMany({ where: { id: { in: replyIds } }, select: previewSelect })
    : [];
  const replyMap = new Map(replyRows.map((row) => [row.id, toPreview(row)]));
  return rows.map((row) => toMessageDto(row, replyMap, actorId));
}

/* =========================================================
   Broadcast helpers
   ========================================================= */

async function conversationMemberFlags(
  conversationId: string,
): Promise<Array<{ employeeId: string; isMuted: boolean }>> {
  return prisma.conversationMember.findMany({
    where: { conversationId, leftAt: null },
    select: { employeeId: true, isMuted: true },
  });
}

/** Tells every member's sidebar that a conversation changed (preview/order). */
async function broadcastConversationUpdated(
  conversationId: string,
  lastMessage: MessagePreviewDto,
): Promise<void> {
  const flags = await conversationMemberFlags(conversationId);
  const payload = { conversationId, lastMessage, updatedAt: new Date().toISOString() };
  emitToUsers(
    flags.map((f) => f.employeeId),
    'conversation:updated',
    payload,
  );
}

async function broadcastNewMessage(conversationId: string, actorId: string, message: MessageDto): Promise<void> {
  emitToConversation(conversationId, 'message:new', message);
  await broadcastConversationUpdated(conversationId, dtoToPreview(message));

  // Notify members who are not the sender and have not muted the conversation.
  const flags = await conversationMemberFlags(conversationId);
  const recipients = flags.filter((f) => f.employeeId !== actorId && !f.isMuted).map((f) => f.employeeId);
  if (recipients.length === 0) return;

  const settings = await prisma.userSettings.findMany({
    where: { employeeId: { in: recipients } },
    select: { employeeId: true, notificationEnabled: true },
  });
  const disabled = new Set(settings.filter((s) => !s.notificationEnabled).map((s) => s.employeeId));

  const targets = recipients.filter((id) => !disabled.has(id));
  emitToUsers(targets, 'notification:new', { conversationId, message });
}

/** Persists a SYSTEM message (group created, member added, …) and broadcasts it. */
async function createSystemMessage(conversationId: string, text: string): Promise<MessageDto> {
  const created = await prisma.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: { conversationId, senderId: null, messageType: ChatMessageType.SYSTEM, content: text },
      select: messageSelect,
    });
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageId: message.id } });
    return message;
  });
  const dto = (await mapMessages([created], ''))[0];
  await broadcastNewMessage(conversationId, '', dto);
  return dto;
}

async function broadcastGroupConversationUpdate(conversationId: string): Promise<void> {
  const employeeIds = await memberIds(conversationId);
  await Promise.all(
    employeeIds.map(async (employeeId) => {
      const conversation = await getConversation(employeeId, conversationId);
      emitToUser(employeeId, 'conversation:updated', { conversationId, conversation });
    }),
  );
}

async function lockGroupForUpdate(tx: Prisma.TransactionClient, conversationId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "chat_conversations" WHERE "id" = ${conversationId} FOR UPDATE
  `;
  if (rows.length === 0) throw ApiError.notFound('Conversation not found');

  const group = await tx.conversation.findUnique({
    where: { id: conversationId },
    select: {
      type: true,
      isActive: true,
      createdById: true,
      members: {
        where: { leftAt: null },
        select: { employeeId: true, role: true },
      },
    },
  });
  if (!group || !group.isActive) throw ApiError.notFound('Conversation not found');
  if (group.type !== 'GROUP') throw ApiError.badRequest('This action is only available in groups');
  return group;
}

function assertLockedGroupMember(
  group: Awaited<ReturnType<typeof lockGroupForUpdate>>,
  employeeId: string,
  requireAdmin = false,
) {
  const member = group.members.find((entry) => entry.employeeId === employeeId);
  if (!member) throw ApiError.forbidden('You are not a member of this group');
  if (requireAdmin && member.role !== 'ADMIN') {
    throw ApiError.forbidden('Only group admins can perform this action');
  }
  return member;
}

async function ensureGroupHasAdmin(tx: Prisma.TransactionClient, conversationId: string): Promise<string | null> {
  const admin = await tx.conversationMember.findFirst({
    where: { conversationId, leftAt: null, role: 'ADMIN' },
    select: { employeeId: true },
  });
  if (admin) return null;

  const successor = await tx.conversationMember.findFirst({
    where: { conversationId, leftAt: null },
    orderBy: [{ joinedAt: 'asc' }, { employeeId: 'asc' }],
    select: { employeeId: true },
  });
  if (!successor) return null;

  await tx.conversationMember.update({
    where: { conversationId_employeeId: { conversationId, employeeId: successor.employeeId } },
    data: { role: 'ADMIN' },
  });
  return successor.employeeId;
}

/* =========================================================
   Directory & presence
   ========================================================= */

export async function listDirectory(actorId: string, query: DirectoryQuery): Promise<ChatEmployeeDto[]> {
  const where: Prisma.UserWhereInput = { id: { not: actorId }, status: 'ACTIVE' };
  if (query.q) {
    const q = query.q;
    where.OR = [
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { employeeCode: { contains: q, mode: 'insensitive' } },
    ];
  }

  const rows = await prisma.user.findMany({
    where,
    select: employeeSelect,
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: 100,
  });
  return rows.map(toEmployeeDto);
}

export function listOnlinePresence(): PresenceDto[] {
  return onlineEmployeeIds().map((employeeId) => ({
    employeeId,
    status: 'ONLINE',
    online: true,
    lastSeenAt: null,
  }));
}

/** Mirrors a connect/disconnect into the DB and notifies peers. */
export async function setPresence(employeeId: string, online: boolean): Promise<void> {
  const now = new Date();
  await prisma.userPresence.upsert({
    where: { employeeId },
    update: { status: online ? 'ONLINE' : 'OFFLINE', lastSeenAt: online ? undefined : now },
    create: { employeeId, status: online ? 'ONLINE' : 'OFFLINE', lastSeenAt: online ? null : now },
  });

  const peers = await relatedEmployeeIds(employeeId);
  if (peers.length === 0) return;
  const payload = {
    employeeId,
    status: online ? 'ONLINE' : 'OFFLINE',
    online,
    lastSeenAt: online ? null : now.toISOString(),
  };
  emitToUsers(peers, online ? 'user:online' : 'user:offline', payload);
}

/* =========================================================
   Conversations
   ========================================================= */

async function unreadCountFor(
  conversationId: string,
  member: { lastReadAt: Date | null },
  actorId: string,
): Promise<number> {
  return prisma.message.count({
    where: {
      conversationId,
      isDeleted: false,
      senderId: { not: actorId },
      ...(member.lastReadAt ? { createdAt: { gt: member.lastReadAt } } : {}),
    },
  });
}

const membershipSelect = {
  role: true,
  isMuted: true,
  isArchived: true,
  lastReadAt: true,
  lastReadMessageId: true,
  leftAt: true,
  conversation: { select: conversationSelect },
} satisfies Prisma.ConversationMemberSelect;

type MembershipRow = Prisma.ConversationMemberGetPayload<{ select: typeof membershipSelect }>;

async function toConversationDto(
  membership: MembershipRow,
  actorId: string,
  full: boolean,
): Promise<ConversationDto> {
  const conversation = membership.conversation;
  let lastMessage: MessagePreviewDto | null = null;
  if (conversation.lastMessageId) {
    const row = await prisma.message.findUnique({ where: { id: conversation.lastMessageId }, select: previewSelect });
    if (row) lastMessage = toPreview(row);
  }
  const unreadCount = await unreadCountFor(conversation.id, membership, actorId);
  return mapConversation(conversation, membership, actorId, lastMessage, unreadCount, full);
}

export async function listConversations(
  actorId: string,
  query: ListConversationsQuery,
): Promise<ConversationDto[]> {
  const memberships = await prisma.conversationMember.findMany({
    where: {
      employeeId: actorId,
      leftAt: null,
      ...(query.archived === undefined ? {} : { isArchived: query.archived }),
    },
    select: membershipSelect,
  });

  memberships.sort((a, b) => b.conversation.updatedAt.getTime() - a.conversation.updatedAt.getTime());
  return Promise.all(memberships.map((membership) => toConversationDto(membership, actorId, false)));
}

export async function getConversation(actorId: string, conversationId: string): Promise<ConversationDto> {
  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_employeeId: { conversationId, employeeId: actorId } },
    select: membershipSelect,
  });
  if (!membership || membership.leftAt) {
    throw ApiError.forbidden('You are not a member of this conversation');
  }
  return toConversationDto(membership, actorId, true);
}

async function assertEmployeesAvailable(ids: string[]): Promise<void> {
  const unique = [...new Set(ids)];
  const rows = await prisma.user.findMany({
    where: { id: { in: unique }, status: 'ACTIVE' },
    select: { id: true },
  });
  if (rows.length !== unique.length) {
    throw ApiError.badRequest('One or more selected employees are unavailable');
  }
}

export async function createDirectConversation(actorId: string, otherEmployeeId: string): Promise<ConversationDto> {
  if (otherEmployeeId === actorId) {
    throw ApiError.badRequest("You cannot start a conversation with yourself");
  }
  await assertEmployeesAvailable([otherEmployeeId]);

  const [first, second] = [actorId, otherEmployeeId].sort();
  const directKey = `${first}:${second}`;

  let conversation = await prisma.conversation.findUnique({ where: { directKey }, select: { id: true } });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        directKey,
        createdById: actorId,
        members: { create: [{ employeeId: first }, { employeeId: second }] },
      },
      select: { id: true },
    });
  } else {
    // Re-open the pair if either side had left the thread.
    await prisma.conversationMember.updateMany({
      where: { conversationId: conversation.id, employeeId: { in: [first, second] } },
      data: { leftAt: null },
    });
  }

  return getConversation(actorId, conversation.id);
}

export async function createGroupConversation(actorId: string, input: CreateGroupInput): Promise<ConversationDto> {
  const memberIds = [...new Set([actorId, ...input.memberIds.filter((id) => id !== actorId)])];
  await assertEmployeesAvailable(memberIds);

  const conversation = await prisma.conversation.create({
    data: {
      type: 'GROUP',
      name: input.name,
      description: input.description ?? null,
      createdById: actorId,
      members: {
        create: memberIds.map((id) => ({ employeeId: id, role: id === actorId ? 'ADMIN' : 'MEMBER' })),
      },
    },
    select: { id: true },
  });

  const dto = await getConversation(actorId, conversation.id);
  await createSystemMessage(conversation.id, `${dto.name} was created`);
  return dto;
}

export async function updateGroup(
  actorId: string,
  conversationId: string,
  input: UpdateGroupInput,
): Promise<ConversationDto> {
  await assertGroupAdmin(conversationId, actorId);
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    },
  });
  const dto = await getConversation(actorId, conversationId);
  await broadcastGroupConversationUpdate(conversationId);
  return dto;
}

export async function addGroupMembers(
  actorId: string,
  conversationId: string,
  input: MemberListInput,
): Promise<ConversationDto> {
  await assertGroupAdmin(conversationId, actorId);
  await assertEmployeesAvailable(input.memberIds);

  const existing = await prisma.conversationMember.findMany({
    where: { conversationId, leftAt: null },
    select: { employeeId: true },
  });
  const existingIds = new Set(existing.map((row) => row.employeeId));
  const toAdd = [...new Set(input.memberIds)].filter((id) => !existingIds.has(id));

  if (toAdd.length === 0) throw ApiError.badRequest('Those employees are already members');

  await prisma.$transaction([
    ...toAdd.map((employeeId) =>
      prisma.conversationMember.upsert({
        where: { conversationId_employeeId: { conversationId, employeeId } },
        update: { leftAt: null, role: 'MEMBER' },
        create: { conversationId, employeeId, role: 'MEMBER' },
      }),
    ),
  ]);

  const added = await prisma.user.findMany({
    where: { id: { in: toAdd } },
    select: { firstName: true, lastName: true },
  });
  await createSystemMessage(
    conversationId,
    `${added.map((u) => fullName(u.firstName, u.lastName)).join(', ')} joined the group`,
  );
  await broadcastGroupConversationUpdate(conversationId);

  return getConversation(actorId, conversationId);
}

export async function removeGroupMember(
  actorId: string,
  conversationId: string,
  employeeId: string,
): Promise<ConversationDto> {
  const successorId = await prisma.$transaction(async (tx) => {
    const group = await lockGroupForUpdate(tx, conversationId);
    assertLockedGroupMember(group, actorId, true);
    if (employeeId === actorId) throw ApiError.badRequest('Use Leave group to remove yourself');

    const target = group.members.find((entry) => entry.employeeId === employeeId);
    if (!target) throw ApiError.notFound('That employee is not a member');
    if (employeeId === group.createdById && actorId !== group.createdById) {
      throw ApiError.forbidden('The group creator cannot be removed by another admin');
    }

    await tx.conversationMember.update({
      where: { conversationId_employeeId: { conversationId, employeeId } },
      data: { leftAt: new Date() },
    });
    return ensureGroupHasAdmin(tx, conversationId);
  });

  const user = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { firstName: true, lastName: true },
  });
  if (user) {
    const successor = successorId
      ? await prisma.user.findUnique({ where: { id: successorId }, select: { firstName: true, lastName: true } })
      : null;
    const successionNote = successor ? ` ${fullName(successor.firstName, successor.lastName)} is now an admin.` : '';
    await createSystemMessage(
      conversationId,
      `${fullName(user.firstName, user.lastName)} was removed from the group.${successionNote}`,
    );
  }

  // Let the removed member's client drop the conversation.
  emitToUser(employeeId, 'conversation:updated', { conversationId, removed: true });
  await broadcastGroupConversationUpdate(conversationId);

  return getConversation(actorId, conversationId);
}

export async function updateGroupMemberRole(
  actorId: string,
  conversationId: string,
  employeeId: string,
  input: UpdateMemberRoleInput,
): Promise<ConversationDto> {
  const previousRole = await prisma.$transaction(async (tx) => {
    const group = await lockGroupForUpdate(tx, conversationId);
    assertLockedGroupMember(group, actorId, true);
    if (employeeId === actorId) {
      throw ApiError.badRequest('Use Leave group to relinquish your admin role');
    }

    const target = group.members.find((entry) => entry.employeeId === employeeId);
    if (!target) throw ApiError.notFound('That employee is not a member');
    if (target.role === input.role) return target.role;
    if (employeeId === group.createdById && input.role !== 'ADMIN') {
      throw ApiError.badRequest('The group creator must remain an admin while they are a member');
    }
    if (input.role === 'MEMBER') {
      const adminCount = await tx.conversationMember.count({
        where: { conversationId, leftAt: null, role: 'ADMIN' },
      });
      if (adminCount <= 1) throw ApiError.badRequest('A group must always have at least one admin');
    }

    await tx.conversationMember.update({
      where: { conversationId_employeeId: { conversationId, employeeId } },
      data: { role: input.role },
    });
    return target.role;
  });

  const user = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { firstName: true, lastName: true },
  });
  const name = user ? fullName(user.firstName, user.lastName) : 'A member';
  const message =
    input.role === 'ADMIN'
      ? `${name} was made a group admin`
      : `${name} is no longer a group admin`;
  if (previousRole !== input.role) await createSystemMessage(conversationId, message);
  await broadcastGroupConversationUpdate(conversationId);
  return getConversation(actorId, conversationId);
}

export async function leaveGroup(actorId: string, conversationId: string): Promise<void> {
  const successorId = await prisma.$transaction(async (tx) => {
    const group = await lockGroupForUpdate(tx, conversationId);
    assertLockedGroupMember(group, actorId);
    await tx.conversationMember.update({
      where: { conversationId_employeeId: { conversationId, employeeId: actorId } },
      data: { leftAt: new Date() },
    });
    return ensureGroupHasAdmin(tx, conversationId);
  });
  const successor = successorId
    ? await prisma.user.findUnique({ where: { id: successorId }, select: { firstName: true, lastName: true } })
    : null;
  const successionNote = successor ? ` ${fullName(successor.firstName, successor.lastName)} is now an admin.` : '';
  await createSystemMessage(conversationId, `A member left the group.${successionNote}`);
  emitToUser(actorId, 'conversation:updated', { conversationId, removed: true });
  await broadcastGroupConversationUpdate(conversationId);
}

export async function updateMemberSettings(
  actorId: string,
  conversationId: string,
  input: MemberSettingsInput,
): Promise<ConversationDto> {
  await assertMember(conversationId, actorId);
  await prisma.conversationMember.update({
    where: { conversationId_employeeId: { conversationId, employeeId: actorId } },
    data: {
      ...(input.isMuted !== undefined ? { isMuted: input.isMuted } : {}),
      ...(input.isArchived !== undefined ? { isArchived: input.isArchived } : {}),
    },
  });
  return getConversation(actorId, conversationId);
}

export async function uploadGroupAvatar(
  actorId: string,
  conversationId: string,
  file: Express.Multer.File,
): Promise<ConversationDto> {
  await assertGroupAdmin(conversationId, actorId);
  if (!file.mimetype.startsWith('image/')) {
    throw ApiError.badRequest('Group avatar must be an image');
  }

  const previous = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { avatarPath: true },
  });
  const saved = await saveUploadedFile(file);
  await prisma.conversation.update({ where: { id: conversationId }, data: { avatarPath: saved.storagePath } });
  if (previous?.avatarPath) await removeStoredFile(previous.avatarPath);

  const dto = await getConversation(actorId, conversationId);
  emitToConversation(conversationId, 'conversation:updated', { conversationId, conversation: dto });
  return dto;
}

export async function getGroupAvatarFile(actorId: string, conversationId: string) {
  await assertMember(conversationId, actorId);
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { avatarPath: true, name: true },
  });
  if (!conversation?.avatarPath) throw ApiError.notFound('This group has no avatar');
  return {
    absolutePath: resolveWithinRoot(conversation.avatarPath),
    filename: `${conversation.name ?? 'group'}.avatar`,
  };
}

/* =========================================================
   Messages
   ========================================================= */

export async function listMessages(
  actorId: string,
  conversationId: string,
  query: MessagePageQuery,
): Promise<MessagePageDto> {
  await assertMember(conversationId, actorId);
  const limit = query.limit ?? env.CHAT_MESSAGE_PAGE_SIZE;

  const where: Prisma.MessageWhereInput = { conversationId };
  if (query.before) {
    const cursor = await prisma.message.findFirst({
      where: { id: query.before, conversationId },
      select: { createdAt: true, id: true },
    });
    if (cursor) {
      where.OR = [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ];
    }
  }

  const rows = await prisma.message.findMany({
    where,
    select: messageSelect,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1].id : null;
  const messages = await mapMessages([...page].reverse(), actorId);

  return { messages, hasMore, nextCursor };
}

export interface CreateMessageParams {
  content?: string | null;
  clientMessageId?: string | null;
  replyToMessageId?: string | null;
  attachment?: SavedFile | null;
}

function attachmentCreateData(saved: SavedFile, uploadedById: string) {
  return {
    uploadedById,
    originalFilename: saved.originalFilename,
    storedFilename: saved.storedFilename,
    storagePath: saved.storagePath,
    thumbnailPath: saved.thumbnailPath,
    mimeType: saved.mimeType,
    fileExtension: saved.fileExtension,
    fileSize: saved.fileSize,
    category: saved.category,
    checksum: saved.checksum,
    width: saved.width,
    height: saved.height,
  };
}

function messageTypeFor(saved: SavedFile | null | undefined): ChatMessageType {
  if (!saved) return 'TEXT';
  if (saved.category === 'images') return 'IMAGE';
  if (saved.category === 'videos') return 'VIDEO';
  return 'FILE';
}

export async function createMessage(
  actorId: string,
  conversationId: string,
  params: CreateMessageParams,
): Promise<MessageDto> {
  await assertMember(conversationId, actorId);

  // Idempotency: a retried send (same client id) returns the stored message.
  if (params.clientMessageId) {
    const existing = await prisma.message.findUnique({
      where: {
        conversationId_clientMessageId: { conversationId, clientMessageId: params.clientMessageId },
      },
      select: messageSelect,
    });
    if (existing) return (await mapMessages([existing], actorId))[0];
  }

  if (params.replyToMessageId) {
    const parent = await prisma.message.findFirst({
      where: { id: params.replyToMessageId, conversationId },
      select: { id: true },
    });
    if (!parent) throw ApiError.badRequest('The message you are replying to no longer exists');
  }

  const attachment = params.attachment ?? null;
  const recipients = (await memberIds(conversationId)).filter((id) => id !== actorId);

  let created: MessageRow;
  try {
    created = await prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          conversationId,
          senderId: actorId,
          messageType: messageTypeFor(attachment),
          content: params.content?.trim() || null,
          replyToMessageId: params.replyToMessageId ?? null,
          clientMessageId: params.clientMessageId ?? null,
          ...(attachment ? { attachments: { create: attachmentCreateData(attachment, actorId) } } : {}),
          ...(recipients.length ? { receipts: { create: recipients.map((id) => ({ employeeId: id })) } } : {}),
        },
        select: messageSelect,
      });
      await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageId: message.id } });
      return message;
    });
  } catch (error) {
    if (attachment) await removeStoredFile(attachment.storagePath);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      params.clientMessageId
    ) {
      const existing = await prisma.message.findUnique({
        where: {
          conversationId_clientMessageId: { conversationId, clientMessageId: params.clientMessageId },
        },
        select: messageSelect,
      });
      if (existing) return (await mapMessages([existing], actorId))[0];
    }
    throw error;
  }

  const dto = (await mapMessages([created], actorId))[0];
  await broadcastNewMessage(conversationId, actorId, dto);
  return dto;
}

export async function editMessage(actorId: string, messageId: string, content: string): Promise<MessageDto> {
  const existing = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true, senderId: true, messageType: true, isDeleted: true },
  });
  if (!existing) throw ApiError.notFound('Message not found');
  await assertMember(existing.conversationId, actorId);
  if (existing.senderId !== actorId) throw ApiError.forbidden('You can only edit your own messages');
  if (existing.isDeleted) throw ApiError.badRequest('This message was deleted');
  if (existing.messageType !== 'TEXT') throw ApiError.badRequest('Only text messages can be edited');

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { content, editedAt: new Date() },
    select: messageSelect,
  });
  const dto = (await mapMessages([updated], actorId))[0];
  emitToConversation(existing.conversationId, 'message:updated', dto);
  return dto;
}

export async function deleteMessage(actorId: string, messageId: string): Promise<void> {
  const existing = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true, senderId: true, isDeleted: true },
  });
  if (!existing) throw ApiError.notFound('Message not found');
  const membership = await assertMember(existing.conversationId, actorId);
  if (existing.isDeleted) return;

  const isOwner = existing.senderId === actorId;
  const isAdmin = membership.conversation.type === 'GROUP' && membership.role === 'ADMIN';
  if (!isOwner && !isAdmin) throw ApiError.forbidden('You cannot delete this message');

  await prisma.message.update({
    where: { id: messageId },
    data: { isDeleted: true, deletedAt: new Date(), content: null },
  });
  emitToConversation(existing.conversationId, 'message:deleted', {
    id: messageId,
    conversationId: existing.conversationId,
  });
}

export async function forwardMessage(
  actorId: string,
  messageId: string,
  targetConversationId: string,
): Promise<MessageDto> {
  const original = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      conversationId: true,
      messageType: true,
      content: true,
      isDeleted: true,
      attachments: {
        select: {
          originalFilename: true,
          storedFilename: true,
          storagePath: true,
          thumbnailPath: true,
          mimeType: true,
          fileExtension: true,
          fileSize: true,
          category: true,
          checksum: true,
          width: true,
          height: true,
        },
      },
    },
  });
  if (!original || original.isDeleted) throw ApiError.notFound('Message not found');

  await assertMember(original.conversationId, actorId);
  await assertMember(targetConversationId, actorId);

  const recipients = (await memberIds(targetConversationId)).filter((id) => id !== actorId);

  const created = await prisma.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: {
        conversationId: targetConversationId,
        senderId: actorId,
        messageType: original.messageType,
        content: original.content,
        forwardedFromMessageId: original.id,
        ...(original.attachments.length
          ? {
              attachments: {
                create: original.attachments.map((file) => ({
                  uploadedById: actorId,
                  originalFilename: file.originalFilename,
                  storedFilename: file.storedFilename,
                  storagePath: file.storagePath,
                  thumbnailPath: file.thumbnailPath,
                  mimeType: file.mimeType,
                  fileExtension: file.fileExtension,
                  fileSize: file.fileSize,
                  category: file.category,
                  checksum: file.checksum,
                  width: file.width,
                  height: file.height,
                })),
              },
            }
          : {}),
        ...(recipients.length ? { receipts: { create: recipients.map((id) => ({ employeeId: id })) } } : {}),
      },
      select: messageSelect,
    });
    await tx.conversation.update({ where: { id: targetConversationId }, data: { lastMessageId: message.id } });
    return message;
  });

  const dto = (await mapMessages([created], actorId))[0];
  await broadcastNewMessage(targetConversationId, actorId, dto);
  return dto;
}

export async function addReaction(actorId: string, messageId: string, reaction: string): Promise<MessageDto> {
  const existing = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true, isDeleted: true },
  });
  if (!existing || existing.isDeleted) throw ApiError.notFound('Message not found');
  await assertMember(existing.conversationId, actorId);

  await prisma.messageReaction.upsert({
    where: { messageId_employeeId_reaction: { messageId, employeeId: actorId, reaction } },
    update: {},
    create: { messageId, employeeId: actorId, reaction },
  });

  return broadcastMessageUpdate(existing.conversationId, messageId, actorId);
}

export async function removeReaction(actorId: string, messageId: string, reaction: string): Promise<MessageDto> {
  const existing = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true },
  });
  if (!existing) throw ApiError.notFound('Message not found');
  await assertMember(existing.conversationId, actorId);

  await prisma.messageReaction.deleteMany({ where: { messageId, employeeId: actorId, reaction } });
  return broadcastMessageUpdate(existing.conversationId, messageId, actorId);
}

async function broadcastMessageUpdate(
  conversationId: string,
  messageId: string,
  actorId: string,
): Promise<MessageDto> {
  const row = await prisma.message.findUnique({ where: { id: messageId }, select: messageSelect });
  if (!row) throw ApiError.notFound('Message not found');
  const dto = (await mapMessages([row], actorId))[0];
  emitToConversation(conversationId, 'message:updated', dto);
  return dto;
}

/* ---------------- receipts ---------------- */

export async function markDelivered(actorId: string, conversationId: string): Promise<{ updated: number }> {
  await assertMember(conversationId, actorId);
  const pending = await prisma.messageReceipt.findMany({
    where: { employeeId: actorId, deliveredAt: null, message: { conversationId } },
    select: { id: true },
  });
  if (pending.length === 0) return { updated: 0 };

  const now = new Date();
  await prisma.messageReceipt.updateMany({
    where: { id: { in: pending.map((row) => row.id) } },
    data: { deliveredAt: now },
  });
  emitToConversation(conversationId, 'message:delivered', {
    conversationId,
    employeeId: actorId,
    deliveredAt: now.toISOString(),
  });
  return { updated: pending.length };
}

export async function markRead(actorId: string, conversationId: string, messageId: string): Promise<void> {
  await assertMember(conversationId, actorId);
  const target = await prisma.message.findFirst({
    where: { id: messageId, conversationId },
    select: { id: true, createdAt: true },
  });
  if (!target) throw ApiError.notFound('Message not found');

  const pending = await prisma.messageReceipt.findMany({
    where: {
      employeeId: actorId,
      readAt: null,
      message: { conversationId, createdAt: { lte: target.createdAt } },
    },
    select: { id: true },
  });

  const now = new Date();
  if (pending.length > 0) {
    await prisma.messageReceipt.updateMany({
      where: { id: { in: pending.map((row) => row.id) } },
      data: { readAt: now, deliveredAt: now },
    });
  }

  await prisma.conversationMember.update({
    where: { conversationId_employeeId: { conversationId, employeeId: actorId } },
    data: { lastReadMessageId: messageId, lastReadAt: now },
  });

  emitToConversation(conversationId, 'message:read', {
    conversationId,
    employeeId: actorId,
    messageId,
    readAt: now.toISOString(),
  });
}

/* ---------------- pins ---------------- */

export async function listPinned(actorId: string, conversationId: string): Promise<MessageDto[]> {
  await assertMember(conversationId, actorId);
  const pins = await prisma.pinnedMessage.findMany({
    where: { conversationId },
    select: { message: { select: messageSelect } },
    orderBy: { createdAt: 'desc' },
  });
  return mapMessages(pins.map((pin) => pin.message), actorId);
}

export async function pinMessage(actorId: string, conversationId: string, messageId: string): Promise<MessageDto> {
  await assertMember(conversationId, actorId);
  const message = await prisma.message.findFirst({
    where: { id: messageId, conversationId },
    select: { id: true },
  });
  if (!message) throw ApiError.notFound('Message not found');

  await prisma.pinnedMessage.upsert({
    where: { conversationId_messageId: { conversationId, messageId } },
    update: {},
    create: { conversationId, messageId, pinnedById: actorId },
  });
  return broadcastMessageUpdate(conversationId, messageId, actorId);
}

export async function unpinMessage(actorId: string, conversationId: string, messageId: string): Promise<MessageDto> {
  await assertMember(conversationId, actorId);
  const message = await prisma.message.findFirst({
    where: { id: messageId, conversationId },
    select: { id: true },
  });
  if (!message) throw ApiError.notFound('Message not found');

  await prisma.pinnedMessage.deleteMany({ where: { conversationId, messageId } });
  return broadcastMessageUpdate(conversationId, messageId, actorId);
}

/* =========================================================
   Search, settings & unread summary
   ========================================================= */

export async function searchMessages(
  actorId: string,
  query: SearchQuery,
): Promise<SearchResultDto[]> {
  const memberships = await prisma.conversationMember.findMany({
    where: { employeeId: actorId, leftAt: null },
    select: { conversationId: true },
  });
  const conversationIds = memberships.map((row) => row.conversationId);
  if (conversationIds.length === 0) return [];

  const rows = await prisma.message.findMany({
    where: {
      conversationId: { in: conversationIds },
      isDeleted: false,
      content: { contains: query.q, mode: 'insensitive' },
    },
    select: {
      id: true,
      conversationId: true,
      senderId: true,
      content: true,
      createdAt: true,
      sender: { select: { firstName: true, lastName: true } },
      conversation: {
        select: {
          type: true,
          name: true,
          members: {
            where: { leftAt: null, employeeId: { not: actorId } },
            select: { employee: { select: { firstName: true, lastName: true } } },
            take: 1,
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: query.limit,
  });

  return rows.map((row) => {
    const isGroup = row.conversation.type === 'GROUP';
    const counterpart = row.conversation.members[0]?.employee;
    return {
      id: row.id,
      conversationId: row.conversationId,
      conversationName: isGroup
        ? row.conversation.name ?? 'Group'
        : counterpart
          ? fullName(counterpart.firstName, counterpart.lastName)
          : 'Direct message',
      isGroup,
      senderId: row.senderId,
      senderName: row.sender ? fullName(row.sender.firstName, row.sender.lastName) : null,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export async function getSettings(actorId: string): Promise<ChatSettingsDto> {
  let row = await prisma.userSettings.findUnique({ where: { employeeId: actorId } });
  if (!row) row = await prisma.userSettings.create({ data: { employeeId: actorId } });
  return { notificationEnabled: row.notificationEnabled, soundEnabled: row.soundEnabled };
}

export async function updateSettings(
  actorId: string,
  input: UpdateSettingsInput,
): Promise<ChatSettingsDto> {
  const row = await prisma.userSettings.upsert({
    where: { employeeId: actorId },
    update: {
      ...(input.notificationEnabled !== undefined ? { notificationEnabled: input.notificationEnabled } : {}),
      ...(input.soundEnabled !== undefined ? { soundEnabled: input.soundEnabled } : {}),
    },
    create: {
      employeeId: actorId,
      notificationEnabled: input.notificationEnabled ?? true,
      soundEnabled: input.soundEnabled ?? true,
    },
  });
  return { notificationEnabled: row.notificationEnabled, soundEnabled: row.soundEnabled };
}

export interface UnreadSummary {
  total: number;
  conversations: Array<{ conversationId: string; unreadCount: number }>;
}

export async function getUnreadSummary(actorId: string): Promise<UnreadSummary> {
  const memberships = await prisma.conversationMember.findMany({
    where: { employeeId: actorId, leftAt: null },
    select: { conversationId: true, lastReadAt: true },
  });

  const conversations = await Promise.all(
    memberships.map(async (membership) => ({
      conversationId: membership.conversationId,
      unreadCount: await unreadCountFor(membership.conversationId, membership, actorId),
    })),
  );

  return {
    total: conversations.reduce((sum, entry) => sum + entry.unreadCount, 0),
    conversations: conversations.filter((entry) => entry.unreadCount > 0),
  };
}

/** Utility used by the socket gateway to confirm a room is joinable. */
export async function canAccessConversation(actorId: string, conversationId: string): Promise<boolean> {
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_employeeId: { conversationId, employeeId: actorId } },
    select: { id: true, leftAt: true },
  });
  return Boolean(member) && !member?.leftAt;
}

/** Ids of every active conversation an employee belongs to (socket auto-join). */
export async function listConversationIds(employeeId: string): Promise<string[]> {
  const rows = await prisma.conversationMember.findMany({
    where: { employeeId, leftAt: null },
    select: { conversationId: true },
  });
  return rows.map((row) => row.conversationId);
}

/* =========================================================
   Attachment access (membership-checked)
   ========================================================= */

async function loadAttachment(actorId: string, attachmentId: string) {
  const attachment = await prisma.messageAttachment.findUnique({
    where: { id: attachmentId },
    select: {
      storagePath: true,
      thumbnailPath: true,
      mimeType: true,
      originalFilename: true,
      fileSize: true,
      message: { select: { conversationId: true, isDeleted: true } },
    },
  });
  if (!attachment) throw ApiError.notFound('Attachment not found');
  await assertMember(attachment.message.conversationId, actorId);
  if (attachment.message.isDeleted) throw ApiError.notFound('Attachment not found');
  return attachment;
}

export async function getAttachmentFile(actorId: string, attachmentId: string): Promise<AttachmentFileDto> {
  return toAttachmentFile(await loadAttachment(actorId, attachmentId));
}

export async function getAttachmentThumbnail(actorId: string, attachmentId: string): Promise<AttachmentFileDto> {
  return toThumbnailFile(await loadAttachment(actorId, attachmentId));
}
