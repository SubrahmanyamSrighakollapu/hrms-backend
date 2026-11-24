import { z } from 'zod';
import { paginationFields } from '../../utils/pagination';

export const employeeCategorySchema = z.enum(['INTERN', 'FRESHER', 'EXPERIENCED', 'CONTRACT']);
export const employmentTypeSchema = z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']);
export const genderSchema = z.enum(['MALE', 'FEMALE', 'OTHER']);
export const userStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']);
export const maritalStatusSchema = z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED']);

/** Optional text field where an empty string or null means "clear it". */
const optionalText = (max: number, label: string) =>
  z
    .union([
      z.string().trim().max(max, `${label} must be at most ${max} characters`),
      z.literal('').transform(() => null),
    ])
    .nullable()
    .optional();

/** Optional phone number: digits and the usual separators (+, -, (), ., space). */
const PHONE_PATTERN = /^[+()\-.\s\d]{7,20}$/;
const optionalPhone = (label: string) =>
  z
    .union([z.literal('').transform(() => null), z.string().trim().max(20, `${label} must be at most 20 characters`)])
    .nullable()
    .optional()
    .refine((value) => value == null || value === '' || PHONE_PATTERN.test(value), {
      message: `${label} must be a valid phone number`,
    });

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

  phone: optionalPhone('Phone'),
  designation: optionalText(80, 'Designation'),
  departmentId: optionalRef,
  roleId: optionalRef,
  managerId: optionalRef,
  locationId: optionalRef,
  subLocationId: optionalRef,

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
  emergencyContactPhone: optionalPhone('Emergency contact phone'),
  emergencyContactRelationship: optionalText(40, 'Emergency contact relationship'),

  // Bank / statutory
  bankName: optionalText(100, 'Bank name'),
  bankAccount: optionalText(30, 'Bank account number'),
  ifsc: optionalText(20, 'IFSC code'),
  pan: optionalText(20, 'PAN'),
  aadhaar: optionalText(20, 'Aadhaar'),
  uan: optionalText(20, 'UAN'),
  bloodGroup: optionalText(10, 'Blood group'),
  maritalStatus: z
    .union([maritalStatusSchema, z.literal('').transform(() => null), z.null()])
    .optional(),
};

export const createEmployeeSchema = z.object({
  ...employeeShape,
  // When omitted the server issues a temporary password and returns it once.
  password: passwordSchema.optional(),
});

export const updateEmployeeSchema = z
  .object({
    ...employeeShape,
    onboardingCompleted: z.boolean().optional(),
  })
  .partial();

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
  ...paginationFields(),
});

/** What an employee may change about their own record. */
export const updateSelfSchema = z
  .object({
    phone: optionalPhone('Phone'),
    dateOfBirth: optionalDate,
    gender: z.union([genderSchema, z.literal('').transform(() => null), z.null()]).optional(),
    address: optionalText(240, 'Address'),
    emergencyContactName: optionalText(80, 'Emergency contact name'),
    emergencyContactPhone: optionalPhone('Emergency contact phone'),
    emergencyContactRelationship: optionalText(40, 'Emergency contact relationship'),
    bankName: optionalText(100, 'Bank name'),
    bankAccount: optionalText(30, 'Bank account number'),
    ifsc: optionalText(20, 'IFSC code'),
    pan: optionalText(20, 'PAN'),
    aadhaar: optionalText(20, 'Aadhaar'),
    uan: optionalText(20, 'UAN'),
    bloodGroup: optionalText(10, 'Blood group'),
    maritalStatus: z
      .union([maritalStatusSchema, z.literal('').transform(() => null), z.null()])
      .optional(),
  })
  .partial();

/* ----------------------- My Info child collections ----------------------- */

export const createWorkExperienceSchema = z.object({
  company: z.string().trim().min(1, 'Company is required').max(120),
  designation: optionalText(80, 'Designation'),
  fromDate: z.coerce.date(),
  toDate: optionalDate,
  currentlyWorking: z.boolean().optional(),
  description: optionalText(500, 'Description'),
});

export const updateWorkExperienceSchema = createWorkExperienceSchema.partial();

export const createFamilyMemberSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  relationship: z.string().trim().min(1, 'Relationship is required').max(40),
  dateOfBirth: optionalDate,
  phone: optionalPhone('Phone'),
});

export const updateFamilyMemberSchema = createFamilyMemberSchema.partial();

export const createEducationSchema = z.object({
  institution: z.string().trim().min(1, 'Institution is required').max(160),
  degree: z.string().trim().min(1, 'Degree is required').max(120),
  fieldOfStudy: optionalText(120, 'Field of study'),
  fromYear: z.coerce.number().int().min(1900).max(2100),
  toYear: z.coerce.number().int().min(1900).max(2100).nullable().optional(),
  percentage: z.union([z.coerce.number().min(0).max(100), z.null()]).optional(),
});

export const updateEducationSchema = createEducationSchema.partial();

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;
export type UpdateSelfInput = z.infer<typeof updateSelfSchema>;
export type CreateWorkExperienceInput = z.infer<typeof createWorkExperienceSchema>;
export type UpdateWorkExperienceInput = z.infer<typeof updateWorkExperienceSchema>;
export type CreateFamilyMemberInput = z.infer<typeof createFamilyMemberSchema>;
export type UpdateFamilyMemberInput = z.infer<typeof updateFamilyMemberSchema>;
export type CreateEducationInput = z.infer<typeof createEducationSchema>;
export type UpdateEducationInput = z.infer<typeof updateEducationSchema>;
