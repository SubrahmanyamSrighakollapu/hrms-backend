import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as expenseController from './expense.controller';
import { uploadExpenseReceipt } from './expense.upload';
import {
  categorySchema,
  createClaimSchema,
  decisionSchema,
  listClaimsQuerySchema,
  reimburseSchema,
  reportQuerySchema,
  updateCategorySchema,
  updateClaimSchema,
} from './expense.validation';

const router = Router();
const MANAGE = requirePermission('expenses', 'MANAGE');

router.use(authenticate, requirePermission('expenses'));

/* Categories — active list is readable by everyone, management is MANAGE-only. */
router.get('/categories', expenseController.listCategories);
router.get('/categories/all', MANAGE, expenseController.listAllCategories);
router.post('/categories', MANAGE, validate(categorySchema), expenseController.createCategory);
router.patch('/categories/:id', MANAGE, validate(updateCategorySchema), expenseController.updateCategory);

/* Meta */
router.get('/stats', expenseController.getStats);
router.get('/employees', MANAGE, expenseController.listEmployees);

/* Reports — self-scoped for employees, org-wide for managers. */
router.get('/report', validate(reportQuerySchema, 'query'), expenseController.getReport);
router.get('/report/export', validate(reportQuerySchema, 'query'), expenseController.exportReport);

/* Claims */
router.get('/', validate(listClaimsQuerySchema, 'query'), expenseController.listClaims);
router.post('/', validate(createClaimSchema), expenseController.createClaim);
router.get('/:id', expenseController.getClaim);
router.patch('/:id', validate(updateClaimSchema), expenseController.updateClaim);
router.delete('/:id', expenseController.deleteClaim);
router.post('/:id/submit', expenseController.submitClaim);

/* Decision + reimbursement (MANAGE) */
router.post('/:id/decision', MANAGE, validate(decisionSchema), expenseController.decideClaim);
router.post('/:id/reimburse', MANAGE, validate(reimburseSchema), expenseController.reimburseClaim);

/* Receipts */
router.post('/:id/items/:itemId/receipt', uploadExpenseReceipt, expenseController.attachReceipt);
router.get('/:id/items/:itemId/receipt', expenseController.downloadReceipt);

export default router;
