import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import type {
  CreateDepartmentInput,
  CreateLocationInput,
  CreateSubLocationInput,
  UpdateDepartmentInput,
  UpdateLocationInput,
  UpdateSubLocationInput,
} from './organization.validation';
import * as organizationService from './organization.service';

/* ----------------------------- Departments ----------------------------- */

export const listDepartments = asyncHandler(async (_req: Request, res: Response) => {
  const departments = await organizationService.listDepartments();
  res.status(200).json({ success: true, data: { departments } });
});

export const createDepartment = asyncHandler(async (req: Request, res: Response) => {
  const department = await organizationService.createDepartment(req.body as CreateDepartmentInput);
  res.status(201).json({ success: true, data: { department } });
});

export const updateDepartment = asyncHandler(async (req: Request, res: Response) => {
  const department = await organizationService.updateDepartment(
    req.params.id,
    req.body as UpdateDepartmentInput,
  );
  res.status(200).json({ success: true, data: { department } });
});

export const deleteDepartment = asyncHandler(async (req: Request, res: Response) => {
  const result = await organizationService.deleteDepartment(req.params.id);
  res.status(200).json({ success: true, data: result });
});

export const hierarchy = asyncHandler(async (_req: Request, res: Response) => {
  const employees = await organizationService.getHierarchy();
  res.status(200).json({ success: true, data: { employees } });
});

/* ------------------------------- Locations ------------------------------ */

export const listLocations = asyncHandler(async (_req: Request, res: Response) => {
  const locations = await organizationService.listLocations();
  res.status(200).json({ success: true, data: { locations } });
});

export const createLocation = asyncHandler(async (req: Request, res: Response) => {
  const location = await organizationService.createLocation(req.body as CreateLocationInput);
  res.status(201).json({ success: true, data: { location } });
});

export const updateLocation = asyncHandler(async (req: Request, res: Response) => {
  const location = await organizationService.updateLocation(
    req.params.id,
    req.body as UpdateLocationInput,
  );
  res.status(200).json({ success: true, data: { location } });
});

export const deleteLocation = asyncHandler(async (req: Request, res: Response) => {
  const result = await organizationService.deleteLocation(req.params.id);
  res.status(200).json({ success: true, data: result });
});

/* ----------------------------- Sub-locations ---------------------------- */

export const listSubLocations = asyncHandler(async (req: Request, res: Response) => {
  const subLocations = await organizationService.listSubLocations(req.query as { locationId?: string });
  res.status(200).json({ success: true, data: { subLocations } });
});

export const createSubLocation = asyncHandler(async (req: Request, res: Response) => {
  const subLocation = await organizationService.createSubLocation(req.body as CreateSubLocationInput);
  res.status(201).json({ success: true, data: { subLocation } });
});

export const updateSubLocation = asyncHandler(async (req: Request, res: Response) => {
  const subLocation = await organizationService.updateSubLocation(
    req.params.id,
    req.body as UpdateSubLocationInput,
  );
  res.status(200).json({ success: true, data: { subLocation } });
});

export const deleteSubLocation = asyncHandler(async (req: Request, res: Response) => {
  const result = await organizationService.deleteSubLocation(req.params.id);
  res.status(200).json({ success: true, data: result });
});
