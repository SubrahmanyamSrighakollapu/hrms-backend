import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as employeesController from './employees.controller';
import {
  changeStatusSchema,
  createEmployeeSchema,
  listEmployeesQuerySchema,
  updateEmployeeSchema,
  updateSelfSchema,
} from './employees.validation';

const router = Router();

// Everything below needs a signed-in user; per-route guards decide the rest.
router.use(authenticate);

// "me" and "form-options" must be declared before the "/:id" route.
router.get('/me', employeesController.me);
router.patch('/me', requirePermission('my-info', 'MANAGE'), validate(updateSelfSchema), employeesController.updateMe);
router.get('/form-options', requirePermission('employees'), employeesController.formOptions);

router.get('/', requirePermission('employees'), validate(listEmployeesQuerySchema, 'query'), employeesController.list);
router.post('/', requirePermission('employees', 'MANAGE'), validate(createEmployeeSchema), employeesController.create);

router.get('/:id', requirePermission('employees'), employeesController.get);
router.patch('/:id', requirePermission('employees', 'MANAGE'), validate(updateEmployeeSchema), employeesController.update);
router.patch('/:id/status', requirePermission('employees', 'MANAGE'), validate(changeStatusSchema), employeesController.changeStatus);
router.post('/:id/reset-password', requirePermission('employees', 'MANAGE'), employeesController.resetPassword);

export default router;
