import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createTicketController } from './ticket.controller';
import {
  categorySchema,
  commentSchema,
  createTicketSchema,
  listTicketsQuerySchema,
  updateCategorySchema,
  updateTicketSchema,
} from './ticket.validation';

const router = Router();
const controller = createTicketController('IT_SUPPORT', 'it-support');

const MANAGE = requirePermission('it-support', 'MANAGE');

router.use(authenticate, requirePermission('it-support'));

// Categories (active — for ticket creation)
router.get('/categories', controller.listCategories);
// Categories (all — admin management)
router.get('/categories/all', MANAGE, controller.listAllCategories);
router.post('/categories', MANAGE, validate(categorySchema), controller.createCategory);
router.patch('/categories/:id', MANAGE, validate(updateCategorySchema), controller.updateCategory);

// Stats
router.get('/stats', controller.getStats);

// Assignees
router.get('/assignees', controller.listAssignees);

// Tickets
router.get('/', validate(listTicketsQuerySchema, 'query'), controller.listTickets);
router.post('/', validate(createTicketSchema), controller.createTicket);
router.get('/:id', controller.getTicket);
router.patch('/:id', MANAGE, validate(updateTicketSchema), controller.updateTicket);
router.post('/:id/comments', validate(commentSchema), controller.addComment);

export default router;
