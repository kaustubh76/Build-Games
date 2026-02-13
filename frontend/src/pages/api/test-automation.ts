// Test endpoint for command-based automation debugging
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialize a test battle using command-based system
    const testBattleId = '0x1234567890123456789012345678901234567890';
    
    console.log(`🧪 TEST: Initializing command-based automation for battle ${testBattleId}`);
    
    // Call our command-based automation API to initialize
    const baseURL = req.headers.origin || 'http://localhost:3000';
    const initResponse = await fetch(`${baseURL}/api/arena/commands?battleId=${testBattleId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'initialize',
        warriors1Id: 1,
        warriors2Id: 2,
      }),
    });

    if (!initResponse.ok) {
      throw new Error('Failed to initialize test battle');
    }

    const initData = await initResponse.json();
    console.log('🧪 TEST: Command-based automation initialized:', initData);

    // Wait a moment and get the state
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const stateResponse = await fetch(`${baseURL}/api/arena/commands?battleId=${testBattleId}`);
    const stateData = await stateResponse.json();
    
    console.log('🧪 TEST: Current state:', stateData);

    return res.status(200).json({
      message: 'Test command-based automation initialized',
      battleId: testBattleId,
      initialState: initData,
      currentState: stateData,
    });
  } catch (error) {
    console.error('🧪 TEST ERROR:', error);
    return res.status(500).json({ 
      error: 'Test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
