import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as payrollController from './payroll.controller';
import { uploadPayslipFiles } from './payroll.upload';
import { listPayslipsSchema } from './payroll.validation';

const router = Router();

router.use(authenticate);

router.get(
  '/payslips',
  requirePermission('payroll'),
  validate(listPayslipsSchema, 'query'),
  payrollController.listPayslips,
);
router.post(
  '/payslips/bulk',
  requirePermission('payroll', 'MANAGE'),
  uploadPayslipFiles,
  payrollController.uploadPayslips,
);
router.get(
  '/payslips/:id/download',
  requirePermission('payroll'),
  payrollController.downloadPayslip,
);

export default router;
