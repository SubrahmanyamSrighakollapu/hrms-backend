import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import type { CreateDepartmentInput, UpdateDepartmentInput } from './organization.validation';

export async function listDepartments() {
  const departments = await prisma.department.findMany({
    include: { _count: { select: { users: true } } },
    orderBy: { name: 'asc' },
  });

  return departments.map((department) => ({
    id: department.id,
    name: department.name,
    code: department.code,
    description: department.description,
    employeeCount: department._count.users,
    createdAt: department.createdAt.toISOString(),
    updatedAt: department.updatedAt.toISOString(),
  }));
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export async function createDepartment(input: CreateDepartmentInput) {
  try {
    const department = await prisma.department.create({
      data: {
        name: input.name,
        code: input.code?.trim() || null,
        description: input.description?.trim() || null,
      },
    });
    return department;
  } catch (error) {
    if (isUniqueViolation(error)) throw ApiError.conflict('A department with this name or code already exists');
    throw error;
  }
}

export async function updateDepartment(id: string, input: UpdateDepartmentInput) {
  const existing = await prisma.department.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('Department not found');

  try {
    return await prisma.department.update({
      where: { id },
      data: {
        name: input.name,
        code: input.code === undefined ? undefined : input.code?.trim() || null,
        description: input.description === undefined ? undefined : input.description?.trim() || null,
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
    include: { _count: { select: { users: true } } },
  });
  if (!department) throw ApiError.notFound('Department not found');
  if (department._count.users > 0) {
    throw ApiError.conflict('Move employees to another department before deleting this department');
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
