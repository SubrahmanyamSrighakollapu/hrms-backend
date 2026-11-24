import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import type {
  CreateDepartmentInput,
  CreateLocationInput,
  CreateSubLocationInput,
  ListSubLocationsQuery,
  UpdateDepartmentInput,
  UpdateLocationInput,
  UpdateSubLocationInput,
} from './organization.validation';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

/* ============================== Departments ============================== */

export async function listDepartments() {
  const departments = await prisma.department.findMany({
    include: {
      _count: { select: { users: true, children: true } },
      head: { select: { firstName: true, lastName: true } },
      location: { select: { name: true } },
      parent: { select: { name: true } },
    },
    orderBy: [{ name: 'asc' }],
  });

  return departments.map((d) => ({
    id: d.id,
    name: d.name,
    code: d.code,
    description: d.description,
    status: d.status,
    headId: d.headId,
    headName: d.head ? `${d.head.firstName} ${d.head.lastName}`.trim() : null,
    parentId: d.parentId,
    parentName: d.parent?.name ?? null,
    locationId: d.locationId,
    locationName: d.location?.name ?? null,
    employeeCount: d._count.users,
    childCount: d._count.children,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
  }));
}

/** Walk up the parent chain to detect a cycle when `candidateParentId` is set on `departmentId`. */
async function wouldCreateCycle(departmentId: string, candidateParentId: string): Promise<boolean> {
  if (candidateParentId === departmentId) return true;
  const visited = new Set<string>([departmentId]);
  let cursor: string | null = candidateParentId;
  while (cursor) {
    if (visited.has(cursor)) return true;
    visited.add(cursor);
    const row: { parentId: string | null } | null = await prisma.department.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = row?.parentId ?? null;
  }
  return false;
}

async function validateDepartmentRefs(input: {
  headId?: string | null;
  parentId?: string | null;
  locationId?: string | null;
  selfId?: string;
}) {
  if (input.parentId && input.selfId && input.parentId === input.selfId) {
    throw ApiError.badRequest('A department cannot be its own parent');
  }
  if (input.parentId) {
    const parent = await prisma.department.findUnique({
      where: { id: input.parentId },
      select: { id: true },
    });
    if (!parent) throw ApiError.badRequest('The selected parent department does not exist');
    if (input.selfId && (await wouldCreateCycle(input.selfId, input.parentId))) {
      throw ApiError.badRequest('This change would create a department hierarchy cycle');
    }
  }
  if (input.headId) {
    const head = await prisma.user.findUnique({ where: { id: input.headId }, select: { id: true } });
    if (!head) throw ApiError.badRequest('The selected department head does not exist');
  }
  if (input.locationId) {
    const location = await prisma.location.findUnique({
      where: { id: input.locationId },
      select: { id: true },
    });
    if (!location) throw ApiError.badRequest('The selected location does not exist');
  }
}

export async function createDepartment(input: CreateDepartmentInput) {
  await validateDepartmentRefs(input);
  try {
    return await prisma.department.create({
      data: {
        name: input.name,
        code: input.code?.trim() || null,
        description: input.description?.trim() || null,
        headId: input.headId ?? null,
        parentId: input.parentId ?? null,
        locationId: input.locationId ?? null,
        status: input.status ?? 'ACTIVE',
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw ApiError.conflict('A department with this name or code already exists');
    throw error;
  }
}

export async function updateDepartment(id: string, input: UpdateDepartmentInput) {
  const existing = await prisma.department.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('Department not found');

  await validateDepartmentRefs({ ...input, selfId: id });

  try {
    return await prisma.department.update({
      where: { id },
      data: {
        name: input.name,
        code: input.code === undefined ? undefined : input.code?.trim() || null,
        description:
          input.description === undefined ? undefined : input.description?.trim() || null,
        headId: input.headId === undefined ? undefined : input.headId ?? null,
        parentId: input.parentId === undefined ? undefined : input.parentId ?? null,
        locationId: input.locationId === undefined ? undefined : input.locationId ?? null,
        status: input.status,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw ApiError.conflict('A department with this name or code already exists');
    throw error;
  }
}

export async function deleteDepartment(id: string) {
  const department = await prisma.department.findUnique({
    where: { id },
    include: { _count: { select: { users: true, children: true } } },
  });
  if (!department) throw ApiError.notFound('Department not found');
  if (department._count.users > 0) {
    throw ApiError.conflict('Move employees to another department before deleting this department');
  }
  if (department._count.children > 0) {
    throw ApiError.conflict('Reassign or delete sub-departments before deleting this department');
  }
  await prisma.department.delete({ where: { id } });
  return { id };
}

export async function getHierarchy() {
  const employees = await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      email: true,
      designation: true,
      departmentId: true,
      department: { select: { name: true } },
      managerId: true,
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });

  return employees.map((employee) => ({
    id: employee.id,
    employeeCode: employee.employeeCode,
    name: `${employee.firstName} ${employee.lastName}`.trim(),
    email: employee.email,
    designation: employee.designation,
    departmentId: employee.departmentId,
    department: employee.department?.name ?? null,
    managerId: employee.managerId,
  }));
}

/* ================================ Locations =============================== */

export async function listLocations() {
  const locations = await prisma.location.findMany({
    include: {
      _count: { select: { users: true, departments: true, subLocations: true } },
    },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });

  return locations.map((l) => ({
    id: l.id,
    name: l.name,
    code: l.code,
    addressLine1: l.addressLine1,
    addressLine2: l.addressLine2,
    city: l.city,
    state: l.state,
    country: l.country,
    postalCode: l.postalCode,
    timezone: l.timezone,
    workStart: l.workStart,
    workEnd: l.workEnd,
    isDefault: l.isDefault,
    status: l.status,
    employeeCount: l._count.users,
    departmentCount: l._count.departments,
    subLocationCount: l._count.subLocations,
    createdAt: iso(l.createdAt),
    updatedAt: iso(l.updatedAt),
  }));
}

export async function createLocation(input: CreateLocationInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.location.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      }
      return tx.location.create({
        data: {
          name: input.name,
          code: input.code?.trim() || null,
          addressLine1: input.addressLine1?.trim() || null,
          addressLine2: input.addressLine2?.trim() || null,
          city: input.city?.trim() || null,
          state: input.state?.trim() || null,
          country: input.country?.trim() || null,
          postalCode: input.postalCode?.trim() || null,
          timezone: input.timezone ?? 'Asia/Kolkata',
          workStart: input.workStart ?? null,
          workEnd: input.workEnd ?? null,
          isDefault: input.isDefault ?? false,
          status: input.status ?? 'ACTIVE',
        },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw ApiError.conflict('A location with this name or code already exists');
    throw error;
  }
}

export async function updateLocation(id: string, input: UpdateLocationInput) {
  const existing = await prisma.location.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('Location not found');

  try {
    return await prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.location.updateMany({ where: { isDefault: true, NOT: { id } }, data: { isDefault: false } });
      }
      return tx.location.update({
        where: { id },
        data: {
          name: input.name,
          code: input.code === undefined ? undefined : input.code?.trim() || null,
          addressLine1:
            input.addressLine1 === undefined ? undefined : input.addressLine1?.trim() || null,
          addressLine2:
            input.addressLine2 === undefined ? undefined : input.addressLine2?.trim() || null,
          city: input.city === undefined ? undefined : input.city?.trim() || null,
          state: input.state === undefined ? undefined : input.state?.trim() || null,
          country: input.country === undefined ? undefined : input.country?.trim() || null,
          postalCode: input.postalCode === undefined ? undefined : input.postalCode?.trim() || null,
          timezone: input.timezone,
          workStart: input.workStart,
          workEnd: input.workEnd,
          isDefault: input.isDefault,
          status: input.status,
        },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw ApiError.conflict('A location with this name or code already exists');
    throw error;
  }
}

export async function deleteLocation(id: string) {
  const location = await prisma.location.findUnique({
    where: { id },
    include: { _count: { select: { users: true, departments: true } } },
  });
  if (!location) throw ApiError.notFound('Location not found');
  if (location._count.users > 0 || location._count.departments > 0) {
    throw ApiError.conflict('Move employees and departments away before deleting this location');
  }
  await prisma.location.delete({ where: { id } });
  return { id };
}

/* ============================== Sub-locations ============================= */

export async function listSubLocations(query: ListSubLocationsQuery) {
  const where = query.locationId ? { locationId: query.locationId } : {};
  const subLocations = await prisma.subLocation.findMany({
    where,
    include: { location: { select: { name: true } } },
    orderBy: [{ name: 'asc' }],
  });

  return subLocations.map((s) => ({
    id: s.id,
    locationId: s.locationId,
    locationName: s.location.name,
    name: s.name,
    type: s.type,
    code: s.code,
    status: s.status,
    createdAt: iso(s.createdAt),
    updatedAt: iso(s.updatedAt),
  }));
}

export async function createSubLocation(input: CreateSubLocationInput) {
  const location = await prisma.location.findUnique({
    where: { id: input.locationId },
    select: { id: true },
  });
  if (!location) throw ApiError.badRequest('The selected location does not exist');

  return prisma.subLocation.create({
    data: {
      locationId: input.locationId,
      name: input.name,
      type: input.type ?? 'OTHER',
      code: input.code?.trim() || null,
      status: input.status ?? 'ACTIVE',
    },
  });
}

export async function updateSubLocation(id: string, input: UpdateSubLocationInput) {
  const existing = await prisma.subLocation.findUnique({ where: { id }, select: { id: true, locationId: true } });
  if (!existing) throw ApiError.notFound('Sub-location not found');

  if (input.locationId && input.locationId !== existing.locationId) {
    const location = await prisma.location.findUnique({
      where: { id: input.locationId },
      select: { id: true },
    });
    if (!location) throw ApiError.badRequest('The selected location does not exist');
  }

  return prisma.subLocation.update({
    where: { id },
    data: {
      name: input.name,
      type: input.type,
      code: input.code === undefined ? undefined : input.code?.trim() || null,
      status: input.status,
      locationId: input.locationId,
    },
  });
}

export async function deleteSubLocation(id: string) {
  const subLocation = await prisma.subLocation.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });
  if (!subLocation) throw ApiError.notFound('Sub-location not found');
  if (subLocation._count.users > 0) {
    throw ApiError.conflict('Move employees away before deleting this sub-location');
  }
  await prisma.subLocation.delete({ where: { id } });
  return { id };
}
