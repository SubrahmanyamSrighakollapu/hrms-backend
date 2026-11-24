import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import { removePolicyFile, resolvePolicyPath, storePolicyDocument } from './policy.storage';
import type { CreatePolicyInput, ListPoliciesQuery, UpdatePolicyInput } from './policy.validation';

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

function mapPolicy(p: {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  documentPath: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  status: string;
  effectiveDate: Date | null;
  version: number;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: { firstName: string; lastName: string } | null;
  _count?: { acknowledgments: number };
}) {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    category: p.category,
    documentPath: p.documentPath,
    originalFilename: p.originalFilename,
    mimeType: p.mimeType,
    fileSize: p.fileSize,
    status: p.status,
    effectiveDate: iso(p.effectiveDate),
    version: p.version,
    createdById: p.createdById,
    createdByName: p.createdBy ? `${p.createdBy.firstName} ${p.createdBy.lastName}`.trim() : null,
    acknowledgmentCount: p._count?.acknowledgments ?? 0,
    createdAt: iso(p.createdAt),
    updatedAt: iso(p.updatedAt),
  };
}

/* =============================== List =============================== */

export async function listPolicies(
  actorId: string,
  isManage: boolean,
  query: ListPoliciesQuery,
) {
  const where: Record<string, unknown> = {};
  if (isManage) {
    if (query.status) where.status = query.status;
  } else {
    where.status = 'PUBLISHED';
  }
  if (query.category) where.category = query.category;

  const policies = await prisma.policy.findMany({
    where,
    include: {
      createdBy: { select: { firstName: true, lastName: true } },
      _count: { select: { acknowledgments: true } },
    },
    orderBy: [{ updatedAt: 'desc' }],
  });

  if (isManage) {
    return policies.map(mapPolicy);
  }

  // For employees, attach their own acknowledgment status.
  const ackedIds = new Set(
    (
      await prisma.policyAcknowledgment.findMany({
        where: { userId: actorId, policyId: { in: policies.map((p) => p.id) } },
        select: { policyId: true },
      })
    ).map((a) => a.policyId),
  );

  return policies.map((p) => ({
    ...mapPolicy(p),
    acknowledged: ackedIds.has(p.id),
  }));
}

/* ================================ Get ================================ */

export async function getPolicy(id: string, actorId: string, isManage: boolean) {
  const policy = await prisma.policy.findUnique({
    where: { id },
    include: {
      createdBy: { select: { firstName: true, lastName: true } },
      _count: { select: { acknowledgments: true } },
    },
  });
  if (!policy) throw ApiError.notFound('Policy not found');
  if (!isManage && policy.status !== 'PUBLISHED') {
    throw ApiError.notFound('Policy not found');
  }

  const data = mapPolicy(policy);
  if (isManage) return data;

  const ack = await prisma.policyAcknowledgment.findUnique({
    where: { policyId_userId: { policyId: id, userId: actorId } },
    select: { acknowledgedAt: true },
  });
  return { ...data, acknowledged: !!ack, acknowledgedAt: ack ? iso(ack.acknowledgedAt) : null };
}

/* ============================== Create ============================== */

export async function createPolicy(
  actorId: string,
  input: CreatePolicyInput,
  file: Express.Multer.File | undefined,
) {
  if (!file) throw ApiError.badRequest('A policy document is required');

  const stored = await storePolicyDocument(file.path, file.originalname);
  try {
    const effectiveDate = input.effectiveDate ? new Date(input.effectiveDate) : null;
    const policy = await prisma.policy.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        category: input.category ?? null,
        documentPath: stored.storagePath,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        status: input.status ?? 'DRAFT',
        effectiveDate,
        version: 1,
        createdById: actorId,
      },
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        _count: { select: { acknowledgments: true } },
      },
    });
    return mapPolicy(policy);
  } catch (error) {
    await removePolicyFile(stored.storagePath);
    throw error;
  }
}

/* ============================== Update ============================== */

export async function updatePolicy(
  id: string,
  input: UpdatePolicyInput,
  file: Express.Multer.File | undefined,
) {
  const existing = await prisma.policy.findUnique({
    where: { id },
    select: { id: true, documentPath: true, version: true },
  });
  if (!existing) throw ApiError.notFound('Policy not found');

  let newDocumentPath: string | undefined;
  let newOriginalFilename: string | undefined;
  let newMimeType: string | undefined;
  let newFileSize: number | undefined;

  if (file) {
    const stored = await storePolicyDocument(file.path, file.originalname);
    newDocumentPath = stored.storagePath;
    newOriginalFilename = file.originalname;
    newMimeType = file.mimetype;
    newFileSize = file.size;
  }

  let effectiveDate: Date | null | undefined;
  if (input.effectiveDate !== undefined) {
    effectiveDate = input.effectiveDate ? new Date(input.effectiveDate) : null;
  }

  try {
    const policy = await prisma.policy.update({
      where: { id },
      data: {
        title: input.title,
        description:
          input.description === undefined ? undefined : input.description ?? null,
        category: input.category === undefined ? undefined : input.category ?? null,
        documentPath: newDocumentPath,
        originalFilename: newOriginalFilename,
        mimeType: newMimeType,
        fileSize: newFileSize,
        status: input.status,
        effectiveDate,
        version: file ? existing.version + 1 : undefined,
      },
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        _count: { select: { acknowledgments: true } },
      },
    });
    if (file) await removePolicyFile(existing.documentPath);
    return mapPolicy(policy);
  } catch (error) {
    if (newDocumentPath) await removePolicyFile(newDocumentPath);
    throw error;
  }
}

/* ============================== Delete ============================== */

export async function deletePolicy(id: string) {
  const existing = await prisma.policy.findUnique({
    where: { id },
    select: { id: true, documentPath: true },
  });
  if (!existing) throw ApiError.notFound('Policy not found');
  await prisma.policy.delete({ where: { id } });
  await removePolicyFile(existing.documentPath);
  return { id };
}

/* ============================== Publish ============================= */

export async function publishPolicy(id: string) {
  const existing = await prisma.policy.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('Policy not found');
  const policy = await prisma.policy.update({
    where: { id },
    data: { status: 'PUBLISHED' },
    include: {
      createdBy: { select: { firstName: true, lastName: true } },
      _count: { select: { acknowledgments: true } },
    },
  });
  return mapPolicy(policy);
}

/* ============================= Download ============================ */

export async function downloadPolicy(id: string, isManage: boolean) {
  const policy = await prisma.policy.findUnique({
    where: { id },
    select: { id: true, status: true, documentPath: true, originalFilename: true, mimeType: true },
  });
  if (!policy) throw ApiError.notFound('Policy not found');
  if (!isManage && policy.status !== 'PUBLISHED') {
    throw ApiError.notFound('Policy not found');
  }
  return {
    absolutePath: resolvePolicyPath(policy.documentPath),
    filename: policy.originalFilename,
    mimeType: policy.mimeType,
  };
}

/* =========================== Acknowledge =========================== */

export async function acknowledgePolicy(policyId: string, userId: string) {
  const policy = await prisma.policy.findUnique({
    where: { id: policyId },
    select: { id: true, status: true },
  });
  if (!policy) throw ApiError.notFound('Policy not found');
  if (policy.status !== 'PUBLISHED') {
    throw ApiError.badRequest('Only published policies can be acknowledged');
  }

  const ack = await prisma.policyAcknowledgment.upsert({
    where: { policyId_userId: { policyId, userId } },
    update: { acknowledgedAt: new Date() },
    create: { policyId, userId },
    select: { id: true, acknowledgedAt: true },
  });

  return {
    id: ack.id,
    policyId,
    userId,
    acknowledgedAt: iso(ack.acknowledgedAt),
  };
}

/* ========================== Team acks ========================== */

export async function getTeamAcknowledgments(managerId: string, policyId?: string) {
  const reports = await prisma.user.findMany({
    where: { managerId, status: 'ACTIVE' },
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  if (reports.length === 0) {
    return { reports: [] as unknown[], acknowledgments: [] };
  }

  const reportIds = reports.map((r) => r.id);
  const where: Record<string, unknown> = { userId: { in: reportIds } };
  if (policyId) where.policyId = policyId;

  const acknowledgments = await prisma.policyAcknowledgment.findMany({
    where,
    include: {
      policy: { select: { id: true, title: true } },
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: [{ acknowledgedAt: 'desc' }],
  });

  return {
    reports: reports.map((r) => ({
      id: r.id,
      name: `${r.firstName} ${r.lastName}`.trim(),
      email: r.email,
    })),
    acknowledgments: acknowledgments.map((a) => ({
      id: a.id,
      policyId: a.policyId,
      policyTitle: a.policy.title,
      employee: {
        id: a.user.id,
        name: `${a.user.firstName} ${a.user.lastName}`.trim(),
        email: a.user.email,
      },
      acknowledgedAt: iso(a.acknowledgedAt),
    })),
  };
}
