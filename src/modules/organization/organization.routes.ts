import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as organizationController from './organization.controller';
import { createDepartmentSchema, updateDepartmentSchema } from './organization.validation';

const router = Router();

router.use(authenticate, requirePermission('organization'));
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

export default router;
