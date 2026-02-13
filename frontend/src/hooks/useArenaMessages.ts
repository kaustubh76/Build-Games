import { useEffect } from 'react';
import { useWarriorMessage } from '../contexts/WarriorMessageContext';
import { WARRIOR_MESSAGES } from '../utils/warriorMessages';

interface UseArenaMessagesProps {
  isInitializing?: boolean;
  isGameStarting?: boolean;
  gameStarted?: boolean;
  isBetting?: boolean;
  betPlaced?: boolean;
  isInfluencing?: boolean;
  influencePlaced?: boolean;
  isDefluencing?: boolean;
  defluencePlaced?: boolean;
  roundComplete?: boolean;
  currentRound?: number;
  battleWon?: boolean;
  battleLost?: boolean;
  winningsClaimed?: boolean;
  selectedArena?: any;
  gameState?: string;
}

export const useArenaMessages = (props: UseArenaMessagesProps) => {
  const { showMessage } = useWarriorMessage();

  // Page load message
  useEffect(() => {
    const timer = setTimeout(() => {
      showMessage({
        id: 'arena_page_load',
        text: WARRIOR_MESSAGES.ARENA.PAGE_LOAD[
          Math.floor(Math.random() * WARRIOR_MESSAGES.ARENA.PAGE_LOAD.length)
        ],
        duration: 6000
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [showMessage]);

  // Arena initialization messages
  useEffect(() => {
    if (props.isInitializing) {
      showMessage({
        id: 'arena_initializing',
        text: WARRIOR_MESSAGES.ARENA.ARENA_INITIALIZE[
          Math.floor(Math.random() * WARRIOR_MESSAGES.ARENA.ARENA_INITIALIZE.length)
        ],
        duration: 5000
      });
    }
  }, [props.isInitializing, showMessage]);

  // Game start messages
  useEffect(() => {
    if (props.isGameStarting) {
      showMessage({
        id: 'game_starting',
        text: WARRIOR_MESSAGES.ARENA.GAME_START[
          Math.floor(Math.random() * WARRIOR_MESSAGES.ARENA.GAME_START.length)
        ],
        duration: 6000
      });
    }
  }, [props.isGameStarting, showMessage]);

  // Betting messages
  useEffect(() => {
    if (props.betPlaced && !props.isBetting) {
      showMessage({
        id: 'bet_placed',
        text: WARRIOR_MESSAGES.ARENA.BETTING_PLACED[
          Math.floor(Math.random() * WARRIOR_MESSAGES.ARENA.BETTING_PLACED.length)
        ],
        duration: 4000
      });
    }
  }, [props.betPlaced, props.isBetting, showMessage]);

  // Influence messages
  useEffect(() => {
    if (props.influencePlaced && !props.isInfluencing) {
      showMessage({
        id: 'influence_cast',
        text: WARRIOR_MESSAGES.ARENA.INFLUENCE_CAST[
          Math.floor(Math.random() * WARRIOR_MESSAGES.ARENA.INFLUENCE_CAST.length)
        ],
        duration: 4000
      });
    }
  }, [props.influencePlaced, props.isInfluencing, showMessage]);

  // Defluence messages
  useEffect(() => {
    if (props.defluencePlaced && !props.isDefluencing) {
      showMessage({
        id: 'defluence_cast',
        text: WARRIOR_MESSAGES.ARENA.DEFLUENCE_CAST[
          Math.floor(Math.random() * WARRIOR_MESSAGES.ARENA.DEFLUENCE_CAST.length)
        ],
        duration: 4000
      });
    }
  }, [props.defluencePlaced, props.isDefluencing, showMessage]);

  // Round completion messages
  useEffect(() => {
    if (props.roundComplete && props.currentRound) {
      showMessage({
        id: 'round_complete',
        text: WARRIOR_MESSAGES.ARENA.ROUND_COMPLETE[
          Math.floor(Math.random() * WARRIOR_MESSAGES.ARENA.ROUND_COMPLETE.length)
        ],
        duration: 4000
      });
    }
  }, [props.roundComplete, props.currentRound, showMessage]);

  // Battle result messages
  useEffect(() => {
    if (props.battleWon) {
      showMessage({
        id: 'battle_won',
        text: WARRIOR_MESSAGES.ARENA.BATTLE_WON[
          Math.floor(Math.random() * WARRIOR_MESSAGES.ARENA.BATTLE_WON.length)
        ],
        duration: 6000
      });
    }
  }, [props.battleWon, showMessage]);

  useEffect(() => {
    if (props.battleLost) {
      showMessage({
        id: 'battle_lost',
        text: WARRIOR_MESSAGES.ARENA.BATTLE_LOST[
          Math.floor(Math.random() * WARRIOR_MESSAGES.ARENA.BATTLE_LOST.length)
        ],
        duration: 5000
      });
    }
  }, [props.battleLost, showMessage]);

  // Winnings claimed messages
  useEffect(() => {
    if (props.winningsClaimed) {
      showMessage({
        id: 'winnings_claimed',
        text: WARRIOR_MESSAGES.ARENA.WINNINGS_CLAIMED[
          Math.floor(Math.random() * WARRIOR_MESSAGES.ARENA.WINNINGS_CLAIMED.length)
        ],
        duration: 5000
      });
    }
  }, [props.winningsClaimed, showMessage]);

  return { showMessage };
};
