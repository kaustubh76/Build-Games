import { Router, Request, Response } from 'express';

const router = Router();

// Command queue for frontend polling
const commandQueue = new Map<string, any>();
export const gameStates = new Map<string, any>(); // Export for status endpoint
const activeTimers = new Map<string, NodeJS.Timeout>();

// Timer management - sends commands to frontend
function startCommandTimer(battleId: string, intervalMs: number = 1000) {
  stopCommandTimer(battleId);
  
  console.log(`⏰ Starting command timer for battle ${battleId}`);
  
  const timer = setInterval(async () => {
    const state = gameStates.get(battleId);
    if (!state) {
      console.log(`⏹️ No game state for ${battleId}, stopping timer`);
      stopCommandTimer(battleId);
      return;
    }

    if (state.gameState === 'finished') {
      console.log(`🏁 Battle ${battleId} finished, stopping timer`);
      stopCommandTimer(battleId);
      return;
    }

    // Update countdown
    const elapsed = Date.now() - state.lastUpdate;
    state.timeRemaining = Math.max(0, state.totalTime - Math.floor(elapsed / 1000));

    // Send commands to frontend when timer expires
    if (state.timeRemaining <= 0) {
      console.log(`⏰ Timer expired! Phase: ${state.phase}, Round: ${state.currentRound}`);
      
      if (state.phase === 'startGame') {
        // 70 seconds expired -> Send startGame command to frontend
        console.log(`🎮 Timer expired - sending START GAME command to frontend`);
        
        commandQueue.set(battleId, {
          action: 'startGame',
          timestamp: Date.now(),
          battleId: battleId,
          requiresVerification: true
        });
        
        // Switch to battle phase optimistically - frontend will reset if needed
        state.phase = 'battle';
        state.currentRound = 1;
        state.timeRemaining = 60;
        state.totalTime = 60;
        state.lastUpdate = Date.now();
        gameStates.set(battleId, state);
        
        console.log(`⏰ First NEXT ROUND command will be sent in 60 seconds`);
        console.log(`📝 Note: If startGame fails due to insufficient bets, frontend should call reset endpoint`);
        
      } else if (state.phase === 'battle') {
        // 60 seconds expired -> Send nextRound command to frontend
        if (state.currentRound <= 5) { // Changed from 5 to 6 to allow final round
          console.log(`⚔️ 60 seconds expired - sending NEXT ROUND command to frontend for round ${state.currentRound}`);
          console.log(`📤 QUEUEING nextRound command for battleId: ${battleId}`);
          
          const command = {
            action: 'nextRound',
            timestamp: Date.now(),
            battleId: battleId,
            round: state.currentRound
          };
          
          commandQueue.set(battleId, command);
          console.log(`📦 Command queued:`, command);
          
          state.currentRound += 1;
          
          if (state.currentRound <= 5) { // Changed from 5 to 6
            state.timeRemaining = 60;
            state.totalTime = 60;
            state.lastUpdate = Date.now();
            gameStates.set(battleId, state);
            
            console.log(`⏰ Next ROUND command (${state.currentRound}) in 60 seconds`);
            
          } else {
            console.log(`🏁 All rounds completed! Game finished.`);
            state.gameState = 'finished';
            gameStates.set(battleId, state);
            stopCommandTimer(battleId);
          }
        } else {
          console.log(`🏁 Game completed, stopping automation`);
          state.gameState = 'finished';
          gameStates.set(battleId, state);
          stopCommandTimer(battleId);
        }
      }
    }
  }, intervalMs);
  
  activeTimers.set(battleId, timer);
}

function stopCommandTimer(battleId: string) {
  const timer = activeTimers.get(battleId);
  if (timer) {
    console.log(`⏹️ Stopping command timer for battle ${battleId}`);
    clearInterval(timer);
    activeTimers.delete(battleId);
  }
}

// GET /api/arena/commands?battleId=xxx
router.get('/', async (req: Request, res: Response) => {
  const { battleId } = req.query;
  if (!battleId || typeof battleId !== 'string') {
    return res.status(400).json({ error: 'Battle ID is required' });
  }

  try {
    // Check for pending commands - ONLY FRONTEND POLLING SHOULD USE THIS
    console.log(`📡 GET request for battleId: ${battleId}`);
    const command = commandQueue.get(battleId);
    if (command) {
      console.log(`📤 Sending command to frontend:`, command);
      // Clear the command after sending it - ONLY frontend consumes commands
      commandQueue.delete(battleId);
      console.log(`🗑️ Command removed from queue for battleId: ${battleId}`);
      return res.status(200).json({
        hasCommand: true,
        command: command,
        gameState: gameStates.get(battleId)
      });
    }
    
    // Return current state - Return 200 even if no gameState to prevent 404 errors
    const gameState = gameStates.get(battleId);
    console.log(`📊 No command, returning state for ${battleId}:`, gameState?.phase, gameState?.currentRound);
    
    // Return 200 with empty state instead of 404 to prevent frontend errors
    return res.status(200).json({
      hasCommand: false,
      gameState: gameState || null
    });
  } catch (error) {
    console.error('❌ Command automation error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
      battleId: battleId
    });
  }
});

// POST /api/arena/commands?battleId=xxx
router.post('/', async (req: Request, res: Response) => {
  const { battleId } = req.query;
  if (!battleId || typeof battleId !== 'string') {
    return res.status(400).json({ error: 'Battle ID is required' });
  }

  try {
    const { action, warriors1Id, warriors2Id } = req.body;
    
    switch (action) {
      case 'initialize':
        console.log(`🎮 Initializing command-based automation for battle ${battleId}`);
        
        const newGameState = {
          battleId,
          gameState: 'playing',
          phase: 'startGame', // startGame -> battle
          timeRemaining: 70, // Back to 70 seconds for production
          totalTime: 70,
          lastUpdate: Date.now(),
          currentRound: 0, // Will become 1 after startGame
          totalRounds: 5,
          warriors1Id,
          warriors2Id,
          automationEnabled: true,
          type: 'command-based' // Mark this as command-based automation
        };
        
        gameStates.set(battleId, newGameState);
        startCommandTimer(battleId);
        
        console.log(`✅ Command-based automation ${battleId} initialized - will send startGame command in 70s`);
        
        return res.status(200).json({
          ...newGameState,
          message: 'Command-based automation initialized - frontend will be triggered automatically',
          arenaAddress: battleId,
          contractAddress: battleId
        });

      case 'cleanup':
        stopCommandTimer(battleId);
        gameStates.delete(battleId);
        commandQueue.delete(battleId);
        
        console.log(`🧹 Cleaned up command-based automation ${battleId}`);
        return res.status(200).json({ message: 'Command automation cleaned up' });

      case 'resume':
        const pausedState = gameStates.get(battleId);
        if (pausedState) {
          pausedState.gameState = 'playing';
          startCommandTimer(battleId);
          gameStates.set(battleId, pausedState);
          return res.status(200).json({ message: 'Command automation resumed' });
        }
        return res.status(404).json({ error: 'Battle not found' });

      case 'reset':
        // Called by frontend when startGame fails due to insufficient bets
        const currentState = gameStates.get(battleId);
        if (currentState) {
          console.log(`🔄 Frontend reported startGame failed - stopping automation for ${battleId}`);
          
          // Stop the timer to prevent further automatic commands
          stopCommandTimer(battleId);
          
          // Clear any pending commands
          commandQueue.delete(battleId);
          
          // Mark automation as disabled
          currentState.automationEnabled = false;
          currentState.gameState = 'stopped';
          currentState.phase = 'startGame';
          currentState.currentRound = 0;
          currentState.timeRemaining = 0; // Set to 0 to indicate stopped
          currentState.totalTime = 70;
          currentState.lastUpdate = Date.now();
          gameStates.set(battleId, currentState);
          
          return res.status(200).json({ 
            message: 'Automation stopped due to failed startGame verification',
            gameState: currentState,
            automationStopped: true
          });
        }
        return res.status(404).json({ error: 'Battle not found' });

      default:
        return res.status(400).json({ error: 'Invalid action. Use "initialize", "cleanup", "resume", or "reset"' });
    }
  } catch (error) {
    console.error('❌ Command automation error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
      battleId: battleId
    });
  }
});

export const commandsRouter = router; 