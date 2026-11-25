import { Router } from 'express';

import { requireAdmin, requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { siteConfigController } from './site-config.controller.js';
import { updateRecruiterIntroSchema } from './site-config.validation.js';

/** Public, no auth. Read by the marketing site on every visit. */
export const publicSiteConfigRouter = Router();
publicSiteConfigRouter.get('/public', siteConfigController.getPublic);

/** Admin only. */
export const adminSiteConfigRouter = Router();
adminSiteConfigRouter.use(requireAuth, requireAdmin);
adminSiteConfigRouter.get('/', siteConfigController.get);
adminSiteConfigRouter.patch(
  '/recruiter-intro',
  validate(updateRecruiterIntroSchema),
  siteConfigController.updateRecruiterIntro,
);
