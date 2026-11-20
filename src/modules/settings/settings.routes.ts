import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as settingsController from './settings.controller';
import {
  listLeaveBalancesSchema,
  setLeaveBalanceSchema,
  updateProfileSchema,
} from './settings.validation';

const router = Router();
router.use(authenticate, requirePermission('settings', 'MANAGE'));

router.get('/profile', settingsController.getProfile);
router.patch('/profile', validate(updateProfileSchema), settingsController.updateProfile);
router.get(
  '/leave-balances',
  validate(listLeaveBalancesSchema, 'query'),
  settingsController.listLeaveBalances,
);
router.put('/leave-balances', validate(setLeaveBalanceSchema), settingsController.setLeaveBalance);

export default router;
