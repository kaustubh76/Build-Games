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
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required and must be a string' });
    }

    logger.debug('Generating warrior attributes');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'user',
          content: `You are a creative game character designer for a blockchain warrior battle game. Create a unique warrior character based on this description: ${prompt}

Generate a COMPLETE warrior profile as JSON with this EXACT format:
{
  "name": "<unique warrior name>",
  "bio": "<2-3 sentence character bio/backstory>",
  "life_history": "<paragraph about the warrior's background, training, and how they became a warrior>",
  "adjectives": ["<personality trait 1>", "<trait 2>", "<trait 3>", "<trait 4>", "<trait 5>"],
  "knowledge_areas": ["<skill/expertise 1>", "<skill 2>", "<skill 3>", "<skill 4>"]
}

IMPORTANT:
- Be creative and base the character on the user's description
- adjectives should be personality traits like: Brave, Cunning, Fierce, Wise, Agile, Strategic, etc.
- knowledge_areas should be skills like: Combat, Strategy, Warfare, Stealth, Leadership, etc.
- Make the character unique and interesting

Respond with valid JSON only, no explanation.`,
        },
      ],
      max_tokens: 600,
      temperature: 0.8,
    });

    const attributesJson = completion.choices[0]?.message?.content;

    if (!attributesJson) {
      throw new Error('AI returned empty response');
    }

    logger.debug('Generated warrior attributes');

    // Parse and validate attributes
    let attributes;
    try {
      attributes = JSON.parse(attributesJson);
    } catch (parseError) {
      logger.error('Failed to parse AI response:', attributesJson);
      throw new Error('AI returned invalid JSON format');
    }

    // Validate required fields
    const requiredFields = ['name', 'bio', 'life_history', 'adjectives', 'knowledge_areas'];
    const missingFields = requiredFields.filter(field => !(field in attributes));

    if (missingFields.length > 0) {
      logger.error('AI response missing fields:', missingFields);
      throw new Error(`AI response missing required fields: ${missingFields.join(', ')}`);
    }

    // Ensure arrays are arrays
    if (!Array.isArray(attributes.adjectives)) {
      attributes.adjectives = typeof attributes.adjectives === 'string'
        ? attributes.adjectives.split(',').map((s: string) => s.trim())
        : ['Brave', 'Skilled', 'Strategic'];
    }

    if (!Array.isArray(attributes.knowledge_areas)) {
      attributes.knowledge_areas = typeof attributes.knowledge_areas === 'string'
        ? attributes.knowledge_areas.split(',').map((s: string) => s.trim())
        : ['Combat', 'Strategy', 'Leadership'];
    }

    // Return the JSON response as string (page expects to JSON.parse it)
    res.status(200).json({
      success: true,
      attributes: JSON.stringify(attributes)
    });

  } catch (error) {
    logger.error('Error generating warrior attributes:', error);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}
