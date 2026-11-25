import { Router } from 'express';

import { releaseController } from './release.controller.js';

export const releaseRouter = Router();

// Public — no auth required. This is a marketing/changelog endpoint.
releaseRouter.get('/', releaseController.list);
