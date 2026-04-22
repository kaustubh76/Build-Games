/**
 * Setup script: activate warriors 7 + 9, create new UNRANKED arena, initialize with 7 vs 9.
 *
 * Run: cd frontend && npx tsx ../scripts/setup-battle.ts
 */

import { createPublicClient, createWalletClient, http, encodePacked, keccak256, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { avalancheFuji } from 'viem/chains';

// Config
const RPC = process.env.AVALANCHE_RPC || 'https://avalanche-fuji-c-chain-rpc.publicnode.com';
// Deployer key — owns the warriors and can call initializeGame.
// REQUIRED: set PRIVATE_KEY in your environment (no default).
const DEPLOYER_KEY = process.env.PRIVATE_KEY;
// AI Signer key — must match the contract's i_AiPublicKey (set at deploy time).
// REQUIRED: set AI_SIGNER_PRIVATE_KEY in your environment (no default).
const AI_SIGNER_KEY = process.env.AI_SIGNER_PRIVATE_KEY;
if (!DEPLOYER_KEY || !AI_SIGNER_KEY) {
  throw new Error('Set PRIVATE_KEY and AI_SIGNER_PRIVATE_KEY environment variables before running.');
}
const NFT_ADDRESS = '0x218d3efaB076bd03E278CDCf3B488AA107215b8a' as const;
const FACTORY_ADDRESS = '0xe9faCA292CEF42489AF4d20266964Fb6425AE122' as const;
const WARRIOR_1 = 7;
const WARRIOR_2 = 9;

const account = privateKeyToAccount(`0x${DEPLOYER_KEY.replace('0x', '')}`);
const aiSignerAccount = privateKeyToAccount(`0x${AI_SIGNER_KEY}`);

const publicClient = createPublicClient({
  chain: avalancheFuji,
  transport: http(RPC),
});

const walletClient = createWalletClient({
  account,
  chain: avalancheFuji,
  transport: http(RPC),
});

// Minimal ABIs
const nftAbi = [
  { name: 'getTraits', type: 'function', stateMutability: 'view', inputs: [{ name: '_tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'strength', type: 'uint16' }, { name: 'wit', type: 'uint16' }, { name: 'charisma', type: 'uint16' }, { name: 'defence', type: 'uint16' }, { name: 'luck', type: 'uint16' }] }] },
  { name: 'assignTraitsAndMoves', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: '_tokenId', type: 'uint16' }, { name: '_strength', type: 'uint16' }, { name: '_wit', type: 'uint16' }, { name: '_charisma', type: 'uint16' }, { name: '_defence', type: 'uint16' }, { name: '_luck', type: 'uint16' }, { name: '_strike', type: 'string' }, { name: '_taunt', type: 'string' }, { name: '_dodge', type: 'string' }, { name: '_special', type: 'string' }, { name: '_recover', type: 'string' }, { name: '_signedData', type: 'bytes' }], outputs: [] },
] as const;

const factoryAbi = [
  { name: 'makeNewArena', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: '_costToInfluence', type: 'uint256' }, { name: '_costToDefluence', type: 'uint256' }, { name: '_betAmount', type: 'uint256' }, { name: '_ranking', type: 'uint8' }], outputs: [{ name: '', type: 'address' }] },
  { name: 'getArenasOfARanking', type: 'function', stateMutability: 'view', inputs: [{ name: '_ranking', type: 'uint8' }], outputs: [{ name: '', type: 'address[]' }] },
] as const;

const arenaAbi = [
  { name: 'initializeGame', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: '_WarriorsOneNFTId', type: 'uint256' }, { name: '_WarriorsTwoNFTId', type: 'uint256' }], outputs: [] },
  { name: 'getInitializationStatus', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'bool' }] },
  { name: 'getWarriorsOneNFTId', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'getWarriorsTwoNFTId', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
] as const;

async function hasTraits(tokenId: number): Promise<boolean> {
  try {
    const traits = await publicClient.readContract({
      address: NFT_ADDRESS,
      abi: nftAbi,
      functionName: 'getTraits',
      args: [BigInt(tokenId)],
    });
    const sum = Number(traits.strength) + Number(traits.wit) + Number(traits.charisma) + Number(traits.defence) + Number(traits.luck);
    return sum > 0;
  } catch {
    return false;
  }
}

async function activateWarrior(tokenId: number) {
  console.log(`\n🎯 Activating warrior #${tokenId}...`);

  // Random traits between 3000-7000 (out of 10000)
  const str = 4000 + Math.floor(Math.random() * 3000);
  const wit = 4000 + Math.floor(Math.random() * 3000);
  const cha = 4000 + Math.floor(Math.random() * 3000);
  const def = 4000 + Math.floor(Math.random() * 3000);
  const luck = 4000 + Math.floor(Math.random() * 3000);

  // Move names
  const strikes = ['Avalanche Strike', 'Thunder Slash', 'Dragon Fang', 'Ice Shard', 'Flame Burst'];
  const taunts = ['Battle Cry', 'War Chant', 'Intimidate', 'Taunt of Ages', 'Fearsome Roar'];
  const dodges = ['Shadow Step', 'Wind Walk', 'Phase Shift', 'Evasion', 'Ghost Dance'];
  const specials = ['Ultimate Fury', 'Nova Blast', 'Meteor Strike', 'Soul Rend', 'Omega Force'];
  const recovers = ['Healing Surge', 'Iron Will', 'Regenerate', 'Second Wind', 'Vital Restore'];

  const strike = strikes[tokenId % strikes.length];
  const taunt = taunts[tokenId % taunts.length];
  const dodge = dodges[tokenId % dodges.length];
  const special = specials[tokenId % specials.length];
  const recover = recovers[tokenId % recovers.length];

  // Sign the traits — must match contract's abi.encodePacked exactly:
  // keccak256(abi.encodePacked(_tokenId, _strength, _wit, _charisma, _defence, _luck, _strike, _taunt, _dodge, _special, _recover))
  const encodedData = encodePacked(
    ['uint16', 'uint16', 'uint16', 'uint16', 'uint16', 'uint16', 'string', 'string', 'string', 'string', 'string'],
    [tokenId, str, wit, cha, def, luck, strike, taunt, dodge, special, recover]
  );
  const messageHash = keccak256(encodedData);
  // signMessage auto-adds the "\x19Ethereum Signed Message:\n32" prefix, matching MessageHashUtils.toEthSignedMessageHash
  // MUST sign with the AI signer (0xFc46DA...) — that's what the contract's i_AiPublicKey expects
  const signature = await aiSignerAccount.signMessage({ message: { raw: messageHash } });

  console.log(`  Traits: str=${str} wit=${wit} cha=${cha} def=${def} luck=${luck}`);
  console.log(`  Moves: ${strike} / ${taunt} / ${dodge} / ${special} / ${recover}`);

  const hash = await walletClient.writeContract({
    address: NFT_ADDRESS,
    abi: nftAbi,
    functionName: 'assignTraitsAndMoves',
    args: [tokenId, str, wit, cha, def, luck, strike, taunt, dodge, special, recover, signature],
    gas: 500000n,
  });

  console.log(`  TX: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60000 });
  console.log(`  Status: ${receipt.status} (block ${receipt.blockNumber})`);
  if (receipt.status !== 'success') throw new Error(`Activation failed for warrior #${tokenId}`);
}

async function createNewArena(): Promise<string> {
  console.log(`\n🏟️ Creating new UNRANKED arena...`);

  // Match the original: costToInfluence=10 CRwN, costToDefluence=5 CRwN, betAmount=1 CRwN, rank=UNRANKED(0)
  const hash = await walletClient.writeContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: 'makeNewArena',
    args: [parseEther('10'), parseEther('5'), parseEther('1'), 0],
    gas: 5000000n,
  });

  console.log(`  TX: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60000 });
  console.log(`  Status: ${receipt.status} (block ${receipt.blockNumber})`);
  if (receipt.status !== 'success') throw new Error('Failed to create arena');

  // Get the new arena address from the factory
  const arenas = await publicClient.readContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: 'getArenasOfARanking',
    args: [0], // UNRANKED
  });

  const newArena = arenas[arenas.length - 1]; // Last one is the newest
  console.log(`  New arena address: ${newArena}`);
  console.log(`  Total UNRANKED arenas now: ${arenas.length}`);
  return newArena as string;
}

async function initializeArena(arenaAddress: string) {
  console.log(`\n⚔️ Initializing arena ${arenaAddress} with warriors #${WARRIOR_1} vs #${WARRIOR_2}...`);

  const hash = await walletClient.writeContract({
    address: arenaAddress as `0x${string}`,
    abi: arenaAbi,
    functionName: 'initializeGame',
    args: [BigInt(WARRIOR_1), BigInt(WARRIOR_2)],
    gas: 500000n,
  });

  console.log(`  TX: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60000 });
  console.log(`  Status: ${receipt.status} (block ${receipt.blockNumber})`);
  if (receipt.status !== 'success') throw new Error('Failed to initialize arena');

  // Verify
  const w1 = await publicClient.readContract({ address: arenaAddress as `0x${string}`, abi: arenaAbi, functionName: 'getWarriorsOneNFTId' });
  const w2 = await publicClient.readContract({ address: arenaAddress as `0x${string}`, abi: arenaAbi, functionName: 'getWarriorsTwoNFTId' });
  console.log(`  Verified: Warriors #${w1} vs #${w2}`);
}

async function main() {
  console.log('=== Warriors AI-rena Battle Setup ===');
  console.log(`Account: ${account.address}`);
  console.log(`Warriors: #${WARRIOR_1} vs #${WARRIOR_2}\n`);

  // Step 1: Activate warriors if needed
  for (const id of [WARRIOR_1, WARRIOR_2]) {
    if (await hasTraits(id)) {
      console.log(`✅ Warrior #${id} already has traits`);
    } else {
      await activateWarrior(id);
    }
  }

  // Step 2: Create new UNRANKED arena
  const newArena = await createNewArena();

  // Step 3: Initialize with our warriors
  await initializeArena(newArena);

  console.log('\n=== DONE ===');
  console.log(`New arena: ${newArena}`);
  console.log(`Warriors: #${WARRIOR_1} vs #${WARRIOR_2}`);
  console.log(`Betting is now OPEN on this arena.`);
  console.log(`\nNext: update frontend to include this arena, or it will auto-discover via ArenaFactory.`);
}

main().catch(err => {
  console.error('\n❌ Error:', err.message || err);
  process.exit(1);
});
