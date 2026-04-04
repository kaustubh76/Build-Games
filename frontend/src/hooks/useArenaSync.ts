// Frontend hook to sync arena state from on-chain contract via API
import { useState, useEffect, useCallback } from 'react';

interface ArenaGameState {
  battleId: string | null;
  gameState: 'idle' | 'playing' | 'finished';
  phase: 'startGame' | 'battle';
  timeRemaining: number;
  totalTime: number;
  lastUpdate: number;
  warriors1Id: number | null;
  warriors2Id: number | null;
  currentRound: number;
  totalRounds: number;
  automationEnabled: boolean;
  type: string;
}

export const useArenaSync = (battleId: string | null) => {
  const [gameState, setGameState] = useState<ArenaGameState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch game state from chain-reading status endpoint
  const fetchGameState = useCallback(async () => {
    if (!battleId) return;

    try {
      const response = await fetch(`/api/arena/status?battleId=${battleId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.gameState) {
          setGameState(data.gameState);
          setError(null);
        } else {
          setGameState(null);
          setError(null);
        }
      } else {
        console.warn(`Status API returned ${response.status} for battle ${battleId}`);
        setError(null);
        setGameState(null);
      }
    } catch (err) {
      console.warn('Arena sync warning (non-critical):', err);
      setError(null);
      setGameState(null);
    }
  }, [battleId]);

  // Initialize battle — no-op since arena init happens on-chain
  const initializeBattle = useCallback(async (warriors1Id: number, warriors2Id: number) => {
    if (!battleId) return;

    setIsLoading(true);
    try {
      // Notify the API (no-op — on-chain handles init)
      await fetch(`/api/arena/commands?battleId=${battleId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'initialize', warriors1Id, warriors2Id }),
      });

      // Start polling chain state
      await fetchGameState();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize';
      setError(errorMessage);
      console.error('Battle initialization error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [battleId, fetchGameState]);

  // Manual start game — handled by frontend calling contract directly
  const manualStartGame = useCallback(async () => {
    console.log('startGame is executed on-chain via smart contract');
  }, []);

  // Manual next round — handled by frontend calling game-master + contract
  const manualNextRound = useCallback(async () => {
    console.log('nextRound is executed on-chain via smart contract');
  }, []);

  // Cleanup — no-op since game cleanup happens on-chain
  const cleanupBattle = useCallback(async () => {
    if (!battleId) return;
    // No DB cleanup needed — state lives on chain
  }, [battleId]);

  // Poll chain state for timer updates
  useEffect(() => {
    if (!battleId) return;

    const interval = setInterval(() => {
      fetchGameState().catch(() => {});
    }, 3000); // Poll every 3 seconds (chain reads)

    fetchGameState().catch((err) => {
      console.warn('Initial status fetch warning (non-critical):', err);
    });

    return () => clearInterval(interval);
  }, [battleId, fetchGameState]);

  return {
    gameState,
    isLoading,
    error,
    initializeBattle,
    manualStartGame,
    manualNextRound,
    cleanupBattle,
  };
};
