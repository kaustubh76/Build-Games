import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';
import { chatCompletion as zgChatCompletion, isZgComputeConfigured } from '@/services/zgComputeService';
import { safeParseAIResponse } from '@/lib/safeParseAIResponse';

// Hard caps on the strings interpolated into the AI prompt. Without these,
// an attacker passes a 1MB bio with embedded prompt-injection / token bloat
// to either:
//   - run up cost on the 0G Compute provider, or
//   - jailbreak the system prompt and get arbitrary output that the rest
//     of the pipeline trusts as warrior traits.
// The caps are generous enough for legitimate input but stop both attacks.
const TraitString = z.string().max(2_000);
const TraitListField = z.union([z.array(z.string().max(200)), z.string().max(2_000)]).optional();

const PostBodySchema = z.object({
  warriorsData: z.object({
    name: TraitString.optional(),
    bio: TraitString.optional(),
    life_history: z.string().max(4_000).optional(),
    personality: TraitListField,
    knowledge_areas: TraitListField,
  }).passthrough(),
});

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting (10 activations per minute)
    await applyRateLimit(request, {
      prefix: 'activate-warriors',
      maxRequests: 10,
      windowMs: 60000,
    });

    // Require 0G Compute
    if (!isZgComputeConfigured()) {
      throw ErrorResponses.serviceUnavailable('0G Compute not configured. Set ZG_PRIVATE_KEY and ZG_COMPUTE_PROVIDER.');
    }

    const raw = await request.json().catch(() => null);
    const parsedBody = PostBodySchema.safeParse(raw);
    if (!parsedBody.success) {
      throw ErrorResponses.badRequest(
        `Invalid body: ${parsedBody.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
      );
    }
    const { warriorsData } = parsedBody.data;

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

    // Parse and validate the AI response
    const parsed = safeParseAIResponse<{
      traits?: Record<string, number>;
      moves?: Record<string, string>;
      battle_cry?: string;
      weakness?: string;
    }>(aiResponse);

    if (!parsed || !parsed.traits || !parsed.moves) {
      // Return raw string as fallback — client can attempt its own parsing
      return NextResponse.json({ success: true, response: aiResponse });
    }

    // Clamp trait values to 0-10000
    const traits = parsed.traits;
    for (const key of Object.keys(traits)) {
      traits[key] = Math.max(0, Math.min(10000, Math.round(Number(traits[key]) || 5000)));
    }

    return NextResponse.json({
      success: true,
      response: JSON.stringify(parsed),
    });

  } catch (error) {
    return handleAPIError(error, 'API:ActivateWarriors:POST');
  }
}
