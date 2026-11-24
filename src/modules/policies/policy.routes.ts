import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as policyController from './policy.controller';
import { uploadPolicyDocument } from './policy.upload';
import {
  createPolicySchema,
  listPoliciesQuerySchema,
  updatePolicySchema,
} from './policy.validation';

const router = Router();

router.use(authenticate, requirePermission('policies'));

/* List / detail (VIEW) */
router.get('/', validate(listPoliciesQuerySchema, 'query'), policyController.listPolicies);
router.get('/team', policyController.getTeamAcknowledgments);
router.get('/:id', policyController.getPolicy);
router.get('/:id/download', policyController.downloadPolicy);

/* Self-service acknowledgment (VIEW) */
router.post('/:id/acknowledge', policyController.acknowledgePolicy);

/* Write operations (MANAGE) */
router.post(
  '/',
  requirePermission('policies', 'MANAGE'),
  uploadPolicyDocument,
  validate(createPolicySchema),
  policyController.createPolicy,
);
router.patch(
  '/:id',
  requirePermission('policies', 'MANAGE'),
  uploadPolicyDocument,
  validate(updatePolicySchema),
  policyController.updatePolicy,
);
router.delete(
  '/:id',
  requirePermission('policies', 'MANAGE'),
  policyController.deletePolicy,
);
router.patch(
  '/:id/publish',
  requirePermission('policies', 'MANAGE'),
  policyController.publishPolicy,
);

export default router;
