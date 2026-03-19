import { NextRequest, NextResponse } from 'next/server';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';
import { chatCompletion as zgChatCompletion, isZgComputeConfigured } from '@/services/zgComputeService';

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting (10 activations per minute)
    applyRateLimit(request, {
      prefix: 'activate-warriors',
      maxRequests: 10,
      windowMs: 60000,
    });

    // Require 0G Compute
    if (!isZgComputeConfigured()) {
      throw ErrorResponses.serviceUnavailable('0G Compute not configured. Set ZG_PRIVATE_KEY and ZG_COMPUTE_PROVIDER.');
    }

    const body = await request.json();
    const { warriorsData } = body;

    if (!warriorsData) {
      throw ErrorResponses.badRequest('Missing warriorsData');
    }

    // Build warrior profile from input
    const personality = Array.isArray(warriorsData.personality)
      ? warriorsData.personality
      : (warriorsData.personality ? warriorsData.personality.split(', ') : ['Brave', 'Skilled']);
    const knowledgeAreas = Array.isArray(warriorsData.knowledge_areas)
      ? warriorsData.knowledge_areas
      : (warriorsData.knowledge_areas ? warriorsData.knowledge_areas.split(', ') : ['Combat', 'Strategy']);

    const prompt = `You are a warrior traits generator for a blockchain battle arena game. Given the following warrior profile, generate detailed combat traits and special abilities.

Warrior Profile:
- Name: ${warriorsData.name || 'Unknown Warrior'}
- Bio: ${warriorsData.bio || 'A legendary warrior'}
- Life History: ${warriorsData.life_history || 'History unknown'}
- Personality: ${personality.join(', ')}
- Knowledge Areas: ${knowledgeAreas.join(', ')}

Generate a detailed combat profile as JSON with this EXACT format:
{
  "traits": {
    "Strength": <0-10000>,
    "Wit": <0-10000>,
    "Charisma": <0-10000>,
    "Defence": <0-10000>,
    "Luck": <0-10000>
  },
  "moves": {
    "strike_attack": "<descriptive attack move>",
    "taunt_attack": "<descriptive taunt phrase>",
    "dodge": "<descriptive evasion move>",
    "recover": "<descriptive recovery move>",
    "special_move": "<unique powerful special move>"
  },
  "battle_cry": "<warrior's battle cry>",
  "weakness": "<warrior's weakness>"
}

Base trait values on personality (aggressive = high Strength, clever = high Wit, etc.).
Respond with valid JSON only, no explanation.`;

    console.log('[Activate Warriors] Sending to 0G Compute...');

    const aiResponse = await zgChatCompletion(
      [{ role: 'user', content: prompt }],
      { temperature: 0.7, maxTokens: 1000 }
    );

    if (!aiResponse) {
      throw new Error('0G Compute returned empty response');
    }

    return NextResponse.json({
      success: true,
      response: aiResponse
    });

  } catch (error) {
    return handleAPIError(error, 'API:ActivateWarriors:POST');
  }
}
