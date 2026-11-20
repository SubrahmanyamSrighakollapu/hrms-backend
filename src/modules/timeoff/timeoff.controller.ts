import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import type {
  ApproveRejectInput,
  CreateTimeOffInput,
  ListTimeOffQuery,
  UpdateApprovalFlowInput,
} from './timeoff.validation';
import * as timeoffService from './timeoff.service';

function actorId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

function actorRoleId(req: Request): string | null {
  return req.user?.roleId ?? null;
}

/* ---- employee self-service ---- */

export const balances = asyncHandler(async (req: Request, res: Response) => {
  const data = await timeoffService.listLeaveBalances(actorId(req));
  res.status(200).json({ success: true, data: { balances: data } });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await timeoffService.listRequests(
    actorId(req),
    req.query as unknown as ListTimeOffQuery,
  );
  res.status(200).json({ success: true, data: result });
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  const request = await timeoffService.getRequest(req.params.id);
  res.status(200).json({ success: true, data: { request } });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const request = await timeoffService.createRequest(actorId(req), req.body as CreateTimeOffInput);
  res.status(201).json({ success: true, data: { request } });
});

/* ---- approval (configured approver role) ---- */

export const inbox = asyncHandler(async (req: Request, res: Response) => {
  const roleId = actorRoleId(req);
  if (!roleId) throw ApiError.forbidden('Your account has no role assigned');
  const result = await timeoffService.listPendingForApprover(
    roleId,
    req.query as unknown as ListTimeOffQuery,
  );
  res.status(200).json({ success: true, data: result });
});

export const approve = asyncHandler(async (req: Request, res: Response) => {
  const request = await timeoffService.decideRequest(
    req.params.id,
    actorId(req),
    actorRoleId(req),
    'APPROVED',
    req.body as ApproveRejectInput,
  );
  res.status(200).json({ success: true, data: { request } });
});

export const reject = asyncHandler(async (req: Request, res: Response) => {
  const request = await timeoffService.decideRequest(
    req.params.id,
    actorId(req),
    actorRoleId(req),
    'REJECTED',
    req.body as ApproveRejectInput,
  );
  res.status(200).json({ success: true, data: { request } });
});

/* ---- admin: approval flow configuration ---- */

export const listFlows = asyncHandler(async (_req: Request, res: Response) => {
  const flows = await timeoffService.listApprovalFlows();
  res.status(200).json({ success: true, data: { flows } });
});

export const updateFlow = asyncHandler(async (req: Request, res: Response) => {
  const flow = await timeoffService.updateApprovalFlow(
    req.params.type,
    req.body as UpdateApprovalFlowInput,
  );
  res.status(200).json({ success: true, data: { flow } });
});
