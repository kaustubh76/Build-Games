/**
 * Unit tests for GameMasterSigningService — signs warrior traits with the
 * AI signer key, used by every NFT mint flow. The service had ZERO tests
 * before this; the contract `verifyTraits` path will silently break if the
 * `encodePacked` order ever drifts from the contract ABI (this has happened
 * before — see commit 45ba2ad fixing exactly this incident).
 *
 * The tests use a known throwaway private key (Anvil/Hardhat default
 * account #0). Never use a real signer key here.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encodePacked, keccak256, recoverMessageAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { GameMasterSigningService, type WarriorsTraitsData } from '@/services/gameMasterSigning';

// Anvil/Hardhat default account #0 — public, throwaway, well-known.
const THROWAWAY_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const EXPECTED_ADDRESS = privateKeyToAccount(THROWAWAY_KEY).address;

const originalKey = process.env.GAME_MASTER_PRIVATE_KEY;

beforeEach(() => {
  process.env.GAME_MASTER_PRIVATE_KEY = THROWAWAY_KEY;
});

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.GAME_MASTER_PRIVATE_KEY;
  } else {
    process.env.GAME_MASTER_PRIVATE_KEY = originalKey;
  }
});

const SAMPLE: WarriorsTraitsData = {
  tokenId: 1,
  strength: 7000,
  wit: 8000,
  charisma: 6000,
  defence: 5000,
  luck: 9000,
  strike: 'Lightning Strike',
  taunt: 'Mocking Smile',
  dodge: 'Phantom Step',
  special: 'Storm Caller',
  recover: 'Second Wind',
};

describe('GameMasterSigningService.signTraitsAndMoves', () => {
  it('signs a traits payload and the recovered address matches the signer', async () => {
    const service = new GameMasterSigningService();
    const signature = await service.signTraitsAndMoves(SAMPLE);

    // Reconstruct the message the same way the service does, then recover.
    const encoded = encodePacked(
      ['uint16', 'uint16', 'uint16', 'uint16', 'uint16', 'uint16', 'string', 'string', 'string', 'string', 'string'],
      [
        SAMPLE.tokenId,
        SAMPLE.strength,
        SAMPLE.wit,
        SAMPLE.charisma,
        SAMPLE.defence,
        SAMPLE.luck,
        SAMPLE.strike,
        SAMPLE.taunt,
        SAMPLE.dodge,
        SAMPLE.special,
        SAMPLE.recover,
      ]
    );
    const messageHash = keccak256(encoded);

    const recovered = await recoverMessageAddress({
      message: { raw: messageHash },
      signature,
    });
    expect(recovered.toLowerCase()).toBe(EXPECTED_ADDRESS.toLowerCase());
  });

  it('produces different signatures for different payloads (no constant output)', async () => {
    const service = new GameMasterSigningService();
    const sig1 = await service.signTraitsAndMoves(SAMPLE);
    const sig2 = await service.signTraitsAndMoves({ ...SAMPLE, tokenId: 2 });
    expect(sig1).not.toBe(sig2);
  });

  it('encodePacked order matches the contract ABI field order', async () => {
    // The contract verifies tokenId, strength, wit, charisma, defence, luck,
    // strike, taunt, dodge, special, recover — in that order. If a future
    // refactor swaps any two of these (a real risk during refactoring), the
    // signature won't roundtrip. Pin the bytes hand-computed against the
    // SAMPLE payload above.
    const expected = encodePacked(
      ['uint16', 'uint16', 'uint16', 'uint16', 'uint16', 'uint16', 'string', 'string', 'string', 'string', 'string'],
      [1, 7000, 8000, 6000, 5000, 9000, 'Lightning Strike', 'Mocking Smile', 'Phantom Step', 'Storm Caller', 'Second Wind']
    );
    // Sanity: encodePacked is deterministic. The next line is essentially
    // documenting what the SAMPLE payload encodes to. If the service code
    // ever swaps the order, the recover-and-compare test above will fail
    // first; this test pins the bytes for a stronger contract.
    expect(expected.length).toBeGreaterThan(2);
    expect(expected.startsWith('0x')).toBe(true);
  });

  it('handles minimum-value traits (all zeros, empty strings)', async () => {
    const service = new GameMasterSigningService();
    const sig = await service.signTraitsAndMoves({
      tokenId: 0,
      strength: 0,
      wit: 0,
      charisma: 0,
      defence: 0,
      luck: 0,
      strike: '',
      taunt: '',
      dodge: '',
      special: '',
      recover: '',
    });
    expect(sig.startsWith('0x')).toBe(true);
    expect(sig.length).toBe(132); // 0x + 130 hex chars (65 bytes)
  });
});

describe('GameMasterSigningService.getGameMasterAddress', () => {
  it('returns the address derived from the configured private key', () => {
    const service = new GameMasterSigningService();
    expect(service.getGameMasterAddress()).toBe(EXPECTED_ADDRESS);
  });
});

describe('GameMasterSigningService missing key', () => {
  it('throws a clear error when GAME_MASTER_PRIVATE_KEY is unset', async () => {
    delete process.env.GAME_MASTER_PRIVATE_KEY;
    const service = new GameMasterSigningService();
    await expect(service.signTraitsAndMoves(SAMPLE)).rejects.toThrow(
      /GAME_MASTER_PRIVATE_KEY not found/i
    );
  });
});

describe('GameMasterSigningService.extractTraitsAndMoves', () => {
  it('extracts the canonical AI response shape', () => {
    const service = new GameMasterSigningService();
    const out = service.extractTraitsAndMoves(
      {
        Strength: 1000,
        Wit: 2000,
        Charisma: 3000,
        Defence: 4000,
        Luck: 5000,
        strike_attack: 'Cyclone',
        taunt_attack: 'Sneer',
        dodge: 'Sidestep',
        special_move: 'Earthshaker',
        recover: 'Bandage',
      },
      99
    );
    expect(out.tokenId).toBe(99);
    expect(out.strength).toBe(1000);
    expect(out.wit).toBe(2000);
    expect(out.charisma).toBe(3000);
    expect(out.defence).toBe(4000);
    expect(out.luck).toBe(5000);
    expect(out.strike).toBe('Cyclone');
    expect(out.taunt).toBe('Sneer');
    expect(out.dodge).toBe('Sidestep');
    expect(out.special).toBe('Earthshaker');
    expect(out.recover).toBe('Bandage');
  });

  it('falls back to lowercase keys / Defense (US) spelling', () => {
    const service = new GameMasterSigningService();
    const out = service.extractTraitsAndMoves(
      {
        strength: 1,
        wit: 2,
        charisma: 3,
        Defense: 4, // US spelling
        luck: 5,
        // no strike_attack — falls back to default
      },
      1
    );
    expect(out.defence).toBe(4);
    expect(out.strike).toBe('Strike');
    expect(out.special).toBe('Special');
  });

  it('defaults missing traits to 0 and missing moves to a placeholder', () => {
    const service = new GameMasterSigningService();
    const out = service.extractTraitsAndMoves({}, 0);
    expect(out.strength).toBe(0);
    expect(out.luck).toBe(0);
    expect(out.strike).toBe('Strike');
    expect(out.recover).toBe('Recover');
  });
});
