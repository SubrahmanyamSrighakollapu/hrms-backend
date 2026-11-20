import { Prisma } from '@prisma/client';
import {
  emptyPermissions,
  toPermissionMap,
  toPermissionRows,
  type PermissionLevel,
} from '../../config/modules';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import type { AssignRoleInput, CreateRoleInput, UpdateRoleInput } from './roles.validation';

/** Built-in role that catches employees whose role is deleted. */
const FALLBACK_ROLE_KEY = 'EMPLOYEE';

type RoleWithRelations = {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  permissions: { module: string; level: PermissionLevel }[];
  _count: { users: number };
};

const roleInclude = {
  permissions: { select: { module: true, level: true } },
  _count: { select: { users: true } },
} satisfies Prisma.RoleInclude;

export interface RoleDto {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Record<string, PermissionLevel>;
  userCount: number;
  createdAt: string;
}

export interface AssignmentDto {
  id: string;
  name: string;
  email: string;
  dept: string;
  title: string;
  status: string;
  joinedAt: string | null;
  roleId: string | null;
}

function toRoleDto(role: RoleWithRelations): RoleDto {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: toPermissionMap(role.permissions),
    userCount: role._count?.users ?? 0,
    createdAt: role.createdAt.toISOString(),
  };
}

/**
 * Keep only known modules and drop NONE entries so the persisted rows are the
 * exact grants the role holds.
 */
function normalize(permissions: Record<string, PermissionLevel> | undefined) {
  return toPermissionRows(permissions ?? emptyPermissions());
}

export async function listRoles(): Promise<RoleDto[]> {
  const roles = await prisma.role.findMany({
    include: roleInclude,
    orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
  });
  return roles.map(toRoleDto);
}

export async function getRole(id: string): Promise<RoleDto> {
  const role = await prisma.role.findUnique({ where: { id }, include: roleInclude });
  if (!role) {
    throw ApiError.notFound('Role not found');
  }
  return toRoleDto(role);
}

export async function createRole(input: CreateRoleInput): Promise<RoleDto> {
  const existing = await prisma.role.findUnique({ where: { name: input.name } });
  if (existing) {
    throw ApiError.conflict(`A role named "${input.name}" already exists`);
  }

  const role = await prisma.role.create({
    data: {
      name: input.name,
      description: input.description?.trim() || null,
      isSystem: false,
      permissions: { create: normalize(input.permissions) },
    },
    include: roleInclude,
  });

  return toRoleDto(role);
}

export async function updateRole(id: string, input: UpdateRoleInput): Promise<RoleDto> {
  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) {
    throw ApiError.notFound('Role not found');
  }

  if (input.name && input.name !== role.name) {
    if (role.isSystem) {
      throw ApiError.badRequest('System roles cannot be renamed');
    }
    const clash = await prisma.role.findUnique({ where: { name: input.name } });
    if (clash) {
      throw ApiError.conflict(`A role named "${input.name}" already exists`);
    }
  }

  const rows = input.permissions ? normalize(input.permissions) : null;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.role.update({
      where: { id },
      data: {
        name: input.name ?? undefined,
        description:
          input.description !== undefined ? input.description.trim() || null : undefined,
      },
    });

    // Permissions are replaced wholesale so removed grants disappear.
    if (rows) {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (rows.length > 0) {
        await tx.rolePermission.createMany({
          data: rows.map((row) => ({ roleId: id, module: row.module, level: row.level })),
        });
      }
    }

    return tx.role.findUniqueOrThrow({ where: { id }, include: roleInclude });
  });

  return toRoleDto(updated);
}

export async function deleteRole(id: string): Promise<{ id: string; reassigned: number }> {
  const role = await prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
  if (!role) {
    throw ApiError.notFound('Role not found');
  }
  if (role.isSystem) {
    throw ApiError.badRequest('System roles cannot be deleted');
  }

  const fallback = await prisma.role.findUnique({ where: { key: FALLBACK_ROLE_KEY } });

  const reassigned = await prisma.$transaction(async (tx) => {
    const moved = await tx.user.updateMany({
      where: { roleId: id },
      data: { roleId: fallback?.id ?? null },
    });
    await tx.role.delete({ where: { id } });
    return moved.count;
  });

  return { id, reassigned };
}

/** Human-readable status used by the employees/roles tables. */
export function statusLabel(status: string): string {
  if (status === 'ACTIVE') return 'Active';
  if (status === 'SUSPENDED') return 'Suspended';
  return 'Inactive';
}

/** Columns every assignment row exposes. */
const assignmentSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  department: { select: { name: true } },
  designation: true,
  status: true,
  joinedAt: true,
  roleId: true,
} satisfies Prisma.UserSelect;

type AssignmentRow = Prisma.UserGetPayload<{ select: typeof assignmentSelect }>;

function toAssignmentDto(user: AssignmentRow): AssignmentDto {
  return {
    id: user.id,
    name: `${user.firstName} ${user.lastName}`.trim(),
    email: user.email,
    dept: user.department?.name ?? '—',
    title: user.designation ?? '—',
    status: statusLabel(user.status),
    joinedAt: user.joinedAt ? user.joinedAt.toISOString() : null,
    roleId: user.roleId,
  };
}

export async function listAssignments(): Promise<AssignmentDto[]> {
  const users = await prisma.user.findMany({
    select: assignmentSelect,
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });

  return users.map(toAssignmentDto);
}

export async function assignRole(userId: string, input: AssignRoleInput): Promise<AssignmentDto> {
  const [user, role] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
    prisma.role.findUnique({ where: { id: input.roleId }, select: { id: true } }),
  ]);

  if (!user) {
    throw ApiError.notFound('Employee not found');
  }
  if (!role) {
    throw ApiError.badRequest('The selected role does not exist');
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { roleId: role.id },
    select: assignmentSelect,
  });

  return toAssignmentDto(updated);
}
