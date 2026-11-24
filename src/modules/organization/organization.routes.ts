import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as organizationController from './organization.controller';
import {
  createDepartmentSchema,
  createLocationSchema,
  createSubLocationSchema,
  listSubLocationsQuerySchema,
  updateDepartmentSchema,
  updateLocationSchema,
  updateSubLocationSchema,
} from './organization.validation';

const router = Router();

router.use(authenticate, requirePermission('organization'));

/* Departments */
router.get('/departments', organizationController.listDepartments);
router.get('/hierarchy', organizationController.hierarchy);
router.post(
  '/departments',
  requirePermission('organization', 'MANAGE'),
  validate(createDepartmentSchema),
  organizationController.createDepartment,
);
router.patch(
  '/departments/:id',
  requirePermission('organization', 'MANAGE'),
  validate(updateDepartmentSchema),
  organizationController.updateDepartment,
);
router.delete(
  '/departments/:id',
  requirePermission('organization', 'MANAGE'),
  organizationController.deleteDepartment,
);

/* Locations */
router.get('/locations', organizationController.listLocations);
router.post(
  '/locations',
  requirePermission('organization', 'MANAGE'),
  validate(createLocationSchema),
  organizationController.createLocation,
);
router.patch(
  '/locations/:id',
  requirePermission('organization', 'MANAGE'),
  validate(updateLocationSchema),
  organizationController.updateLocation,
);
router.delete(
  '/locations/:id',
  requirePermission('organization', 'MANAGE'),
  organizationController.deleteLocation,
);

/* Sub-locations */
router.get(
  '/sub-locations',
  validate(listSubLocationsQuerySchema, 'query'),
  organizationController.listSubLocations,
);
router.post(
  '/sub-locations',
  requirePermission('organization', 'MANAGE'),
  validate(createSubLocationSchema),
  organizationController.createSubLocation,
);
router.patch(
  '/sub-locations/:id',
  requirePermission('organization', 'MANAGE'),
  validate(updateSubLocationSchema),
  organizationController.updateSubLocation,
);
router.delete(
  '/sub-locations/:id',
  requirePermission('organization', 'MANAGE'),
  organizationController.deleteSubLocation,
);

export default router;
