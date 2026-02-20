import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';
import { logger } from '../../lib/logger';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { personalityAttributes } = req.body;

    if (!personalityAttributes || typeof personalityAttributes !== 'object') {
      return res.status(400).json({ error: 'personalityAttributes is required and must be an object' });
    }

    logger.debug('Generating warrior traits and moves');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'user',
          content: `You are a game character designer for a blockchain warrior battle game. Based on these personality attributes, generate warrior traits and special moves.

Personality: ${JSON.stringify(personalityAttributes)}

Generate response as JSON with this EXACT format (traits use 0-10000 scale, where 5000 is average):
{
  "Strength": <0-10000>,
  "Wit": <0-10000>,
  "Charisma": <0-10000>,
  "Defence": <0-10000>,
  "Luck": <0-10000>,
  "strike_attack": "<descriptive attack move name>",
  "taunt_attack": "<descriptive taunt phrase>",
  "dodge": "<descriptive evasion move>",
  "recover": "<descriptive recovery/heal move>",
  "special_move": "<unique powerful special move name>"
}

IMPORTANT:
- Use capitalized keys: Strength, Wit, Charisma, Defence, Luck
- Use underscore keys for moves: strike_attack, taunt_attack, dodge, recover, special_move
- Trait values MUST be numbers between 0 and 10000
- Base traits on personality (e.g., aggressive = high Strength, clever = high Wit)

Respond with valid JSON only, no explanation.`,
        },
      ],
      max_tokens: 400,
      temperature: 0.7,
    });

    const traitsMovesJson = completion.choices[0]?.message?.content;

    if (!traitsMovesJson) {
      throw new Error('AI returned empty response');
    }

    logger.debug('Generated warrior traits and moves');

    // Parse the response
    let traitsAndMoves;
    try {
      traitsAndMoves = JSON.parse(traitsMovesJson);
    } catch (parseError) {
      logger.error('Failed to parse AI response:', traitsMovesJson);
      throw new Error('AI returned invalid JSON format');
    }

    // Validate the response has required fields
    const requiredFields = ['Strength', 'Wit', 'Charisma', 'Defence', 'Luck', 'strike_attack', 'taunt_attack', 'dodge', 'recover', 'special_move'];
    const missingFields = requiredFields.filter(field => !(field in traitsAndMoves));

    if (missingFields.length > 0) {
      logger.error('AI response missing fields:', missingFields);
      throw new Error(`AI response missing required fields: ${missingFields.join(', ')}`);
    }

    // Ensure trait values are in valid range (0-10000)
    const traitFields = ['Strength', 'Wit', 'Charisma', 'Defence', 'Luck'];
    for (const trait of traitFields) {
      const value = traitsAndMoves[trait];
      if (typeof value !== 'number' || value < 0 || value > 10000) {
        logger.warn(`Invalid ${trait} value: ${value}, clamping to valid range`);
        traitsAndMoves[trait] = Math.max(0, Math.min(10000, Number(value) || 5000));
      }
    }

    // Return as JSON string since the page expects to JSON.parse it
    res.status(200).json({
      success: true,
      traitsAndMoves: JSON.stringify(traitsAndMoves)
    });

  } catch (error) {
    logger.error('Error generating warrior traits and moves:', error);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}
