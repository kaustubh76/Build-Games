import { NextApiRequest, NextApiResponse } from 'next';
import { encodePacked, keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { logger } from '../../lib/logger';
import { chatCompletion as zgChatCompletion, isZgComputeConfigured } from '../../services/zgComputeService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { battlePrompt } = req.body;

    if (!battlePrompt || typeof battlePrompt !== 'object') {
      return res.status(400).json({ error: 'battlePrompt is required and must be an object' });
    }

    logger.debug('Generating battle moves for battle prompt');

    const userMessage = `You are a battle AI. Given the following warriors and their stats, determine what move each warrior should make.

Warrior 1: ${JSON.stringify(battlePrompt.agent_1)}
Warrior 2: ${JSON.stringify(battlePrompt.agent_2)}

Available moves: ${battlePrompt.moveset?.join(', ') || 'strike, taunt, dodge, recover, special_move'}

Respond with JSON only: {"agent_1": "<move>", "agent_2": "<move>"}`;

    if (!isZgComputeConfigured()) {
      return res.status(503).json({ error: '0G Compute not configured. Set ZG_PRIVATE_KEY and ZG_COMPUTE_PROVIDER.' });
    }

    const battleMoves = await zgChatCompletion(
      [{ role: 'user', content: userMessage }],
      { temperature: 0.7, maxTokens: 100 }
    );

    if (!battleMoves) {
      throw new Error('AI returned empty response');
    }

    logger.debug('Generated battle moves');

    // Parse the AI response to get the moves
    const cleaned = battleMoves.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsedMoves = JSON.parse(cleaned);

    // Map move names to contract enum values (same as arena page)
    const moveMapping: { [key: string]: number } = {
      'strike': 0,
      'taunt': 1,
      'dodge': 2,
      'special_move': 3,
      'recover': 4
    };

    const warriorsOneMove = moveMapping[parsedMoves.agent_1.toLowerCase()] ?? 0;
    const warriorsTwoMove = moveMapping[parsedMoves.agent_2.toLowerCase()] ?? 0;

    logger.debug('API: Mapped moves:', {
      agent_1: parsedMoves.agent_1,
      agent_2: parsedMoves.agent_2,
      warriorsOneMove,
      warriorsTwoMove
    });

    // Generate signature for the arena contract using the AI signer private key
    // IMPORTANT: This key should be set as an environment variable, never hardcoded
    const aiSignerPrivateKey = process.env.AI_SIGNER_PRIVATE_KEY;

    if (!aiSignerPrivateKey) {
      logger.error('AI_SIGNER_PRIVATE_KEY environment variable is not set');
      return res.status(500).json({
        success: false,
        error: 'Server configuration error: AI signer key not configured'
      });
    }

    // Create signature exactly as the contract expects
    const dataToSign = encodePacked(['uint8', 'uint8'], [warriorsOneMove, warriorsTwoMove]);
    const dataHash = keccak256(dataToSign);

    // Sign with AI signer private key (viem automatically adds Ethereum message prefix)
    const aiSignerAccount = privateKeyToAccount(aiSignerPrivateKey as `0x${string}`);
    const signature = await aiSignerAccount.signMessage({
      message: { raw: dataHash }
    });

    logger.debug('API: Generated signature for arena contract:', signature);

    // Return the response in the expected format with signature
    res.status(200).json({
      success: true,
      response: battleMoves,
      signature: signature,
      moves: {
        agent_1: { move: parsedMoves.agent_1 },
        agent_2: { move: parsedMoves.agent_2 }
      },
      contractMoves: {
        warriorsOneMove,
        warriorsTwoMove
      }
    });

  } catch (error) {
    logger.error('API: Error generating battle moves:', error);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}
