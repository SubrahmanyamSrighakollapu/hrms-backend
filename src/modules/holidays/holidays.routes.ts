import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as holidaysController from './holidays.controller';
import {
  createHolidaySchema,
  holidaySettingsSchema,
  listHolidaysQuerySchema,
  updateHolidaySchema,
} from './holidays.validation';

const router = Router();

router.use(authenticate, requirePermission('holidays'));

/* Holidays CRUD (MANAGE) */
router.get('/', validate(listHolidaysQuerySchema, 'query'), holidaysController.listHolidays);
router.post(
  '/',
  requirePermission('holidays', 'MANAGE'),
  validate(createHolidaySchema),
  holidaysController.createHoliday,
);
router.patch(
  '/:id',
  requirePermission('holidays', 'MANAGE'),
  validate(updateHolidaySchema),
  holidaysController.updateHoliday,
);
router.delete(
  '/:id',
  requirePermission('holidays', 'MANAGE'),
  holidaysController.deleteHoliday,
);

/* Settings */
router.get('/settings', holidaysController.getSettings);
router.put(
  '/settings',
  requirePermission('holidays', 'MANAGE'),
  validate(holidaySettingsSchema),
  holidaysController.updateSettings,
);

/* Self-service avails */
router.get('/mine', holidaysController.getMyAvails);
router.post('/:id/avail', holidaysController.availHoliday);
router.delete('/:id/avail', holidaysController.cancelAvail);

/* Manager team view */
router.get('/team', holidaysController.getTeamAvails);

export default router;
