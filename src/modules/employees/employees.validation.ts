import { z } from 'zod';

export const employeeCategorySchema = z.enum(['INTERN', 'FRESHER', 'EXPERIENCED', 'CONTRACT']);
export const employmentTypeSchema = z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']);
export const genderSchema = z.enum(['MALE', 'FEMALE', 'OTHER']);
export const userStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']);

/** Optional text field where an empty string or null means "clear it". */
const optionalText = (max: number, label: string) =>
  z
    .union([
      z.string().trim().max(max, `${label} must be at most ${max} characters`),
      z.literal('').transform(() => null),
    ])
    .nullable()
    .optional();

/** Optional date: accepts an ISO date string / Date, or null / "" to clear. */
const optionalDate = z
  .union([z.null(), z.literal('').transform(() => null), z.coerce.date()])
  .optional();

/** Optional reference to another record; existence is checked in the service. */
const optionalRef = z
  .union([z.string().trim().min(1).max(64), z.literal('').transform(() => null), z.null()])
  .optional();

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters');

/** Fields shared by create and update. */
const employeeShape = {
  firstName: z.string().trim().min(1, 'First name is required').max(60),
  lastName: z.string().trim().min(1, 'Last name is required').max(60),
  email: z.string().trim().email('Enter a valid email address').toLowerCase(),

  phone: optionalText(20, 'Phone'),
  designation: optionalText(80, 'Designation'),
  departmentId: optionalRef,
  roleId: optionalRef,
  managerId: optionalRef,

  // Classification - drives the probation window.
  category: employeeCategorySchema,
  employmentType: employmentTypeSchema,
  priorExperienceMonths: z.coerce.number().int().min(0).max(720).optional(),

  joinedAt: optionalDate,
  probationEndDate: optionalDate,
  confirmationDate: optionalDate,
  contractEndDate: optionalDate,

  dateOfBirth: optionalDate,
  gender: z.union([genderSchema, z.literal('').transform(() => null), z.null()]).optional(),
  address: optionalText(240, 'Address'),
  emergencyContactName: optionalText(80, 'Emergency contact name'),
  emergencyContactPhone: optionalText(20, 'Emergency contact phone'),
};

export const createEmployeeSchema = z.object({
  ...employeeShape,
  // When omitted the server issues a temporary password and returns it once.
  password: passwordSchema.optional(),
});

export const updateEmployeeSchema = z.object(employeeShape).partial();

export const changeStatusSchema = z.object({
  status: userStatusSchema,
  reason: optionalText(240, 'Reason'),
});

export const listEmployeesQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: userStatusSchema.optional(),
  category: employeeCategorySchema.optional(),
  departmentId: z.string().trim().min(1).max(64).optional(),
  roleId: z.string().trim().min(1).max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** What an employee may change about their own record. */
export const updateSelfSchema = z
  .object({
    phone: optionalText(20, 'Phone'),
    dateOfBirth: optionalDate,
    gender: z.union([genderSchema, z.literal('').transform(() => null), z.null()]).optional(),
    address: optionalText(240, 'Address'),
    emergencyContactName: optionalText(80, 'Emergency contact name'),
    emergencyContactPhone: optionalText(20, 'Emergency contact phone'),
  })
  .partial();

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;
export type UpdateSelfInput = z.infer<typeof updateSelfSchema>;
