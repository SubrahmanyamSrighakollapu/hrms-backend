import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as deskController from './desk.controller';
import {
  bookDeskSchema,
  createDeskSchema,
  listBookingsQuerySchema,
  listDesksQuerySchema,
  updateDeskSchema,
} from './desk.validation';

const router = Router();

router.use(authenticate, requirePermission('desk-management'));

/* Desks CRUD (MANAGE) */
router.get('/', validate(listDesksQuerySchema, 'query'), deskController.listDesks);
router.post(
  '/',
  requirePermission('desk-management', 'MANAGE'),
  validate(createDeskSchema),
  deskController.createDesk,
);
router.patch(
  '/:id',
  requirePermission('desk-management', 'MANAGE'),
  validate(updateDeskSchema),
  deskController.updateDesk,
);
router.delete(
  '/:id',
  requirePermission('desk-management', 'MANAGE'),
  deskController.deleteDesk,
);

/* Bookings */
router.get(
  '/bookings',
  requirePermission('desk-management', 'MANAGE'),
  validate(listBookingsQuerySchema, 'query'),
  deskController.listBookings,
);
router.get('/mine', deskController.getMyBookings);
router.post('/:id/book', validate(bookDeskSchema), deskController.bookDesk);
router.delete('/bookings/:bookingId', deskController.cancelBooking);

export default router;
