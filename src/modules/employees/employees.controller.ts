import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import type {
  ChangeStatusInput,
  CreateEducationInput,
  CreateEmployeeInput,
  CreateFamilyMemberInput,
  CreateWorkExperienceInput,
  ListEmployeesQuery,
  UpdateEducationInput,
  UpdateEmployeeInput,
  UpdateFamilyMemberInput,
  UpdateSelfInput,
  UpdateWorkExperienceInput,
} from './employees.validation';
import * as employeesService from './employees.service';

function actorId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await employeesService.listEmployees(req.query as unknown as ListEmployeesQuery);
  res.status(200).json({ success: true, data: result });
});

export const formOptions = asyncHandler(async (_req: Request, res: Response) => {
  const options = await employeesService.formOptions();
  res.status(200).json({ success: true, data: options });
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeesService.getEmployee(req.params.id);
  res.status(200).json({ success: true, data: { employee } });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const result = await employeesService.createEmployee(req.body as CreateEmployeeInput);
  res.status(201).json({ success: true, data: result });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeesService.updateEmployee(
    req.params.id,
    req.body as UpdateEmployeeInput,
  );
  res.status(200).json({ success: true, data: { employee } });
});

export const changeStatus = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeesService.changeStatus(
    req.params.id,
    req.body as ChangeStatusInput,
    actorId(req),
  );
  res.status(200).json({ success: true, data: { employee } });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const result = await employeesService.resetPassword(req.params.id);
  res.status(200).json({ success: true, data: result });
});

/* ---- self service (the signed-in employee's own record) ---- */

export const me = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeesService.getEmployee(actorId(req));
  res.status(200).json({ success: true, data: { employee } });
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeesService.updateSelf(actorId(req), req.body as UpdateSelfInput);
  res.status(200).json({ success: true, data: { employee } });
});

/* ---- My Info child collections (self-scoped) ---- */

export const listWorkExperience = asyncHandler(async (req: Request, res: Response) => {
  const items = await employeesService.listWorkExperience(actorId(req));
  res.status(200).json({ success: true, data: { workExperience: items } });
});

export const createWorkExperience = asyncHandler(async (req: Request, res: Response) => {
  const item = await employeesService.createWorkExperience(
    actorId(req),
    req.body as CreateWorkExperienceInput,
  );
  res.status(201).json({ success: true, data: { workExperience: item } });
});

export const updateWorkExperience = asyncHandler(async (req: Request, res: Response) => {
  const item = await employeesService.updateWorkExperience(
    actorId(req),
    req.params.id,
    req.body as UpdateWorkExperienceInput,
  );
  res.status(200).json({ success: true, data: { workExperience: item } });
});

export const deleteWorkExperience = asyncHandler(async (req: Request, res: Response) => {
  const result = await employeesService.deleteWorkExperience(actorId(req), req.params.id);
  res.status(200).json({ success: true, data: result });
});

export const listFamilyMembers = asyncHandler(async (req: Request, res: Response) => {
  const items = await employeesService.listFamilyMembers(actorId(req));
  res.status(200).json({ success: true, data: { familyMembers: items } });
});

export const createFamilyMember = asyncHandler(async (req: Request, res: Response) => {
  const item = await employeesService.createFamilyMember(
    actorId(req),
    req.body as CreateFamilyMemberInput,
  );
  res.status(201).json({ success: true, data: { familyMember: item } });
});

export const updateFamilyMember = asyncHandler(async (req: Request, res: Response) => {
  const item = await employeesService.updateFamilyMember(
    actorId(req),
    req.params.id,
    req.body as UpdateFamilyMemberInput,
  );
  res.status(200).json({ success: true, data: { familyMember: item } });
});

export const deleteFamilyMember = asyncHandler(async (req: Request, res: Response) => {
  const result = await employeesService.deleteFamilyMember(actorId(req), req.params.id);
  res.status(200).json({ success: true, data: result });
});

export const listEducation = asyncHandler(async (req: Request, res: Response) => {
  const items = await employeesService.listEducation(actorId(req));
  res.status(200).json({ success: true, data: { education: items } });
});

export const createEducation = asyncHandler(async (req: Request, res: Response) => {
  const item = await employeesService.createEducation(
    actorId(req),
    req.body as CreateEducationInput,
  );
  res.status(201).json({ success: true, data: { education: item } });
});

export const updateEducation = asyncHandler(async (req: Request, res: Response) => {
  const item = await employeesService.updateEducation(
    actorId(req),
    req.params.id,
    req.body as UpdateEducationInput,
  );
  res.status(200).json({ success: true, data: { education: item } });
});

export const deleteEducation = asyncHandler(async (req: Request, res: Response) => {
  const result = await employeesService.deleteEducation(actorId(req), req.params.id);
  res.status(200).json({ success: true, data: result });
});
