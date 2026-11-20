/**
 * Conversation access control.
 *
 * Every read/write against a conversation funnels through these helpers so
 * membership and group-admin rules are enforced in exactly one place.
 */
import type { ConversationMember } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';

type Membership = ConversationMember & { conversation: { id: string; type: 'DIRECT' | 'GROUP'; isActive: boolean } };

export async function getMembership(
  conversationId: string,
  employeeId: string,
): Promise<Membership | null> {
  return prisma.conversationMember.findUnique({
    where: { conversationId_employeeId: { conversationId, employeeId } },
    include: { conversation: { select: { id: true, type: true, isActive: true } } },
  });
}

/** Throws unless the employee is an active member of the conversation. */
export async function assertMember(conversationId: string, employeeId: string): Promise<Membership> {
  const member = await getMembership(conversationId, employeeId);
  if (!member || member.leftAt) {
    throw ApiError.forbidden('You are not a member of this conversation');
  }
  if (!member.conversation.isActive) {
    throw ApiError.badRequest('This conversation is no longer active');
  }
  return member;
}

/** Throws unless the employee is an admin of a group conversation. */
export async function assertGroupAdmin(conversationId: string, employeeId: string): Promise<Membership> {
  const member = await assertMember(conversationId, employeeId);
  if (member.conversation.type !== 'GROUP' || member.role !== 'ADMIN') {
    throw ApiError.forbidden('Only group admins can perform this action');
  }
  return member;
}

/** Ids of every active member of a conversation. */
export async function memberIds(conversationId: string): Promise<string[]> {
  const rows = await prisma.conversationMember.findMany({
    where: { conversationId, leftAt: null },
    select: { employeeId: true },
  });
  return rows.map((row) => row.employeeId);
}

/**
 * Every employee who shares at least one conversation with `employeeId`
 * (used to scope presence broadcasts and message notifications).
 */
export async function relatedEmployeeIds(employeeId: string): Promise<string[]> {
  const rows = await prisma.conversationMember.findMany({
    where: { employeeId, leftAt: null },
    select: {
      conversation: {
        select: {
          members: { where: { leftAt: null }, select: { employeeId: true } },
        },
      },
    },
  });

  const peers = new Set<string>();
  for (const row of rows) {
    for (const member of row.conversation.members) {
      if (member.employeeId !== employeeId) peers.add(member.employeeId);
    }
  }
  return [...peers];
}
