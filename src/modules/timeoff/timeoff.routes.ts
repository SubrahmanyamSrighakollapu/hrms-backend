import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as timeoffController from './timeoff.controller';
import {
  approveRejectSchema,
  createTimeOffSchema,
  listTimeOffQuerySchema,
  updateApprovalFlowSchema,
} from './timeoff.validation';

const router = Router();

// Everything below needs a signed-in user; per-route guards decide the rest.
router.use(authenticate);

// ---- employee self-service ----
router.get('/balances', requirePermission('time-off'), timeoffController.balances);

// ---- approval inbox (configured approver role) ----
router.get('/inbox', requirePermission('time-off', 'MANAGE'), validate(listTimeOffQuerySchema, 'query'), timeoffController.inbox);

// ---- admin: approval flow configuration ----
router.get('/approval-flows', requirePermission('roles', 'MANAGE'), timeoffController.listFlows);
router.patch('/approval-flows/:type', requirePermission('roles', 'MANAGE'), validate(updateApprovalFlowSchema), timeoffController.updateFlow);

// ---- requests (declare after the literal paths above so they aren't shadowed by /:id) ----
router.get('/', requirePermission('time-off'), validate(listTimeOffQuerySchema, 'query'), timeoffController.list);
router.post('/', requirePermission('time-off'), validate(createTimeOffSchema), timeoffController.create);

router.get('/:id', requirePermission('time-off'), timeoffController.get);
router.patch('/:id/approve', requirePermission('time-off', 'MANAGE'), validate(approveRejectSchema), timeoffController.approve);
router.patch('/:id/reject', requirePermission('time-off', 'MANAGE'), validate(approveRejectSchema), timeoffController.reject);

export default router;
