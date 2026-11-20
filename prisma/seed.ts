import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const prisma = new PrismaClient();

const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 10);

async function upsertUser(data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: Role;
  employeeCode: string;
  designation: string;
}) {
  const passwordHash = await bcrypt.hash(data.password, saltRounds);

  const user = await prisma.user.upsert({
    where: { email: data.email },
    update: { role: data.role },
    create: {
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role,
      employeeCode: data.employeeCode,
      designation: data.designation,
      department: 'Human Resources',
      joinedAt: new Date(),
    },
  });

  console.log(`  - ${user.role.padEnd(8)} ${user.email}`);
  return user;
}

async function main() {
  console.log('Seeding default users...');

  await upsertUser({
    email: process.env.SEED_ADMIN_EMAIL ?? 'admin@hrms.local',
    password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123',
    firstName: 'System',
    lastName: 'Admin',
    role: Role.ADMIN,
    employeeCode: 'EMP-0001',
    designation: 'Administrator',
  });

  const hr = await upsertUser({
    email: process.env.SEED_HR_EMAIL ?? 'hr@hrms.local',
    password: process.env.SEED_HR_PASSWORD ?? 'Hr@12345',
    firstName: 'Hr',
    lastName: 'Manager',
    role: Role.HR,
    employeeCode: 'EMP-0002',
    designation: 'HR Manager',
  });

  await upsertUser({
    email: 'employee@hrms.local',
    password: 'Employee@123',
    firstName: 'Demo',
    lastName: 'Employee',
    role: Role.EMPLOYEE,
    employeeCode: 'EMP-0003',
    designation: 'Software Engineer',
  });

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
