import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as reportsController from './reports.controller';
import { reportQuerySchema } from './reports.validation';

const router = Router();
router.use(authenticate, requirePermission('reports'));
router.get('/summary', validate(reportQuerySchema, 'query'), reportsController.summary);

export default router;
