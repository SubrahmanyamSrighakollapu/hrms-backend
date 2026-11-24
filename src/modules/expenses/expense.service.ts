import path from 'node:path';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import { pageMeta, skipTake } from '../../utils/pagination';
import {
  removeExpenseReceipt,
  resolveExpensePath,
  storeExpenseReceipt,
} from './expense.storage';
import type {
  CategoryInput,
  CreateClaimInput,
  DecisionInput,
  ExpenseStatus,
  ListClaimsQuery,
  ReimburseInput,
  ReportQuery,
  UpdateCategoryInput,
  UpdateClaimInput,
} from './expense.validation';

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

const nameOf = (u?: { firstName: string | null; lastName: string | null } | null): string | null =>
  u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || null : null;

const toMoney = (value: Prisma.Decimal | number | null | undefined): number =>
  value == null ? 0 : Number(value);

/** Statuses that leave the draft state — these make up the spend report. */
const REPORTABLE_STATUSES: ExpenseStatus[] = [
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'CLARIFICATION',
  'REIMBURSED',
];

/* ----------------------------- Policy checks ----------------------------- */

interface PolicyLine {
  categoryId: string;
  amount: number;
  hasReceipt: boolean;
}

/**
 * Enforces the category rules that back the "policy validation" requirement:
 * the category must exist and be active, the line must respect the optional
 * per-category cap, and (once receipts are in play) a line above the category's
 * threshold must carry a receipt.
 */
export async function validatePolicy(lines: PolicyLine[], requireReceipts: boolean) {
  if (lines.length === 0) throw ApiError.badRequest('Add at least one expense line');

  const ids = [...new Set(lines.map((line) => line.categoryId))];
  const categories = await prisma.expenseCategory.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, active: true, maxAmount: true, receiptRequiredAbove: true },
  });
  const byId = new Map(categories.map((c) => [c.id, c]));

  lines.forEach((line, index) => {
    const label = `Line ${index + 1}`;
    const category = byId.get(line.categoryId);
    if (!category) throw ApiError.badRequest(`${label}: the selected category does not exist`);
    if (!category.active) throw ApiError.badRequest(`${label}: category "${category.name}" is no longer active`);

    const cap = category.maxAmount == null ? null : Number(category.maxAmount);
    if (cap != null && line.amount > cap) {
      throw ApiError.badRequest(
        `${label}: amount exceeds the ${category.name} limit of ${cap.toFixed(2)}`,
      );
    }

    const threshold =
      category.receiptRequiredAbove == null ? null : Number(category.receiptRequiredAbove);
    if (requireReceipts && threshold != null && line.amount > threshold && !line.hasReceipt) {
      throw ApiError.badRequest(
        `${label}: a receipt is required for ${category.name} above ${threshold.toFixed(2)}`,
      );
    }
  });
}

/* -------------------------------- Selects -------------------------------- */

const itemSelect = {
  id: true,
  claimId: true,
  categoryId: true,
  expenseDate: true,
  amount: true,
  description: true,
  paymentMode: true,
  receiptPath: true,
  receiptFilename: true,
  receiptMimeType: true,
  receiptSize: true,
  category: { select: { id: true, name: true, icon: true } },
} satisfies Prisma.ExpenseItemSelect;

const claimSelect = {
  id: true,
  code: true,
  title: true,
  description: true,
  currency: true,
  employeeId: true,
  status: true,
  totalAmount: true,
  submittedAt: true,
  decidedById: true,
  decidedAt: true,
  decisionNote: true,
  reimbursedById: true,
  reimbursedAt: true,
  reimbursementRef: true,
  paymentMode: true,
  createdAt: true,
  updatedAt: true,
  employee: { select: { id: true, firstName: true, lastName: true, email: true } },
  decidedBy: { select: { id: true, firstName: true, lastName: true } },
  reimbursedBy: { select: { id: true, firstName: true, lastName: true } },
  items: { select: itemSelect, orderBy: { expenseDate: 'asc' } },
} satisfies Prisma.ExpenseClaimSelect;

type ItemRow = Prisma.ExpenseItemGetPayload<{ select: typeof itemSelect }>;
type ClaimRow = Prisma.ExpenseClaimGetPayload<{ select: typeof claimSelect }>;

function toItemDto(row: ItemRow) {
  return {
    id: row.id,
    claimId: row.claimId,
    categoryId: row.categoryId,
    categoryName: row.category.name,
    categoryIcon: row.category.icon,
    expenseDate: iso(row.expenseDate),
    amount: toMoney(row.amount),
    description: row.description,
    paymentMode: row.paymentMode,
    hasReceipt: !!row.receiptPath,
    receiptFilename: row.receiptFilename,
    receiptMimeType: row.receiptMimeType,
    receiptSize: row.receiptSize,
  };
}

function toClaimDto(row: ClaimRow) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    currency: row.currency,
    employeeId: row.employeeId,
    employeeName: nameOf(row.employee),
    employeeEmail: row.employee.email,
    status: row.status,
    totalAmount: toMoney(row.totalAmount),
    itemCount: row.items.length,
    submittedAt: iso(row.submittedAt),
    decidedById: row.decidedById,
    decidedByName: nameOf(row.decidedBy),
    decidedAt: iso(row.decidedAt),
    decisionNote: row.decisionNote,
    reimbursedById: row.reimbursedById,
    reimbursedByName: nameOf(row.reimbursedBy),
    reimbursedAt: iso(row.reimbursedAt),
    reimbursementRef: row.reimbursementRef,
    paymentMode: row.paymentMode,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    items: row.items.map(toItemDto),
  };
}

/* ------------------------------- Categories ------------------------------ */

export async function listCategories(includeInactive: boolean) {
  const rows = await prisma.expenseCategory.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { name: 'asc' },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    icon: c.icon,
    maxAmount: c.maxAmount == null ? null : Number(c.maxAmount),
    receiptRequiredAbove: c.receiptRequiredAbove == null ? null : Number(c.receiptRequiredAbove),
    active: c.active,
  }));
}

export async function createCategory(input: CategoryInput) {
  const existing = await prisma.expenseCategory.findUnique({
    where: { name: input.name },
    select: { id: true },
  });
  if (existing) throw ApiError.badRequest('A category with this name already exists');

  const row = await prisma.expenseCategory.create({
    data: {
      name: input.name,
      description: input.description?.trim() || null,
      icon: input.icon?.trim() || null,
      maxAmount: input.maxAmount == null ? null : new Prisma.Decimal(input.maxAmount.toFixed(2)),
      receiptRequiredAbove:
        input.receiptRequiredAbove == null
          ? null
          : new Prisma.Decimal(input.receiptRequiredAbove.toFixed(2)),
    },
  });
  return { ...row, maxAmount: row.maxAmount == null ? null : Number(row.maxAmount) };
}

export async function updateCategory(id: string, input: UpdateCategoryInput) {
  const existing = await prisma.expenseCategory.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Category not found');

  if (input.name && input.name !== existing.name) {
    const dup = await prisma.expenseCategory.findUnique({ where: { name: input.name }, select: { id: true } });
    if (dup) throw ApiError.badRequest('A category with this name already exists');
  }

  const row = await prisma.expenseCategory.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description === undefined ? undefined : input.description?.trim() || null,
      icon: input.icon === undefined ? undefined : input.icon?.trim() || null,
      maxAmount:
        input.maxAmount === undefined
          ? undefined
          : input.maxAmount == null
            ? null
            : new Prisma.Decimal(input.maxAmount.toFixed(2)),
      receiptRequiredAbove:
        input.receiptRequiredAbove === undefined
          ? undefined
          : input.receiptRequiredAbove == null
            ? null
            : new Prisma.Decimal(input.receiptRequiredAbove.toFixed(2)),
      active: input.active,
    },
  });
  return { ...row, maxAmount: row.maxAmount == null ? null : Number(row.maxAmount) };
}

/* --------------------------------- Claims -------------------------------- */

function buildClaimWhere(
  userId: string,
  query: ListClaimsQuery,
  canManage: boolean,
): Prisma.ExpenseClaimWhereInput {
  const where: Prisma.ExpenseClaimWhereInput = {};

  if (!canManage) {
    where.employeeId = userId;
    if (query.status) where.status = query.status;
  } else {
    if (query.scope === 'mine') where.employeeId = userId;
    if (query.scope === 'approvals') where.status = 'SUBMITTED';
    if (query.status) where.status = query.status;
  }

  if (query.categoryId) where.items = { some: { categoryId: query.categoryId } };
  if (query.q) {
    where.OR = [
      { code: { contains: query.q, mode: 'insensitive' } },
      { title: { contains: query.q, mode: 'insensitive' } },
    ];
  }

  return where;
}

export async function listClaims(userId: string, query: ListClaimsQuery, canManage: boolean) {
  const { page, pageSize } = query;
  const where = buildClaimWhere(userId, query, canManage);

  const [total, rows] = await Promise.all([
    prisma.expenseClaim.count({ where }),
    prisma.expenseClaim.findMany({
      where,
      select: claimSelect,
      orderBy: [{ createdAt: 'desc' }],
      ...skipTake(page, pageSize),
    }),
  ]);

  return { claims: rows.map(toClaimDto), ...pageMeta(page, pageSize, total) };
}

export async function getClaim(id: string, userId: string, canManage: boolean) {
  const row = await prisma.expenseClaim.findUnique({ where: { id }, select: claimSelect });
  if (!row) throw ApiError.notFound('Expense claim not found');
  if (!canManage && row.employeeId !== userId) {
    throw ApiError.forbidden('You do not have access to this expense claim');
  }
  return toClaimDto(row);
}

/** Sequence for the human-readable claim number (`EXP-0001`). */
async function nextClaimCode(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "counters" ("key", "value") VALUES ('expense_claim_code', 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "counters"."value" + 1
    RETURNING "value"
  `;
  const value = Number(rows[0]?.value ?? 1);
  return `EXP-${String(value).padStart(4, '0')}`;
}

function itemCreateData(items: CreateClaimInput['items']) {
  return items.map((item) => ({
    categoryId: item.categoryId,
    expenseDate: item.expenseDate,
    amount: new Prisma.Decimal(item.amount.toFixed(2)),
    description: item.description?.trim() || null,
    paymentMode: item.paymentMode ?? ('OTHER' as const),
  }));
}

export async function createClaim(userId: string, input: CreateClaimInput) {
  await validatePolicy(
    input.items.map((item) => ({ categoryId: item.categoryId, amount: item.amount, hasReceipt: false })),
    false,
  );
  const total = input.items.reduce((sum, item) => sum + item.amount, 0);

  const row = await prisma.$transaction(async (tx) => {
    const code = await nextClaimCode(tx);
    return tx.expenseClaim.create({
      data: {
        code,
        title: input.title,
        description: input.description?.trim() || null,
        currency: input.currency ?? 'INR',
        employeeId: userId,
        status: 'DRAFT',
        totalAmount: new Prisma.Decimal(total.toFixed(2)),
        items: { create: itemCreateData(input.items) },
      },
      select: claimSelect,
    });
  });

  if (input.submit) return submitClaim(row.id, userId);
  return toClaimDto(row);
}

export async function updateClaim(id: string, userId: string, input: UpdateClaimInput) {
  const existing = await prisma.expenseClaim.findUnique({
    where: { id },
    select: { id: true, employeeId: true, status: true },
  });
  if (!existing) throw ApiError.notFound('Expense claim not found');
  if (existing.employeeId !== userId) {
    throw ApiError.forbidden('You can only edit your own expense claims');
  }
  if (existing.status !== 'DRAFT' && existing.status !== 'CLARIFICATION') {
    throw ApiError.badRequest('Only draft claims or claims awaiting clarification can be edited');
  }

  if (input.items) {
    await validatePolicy(
      input.items.map((item) => ({ categoryId: item.categoryId, amount: item.amount, hasReceipt: false })),
      false,
    );
  }
  const total = input.items?.reduce((sum, item) => sum + item.amount, 0);

  const row = await prisma.$transaction(async (tx) => {
    if (input.items) {
      await tx.expenseItem.deleteMany({ where: { claimId: id } });
      await tx.expenseItem.createMany({ data: itemCreateData(input.items).map((data) => ({ ...data, claimId: id })) });
    }
    return tx.expenseClaim.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description === undefined ? undefined : input.description?.trim() || null,
        currency: input.currency,
        totalAmount: total === undefined ? undefined : new Prisma.Decimal(total.toFixed(2)),
      },
      select: claimSelect,
    });
  });

  return toClaimDto(row);
}

export async function deleteClaim(id: string, userId: string) {
  const existing = await prisma.expenseClaim.findUnique({
    where: { id },
    select: { id: true, employeeId: true, status: true, items: { select: { receiptPath: true } } },
  });
  if (!existing) throw ApiError.notFound('Expense claim not found');
  if (existing.employeeId !== userId) {
    throw ApiError.forbidden('You can only delete your own expense claims');
  }
  if (existing.status !== 'DRAFT' && existing.status !== 'CLARIFICATION') {
    throw ApiError.badRequest('Only draft claims or claims awaiting clarification can be deleted');
  }

  await prisma.expenseClaim.delete({ where: { id } });
  await Promise.all(
    existing.items
      .map((item) => item.receiptPath)
      .filter((receiptPath): receiptPath is string => !!receiptPath)
      .map((receiptPath) => removeExpenseReceipt(receiptPath)),
  );
}

export async function submitClaim(id: string, userId: string) {
  const claim = await prisma.expenseClaim.findUnique({
    where: { id },
    select: {
      id: true,
      employeeId: true,
      status: true,
      items: { select: { categoryId: true, amount: true, receiptPath: true } },
    },
  });
  if (!claim) throw ApiError.notFound('Expense claim not found');
  if (claim.employeeId !== userId) {
    throw ApiError.forbidden('You can only submit your own expense claims');
  }
  if (claim.status !== 'DRAFT' && claim.status !== 'CLARIFICATION') {
    throw ApiError.badRequest('This claim is no longer editable and cannot be submitted');
  }
  if (claim.items.length === 0) {
    throw ApiError.badRequest('Add at least one expense line before submitting');
  }

  await validatePolicy(
    claim.items.map((item) => ({
      categoryId: item.categoryId,
      amount: Number(item.amount),
      hasReceipt: !!item.receiptPath,
    })),
    true,
  );

  const row = await prisma.expenseClaim.update({
    where: { id },
    data: {
      status: 'SUBMITTED',
      submittedAt: new Date(),
      decidedById: null,
      decidedAt: null,
      decisionNote: null,
    },
    select: claimSelect,
  });
  return toClaimDto(row);
}

export async function decideClaim(id: string, actorId: string, input: DecisionInput) {
  const claim = await prisma.expenseClaim.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!claim) throw ApiError.notFound('Expense claim not found');
  if (claim.status !== 'SUBMITTED') {
    throw ApiError.badRequest('Only submitted claims can be approved, rejected or queried');
  }

  const row = await prisma.expenseClaim.update({
    where: { id },
    data: {
      status: input.decision,
      decidedById: actorId,
      decidedAt: new Date(),
      decisionNote: input.note?.trim() || null,
      // A rejected/queried claim cannot keep a stale reimbursement record.
      reimbursedById: null,
      reimbursedAt: null,
      reimbursementRef: null,
      paymentMode: null,
    },
    select: claimSelect,
  });
  return toClaimDto(row);
}

export async function reimburseClaim(id: string, actorId: string, input: ReimburseInput) {
  const claim = await prisma.expenseClaim.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!claim) throw ApiError.notFound('Expense claim not found');
  if (claim.status !== 'APPROVED') {
    throw ApiError.badRequest('Only approved claims can be marked as reimbursed');
  }

  const row = await prisma.expenseClaim.update({
    where: { id },
    data: {
      status: 'REIMBURSED',
      reimbursedById: actorId,
      reimbursedAt: new Date(),
      reimbursementRef: input.reference?.trim() || null,
      paymentMode: input.paymentMode,
    },
    select: claimSelect,
  });
  return toClaimDto(row);
}

/* -------------------------------- Receipts ------------------------------- */

export async function attachReceipt(
  claimId: string,
  itemId: string,
  userId: string,
  file: Express.Multer.File,
  canManage: boolean,
) {
  const claim = await prisma.expenseClaim.findUnique({
    where: { id: claimId },
    select: { id: true, employeeId: true, status: true },
  });
  if (!claim) throw ApiError.notFound('Expense claim not found');
  if (!canManage && claim.employeeId !== userId) {
    throw ApiError.forbidden('You do not have access to this expense claim');
  }
  if (claim.status !== 'DRAFT' && claim.status !== 'CLARIFICATION') {
    throw ApiError.badRequest('Receipts can only be attached while a claim is a draft or awaiting clarification');
  }

  const item = await prisma.expenseItem.findUnique({
    where: { id: itemId },
    select: { id: true, claimId: true, receiptPath: true },
  });
  if (!item || item.claimId !== claimId) throw ApiError.notFound('Expense line not found');

  const stored = await storeExpenseReceipt(file.path, file.originalname);

  let row: ItemRow;
  try {
    row = await prisma.expenseItem.update({
      where: { id: itemId },
      data: {
        receiptPath: stored.storagePath,
        receiptFilename: file.originalname,
        receiptMimeType: file.mimetype,
        receiptSize: file.size,
      },
      select: itemSelect,
    });
  } catch (error) {
    // Roll the new file back so we don't leave an orphan behind.
    await removeExpenseReceipt(stored.storagePath);
    throw error;
  }

  if (item.receiptPath) await removeExpenseReceipt(item.receiptPath);
  return toItemDto(row);
}

export async function getReceiptForDownload(
  claimId: string,
  itemId: string,
  userId: string,
  canManage: boolean,
) {
  const item = await prisma.expenseItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      claimId: true,
      receiptPath: true,
      receiptFilename: true,
      receiptMimeType: true,
      claim: { select: { employeeId: true } },
    },
  });
  if (!item || item.claimId !== claimId) throw ApiError.notFound('Expense line not found');
  if (!item.receiptPath) throw ApiError.notFound('No receipt is attached to this line');
  if (!canManage && item.claim.employeeId !== userId) {
    throw ApiError.forbidden('You do not have access to this receipt');
  }

  return {
    absolutePath: resolveExpensePath(item.receiptPath),
    filename: item.receiptFilename ?? path.basename(item.receiptPath),
    mimeType: item.receiptMimeType ?? 'application/octet-stream',
  };
}

/* --------------------------------- Stats --------------------------------- */

export async function getStats(userId: string, canManage: boolean) {
  const visibleWhere: Prisma.ExpenseClaimWhereInput = canManage ? {} : { employeeId: userId };

  const grouped = await prisma.expenseClaim.groupBy({
    by: ['status'],
    where: visibleWhere,
    _count: true,
    _sum: { totalAmount: true },
  });

  const statusCounts = Object.fromEntries(REPORTABLE_STATUSES.concat('DRAFT').map((s) => [s, 0])) as Record<
    string,
    number
  >;
  let claimedAmount = 0;
  let reimbursedAmount = 0;
  for (const group of grouped) {
    statusCounts[group.status] = group._count;
    claimedAmount += toMoney(group._sum.totalAmount);
    if (group.status === 'REIMBURSED') reimbursedAmount += toMoney(group._sum.totalAmount);
  }

  return {
    total: Object.values(statusCounts).reduce((sum, n) => sum + n, 0),
    byStatus: statusCounts,
    claimedAmount,
    reimbursedAmount,
    pendingApprovals: statusCounts.SUBMITTED ?? 0,
    pendingReimbursement: statusCounts.APPROVED ?? 0,
  };
}

export async function listReportEmployees() {
  const rows = await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  return rows.map((u) => ({ id: u.id, name: nameOf(u), email: u.email }));
}

/* -------------------------------- Reports -------------------------------- */

function buildReportWhere(
  userId: string,
  query: ReportQuery,
  canManage: boolean,
): Prisma.ExpenseClaimWhereInput {
  const where: Prisma.ExpenseClaimWhereInput = {};

  if (!canManage) where.employeeId = userId;
  else if (query.employeeId) where.employeeId = query.employeeId;

  where.status = query.status ?? { not: 'DRAFT' };

  if (query.categoryId) where.items = { some: { categoryId: query.categoryId } };

  if (query.from || query.to) {
    const range: Prisma.DateTimeNullableFilter = {};
    if (query.from) range.gte = query.from;
    if (query.to) {
      const end = new Date(query.to);
      end.setHours(23, 59, 59, 999);
      range.lte = end;
    }
    where.submittedAt = range;
  }

  return where;
}

async function buildReportSummary(where: Prisma.ExpenseClaimWhereInput, totalClaims: number) {
  const [grouped, categoryGroups] = await Promise.all([
    prisma.expenseClaim.groupBy({ by: ['status'], where, _count: true, _sum: { totalAmount: true } }),
    prisma.expenseItem.groupBy({
      by: ['categoryId'],
      where: { claim: where },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  const statusCounts = Object.fromEntries(REPORTABLE_STATUSES.map((s) => [s, 0])) as Record<string, number>;
  let claimedAmount = 0;
  let approvedAmount = 0;
  let reimbursedAmount = 0;
  for (const group of grouped) {
    statusCounts[group.status] = group._count;
    const amount = toMoney(group._sum.totalAmount);
    claimedAmount += amount;
    if (group.status === 'APPROVED') approvedAmount += amount;
    if (group.status === 'REIMBURSED') {
      approvedAmount += amount;
      reimbursedAmount += amount;
    }
  }

  const categoryIds = categoryGroups.map((group) => group.categoryId);
  const categories = categoryIds.length
    ? await prisma.expenseCategory.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(categories.map((c) => [c.id, c.name]));

  const byCategory = categoryGroups
    .map((group) => ({
      categoryId: group.categoryId,
      categoryName: nameById.get(group.categoryId) ?? 'Uncategorised',
      count: group._count,
      amount: toMoney(group._sum.amount),
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    totalClaims,
    claimedAmount,
    approvedAmount,
    reimbursedAmount,
    pendingApprovals: statusCounts.SUBMITTED ?? 0,
    byStatus: statusCounts,
    byCategory,
  };
}

export async function getReport(userId: string, query: ReportQuery, canManage: boolean) {
  const { page, pageSize } = query;
  const where = buildReportWhere(userId, query, canManage);

  const [total, rows, summary] = await Promise.all([
    prisma.expenseClaim.count({ where }),
    prisma.expenseClaim.findMany({
      where,
      select: claimSelect,
      orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
      ...skipTake(page, pageSize),
    }),
    buildReportSummary(where, 0),
  ]);

  return {
    claims: rows.map(toClaimDto),
    ...pageMeta(page, pageSize, total),
    summary: { ...summary, totalClaims: total },
  };
}

/** Full CSV export of the report rows (no pagination applied). */
export async function exportReportCsv(userId: string, query: ReportQuery, canManage: boolean) {
  const where = buildReportWhere(userId, query, canManage);
  const rows = await prisma.expenseClaim.findMany({
    where,
    select: claimSelect,
    orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
  });

  const header = [
    'Claim Code',
    'Employee',
    'Title',
    'Status',
    'Lines',
    'Amount',
    'Currency',
    'Submitted',
    'Decided',
    'Decided By',
    'Reimbursed',
    'Payment Mode',
  ];

  const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

  const lines = rows.map((row) =>
    [
      row.code,
      nameOf(row.employee) ?? '',
      row.title,
      row.status,
      String(row.items.length),
      toMoney(row.totalAmount).toFixed(2),
      row.currency,
      iso(row.submittedAt) ?? '',
      iso(row.decidedAt) ?? '',
      nameOf(row.decidedBy) ?? '',
      iso(row.reimbursedAt) ?? '',
      row.paymentMode ?? '',
    ]
      .map((cell) => escape(String(cell)))
      .join(','),
  );

  return [header.join(','), ...lines].join('\n');
}
