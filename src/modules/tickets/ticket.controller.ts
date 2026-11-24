import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import * as ticketService from './ticket.service';
import type {
  CategoryInput,
  CommentInput,
  CreateTicketInput,
  ListTicketsQuery,
  TicketModule,
  UpdateCategoryInput,
  UpdateTicketInput,
} from './ticket.validation';

function actorId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

function canManage(req: Request, moduleId: string): boolean {
  if (!req.user) return false;
  return req.user.permissions?.[moduleId] === 'MANAGE';
}

export function createTicketController(module: TicketModule, moduleId: string) {
  const listCategories = asyncHandler(async (_req: Request, res: Response) => {
    const categories = await ticketService.listCategories(module);
    res.status(200).json({ success: true, data: { categories } });
  });

  const listAllCategories = asyncHandler(async (_req: Request, res: Response) => {
    const categories = await ticketService.listAllCategories(module);
    res.status(200).json({ success: true, data: { categories } });
  });

  const createCategory = asyncHandler(async (req: Request, res: Response) => {
    const category = await ticketService.createCategory(module, req.body as CategoryInput);
    res.status(201).json({ success: true, data: { category } });
  });

  const updateCategory = asyncHandler(async (req: Request, res: Response) => {
    const category = await ticketService.updateCategory(module, req.params.id, req.body as UpdateCategoryInput);
    res.status(200).json({ success: true, data: { category } });
  });

  const listTickets = asyncHandler(async (req: Request, res: Response) => {
    const result = await ticketService.listTickets(
      module,
      actorId(req),
      req.query as unknown as ListTicketsQuery,
      canManage(req, moduleId),
    );
    res.status(200).json({ success: true, data: result });
  });

  const getTicket = asyncHandler(async (req: Request, res: Response) => {
    const ticket = await ticketService.getTicket(
      module,
      req.params.id,
      actorId(req),
      canManage(req, moduleId),
    );
    res.status(200).json({ success: true, data: { ticket } });
  });

  const createTicket = asyncHandler(async (req: Request, res: Response) => {
    const ticket = await ticketService.createTicket(module, actorId(req), req.body as CreateTicketInput);
    res.status(201).json({ success: true, data: { ticket } });
  });

  const updateTicket = asyncHandler(async (req: Request, res: Response) => {
    const ticket = await ticketService.updateTicket(module, req.params.id, req.body as UpdateTicketInput);
    res.status(200).json({ success: true, data: { ticket } });
  });

  const addComment = asyncHandler(async (req: Request, res: Response) => {
    const comment = await ticketService.addComment(
      module,
      req.params.id,
      actorId(req),
      req.body as CommentInput,
      canManage(req, moduleId),
    );
    res.status(201).json({ success: true, data: { comment } });
  });

  const getStats = asyncHandler(async (req: Request, res: Response) => {
    const stats = await ticketService.getTicketStats(module, actorId(req), canManage(req, moduleId));
    res.status(200).json({ success: true, data: { stats } });
  });

  const listAssignees = asyncHandler(async (_req: Request, res: Response) => {
    const assignees = await ticketService.listAssignees();
    res.status(200).json({ success: true, data: { assignees } });
  });

  return {
    listCategories,
    listAllCategories,
    createCategory,
    updateCategory,
    listTickets,
    getTicket,
    createTicket,
    updateTicket,
    addComment,
    getStats,
    listAssignees,
  };
}
