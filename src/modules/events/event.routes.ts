import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as eventController from './event.controller';
import {
  createEventSchema,
  listEventsQuerySchema,
  rsvpSchema,
  updateEventSchema,
} from './event.validation';

const router = Router();

router.use(authenticate, requirePermission('events'));

/* Event CRUD */
router.get('/', validate(listEventsQuerySchema, 'query'), eventController.listEvents);
router.get('/mine', eventController.getMyRsvps);
router.get('/:id', eventController.getEvent);

router.post(
  '/',
  requirePermission('events', 'MANAGE'),
  validate(createEventSchema),
  eventController.createEvent,
);
router.patch(
  '/:id',
  requirePermission('events', 'MANAGE'),
  validate(updateEventSchema),
  eventController.updateEvent,
);
router.delete(
  '/:id',
  requirePermission('events', 'MANAGE'),
  eventController.deleteEvent,
);

/* RSVP (any authenticated user with VIEW access) */
router.post('/:id/rsvp', validate(rsvpSchema), eventController.rsvpToEvent);

export default router;
