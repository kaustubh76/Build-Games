/**
 * Execute a full end-to-end battle on the new UNRANKED arena.
 *
 * Flow:
 *   1. Mint CRwN (deposit AVAX)
 *   2. Approve CRwN for arena
 *   3. Bet on Warrior One (from deployer)
 *   4. Bet on Warrior Two (from deployer — same wallet, the contract allows it via different bet functions)
 *   5. Wait for betting period to end
 *   6. Start game
 *   7. Execute 5 battle rounds (game master signs moves)
 *   8. Finish game
 *
 * Run: cd frontend && npx tsx ../scripts/execute-battle.ts
 */

import {
  createPublicClient, createWalletClient, http,
  parseEther, formatEther, encodePacked, keccak256,
  type Abi,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { avalancheFuji } from 'viem/chains';

const RPC = process.env.AVALANCHE_RPC || 'https://avalanche-fuji-c-chain-rpc.publicnode.com';
// REQUIRED env vars: PRIVATE_KEY (deployer/bettor) and AI_SIGNER_PRIVATE_KEY (matches contract's i_AiPublicKey)
const DEPLOYER_KEY = process.env.PRIVATE_KEY;
const AI_SIGNER_KEY = process.env.AI_SIGNER_PRIVATE_KEY;
if (!DEPLOYER_KEY || !AI_SIGNER_KEY) {
  throw new Error('Set PRIVATE_KEY and AI_SIGNER_PRIVATE_KEY environment variables before running.');
}

const ARENA = '0x6fA5fbdAF71b67c05382Fca9EF702416df3Ee1aC' as const;
const CRWN = '0xF0011ca65e3F6314B180a8848ae373042bAEc9b4' as const;
const NFT = '0x218d3efaB076bd03E278CDCf3B488AA107215b8a' as const;

const account = privateKeyToAccount(`0x${DEPLOYER_KEY}`);
const aiSigner = privateKeyToAccount(`0x${AI_SIGNER_KEY}`);

const publicClient = createPublicClient({ chain: avalancheFuji, transport: http(RPC) });
const walletClient = createWalletClient({ account, chain: avalancheFuji, transport: http(RPC) });

const crwnAbi = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'mint', type: 'function', stateMutability: 'payable', inputs: [{ name: '_amount', type: 'uint256' }], outputs: [] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const;

const arenaAbi = [
  { name: 'betOnWarriorsOne', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: '_multiplier', type: 'uint256' }], outputs: [] },
  { name: 'betOnWarriorsTwo', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: '_multiplier', type: 'uint256' }], outputs: [] },
  { name: 'startGame', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { name: 'battle', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: '_WarriorsOneMove', type: 'uint8' }, { name: '_WarriorsTwoMove', type: 'uint8' }, { name: '_signedData', type: 'bytes' }], outputs: [] },
  { name: 'finishGame', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { name: 'getCurrentRound', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { name: 'getIsBettingPeriodGoingOn', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { name: 'getDamageOnWarriorsOne', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'getDamageOnWarriorsTwo', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'getMinBattleRoundsInterval', type: 'function', stateMutability: 'pure', inputs: [], outputs: [{ type: 'uint8' }] },
  { name: 'getLastRoundEndedAt', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'getMinWarriorsBettingPeriod', type: 'function', stateMutability: 'pure', inputs: [], outputs: [{ type: 'uint8' }] },
  { name: 'getGameInitializedAt', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'getBattleId', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const;

const nftAbi = [
  { name: 'getTraits', type: 'function', stateMutability: 'view', inputs: [{ name: '_tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'strength', type: 'uint16' }, { name: 'wit', type: 'uint16' }, { name: 'charisma', type: 'uint16' }, { name: 'defence', type: 'uint16' }, { name: 'luck', type: 'uint16' }] }] },
] as const;

async function waitTx(hash: `0x${string}`, label: string) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (receipt.status !== 'success') throw new Error(`${label} reverted`);
  console.log(`  ✅ ${label} (block ${receipt.blockNumber})`);
  return receipt;
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// Battle moves: STRIKE=0, TAUNT=1, DODGE=2, SPECIAL=3, RECOVER=4
const MOVES = ['STRIKE', 'TAUNT', 'DODGE', 'SPECIAL', 'RECOVER'] as const;

function selectMove(traits: { strength: number; wit: number; charisma: number; defence: number; luck: number }, round: number): number {
  // Simple trait-weighted move selection with round variation
  const weights = [traits.strength, traits.wit + traits.charisma, traits.defence, traits.strength + traits.luck, traits.defence + traits.charisma];
  // Rotate preference based on round
  const idx = (round - 1) % 5;
  const sorted = weights.map((w, i) => ({ w, i })).sort((a, b) => b.w - a.w);
  return sorted[idx % sorted.length].i;
}

async function main() {
  console.log('=== Warriors AI-rena: Full Battle Execution ===');
  console.log(`Arena: ${ARENA}`);
  console.log(`Account: ${account.address}\n`);

  // Check current state — resume if partially executed
  const currentRound = Number(await publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: 'getCurrentRound' }));

  if (currentRound === 0) {
    // Full flow: mint, bet, start
    console.log('📦 Step 1: Check CRwN balance and mint if needed...');
    let balance = await publicClient.readContract({ address: CRWN, abi: crwnAbi, functionName: 'balanceOf', args: [account.address] });
    console.log(`  Current CRwN: ${formatEther(balance)}`);

    const needed = parseEther('3');
    if (balance < needed) {
      const mintAmount = parseEther('5');
      console.log(`  Minting ${formatEther(mintAmount)} CRwN...`);
      const h = await walletClient.writeContract({ address: CRWN, abi: crwnAbi, functionName: 'mint', args: [mintAmount], value: mintAmount, gas: 200000n });
      await waitTx(h, 'Mint CRwN');
    }

    console.log('\n🔑 Step 2: Approve CRwN...');
    await waitTx(await walletClient.writeContract({ address: CRWN, abi: crwnAbi, functionName: 'approve', args: [ARENA, parseEther('100')], gas: 100000n }), 'Approve');

    console.log('\n🎰 Step 3: Place bets...');
    await waitTx(await walletClient.writeContract({ address: ARENA, abi: arenaAbi, functionName: 'betOnWarriorsOne', args: [1n], gas: 300000n }), 'Bet on W#7');
    await waitTx(await walletClient.writeContract({ address: ARENA, abi: arenaAbi, functionName: 'betOnWarriorsTwo', args: [1n], gas: 300000n }), 'Bet on W#9');

    console.log('\n⏳ Step 4: Wait for betting period...');
    const initAt = Number(await publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: 'getGameInitializedAt' }));
    const minBetting = Number(await publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: 'getMinWarriorsBettingPeriod' }));
    const waitSecs = Math.max(0, initAt + minBetting - Math.floor(Date.now() / 1000) + 2);
    if (waitSecs > 0) { console.log(`  Waiting ${waitSecs}s...`); await sleep(waitSecs * 1000); }

    console.log('\n🚀 Step 5: Start game...');
    await waitTx(await walletClient.writeContract({ address: ARENA, abi: arenaAbi, functionName: 'startGame', args: [], gas: 500000n }), 'Start game');
  } else {
    console.log(`⏩ Resuming from round ${currentRound} (bets + start already done)`);
  }

  // Step 6: Execute 5 battle rounds
  console.log('\n⚔️ Step 6: Execute 5 battle rounds...');
  const w1Traits = await publicClient.readContract({ address: NFT, abi: nftAbi, functionName: 'getTraits', args: [7n] });
  const w2Traits = await publicClient.readContract({ address: NFT, abi: nftAbi, functionName: 'getTraits', args: [9n] });
  console.log(`  W#7 traits: str=${w1Traits.strength} wit=${w1Traits.wit} cha=${w1Traits.charisma} def=${w1Traits.defence} luck=${w1Traits.luck}`);
  console.log(`  W#9 traits: str=${w2Traits.strength} wit=${w2Traits.wit} cha=${w2Traits.charisma} def=${w2Traits.defence} luck=${w2Traits.luck}`);

  const minInterval = Number(await publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: 'getMinBattleRoundsInterval' }));

  // Determine starting round (resume support)
  const startRound = Number(await publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: 'getCurrentRound' }));

  for (let round = startRound; round <= 5; round++) {
    // Wait for round interval (30 seconds between rounds including after startGame)
    const lastRoundAt = Number(await publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: 'getLastRoundEndedAt' }));
    const nextRoundAt = lastRoundAt + minInterval;
    const nowSec = Math.floor(Date.now() / 1000);
    const waitRound = Math.max(0, nextRoundAt - nowSec + 2);
    if (waitRound > 0) {
      console.log(`  Waiting ${waitRound}s for round interval...`);
      await sleep(waitRound * 1000);
    }

    // Select moves
    const w1Move = selectMove({ strength: Number(w1Traits.strength), wit: Number(w1Traits.wit), charisma: Number(w1Traits.charisma), defence: Number(w1Traits.defence), luck: Number(w1Traits.luck) }, round);
    const w2Move = selectMove({ strength: Number(w2Traits.strength), wit: Number(w2Traits.wit), charisma: Number(w2Traits.charisma), defence: Number(w2Traits.defence), luck: Number(w2Traits.luck) }, round);

    console.log(`\n  Round ${round}: W#7 uses ${MOVES[w1Move]}, W#9 uses ${MOVES[w2Move]}`);

    // Sign the moves — contract hashes: keccak256(abi.encodePacked(w1Move, w2Move))
    const messageHash = keccak256(
      encodePacked(
        ['uint8', 'uint8'],
        [w1Move, w2Move]
      )
    );
    const signature = await aiSigner.signMessage({ message: { raw: messageHash } });

    // Execute battle round
    const battleHash = await walletClient.writeContract({
      address: ARENA,
      abi: arenaAbi,
      functionName: 'battle',
      args: [w1Move, w2Move, signature],
      gas: 1000000n,
    });
    await waitTx(battleHash, `Round ${round} executed`);

    // Check damage
    const d1 = await publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: 'getDamageOnWarriorsOne' });
    const d2 = await publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: 'getDamageOnWarriorsTwo' });
    console.log(`  Damage → W#7: ${d1}, W#9: ${d2}`);
  }

  // Step 7: Finish game
  console.log('\n🏆 Step 7: Finish game...');
  const finishHash = await walletClient.writeContract({ address: ARENA, abi: arenaAbi, functionName: 'finishGame', args: [], gas: 500000n });
  await waitTx(finishHash, 'Game finished');

  // Final state
  const finalD1 = await publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: 'getDamageOnWarriorsOne' });
  const finalD2 = await publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: 'getDamageOnWarriorsTwo' });
  const winner = finalD1 < finalD2 ? 'Warrior #7 (less damage)' : finalD2 < finalD1 ? 'Warrior #9 (less damage)' : 'DRAW';
  const finalBalance = await publicClient.readContract({ address: CRWN, abi: crwnAbi, functionName: 'balanceOf', args: [account.address] });

  console.log('\n=== BATTLE COMPLETE ===');
  console.log(`Final damage → W#7: ${finalD1}, W#9: ${finalD2}`);
  console.log(`Winner: ${winner}`);
  console.log(`CRwN balance: ${formatEther(finalBalance)}`);
  console.log(`Arena: ${ARENA}`);
}

main().catch(err => {
  console.error('\n❌ Error:', err.message || err);
  process.exit(1);
});
