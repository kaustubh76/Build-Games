import { useState, useEffect } from 'react';
import { arenaFactoryService, RankingArenas, Ranking } from '../services/arenaFactoryService';
import { arenaService, type ArenaDetails } from '../services/arenaService';

export type RankCategory = 'UNRANKED' | 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

export interface ArenaWithDetails {
  address: string;
  details: ArenaDetails | null;
  isDetailsFetched: boolean;
}

export interface RankingArenasWithDetails {
  UNRANKED: ArenaWithDetails[];
  BRONZE: ArenaWithDetails[];
  SILVER: ArenaWithDetails[];
  GOLD: ArenaWithDetails[];
  PLATINUM: ArenaWithDetails[];
}

export interface UseArenasReturn {
  arenasByRanking: RankingArenas;
  arenasWithDetails: RankingArenasWithDetails;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useArenas = (): UseArenasReturn => {
  const [arenasByRanking, setArenasByRanking] = useState<RankingArenas>({
    UNRANKED: [],
    BRONZE: [],
    SILVER: [],
    GOLD: [],
    PLATINUM: []
  });
  
  const [arenasWithDetails, setArenasWithDetails] = useState<RankingArenasWithDetails>({
    UNRANKED: [],
    BRONZE: [],
    SILVER: [],
    GOLD: [],
    PLATINUM: []
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchArenaDetails = async (arenaAddress: string): Promise<ArenaWithDetails> => {
    try {
      const details = await arenaService.getArenaDetails(arenaAddress);
      return {
        address: arenaAddress,
        details,
        isDetailsFetched: true
      };
    } catch (error) {
      console.warn(`Failed to fetch details for arena ${arenaAddress}:`, error);
      return {
        address: arenaAddress,
        details: null,
        isDetailsFetched: false
      };
    }
  };

  const fetchArenas = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // First, get all arena addresses by ranking
      const arenas = await arenaFactoryService.getAllArenasByRanking();
      setArenasByRanking(arenas);

      // Then, fetch details for each arena in parallel (with some rate limiting)
      const allArenaAddresses = [
        ...arenas.UNRANKED,
        ...arenas.BRONZE,
        ...arenas.SILVER,
        ...arenas.GOLD,
        ...arenas.PLATINUM
      ];

      console.log(`🏟️ Fetching details for ${allArenaAddresses.length} arenas...`);

      // Batch arena detail fetching with concurrency limit to avoid overwhelming the network
      const BATCH_SIZE = 5;
      const arenasWithDetailsMap = new Map<string, ArenaWithDetails>();

      for (let i = 0; i < allArenaAddresses.length; i += BATCH_SIZE) {
        const batch = allArenaAddresses.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.allSettled(
          batch.map(address => fetchArenaDetails(address))
        );

        batchResults.forEach((result, index) => {
          const address = batch[index];
          if (result.status === 'fulfilled') {
            arenasWithDetailsMap.set(address, result.value);
          } else {
            arenasWithDetailsMap.set(address, {
              address,
              details: null,
              isDetailsFetched: false
            });
          }
        });

        // Small delay between batches to be kind to the network
        if (i + BATCH_SIZE < allArenaAddresses.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      // Organize arenas with details by ranking
      const arenasWithDetailsOrganized: RankingArenasWithDetails = {
        UNRANKED: arenas.UNRANKED.map(addr => arenasWithDetailsMap.get(addr)!),
        BRONZE: arenas.BRONZE.map(addr => arenasWithDetailsMap.get(addr)!),
        SILVER: arenas.SILVER.map(addr => arenasWithDetailsMap.get(addr)!),
        GOLD: arenas.GOLD.map(addr => arenasWithDetailsMap.get(addr)!),
        PLATINUM: arenas.PLATINUM.map(addr => arenasWithDetailsMap.get(addr)!)
      };

      setArenasWithDetails(arenasWithDetailsOrganized);
      console.log('✅ Arena details fetching complete');
    } catch (err) {
      console.error('Error fetching arenas:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch arenas');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchArenas();
  }, []);

  return {
    arenasByRanking,
    arenasWithDetails,
    isLoading,
    error,
    refetch: fetchArenas
  };
};

export const useArenasForRanking = (ranking: RankCategory): {
  arenas: string[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} => {
  const [arenas, setArenas] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rankingMap: Record<RankCategory, Ranking> = {
    UNRANKED: Ranking.UNRANKED,
    BRONZE: Ranking.BRONZE,
    SILVER: Ranking.SILVER,
    GOLD: Ranking.GOLD,
    PLATINUM: Ranking.PLATINUM
  };

  const fetchArenasForRanking = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const contractRanking = rankingMap[ranking];
      const fetchedArenas = await arenaFactoryService.getArenasOfRanking(contractRanking);
      setArenas(fetchedArenas);
    } catch (err) {
      console.error(`Error fetching arenas for ranking ${ranking}:`, err);
      setError(err instanceof Error ? err.message : `Failed to fetch ${ranking} arenas`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchArenasForRanking();
  }, [ranking]);

  return {
    arenas,
    isLoading,
    error,
    refetch: fetchArenasForRanking
  };
};
