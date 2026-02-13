export interface ArenaState {
  battleId: number;
  state: 'BETTING' | 'IN_PROGRESS' | 'ENDED';
  startTime: number;
  lastRoundTime?: number;
}

class ArenaAutomationService {
  private monitoredBattles = new Map<number, ArenaState>();
  private intervalId: NodeJS.Timeout | null = null;

  startMonitoring() {
    if (this.intervalId) return;
    
    this.intervalId = setInterval(async () => {
      await this.checkAndExecuteAutomation();
    }, 5000); // Check every 5 seconds
  }

  stopMonitoring() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  addBattleForMonitoring(battleId: number) {
    this.monitoredBattles.set(battleId, {
      battleId,
      state: 'BETTING',
      startTime: Date.now()
    });
  }

  updateBattleState(battleId: number, state: 'BETTING' | 'IN_PROGRESS' | 'ENDED') {
    const battle = this.monitoredBattles.get(battleId);
    if (battle) {
      battle.state = state;
      if (state === 'IN_PROGRESS' && !battle.lastRoundTime) {
        battle.lastRoundTime = Date.now();
      }
    }
  }

  removeBattle(battleId: number) {
    this.monitoredBattles.delete(battleId);
  }

  private async checkAndExecuteAutomation() {
    const now = Date.now();
    
    for (const [battleId, battle] of this.monitoredBattles) {
      try {
        if (battle.state === 'BETTING') {
          // Check if betting period (70 seconds) has ended
          if (now - battle.startTime >= 70000) {
            await this.callGameMaster('start-game', { battleId });
            battle.state = 'IN_PROGRESS';
            battle.lastRoundTime = now;
          }
        } else if (battle.state === 'IN_PROGRESS') {
          // Check if 40 seconds have passed since last round
          if (battle.lastRoundTime && now - battle.lastRoundTime >= 40000) {
            await this.callGameMaster('next-round', { battleId });
            battle.lastRoundTime = now;
          }
        }
      } catch (error) {
        console.error(`Error processing battle ${battleId}:`, error);
      }
    }
  }

  private async callGameMaster(action: string, data: any) {
    try {
      const response = await fetch('/api/game-master', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, ...data }),
      });

      if (!response.ok) {
        throw new Error(`Game master call failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`Game master action ${action} completed:`, result);
      return result;
    } catch (error) {
      console.error(`Failed to call game master for ${action}:`, error);
      throw error;
    }
  }

  getBattleState(battleId: number): ArenaState | undefined {
    return this.monitoredBattles.get(battleId);
  }

  getTimeRemaining(battleId: number): { bettingTimeLeft?: number; nextRoundTimeLeft?: number } {
    const battle = this.monitoredBattles.get(battleId);
    if (!battle) return {};

    const now = Date.now();

    if (battle.state === 'BETTING') {
      const bettingTimeLeft = Math.max(0, 70000 - (now - battle.startTime));
      return { bettingTimeLeft };
    } else if (battle.state === 'IN_PROGRESS' && battle.lastRoundTime) {
      const nextRoundTimeLeft = Math.max(0, 40000 - (now - battle.lastRoundTime));
      return { nextRoundTimeLeft };
    }

    return {};
  }
}

export const arenaAutomation = new ArenaAutomationService();
