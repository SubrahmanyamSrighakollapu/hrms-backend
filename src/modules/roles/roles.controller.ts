import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import type { AssignRoleInput, CreateRoleInput, UpdateRoleInput } from './roles.validation';
import * as rolesService from './roles.service';

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const roles = await rolesService.listRoles();
  res.status(200).json({ success: true, data: { roles } });
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  const role = await rolesService.getRole(req.params.id);
  res.status(200).json({ success: true, data: { role } });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const role = await rolesService.createRole(req.body as CreateRoleInput);
  res.status(201).json({ success: true, data: { role } });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const role = await rolesService.updateRole(req.params.id, req.body as UpdateRoleInput);
  res.status(200).json({ success: true, data: { role } });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const result = await rolesService.deleteRole(req.params.id);
  res.status(200).json({ success: true, data: result });
});

export const listAssignments = asyncHandler(async (_req: Request, res: Response) => {
  const employees = await rolesService.listAssignments();
  res.status(200).json({ success: true, data: { employees } });
});

export const assign = asyncHandler(async (req: Request, res: Response) => {
  const employee = await rolesService.assignRole(req.params.userId, req.body as AssignRoleInput);
  res.status(200).json({ success: true, data: { employee } });
});
