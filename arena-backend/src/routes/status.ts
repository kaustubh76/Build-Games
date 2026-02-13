import { Router, Request, Response } from 'express';
import { gameStates } from './commands';

const router = Router();

// GET /api/arena/status?battleId=xxx
router.get('/', async (req: Request, res: Response) => {
  const { battleId } = req.query;
  if (!battleId || typeof battleId !== 'string') {
    return res.status(400).json({ error: 'Battle ID is required' });
  }

  try {
    const gameState = gameStates.get(battleId);
    
    // Return 200 with null gameState instead of 404 to prevent useArenaSync errors
    // This endpoint is for reading state only, not consuming commands
    return res.status(200).json({
      gameState: gameState || null
    });
  } catch (error) {
    console.error('Status API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export const statusRouter = router; 