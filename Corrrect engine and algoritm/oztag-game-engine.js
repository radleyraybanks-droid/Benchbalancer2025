/**
 * Oztag Game Engine
 * Version 1.0 - Complete Game Management for Oztag
 *
 * Features:
 * - 8 players on field, up to 6 reserves
 * - Rolling substitutions
 * - Two-half game format
 * - Automatic rotation scheduling
 * - Player time tracking
 */

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const OZTAG_ENGINE_DEFAULTS = {
    PLAYERS_ON_FIELD: 8,
    MAX_RESERVES: 6,
    DEFAULT_HALF_LENGTH: 1200,  // 20 minutes
    DEFAULT_NUM_HALVES: 2,
    WARNING_BEEP_TIME: 10,
    EARLY_WARNING_TIME: 60,
    VALIDATION_INTERVAL: 30,
    MAX_TICK_CATCHUP: 10,
};

// Merge with global config if available
const ENGINE_CONFIG = (typeof window !== 'undefined' && window.OztagConfig?.OZTAG_DEFAULTS)
    ? { ...OZTAG_ENGINE_DEFAULTS, ...window.OztagConfig.OZTAG_DEFAULTS }
    : OZTAG_ENGINE_DEFAULTS;

// ============================================================================
// MAIN CLASS
// ============================================================================

class OztagGameEngine {
    constructor() {
        // Game configuration
        this.config = {
            format: 'halves',
            periodLength: ENGINE_CONFIG.DEFAULT_HALF_LENGTH,
            numPeriods: ENGINE_CONFIG.DEFAULT_NUM_HALVES,
            fieldSpots: ENGINE_CONFIG.PLAYERS_ON_FIELD,
            maxReserves: ENGINE_CONFIG.MAX_RESERVES,
            defaultRotationsPerChange: 2,
            autoConfirmRotations: false,
            warningBeepTime: ENGINE_CONFIG.WARNING_BEEP_TIME
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
            field: [],      // 8 players on field
            bench: [],      // reserves
            removed: new Set(),
            minutes: {},
            benchMinutes: {},
            stintStart: {}
        };

        // Rotation tracking
        this.rotations = {
            pending: false,
            pendingOff: [],
            pendingOn: [],
            nextRotationTime: null,
            schedule: [],
            history: []
        };

        // Scoring
        this.scoring = {
            home: 0,
            away: 0,
            playerTries: {}
        };

        // Callbacks
        this.callbacks = {
            onUpdate: null,
            onRotationDue: null,
            onPeriodEnd: null,
            onGameEnd: null,
            onWarning: null,
            onError: null
        };

        // Timer
        this.timerInterval = null;
        this.lastTickTime = null;

        // Optimizer
        this.optimizer = null;

        // Validation flag
        this._stateNeedsValidation = false;

        console.log('🏉 Oztag Game Engine v1.0 initialized');
    }

    /**
     * Mark state as needing validation
     */
    markStateDirty() {
        this._stateNeedsValidation = true;
    }

    /**
     * Validate field/bench state
     */
    validatePlayerState() {
        const errors = [];
        const expectedFieldSize = this.config.fieldSpots;

        if (this.players.field.length !== expectedFieldSize) {
            errors.push(`Field has ${this.players.field.length} players, should be ${expectedFieldSize}`);
        }

        // Check no duplicates
        const allActive = [...this.players.field, ...this.players.bench];
        const uniqueActive = new Set(allActive);
        if (uniqueActive.size !== allActive.length) {
            errors.push('Duplicate players detected');
        }

        // Check for removed players still active
        for (const player of this.players.removed) {
            if (this.players.field.includes(player) || this.players.bench.includes(player)) {
                errors.push(`Removed player ${player} still in active roster`);
            }
        }

        if (errors.length > 0) {
            console.warn('⚠️ Player state validation errors:', errors);
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

        if (currentField.length > expectedFieldSize) {
            const toRemove = currentField.length - expectedFieldSize;
            const removed = currentField.splice(expectedFieldSize, toRemove);
            this.players.field = currentField.slice(0, expectedFieldSize);
            this.players.bench = [...new Set([...this.players.bench, ...removed])];
        } else if (currentField.length < expectedFieldSize) {
            const needed = expectedFieldSize - currentField.length;
            const benchAvailable = this.players.bench.slice(0, needed);
            this.players.field = [...currentField, ...benchAvailable];
            this.players.bench = this.players.bench.slice(needed);
        } else {
            this.players.field = currentField;
        }

        const onFieldSet = new Set(this.players.field);
        this.players.bench = activePlayers.filter(p => !onFieldSet.has(p));

        console.log(`✅ Fixed: ${this.players.field.length} on field, ${this.players.bench.length} on bench`);
    }

    /**
     * Initialize game with setup parameters
     */
    initialize(params) {
        const {
            playerNames = [],
            halfLength = 1200,
            numHalves = 2,
            playersOnField = 8,
            rotationsPerChange = 2,
            autoConfirm = false
        } = params;

        // Validate
        if (playerNames.length < playersOnField) {
            throw new Error(`Need at least ${playersOnField} players, got ${playerNames.length}`);
        }

        // Update config
        this.config.periodLength = halfLength;
        this.config.numPeriods = numHalves;
        this.config.fieldSpots = playersOnField;
        this.config.defaultRotationsPerChange = rotationsPerChange;
        this.config.autoConfirmRotations = autoConfirm;

        // Initialize players
        this.players.all = [...playerNames];
        this.players.field = playerNames.slice(0, playersOnField);
        this.players.bench = playerNames.slice(playersOnField);
        this.players.removed.clear();

        // Initialize time tracking
        const currentTime = 0;
        this.players.all.forEach(player => {
            this.players.minutes[player] = 0;
            this.players.benchMinutes[player] = 0;
            this.players.stintStart[player] = this.players.field.includes(player) ? currentTime : null;
        });

        // Initialize scoring
        this.scoring = {
            home: 0,
            away: 0,
            playerTries: {}
        };
        this.players.all.forEach(p => {
            this.scoring.playerTries[p] = 0;
        });

        // Reset state
        this.state = {
            initialized: true,
            running: false,
            paused: false,
            currentTime: 0,
            currentPeriod: 1,
            periodElapsed: 0,
            isHalftime: false,
            gameOver: false
        };

        // Reset rotations
        this.rotations = {
            pending: false,
            pendingOff: [],
            pendingOn: [],
            nextRotationTime: null,
            schedule: [],
            history: []
        };

        // Initialize optimizer
        this.initializeOptimizer();

        this.validatePlayerState();

        console.log(`✅ Game initialized: ${this.players.field.length} on field, ${this.players.bench.length} on bench`);

        return this.getState();
    }

    /**
     * Initialize the rotation optimizer
     */
    initializeOptimizer() {
        if (typeof window !== 'undefined' && window.OztagIntervalOptimizer) {
            this.optimizer = new window.OztagIntervalOptimizer({
                totalPlayers: this.players.all.length - this.players.removed.size,
                fieldSpots: this.config.fieldSpots,
                gameLength: this.config.periodLength * this.config.numPeriods,
                periodLength: this.config.periodLength,
                numPeriods: this.config.numPeriods,
                subsPerRotation: this.config.defaultRotationsPerChange
            });

            const result = this.optimizer.initialize(
                this.players.all.filter(p => !this.players.removed.has(p)),
                {
                    onField: [...this.players.field],
                    onBench: [...this.players.bench]
                }
            );

            if (result.success && result.schedule) {
                this.rotations.schedule = result.schedule;
                this.rotations.nextRotationTime = result.schedule[0] || null;
            }

            console.log('✅ Optimizer initialized with schedule:', this.rotations.schedule.map(t => this.formatTime(t)));
        } else {
            console.warn('⚠️ OztagIntervalOptimizer not available, using basic scheduling');
            this.generateBasicSchedule();
        }
    }

    /**
     * Generate basic rotation schedule without optimizer
     */
    generateBasicSchedule() {
        const totalTime = this.config.periodLength * this.config.numPeriods;
        const numPlayers = this.players.all.length - this.players.removed.size;
        const benchSize = numPlayers - this.config.fieldSpots;

        if (benchSize <= 0) {
            this.rotations.schedule = [];
            this.rotations.nextRotationTime = null;
            return;
        }

        // Calculate rotation interval
        const minInterval = 180; // 3 minutes
        const rotationsNeeded = Math.ceil(numPlayers * 1.5);
        const interval = Math.max(minInterval, Math.floor(totalTime / rotationsNeeded));

        const schedule = [];
        for (let t = interval; t < totalTime - 60; t += interval) {
            schedule.push(t);
        }

        this.rotations.schedule = schedule;
        this.rotations.nextRotationTime = schedule[0] || null;
    }

    /**
     * Start game timer
     */
    start() {
        if (!this.state.initialized) {
            console.error('Cannot start: game not initialized');
            return false;
        }

        if (this.state.gameOver) {
            console.error('Cannot start: game is over');
            return false;
        }

        if (this.state.isHalftime) {
            this.state.isHalftime = false;
        }

        this.state.running = true;
        this.state.paused = false;
        this.lastTickTime = Date.now();

        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        this.timerInterval = setInterval(() => this.tick(), 1000);

        console.log('▶️ Game started');
        return true;
    }

    /**
     * Pause game timer
     */
    pause() {
        this.state.running = false;
        this.state.paused = true;

        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        console.log('⏸️ Game paused');
        return true;
    }

    /**
     * Stop game completely
     */
    stop() {
        this.state.running = false;
        this.state.paused = false;

        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        console.log('⏹️ Game stopped');
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

            const maxCatchup = ENGINE_CONFIG.MAX_TICK_CATCHUP || 10;
            for (let i = 0; i < Math.min(elapsed, maxCatchup); i++) {
                this.advanceOneSecond();
            }

            // Validate periodically
            if (this.state.currentTime % ENGINE_CONFIG.VALIDATION_INTERVAL === 0) {
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
        if (this.state.gameOver || this.state.isHalftime) return;

        this.state.currentTime++;
        this.state.periodElapsed++;

        // Update player times
        this.players.field.forEach(player => {
            this.players.minutes[player] = (this.players.minutes[player] || 0) + 1;
        });

        this.players.bench.forEach(player => {
            this.players.benchMinutes[player] = (this.players.benchMinutes[player] || 0) + 1;
        });

        // Check for rotation
        this.checkRotation();

        // Check for period end
        if (this.state.periodElapsed >= this.config.periodLength) {
            this.handlePeriodEnd();
        }
    }

    /**
     * Check if rotation is due
     */
    checkRotation() {
        if (this.rotations.pending) return;

        const nextTime = this.rotations.nextRotationTime;
        if (nextTime && this.state.currentTime >= nextTime) {
            this.triggerRotation();
        }

        // Early warning
        if (nextTime && this.state.currentTime === nextTime - ENGINE_CONFIG.EARLY_WARNING_TIME) {
            if (this.callbacks.onWarning) {
                this.callbacks.onWarning('early', nextTime - this.state.currentTime);
            }
        }

        // Warning beep
        if (nextTime &&
            this.state.currentTime <= nextTime - ENGINE_CONFIG.WARNING_BEEP_TIME &&
            this.state.currentTime > nextTime - ENGINE_CONFIG.WARNING_BEEP_TIME - 2) { // Play within a 2-second window to be safe but avoid repeats if tick is fast

            // We need a flag to ensure we don't play it multiple times for the same rotation
            if (!this.rotations.warningPlayedForCurrent) {
                this.rotations.warningPlayedForCurrent = true;

                // Play sound internally
                if (typeof window !== 'undefined' && window.oztagUI && window.oztagUI.audio && window.oztagUI.audio.warningBeep) {
                    // If UI has audio loaded
                    window.oztagUI.audio.warningBeep.play().catch(e => console.warn('Warning beep failed:', e));
                } else {
                    // Fallback
                    const beep = new Audio('beep-warning.wav');
                    beep.play().catch(e => console.warn('Warning beep failed:', e));
                }

                if (this.callbacks.onWarning) {
                    this.callbacks.onWarning('beep', nextTime - this.state.currentTime);
                }
            }
        } else if (nextTime && this.state.currentTime < nextTime - ENGINE_CONFIG.WARNING_BEEP_TIME - 5) {
            // Reset flag if we are well before the warning time (e.g. schedule changed or new rotation)
            this.rotations.warningPlayedForCurrent = false;
        }
    }

    /**
     * Trigger a rotation
     */
    triggerRotation() {
        if (this.players.bench.length === 0) {
            this.advanceToNextRotation();
            return;
        }

        const rotation = this.calculateBestRotation();

        if (rotation.off.length === 0 || rotation.on.length === 0) {
            this.advanceToNextRotation();
            return;
        }

        this.rotations.pending = true;
        this.rotations.pendingOff = rotation.off;
        this.rotations.pendingOn = rotation.on;

        if (this.callbacks.onRotationDue) {
            this.callbacks.onRotationDue({
                time: this.state.currentTime,
                off: rotation.off,
                on: rotation.on
            });
        }

        if (this.config.autoConfirmRotations) {
            this.confirmRotation();
        }
    }

    /**
     * Calculate best rotation based on playing time
     */
    calculateBestRotation() {
        const subsCount = Math.min(
            this.config.defaultRotationsPerChange,
            this.players.bench.length
        );

        // Sort field players by most time played
        const fieldSorted = [...this.players.field]
            .map(p => ({ name: p, time: this.players.minutes[p] || 0 }))
            .sort((a, b) => b.time - a.time);

        // Sort bench players by least time played
        const benchSorted = [...this.players.bench]
            .map(p => ({ name: p, time: this.players.minutes[p] || 0 }))
            .sort((a, b) => a.time - b.time);

        const off = fieldSorted.slice(0, subsCount).map(p => p.name);
        const on = benchSorted.slice(0, subsCount).map(p => p.name);

        return { off, on };
    }

    /**
     * Confirm pending rotation
     */
    confirmRotation() {
        if (!this.rotations.pending) {
            console.warn('No rotation pending');
            return false;
        }

        const { pendingOff, pendingOn } = this.rotations;

        // Validate
        for (const player of pendingOff) {
            if (!this.players.field.includes(player)) {
                console.error(`Cannot sub off ${player}: not on field`);
                this.cancelRotation();
                return false;
            }
        }

        for (const player of pendingOn) {
            if (!this.players.bench.includes(player)) {
                console.error(`Cannot sub on ${player}: not on bench`);
                this.cancelRotation();
                return false;
            }
        }

        // Execute rotation
        const currentTime = this.state.currentTime;

        pendingOff.forEach(player => {
            const idx = this.players.field.indexOf(player);
            if (idx !== -1) {
                this.players.field.splice(idx, 1);
            }
            this.players.bench.push(player);
            this.players.stintStart[player] = null;
        });

        pendingOn.forEach(player => {
            const idx = this.players.bench.indexOf(player);
            if (idx !== -1) {
                this.players.bench.splice(idx, 1);
            }
            this.players.field.push(player);
            this.players.stintStart[player] = currentTime;
        });

        // Record history
        this.rotations.history.push({
            time: currentTime,
            off: [...pendingOff],
            on: [...pendingOn]
        });

        // Clear pending
        this.rotations.pending = false;
        this.rotations.pendingOff = [];
        this.rotations.pendingOn = [];

        // Advance to next rotation
        this.advanceToNextRotation();

        this.validatePlayerState();

        console.log(`✅ Rotation confirmed: ${pendingOff.join(', ')} OFF, ${pendingOn.join(', ')} ON`);

        return true;
    }

    /**
     * Cancel pending rotation
     */
    cancelRotation() {
        this.rotations.pending = false;
        this.rotations.pendingOff = [];
        this.rotations.pendingOn = [];
        this.advanceToNextRotation();
        console.log('❌ Rotation cancelled');
    }

    /**
     * Skip to next rotation time
     */
    advanceToNextRotation() {
        // Find the next scheduled rotation time after current time
        const nextTime = this.rotations.schedule.find(t => t > this.state.currentTime);
        this.rotations.nextRotationTime = nextTime || null;
        this.rotations.warningPlayedForCurrent = false;
    }

    /**
     * Handle period end
     */
    handlePeriodEnd() {
        this.pause();

        if (this.state.currentPeriod >= this.config.numPeriods) {
            this.state.gameOver = true;
            console.log('🏁 Game over!');
            if (this.callbacks.onGameEnd) {
                this.callbacks.onGameEnd(this.getState());
            }
        } else {
            this.state.isHalftime = true;
            console.log('⏰ Halftime');
            if (this.callbacks.onPeriodEnd) {
                this.callbacks.onPeriodEnd(this.state.currentPeriod);
            }
        }
    }

    /**
     * Start next period
     */
    startNextPeriod() {
        if (!this.state.isHalftime) {
            console.warn('Cannot start next period: not halftime');
            return false;
        }

        this.state.currentPeriod++;
        this.state.periodElapsed = 0;
        this.state.isHalftime = false;

        // Update rotation schedule for second half
        this.updateScheduleForNewPeriod();

        this.start();

        console.log(`▶️ Period ${this.state.currentPeriod} started`);
        return true;
    }

    /**
     * Update rotation schedule for new period
     */
    updateScheduleForNewPeriod() {
        const periodStart = (this.state.currentPeriod - 1) * this.config.periodLength;
        this.rotations.schedule = this.rotations.schedule.filter(t => t >= periodStart);

        if (this.rotations.schedule.length > 0) {
            const nextInSchedule = this.rotations.schedule.find(t => t > this.state.currentTime);
            this.rotations.nextRotationTime = nextInSchedule || null;
        }
    }

    /**
     * Make emergency substitution
     */
    emergencySubstitution(playerOff, playerOn) {
        if (!this.players.field.includes(playerOff)) {
            return { success: false, error: `${playerOff} is not on field` };
        }

        if (!this.players.bench.includes(playerOn)) {
            return { success: false, error: `${playerOn} is not on bench` };
        }

        const currentTime = this.state.currentTime;

        // Remove from field
        const fieldIdx = this.players.field.indexOf(playerOff);
        this.players.field.splice(fieldIdx, 1);
        this.players.bench.push(playerOff);
        this.players.stintStart[playerOff] = null;

        // Add to field
        const benchIdx = this.players.bench.indexOf(playerOn);
        this.players.bench.splice(benchIdx, 1);
        this.players.field.push(playerOn);
        this.players.stintStart[playerOn] = currentTime;

        // Record
        this.rotations.history.push({
            time: currentTime,
            off: [playerOff],
            on: [playerOn],
            emergency: true
        });

        this.validatePlayerState();

        console.log(`🚨 Emergency sub: ${playerOff} OFF, ${playerOn} ON`);

        return { success: true };
    }

    /**
     * Remove player from game
     */
    removePlayer(playerName) {
        if (this.players.removed.has(playerName)) {
            return { success: false, error: 'Player already removed' };
        }

        const wasOnField = this.players.field.includes(playerName);

        if (wasOnField) {
            const idx = this.players.field.indexOf(playerName);
            this.players.field.splice(idx, 1);

            // Auto-sub if bench available
            if (this.players.bench.length > 0) {
                const sub = this.players.bench.shift();
                this.players.field.push(sub);
                this.players.stintStart[sub] = this.state.currentTime;
            }
        } else {
            const idx = this.players.bench.indexOf(playerName);
            if (idx !== -1) {
                this.players.bench.splice(idx, 1);
            }
        }

        this.players.removed.add(playerName);
        this.players.stintStart[playerName] = null;

        this.recalculateSchedule();
        this.validatePlayerState();

        console.log(`🚫 Player ${playerName} removed`);

        return { success: true, wasOnField };
    }

    /**
     * Return player to game
     */
    returnPlayer(playerName) {
        if (!this.players.removed.has(playerName)) {
            return { success: false, error: 'Player not removed' };
        }

        this.players.removed.delete(playerName);
        this.players.bench.push(playerName);

        this.recalculateSchedule();

        console.log(`✅ Player ${playerName} returned`);

        return { success: true };
    }

    /**
     * Recalculate rotation schedule
     */
    recalculateSchedule() {
        if (this.optimizer) {
            this.optimizer.recalculateDynamicTargets(
                this.players.all.length - this.players.removed.size,
                { resetLastSub: false }
            );
        } else {
            this.generateBasicSchedule();
        }
    }

    /**
     * Record a try
     */
    recordTry(playerName) {
        if (!this.players.field.includes(playerName)) {
            return { success: false, error: 'Player not on field' };
        }

        this.scoring.home++;
        this.scoring.playerTries[playerName] = (this.scoring.playerTries[playerName] || 0) + 1;

        console.log(`🏉 Try scored by ${playerName}!`);

        return { success: true, total: this.scoring.home };
    }

    /**
     * Update opposition score
     */
    updateOppositionScore(delta) {
        this.scoring.away = Math.max(0, this.scoring.away + delta);
        return this.scoring.away;
    }

    /**
     * Format time helper
     */
    formatTime(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Get current game state
     */
    getState() {
        if (this._stateNeedsValidation) {
            this.validatePlayerState();
            this._stateNeedsValidation = false;
        }

        return {
            ...this.state,
            players: {
                all: [...this.players.all],
                field: [...this.players.field],
                bench: [...this.players.bench],
                removed: [...this.players.removed],
                minutes: { ...this.players.minutes },
                benchMinutes: { ...this.players.benchMinutes }
            },
            rotations: {
                pending: this.rotations.pending,
                pendingOff: [...this.rotations.pendingOff],
                pendingOn: [...this.rotations.pendingOn],
                nextRotationTime: this.rotations.nextRotationTime,
                history: this.rotations.history.length
            },
            scoring: { ...this.scoring },
            config: { ...this.config },
            formatted: {
                currentTime: this.formatTime(this.state.currentTime),
                periodElapsed: this.formatTime(this.state.periodElapsed),
                periodRemaining: this.formatTime(this.config.periodLength - this.state.periodElapsed),
                nextRotation: this.rotations.nextRotationTime
                    ? this.formatTime(this.rotations.nextRotationTime - this.state.currentTime)
                    : '--:--'
            }
        };
    }

    /**
     * Get complete game stats for reporting/email
     * @returns {Object} Complete game statistics including times and scores
     */
    getStats() {
        const stats = {
            players: {},
            totalPlayers: this.players.all.length,
            homeScore: this.scoring.home || 0,
            awayScore: this.scoring.away || 0,
            homeTeamName: this.scoring.homeTeamName || 'Home',
            awayTeamName: this.scoring.awayTeamName || 'Opposition',
            totalGameTime: this.state.currentTime,
            variance: 0,
            averageMinutes: 0
        };

        // Build player stats
        const activePlayers = this.players.all.filter(p => !this.players.removed.has(p));
        let totalMinutes = 0;
        const playTimes = [];

        activePlayers.forEach(player => {
            const minutes = this.players.minutes[player] || 0;
            const benchMinutes = this.players.benchMinutes[player] || 0;
            const tries = this.scoring.playerTries[player] || 0;

            stats.players[player] = {
                minutes: minutes,
                benchMinutes: benchMinutes,
                tries: tries,
                onField: this.players.field.includes(player),
                onBench: this.players.bench.includes(player)
            };

            totalMinutes += minutes;
            playTimes.push(minutes);
        });

        // Calculate variance
        if (playTimes.length > 0) {
            const mean = playTimes.reduce((a, b) => a + b, 0) / playTimes.length;
            const squaredDiffs = playTimes.map(time => Math.pow(time - mean, 2));
            const varianceValue = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / playTimes.length;
            stats.variance = Math.round(Math.sqrt(varianceValue)); // Standard deviation
        }

        stats.averageMinutes = activePlayers.length > 0 ? totalMinutes / activePlayers.length : 0;

        return stats;
    }

    /**
     * Set callback
     */
    setCallback(name, fn) {
        if (this.callbacks.hasOwnProperty(name)) {
            this.callbacks[name] = fn;
        }
    }

    /**
     * Reset game
     */
    reset() {
        this.stop();

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
            stintStart: {}
        };

        this.rotations = {
            pending: false,
            pendingOff: [],
            pendingOn: [],
            nextRotationTime: null,
            schedule: [],
            history: []
        };

        this.scoring = {
            home: 0,
            away: 0,
            playerTries: {}
        };

        this.optimizer = null;

        console.log('🔄 Game reset');
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = OztagGameEngine;
}

if (typeof window !== 'undefined') {
    window.OztagGameEngine = OztagGameEngine;
    console.log('🏉 Oztag Game Engine v1.0 loaded');
}
