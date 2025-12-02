/**
 * Basketball Integration - Main Orchestrator
 * Connects all components and manages game flow
 * This is the main entry point for the basketball game
 * Version 2.0 - Production Ready
 */

// Global variables for game components
let gameEngine = null;
let gameUI = null;
let setupManager = null;

/**
 * Initialize basketball game system
 */
function initializeBasketballSystem() {
    console.log('🏀 Initializing Basketball System...');
    
    // Check for required components
    if (typeof BasketballIntervalOptimizer === 'undefined') {
        console.error('BasketballIntervalOptimizer not loaded');
        showInitError('Basketball Interval Optimizer module not loaded');
        return false;
    }
    
    if (typeof BasketballGameEngine === 'undefined') {
        console.error('BasketballGameEngine not loaded');
        showInitError('Basketball Game Engine module not loaded');
        return false;
    }
    
    if (typeof BasketballUI === 'undefined') {
        console.error('BasketballUI not loaded');
        showInitError('Basketball UI module not loaded');
        return false;
    }
    
    if (typeof BasketballSetup === 'undefined') {
        console.error('BasketballSetup not loaded');
        showInitError('Basketball Setup module not loaded');
        return false;
    }
    
    // Initialize setup manager
    setupManager = new BasketballSetup();
    
    // Load any saved configuration
    setupManager.loadSavedConfig();
    
    console.log('✅ Basketball System initialized successfully');
    return true;
}

/**
 * Start basketball game with configuration
 */
function startBasketballGame(setupData) {
    console.log('🏀 Starting Basketball Game...');
    console.log('Setup data:', setupData);
    
    try {
        // Create game engine
        gameEngine = new BasketballGameEngine();
        
        // Initialize game with setup data
        const initResult = gameEngine.initialize(setupData);
        
        if (!initResult.success) {
            throw new Error('Game initialization failed');
        }
        
        // Create UI manager
        gameUI = new BasketballUI(gameEngine);
        if (typeof window !== 'undefined') {
            window.basketballUI = gameUI;
        }
        
        // Set up callbacks
        setupGameCallbacks();
        
        // Initial display update
        gameUI.updateDisplay(gameEngine.getState());
        
        // Save configuration for next time
        if (setupManager) {
            setupManager.saveConfig();
        }
        
        console.log('✅ Game started successfully');
        console.log(`   Roster: ${initResult.roster} players`);
        console.log(`   Rotations: ${initResult.rotations} planned`);
        console.log(`   Target: ${Math.floor(initResult.targetMinutes / 60)} minutes per player`);
        console.log(`   Expected variance: ${initResult.expectedVariance}s`);
        
        // Show initial status
        gameUI.showStatusMessage('Game ready - press START to begin', 3000, 'success');
        
        return true;
        
    } catch (error) {
        console.error('Failed to start game:', error);
        showGameError('Failed to start game: ' + error.message);
        
        // Return to setup
        document.getElementById('setup').classList.remove('hidden');
        document.getElementById('game-container').classList.add('hidden');
        
        return false;
    }
}

/**
 * Set up game callbacks
 */
function setupGameCallbacks() {
    // Update display on every tick
    gameEngine.callbacks.onUpdate = (state) => {
        gameUI.updateDisplay(state);
    };

    // Handle score updates
    gameEngine.callbacks.onScoreUpdate = (scoring) => {
        gameUI.updateScoreboard(scoring);
    };
    
    // Handle rotation notifications
    gameEngine.callbacks.onRotation = (rotation) => {
        gameUI.showRotationPending(rotation);
    };
    
    // Handle period end
    gameEngine.callbacks.onPeriodEnd = (periodInfo) => {
        handlePeriodEnd(periodInfo);
    };
    
    // Handle game end
    gameEngine.callbacks.onGameEnd = (stats) => {
        handleGameEnd(stats);
    };
    
    // Handle errors
    gameEngine.callbacks.onError = (error) => {
        gameUI.showError(error);
    };
    
    // Handle warnings
    gameEngine.callbacks.onWarning = (warning) => {
        gameUI.showStatusMessage(`Rotation in ${warning} seconds!`, 2000, 'warning');
    };

    // NEW: Handle 1-minute early warning
    gameEngine.callbacks.onEarlyWarning = (earlyWarning) => {
        gameUI.showEarlySubstitutionWarning(earlyWarning);
    };

    // Handle recovery notifications
    gameEngine.callbacks.onRecovery = (recovery) => {
        gameUI.showRecovery(recovery);
    };
}

/**
 * Handle period end
 */
function handlePeriodEnd(periodInfo) {
    console.log('Period ended:', periodInfo);
    
    if (periodInfo.isHalftime) {
        gameUI.showStatusMessage('HALFTIME - Take a break!', 0, 'info');
        // Could add halftime music or special display here
    } else {
        gameUI.showStatusMessage(`Period ${periodInfo.period} complete`, 3000, 'info');
    }
    
    // Update button to show ready for next period
    gameUI.updateStartStopButton(false);
}

/**
 * Handle game end
 */
function handleGameEnd(stats) {
    console.log('Game ended with stats:', stats);
    
    // Show final statistics
    let message = '🏁 GAME OVER! ';
    
    if (stats.variance <= 60) {
        message += `Perfect balance achieved! Variance: ${stats.variance}s`;
        gameUI.showStatusMessage(message, 0, 'success');
    } else if (stats.variance <= 90) {
        message += `Good balance. Variance: ${stats.variance}s`;
        gameUI.showStatusMessage(message, 0, 'info');
    } else {
        message += `Variance: ${stats.variance}s`;
        gameUI.showStatusMessage(message, 0, 'warning');
    }
    
    // Display detailed stats
    displayFinalStats(stats);
}

/**
 * Display final game statistics
 */
function displayFinalStats(stats) {
    console.log('📊 Final Game Statistics:');
    console.log('========================');
    
    // Overall stats
    console.log(`Total Rotations: ${stats.rotations}`);
    console.log(`Final Variance: ${stats.variance} seconds`);
    console.log(`Average Minutes: ${Math.floor(stats.averageMinutes / 60)}`);
    
    // Per-player stats
    console.log('\nPlayer Statistics:');
    console.log('------------------');
    
    const sortedPlayers = Object.entries(stats.players)
        .sort((a, b) => b[1].minutes - a[1].minutes);
    
    sortedPlayers.forEach(([player, data]) => {
        const mins = Math.floor(data.minutes / 60);
        const secs = data.minutes % 60;
        console.log(`${player}: ${mins}:${secs.toString().padStart(2, '0')} (${data.percentage}%)`);
    });
    
    // Enforcer analytics
    if (stats.enforcerAnalytics) {
        console.log('\nEnforcer Analytics:');
        console.log('-------------------');
        console.log(`Disruptions Handled: ${stats.enforcerAnalytics.metrics.disruptions}`);
        console.log(`Recoveries Executed: ${stats.enforcerAnalytics.metrics.recoveries}`);
        console.log(`Max Variance Reached: ${stats.enforcerAnalytics.metrics.maxVarianceReached}s`);
        console.log(`Players Removed: ${stats.enforcerAnalytics.removedPlayers}`);
    }
    
    // Create visual stats display (optional)
    // Could add a modal or special display for end-game stats
}

/**
 * Show initialization error
 */
function showInitError(message) {
    console.error('Initialization Error:', message);
    
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #D9534F;
        color: white;
        padding: 20px;
        border-radius: 10px;
        font-size: 18px;
        z-index: 9999;
    `;
    errorDiv.textContent = `Error: ${message}. Please refresh the page.`;
    document.body.appendChild(errorDiv);
}

/**
 * Show game error
 */
function showGameError(message) {
    console.error('Game Error:', message);
    
    const errorElement = document.getElementById('setupError');
    if (errorElement) {
        errorElement.textContent = message;
    }
}

/**
 * Global keyboard shortcuts
 */
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Don't trigger shortcuts when typing in inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        
        // Space bar - start/stop game
        if (e.code === 'Space' && gameEngine && gameEngine.state.initialized) {
            e.preventDefault();
            if (gameEngine.state.running) {
                gameEngine.stop();
                gameUI.updateStartStopButton(false);
            } else {
                gameEngine.start();
                gameUI.updateStartStopButton(true);
            }
        }
        
        // Enter - confirm pending rotation
        if (e.code === 'Enter' && gameEngine && gameEngine.rotations.pending) {
            e.preventDefault();
            gameEngine.confirmRotation();
            gameUI.elements.confirmSubButton.classList.add('hidden');
            gameUI.clearRotationHighlights();
        }
        
        // Escape - cancel pending rotation
        if (e.code === 'Escape' && gameEngine && gameEngine.rotations.pending) {
            e.preventDefault();
            gameEngine.cancelRotation();
            gameUI.elements.confirmSubButton.classList.add('hidden');
            gameUI.clearRotationHighlights();
        }
    });
    
    console.log('⌨️ Keyboard shortcuts enabled (Space=Start/Stop, Enter=Confirm, Esc=Cancel)');
}

/**
 * Debug functions for testing
 */
window.basketballDebug = {
    /**
     * Simulate player fouled out
     */
    simulateFoulOut: function(playerName) {
        if (!gameEngine) {
            console.error('Game not running');
            return;
        }
        
        const player = playerName || gameEngine.players.court[0];
        console.log(`Simulating foul out: ${player}`);
        gameEngine.playerFouledOut(player);
    },
    
    /**
     * Simulate missed rotation
     */
    simulateMissedRotation: function() {
        if (!gameEngine || !gameEngine.rotations.pending) {
            console.error('No pending rotation to miss');
            return;
        }
        
        console.log('Simulating missed rotation');
        gameEngine.cancelRotation();
    },
    
    /**
     * Force tempo change
     */
    forceTempoChange: function(tempo) {
        if (!gameEngine) {
            console.error('Game not running');
            return;
        }
        
        console.log(`Forcing tempo change to: ${tempo}`);
        gameEngine.changeTempo(tempo);
    },
    
    /**
     * Show current analytics
     */
    showAnalytics: function() {
        if (!gameEngine || !gameEngine.enforcer) {
            console.error('Game not running');
            return;
        }
        
        const analytics = gameEngine.enforcer.getAnalytics();
        console.table(analytics);
        console.table(analytics.metrics);
    },
    
    /**
     * Show rotation plan
     */
    showRotationPlan: function() {
        if (!gameEngine) {
            console.error('Game not running');
            return;
        }
        
        console.log('Current Rotation Plan:');
        gameEngine.rotations.plan.forEach((r, i) => {
            const status = i < gameEngine.rotations.currentPlanIndex ? '✅' : 
                          i === gameEngine.rotations.currentPlanIndex ? '▶️' : '⏰';
            console.log(`${status} ${gameEngine.formatTime(r.time)}: OFF [${r.off.join(', ')}] ON [${r.on.join(', ')}]`);
        });
    }
};

/**
 * Initialize everything when DOM is ready
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('=================================');
    console.log('🏀 BASKETBALL BENCH BALANCER 🏀');
    console.log('=================================');
    console.log('Version 2.0 - Production Ready');
    console.log('Target: Maintain variance < 60s');
    console.log('=================================');
    
    // Initialize system
    if (initializeBasketballSystem()) {
        // Set up keyboard shortcuts
        setupKeyboardShortcuts();
        
        // Make start function globally available
        window.startBasketballGame = startBasketballGame;
        
        // Make UI globally available for modal callbacks
        window.basketballUI = gameUI;
        
        console.log('✅ System ready - configure game and press START');
        
        // Set up Page Visibility API for time-tracking catch-up
        if (typeof document.hidden !== "undefined") {
            document.addEventListener('visibilitychange', function() {
                if (gameEngine) {
                    gameEngine.handleVisibilityChange();
                }
            });
            console.log('✅ Page Visibility API listener attached');
        } else {
            console.warn('⚠️ Page Visibility API not supported by this browser');
        }

        // Fallback for mobile browsers - pagehide/pageshow
        window.addEventListener('pagehide', function() {
            if (gameEngine && gameEngine.state.running) {
                console.log('📴 pagehide event - recording timestamp');
                gameEngine.lastVisibleTimestamp = Date.now();
                gameEngine.wasRunningWhenHidden = true;
                // Engine's handleVisibilityChange will handle stopping, but this is a fallback.
            }
        });

        window.addEventListener('pageshow', function(event) {
            if (event.persisted && gameEngine) {
                console.log('📱 pageshow event (from bfcache)');
                // Let the primary visibilitychange handler do the work if it fires.
                // This is a fallback for browsers that might not fire it on bfcache restore.
                if (gameEngine.wasRunningWhenHidden && gameEngine.lastVisibleTimestamp) {
                     // A small delay to see if visibilitychange handles it first
                    setTimeout(() => {
                        // If lastVisibleTimestamp is still set, the other handler hasn't run
                        if (gameEngine.lastVisibleTimestamp) {
                             console.log("Pageshow fallback is taking action.");
                             gameEngine.handleVisibilityChange();
                        }
                    }, 100);
                }
            }
        });

        console.log('✅ Page visibility handlers configured');

        // Debug mode indicator
        if (window.location.hash === '#debug') {
            console.log('🔍 Debug mode enabled - use basketballDebug.* functions');
        }
    } else {
        console.error('❌ System initialization failed');
    }
});

/**
 * Handle page unload
 */
window.addEventListener('beforeunload', function(e) {
    // Save configuration if game is running
    if (gameEngine && gameEngine.state.initialized && !gameEngine.state.gameOver) {
        if (setupManager) {
            setupManager.saveConfig();
        }
        
        // Warn about leaving during game
        if (gameEngine.state.running) {
            e.preventDefault();
            e.returnValue = 'Game in progress. Are you sure you want to leave?';
        }
    }
});

// Export for debugging
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initializeBasketballSystem,
        startBasketballGame
    };
}

console.log('🏀 Basketball Integration loaded - Main orchestrator ready');
