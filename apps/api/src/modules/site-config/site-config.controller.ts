import { StatusCodes } from 'http-status-codes';

import { catchAsync } from '../../utils/catchAsync.js';
import { sendResponse } from '../../utils/sendResponse.js';
import { ApiError } from '../../utils/ApiError.js';
import { auditService } from '../audit/audit.service.js';
import { siteConfigService } from './site-config.service.js';
import type { UpdateRecruiterIntroDto } from './site-config.validation.js';

const actorOf = (req: { user?: { id: string } }): string => {
  if (!req.user) throw new ApiError(StatusCodes.UNAUTHORIZED, 'Not authenticated');
  return req.user.id;
};

export const siteConfigController = {
  /** GET /site-config/public: unauthenticated, used by the landing page. */
  getPublic: catchAsync(async (_req, res) => {
    const data = await siteConfigService.getPublic();
    // Keep CDNs/browsers from holding a stale toggle.
    res.setHeader('Cache-Control', 'no-store');
    sendResponse(res, { statusCode: StatusCodes.OK, message: 'Site config', data });
  }),

  /** GET /admin/site-config */
  get: catchAsync(async (_req, res) => {
    const data = await siteConfigService.get();
    sendResponse(res, { statusCode: StatusCodes.OK, message: 'Site config', data });
  }),

  /** PATCH /admin/site-config/recruiter-intro */
  updateRecruiterIntro: catchAsync(async (req, res) => {
    const actorId = actorOf(req);
    const before = await siteConfigService.get();
    const patch = req.body as UpdateRecruiterIntroDto;
    const data = await siteConfigService.updateRecruiterIntro(patch, actorId);

    // Never write the demo password into the audit trail.
    const changed = Object.keys(patch).filter(
      (k) =>
        before.recruiterIntro[k as keyof typeof before.recruiterIntro] !==
        data.recruiterIntro[k as keyof typeof data.recruiterIntro],
    );
    void auditService.recordFromRequest(req, {
      actorId,
      action: 'site_config.update',
      target: { type: 'SiteConfig', label: 'recruiterIntro' },
      diff:
        before.recruiterIntro.enabled !== data.recruiterIntro.enabled
          ? { enabled: { from: before.recruiterIntro.enabled, to: data.recruiterIntro.enabled } }
          : undefined,
      context: { changed },
    });

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      message: 'Recruiter intro updated',
      data,
    });
  }),
};
