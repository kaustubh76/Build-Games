/**
 * Safe JSON parser for 0G Compute AI responses.
 *
 * AI models often return JSON wrapped in markdown code fences, with trailing
 * commentary, or slightly malformed. This utility handles all those cases
 * and returns a parsed object or null.
 */

/**
 * Attempt to parse a JSON object or array from an AI response string.
 *
 * Handles:
 *  - Markdown code fences (```json ... ```)
 *  - Leading/trailing whitespace and text
 *  - Nested braces inside JSON values
 *
 * @returns The parsed object, or `null` if parsing fails.
 */
export function safeParseAIResponse<T = Record<string, unknown>>(
  raw: string | null | undefined
): T | null {
  if (!raw || raw.trim().length === 0) return null;

  // 1. Strip markdown code fences
  let cleaned = raw
    .replace(/^```(?:json|JSON|js|javascript)?\s*\n?/gm, '')
    .replace(/\n?\s*```$/gm, '')
    .trim();

  // 2. Try direct parse first (cheapest path)
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // continue to extraction
  }

  // 3. Extract the first top-level { ... } or [ ... ] block
  const extracted = extractJsonBlock(cleaned);
  if (extracted) {
    try {
      return JSON.parse(extracted) as T;
    } catch {
      // continue to fallback
    }
  }

  // 4. Last resort: try to find any JSON-like substring
  const braceMatch = cleaned.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]) as T;
    } catch {
      // fall through
    }
  }

  console.warn(
    '[safeParseAIResponse] Failed to parse AI response:',
    cleaned.length > 300 ? cleaned.slice(0, 300) + '...' : cleaned
  );
  return null;
}

/**
 * Extract the first balanced JSON block from a string.
 * Respects nested braces and string literals.
 */
function extractJsonBlock(text: string): string | null {
  // Find the first { or [
  const startChar = text.indexOf('{') !== -1 && (text.indexOf('[') === -1 || text.indexOf('{') < text.indexOf('['))
    ? '{'
    : '[';
  const endChar = startChar === '{' ? '}' : ']';

  const startIdx = text.indexOf(startChar);
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === startChar) depth++;
    else if (ch === endChar) depth--;

    if (depth === 0) {
      return text.slice(startIdx, i + 1);
    }
  }

  return null;
}
