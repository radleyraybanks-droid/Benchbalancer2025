/**
 * Soccer Game Engine
 * Handles timing, rotations, scoring, and player management for soccer
 * Supports variable field sizes (4-11) and goalkeeper management (0-1 GK)
 * Version 1.0 - Based on Basketball Engine v3.1
 */

import { SoccerIntervalOptimizer, OPTIMIZER_DEFAULTS } from './soccer-interval-optimizer.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * @typedef {Object} GameConfig
 * @property {number} periodLength - Length of each half in seconds
 * @property {number} numPeriods - Number of periods (always 2 for soccer)
 * @property {number} fieldSpots - Number of players on field (4-11)
 * @property {number} numGoalkeepers - Number of goalkeepers (0 or 1)
 * @property {number} defaultBench - Default bench size (0-6)
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

export const ENGINE_DEFAULTS = {
    FIELD_SPOTS: 9,           // Default 9 players on field (including GK)
    NUM_GOALKEEPERS: 1,       // Default 1 goalkeeper
    DEFAULT_BENCH: 3,         // Default 3 bench players
    DEFAULT_PERIOD_LENGTH: 1200, // 20 minutes per half
    DEFAULT_NUM_PERIODS: 2,   // 2 halves
    WARNING_BEEP_TIME: 10,
    EARLY_WARNING_TIME: 60,
    VALIDATION_INTERVAL: 30,
    MAX_CATCHUP_SECONDS: 3600,
    MAX_TICK_CATCHUP: 10,
};

// Merge with global config if available
const GLOBAL_GAME_CONFIG = (typeof window !== 'undefined' && window.GameConfig?.SOCCER_DEFAULTS)
    ? { ...ENGINE_DEFAULTS, ...window.GameConfig.SOCCER_DEFAULTS }
    : ENGINE_DEFAULTS;

// ============================================================================
// MAIN CLASS
// ============================================================================

export class SoccerGameEngine {
    constructor(config = null) {
        const baseConfig = config || GLOBAL_GAME_CONFIG;

        // Game configuration
        this.config = {
            periodLength: baseConfig.DEFAULT_PERIOD_LENGTH || ENGINE_DEFAULTS.DEFAULT_PERIOD_LENGTH,
            numPeriods: baseConfig.DEFAULT_NUM_PERIODS || ENGINE_DEFAULTS.DEFAULT_NUM_PERIODS,
            fieldSpots: baseConfig.FIELD_SPOTS || ENGINE_DEFAULTS.FIELD_SPOTS,
            numGoalkeepers: baseConfig.NUM_GOALKEEPERS ?? ENGINE_DEFAULTS.NUM_GOALKEEPERS,
            defaultBench: baseConfig.DEFAULT_BENCH || ENGINE_DEFAULTS.DEFAULT_BENCH,
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
            isHalftime: false,
            gameOver: false
        };

        // Player management
        this.players = {
            all: [],
            field: [],      // Players on field
            bench: [],      // Players on bench
            removed: new Set(),
            minutes: {},
            benchMinutes: {},
            currentStints: {},
            positions: {},
            lastRotationTime: {},
            jerseyNumbers: {},
            goalkeeper: null  // Current goalkeeper name (null if no GK)
        };

        // Scoring management
        this.scoring = {
            home: 0,
            away: 0,
            homeTeamName: 'Home',
            awayTeamName: 'Opposition',
            playerPoints: {}  // Goals per player
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
            onScoreUpdate: null,
            onGoalkeeperChange: null
        };

        // Timer
        this.timerInterval = null;
        this.lastTickTime = null;
        this.warningPlayed = false;
        this.earlyWarningShown = false;

        // Page Visibility tracking
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

        this._stateNeedsValidation = false;

        console.log('⚽ Soccer Game Engine v1.0 initialized');
    }

    /**
     * Mark state as needing validation
     */
    markStateDirty() {
        this._stateNeedsValidation = true;
    }

    /**
     * Validate field/bench state
     * Ensures field has exactly fieldSpots players and no duplicates
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

        // Check goalkeeper is on field (if we have a GK)
        if (this.config.numGoalkeepers === 1 && this.players.goalkeeper) {
            if (!this.players.field.includes(this.players.goalkeeper)) {
                errors.push(`Goalkeeper ${this.players.goalkeeper} is not on field`);
            }
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
     */
    fixPlayerState() {
        console.warn('🔧 Fixing player state...');

        const expectedFieldSize = this.config.fieldSpots;
        const activePlayers = this.players.all.filter(p => !this.players.removed.has(p));
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

        // Ensure goalkeeper is on field
        if (this.config.numGoalkeepers === 1 && this.players.goalkeeper) {
            if (!this.players.field.includes(this.players.goalkeeper)) {
                // GK got pushed to bench - swap them back
                const nonGKOnField = this.players.field.filter(p => p !== this.players.goalkeeper);
                if (nonGKOnField.length >= expectedFieldSize) {
                    // Move last non-GK to bench
                    const moveOut = nonGKOnField[nonGKOnField.length - 1];
                    this.players.field = this.players.field.filter(p => p !== moveOut);
                    this.players.bench.push(moveOut);
                }
                // Add GK to field
                this.players.field = [this.players.goalkeeper, ...this.players.field.filter(p => p !== this.players.goalkeeper)].slice(0, expectedFieldSize);
                this.players.bench = this.players.bench.filter(p => p !== this.players.goalkeeper);
            }
        }

        console.log(`✅ Fixed: ${this.players.field.length} on field, ${this.players.bench.length} on bench`);
    }

    /**
     * Initialize game with setup parameters
     */
    initialize(setupData) {
        console.log('Initializing soccer game with setup:', setupData);

        // Parse setup data
        this.config.periodLength = (setupData.minutesPerPeriod || 20) * 60;
        this.config.numPeriods = 2; // Always 2 halves for soccer
        this.config.fieldSpots = setupData.numOnField || 9;
        this.config.numGoalkeepers = setupData.numGoalkeepers ?? 1;
        this.config.autoConfirmRotations = setupData.autoConfirmRotations || false;
        this.config.warningBeepTime = setupData.warningBeepTime || 10;

        const numReserves = setupData.numReserves || 3;
        const totalPlayers = this.config.fieldSpots + numReserves;

        // Set up players
        this.players.all = this.createPlayerRoster(setupData.starterNames, setupData.reserveNames);
        this.players.field = this.players.all.slice(0, this.config.fieldSpots);
        this.players.bench = this.players.all.slice(this.config.fieldSpots);

        // Set goalkeeper (first player if GK enabled)
        if (this.config.numGoalkeepers === 1 && this.players.field.length > 0) {
            this.players.goalkeeper = this.players.field[0];
        } else {
            this.players.goalkeeper = null;
        }

        // Validate initial state
        this.validatePlayerState();

        // Extract jersey numbers from playerData if available
        if (setupData.playerData) {
            Object.entries(setupData.playerData).forEach(([playerName, data]) => {
                if (data.jerseyNumber) {
                    this.players.jerseyNumbers[playerName] = data.jerseyNumber;
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
        this.assignPositions(this.players.field);

        // Set up optimizer
        const totalGameLength = this.config.periodLength * this.config.numPeriods;
        this.totalGameLength = totalGameLength;

        const idealShifts = setupData.idealShiftsPerPlayer || 4;

        this.enforcer = new SoccerIntervalOptimizer({
            gameLength: totalGameLength,
            periodLength: this.config.periodLength,
            totalPlayers: totalPlayers,
            fieldSpots: this.config.fieldSpots,
            numGoalkeepers: this.config.numGoalkeepers,
            idealShiftsPerPlayer: idealShifts
        });

        // Initialize enforcer
        this.enforcer.initialize(this.players.all, {
            onField: [...this.players.field],
            onBench: [...this.players.bench],
            playerMinutes: { ...this.players.minutes },
            elapsedTime: 0,
            goalkeeper: this.players.goalkeeper
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

        console.log('✅ Soccer game initialized successfully');
        console.log(`   Roster: ${totalPlayers} players (${this.players.field.length} field, ${this.players.bench.length} bench)`);
        console.log(`   Goalkeeper: ${this.players.goalkeeper || 'None'}`);
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
        const fieldSpots = this.config.fieldSpots;

        // Add starters
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
     * Assign positions to players on field
     * Soccer positions based on field size
     */
    assignPositions(fieldPlayers) {
        const numPlayers = fieldPlayers.length;
        const hasGK = this.config.numGoalkeepers === 1;

        // Generate position labels based on field size
        const positions = this.generatePositionLabels(numPlayers, hasGK);

        fieldPlayers.forEach((player, index) => {
            this.players.positions[player] = positions[index] || 'MF';
        });
    }

    /**
     * Generate position labels for given field size
     */
    generatePositionLabels(numPlayers, hasGK) {
        const positions = [];

        if (hasGK) {
            positions.push('GK');
            numPlayers--;
        }

        // Distribute remaining players across DF, MF, FW
        const outfieldPlayers = numPlayers;

        if (outfieldPlayers <= 3) {
            // Small teams: 1-2 DF, rest MF/FW
            positions.push('DF');
            for (let i = 1; i < outfieldPlayers; i++) {
                positions.push(i < outfieldPlayers - 1 ? 'MF' : 'FW');
            }
        } else if (outfieldPlayers <= 6) {
            // Medium teams: 2 DF, 2-3 MF, 1-2 FW
            positions.push('DF', 'DF');
            const remaining = outfieldPlayers - 2;
            const mf = Math.ceil(remaining / 2);
            const fw = remaining - mf;
            for (let i = 0; i < mf; i++) positions.push('MF');
            for (let i = 0; i < fw; i++) positions.push('FW');
        } else {
            // Large teams: 3-4 DF, 3-4 MF, 2-3 FW
            const df = Math.floor(outfieldPlayers * 0.35);
            const fw = Math.floor(outfieldPlayers * 0.25);
            const mf = outfieldPlayers - df - fw;
            for (let i = 0; i < df; i++) positions.push('DF');
            for (let i = 0; i < mf; i++) positions.push('MF');
            for (let i = 0; i < fw; i++) positions.push('FW');
        }

        return positions;
    }

    /**
     * Change goalkeeper
     * @param {string} newGK - Name of new goalkeeper
     */
    changeGoalkeeper(newGK) {
        if (this.config.numGoalkeepers !== 1) {
            this.handleError('No goalkeeper management - team has 0 GKs');
            return false;
        }

        // Check new GK is on field or bench
        const isOnField = this.players.field.includes(newGK);
        const isOnBench = this.players.bench.includes(newGK);

        if (!isOnField && !isOnBench) {
            this.handleError(`${newGK} is not available`);
            return false;
        }

        const oldGK = this.players.goalkeeper;
        console.log(`🥅 Changing goalkeeper: ${oldGK} → ${newGK}`);

        if (isOnField) {
            // Simple position swap - both on field
            this.players.positions[newGK] = 'GK';
            if (oldGK && oldGK !== newGK) {
                this.players.positions[oldGK] = 'DF'; // Old GK becomes defender
            }
            this.players.goalkeeper = newGK;

            // Reorder field array so GK is first
            this.players.field = this.players.field.filter(p => p !== newGK);
            this.players.field.unshift(newGK);
        } else {
            // New GK is on bench - need to sub them on
            // Auto-swap: bring new GK on, send old GK to bench
            const fieldIndex = this.players.field.indexOf(oldGK);
            const benchIndex = this.players.bench.indexOf(newGK);

            this.players.field[fieldIndex] = newGK;
            this.players.bench[benchIndex] = oldGK;

            this.players.positions[newGK] = 'GK';
            delete this.players.positions[oldGK];

            this.players.goalkeeper = newGK;

            // Reorder so GK is first
            this.players.field = this.players.field.filter(p => p !== newGK);
            this.players.field.unshift(newGK);
        }

        // Validate state
        this.validatePlayerState();

        // Notify UI
        if (this.callbacks.onGoalkeeperChange) {
            this.callbacks.onGoalkeeperChange({
                oldGK,
                newGK,
                time: this.state.currentTime
            });
        }

        if (this.callbacks.onUpdate) {
            this.callbacks.onUpdate(this.getState());
        }

        return true;
    }

    /**
     * Confirm pending rotation
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

        // Don't allow subbing off the goalkeeper in a regular rotation
        if (this.players.goalkeeper && pendingOff.includes(this.players.goalkeeper)) {
            this.handleError('Cannot sub off goalkeeper in regular rotation. Use Manage GK instead.');
            return false;
        }

        const plannedTime = this.rotations.pendingTime;
        const rotationTime = this.state.currentTime;
        const delay = rotationTime - plannedTime;

        console.log(`✅ Rotation confirmed at ${this.formatTime(rotationTime)}`);

        // Execute rotation
        this.players.field = this.players.field.filter(p => !pendingOff.includes(p));
        this.players.field.push(...pendingOn);
        this.players.bench = this.players.bench.filter(p => !pendingOn.includes(p));
        this.players.bench.push(...pendingOff);

        // Validate state
        this.validatePlayerState();

        // Update positions for new field players
        this.assignPositions(this.players.field);

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
        if (delay > 15 && this.enforcer) {
            console.log(`⚠️ Rotation was ${delay} seconds late - triggering recalculation`);
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
                rotationTime
            );
            if (newPlan) {
                this.applyRecoveryPlan(newPlan);
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

        // Play sound
        this.playSound('subBuzzer');

        return true;
    }

    /**
     * Emergency substitution
     */
    emergencySubstitution(playerOff, playerOn, removeFromGame = false) {
        console.log(`🚨 Emergency substitution: ${playerOff} → ${playerOn}`);

        if (!this.players.field.includes(playerOff)) {
            this.handleError(`${playerOff} is not on field`);
            return false;
        }

        if (!this.players.bench.includes(playerOn)) {
            this.handleError(`${playerOn} is not on bench`);
            return false;
        }

        // Handle GK substitution
        const isGKSub = this.players.goalkeeper === playerOff;

        // Execute substitution
        const fieldIndex = this.players.field.indexOf(playerOff);
        this.players.field[fieldIndex] = playerOn;

        const benchIndex = this.players.bench.indexOf(playerOn);
        this.players.bench[benchIndex] = playerOff;

        // Validate state
        this.validatePlayerState();

        // Update positions
        if (isGKSub) {
            // New player becomes GK
            this.players.goalkeeper = playerOn;
            this.players.positions[playerOn] = 'GK';
        } else {
            this.players.positions[playerOn] = this.players.positions[playerOff];
        }
        delete this.players.positions[playerOff];

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

        if (this.players.field.includes(player)) {
            this.handleError(`Cannot remove ${player} - still on field!`);
            return false;
        }

        this.players.bench = this.players.bench.filter(p => p !== player);
        this.players.removed.add(player);

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

        this.validatePlayerState();

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
     * Timer tick
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
                this.rotations.currentPlanIndex++;
                this.updateNextRotation();

                if (this.enforcer) {
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
     * Initiate a rotation
     */
    initiateRotation(playersOff, playersOn) {
        if (!playersOff || !playersOn || playersOff.length !== playersOn.length) {
            console.warn('Invalid rotation parameters');
            return false;
        }

        const invalidOff = playersOff.filter(p => !this.players.field.includes(p));
        const invalidOn = playersOn.filter(p => !this.players.bench.includes(p));

        if (invalidOff.length > 0 || invalidOn.length > 0) {
            console.error(`❌ Cannot initiate rotation - invalid players`);
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
     * Handle period end
     */
    handlePeriodEnd() {
        console.log(`Period ${this.state.currentPeriod} ended`);

        this.stop();

        if (this.state.currentPeriod >= this.config.numPeriods) {
            this.handleGameEnd();
        } else {
            this.state.currentPeriod++;
            this.state.periodElapsed = 0;
            this.state.isHalftime = true;

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

        this.playSound('finalWhistle');

        const stats = this.calculateFinalStats();

        console.log('📊 Final Statistics:');
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

            stats.players[player] = {
                minutes: minutes,
                benchMinutes: benchMinutes,
                percentage: ((minutes / this.state.currentTime) * 100).toFixed(1),
                jerseyNumber: this.players.jerseyNumbers[player] || null,
                position: this.players.positions[player] || null,
                goals: this.scoring.playerPoints[player] || 0
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

        return stats;
    }

    /**
     * Get complete game stats
     */
    getStats() {
        const baseStats = this.calculateFinalStats();
        const scoringStats = this.getScoringStats();

        Object.keys(baseStats.players).forEach(player => {
            baseStats.players[player].goals = this.scoring.playerPoints[player] || 0;
        });

        return {
            ...baseStats,
            homeScore: scoringStats.homeScore,
            awayScore: scoringStats.awayScore,
            teamName: scoringStats.homeTeamName,
            opponentName: scoringStats.awayTeamName,
            totalGameTime: this.state.currentTime
        };
    }

    /**
     * Update player score (goal)
     */
    updatePlayerScore(player, points) {
        if (!this.scoring.playerPoints.hasOwnProperty(player)) {
            this.scoring.playerPoints[player] = 0;
        }

        this.scoring.playerPoints[player] += points;
        this.scoring.home += points;

        if (this.scoring.playerPoints[player] < 0) {
            this.scoring.home -= this.scoring.playerPoints[player];
            this.scoring.playerPoints[player] = 0;
        }

        if (this.scoring.home < 0) {
            this.scoring.home = 0;
        }

        console.log(`⚽ ${player} scored! (Total: ${this.scoring.playerPoints[player]})`);

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

        console.log(`Opposition scored! (Total: ${this.scoring.away})`);

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
                positions: { ...this.players.positions },
                goalkeeper: this.players.goalkeeper
            },
            rotations: {
                pending: this.rotations.pending,
                pendingOff: [...this.rotations.pendingOff],
                pendingOn: [...this.rotations.pendingOn],
                next: this.rotations.nextScheduled,
                history: this.rotations.history.length,
                remaining: this.rotations.plan.length - this.rotations.currentPlanIndex
            },
            variance: analytics ? analytics.currentVariance : 0,
            targetMinutes: this.planTargetMinutes,
            scoring: this.getScoringStats(),
            config: {
                fieldSpots: this.config.fieldSpots,
                numGoalkeepers: this.config.numGoalkeepers
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
        console.error(`❌ [SoccerEngine] ${message}`);

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
            positions: {},
            lastRotationTime: {},
            jerseyNumbers: {},
            goalkeeper: null
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
