import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as notificationsController from './notifications.controller';
import { listNotificationsSchema } from './notifications.validation';

const router = Router();
router.use(authenticate);
router.get('/', validate(listNotificationsSchema, 'query'), notificationsController.list);
router.patch('/read-all', notificationsController.markAllRead);
router.patch('/:id/read', notificationsController.markRead);

export default router;
