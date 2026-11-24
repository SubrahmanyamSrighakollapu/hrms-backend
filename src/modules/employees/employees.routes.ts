import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as employeesController from './employees.controller';
import {
  changeStatusSchema,
  createEducationSchema,
  createEmployeeSchema,
  createFamilyMemberSchema,
  createWorkExperienceSchema,
  listEmployeesQuerySchema,
  updateEducationSchema,
  updateEmployeeSchema,
  updateFamilyMemberSchema,
  updateSelfSchema,
  updateWorkExperienceSchema,
} from './employees.validation';

const router = Router();

// Everything below needs a signed-in user; per-route guards decide the rest.
router.use(authenticate);

// "me" and "form-options" must be declared before the "/:id" route.
router.get('/me', requirePermission('my-info'), employeesController.me);
router.patch(
  '/me',
  requirePermission('my-info', 'MANAGE'),
  validate(updateSelfSchema),
  employeesController.updateMe,
);

// My Info child collections (self-scoped).
router.get('/me/work-experience', requirePermission('my-info'), employeesController.listWorkExperience);
router.post(
  '/me/work-experience',
  requirePermission('my-info', 'MANAGE'),
  validate(createWorkExperienceSchema),
  employeesController.createWorkExperience,
);
router.patch(
  '/me/work-experience/:id',
  requirePermission('my-info', 'MANAGE'),
  validate(updateWorkExperienceSchema),
  employeesController.updateWorkExperience,
);
router.delete(
  '/me/work-experience/:id',
  requirePermission('my-info', 'MANAGE'),
  employeesController.deleteWorkExperience,
);

router.get('/me/family', requirePermission('my-info'), employeesController.listFamilyMembers);
router.post(
  '/me/family',
  requirePermission('my-info', 'MANAGE'),
  validate(createFamilyMemberSchema),
  employeesController.createFamilyMember,
);
router.patch(
  '/me/family/:id',
  requirePermission('my-info', 'MANAGE'),
  validate(updateFamilyMemberSchema),
  employeesController.updateFamilyMember,
);
router.delete(
  '/me/family/:id',
  requirePermission('my-info', 'MANAGE'),
  employeesController.deleteFamilyMember,
);

router.get('/me/education', requirePermission('my-info'), employeesController.listEducation);
router.post(
  '/me/education',
  requirePermission('my-info', 'MANAGE'),
  validate(createEducationSchema),
  employeesController.createEducation,
);
router.patch(
  '/me/education/:id',
  requirePermission('my-info', 'MANAGE'),
  validate(updateEducationSchema),
  employeesController.updateEducation,
);
router.delete(
  '/me/education/:id',
  requirePermission('my-info', 'MANAGE'),
  employeesController.deleteEducation,
);

router.get('/form-options', requirePermission('employees'), employeesController.formOptions);

router.get('/', requirePermission('employees'), validate(listEmployeesQuerySchema, 'query'), employeesController.list);
router.post('/', requirePermission('employees', 'MANAGE'), validate(createEmployeeSchema), employeesController.create);

router.get('/:id', requirePermission('employees'), employeesController.get);
router.patch('/:id', requirePermission('employees', 'MANAGE'), validate(updateEmployeeSchema), employeesController.update);
router.patch('/:id/status', requirePermission('employees', 'MANAGE'), validate(changeStatusSchema), employeesController.changeStatus);
router.post('/:id/reset-password', requirePermission('employees', 'MANAGE'), employeesController.resetPassword);

export default router;
