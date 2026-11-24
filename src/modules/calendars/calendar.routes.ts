import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as calendarController from './calendar.controller';
import { calendarEventsQuerySchema } from './calendar.validation';

const router = Router();

router.use(authenticate, requirePermission('calendars'));

router.get(
  '/events',
  validate(calendarEventsQuerySchema, 'query'),
  calendarController.getEvents,
);

export default router;
