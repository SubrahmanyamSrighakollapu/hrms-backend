import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as rolesController from './roles.controller';
import { assignRoleSchema, createRoleSchema, updateRoleSchema } from './roles.validation';

const router = Router();

// Every endpoint below requires a signed-in user with at least Roles VIEW.
router.use(authenticate, requirePermission('roles'));

// Assignment routes must be declared before the "/:id" route.
router.get('/assignments', rolesController.listAssignments);
router.patch(
  '/assignments/:userId',
  requirePermission('roles', 'MANAGE'),
  validate(assignRoleSchema),
  rolesController.assign,
);

router.get('/', rolesController.list);
router.post('/', requirePermission('roles', 'MANAGE'), validate(createRoleSchema), rolesController.create);
router.get('/:id', rolesController.get);
router.patch('/:id', requirePermission('roles', 'MANAGE'), validate(updateRoleSchema), rolesController.update);
router.delete('/:id', requirePermission('roles', 'MANAGE'), rolesController.remove);

export default router;
