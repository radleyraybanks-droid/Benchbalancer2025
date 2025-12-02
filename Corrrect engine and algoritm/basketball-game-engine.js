/**
 * Basketball Game Engine - FIXED VERSION
 * Ensures exactly courtSpots players on court at all times
 * Version 3.1 - Production Ready with Centralized Config
 *
 * @fileoverview Main game engine for basketball game management.
 * Handles timing, rotations, scoring, and player management.
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * @typedef {Object} GameConfig
 * @property {string} format - Game format ('halves' or 'quarters')
 * @property {number} periodLength - Length of each period in seconds
 * @property {number} numPeriods - Number of periods
 * @property {number} courtSpots - Number of players on court
 * @property {number} defaultBench - Default bench size
 * @property {number} defaultRotationsPerChange - Default subs per rotation
 * @property {boolean} autoConfirmRotations - Auto-confirm rotations
 * @property {number} warningBeepTime - Warning time before rotation
 */

/**
 * @typedef {Object} GameState
 * @property {boolean} initialized - Whether game is initialized
 * @property {boolean} running - Whether timer is running
 * @property {boolean} paused - Whether game is paused
 * @property {number} currentTime - Current game time in seconds
 * @property {number} currentPeriod - Current period number
 * @property {number} periodElapsed - Time elapsed in current period
 * @property {boolean} isHalftime - Whether at halftime
 * @property {boolean} gameOver - Whether game has ended
 */

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const ENGINE_DEFAULTS = {
    COURT_SPOTS: 5,
    DEFAULT_BENCH: 3,
    DEFAULT_PERIOD_LENGTH: 1200,
    DEFAULT_NUM_PERIODS: 2,
    WARNING_BEEP_TIME: 10,
    EARLY_WARNING_TIME: 60,
    VALIDATION_INTERVAL: 30,
    MAX_CATCHUP_SECONDS: 3600,
    MAX_TICK_CATCHUP: 10,
};

// Merge with global config if available
const GAME_CONFIG = (typeof window !== 'undefined' && window.GameConfig?.BASKETBALL_DEFAULTS)
    ? { ...ENGINE_DEFAULTS, ...window.GameConfig.BASKETBALL_DEFAULTS }
    : ENGINE_DEFAULTS;

// ============================================================================
// MAIN CLASS
// ============================================================================

class BasketballGameEngine {
    constructor() {
        // Game configuration - use centralized defaults
        this.config = {
            format: 'halves',
            periodLength: GAME_CONFIG.DEFAULT_PERIOD_LENGTH,
            numPeriods: GAME_CONFIG.DEFAULT_NUM_PERIODS,
            courtSpots: GAME_CONFIG.COURT_SPOTS,
            defaultBench: GAME_CONFIG.DEFAULT_BENCH,
            defaultRotationsPerChange: 2,
            autoConfirmRotations: false,
            warningBeepTime: GAME_CONFIG.WARNING_BEEP_TIME
        };
        
        // Game state
        this.state = {
            initialized: false,
            running: false,
            paused: false,
            currentTime: 0,
            currentPeriod: 1,
            periodElapsed: 0,
            isHalftime: false,
            gameOver: false
        };
        
        // Player management - critical tracking
        this.players = {
            all: [],
            court: [],  // MUST always have exactly 5
            bench: [],  // Everyone else not on court
            removed: new Set(),
            minutes: {},
            benchMinutes: {},
            currentStints: {},
            positions: {},
            lastRotationTime: {}
        };
        
        // Scoring management
        this.scoring = {
            home: 0,
            away: 0,
            homeTeamName: 'Home',
            awayTeamName: 'Opposition',
            playerPoints: {}
        };
        
        // Rotation management
        this.rotations = {
            pending: false,
            pendingOff: [],
            pendingOn: [],
            pendingTime: null,
            history: [],
            nextScheduled: null,
            plan: [],
            currentPlanIndex: 0,
            lastConfirmedIndex: -1
        };
        
        this.enforcer = null;
        
        // UI callbacks
        this.callbacks = {
            onUpdate: null,
            onRotation: null,
            onPeriodEnd: null,
            onGameEnd: null,
            onError: null,
            onWarning: null,
            onEarlyWarning: null,  // NEW: 1-minute early warning callback
            onRecovery: null,
            onScoreUpdate: null
        };
        
        // Timer
        this.timerInterval = null;
        this.lastTickTime = null;
        this.warningPlayed = false;
        this.earlyWarningShown = false;  // NEW: Track 1-minute early warning
        
        // Page Visibility tracking for catch-up when tab is hidden/restored
        this.lastVisibleTimestamp = null;
        this.wasRunningWhenHidden = false;
        
        // Audio
        this.audio = {
            warningBeep: null,
            whistle: null,
            enabled: true
        };
        
        this.planTargetMinutes = 0;
        this.totalGameLength = 0;
        
        // State validation flag
        this._stateNeedsValidation = false;

        console.log('🏀 Basketball Game Engine v3.1 initialized');
    }

    /**
     * Mark state as needing validation
     * Call this when state might be inconsistent
     */
    markStateDirty() {
        this._stateNeedsValidation = true;
    }

    /**
     * Validate court/bench state - CRITICAL METHOD
     * Ensures court has exactly courtSpots players and no duplicates
     * @returns {boolean} Whether state is valid
     */
    validatePlayerState() {
        const errors = [];
        const expectedCourtSize = this.config.courtSpots;

        // Check court has exactly courtSpots players
        if (this.players.court.length !== expectedCourtSize) {
            errors.push(`Court has ${this.players.court.length} players, should be ${expectedCourtSize}`);
        }
        
        // Check no duplicates
        const allActive = [...this.players.court, ...this.players.bench];
        const uniqueActive = new Set(allActive);
        if (uniqueActive.size !== allActive.length) {
            errors.push('Duplicate players found in court/bench');
        }
        
        // Check all non-removed players are accounted for
        const expectedActive = this.players.all.filter(p => !this.players.removed.has(p));
        if (expectedActive.length !== allActive.length) {
            errors.push(`Player count mismatch: ${expectedActive.length} expected, ${allActive.length} found`);
        }
        
        if (errors.length > 0) {
            console.error('❌ PLAYER STATE INVALID:', errors);
            this.fixPlayerState();
            return false;
        }
        
        return true;
    }
    
    /**
     * Fix invalid player state
     * Ensures court has exactly courtSpots players
     */
    fixPlayerState() {
        console.warn('🔧 Fixing player state...');

        const expectedCourtSize = this.config.courtSpots;

        // Get all active players
        const activePlayers = this.players.all.filter(p => !this.players.removed.has(p));

        // Current court players (deduplicated)
        const currentCourt = [...new Set(this.players.court)];

        // If too many on court, move extras to bench
        if (currentCourt.length > expectedCourtSize) {
            const toRemove = currentCourt.length - expectedCourtSize;
            const removed = currentCourt.splice(expectedCourtSize, toRemove);
            this.players.court = currentCourt.slice(0, expectedCourtSize);
            this.players.bench = [...new Set([...this.players.bench, ...removed])];
        }

        // If too few on court, pull from bench
        else if (currentCourt.length < expectedCourtSize) {
            const needed = expectedCourtSize - currentCourt.length;
            const benchAvailable = this.players.bench.slice(0, needed);
            this.players.court = [...currentCourt, ...benchAvailable];
            this.players.bench = this.players.bench.slice(needed);
        } else {
            this.players.court = currentCourt;
        }

        // Ensure bench has everyone else
        const onCourtSet = new Set(this.players.court);
        this.players.bench = activePlayers.filter(p => !onCourtSet.has(p));

        console.log(`✅ Fixed: ${this.players.court.length} on court, ${this.players.bench.length} on bench`);
    }
    
    /**
     * Initialize game with setup parameters
     */
    initialize(setupData) {
        console.log('Initializing game with setup:', setupData);
        
        // Parse setup data
        this.config.format = setupData.format || 'halves';
        this.config.periodLength = (setupData.minutesPerPeriod || 20) * 60;
        this.config.numPeriods = this.config.format === 'quarters' ? 4 : 2;
        this.config.autoConfirmRotations = setupData.autoConfirmRotations || false;
        this.config.warningBeepTime = setupData.warningBeepTime || 10;
        
        const numReserves = setupData.numReserves || 3;
        const totalPlayers = 5 + numReserves;
        
        // Set up players
        this.players.all = this.createPlayerRoster(setupData.starterNames, setupData.reserveNames);
        this.players.court = this.players.all.slice(0, 5); // EXACTLY 5
        this.players.bench = this.players.all.slice(5);    // Everyone else
        
        // Validate initial state
        this.validatePlayerState();
        
        // Initialize player tracking
        this.players.all.forEach(player => {
            this.players.minutes[player] = 0;
            this.players.benchMinutes[player] = 0;
            this.players.currentStints[player] = { 
                start: 0, 
                onCourt: this.players.court.includes(player) 
            };
            this.players.lastRotationTime[player] = 0;
        });
        
        // Initialize player scoring
        this.scoring.home = 0;
        this.scoring.away = 0;
        this.scoring.homeTeamName = 'Home';
        this.scoring.awayTeamName = 'Opposition';
        this.scoring.playerPoints = {};
        this.players.all.forEach(player => {
            this.scoring.playerPoints[player] = 0;
        });

        // Assign initial positions
        this.assignPositions(this.players.court);
        
        // Set up optimizer
        const totalGameLength = this.config.periodLength * this.config.numPeriods;
        this.totalGameLength = totalGameLength;
        
        const subsPerRotation = setupData.subsPerChange || setupData.rotationsPerChange || 2; // Legacy
        const idealShifts = setupData.idealShiftsPerPlayer || 4; // NEW: Primary configuration
        const OptimizerCtor = window.BasketballIntervalOptimizer;

        this.enforcer = new OptimizerCtor({
            gameLength: totalGameLength,
            periodLength: this.config.periodLength,
            totalPlayers: totalPlayers,
            idealShiftsPerPlayer: idealShifts, // NEW: Primary configuration
            subsPerRotation: Math.max(1, Math.min(2, subsPerRotation)), // Legacy compatibility
            minRotationGapSec: 120 // Legacy compatibility (not used in hybrid)
        });
        
        this.enforcer.tempo = 'balanced';
        
        // Initialize enforcer
        this.enforcer.initialize(this.players.all, {
            onCourt: [...this.players.court],
            onBench: [...this.players.bench],
            playerMinutes: {...this.players.minutes},
            elapsedTime: 0
        });
        
        // Generate plan
        const gen = this.enforcer.generatePlan(0, []);
        const plan = {
            plan: gen ? gen.rotations.map(r => ({ time: r.time, off: r.off, on: r.on })) : [],
            targetMinutes: Math.floor((totalGameLength * 5) / totalPlayers),
            expectedVariance: gen ? gen.expectedVariance : 0
        };
        
        this.rotations.plan = plan.plan;
        this.planTargetMinutes = plan.targetMinutes;
        this.rotations.currentPlanIndex = 0;
        this.updateNextRotation();
        
        // Set audio preference
        this.audio.enabled = setupData.enableWarningSound !== false;
        if (this.audio.enabled) {
            this.preloadAudio();
        }
        
        this.state.initialized = true;
        
        console.log('✅ Game initialized successfully');
        console.log(`   Roster: ${totalPlayers} players (${this.players.court.length} court, ${this.players.bench.length} bench)`);
        console.log(`   Format: ${this.config.numPeriods} × ${this.config.periodLength / 60} minutes`);
        console.log(`   Rotations planned: ${this.rotations.plan.length}`);
        console.log(`   Expected variance: ${plan.expectedVariance}s`);
        
        return {
            success: true,
            roster: totalPlayers,
            rotations: this.rotations.plan.length,
            targetMinutes: plan.targetMinutes,
            expectedVariance: plan.expectedVariance
        };
    }
    
    /**
     * Create player roster from names
     */
    createPlayerRoster(starterNames = [], reserveNames = []) {
        const roster = [];
        
        // Add starters (ensure we have 5)
        for (let i = 0; i < 5; i++) {
            roster.push(starterNames[i] || `Player ${i + 1}`);
        }
        
        // Add reserves
        reserveNames.forEach((name, index) => {
            roster.push(name || `Reserve ${index + 1}`);
        });
        
        return roster;
    }
    
    /**
     * Assign positions to players on court
     */
    assignPositions(courtPlayers) {
        const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
        courtPlayers.forEach((player, index) => {
            if (index < 5) {
                this.players.positions[player] = positions[index];
            }
        });
    }
    
    /**
     * Confirm pending rotation - FIXED
     */
    confirmRotation() {
        if (!this.rotations.pending) {
            this.handleError('No pending rotation to confirm');
            return false;
        }
        
        const { pendingOff, pendingOn } = this.rotations;
        
        // Validate rotation
        if (pendingOff.length !== pendingOn.length) {
            this.handleError('Invalid rotation: off/on counts do not match');
            return false;
        }
        
        // Check all OFF players are on court
        for (const player of pendingOff) {
            if (!this.players.court.includes(player)) {
                this.handleError(`Cannot sub off ${player} - not on court`);
                return false;
            }
        }
        
        // Check all ON players are on bench
        for (const player of pendingOn) {
            if (!this.players.bench.includes(player)) {
                this.handleError(`Cannot sub on ${player} - not on bench`);
                return false;
            }
        }
        
        const plannedTime = this.rotations.pendingTime;
        const rotationTime = this.state.currentTime;
        const delay = rotationTime - plannedTime;
        
        console.log(`✅ Rotation confirmed at ${this.formatTime(rotationTime)}`);
        
        // Execute rotation - CAREFUL ORDER
        // 1. Remove from court
        this.players.court = this.players.court.filter(p => !pendingOff.includes(p));
        
        // 2. Add to court
        this.players.court.push(...pendingOn);
        
        // 3. Remove from bench
        this.players.bench = this.players.bench.filter(p => !pendingOn.includes(p));
        
        // 4. Add to bench
        this.players.bench.push(...pendingOff);
        
        // Validate we still have exactly 5
        this.validatePlayerState();
        
        // Update positions for new court players
        this.assignPositions(this.players.court);
        
        // Update stints
        pendingOff.forEach(player => {
            this.players.currentStints[player].onCourt = false;
            this.players.lastRotationTime[player] = rotationTime;
        });
        
        pendingOn.forEach(player => {
            this.players.currentStints[player] = { 
                start: rotationTime, 
                onCourt: true 
            };
            this.players.lastRotationTime[player] = rotationTime;
        });
        
        // Record rotation
        this.rotations.history.push({
            time: rotationTime,
            off: pendingOff,
            on: pendingOn
        });
        
        // Handle late rotation
        const isLate = delay > 15;
        if (isLate) {
            console.log(`⚠️ Rotation was ${delay} seconds late - triggering recalculation`);
            if (this.enforcer) {
                const playTimesSnapshot = { ...this.players.minutes };

                // Log the actual state BEFORE generating recovery plan
                console.log(`Current court after rotation: ${this.players.court.join(', ')}`);
                console.log(`Current bench after rotation: ${this.players.bench.join(', ')}`);

                this.enforcer.syncWithActualState(
                    this.state.currentTime,
                    [...this.players.court],
                    [...this.players.bench],
                    playTimesSnapshot
                );
                const newPlan = this.enforcer.handleDeviation(
                    'late_substitution',
                    {
                        actualCourt: [...this.players.court],
                        actualBench: [...this.players.bench],
                        playTimes: playTimesSnapshot
                    },
                    rotationTime
                );
                if (newPlan) {
                    console.log('Recovery plan rotations:');
                    if (newPlan.rotations) {
                        newPlan.rotations.forEach(r => {
                            console.log(`  At ${this.formatTime(r.time)}: OFF: [${r.off.join(', ')}], ON: [${r.on.join(', ')}]`);
                        });
                    }
                    this.applyRecoveryPlan(newPlan);
                }
            }
        }
        
        // Clear pending
        this.rotations.pending = false;
        this.rotations.pendingOff = [];
        this.rotations.pendingOn = [];
        this.rotations.pendingTime = null;
        
        // Update rotation index
        this.rotations.lastConfirmedIndex = this.rotations.currentPlanIndex;
        this.rotations.currentPlanIndex++;
        
        // Update next rotation
        this.updateNextRotation();
        
        return true;
    }
    
    /**
     * Handle emergency substitution - FIXED with playTimes
     */
    emergencySubstitution(playerOff, playerOn, removeFromGame = false) {
        console.log(`🚨 Emergency substitution: ${playerOff} → ${playerOn}`);
        
        // Validate
        if (!this.players.court.includes(playerOff)) {
            this.handleError(`${playerOff} is not on court`);
            return false;
        }
        
        if (!this.players.bench.includes(playerOn)) {
            this.handleError(`${playerOn} is not on bench`);
            return false;
        }
        
        // Execute substitution - ATOMIC OPERATION
        const courtIndex = this.players.court.indexOf(playerOff);
        this.players.court[courtIndex] = playerOn;
        
        const benchIndex = this.players.bench.indexOf(playerOn);
        this.players.bench[benchIndex] = playerOff;
        
        // Validate state
        this.validatePlayerState();
        
        // Update positions
        this.players.positions[playerOn] = this.players.positions[playerOff];
        delete this.players.positions[playerOff];
        
        // Update stints
        this.players.currentStints[playerOff].onCourt = false;
        this.players.currentStints[playerOn] = { 
            start: this.state.currentTime, 
            onCourt: true 
        };
        
        // Record
        this.rotations.history.push({
            time: this.state.currentTime,
            off: [playerOff],
            on: [playerOn],
            reason: 'emergency'
        });
        
        // Handle removal if requested
        if (removeFromGame) {
            this.removePlayer(playerOff);
        }
        
        // Notify optimizer and replan WITH PLAY TIMES
        if (this.enforcer) {
            const playTimesSnapshot = { ...this.players.minutes };
            this.enforcer.syncWithActualState(
                this.state.currentTime, 
                [...this.players.court], 
                [...this.players.bench],
                playTimesSnapshot
            );
            const deviationType = removeFromGame ? 'injury' : 'late_substitution';
            const newPlan = this.enforcer.handleDeviation(
                deviationType,
                { 
                    player: playerOff, 
                    actualCourt: [...this.players.court], 
                    actualBench: [...this.players.bench],
                    playTimes: playTimesSnapshot
                },
                this.state.currentTime
            );
            if (newPlan) {
                this.applyRecoveryPlan(newPlan);
            }
        }
        
        return true;
    }
    
    /**
     * Handle player fouled out - FIXED with playTimes
     */
    playerFouledOut(player) {
        console.log(`🚫 ${player} fouled out`);
        
        if (!this.players.all.includes(player)) {
            this.handleError(`${player} not in roster`);
            return false;
        }
        
        // If on court, need immediate substitution
        if (this.players.court.includes(player)) {
            const availableBench = this.players.bench.filter(p => !this.players.removed.has(p));
            
            if (availableBench.length === 0) {
                this.handleError('No available players to substitute');
                return false;
            }
            
            // Auto-select replacement (least minutes)
            const replacement = availableBench.sort((a, b) => 
                (this.players.minutes[a] || 0) - (this.players.minutes[b] || 0)
            )[0];
            
            // Execute substitution - ATOMIC
            const courtIndex = this.players.court.indexOf(player);
            this.players.court[courtIndex] = replacement;
            
            const benchIndex = this.players.bench.indexOf(replacement);
            this.players.bench.splice(benchIndex, 1);
            
            // DON'T add fouled player to bench - they're removed
            
            // Update positions
            this.players.positions[replacement] = this.players.positions[player];
            delete this.players.positions[player];
            
            console.log(`   Auto-subbed ${replacement} for ${player}`);
        } else {
            // Remove from bench
            this.players.bench = this.players.bench.filter(p => p !== player);
        }
        
        // Mark as removed
        this.players.removed.add(player);
        
        // Validate state
        this.validatePlayerState();
        
        // Notify optimizer WITH PLAY TIMES
        if (this.enforcer) {
            const playTimesSnapshot = { ...this.players.minutes };
            this.enforcer.syncWithActualState(
                this.state.currentTime, 
                [...this.players.court], 
                [...this.players.bench],
                playTimesSnapshot
            );
            const newPlan = this.enforcer.handleDeviation(
                'injury',
                { 
                    player: player, 
                    actualCourt: [...this.players.court], 
                    actualBench: [...this.players.bench],
                    playTimes: playTimesSnapshot
                },
                this.state.currentTime
            );
            if (newPlan) {
                this.applyRecoveryPlan(newPlan);
            }
        }
        
        return true;
    }
    
    /**
     * Remove player from game
     */
    removePlayer(player) {
        if (this.players.removed.has(player)) {
            return true;
        }
        
        console.log(`🚫 Removing ${player} from game`);
        
        // Remove from bench (should NOT be on court)
        if (this.players.court.includes(player)) {
            this.handleError(`Cannot remove ${player} - still on court!`);
            return false;
        }
        
        this.players.bench = this.players.bench.filter(p => p !== player);
        this.players.removed.add(player);
        
        // Validate
        this.validatePlayerState();
        
        return true;
    }
    
    /**
     * Return removed player
     */
    returnPlayer(player) {
        if (!this.players.removed.has(player)) {
            this.handleError(`${player} was not removed`);
            return false;
        }
        
        console.log(`✅ ${player} returned to game`);
        
        this.players.removed.delete(player);
        this.players.bench.push(player);
        
        // Validate
        this.validatePlayerState();
        
        // Notify optimizer WITH PLAY TIMES
        if (this.enforcer) {
            const playTimesSnapshot = { ...this.players.minutes };
            this.enforcer.syncWithActualState(
                this.state.currentTime, 
                [...this.players.court], 
                [...this.players.bench],
                playTimesSnapshot
            );
            const newPlan = this.enforcer.handleDeviation(
                'player_returned',
                { 
                    player: player, 
                    actualCourt: [...this.players.court], 
                    actualBench: [...this.players.bench],
                    playTimes: playTimesSnapshot
                },
                this.state.currentTime
            );
            if (newPlan) {
                this.applyRecoveryPlan(newPlan);
            }
        }
        
        return true;
    }
    
    // [Keep all other methods the same - start, stop, tick, etc.]
    
    /**
     * Start or resume game timer
     */
    start() {
        if (!this.state.initialized) {
            this.handleError('Cannot start: game not initialized');
            return false;
        }
        
        if (this.state.gameOver) {
            this.handleError('Cannot start: game is over');
            return false;
        }
        
        if (this.state.running) {
            return true;
        }
        
        // Validate before starting
        this.validatePlayerState();
        
        console.log('▶️ Starting game timer');
        
        if (this.state.currentTime === 0 && this.audio.enabled && this.audio.whistle) {
            this.playSound('whistle');
        }
        
        this.state.running = true;
        this.state.paused = false;
        this.lastTickTime = Date.now();
        
        this.timerInterval = setInterval(() => this.tick(), 1000);
        
        if (this.callbacks.onUpdate) {
            this.callbacks.onUpdate(this.getState());
        }
        
        return true;
    }
    
    /**
     * Stop game timer
     */
    stop() {
        if (!this.state.running) {
            return true;
        }
        
        console.log('⏸️ Stopping game timer');
        
        this.state.running = false;
        this.state.paused = true;
        
        // Clear visibility tracking flags when manually stopped
        this.wasRunningWhenHidden = false;
        this.lastVisibleTimestamp = null;

        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        if (this.callbacks.onUpdate) {
            this.callbacks.onUpdate(this.getState());
        }
        
        return true;
    }
    
    /**
     * Timer tick - called every second by interval
     * Includes error handling to prevent timer death
     */
    tick() {
        if (!this.state.running) return;

        try {
            const now = Date.now();
            const elapsed = Math.round((now - this.lastTickTime) / 1000);
            this.lastTickTime = now;

            // Limit catch-up to prevent runaway updates
            const maxCatchup = GAME_CONFIG.MAX_TICK_CATCHUP || 10;
            for (let i = 0; i < Math.min(elapsed, maxCatchup); i++) {
                this.advanceOneSecond();
            }

            // Validate periodically (throttled)
            const validationInterval = GAME_CONFIG.VALIDATION_INTERVAL || 30;
            if (this.state.currentTime % validationInterval === 0) {
                this.validatePlayerState();
            }

            if (this.callbacks.onUpdate) {
                this.callbacks.onUpdate(this.getState());
            }
        } catch (error) {
            console.error('❌ Tick error:', error);
            // Don't stop the game for non-critical errors
            if (this.callbacks.onError) {
                this.callbacks.onError(`Tick error: ${error.message}`);
            }
        }
    }

    /**
     * Advance game time by one second
     */
    advanceOneSecond() {
        // Update player times
        this.players.court.forEach(player => {
            this.players.minutes[player] = (this.players.minutes[player] || 0) + 1;
        });

        this.players.bench.forEach(player => {
            this.players.benchMinutes[player] = (this.players.benchMinutes[player] || 0) + 1;
        });

        // Update game state
        this.state.currentTime++;
        this.state.periodElapsed++;

        // Check for rotation warning (1 minute before)
        if (!this.earlyWarningShown &&
            this.rotations.nextScheduled &&
            (this.rotations.nextScheduled.time - this.state.currentTime) === 60) {
            this.earlyWarningShown = true;
            if (this.callbacks.onEarlyWarning) {
                this.callbacks.onEarlyWarning();
            }
        }

        // Check for rotation warning (10 seconds before)
        if (!this.warningPlayed &&
            this.rotations.nextScheduled &&
            (this.rotations.nextScheduled.time - this.state.currentTime) === this.config.warningBeepTime) {
            this.warningPlayed = true;
            if (this.callbacks.onWarning) {
                this.callbacks.onWarning();
            }
        }

        // Check for scheduled rotation
        if (!this.rotations.pending &&
            this.rotations.nextScheduled &&
            this.state.currentTime >= this.rotations.nextScheduled.time) {

            // Validate the rotation before initiating
            const scheduledOff = this.rotations.nextScheduled.off;
            const scheduledOn = this.rotations.nextScheduled.on;

            // Check if all players to sub off are actually on court
            const invalidOff = scheduledOff.filter(p => !this.players.court.includes(p));

            if (invalidOff.length > 0) {
                console.warn(`⚠️ Skipping invalid rotation at ${this.formatTime(this.state.currentTime)}`);
                console.warn(`   Players not on court: ${invalidOff.join(', ')}`);
                console.warn(`   Current court: ${this.players.court.join(', ')}`);

                // Skip this rotation and move to next
                this.rotations.currentPlanIndex++;
                this.updateNextRotation();

                // Trigger a replan to fix the rotation schedule
                if (this.enforcer) {
                    console.log('🔄 Triggering replan due to invalid rotation');
                    const playTimesSnapshot = { ...this.players.minutes };
                    this.enforcer.syncWithActualState(
                        this.state.currentTime,
                        [...this.players.court],
                        [...this.players.bench],
                        playTimesSnapshot
                    );
                    const newPlan = this.enforcer.handleDeviation(
                        'invalid_rotation',
                        {
                            actualCourt: [...this.players.court],
                            actualBench: [...this.players.bench],
                            playTimes: playTimesSnapshot
                        },
                        this.state.currentTime
                    );
                    if (newPlan) {
                        this.applyRecoveryPlan(newPlan);
                    }
                }
            } else {
                // Rotation is valid, proceed
                this.initiateRotation(scheduledOff, scheduledOn);
            }
        }

        // Check for period end
        if (this.config.periodLength > 0 &&
            this.state.periodElapsed >= this.config.periodLength) {
            this.handlePeriodEnd();
        }
    }

    /**
     * Apply missed time when page was hidden
     * @param {number} secondsMissed - Seconds elapsed while page was hidden
     */
    /**
     * Apply missed time when page was hidden
     * @param {number} secondsMissed - Seconds elapsed while page was hidden
     */
    applyMissedTime(secondsMissed) {
        if (secondsMissed <= 0) return;

        console.log(`⏱️ Applying ${secondsMissed} seconds of missed time`);

        // Check if game was already over before applying
        const totalGameDuration = this.config.periodLength * this.config.numPeriods;
        const gameWasOver = totalGameDuration > 0 && this.state.currentTime >= totalGameDuration;

        if (gameWasOver) {
            console.log('Game was already over, not applying missed time');
            return;
        }

        // Apply missed time to ALL player times (on court and on bench)
        this.players.court.forEach(playerName => {
            this.players.minutes[playerName] = (this.players.minutes[playerName] || 0) + secondsMissed;
        });

        this.players.bench.forEach(playerName => {
            this.players.benchMinutes[playerName] = (this.players.benchMinutes[playerName] || 0) + secondsMissed;
        });

        // Update game clock
        this.state.currentTime += secondsMissed;
        this.state.periodElapsed += secondsMissed;

        console.log(`After missed time: currentTime=${this.state.currentTime}s, periodElapsed=${this.state.periodElapsed}s`);

        // Check if missed time caused period to advance
        while (this.config.periodLength > 0 &&
               this.state.periodElapsed >= this.config.periodLength &&
               this.state.currentPeriod <= this.config.numPeriods) {

            const timeOverPeriod = this.state.periodElapsed - this.config.periodLength;

            console.log(`Missed time caused period ${this.state.currentPeriod} to end. Overflow: ${timeOverPeriod}s`);

            // Check if this was the final period
            const isFinalPeriod = this.state.currentPeriod >= this.config.numPeriods;

            if (isFinalPeriod) {
                console.log('Missed time caused game to end');
                this.state.currentTime = totalGameDuration;
                this.state.periodElapsed = this.config.periodLength;
                this.state.gameOver = true;
                this.stop();

                if (this.callbacks.onUpdate) {
                    this.callbacks.onUpdate(this.getState());
                }
                return;
            } else {
                // Advance to next period
                this.state.currentPeriod++;
                this.state.periodElapsed = timeOverPeriod;
                console.log(`Advanced to period ${this.state.currentPeriod} with ${timeOverPeriod}s elapsed`);
            }
        }

        // Check if game is now over after applying missed time
        const isGameOverNow = totalGameDuration > 0 && this.state.currentTime >= totalGameDuration;
        if (isGameOverNow) {
            console.log('Game ended after applying missed time');
            this.state.gameOver = true;
            this.stop();
        }

        // Trigger update callback
        if (this.callbacks.onUpdate) {
            this.callbacks.onUpdate(this.getState());
        }
    }

    /**
     * Handle page visibility changes for catch-up logic
     */
    handleVisibilityChange() {
        const totalGameDuration = this.config.periodLength * this.config.numPeriods;
        const isGameOver = totalGameDuration > 0 && this.state.currentTime >= totalGameDuration;

        if (document.hidden) {
            // Page became hidden
            if (this.state.running) {
                console.log('📴 Page hidden, timer was running. Storing timestamp and stopping interval.');
                this.lastVisibleTimestamp = Date.now();
                this.wasRunningWhenHidden = true;
                // Just clear the interval, don't change running state
                if (this.timerInterval) {
                    clearInterval(this.timerInterval);
                    this.timerInterval = null;
                }
                // Note: We keep this.state.running = true so we know to resume
            } else {
                console.log('📴 Page hidden, timer was not running.');
                this.wasRunningWhenHidden = false;
            }
        } else {
            // Page became visible
            console.log('📱 Page became visible.');

            if (this.wasRunningWhenHidden && this.lastVisibleTimestamp && !isGameOver) {
                const elapsedWhileHidden = Math.round((Date.now() - this.lastVisibleTimestamp) / 1000);

                // Defensive check: Prevent excessive catch-up from stale timestamps
                if (elapsedWhileHidden > 3600) {
                    console.warn(`⚠️ Elapsed time (${elapsedWhileHidden}s) seems excessive. Skipping catch-up.`);
                    this.lastVisibleTimestamp = null;
                    this.wasRunningWhenHidden = false;

                    if (this.callbacks.onUpdate) {
                        this.callbacks.onUpdate(this.getState());
                    }
                    return;
                }

                console.log(`⏱️ Was running. Elapsed while hidden: ${elapsedWhileHidden}s`);

                if (elapsedWhileHidden > 0) {
                    this.applyMissedTime(elapsedWhileHidden);
                }

                this.lastVisibleTimestamp = null;

                // Check if game is over after applying missed time
                const newIsGameOver = totalGameDuration > 0 && this.state.currentTime >= totalGameDuration;

                if (!newIsGameOver) {
                    // Resume the timer by restarting the interval
                    console.log('▶️ Resuming timer after visibility restore');
                    this.lastTickTime = Date.now();
                    this.timerInterval = setInterval(() => this.tick(), 1000);

                    if (this.callbacks.onUpdate) {
                        this.callbacks.onUpdate(this.getState());
                    }
                } else {
                    // Game ended while away, update state
                    this.state.running = false;
                    this.wasRunningWhenHidden = false;
                    if (this.callbacks.onUpdate) {
                        this.callbacks.onUpdate(this.getState());
                    }
                }
            } else {
                // Not eligible for catch-up
                if (isGameOver) console.log('Page visible, but game is over.');
                if (!this.wasRunningWhenHidden) console.log('Page visible, but timer was not running when hidden.');

                this.lastVisibleTimestamp = null;
                this.wasRunningWhenHidden = false;

                if (this.callbacks.onUpdate) {
                    this.callbacks.onUpdate(this.getState());
                }
            }
        }
    }

    /**
     * Initiate a rotation
     */
    initiateRotation(playersOff, playersOn) {
        if (!playersOff || !playersOn || playersOff.length !== playersOn.length) {
            console.warn('Invalid rotation parameters');
            return false;
        }

        // Verify players are in correct locations with detailed error messages
        const invalidOff = playersOff.filter(p => !this.players.court.includes(p));
        const invalidOn = playersOn.filter(p => !this.players.bench.includes(p));

        if (invalidOff.length > 0) {
            console.error(`❌ Cannot initiate rotation - these players are NOT on court: ${invalidOff.join(', ')}`);
            console.log(`Current court: ${this.players.court.join(', ')}`);
            console.log(`Attempted to sub off: ${playersOff.join(', ')}`);
            // Skip this rotation instead of erroring
            this.rotations.currentPlanIndex++;
            this.updateNextRotation();
            return false;
        }

        if (invalidOn.length > 0) {
            console.error(`❌ Cannot initiate rotation - these players are NOT on bench: ${invalidOn.join(', ')}`);
            console.log(`Current bench: ${this.players.bench.join(', ')}`);
            console.log(`Attempted to sub on: ${playersOn.join(', ')}`);
            // Skip this rotation instead of erroring
            this.rotations.currentPlanIndex++;
            this.updateNextRotation();
            return false;
        }

        console.log(`🔄 Rotation initiated: OFF: ${playersOff.join(', ')}, ON: ${playersOn.join(', ')}`);

        this.rotations.pending = true;
        this.rotations.pendingOff = playersOff;
        this.rotations.pendingOn = playersOn;
        this.rotations.pendingTime = this.state.currentTime;

        // Reset warning flags for next rotation
        this.warningPlayed = false;
        this.earlyWarningShown = false;

        if (this.callbacks.onRotation) {
            this.callbacks.onRotation({
                off: playersOff,
                on: playersOn,
                time: this.state.currentTime
            });
        }

        // Auto-confirm if configured
        if (this.config.autoConfirmRotations) {
            this.confirmRotation();
        }

        return true;
    }

    /**
     * Cancel pending rotation
     */
    cancelRotation() {
        if (!this.rotations.pending) {
            return false;
        }
        
        console.log('❌ Rotation cancelled');
        
        if (this.enforcer) {
            const playTimesSnapshot = { ...this.players.minutes };
            this.enforcer.syncWithActualState(
                this.state.currentTime,
                [...this.players.court],
                [...this.players.bench],
                playTimesSnapshot
            );
            const newPlan = this.enforcer.handleDeviation(
                'late_substitution',
                { 
                    actualCourt: [...this.players.court], 
                    actualBench: [...this.players.bench],
                    playTimes: playTimesSnapshot
                },
                this.state.currentTime
            );
            if (newPlan) {
                this.applyRecoveryPlan(newPlan);
            }
        }
        
        this.rotations.pending = false;
        this.rotations.pendingOff = [];
        this.rotations.pendingOn = [];
        this.rotations.pendingTime = null;
        
        this.rotations.currentPlanIndex++;
        this.updateNextRotation();
        
        return true;
    }
    
    /**
     * Apply recovery plan
     */
    applyRecoveryPlan(recovery) {
        let newPlanRotations = [];
        let strategy = recovery.strategy || 'replan';
        let projectedVariance = recovery.projectedFinalVariance || recovery.expectedVariance || 0;

        if (Array.isArray(recovery.plan)) {
            newPlanRotations = recovery.plan;
        } else if (Array.isArray(recovery.rotations)) {
            newPlanRotations = recovery.rotations.map(r => ({
                time: r.time,
                off: r.off,
                on: r.on
            }));
        } else {
            console.warn('Recovery plan format not recognized');
            return;
        }

        // Validate the first rotation in the new plan
        if (newPlanRotations.length > 0) {
            const firstRotation = newPlanRotations[0];
            const invalidOff = firstRotation.off.filter(p => !this.players.court.includes(p));
            const invalidOn = firstRotation.on.filter(p => !this.players.bench.includes(p));

            if (invalidOff.length > 0 || invalidOn.length > 0) {
                console.error('⚠️ Recovery plan has invalid first rotation!');
                if (invalidOff.length > 0) {
                    console.error(`   Players not on court: ${invalidOff.join(', ')}`);
                }
                if (invalidOn.length > 0) {
                    console.error(`   Players not on bench: ${invalidOn.join(', ')}`);
                }
                console.log(`   Current court: ${this.players.court.join(', ')}`);
                console.log(`   Current bench: ${this.players.bench.join(', ')}`);
                // Don't apply a plan with invalid rotations
                return;
            }
        }

        console.log(`🔄 Applying recovery plan (${strategy}) with ${newPlanRotations.length} rotations`);
        this.rotations.plan = newPlanRotations;
        this.rotations.currentPlanIndex = 0;
        this.updateNextRotation();
        
        if (this.callbacks.onRecovery) {
            this.callbacks.onRecovery({
                strategy,
                rotations: newPlanRotations.length,
                projectedVariance
            });
        }
    }
    
    /**
     * Update next scheduled rotation
     */
    updateNextRotation() {
        if (!this.rotations.plan || this.rotations.currentPlanIndex >= this.rotations.plan.length) {
            this.rotations.nextScheduled = null;
            return;
        }
        
        this.rotations.nextScheduled = this.rotations.plan[this.rotations.currentPlanIndex];
    }
    
    /**
     * Handle period end
     */
    handlePeriodEnd() {
        console.log(`Period ${this.state.currentPeriod} ended`);
        
        this.stop();
        
        if (this.state.currentPeriod >= this.config.numPeriods) {
            this.handleGameEnd();
        }
        else {
            this.state.currentPeriod++;
            this.state.periodElapsed = 0;
            
            if (this.state.currentPeriod === 2 && this.config.numPeriods === 2) {
                this.state.isHalftime = true;
            }
            
            if (this.callbacks.onPeriodEnd) {
                this.callbacks.onPeriodEnd({
                    period: this.state.currentPeriod - 1,
                    isHalftime: this.state.isHalftime
                });
            }
        }
    }
    
    /**
     * Handle game end
     */
    handleGameEnd() {
        console.log('🏁 Game ended');
        
        this.state.gameOver = true;
        this.state.running = false;
        
        const stats = this.calculateFinalStats();
        
        console.log('📊 Final Statistics:');
        console.log(`   Variance: ${stats.variance}s`);
        console.log(`   Rotations: ${stats.rotations}`);
        console.log(`   Average minutes: ${Math.floor(stats.averageMinutes / 60)}`);
        
        if (this.callbacks.onGameEnd) {
            this.callbacks.onGameEnd(stats);
        }
    }
    
    /**
     * Calculate final statistics
     */
    calculateFinalStats() {
        const stats = {
            players: {},
            variance: 0,
            rotations: this.rotations.history.length,
            averageMinutes: 0,
            maxMinutes: 0,
            minMinutes: 0
        };
        
        const activePlayers = this.players.all.filter(p => !this.players.removed.has(p));
        let totalMinutes = 0;
        const playTimes = [];

        activePlayers.forEach(player => {
            const minutes = this.players.minutes[player] || 0;
            const benchMinutes = this.players.benchMinutes[player] || 0;

            stats.players[player] = {
                minutes: minutes,
                benchMinutes: benchMinutes,
                percentage: ((minutes / this.state.currentTime) * 100).toFixed(1)
            };

            totalMinutes += minutes;
            playTimes.push(minutes);

            if (minutes > stats.maxMinutes) stats.maxMinutes = minutes;
            if (stats.minMinutes === 0 || minutes < stats.minMinutes) stats.minMinutes = minutes;
        });

        // BUGFIX: Calculate variance using standard deviation instead of max-min range
        if (playTimes.length > 0) {
            const mean = totalMinutes / playTimes.length;
            const squaredDiffs = playTimes.map(time => Math.pow(time - mean, 2));
            const varianceValue = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / playTimes.length;
            stats.variance = Math.round(Math.sqrt(varianceValue)); // Standard deviation
        } else {
            stats.variance = 0;
        }

        stats.averageMinutes = activePlayers.length > 0 ? totalMinutes / activePlayers.length : 0;
        
        if (this.enforcer) {
            stats.enforcerAnalytics = this.enforcer.getAnalytics(this.state.currentTime);
        }
        
        return stats;
    }
    
    /**
     * Update player score
     */
    updatePlayerScore(player, points) {
        if (!this.scoring.playerPoints.hasOwnProperty(player)) {
            this.scoring.playerPoints[player] = 0;
        }
        
        this.scoring.playerPoints[player] += points;
        this.scoring.home += points;
        
        // Prevent negative scores for individual players
        if (this.scoring.playerPoints[player] < 0) {
            this.scoring.home -= this.scoring.playerPoints[player];
            this.scoring.playerPoints[player] = 0;
        }
        
        if (this.scoring.home < 0) {
            this.scoring.home = 0;
        }
        
        console.log(`${player} scored ${points > 0 ? '+' : ''}${points} (Total: ${this.scoring.playerPoints[player]})`);
        
        const scoringStats = this.getScoringStats();
        if (this.callbacks.onScoreUpdate) {
            this.callbacks.onScoreUpdate(scoringStats);
        }
        
        return this.scoring.playerPoints[player];
    }
    
    /**
     * Update opposition score
     */
    updateOppositionScore(points) {
        this.scoring.away += points;
        if (this.scoring.away < 0) {
            this.scoring.away = 0;
        }
        
        console.log(`Opposition scored ${points > 0 ? '+' : ''}${points} (Total: ${this.scoring.away})`);
        
        const scoringStats = this.getScoringStats();
        if (this.callbacks.onScoreUpdate) {
            this.callbacks.onScoreUpdate(scoringStats);
        }
        
        return this.scoring.away;
    }
    
    /**
     * Update team names
     */
    updateTeamName(team, name) {
        if (team === 'home') {
            this.scoring.homeTeamName = name || 'Home';
        } else if (team === 'away') {
            this.scoring.awayTeamName = name || 'Opposition';
        }
        
        if (this.callbacks.onScoreUpdate) {
            this.callbacks.onScoreUpdate(this.getScoringStats());
        }
    }
    
    /**
     * Get scoring stats snapshot
     */
    getScoringStats() {
        const topScorers = Object.entries(this.scoring.playerPoints)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        return {
            homeScore: this.scoring.home,
            awayScore: this.scoring.away,
            homeTeamName: this.scoring.homeTeamName,
            awayTeamName: this.scoring.awayTeamName,
            playerPoints: { ...this.scoring.playerPoints },
            topScorers,
            totalPoints: this.scoring.home + this.scoring.away
        };
    }
    
    /**
     * Get current game state
     * @returns {Object} Current game state snapshot
     */
    getState() {
        const analytics = this.enforcer ? this.enforcer.getAnalytics(this.state.currentTime) : null;

        // Throttled validation - don't validate on every getState call
        // Validation happens in tick() every VALIDATION_INTERVAL seconds
        // Only validate here if explicitly marked dirty or never validated
        if (this._stateNeedsValidation) {
            this.validatePlayerState();
            this._stateNeedsValidation = false;
        }
        
        return {
            ...this.state,
            players: {
                court: [...this.players.court],
                bench: [...this.players.bench],
                removed: Array.from(this.players.removed),
                minutes: { ...this.players.minutes },
                benchMinutes: { ...this.players.benchMinutes },
                positions: { ...this.players.positions }
            },
            rotations: {
                pending: this.rotations.pending,
                pendingOff: [...this.rotations.pendingOff],
                pendingOn: [...this.rotations.pendingOn],
                next: this.rotations.nextScheduled,
                history: this.rotations.history.length,
                remaining: this.rotations.plan.length - this.rotations.currentPlanIndex
            },
            tempo: 'balanced',
            tempoLocked: false,
            variance: analytics ? analytics.currentVariance : 0,
            targetMinutes: this.planTargetMinutes,
            recoveryActive: false,
            scoring: this.getScoringStats()
        };
    }
    
    /**
     * Format time for display
     */
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    /**
     * Preload audio files
     */
    preloadAudio() {
        try {
            // BUGFIX: Load warning sound from actual file (coughing sound)
            this.audio.warningBeep = new Audio('beep-warning.wav');
            this.audio.whistle = new Audio('startingwhistle.wav');

            this.audio.warningBeep.load();
            this.audio.whistle.load();

            console.log('🔊 Audio files preloaded');
        } catch (e) {
            console.warn('Audio preload failed:', e);
        }
    }
    
    /**
     * Play sound effect
     */
    playSound(soundType) {
        if (!this.audio.enabled || !this.audio[soundType]) return;
        
        try {
            const sound = this.audio[soundType].cloneNode();
            sound.volume = 0.5;
            sound.play().catch(e => console.warn(`Failed to play ${soundType}:`, e));
        } catch (e) {
            console.warn(`Error playing ${soundType}:`, e);
        }
    }
    
    /**
     * Handle errors
     */
    handleError(message) {
        console.error(`❌ [GameEngine] ${message}`);
        
        if (this.callbacks.onError) {
            this.callbacks.onError(message);
        }
    }
    
    /**
     * Reset game
     */
    reset() {
        console.log('🔄 Resetting game');
        
        this.stop();
        
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // Reset visibility tracking variables
        this.lastVisibleTimestamp = null;
        this.wasRunningWhenHidden = false;

        this.state = {
            initialized: false,
            running: false,
            paused: false,
            currentTime: 0,
            currentPeriod: 1,
            periodElapsed: 0,
            isHalftime: false,
            gameOver: false
        };
        
        this.players = {
            all: [],
            court: [],
            bench: [],
            removed: new Set(),
            minutes: {},
            benchMinutes: {},
            currentStints: {},
            positions: {},
            lastRotationTime: {}
        };
        
        this.rotations = {
            pending: false,
            pendingOff: [],
            pendingOn: [],
            pendingTime: null,
            history: [],
            nextScheduled: null,
            plan: [],
            currentPlanIndex: 0,
            lastConfirmedIndex: -1
        };
        
        this.scoring = {
            home: 0,
            away: 0,
            homeTeamName: 'Home',
            awayTeamName: 'Opposition',
            playerPoints: {}
        };

        this.enforcer = null;
        
        console.log('Reset complete');
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BasketballGameEngine;
}

if (typeof window !== 'undefined') {
    window.BasketballGameEngine = BasketballGameEngine;
    console.log('🏀 Basketball Game Engine v3.1 loaded - Configurable court size, optimized validation');
}
