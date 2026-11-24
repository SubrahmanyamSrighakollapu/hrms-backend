import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import * as policyService from './policy.service';
import type { CreatePolicyInput, ListPoliciesQuery, UpdatePolicyInput } from './policy.validation';

function actorId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

function canManagePolicies(req: Request): boolean {
  // permissions is a moduleId → level map; MANAGE grants full control.
  return req.user?.permissions['policies'] === 'MANAGE';
}

export const listPolicies = asyncHandler(async (req: Request, res: Response) => {
  const isManage = canManagePolicies(req);
  const policies = await policyService.listPolicies(
    actorId(req),
    isManage,
    req.query as ListPoliciesQuery,
  );
  res.status(200).json({ success: true, data: { policies } });
});

export const getPolicy = asyncHandler(async (req: Request, res: Response) => {
  const isManage = canManagePolicies(req);
  const policy = await policyService.getPolicy(req.params.id, actorId(req), isManage);
  res.status(200).json({ success: true, data: { policy } });
});

export const createPolicy = asyncHandler(async (req: Request, res: Response) => {
  const policy = await policyService.createPolicy(
    actorId(req),
    req.body as CreatePolicyInput,
    req.file,
  );
  res.status(201).json({ success: true, data: { policy } });
});

export const updatePolicy = asyncHandler(async (req: Request, res: Response) => {
  const policy = await policyService.updatePolicy(
    req.params.id,
    req.body as UpdatePolicyInput,
    req.file,
  );
  res.status(200).json({ success: true, data: { policy } });
});

export const deletePolicy = asyncHandler(async (req: Request, res: Response) => {
  const result = await policyService.deletePolicy(req.params.id);
  res.status(200).json({ success: true, data: result });
});

export const publishPolicy = asyncHandler(async (req: Request, res: Response) => {
  const policy = await policyService.publishPolicy(req.params.id);
  res.status(200).json({ success: true, data: { policy } });
});

export const downloadPolicy = asyncHandler(async (req: Request, res: Response, next) => {
  const isManage = canManagePolicies(req);
  const file = await policyService.downloadPolicy(req.params.id, isManage);
  res.download(file.absolutePath, file.filename, (error) => {
    if (!error) return;
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    next(error);
  });
});

export const acknowledgePolicy = asyncHandler(async (req: Request, res: Response) => {
  const ack = await policyService.acknowledgePolicy(req.params.id, actorId(req));
  res.status(201).json({ success: true, data: { acknowledgment: ack } });
});

export const getTeamAcknowledgments = asyncHandler(async (req: Request, res: Response) => {
  const policyId = req.query.policyId ? String(req.query.policyId) : undefined;
  const result = await policyService.getTeamAcknowledgments(actorId(req), policyId);
  res.status(200).json({ success: true, data: result });
});
