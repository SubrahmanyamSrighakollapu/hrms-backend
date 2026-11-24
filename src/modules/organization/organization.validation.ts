import { z } from 'zod';

const optionalText = (max: number) =>
  z.union([z.string().trim().max(max), z.literal('').transform(() => null), z.null()]).optional();

const optionalRef = z
  .union([z.string().trim().min(1).max(64), z.literal('').transform(() => null), z.null()])
  .optional();

const statusSchema = z.enum(['ACTIVE', 'INACTIVE']);

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  code: optionalText(16),
  description: optionalText(240),
  headId: optionalRef,
  parentId: optionalRef,
  locationId: optionalRef,
  status: statusSchema.optional(),
});

export const updateDepartmentSchema = createDepartmentSchema.partial();

export const createLocationSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  code: optionalText(16),
  addressLine1: optionalText(160),
  addressLine2: optionalText(160),
  city: optionalText(80),
  state: optionalText(80),
  country: optionalText(80),
  postalCode: optionalText(20),
  timezone: z.string().trim().min(1).max(60).optional(),
  workStart: optionalText(8),
  workEnd: optionalText(8),
  isDefault: z.boolean().optional(),
  status: statusSchema.optional(),
});

export const updateLocationSchema = createLocationSchema.partial();

export const createSubLocationSchema = z.object({
  locationId: z.string().trim().min(1).max(64),
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  type: z.enum(['BLOCK', 'FLOOR', 'WING', 'ZONE', 'OTHER']).optional(),
  code: optionalText(16),
  status: statusSchema.optional(),
});

export const updateSubLocationSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  type: z.enum(['BLOCK', 'FLOOR', 'WING', 'ZONE', 'OTHER']).optional(),
  code: optionalText(16),
  status: statusSchema.optional(),
  locationId: z.string().trim().min(1).max(64).optional(),
});

export const listSubLocationsQuerySchema = z.object({
  locationId: z.string().trim().min(1).max(64).optional(),
});

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
export type CreateSubLocationInput = z.infer<typeof createSubLocationSchema>;
export type UpdateSubLocationInput = z.infer<typeof updateSubLocationSchema>;
export type ListSubLocationsQuery = z.infer<typeof listSubLocationsQuerySchema>;
