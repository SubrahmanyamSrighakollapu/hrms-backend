import { z } from 'zod';

export const permissionLevelSchema = z.enum(['NONE', 'VIEW', 'MANAGE']);

/** moduleId → level map coming from the permission matrix UI. */
const permissionsSchema = z.record(z.string(), permissionLevelSchema);

export const createRoleSchema = z.object({
  name: z.string().trim().min(2, 'Role name must be at least 2 characters').max(60),
  description: z.string().trim().max(240, 'Description must be at most 240 characters').optional(),
  permissions: permissionsSchema.optional(),
});

export const updateRoleSchema = z.object({
  name: z.string().trim().min(2, 'Role name must be at least 2 characters').max(60).optional(),
  description: z.string().trim().max(240, 'Description must be at most 240 characters').optional(),
  permissions: permissionsSchema.optional(),
});

export const assignRoleSchema = z.object({
  roleId: z.string().min(1, 'roleId is required'),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
