// LEGACY API endpoints for arena automation - DISABLED
// Use /api/arena/commands.ts for new command-based automation
import { NextApiRequest, NextApiResponse } from 'next';

// LEGACY: This endpoint has been disabled to prevent direct contract calls from backend
// All automation now uses the command-based system via /api/arena/commands.ts

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return res.status(410).json({
    error: 'This legacy automation endpoint has been disabled',
    message: 'Please use the new command-based automation via /api/arena/commands.ts',
    redirect: '/api/arena/commands',
    timestamp: new Date().toISOString(),
    battleId: req.query.battleId
  });
}
