/**
 * Test script for AI NFT minting flow
 * Run: npx tsx test-ai-minting.ts
 * Requires: Next.js dev server running on localhost:3000
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function test1_generateAttributes(): Promise<Record<string, any> | null> {
  console.log('\n=== TEST 1: Generate Warrior Attributes ===');
  try {
    const res = await fetch(`${BASE_URL}/api/generate-warrior-attributes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'A fierce shadow ninja who thrives in darkness' }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      console.log('FAIL:', data.error || `HTTP ${res.status}`);
      return null;
    }

    const attributes = JSON.parse(data.attributes);
    const required = ['name', 'bio', 'life_history', 'adjectives', 'knowledge_areas'];
    const missing = required.filter(f => !(f in attributes));

    if (missing.length > 0) {
      console.log('FAIL: Missing fields:', missing);
      return null;
    }

    console.log('PASS');
    console.log('  Name:', attributes.name);
    console.log('  Bio:', attributes.bio.substring(0, 80) + '...');
    console.log('  Adjectives:', attributes.adjectives.join(', '));
    console.log('  Skills:', attributes.knowledge_areas.join(', '));
    return attributes;
  } catch (err: any) {
    console.log('FAIL:', err.message);
    return null;
  }
}

async function test2_generateTraitsMoves(attributes: Record<string, any>): Promise<Record<string, any> | null> {
  console.log('\n=== TEST 2: Generate Traits & Moves ===');
  try {
    const res = await fetch(`${BASE_URL}/api/generate-warrior-traits-moves`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personalityAttributes: attributes }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      console.log('FAIL:', data.error || `HTTP ${res.status}`);
      return null;
    }

    const tm = JSON.parse(data.traitsAndMoves);
    const traitFields = ['Strength', 'Wit', 'Charisma', 'Defence', 'Luck'];
    const moveFields = ['strike_attack', 'taunt_attack', 'dodge', 'recover', 'special_move'];

    // Validate traits
    for (const t of traitFields) {
      if (typeof tm[t] !== 'number' || tm[t] < 0 || tm[t] > 10000) {
        console.log(`FAIL: Invalid ${t}:`, tm[t]);
        return null;
      }
    }

    // Validate moves
    for (const m of moveFields) {
      if (typeof tm[m] !== 'string' || !tm[m]) {
        console.log(`FAIL: Invalid ${m}:`, tm[m]);
        return null;
      }
    }

    console.log('PASS');
    for (const t of traitFields) console.log(`  ${t}: ${tm[t]}`);
    for (const m of moveFields) console.log(`  ${m}: ${tm[m]}`);
    return tm;
  } catch (err: any) {
    console.log('FAIL:', err.message);
    return null;
  }
}

async function test3_signTraits(traitsAndMoves: Record<string, any>): Promise<boolean> {
  console.log('\n=== TEST 3: Sign Traits (Game Master) ===');
  try {
    const res = await fetch(`${BASE_URL}/api/sign-traits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenId: 99, // test token ID
        strength: traitsAndMoves.Strength,
        wit: traitsAndMoves.Wit,
        charisma: traitsAndMoves.Charisma,
        defence: traitsAndMoves.Defence,
        luck: traitsAndMoves.Luck,
        strike: traitsAndMoves.strike_attack,
        taunt: traitsAndMoves.taunt_attack,
        dodge: traitsAndMoves.dodge,
        special: traitsAndMoves.special_move,
        recover: traitsAndMoves.recover,
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      console.log('FAIL:', data.error || `HTTP ${res.status}`);
      return false;
    }

    if (!data.signature || !data.gameMasterAddress) {
      console.log('FAIL: Missing signature or gameMasterAddress');
      return false;
    }

    console.log('PASS');
    console.log('  Signature:', data.signature.substring(0, 30) + '...');
    console.log('  Game Master:', data.gameMasterAddress);
    console.log('  Expires:', new Date(data.expiresAt * 1000).toISOString());
    return true;
  } catch (err: any) {
    console.log('FAIL:', err.message);
    return false;
  }
}

async function main() {
  console.log('Testing AI NFT Minting Flow');
  console.log('Server:', BASE_URL);

  const attributes = await test1_generateAttributes();
  if (!attributes) {
    console.log('\n=> Test 1 failed, skipping remaining tests.');
    process.exit(1);
  }

  const traitsAndMoves = await test2_generateTraitsMoves(attributes);
  if (!traitsAndMoves) {
    console.log('\n=> Test 2 failed, skipping Test 3.');
    process.exit(1);
  }

  const signed = await test3_signTraits(traitsAndMoves);

  console.log('\n=== SUMMARY ===');
  console.log('Test 1 (Attributes):', '✓ PASS');
  console.log('Test 2 (Traits/Moves):', '✓ PASS');
  console.log('Test 3 (Signing):', signed ? '✓ PASS' : '✗ FAIL');
  process.exit(signed ? 0 : 1);
}

main();
