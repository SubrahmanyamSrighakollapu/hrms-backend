import { PrismaClient, type PermissionLevel, type TimeOffRequestType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { emptyPermissions, grantAll, toPermissionRows } from '../src/config/modules';

const prisma = new PrismaClient();

const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 10);

/* ---------------- system roles ---------------- */

interface RoleSeed {
  key: string;
  name: string;
  description: string;
  permissions: Record<string, PermissionLevel>;
}

const SYSTEM_ROLES: RoleSeed[] = [
  {
    key: 'ADMIN',
    name: 'Administrator',
    description: 'Unrestricted access to every module and setting.',
    permissions: grantAll('MANAGE'),
  },
  {
    key: 'HR',
    name: 'HR Manager',
    description: 'Owns people operations — employees, attendance, payroll and approvals.',
    permissions: {
      ...emptyPermissions(),
      dashboard: 'MANAGE',
      'my-info': 'MANAGE',
      'time-off': 'MANAGE',
      attendance: 'MANAGE',
      payroll: 'MANAGE',
      chat: 'MANAGE',
      holidays: 'MANAGE',
      policies: 'MANAGE',
      'desk-management': 'MANAGE',
      calendars: 'VIEW',
      events: 'MANAGE',
      'it-support': 'MANAGE',
      'hr-helpdesk': 'MANAGE',
      expenses: 'MANAGE',
      employees: 'MANAGE',
      reports: 'VIEW',
      organization: 'VIEW',
      roles: 'VIEW',
    },
  },
  {
    key: 'EMPLOYEE',
    name: 'Employee',
    description: 'Self-service access to own records, requests and payslips.',
    permissions: {
      ...emptyPermissions(),
      dashboard: 'VIEW',
      'my-info': 'MANAGE',
      'time-off': 'VIEW',
      attendance: 'VIEW',
      payroll: 'VIEW',
      chat: 'VIEW',
      holidays: 'VIEW',
      policies: 'VIEW',
      'desk-management': 'VIEW',
      calendars: 'VIEW',
      events: 'VIEW',
      'it-support': 'VIEW',
      'hr-helpdesk': 'VIEW',
      expenses: 'VIEW',
    },
  },
];

async function upsertRole(def: RoleSeed) {
  const role = await prisma.role.upsert({
    where: { key: def.key },
    update: { name: def.name, description: def.description, isSystem: true },
    create: { key: def.key, name: def.name, description: def.description, isSystem: true },
  });

  // Permissions are re-synced so re-running the seed reflects the definitions.
  const rows = toPermissionRows(def.permissions);
  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  if (rows.length > 0) {
    await prisma.rolePermission.createMany({
      data: rows.map((row) => ({ roleId: role.id, module: row.module, level: row.level })),
    });
  }

  console.log(`  - role ${def.key.padEnd(8)} ${role.name} (${rows.length} module grants)`);
  return role;
}

/* ---------------- departments ---------------- */

interface DepartmentSeed {
  code: string;
  name: string;
  description: string;
}

const DEPARTMENTS: DepartmentSeed[] = [
  { code: 'HR', name: 'Human Resources', description: 'People operations and hiring' },
  { code: 'ENG', name: 'Engineering', description: 'Product engineering and platform' },
  { code: 'FIN', name: 'Finance', description: 'Accounts, payroll and compliance' },
  { code: 'SAL', name: 'Sales', description: 'Revenue and account management' },
  { code: 'MKT', name: 'Marketing', description: 'Brand, growth and demand' },
  { code: 'OPS', name: 'Operations', description: 'Day-to-day business operations' },
  { code: 'ADM', name: 'Administration', description: 'Facilities and workplace' },
];

async function upsertDepartment(def: DepartmentSeed) {
  const department = await prisma.department.upsert({
    where: { name: def.name },
    update: { code: def.code, description: def.description },
    create: { code: def.code, name: def.name, description: def.description },
  });

  console.log(`  - department ${def.code.padEnd(4)} ${department.name}`);
  return department;
}

/* ---------------- users ---------------- */

async function upsertUser(data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  roleId: string;
  employeeCode: string;
  designation: string;
  departmentId: string | null;
  category: 'INTERN' | 'FRESHER' | 'EXPERIENCED' | 'CONTRACT';
}) {
  const passwordHash = await bcrypt.hash(data.password, saltRounds);

  const profile = {
    roleId: data.roleId,
    employeeCode: data.employeeCode,
    designation: data.designation,
    departmentId: data.departmentId,
    category: data.category,
  };

  const user = await prisma.user.upsert({
    where: { email: data.email },
    // Profile is kept in sync on re-seed; the password is left untouched.
    update: profile,
    create: {
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      joinedAt: new Date(),
      ...profile,
    },
  });

  console.log(`  - user ${user.email} (${user.category})`);
  return user;
}

/* ---------------- expense categories ---------------- */

interface ExpenseCategorySeed {
  name: string;
  description: string;
  /** A receipt becomes mandatory above this line amount. */
  receiptRequiredAbove: number;
}

const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategorySeed[] = [
  { name: 'Travel', description: 'Flights, trains, cabs and mileage', receiptRequiredAbove: 500 },
  { name: 'Accommodation', description: 'Hotels and lodging', receiptRequiredAbove: 1000 },
  { name: 'Meals', description: 'Meals during business travel or late hours', receiptRequiredAbove: 500 },
  { name: 'Office Supplies', description: 'Stationery, hardware and consumables', receiptRequiredAbove: 500 },
  { name: 'Client Entertainment', description: 'Client meetings and hospitality', receiptRequiredAbove: 1000 },
  { name: 'Internet & Phone', description: 'Connectivity and communication reimbursements', receiptRequiredAbove: 500 },
  { name: 'Training', description: 'Courses, certifications and conferences', receiptRequiredAbove: 1000 },
  { name: 'Miscellaneous', description: 'Other approved business expenses', receiptRequiredAbove: 500 },
];

async function upsertExpenseCategory(def: ExpenseCategorySeed) {
  const category = await prisma.expenseCategory.upsert({
    where: { name: def.name },
    update: {},
    create: {
      name: def.name,
      description: def.description,
      receiptRequiredAbove: def.receiptRequiredAbove,
    },
  });
  console.log(`  - expense category ${category.name}`);
  return category;
}

/**
 * Codes are issued from a counter so newly created employees continue the
 * sequence as EMP-0004, EMP-0005, ... Set to the highest seeded code.
 */
async function syncEmployeeCodeCounter(highest: number) {
  await prisma.counter.upsert({
    where: { key: 'employee_code' },
    update: {},
    create: { key: 'employee_code', value: highest },
  });
  console.log(`\nEmployee code counter starts at EMP-${String(highest).padStart(4, '0')}`);
}

async function main() {
  console.log('Seeding system roles...');
  const roles = new Map<string, string>();
  for (const def of SYSTEM_ROLES) {
    const role = await upsertRole(def);
    roles.set(def.key, role.id);
  }

  const adminRoleId = roles.get('ADMIN');
  const hrRoleId = roles.get('HR');
  const employeeRoleId = roles.get('EMPLOYEE');

  if (!adminRoleId || !hrRoleId || !employeeRoleId) {
    throw new Error('System roles were not created correctly');
  }

  console.log('\nSeeding departments...');
  const departments = new Map<string, string>();
  for (const def of DEPARTMENTS) {
    const department = await upsertDepartment(def);
    departments.set(def.code, department.id);
  }

  console.log('\nSeeding default users...');

  await upsertUser({
    email: process.env.SEED_ADMIN_EMAIL ?? 'admin@hrms.local',
    password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123',
    firstName: 'System',
    lastName: 'Admin',
    roleId: adminRoleId,
    employeeCode: 'EMP-0001',
    designation: 'Administrator',
    departmentId: departments.get('HR') ?? null,
    category: 'EXPERIENCED',
  });

  const hr = await upsertUser({
    email: process.env.SEED_HR_EMAIL ?? 'hr@hrms.local',
    password: process.env.SEED_HR_PASSWORD ?? 'Hr@12345',
    firstName: 'Hr',
    lastName: 'Manager',
    roleId: hrRoleId,
    employeeCode: 'EMP-0002',
    designation: 'HR Manager',
    departmentId: departments.get('HR') ?? null,
    category: 'EXPERIENCED',
  });

  await upsertUser({
    email: 'employee@hrms.local',
    password: 'Employee@123',
    firstName: 'Demo',
    lastName: 'Employee',
    roleId: employeeRoleId,
    employeeCode: 'EMP-0003',
    designation: 'Software Engineer',
    departmentId: departments.get('ENG') ?? null,
    category: 'FRESHER',
  });

  await syncEmployeeCodeCounter(3);

  /* ---------------- approval flows (HR approves all by default) ---------------- */
  console.log('\nSeeding default approval flows...');
  const requestTypes: TimeOffRequestType[] = ['LEAVE', 'PERMISSION', 'REGULARIZATION', 'EXTRA_HOURS'];
  for (const type of requestTypes) {
    await prisma.approvalFlow.upsert({
      where: { requestType: type },
      update: { approverRoleId: hrRoleId },
      create: { requestType: type, approverRoleId: hrRoleId },
    });
  }
  console.log(`  - all 4 request types default to the HR role`);

  /* ---------------- leave balances for seeded employees ---------------- */
  console.log('\nSeeding leave balances...');
  const leaveTypes = [
    { type: 'CASUAL' as const, total: 12 },
    { type: 'SICK' as const, total: 10 },
    { type: 'EARNED' as const, total: 15 },
    { type: 'PERSONAL' as const, total: 3 },
  ];
  const seededUsers = await prisma.user.findMany({
    where: { employeeCode: { in: ['EMP-0001', 'EMP-0002', 'EMP-0003'] } },
    select: { id: true, employeeCode: true },
  });
  const year = new Date().getFullYear();
  for (const user of seededUsers) {
    for (const lt of leaveTypes) {
      await prisma.leaveBalance.upsert({
        where: { employeeId_leaveType_year: { employeeId: user.id, leaveType: lt.type, year } },
        update: {},
        create: { employeeId: user.id, leaveType: lt.type, year, total: lt.total, used: 0 },
      });
    }
  }
  console.log(`  - ${seededUsers.length} employees × ${leaveTypes.length} leave types for ${year}`);

  /* ---------------- default expense categories ---------------- */
  console.log('\nSeeding expense categories...');
  for (const def of DEFAULT_EXPENSE_CATEGORIES) {
    await upsertExpenseCategory(def);
  }

  console.log(`\nSeed complete. HR reference id: ${hr.id}`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
