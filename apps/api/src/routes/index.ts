import { Router } from 'express';

import { authRouter } from '../modules/auth/auth.routes.js';
import { userRouter } from '../modules/user/user.routes.js';
import { salahRouter } from '../modules/salah/salah.routes.js';
import { quranRouter } from '../modules/quran/quran.routes.js';
import { dhikrRouter } from '../modules/dhikr/dhikr.routes.js';
import { habitRouter } from '../modules/habit/habit.routes.js';
import { checklistRouter } from '../modules/checklist/checklist.routes.js';
import { statsRouter } from '../modules/stats/stats.routes.js';
import { adminRouter } from '../modules/admin/admin.routes.js';
import { guestAiRouter, clientAiRouter, adminAiRouter } from '../modules/ai/ai.routes.js';
import { aiConfigRouter } from '../modules/ai/ai-config.routes.js';
import { clientReportRouter, adminReportRouter } from '../modules/report/report.routes.js';
import {
  adminOnboardingRouter,
  clientOnboardingRouter,
} from '../modules/onboarding/onboarding.routes.js';
import { releaseRouter } from '../modules/release/release.route.js';
import {
  adminSiteConfigRouter,
  publicSiteConfigRouter,
} from '../modules/site-config/site-config.routes.js';

export const apiRouter = Router();

apiRouter.get('/', (_req, res) => {
  res.json({ name: 'Ibadah API', version: 'v1' });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/salah', salahRouter);
apiRouter.use('/quran', quranRouter);
apiRouter.use('/dhikr', dhikrRouter);
apiRouter.use('/habits', habitRouter);
apiRouter.use('/checklist', checklistRouter);
apiRouter.use('/stats', statsRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/ai/guest', guestAiRouter);
apiRouter.use('/ai/client', clientAiRouter);
apiRouter.use('/ai/admin', adminAiRouter);
apiRouter.use('/ai/config', aiConfigRouter);
apiRouter.use('/reports/client', clientReportRouter);
apiRouter.use('/reports/admin', adminReportRouter);
apiRouter.use('/onboarding', clientOnboardingRouter);
apiRouter.use('/admin/onboarding', adminOnboardingRouter);
apiRouter.use('/releases', releaseRouter);
apiRouter.use('/site-config', publicSiteConfigRouter);
apiRouter.use('/admin/site-config', adminSiteConfigRouter);
