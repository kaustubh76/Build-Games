/**
 * API Route: Sign Warrior Traits
 * Server-side signing of warrior traits and moves using Game Master private key
 * This keeps the private key secure on the server
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { encodePacked, keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';

// Maximum signature validity period (5 minutes)
const SIGNATURE_EXPIRY_MS = 5 * 60 * 1000;

// Move strings are stored on-chain as `string` (dynamic bytes). Cap them at
// 100 chars to prevent oversize signatures and to mirror sane UI input.
const MoveString = z.string().min(1).max(100);
const TraitNumber = z.number().int().min(0).max(10_000);

const PostBodySchema = z.object({
  tokenId: z.number().int().min(0).max(2 ** 16 - 1),
  strength: TraitNumber,
  wit: TraitNumber,
  charisma: TraitNumber,
  defence: TraitNumber,
  luck: TraitNumber,
  strike: MoveString,
  taunt: MoveString,
  dodge: MoveString,
  special: MoveString,
  recover: MoveString,
  timestamp: z.number().int().optional(),
});

/**
 * POST /api/sign-traits
 * Sign warrior traits data with Game Master private key
 */
export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting (20 signings per minute)
    await applyRateLimit(request, {
      prefix: 'sign-traits-post',
      maxRequests: 20,
      windowMs: 60000,
    });

    const raw = await request.json().catch(() => null);
    const parsed = PostBodySchema.safeParse(raw);
    if (!parsed.success) {
      throw ErrorResponses.badRequest(
        `Invalid body: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
      );
    }
    const {
      tokenId,
      strength,
      wit,
      charisma,
      defence,
      luck,
      strike,
      taunt,
      dodge,
      special,
      recover,
      timestamp: clientTimestamp,
    } = parsed.data;

    // Validate client timestamp if provided (must be recent)
    const now = Date.now();
    if (clientTimestamp !== undefined) {
      if (Math.abs(now - clientTimestamp) > SIGNATURE_EXPIRY_MS) {
        throw ErrorResponses.badRequest('Timestamp expired or too far in future. Please retry.');
      }
    }

    // Generate server timestamp for signature
    const signatureTimestamp = Math.floor(now / 1000);

    // Get Game Master private key
    const privateKey = process.env.GAME_MASTER_PRIVATE_KEY?.trim();
    if (!privateKey) {
      throw ErrorResponses.serviceUnavailable('Game Master key not configured');
    }

    // Create account from private key - ensure proper hex formatting
    const hex = privateKey.replace(/^0x/i, '').padStart(64, '0');
    const formattedKey = `0x${hex}` as `0x${string}`;

    const account = privateKeyToAccount(formattedKey);

    // Encode the data matching the contract's abi.encodePacked format exactly
    // Contract: keccak256(abi.encodePacked(_tokenId, _strength, _wit, _charisma, _defence, _luck, _strike, _taunt, _dodge, _special, _recover))
    const encodedData = encodePacked(
      ['uint16', 'uint16', 'uint16', 'uint16', 'uint16', 'uint16', 'string', 'string', 'string', 'string', 'string'],
      [
        tokenId,
        strength,
        wit,
        charisma,
        defence,
        luck,
        strike,
        taunt,
        dodge,
        special,
        recover,
      ]
    );

    // Hash the encoded data
    const messageHash = keccak256(encodedData);

    // Sign the hash
    const signature = await account.signMessage({
      message: { raw: messageHash }
    });

    // Calculate expiration time
    const expiresAt = signatureTimestamp + Math.floor(SIGNATURE_EXPIRY_MS / 1000);

    console.log('Game Master signed traits for token:', tokenId, 'expires at:', new Date(expiresAt * 1000).toISOString());

    return NextResponse.json({
      success: true,
      signature,
      gameMasterAddress: account.address,
      tokenId,
      timestamp: signatureTimestamp,
      expiresAt,
      traits: {
        strength,
        wit,
        charisma,
        defence,
        luck
      },
      moves: {
        strike,
        taunt,
        dodge,
        special,
        recover
      }
    });

  } catch (error) {
    return handleAPIError(error, 'API:SignTraits:POST');
  }
}

/**
 * GET /api/sign-traits
 * Returns the Game Master address for verification
 */
export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    await applyRateLimit(request, {
      prefix: 'sign-traits-get',
      maxRequests: 60,
      windowMs: 60000,
    });

    const privateKey = process.env.GAME_MASTER_PRIVATE_KEY?.trim();
    if (!privateKey) {
      throw ErrorResponses.serviceUnavailable('Game Master key not configured');
    }

    // Strip 0x prefix, ensure even-length hex, then re-add prefix
    const hex = privateKey.replace(/^0x/i, '').padStart(64, '0');
    const formattedKey = `0x${hex}` as `0x${string}`;

    const account = privateKeyToAccount(formattedKey);

    return NextResponse.json({
      success: true,
      gameMasterAddress: account.address
    });

  } catch (error) {
    return handleAPIError(error, 'API:SignTraits:GET');
  }
}
