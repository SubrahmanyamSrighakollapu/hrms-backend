import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import { pageMeta, skipTake } from '../../utils/pagination';
import type {
  CategoryInput,
  CommentInput,
  CreateTicketInput,
  ListTicketsQuery,
  TicketModule,
  TicketStatus,
  UpdateCategoryInput,
  UpdateTicketInput,
} from './ticket.validation';

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

const nameOf = (u?: { firstName: string | null; lastName: string | null } | null): string | null =>
  u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || null : null;

/* ------------------------------ Categories ------------------------------ */

export async function listCategories(module: TicketModule) {
  const rows = await prisma.ticketCategory.findMany({
    where: { module, active: true },
    orderBy: { name: 'asc' },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    module: c.module,
    icon: c.icon,
    active: c.active,
  }));
}

export async function listAllCategories(module: TicketModule) {
  const rows = await prisma.ticketCategory.findMany({
    where: { module },
    orderBy: { name: 'asc' },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    module: c.module,
    icon: c.icon,
    active: c.active,
    ticketCount: 0,
  }));
}

export async function createCategory(module: TicketModule, input: CategoryInput) {
  const existing = await prisma.ticketCategory.findUnique({
    where: { name_module: { name: input.name, module } },
    select: { id: true },
  });
  if (existing) throw ApiError.badRequest('A category with this name already exists');

  const row = await prisma.ticketCategory.create({
    data: { name: input.name, module, icon: input.icon?.trim() || null },
  });
  return row;
}

export async function updateCategory(module: TicketModule, id: string, input: UpdateCategoryInput) {
  const existing = await prisma.ticketCategory.findUnique({ where: { id } });
  if (!existing || existing.module !== module) throw ApiError.notFound('Category not found');

  if (input.name && input.name !== existing.name) {
    const dup = await prisma.ticketCategory.findUnique({
      where: { name_module: { name: input.name, module } },
      select: { id: true },
    });
    if (dup) throw ApiError.badRequest('A category with this name already exists');
  }

  return prisma.ticketCategory.update({
    where: { id },
    data: {
      name: input.name,
      icon: input.icon === undefined ? undefined : input.icon?.trim() || null,
      active: input.active,
    },
  });
}

/* ------------------------------- Tickets -------------------------------- */

const ticketSelect = {
  id: true,
  module: true,
  title: true,
  description: true,
  priority: true,
  status: true,
  categoryId: true,
  createdById: true,
  assignedToId: true,
  resolvedAt: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true, icon: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
} satisfies Prisma.TicketSelect;

type TicketRow = Prisma.TicketGetPayload<{ select: typeof ticketSelect }>;

function toTicketDto(row: TicketRow) {
  return {
    id: row.id,
    module: row.module,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    categoryId: row.categoryId,
    categoryName: row.category.name,
    categoryIcon: row.category.icon,
    createdById: row.createdById,
    createdByName: nameOf(row.createdBy),
    createdByEmail: row.createdBy.email,
    assignedToId: row.assignedToId,
    assignedToName: nameOf(row.assignedTo),
    assignedToEmail: row.assignedTo?.email ?? null,
    resolvedAt: iso(row.resolvedAt),
    closedAt: iso(row.closedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function buildWhere(module: TicketModule, userId: string, query: ListTicketsQuery, canManage: boolean) {
  const where: Prisma.TicketWhereInput = { module };

  // Scope: who can see what
  if (!canManage) {
    where.OR = [{ createdById: userId }, { assignedToId: userId }];
  } else if (query.scope === 'mine') {
    where.createdById = userId;
  } else if (query.scope === 'assigned') {
    where.assignedToId = userId;
  }

  if (query.status) where.status = query.status;
  if (query.priority) where.priority = query.priority;
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.assignedToId) where.assignedToId = query.assignedToId;
  if (query.q) {
    where.OR = [
      { title: { contains: query.q, mode: 'insensitive' } },
      { description: { contains: query.q, mode: 'insensitive' } },
    ];
    if (!canManage) {
      // keep own/assigned gate by ANDing with it
      where.AND = [{ OR: [{ createdById: userId }, { assignedToId: userId }] }];
    }
  }

  return where;
}

export async function listTickets(
  module: TicketModule,
  userId: string,
  query: ListTicketsQuery,
  canManage: boolean,
) {
  const { page, pageSize } = query;
  const where = buildWhere(module, userId, query, canManage);

  const [total, rows] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      select: ticketSelect,
      orderBy: [
        { status: 'asc' },
        { priority: 'asc' },
        { createdAt: 'desc' },
      ],
      ...skipTake(page, pageSize),
    }),
  ]);

  return {
    tickets: rows.map(toTicketDto),
    ...pageMeta(page, pageSize, total),
  };
}

export async function getTicket(module: TicketModule, id: string, userId: string, canManage: boolean) {
  const row = await prisma.ticket.findUnique({
    where: { id },
    select: {
      ...ticketSelect,
      comments: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          message: true,
          createdAt: true,
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      },
    },
  });

  if (!row || row.module !== module) throw ApiError.notFound('Ticket not found');

  if (!canManage && row.createdById !== userId && row.assignedToId !== userId) {
    throw ApiError.forbidden('You do not have access to this ticket');
  }

  const dto = toTicketDto(row);
  return {
    ...dto,
    comments: row.comments.map((c) => ({
      id: c.id,
      message: c.message,
      createdAt: iso(c.createdAt),
      userId: c.user.id,
      userName: nameOf(c.user),
      userEmail: c.user.email,
    })),
  };
}

export async function createTicket(module: TicketModule, userId: string, input: CreateTicketInput) {
  const category = await prisma.ticketCategory.findUnique({
    where: { id: input.categoryId },
    select: { id: true, module: true, active: true },
  });
  if (!category || category.module !== module) {
    throw ApiError.badRequest('The selected category does not exist for this module');
  }
  if (!category.active) throw ApiError.badRequest('The selected category is no longer active');

  if (input.assignedToId) {
    const assignee = await prisma.user.findUnique({ where: { id: input.assignedToId }, select: { id: true } });
    if (!assignee) throw ApiError.badRequest('The selected assignee does not exist');
  }

  const row = await prisma.ticket.create({
    data: {
      module,
      title: input.title,
      description: input.description,
      categoryId: input.categoryId,
      priority: input.priority ?? 'MEDIUM',
      status: input.status ?? 'OPEN',
      createdById: userId,
      assignedToId: input.assignedToId ?? null,
    },
    select: ticketSelect,
  });

  return toTicketDto(row);
}

export async function updateTicket(
  module: TicketModule,
  id: string,
  input: UpdateTicketInput,
) {
  const existing = await prisma.ticket.findUnique({ where: { id }, select: { id: true, module: true, status: true, resolvedAt: true } });
  if (!existing || existing.module !== module) throw ApiError.notFound('Ticket not found');

  if (input.categoryId) {
    const category = await prisma.ticketCategory.findUnique({
      where: { id: input.categoryId },
      select: { id: true, module: true, active: true },
    });
    if (!category || category.module !== module) {
      throw ApiError.badRequest('The selected category does not exist for this module');
    }
    if (!category.active) throw ApiError.badRequest('The selected category is no longer active');
  }

  if (input.assignedToId !== undefined) {
    if (input.assignedToId) {
      const assignee = await prisma.user.findUnique({ where: { id: input.assignedToId }, select: { id: true } });
      if (!assignee) throw ApiError.badRequest('The selected assignee does not exist');
    }
  }

  const data: Prisma.TicketUpdateInput = {
    title: input.title,
    description: input.description,
    category: input.categoryId ? { connect: { id: input.categoryId } } : undefined,
    priority: input.priority,
    status: input.status,
    assignedTo:
      input.assignedToId === undefined
        ? undefined
        : input.assignedToId
          ? { connect: { id: input.assignedToId } }
          : { disconnect: true },
  };

  // Timestamp transitions
  if (input.status) {
    if (input.status === 'RESOLVED') {
      data.resolvedAt = existing.resolvedAt ? existing.resolvedAt : new Date();
    } else if (input.status === 'CLOSED') {
      data.closedAt = new Date();
      data.resolvedAt = existing.resolvedAt ?? new Date();
    } else {
      // Reopened: clear resolution timestamps
      data.resolvedAt = null;
      data.closedAt = null;
    }
  }

  const row = await prisma.ticket.update({ where: { id }, data, select: ticketSelect });
  return toTicketDto(row);
}

export async function addComment(
  module: TicketModule,
  ticketId: string,
  userId: string,
  input: CommentInput,
  canManage: boolean,
) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, module: true, createdById: true, assignedToId: true },
  });
  if (!ticket || ticket.module !== module) throw ApiError.notFound('Ticket not found');

  if (!canManage && ticket.createdById !== userId && ticket.assignedToId !== userId) {
    throw ApiError.forbidden('You do not have access to this ticket');
  }

  const comment = await prisma.ticketComment.create({
    data: { ticketId, userId, message: input.message },
    select: {
      id: true,
      message: true,
      createdAt: true,
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  return {
    id: comment.id,
    message: comment.message,
    createdAt: iso(comment.createdAt),
    userId: comment.user.id,
    userName: nameOf(comment.user),
    userEmail: comment.user.email,
  };
}

/* -------------------------------- Stats --------------------------------- */

export async function getTicketStats(module: TicketModule, userId: string, canManage: boolean) {
  const baseWhere: Prisma.TicketWhereInput = { module };
  const visibleWhere: Prisma.TicketWhereInput = canManage
    ? baseWhere
    : { ...baseWhere, OR: [{ createdById: userId }, { assignedToId: userId }] };

  const [byStatus, byPriority, total] = await Promise.all([
    prisma.ticket.groupBy({ by: ['status'], where: visibleWhere, _count: true }),
    prisma.ticket.groupBy({ by: ['priority'], where: visibleWhere, _count: true }),
    prisma.ticket.count({ where: visibleWhere }),
  ]);

  const statuses: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
  const statusCounts = Object.fromEntries(statuses.map((s) => [s, 0])) as Record<string, number>;
  for (const row of byStatus) statusCounts[row.status] = row._count;

  const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
  const priorityCounts = Object.fromEntries(priorities.map((p) => [p, 0])) as Record<string, number>;
  for (const row of byPriority) priorityCounts[row.priority] = row._count;

  return { total, byStatus: statusCounts, byPriority: priorityCounts };
}

/* ----------------------------- Assignees ------------------------------- */

export async function listAssignees() {
  const rows = await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, firstName: true, lastName: true, email: true, designation: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  return rows.map((u) => ({
    id: u.id,
    name: nameOf(u),
    email: u.email,
    designation: u.designation,
  }));
}
