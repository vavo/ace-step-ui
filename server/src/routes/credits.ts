import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { claimDailyCredits, CREDIT_AMOUNTS, getCreditLedger, getCreditSummary } from '../services/credits.js';

const router = Router();

router.get('/balance', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({
      credits: getCreditSummary(req.user!.id),
      costs: {
        lyricsDraft: CREDIT_AMOUNTS.lyricDraft,
        generationVariation: CREDIT_AMOUNTS.generationVariation,
      },
      daily: {
        claimAmount: CREDIT_AMOUNTS.dailyClaim,
        freeBalanceCap: CREDIT_AMOUNTS.freeBalanceCap,
        streakBonusStep: CREDIT_AMOUNTS.streakBonusStep,
        streakBonusMax: CREDIT_AMOUNTS.streakBonusMax,
      },
    });
  } catch (error) {
    console.error('Get credit balance error:', error);
    res.status(500).json({ error: 'Failed to load credits' });
  }
});

router.get('/ledger', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
    res.json({ entries: getCreditLedger(req.user!.id, Number.isFinite(limit) ? limit : 50) });
  } catch (error) {
    console.error('Get credit ledger error:', error);
    res.status(500).json({ error: 'Failed to load credit ledger' });
  }
});

router.post('/claim-daily', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ credits: claimDailyCredits(req.user!.id) });
  } catch (error) {
    console.error('Claim daily credits error:', error);
    res.status(500).json({ error: 'Failed to claim daily credits' });
  }
});

export default router;
