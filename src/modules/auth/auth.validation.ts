import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('A valid email is required').toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters'),
  firstName: z.string().min(1, 'First name is required').max(60),
  lastName: z.string().min(1, 'Last name is required').max(60),
  phone: z.string().max(20).optional(),
});

export const loginSchema = z.object({
  email: z.string().email('A valid email is required').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
});

/**
 * Logout accepts an optional refresh token so the session can still be
 * revoked when the access token has already expired. A missing body is fine.
 */
export const logoutSchema = z
  .object({
    refreshToken: z.string().min(1).optional(),
  })
  .default({});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
