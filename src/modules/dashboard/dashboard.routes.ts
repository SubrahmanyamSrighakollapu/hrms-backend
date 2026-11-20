import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import * as dashboardController from './dashboard.controller';

const router = Router();
router.use(authenticate, requirePermission('dashboard'));
router.get('/summary', dashboardController.summary);

export default router;
