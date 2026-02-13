import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// BLOCKCHAIN SERVICE - Avalanche C-Chain
// ============================================================================

// ABI snippets for Arena contracts
const ARENA_ABI = [
  'event GameFinished(uint256 indexed gameId, uint256 winner, uint256 warrior1Damage, uint256 warrior2Damage)',
  'event GameInitialized(uint256 indexed gameId, uint256 warrior1, uint256 warrior2)',
  'event MoveSelectedForMicroMarket(uint256 indexed battleId, uint256 indexed warriorId, uint8 move, uint8 round)',
  'function currentGame() view returns (uint256)',
  'function getGameInfo(uint256 gameId) view returns (tuple(uint256 warrior1, uint256 warrior2, uint256 warrior1Damage, uint256 warrior2Damage, uint8 status, uint256 prizePool))',
];

// ABI snippets for ArenaFactory
const ARENA_FACTORY_ABI = [
  'function getArenas() view returns (address[])',
  'function getArenaRanking(address _arena) view returns (uint8)',
  'function getArenasOfARanking(uint8 _ranking) view returns (address[])',
];

const WARRIORS_NFT_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'event TraitsAssigned(uint256 indexed tokenId, uint256 strength, uint256 wit, uint256 charisma, uint256 defence, uint256 luck)',
  'event Promotion(uint256 indexed tokenId, uint8 oldRank, uint8 newRank)',
  'function totalSupply() view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function getTraits(uint256 tokenId) view returns (tuple(uint256 strength, uint256 wit, uint256 charisma, uint256 defence, uint256 luck))',
  'function getRank(uint256 tokenId) view returns (uint8)',
  'function getWinnings(uint256 tokenId) view returns (uint256)',
];

const CROWN_TOKEN_ABI = [
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
];

// ============================================================================
// TYPES
// ============================================================================

interface Warrior {
  id: number;
  name: string;
  owner: string;
  traits: {
    strength: number;
    wit: number;
    charisma: number;
    defence: number;
    luck: number;
  };
  rank: string;
  wins: number;
  losses: number;
  totalWinnings: number;
}

interface Battle {
  id: string;
  warrior1Id: number;
  warrior2Id: number;
  warrior1Damage: number;
  warrior2Damage: number;
  warrior1Moves: number[];
  warrior2Moves: number[];
  prizePool: number;
  winner: number;
  timestamp: number;
}

interface ArenaStats {
  totalBattles: number;
  totalWarriors: number;
  uniquePlayers: number;
  totalVolume: number;
  battlesToday: number;
  activeTournaments: number;
}

interface DailyStats {
  battles: number;
  newWarriors: number;
  volume: number;
  topWarrior: { id: number; wins: number };
  biggestWin: number;
}

// ============================================================================
// BLOCKCHAIN SERVICE CLASS
// ============================================================================

class BlockchainService {
  private provider: ethers.JsonRpcProvider;
  private arenaContract: ethers.Contract;
  private arenaFactoryContract: ethers.Contract;
  private warriorsContract: ethers.Contract;
  private crownContract: ethers.Contract;
  private allArenaContracts: ethers.Contract[] = [];

  // Event callbacks
  private battleCallbacks: ((battle: Battle) => void)[] = [];
  private mintCallbacks: ((warrior: any) => void)[] = [];
  private promotionCallbacks: ((promotion: any) => void)[] = [];

  // Cache
  private statsCache: { data: ArenaStats | null; timestamp: number } = {
    data: null,
    timestamp: 0,
  };

  constructor() {
    const rpcUrl = process.env.RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc';
    this.provider = new ethers.JsonRpcProvider(rpcUrl);

    this.arenaContract = new ethers.Contract(
      process.env.ARENA_CONTRACT_ADDRESS!,
      ARENA_ABI,
      this.provider
    );

    this.arenaFactoryContract = new ethers.Contract(
      process.env.ARENA_FACTORY_ADDRESS || process.env.ARENA_CONTRACT_ADDRESS!,
      ARENA_FACTORY_ABI,
      this.provider
    );

    this.warriorsContract = new ethers.Contract(
      process.env.WARRIORS_NFT_ADDRESS!,
      WARRIORS_NFT_ABI,
      this.provider
    );

    this.crownContract = new ethers.Contract(
      process.env.CROWN_TOKEN_ADDRESS!,
      CROWN_TOKEN_ABI,
      this.provider
    );

    this.initArenas().then(() => this.setupEventListeners());
  }

  // --------------------------------------------------------------------------
  // INITIALIZATION
  // --------------------------------------------------------------------------

  private async initArenas(): Promise<void> {
    try {
      const arenaAddresses: string[] = await this.arenaFactoryContract.getArenas();
      this.allArenaContracts = arenaAddresses.map(
        (addr) => new ethers.Contract(addr, ARENA_ABI, this.provider)
      );
      console.log(`Initialized ${this.allArenaContracts.length} arena contracts`);
    } catch (err) {
      console.warn('Could not load arenas from factory, using single arena:', err);
      this.allArenaContracts = [this.arenaContract];
    }
  }

  // --------------------------------------------------------------------------
  // EVENT LISTENERS
  // --------------------------------------------------------------------------

  private setupEventListeners(): void {
    // Listen for battle completion on all arenas
    for (const arena of this.allArenaContracts) {
      arena.on('GameFinished', async (gameId, winner, w1Damage, w2Damage) => {
        console.log(`Battle ${gameId} finished! Winner: ${winner}`);
        try {
          const battle = await this.getBattleFromArena(arena, gameId.toString());
          this.battleCallbacks.forEach((cb) => cb(battle));
        } catch (err) {
          console.error('Error processing battle event:', err);
        }
      });
    }

    // Listen for new warriors minted
    this.warriorsContract.on('Transfer', async (from, to, tokenId) => {
      if (from === ethers.ZeroAddress) {
        console.log(`New warrior minted: #${tokenId}`);
        try {
          const warrior = await this.getWarrior(Number(tokenId));
          this.mintCallbacks.forEach((cb) => cb(warrior));
        } catch (err) {
          console.error('Error processing mint event:', err);
        }
      }
    });

    // Listen for rank promotions
    this.warriorsContract.on('Promotion', async (tokenId, oldRank, newRank) => {
      console.log(`Warrior #${tokenId} promoted from ${oldRank} to ${newRank}`);
      const ranks = ['UNRANKED', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];
      try {
        const promotion = {
          warriorId: Number(tokenId),
          oldRank: ranks[oldRank],
          newRank: ranks[newRank],
          totalWinnings: await this.getWarriorWinnings(Number(tokenId)),
        };
        this.promotionCallbacks.forEach((cb) => cb(promotion));
      } catch (err) {
        console.error('Error processing promotion event:', err);
      }
    });
  }

  // Callback registration
  onBattleComplete(callback: (battle: Battle) => void): void {
    this.battleCallbacks.push(callback);
  }

  onWarriorMinted(callback: (warrior: any) => void): void {
    this.mintCallbacks.push(callback);
  }

  onRankPromotion(callback: (promotion: any) => void): void {
    this.promotionCallbacks.push(callback);
  }

  // --------------------------------------------------------------------------
  // WARRIOR DATA
  // --------------------------------------------------------------------------

  async getWarrior(tokenId: number): Promise<Warrior> {
    const [owner, traits, rank, winnings] = await Promise.all([
      this.warriorsContract.ownerOf(tokenId),
      this.warriorsContract.getTraits(tokenId),
      this.warriorsContract.getRank(tokenId),
      this.warriorsContract.getWinnings(tokenId),
    ]);

    const ranks = ['UNRANKED', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];

    return {
      id: tokenId,
      name: `Warrior #${tokenId}`,
      owner,
      traits: {
        strength: Number(traits.strength),
        wit: Number(traits.wit),
        charisma: Number(traits.charisma),
        defence: Number(traits.defence),
        luck: Number(traits.luck),
      },
      rank: ranks[rank] || 'UNRANKED',
      wins: 0,
      losses: 0,
      totalWinnings: Number(ethers.formatEther(winnings)),
    };
  }

  async getWarriorWinnings(tokenId: number): Promise<number> {
    const winnings = await this.warriorsContract.getWinnings(tokenId);
    return Number(ethers.formatEther(winnings));
  }

  // --------------------------------------------------------------------------
  // BATTLE DATA
  // --------------------------------------------------------------------------

  private async getBattleFromArena(arena: ethers.Contract, gameId: string): Promise<Battle> {
    const gameInfo = await arena.getGameInfo(gameId);

    // Fetch actual move data from MoveSelectedForMicroMarket events
    const warrior1Moves: number[] = [];
    const warrior2Moves: number[] = [];

    try {
      const filter = arena.filters.MoveSelectedForMicroMarket(gameId);
      const currentBlock = await this.provider.getBlockNumber();
      // Look back ~2000 blocks (~1 hour on Avalanche at ~2s blocks)
      const fromBlock = Math.max(0, currentBlock - 2000);
      const events = await arena.queryFilter(filter, fromBlock, currentBlock);

      for (const event of events) {
        const args = (event as ethers.EventLog).args;
        if (args) {
          const warriorId = Number(args.warriorId);
          const move = Number(args.move);
          if (warriorId === Number(gameInfo.warrior1)) {
            warrior1Moves.push(move);
          } else if (warriorId === Number(gameInfo.warrior2)) {
            warrior2Moves.push(move);
          }
        }
      }
    } catch (err) {
      console.warn('Could not fetch move events for game', gameId, err);
    }

    return {
      id: gameId,
      warrior1Id: Number(gameInfo.warrior1),
      warrior2Id: Number(gameInfo.warrior2),
      warrior1Damage: Number(gameInfo.warrior1Damage),
      warrior2Damage: Number(gameInfo.warrior2Damage),
      warrior1Moves,
      warrior2Moves,
      prizePool: Number(ethers.formatEther(gameInfo.prizePool)),
      winner:
        Number(gameInfo.warrior1Damage) < Number(gameInfo.warrior2Damage)
          ? Number(gameInfo.warrior1)
          : Number(gameInfo.warrior2),
      timestamp: Date.now(),
    };
  }

  async getBattle(gameId: string): Promise<Battle> {
    return this.getBattleFromArena(this.arenaContract, gameId);
  }

  async getLatestBattle(): Promise<Battle> {
    const currentGame = await this.arenaContract.currentGame();
    return this.getBattle(currentGame.toString());
  }

  // --------------------------------------------------------------------------
  // STATISTICS (real on-chain data)
  // --------------------------------------------------------------------------

  async getArenaStats(): Promise<ArenaStats> {
    // Return cached data if fresh (less than 5 minutes old)
    if (this.statsCache.data && Date.now() - this.statsCache.timestamp < 300000) {
      return this.statsCache.data;
    }

    const [totalWarriors, currentGame, crwnSupply] = await Promise.all([
      this.warriorsContract.totalSupply(),
      this.arenaContract.currentGame(),
      this.crownContract.totalSupply(),
    ]);

    // Count battles in the last 24 hours by querying GameFinished events
    let battlesToday = 0;
    const uniqueOwners = new Set<string>();

    try {
      const currentBlock = await this.provider.getBlockNumber();
      // ~43200 blocks in 24h on Avalanche (2s block time)
      const fromBlock = Math.max(0, currentBlock - 43200);

      // Count battles across all arenas
      for (const arena of this.allArenaContracts) {
        try {
          const filter = arena.filters.GameFinished();
          const events = await arena.queryFilter(filter, fromBlock, currentBlock);
          battlesToday += events.length;
        } catch {
          // Skip arenas that fail
        }
      }
    } catch (err) {
      console.warn('Could not query battle events:', err);
    }

    // Count unique warrior owners (sample first 100 warriors for efficiency)
    const totalWarriorsNum = Number(totalWarriors);
    const sampleSize = Math.min(totalWarriorsNum, 100);
    try {
      const ownerPromises = [];
      for (let i = 1; i <= sampleSize; i++) {
        ownerPromises.push(
          this.warriorsContract.ownerOf(i).catch(() => null)
        );
      }
      const owners = await Promise.all(ownerPromises);
      owners.forEach((owner) => {
        if (owner) uniqueOwners.add(owner);
      });
    } catch {
      // Fallback: estimate unique players
    }

    const uniquePlayers = sampleSize < totalWarriorsNum
      ? Math.floor((uniqueOwners.size / sampleSize) * totalWarriorsNum)
      : uniqueOwners.size;

    const stats: ArenaStats = {
      totalBattles: Number(currentGame),
      totalWarriors: totalWarriorsNum,
      uniquePlayers: uniquePlayers || 0,
      totalVolume: Number(ethers.formatEther(crwnSupply)),
      battlesToday,
      activeTournaments: 0, // No tournament contract deployed
    };

    this.statsCache = { data: stats, timestamp: Date.now() };
    return stats;
  }

  async getDailyStats(): Promise<DailyStats> {
    const stats = await this.getArenaStats();

    // Count new warrior mints in last 24 hours
    let newWarriors = 0;
    let biggestWin = 0;
    let topWarrior = { id: 0, wins: 0 };

    try {
      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 43200); // ~24h

      // Count mints (Transfer from zero address)
      const mintFilter = this.warriorsContract.filters.Transfer(ethers.ZeroAddress);
      const mintEvents = await this.warriorsContract.queryFilter(mintFilter, fromBlock, currentBlock);
      newWarriors = mintEvents.length;

      // Find biggest win and top warrior from recent battles
      for (const arena of this.allArenaContracts) {
        try {
          const battleFilter = arena.filters.GameFinished();
          const battleEvents = await arena.queryFilter(battleFilter, fromBlock, currentBlock);

          for (const event of battleEvents) {
            const args = (event as ethers.EventLog).args;
            if (args) {
              const prizePool = Number(args.warrior1Damage) + Number(args.warrior2Damage);
              if (prizePool > biggestWin) {
                biggestWin = prizePool;
                topWarrior = { id: Number(args.winner), wins: 1 };
              }
            }
          }
        } catch {
          // Skip arenas that fail
        }
      }
    } catch (err) {
      console.warn('Could not query daily events:', err);
    }

    return {
      battles: stats.battlesToday,
      newWarriors,
      volume: stats.battlesToday * Number(ethers.formatEther(1n * 10n ** 18n)), // Approximate from bet amounts
      topWarrior,
      biggestWin,
    };
  }

  async getWeeklyStats(): Promise<any> {
    const [totalWarriors, currentGame, crwnSupply] = await Promise.all([
      this.warriorsContract.totalSupply(),
      this.arenaContract.currentGame(),
      this.crownContract.totalSupply(),
    ]);

    let weeklyBattles = 0;
    let weeklyMints = 0;

    try {
      const currentBlock = await this.provider.getBlockNumber();
      // ~302400 blocks in 7 days on Avalanche (2s block time)
      const fromBlock = Math.max(0, currentBlock - 302400);

      // Count battles across all arenas
      for (const arena of this.allArenaContracts) {
        try {
          const filter = arena.filters.GameFinished();
          const events = await arena.queryFilter(filter, fromBlock, currentBlock);
          weeklyBattles += events.length;
        } catch {
          // Skip arenas that fail
        }
      }

      // Count mints
      const mintFilter = this.warriorsContract.filters.Transfer(ethers.ZeroAddress);
      const mintEvents = await this.warriorsContract.queryFilter(mintFilter, fromBlock, currentBlock);
      weeklyMints = mintEvents.length;
    } catch (err) {
      console.warn('Could not query weekly events:', err);
    }

    return {
      battles: weeklyBattles,
      newWarriors: weeklyMints,
      volume: Number(ethers.formatEther(crwnSupply)),
      topWarrior: { id: 0, wins: 0 },
    };
  }

  // --------------------------------------------------------------------------
  // LEADERBOARD (real on-chain data)
  // --------------------------------------------------------------------------

  async getLeaderboard(
    type: string,
    limit: number
  ): Promise<{ id: number; value: number }[]> {
    const totalSupply = Number(await this.warriorsContract.totalSupply());
    if (totalSupply === 0) return [];

    // Fetch warrior data from chain
    const maxFetch = Math.min(totalSupply, 200); // Cap to avoid rate limits
    const entries: { id: number; value: number }[] = [];

    const batchSize = 20;
    for (let start = 1; start <= maxFetch; start += batchSize) {
      const end = Math.min(start + batchSize - 1, maxFetch);
      const promises = [];

      for (let i = start; i <= end; i++) {
        if (type === 'winnings') {
          promises.push(
            this.warriorsContract.getWinnings(i)
              .then((w: bigint) => ({ id: i, value: Number(ethers.formatEther(w)) }))
              .catch(() => null)
          );
        } else {
          // Default: sort by winnings
          promises.push(
            this.warriorsContract.getWinnings(i)
              .then((w: bigint) => ({ id: i, value: Number(ethers.formatEther(w)) }))
              .catch(() => null)
          );
        }
      }

      const results = await Promise.all(promises);
      results.forEach((r) => { if (r && r.value > 0) entries.push(r); });
    }

    return entries
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);
  }

  // --------------------------------------------------------------------------
  // TOURNAMENTS
  // --------------------------------------------------------------------------

  async getActiveTournaments(): Promise<any[]> {
    // No tournament contract is deployed - return empty array
    return [];
  }
}

export { BlockchainService, Warrior, Battle, ArenaStats, DailyStats };
