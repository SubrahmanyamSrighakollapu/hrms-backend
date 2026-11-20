/**
 * Shared chat DTOs.
 *
 * Everything here is shaped for the frontend and never leaks internal
 * filesystem paths - attachments are addressed by authenticated URLs.
 */

export type ConversationTypeDto = 'DIRECT' | 'GROUP';
export type MemberRoleDto = 'MEMBER' | 'ADMIN';
export type ChatMessageTypeDto = 'TEXT' | 'IMAGE' | 'FILE' | 'VIDEO' | 'SYSTEM';
export type PresenceStatusDto = 'ONLINE' | 'OFFLINE';

/** A colleague as exposed to the chat directory (no sensitive HR fields). */
export interface ChatEmployeeDto {
  id: string;
  name: string;
  email: string;
  employeeCode: string | null;
  designation: string | null;
  department: string | null;
  avatarUrl: string | null;
  online: boolean;
  lastSeenAt: string | null;
}

export interface ConversationMemberDto {
  employeeId: string;
  name: string;
  email: string;
  employeeCode: string | null;
  designation: string | null;
  department: string | null;
  avatarUrl: string | null;
  role: MemberRoleDto;
  online: boolean;
  lastSeenAt: string | null;
}

export interface AttachmentDto {
  id: string;
  originalFilename: string;
  mimeType: string;
  fileExtension: string | null;
  fileSize: number;
  category: string | null;
  width: number | null;
  height: number | null;
  hasThumbnail: boolean;
  /** Authenticated download path including the API prefix (needs a Bearer token). */
  url: string;
  thumbnailUrl: string | null;
}

export interface ReactionSummaryDto {
  reaction: string;
  count: number;
  mine: boolean;
  employeeIds: string[];
}

export interface MessageStatusDto {
  recipientCount: number;
  deliveredCount: number;
  readCount: number;
  deliveredAll: boolean;
  readAll: boolean;
  myDeliveredAt: string | null;
  myReadAt: string | null;
}

/** Compact message form used for replies and conversation previews. */
export interface MessagePreviewDto {
  id: string;
  senderId: string | null;
  senderName: string | null;
  messageType: ChatMessageTypeDto;
  content: string | null;
  isDeleted: boolean;
  createdAt: string;
  hasAttachment: boolean;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderName: string | null;
  senderAvatarUrl: string | null;
  senderDesignation: string | null;
  messageType: ChatMessageTypeDto;
  content: string | null;
  isDeleted: boolean;
  editedAt: string | null;
  createdAt: string;
  clientMessageId: string | null;
  replyTo: MessagePreviewDto | null;
  forwardedFromMessageId: string | null;
  attachments: AttachmentDto[];
  reactions: ReactionSummaryDto[];
  pinned: boolean;
  status: MessageStatusDto;
}

export interface ConversationDto {
  id: string;
  type: ConversationTypeDto;
  /** Resolved display name: the group name, or the other employee's name. */
  name: string;
  createdById: string | null;
  description: string | null;
  /** Authenticated group-avatar URL (null when unset or for DIRECT). */
  avatarUrl: string | null;
  isGroup: boolean;
  memberCount: number;
  /** Populated on single-conversation reads; empty on the list. */
  members: ConversationMemberDto[];
  /** The other employee for DIRECT conversations. */
  counterpart: ConversationMemberDto | null;
  lastMessage: MessagePreviewDto | null;
  unreadCount: number;
  isMuted: boolean;
  isArchived: boolean;
  myRole: MemberRoleDto;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MessagePageDto {
  messages: MessageDto[];
  hasMore: boolean;
  /** Cursor for the next (older) page - pass as `before`. */
  nextCursor: string | null;
}

export interface ChatSettingsDto {
  notificationEnabled: boolean;
  soundEnabled: boolean;
}

export interface PresenceDto {
  employeeId: string;
  status: PresenceStatusDto;
  online: boolean;
  lastSeenAt: string | null;
}

/** A streamed attachment ready to be piped to the HTTP response. */
export interface AttachmentFileDto {
  absolutePath: string;
  mimeType: string;
  filename: string;
  size: number;
}

export interface SearchResultDto {
  id: string;
  conversationId: string;
  conversationName: string;
  isGroup: boolean;
  senderId: string | null;
  senderName: string | null;
  content: string | null;
  createdAt: string;
}
