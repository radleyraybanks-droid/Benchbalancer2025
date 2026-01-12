/**
 * AFL Game Engine - Auskick/Junior Australian Rules Football
 * Adapted from Basketball Game Engine for AFL-specific gameplay
 * Version 1.0 - Production Ready
 *
 * @fileoverview Main game engine for AFL game management.
 * Handles timing, line rotations, goals/behinds scoring, and player management.
 * Supports 9-15 players on field based on age group.
 */

import { AFLIntervalOptimizer, OPTIMIZER_DEFAULTS } from './afl-interval-optimizer.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * @typedef {Object} GameConfig
 * @property {string} format - Game format ('quarters')
 * @property {number} periodLength - Length of each period in seconds
 * @property {number} numPeriods - Number of periods (4 quarters)
 * @property {number} fieldSpots - Number of players on field (9-15)
 * @property {number} defaultBench - Default bench size
 * @property {string} ageGroup - Age group (U9, U10, U11, U12)
 * @property {boolean} autoConfirmRotations - Auto-confirm rotations
 * @property {number} warningBeepTime - Warning time before rotation
 */

/**
 * @typedef {Object} GameState
 * @property {boolean} initialized - Whether game is initialized
 * @property {boolean} running - Whether timer is running
 * @property {boolean} paused - Whether game is paused
 * @property {number} currentTime - Current game time in seconds
 * @property {number} currentPeriod - Current period number (1-4)
 * @property {number} periodElapsed - Time elapsed in current period
 * @property {boolean} isQuarterTime - Whether at quarter time break
 * @property {boolean} isHalftime - Whether at halftime break
 * @property {boolean} gameOver - Whether game has ended
 */

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const ENGINE_DEFAULTS = {
    FIELD_SPOTS: 12,           // Default for U11-U12 (configurable 9-15)
    DEFAULT_BENCH: 6,          // Rolling interchange bench
    DEFAULT_PERIOD_LENGTH: 720, // 12 minutes per quarter
    DEFAULT_NUM_PERIODS: 4,    // 4 quarters
    WARNING_BEEP_TIME: 10,
    EARLY_WARNING_TIME: 60,
    VALIDATION_INTERVAL: 30,
    MAX_CATCHUP_SECONDS: 3600,
    MAX_TICK_CATCHUP: 10,

    // AFL-specific
    LINES: ['Ruck', 'Midfield', 'Forward', 'Back'],
    SCORING: {
        GOAL: 6,
        BEHIND: 1
    },

    // Age group configurations
    AGE_GROUPS: {
        'U9': { fieldSpots: 9, periodLength: 600 },   // 9v9, 10 min quarters
        'U10': { fieldSpots: 11, periodLength: 660 }, // 11v11, 11 min quarters
        'U11': { fieldSpots: 13, periodLength: 720 }, // 13v13, 12 min quarters
        'U12': { fieldSpots: 15, periodLength: 780 }  // 15v15, 13 min quarters
    }
};

// Merge with global config if available (Legacy Support)
const GLOBAL_GAME_CONFIG = (typeof window !== 'undefined' && window.GameConfig?.AFL_DEFAULTS)
    ? { ...ENGINE_DEFAULTS, ...window.GameConfig.AFL_DEFAULTS }
    : ENGINE_DEFAULTS;

// ============================================================================
// MAIN CLASS
// ============================================================================

export class AFLGameEngine {
    constructor(config = null) {
        // Use provided config or fall back to global/defaults
        const baseConfig = config || GLOBAL_GAME_CONFIG;

        // Game configuration - use centralized defaults
        this.config = {
            format: 'quarters',
            periodLength: baseConfig.DEFAULT_PERIOD_LENGTH || ENGINE_DEFAULTS.DEFAULT_PERIOD_LENGTH,
            numPeriods: baseConfig.DEFAULT_NUM_PERIODS || ENGINE_DEFAULTS.DEFAULT_NUM_PERIODS,
            fieldSpots: baseConfig.FIELD_SPOTS || ENGINE_DEFAULTS.FIELD_SPOTS,
            defaultBench: baseConfig.DEFAULT_BENCH || ENGINE_DEFAULTS.DEFAULT_BENCH,
            ageGroup: 'U11', // Default age group
            defaultRotationsPerChange: 2,
            autoConfirmRotations: false,
            warningBeepTime: baseConfig.WARNING_BEEP_TIME || ENGINE_DEFAULTS.WARNING_BEEP_TIME
        };

        // Game state
        this.state = {
            initialized: false,
            running: false,
            paused: false,
            currentTime: 0,
            currentPeriod: 1,
            periodElapsed: 0,
            isQuarterTime: false,
            isHalftime: false,
            gameOver: false
        };

        // Player management - critical tracking
        this.players = {
            all: [],
            field: [],     // MUST always have exactly fieldSpots players
            bench: [],     // Everyone else (interchange bench)
            removed: new Set(),
            minutes: {},
            benchMinutes: {},
            currentStints: {},
            lines: {},           // Current line: { playerName: 'Midfield' }
            lineHistory: {},     // Lines played: { playerName: ['Midfield', 'Forward'] }
            lastRotationTime: {},
            jerseyNumbers: {}
        };

        // AFL Scoring management - Goals and Behinds
        this.scoring = {
            home: { goals: 0, behinds: 0 },
            away: { goals: 0, behinds: 0 },
            homeTeamName: 'Home',
            awayTeamName: 'Opposition',
            playerStats: {}  // { playerName: { goals: 0, behinds: 0, disposals: 0, marks: 0, tackles: 0 } }
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
            onEarlyWarning: null,
            onRecovery: null,
            onScoreUpdate: null
        };

        // Timer
        this.timerInterval = null;
        this.lastTickTime = null;
        this.warningPlayed = false;
        this.earlyWarningShown = false;

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

        console.log('🏈 AFL Game Engine v1.0 initialized');
    }

    /**
     * Mark state as needing validation
     */
    markStateDirty() {
        this._stateNeedsValidation = true;
    }

    /**
     * Validate field/bench state - CRITICAL METHOD
     * Ensures field has exactly fieldSpots players and no duplicates
     * @returns {boolean} Whether state is valid
     */
    validatePlayerState() {
        const errors = [];
        const expectedFieldSize = this.config.fieldSpots;

        // Check field has exactly fieldSpots players
        if (this.players.field.length !== expectedFieldSize) {
            errors.push(`Field has ${this.players.field.length} players, should be ${expectedFieldSize}`);
        }

        // Check no duplicates
        const allActive = [...this.players.field, ...this.players.bench];
        const uniqueActive = new Set(allActive);
        if (uniqueActive.size !== allActive.length) {
            errors.push('Duplicate players found in field/bench');
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
     * Ensures field has exactly fieldSpots players
     */
    fixPlayerState() {
        console.warn('🔧 Fixing player state...');

        const expectedFieldSize = this.config.fieldSpots;

        // Get all active players
        const activePlayers = this.players.all.filter(p => !this.players.removed.has(p));

        // Current field players (deduplicated)
        const currentField = [...new Set(this.players.field)];

        // If too many on field, move extras to bench
        if (currentField.length > expectedFieldSize) {
            const toRemove = currentField.length - expectedFieldSize;
            const removed = currentField.splice(expectedFieldSize, toRemove);
            this.players.field = currentField.slice(0, expectedFieldSize);
            this.players.bench = [...new Set([...this.players.bench, ...removed])];
        }

        // If too few on field, pull from bench
        else if (currentField.length < expectedFieldSize) {
            const needed = expectedFieldSize - currentField.length;
            const benchAvailable = this.players.bench.slice(0, needed);
            this.players.field = [...currentField, ...benchAvailable];
            this.players.bench = this.players.bench.slice(needed);
        } else {
            this.players.field = currentField;
        }

        // Ensure bench has everyone else
        const onFieldSet = new Set(this.players.field);
        this.players.bench = activePlayers.filter(p => !onFieldSet.has(p));

        console.log(`✅ Fixed: ${this.players.field.length} on field, ${this.players.bench.length} on bench`);
    }

    /**
     * Initialize game with setup parameters
     */
    initialize(setupData) {
        console.log('Initializing AFL game with setup:', setupData);

        // Parse setup data
        this.config.format = 'quarters';  // AFL always uses quarters
        this.config.ageGroup = setupData.ageGroup || 'U11';

        // Apply age group configuration if available
        const ageGroupConfig = ENGINE_DEFAULTS.AGE_GROUPS[this.config.ageGroup];
        if (ageGroupConfig) {
            this.config.fieldSpots = setupData.fieldSpots || ageGroupConfig.fieldSpots;
            this.config.periodLength = (setupData.minutesPerPeriod || (ageGroupConfig.periodLength / 60)) * 60;
        } else {
            this.config.fieldSpots = setupData.fieldSpots || ENGINE_DEFAULTS.FIELD_SPOTS;
            this.config.periodLength = (setupData.minutesPerPeriod || 12) * 60;
        }

        this.config.numPeriods = 4; // AFL always 4 quarters
        this.config.autoConfirmRotations = setupData.autoConfirmRotations || false;
        this.config.warningBeepTime = setupData.warningBeepTime || 10;

        const numReserves = setupData.numReserves || 6;
        const totalPlayers = this.config.fieldSpots + numReserves;

        // Set up players
        this.players.all = this.createPlayerRoster(setupData.starterNames, setupData.reserveNames);
        this.players.field = this.players.all.slice(0, this.config.fieldSpots);
        this.players.bench = this.players.all.slice(this.config.fieldSpots);

        // Validate initial state
        this.validatePlayerState();

        // Extract jersey numbers from playerData if available
        if (setupData.playerData) {
            Object.entries(setupData.playerData).forEach(([playerName, data]) => {
                if (data.jerseyNumber) {
                    this.players.jerseyNumbers[playerName] = data.jerseyNumber;
                }
                // Initialize line assignment
                if (data.line) {
                    this.players.lines[playerName] = data.line;
                    this.players.lineHistory[playerName] = [data.line];
                }
            });
        }

        // Initialize player tracking
        this.players.all.forEach(player => {
            this.players.minutes[player] = 0;
            this.players.benchMinutes[player] = 0;
            this.players.currentStints[player] = {
                start: 0,
                onField: this.players.field.includes(player)
            };
            this.players.lastRotationTime[player] = 0;

            // Initialize lines if not set
            if (!this.players.lines[player]) {
                this.players.lines[player] = 'Midfield';  // Default line
                this.players.lineHistory[player] = ['Midfield'];
            }
        });

        // Initialize AFL scoring - Goals and Behinds
        this.scoring.home = { goals: 0, behinds: 0 };
        this.scoring.away = { goals: 0, behinds: 0 };
        this.scoring.homeTeamName = 'Home';
        this.scoring.awayTeamName = 'Opposition';
        this.scoring.playerStats = {};
        this.players.all.forEach(player => {
            this.scoring.playerStats[player] = {
                goals: 0,
                behinds: 0,
                disposals: 0,
                kicks: 0,
                handballs: 0,
                marks: 0,
                tackles: 0,
                hitouts: 0,
                clearances: 0,
                inside50s: 0,
                turnovers: 0
            };
        });

        // Assign initial lines
        this.assignLines(this.players.field);

        // Set up optimizer
        const totalGameLength = this.config.periodLength * this.config.numPeriods;
        this.totalGameLength = totalGameLength;

        const subsPerRotation = setupData.subsPerChange || setupData.rotationsPerChange || 2;
        const idealShifts = setupData.idealShiftsPerPlayer || 4;
        const OptimizerCtor = AFLIntervalOptimizer;

        this.enforcer = new OptimizerCtor({
            gameLength: totalGameLength,
            periodLength: this.config.periodLength,
            totalPlayers: totalPlayers,
            fieldSpots: this.config.fieldSpots,
            idealShiftsPerPlayer: idealShifts,
            subsPerRotation: Math.max(1, Math.min(3, subsPerRotation)),
            minRotationGapSec: 90  // AFL has more frequent rotations
        });

        this.enforcer.tempo = 'balanced';

        // Initialize enforcer
        this.enforcer.initialize(this.players.all, {
            onField: [...this.players.field],
            onBench: [...this.players.bench],
            playerMinutes: { ...this.players.minutes },
            elapsedTime: 0
        });

        // Generate plan
        const gen = this.enforcer.generatePlan(0, []);
        const plan = {
            plan: gen ? gen.rotations.map(r => ({ time: r.time, off: r.off, on: r.on })) : [],
            targetMinutes: Math.floor((totalGameLength * this.config.fieldSpots) / totalPlayers),
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

        console.log('✅ AFL Game initialized successfully');
        console.log(`   Age Group: ${this.config.ageGroup}`);
        console.log(`   Roster: ${totalPlayers} players (${this.players.field.length} on field, ${this.players.bench.length} on bench)`);
        console.log(`   Format: ${this.config.numPeriods} quarters × ${this.config.periodLength / 60} minutes`);
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
        const fieldSpots = this.config.fieldSpots;

        // Add starters (ensure we have fieldSpots)
        for (let i = 0; i < fieldSpots; i++) {
            roster.push(starterNames[i] || `Player ${i + 1}`);
        }

        // Add reserves
        reserveNames.forEach((name, index) => {
            roster.push(name || `Reserve ${index + 1}`);
        });

        return roster;
    }

    /**
     * Assign lines to players on field
     * AFL uses fluid line-based positions: Ruck, Midfield, Forward, Back
     */
    assignLines(fieldPlayers) {
        const lines = ENGINE_DEFAULTS.LINES;
        const fieldSpots = this.config.fieldSpots;

        // Distribute players across lines
        // Approximate distribution based on field size
        const distribution = this.getLineDistribution(fieldSpots);

        let playerIndex = 0;
        Object.entries(distribution).forEach(([line, count]) => {
            for (let i = 0; i < count && playerIndex < fieldPlayers.length; i++) {
                const player = fieldPlayers[playerIndex];
                this.players.lines[player] = line;

                // Track line history
                if (!this.players.lineHistory[player]) {
                    this.players.lineHistory[player] = [];
                }
                if (!this.players.lineHistory[player].includes(line)) {
                    this.players.lineHistory[player].push(line);
                }

                playerIndex++;
            }
        });
    }

    /**
     * Get line distribution based on field size
     */
    getLineDistribution(fieldSpots) {
        // AFL line distribution varies by team size
        if (fieldSpots <= 9) {
            return { Ruck: 1, Midfield: 3, Forward: 2, Back: 3 };
        } else if (fieldSpots <= 11) {
            return { Ruck: 1, Midfield: 4, Forward: 3, Back: 3 };
        } else if (fieldSpots <= 13) {
            return { Ruck: 1, Midfield: 4, Forward: 4, Back: 4 };
        } else {
            return { Ruck: 2, Midfield: 5, Forward: 4, Back: 4 };
        }
    }

    /**
     * Update player's line assignment
     */
    updatePlayerLine(player, newLine) {
        if (!ENGINE_DEFAULTS.LINES.includes(newLine)) {
            this.handleError(`Invalid line: ${newLine}`);
            return false;
        }

        this.players.lines[player] = newLine;

        // Track line history
        if (!this.players.lineHistory[player].includes(newLine)) {
            this.players.lineHistory[player].push(newLine);
        }

        console.log(`${player} moved to ${newLine}`);
        return true;
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

        // Check all OFF players are on field
        for (const player of pendingOff) {
            if (!this.players.field.includes(player)) {
                this.handleError(`Cannot sub off ${player} - not on field`);
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
        // 1. Remove from field
        this.players.field = this.players.field.filter(p => !pendingOff.includes(p));

        // 2. Add to field
        this.players.field.push(...pendingOn);

        // 3. Remove from bench
        this.players.bench = this.players.bench.filter(p => !pendingOn.includes(p));

        // 4. Add to bench
        this.players.bench.push(...pendingOff);

        // Validate we still have correct field size
        this.validatePlayerState();

        // Update lines for new field players
        this.assignLines(this.players.field);

        // Update stints
        pendingOff.forEach(player => {
            this.players.currentStints[player].onField = false;
            this.players.lastRotationTime[player] = rotationTime;
        });

        pendingOn.forEach(player => {
            this.players.currentStints[player] = {
                start: rotationTime,
                onField: true
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

                console.log(`Current field after rotation: ${this.players.field.join(', ')}`);
                console.log(`Current bench after rotation: ${this.players.bench.join(', ')}`);

                this.enforcer.syncWithActualState(
                    this.state.currentTime,
                    [...this.players.field],
                    [...this.players.bench],
                    playTimesSnapshot
                );
                const newPlan = this.enforcer.handleDeviation(
                    'late_substitution',
                    {
                        actualField: [...this.players.field],
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

        // Play substitution confirmation sound
        this.playSound('subBuzzer');

        return true;
    }

    /**
     * Handle emergency substitution
     */
    emergencySubstitution(playerOff, playerOn, removeFromGame = false) {
        console.log(`🚨 Emergency substitution: ${playerOff} → ${playerOn}`);

        // Validate
        if (!this.players.field.includes(playerOff)) {
            this.handleError(`${playerOff} is not on field`);
            return false;
        }

        if (!this.players.bench.includes(playerOn)) {
            this.handleError(`${playerOn} is not on bench`);
            return false;
        }

        // Execute substitution - ATOMIC OPERATION
        const fieldIndex = this.players.field.indexOf(playerOff);
        this.players.field[fieldIndex] = playerOn;

        const benchIndex = this.players.bench.indexOf(playerOn);
        this.players.bench[benchIndex] = playerOff;

        // Validate state
        this.validatePlayerState();

        // Update lines - inherit line from subbed-off player
        this.players.lines[playerOn] = this.players.lines[playerOff];
        if (!this.players.lineHistory[playerOn].includes(this.players.lines[playerOn])) {
            this.players.lineHistory[playerOn].push(this.players.lines[playerOn]);
        }

        // Update stints
        this.players.currentStints[playerOff].onField = false;
        this.players.currentStints[playerOn] = {
            start: this.state.currentTime,
            onField: true
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

        // Notify optimizer and replan
        if (this.enforcer) {
            const playTimesSnapshot = { ...this.players.minutes };
            this.enforcer.syncWithActualState(
                this.state.currentTime,
                [...this.players.field],
                [...this.players.bench],
                playTimesSnapshot
            );
            const deviationType = removeFromGame ? 'injury' : 'late_substitution';
            const newPlan = this.enforcer.handleDeviation(
                deviationType,
                {
                    player: playerOff,
                    actualField: [...this.players.field],
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

        // Remove from bench (should NOT be on field)
        if (this.players.field.includes(player)) {
            this.handleError(`Cannot remove ${player} - still on field!`);
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

        // Notify optimizer
        if (this.enforcer) {
            const playTimesSnapshot = { ...this.players.minutes };
            this.enforcer.syncWithActualState(
                this.state.currentTime,
                [...this.players.field],
                [...this.players.bench],
                playTimesSnapshot
            );
            const newPlan = this.enforcer.handleDeviation(
                'player_returned',
                {
                    player: player,
                    actualField: [...this.players.field],
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
     * Timer tick - called every second
     */
    tick() {
        if (!this.state.running) return;

        try {
            const now = Date.now();
            const elapsed = Math.round((now - this.lastTickTime) / 1000);
            this.lastTickTime = now;

            const maxCatchup = GLOBAL_GAME_CONFIG.MAX_TICK_CATCHUP || 10;
            for (let i = 0; i < Math.min(elapsed, maxCatchup); i++) {
                this.advanceOneSecond();
            }

            const validationInterval = GLOBAL_GAME_CONFIG.VALIDATION_INTERVAL || 30;
            if (this.state.currentTime % validationInterval === 0) {
                this.validatePlayerState();
            }

            if (this.callbacks.onUpdate) {
                this.callbacks.onUpdate(this.getState());
            }
        } catch (error) {
            console.error('❌ Tick error:', error);
            if (this.callbacks.onError) {
                this.callbacks.onError(`Tick error: ${error.message}`);
            }
        }
    }

    /**
     * Advance game time by one second
     */
    advanceOneSecond() {
        // Check for period end BEFORE incrementing
        if (this.config.periodLength > 0 &&
            this.state.periodElapsed >= this.config.periodLength) {
            this.handlePeriodEnd();
            return;
        }

        // Update player times
        this.players.field.forEach(player => {
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
            (this.rotations.nextScheduled.time - this.state.currentTime) <= this.config.warningBeepTime &&
            (this.rotations.nextScheduled.time - this.state.currentTime) > 0) {

            this.warningPlayed = true;

            if (this.audio.enabled) {
                this.playSound('warningBeep');
            }

            if (this.callbacks.onWarning) {
                const timeToRotation = this.rotations.nextScheduled.time - this.state.currentTime;
                this.callbacks.onWarning(timeToRotation);
            }
        }

        // Check for scheduled rotation
        if (!this.rotations.pending &&
            this.rotations.nextScheduled &&
            this.state.currentTime >= this.rotations.nextScheduled.time) {

            const scheduledOff = this.rotations.nextScheduled.off;
            const scheduledOn = this.rotations.nextScheduled.on;

            const invalidOff = scheduledOff.filter(p => !this.players.field.includes(p));

            if (invalidOff.length > 0) {
                console.warn(`⚠️ Skipping invalid rotation at ${this.formatTime(this.state.currentTime)}`);
                console.warn(`   Players not on field: ${invalidOff.join(', ')}`);

                this.rotations.currentPlanIndex++;
                this.updateNextRotation();

                if (this.enforcer) {
                    console.log('🔄 Triggering replan due to invalid rotation');
                    const playTimesSnapshot = { ...this.players.minutes };
                    this.enforcer.syncWithActualState(
                        this.state.currentTime,
                        [...this.players.field],
                        [...this.players.bench],
                        playTimesSnapshot
                    );
                    const newPlan = this.enforcer.handleDeviation(
                        'invalid_rotation',
                        {
                            actualField: [...this.players.field],
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
                this.initiateRotation(scheduledOff, scheduledOn);
            }
        }
    }

    /**
     * Apply missed time when page was hidden
     */
    applyMissedTime(secondsMissed) {
        if (secondsMissed <= 0) return;

        console.log(`⏱️ Applying ${secondsMissed} seconds of missed time`);

        const totalGameDuration = this.config.periodLength * this.config.numPeriods;
        const gameWasOver = totalGameDuration > 0 && this.state.currentTime >= totalGameDuration;

        if (gameWasOver) {
            console.log('Game was already over, not applying missed time');
            return;
        }

        this.players.field.forEach(playerName => {
            this.players.minutes[playerName] = (this.players.minutes[playerName] || 0) + secondsMissed;
        });

        this.players.bench.forEach(playerName => {
            this.players.benchMinutes[playerName] = (this.players.benchMinutes[playerName] || 0) + secondsMissed;
        });

        this.state.currentTime += secondsMissed;
        this.state.periodElapsed += secondsMissed;

        while (this.config.periodLength > 0 &&
            this.state.periodElapsed >= this.config.periodLength &&
            this.state.currentPeriod <= this.config.numPeriods) {

            const timeOverPeriod = this.state.periodElapsed - this.config.periodLength;
            const isFinalPeriod = this.state.currentPeriod >= this.config.numPeriods;

            if (isFinalPeriod) {
                this.state.currentTime = totalGameDuration;
                this.state.periodElapsed = this.config.periodLength;
                this.state.gameOver = true;
                this.stop();
                if (this.callbacks.onUpdate) {
                    this.callbacks.onUpdate(this.getState());
                }
                return;
            } else {
                this.state.currentPeriod++;
                this.state.periodElapsed = timeOverPeriod;
            }
        }

        const isGameOverNow = totalGameDuration > 0 && this.state.currentTime >= totalGameDuration;
        if (isGameOverNow) {
            this.state.gameOver = true;
            this.stop();
        }

        if (this.callbacks.onUpdate) {
            this.callbacks.onUpdate(this.getState());
        }
    }

    /**
     * Handle page visibility changes
     */
    handleVisibilityChange() {
        const totalGameDuration = this.config.periodLength * this.config.numPeriods;
        const isGameOver = totalGameDuration > 0 && this.state.currentTime >= totalGameDuration;

        if (document.hidden) {
            if (this.state.running) {
                console.log('📴 Page hidden, timer was running');
                this.lastVisibleTimestamp = performance.now();
                this.wasRunningWhenHidden = true;
                if (this.timerInterval) {
                    clearInterval(this.timerInterval);
                    this.timerInterval = null;
                }
            } else {
                this.wasRunningWhenHidden = false;
            }
        } else {
            console.log('📱 Page became visible');

            if (this.wasRunningWhenHidden && this.lastVisibleTimestamp && !isGameOver) {
                const elapsedWhileHidden = Math.round((performance.now() - this.lastVisibleTimestamp) / 1000);
                const timeRemaining = this.totalGameLength - this.state.currentTime;

                if (elapsedWhileHidden > 3600 || elapsedWhileHidden > timeRemaining) {
                    const cappedTime = Math.min(elapsedWhileHidden, timeRemaining);
                    if (cappedTime <= 0) {
                        this.lastVisibleTimestamp = null;
                        this.wasRunningWhenHidden = false;
                        if (this.callbacks.onUpdate) {
                            this.callbacks.onUpdate(this.getState());
                        }
                        return;
                    }
                }

                if (elapsedWhileHidden > 0) {
                    this.applyMissedTime(elapsedWhileHidden);
                }

                this.lastVisibleTimestamp = null;

                const newIsGameOver = totalGameDuration > 0 && this.state.currentTime >= totalGameDuration;

                if (!newIsGameOver) {
                    console.log('▶️ Resuming timer');
                    this.lastTickTime = Date.now();
                    this.timerInterval = setInterval(() => this.tick(), 1000);
                } else {
                    this.state.running = false;
                    this.wasRunningWhenHidden = false;
                }

                if (this.callbacks.onUpdate) {
                    this.callbacks.onUpdate(this.getState());
                }
            } else {
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

        const invalidOff = playersOff.filter(p => !this.players.field.includes(p));
        const invalidOn = playersOn.filter(p => !this.players.bench.includes(p));

        if (invalidOff.length > 0) {
            console.error(`❌ Cannot initiate rotation - these players are NOT on field: ${invalidOff.join(', ')}`);
            this.rotations.currentPlanIndex++;
            this.updateNextRotation();
            return false;
        }

        if (invalidOn.length > 0) {
            console.error(`❌ Cannot initiate rotation - these players are NOT on bench: ${invalidOn.join(', ')}`);
            this.rotations.currentPlanIndex++;
            this.updateNextRotation();
            return false;
        }

        console.log(`🔄 Rotation initiated: OFF: ${playersOff.join(', ')}, ON: ${playersOn.join(', ')}`);

        this.rotations.pending = true;
        this.rotations.pendingOff = playersOff;
        this.rotations.pendingOn = playersOn;
        this.rotations.pendingTime = this.state.currentTime;

        this.warningPlayed = false;
        this.earlyWarningShown = false;

        if (this.callbacks.onRotation) {
            this.callbacks.onRotation({
                off: playersOff,
                on: playersOn,
                time: this.state.currentTime
            });
        }

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
                [...this.players.field],
                [...this.players.bench],
                playTimesSnapshot
            );
            const newPlan = this.enforcer.handleDeviation(
                'late_substitution',
                {
                    actualField: [...this.players.field],
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

        if (newPlanRotations.length > 0) {
            const firstRotation = newPlanRotations[0];
            const invalidOff = firstRotation.off.filter(p => !this.players.field.includes(p));
            const invalidOn = firstRotation.on.filter(p => !this.players.bench.includes(p));

            if (invalidOff.length > 0 || invalidOn.length > 0) {
                console.error('⚠️ Recovery plan has invalid first rotation!');
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
        console.log(`Quarter ${this.state.currentPeriod} ended`);

        this.stop();

        if (this.state.currentPeriod >= this.config.numPeriods) {
            this.handleGameEnd();
        }
        else {
            const nextPeriod = this.state.currentPeriod + 1;
            this.state.currentPeriod = nextPeriod;
            this.state.periodElapsed = 0;

            // Set break flags
            if (nextPeriod === 3) {
                this.state.isHalftime = true;
                this.state.isQuarterTime = false;
            } else {
                this.state.isQuarterTime = true;
                this.state.isHalftime = false;
            }

            if (this.callbacks.onPeriodEnd) {
                this.callbacks.onPeriodEnd({
                    period: this.state.currentPeriod - 1,
                    isHalftime: this.state.isHalftime,
                    isQuarterTime: this.state.isQuarterTime
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

        this.playSound('finalWhistle');

        const stats = this.calculateFinalStats();

        console.log('📊 Final Statistics:');
        console.log(`   Final Score: ${this.getScoreDisplay('home')} - ${this.getScoreDisplay('away')}`);
        console.log(`   Variance: ${stats.variance}s`);
        console.log(`   Rotations: ${stats.rotations}`);

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
            const playerStats = this.scoring.playerStats[player] || {};

            stats.players[player] = {
                minutes: minutes,
                benchMinutes: benchMinutes,
                percentage: ((minutes / this.state.currentTime) * 100).toFixed(1),
                jerseyNumber: this.players.jerseyNumbers[player] || null,
                line: this.players.lines[player] || 'Utility',
                linesPlayed: this.players.lineHistory[player] || [],
                goals: playerStats.goals || 0,
                behinds: playerStats.behinds || 0,
                totalScore: ((playerStats.goals || 0) * 6) + (playerStats.behinds || 0),
                disposals: playerStats.disposals || 0,
                kicks: playerStats.kicks || 0,
                handballs: playerStats.handballs || 0,
                marks: playerStats.marks || 0,
                tackles: playerStats.tackles || 0,
                hitouts: playerStats.hitouts || 0,
                clearances: playerStats.clearances || 0
            };

            totalMinutes += minutes;
            playTimes.push(minutes);

            if (minutes > stats.maxMinutes) stats.maxMinutes = minutes;
            if (stats.minMinutes === 0 || minutes < stats.minMinutes) stats.minMinutes = minutes;
        });

        // Calculate variance using standard deviation
        if (playTimes.length > 0) {
            const mean = totalMinutes / playTimes.length;
            const squaredDiffs = playTimes.map(time => Math.pow(time - mean, 2));
            const varianceValue = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / playTimes.length;
            stats.variance = Math.round(Math.sqrt(varianceValue));
        }

        stats.averageMinutes = activePlayers.length > 0 ? totalMinutes / activePlayers.length : 0;

        if (this.enforcer) {
            stats.enforcerAnalytics = this.enforcer.getAnalytics(this.state.currentTime);
        }

        return stats;
    }

    /**
     * Get complete game stats for database persistence
     */
    getStats() {
        const baseStats = this.calculateFinalStats();
        const scoringStats = this.getScoringStats();

        return {
            ...baseStats,
            homeGoals: this.scoring.home.goals,
            homeBehinds: this.scoring.home.behinds,
            homeScore: this.getTotal('home'),
            awayGoals: this.scoring.away.goals,
            awayBehinds: this.scoring.away.behinds,
            awayScore: this.getTotal('away'),
            teamName: scoringStats.homeTeamName,
            opponentName: scoringStats.awayTeamName,
            format: this.config.format,
            ageGroup: this.config.ageGroup,
            totalGameTime: this.state.currentTime
        };
    }

    // ============================================================================
    // AFL SCORING METHODS - Goals and Behinds
    // ============================================================================

    /**
     * Record a goal for a player (6 points)
     */
    recordGoal(player) {
        if (!this.scoring.playerStats[player]) {
            this.scoring.playerStats[player] = { goals: 0, behinds: 0 };
        }

        this.scoring.playerStats[player].goals++;
        this.scoring.home.goals++;

        console.log(`⚽ GOAL! ${player} (${this.getScoreDisplay('home')})`);

        if (this.callbacks.onScoreUpdate) {
            this.callbacks.onScoreUpdate(this.getScoringStats());
        }

        return this.scoring.playerStats[player].goals;
    }

    /**
     * Record a behind for a player (1 point)
     */
    recordBehind(player) {
        if (!this.scoring.playerStats[player]) {
            this.scoring.playerStats[player] = { goals: 0, behinds: 0 };
        }

        this.scoring.playerStats[player].behinds++;
        this.scoring.home.behinds++;

        console.log(`○ Behind - ${player} (${this.getScoreDisplay('home')})`);

        if (this.callbacks.onScoreUpdate) {
            this.callbacks.onScoreUpdate(this.getScoringStats());
        }

        return this.scoring.playerStats[player].behinds;
    }

    /**
     * Record opposition goal
     */
    recordOppositionGoal() {
        this.scoring.away.goals++;
        console.log(`⚽ Opposition GOAL (${this.getScoreDisplay('away')})`);

        if (this.callbacks.onScoreUpdate) {
            this.callbacks.onScoreUpdate(this.getScoringStats());
        }

        return this.scoring.away.goals;
    }

    /**
     * Record opposition behind
     */
    recordOppositionBehind() {
        this.scoring.away.behinds++;
        console.log(`○ Opposition behind (${this.getScoreDisplay('away')})`);

        if (this.callbacks.onScoreUpdate) {
            this.callbacks.onScoreUpdate(this.getScoringStats());
        }

        return this.scoring.away.behinds;
    }

    /**
     * Get total score for a team
     */
    getTotal(team) {
        const score = this.scoring[team];
        return (score.goals * 6) + score.behinds;
    }

    /**
     * Get AFL score display format: G.B (Total)
     * Example: "12.8 (80)"
     */
    getScoreDisplay(team) {
        const score = this.scoring[team];
        const total = (score.goals * 6) + score.behinds;
        return `${score.goals}.${score.behinds} (${total})`;
    }

    /**
     * Record a player stat (disposals, marks, tackles, etc.)
     */
    recordPlayerStat(player, statType, value = 1) {
        if (!this.scoring.playerStats[player]) {
            this.scoring.playerStats[player] = {};
        }

        const validStats = ['disposals', 'kicks', 'handballs', 'marks', 'tackles', 'hitouts', 'clearances', 'inside50s', 'turnovers'];

        if (!validStats.includes(statType)) {
            console.warn(`Invalid stat type: ${statType}`);
            return false;
        }

        this.scoring.playerStats[player][statType] = (this.scoring.playerStats[player][statType] || 0) + value;

        // Auto-calculate disposals from kicks + handballs
        if (statType === 'kicks' || statType === 'handballs') {
            this.scoring.playerStats[player].disposals =
                (this.scoring.playerStats[player].kicks || 0) +
                (this.scoring.playerStats[player].handballs || 0);
        }

        return this.scoring.playerStats[player][statType];
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
        const topScorers = Object.entries(this.scoring.playerStats)
            .map(([player, stats]) => ({
                player,
                goals: stats.goals || 0,
                behinds: stats.behinds || 0,
                total: ((stats.goals || 0) * 6) + (stats.behinds || 0)
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);

        return {
            homeGoals: this.scoring.home.goals,
            homeBehinds: this.scoring.home.behinds,
            homeScore: this.getTotal('home'),
            homeDisplay: this.getScoreDisplay('home'),
            awayGoals: this.scoring.away.goals,
            awayBehinds: this.scoring.away.behinds,
            awayScore: this.getTotal('away'),
            awayDisplay: this.getScoreDisplay('away'),
            homeTeamName: this.scoring.homeTeamName,
            awayTeamName: this.scoring.awayTeamName,
            playerStats: { ...this.scoring.playerStats },
            topScorers
        };
    }

    /**
     * Get current game state
     */
    getState() {
        const analytics = this.enforcer ? this.enforcer.getAnalytics(this.state.currentTime) : null;

        if (this._stateNeedsValidation) {
            this.validatePlayerState();
            this._stateNeedsValidation = false;
        }

        return {
            ...this.state,
            players: {
                field: [...this.players.field],
                bench: [...this.players.bench],
                removed: Array.from(this.players.removed),
                minutes: { ...this.players.minutes },
                benchMinutes: { ...this.players.benchMinutes },
                lines: { ...this.players.lines },
                lineHistory: { ...this.players.lineHistory }
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
            scoring: this.getScoringStats(),
            config: {
                ageGroup: this.config.ageGroup,
                fieldSpots: this.config.fieldSpots,
                periodLength: this.config.periodLength
            }
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
            this.audio.warningBeep = new Audio('beep-warning.wav');
            this.audio.whistle = new Audio('startingwhistle.wav');
            this.audio.finalWhistle = new Audio('Game sounds/final whistle sound.mp3');
            this.audio.subBuzzer = new Audio('Game sounds/SportsBuzzer-1-final.mp3');

            this.audio.warningBeep.load();
            this.audio.whistle.load();
            this.audio.finalWhistle.load();
            this.audio.subBuzzer.load();

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
        console.error(`❌ [AFLGameEngine] ${message}`);

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

        this.lastVisibleTimestamp = null;
        this.wasRunningWhenHidden = false;

        this.state = {
            initialized: false,
            running: false,
            paused: false,
            currentTime: 0,
            currentPeriod: 1,
            periodElapsed: 0,
            isQuarterTime: false,
            isHalftime: false,
            gameOver: false
        };

        this.players = {
            all: [],
            field: [],
            bench: [],
            removed: new Set(),
            minutes: {},
            benchMinutes: {},
            currentStints: {},
            lines: {},
            lineHistory: {},
            lastRotationTime: {},
            jerseyNumbers: {}
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
            home: { goals: 0, behinds: 0 },
            away: { goals: 0, behinds: 0 },
            homeTeamName: 'Home',
            awayTeamName: 'Opposition',
            playerStats: {}
        };

        this.enforcer = null;

        console.log('Reset complete');
    }
}
