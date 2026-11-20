import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import type { LoginInput, LogoutInput, RefreshInput, RegisterInput } from './auth.validation';
import * as authService from './auth.service';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.register(req.body as RegisterInput);
  res.status(201).json({ success: true, data: result });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.login(req.body as LoginInput);
  res.status(200).json({ success: true, data: result });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body as RefreshInput;
  const result = await authService.refresh(refreshToken);
  res.status(200).json({ success: true, data: result });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = (req.body ?? {}) as LogoutInput;
  // Authenticated request revokes by user; otherwise the refresh token identifies the session.
  await authService.logout(req.user?.id ?? null, refreshToken);
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const user = await authService.getProfile(req.user.id);
  res.status(200).json({ success: true, data: user });
});
