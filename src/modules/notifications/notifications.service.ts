import { randomUUID } from 'node:crypto';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';

interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  read_at: Date | null;
  created_at: Date;
}

function toDto(row: NotificationRow) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    href: row.href,
    readAt: row.read_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listNotifications(userId: string, limit: number) {
  const rows = await prisma.$queryRaw<NotificationRow[]>`
    SELECT "id", "kind", "title", "body", "href", "read_at", "created_at"
    FROM "notifications"
    WHERE "user_id" = ${userId}
    ORDER BY "created_at" DESC
    LIMIT ${limit}
  `;
  const unread = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) AS "count" FROM "notifications"
    WHERE "user_id" = ${userId} AND "read_at" IS NULL
  `;
  return { notifications: rows.map(toDto), unreadCount: Number(unread[0]?.count ?? 0) };
}

export async function markRead(userId: string, notificationId: string) {
  const rows = await prisma.$queryRaw<NotificationRow[]>`
    UPDATE "notifications" SET "read_at" = COALESCE("read_at", CURRENT_TIMESTAMP)
    WHERE "id" = ${notificationId} AND "user_id" = ${userId}
    RETURNING "id", "kind", "title", "body", "href", "read_at", "created_at"
  `;
  if (!rows[0]) throw ApiError.notFound('Notification not found');
  return toDto(rows[0]);
}

export async function markAllRead(userId: string) {
  const count = await prisma.$executeRaw`
    UPDATE "notifications" SET "read_at" = CURRENT_TIMESTAMP
    WHERE "user_id" = ${userId} AND "read_at" IS NULL
  `;
  return { updated: count };
}

export async function createNotification(input: {
  userId: string;
  kind: string;
  title: string;
  body: string;
  href: string;
}) {
  await prisma.$executeRaw`
    INSERT INTO "notifications" ("id", "user_id", "kind", "title", "body", "href")
    VALUES (${randomUUID()}, ${input.userId}, ${input.kind}, ${input.title}, ${input.body}, ${input.href})
  `;
}

export async function notifyRole(input: {
  roleId: string;
  exceptUserId?: string;
  kind: string;
  title: string;
  body: string;
  href: string;
}) {
  const users = await prisma.user.findMany({
    where: {
      roleId: input.roleId,
      status: 'ACTIVE',
      ...(input.exceptUserId ? { id: { not: input.exceptUserId } } : {}),
    },
    select: { id: true },
  });
  await Promise.all(users.map((user) => createNotification({ ...input, userId: user.id })));
}
