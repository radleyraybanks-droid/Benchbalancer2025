/**
 * AFL Interval Optimizer - Line Rotation Algorithm
 * Adapted from Basketball Interval Optimizer for AFL-specific gameplay
 * Version 1.0 - Hybrid Algorithm with Line-Based Rotations
 *
 * @fileoverview Core substitution optimization algorithm for AFL games.
 * Uses a 4-value fatigue tracking system and urgency-based scheduling.
 * Supports 9-15 players on field with rolling interchange.
 */

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================
export const OPTIMIZER_DEFAULTS = {
    // Field Configuration (AFL uses more players than basketball)
    FIELD_SPOTS: 12,           // Default for U11-U12 (configurable 9-15)
    DEFAULT_TOTAL_PLAYERS: 18, // Typical squad size

    // Timing (in seconds) - BASE values for 12-minute quarter (720 seconds)
    BASE_PERIOD_LENGTH: 720,   // 12 minutes reference (junior AFL)
    FINAL_NO_SUB_WINDOW: 30,   // No subs in final 30s of quarter
    MIN_SUB_GAP_DEFAULT: 90,   // 90 seconds between subs (AFL is faster)
    CHECK_INTERVAL: 15,
    LOOK_AHEAD_WINDOW: 45,

    // Adaptive Timing Base Values (for 12-minute reference quarter)
    BASE_MIN_FIRST_SUB_TIME: 90,     // 1.5 minutes minimum before first sub
    BASE_NEAR_BREAK_PROTECTION: 60,   // 60 seconds before break = no new subs
    BASE_MIN_STINT_DURATION: 45,      // Minimum 45 seconds on field

    // Stint Limits (in seconds) - AFL has shorter stints due to rolling interchange
    MIN_FIELD_STINT: 90,       // Minimum 1.5 minutes on field
    MAX_FIELD_STINT: 300,      // Maximum 5 minutes on field

    // Variance Control
    VARIANCE_GOAL: 45,         // Tighter variance goal for AFL (more players)
    MAX_EARLY_VARIANCE_MULTIPLIER: 3,

    // Fatigue System
    FATIGUE_THRESHOLD: 0.8,

    // Game Progress Phases (Three-Phase Management)
    GAME_PROGRESS: {
        EARLY: 0.55,       // 0-55% = Early game (more relaxed)
        MID: 0.80,         // 55-80% = Mid game
        LATE: 0.80,        // 80-100% = Late game (tighter control)
        END_GAME: 0.92,
    },

    // Ideal Shifts
    DEFAULT_IDEAL_SHIFTS: 5,   // AFL has more rotations
    MAX_IDEAL_SHIFTS: 8,
    MIN_IDEAL_SHIFTS: 3,

    // Break Configuration
    MAX_SUBS_DURING_PLAY: 3,   // AFL allows more rolling subs
    MAX_SUBS_AT_BREAK: 15,     // Unlimited at quarter breaks
};

// Merge with global config if available
const CONFIG = (typeof window !== 'undefined' && window.GameConfig?.AFL_DEFAULTS)
    ? { ...OPTIMIZER_DEFAULTS, ...window.GameConfig.AFL_DEFAULTS }
    : OPTIMIZER_DEFAULTS;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * @typedef {Object} PlayerState
 * @property {string} status - 'On_Field', 'On_Bench', or 'Removed'
 * @property {number} totalTimePlayed - Cumulative playing time in seconds
 * @property {number} currentFieldStint - Current stint duration on field
 * @property {number} currentBenchStint - Current stint duration on bench
 * @property {number} totalBenchTime - Cumulative bench time in seconds
 * @property {boolean} isOnField - Whether player is currently on field
 * @property {string} currentLine - Current line assignment (Ruck/Mid/Fwd/Back)
 */

/**
 * @typedef {Object} Rotation
 * @property {number} time - Time of rotation in seconds
 * @property {string[]} off - Players coming off field
 * @property {string[]} on - Players going on field
 * @property {string} [reason] - Reason for rotation
 */

// ============================================================================
// MAIN CLASS
// ============================================================================

export class AFLIntervalOptimizer {
    /**
     * Create a new AFL Interval Optimizer
     * @param {Object} config - Configuration options
     */
    constructor(config = {}) {
        // Core configuration
        this.totalPlayers = config.totalPlayers || CONFIG.DEFAULT_TOTAL_PLAYERS;
        this.fieldSpots = config.fieldSpots || CONFIG.FIELD_SPOTS;
        this.benchSpots = this.totalPlayers - this.fieldSpots;
        this.gameLength = config.gameLength || 2880; // 4 x 12 min = 48 min
        this.periodLength = config.periodLength || 720;
        this.numPeriods = config.numPeriods || 4;

        if (!this.numPeriods && this.periodLength) {
            this.numPeriods = Math.max(1, Math.round(this.gameLength / this.periodLength));
        }

        this.finalNoSubWindow = config.finalNoSubWindow || CONFIG.FINAL_NO_SUB_WINDOW;

        // Hybrid algorithm configuration
        this.manualIdealShifts = Number.isFinite(config.idealShiftsPerPlayer) ? config.idealShiftsPerPlayer : null;
        this.idealShiftsPerPlayer = this.manualIdealShifts || this.convertSubsToShifts(config.subsPerRotation || 2);
        this.varianceGoal = config.varianceGoal || CONFIG.VARIANCE_GOAL;
        this.maxEarlyVariance = Math.max(this.varianceGoal, this.varianceGoal * CONFIG.MAX_EARLY_VARIANCE_MULTIPLIER);
        this.lookAheadWindow = config.lookAheadWindow || CONFIG.LOOK_AHEAD_WINDOW;
        this.varianceThreshold = this.maxEarlyVariance;

        // Adaptive minimum gap between substitutions (AFL has faster rotations)
        this.manualMinSubGap = Number.isFinite(config.minSubstitutionGap) ? config.minSubstitutionGap : null;
        this.minSubstitutionGap = this.manualMinSubGap || Math.max(CONFIG.MIN_SUB_GAP_DEFAULT, this.gameLength / 20);
        this.lastSubstitutionTime = -this.minSubstitutionGap;
        this.quarterBreakRotationDone = [false, false, false, false];

        // Check interval
        this.checkInterval = CONFIG.CHECK_INTERVAL;
        this.numIntervals = Math.floor(this.gameLength / this.checkInterval);

        // State tracking
        this.players = [];
        this.playerState = {};
        this.currentTime = 0;
        this.removedPlayers = new Set();

        // Prorated constraints
        this.proratedMaxFieldStint = 0;
        this.proratedMaxBenchStint = 0;
        this.targetPlayingTime = 0;

        // Legacy compatibility
        this.subsPerRotation = config.subsPerRotation || 2;
        this.minRotationGapSec = config.minRotationGapSec || CONFIG.MIN_SUB_GAP_DEFAULT;
        this.intervalDuration = this.checkInterval;
        this.playerSeconds = {};
        this.currentPlan = null;
        this._tempo = 'balanced';

        // Calculate adaptive timings
        this.adaptiveTimings = this.calculateAdaptiveTimings(this.periodLength || this.gameLength / 4);

        this.recalculateDynamicTargets(this.totalPlayers, { initial: true, resetLastSub: true, suppressLog: true });

        console.log('🏈 AFL Interval Optimizer v1.0 - Hybrid Algorithm with Line Rotations');
        console.log(`   Config: ${this.totalPlayers} players, ${this.fieldSpots} field spots`);
        console.log(`   Variance goal: ${this.varianceGoal}s, Check interval: ${this.checkInterval}s`);
        console.log(`   Gap constraint: ${this.formatTime(this.minSubstitutionGap)} minimum between substitutions`);
    }

    /**
     * Calculate adaptive timing constants based on period length
     */
    calculateAdaptiveTimings(periodLength) {
        const basePeriod = CONFIG.BASE_PERIOD_LENGTH || 720;
        const scaleFactor = periodLength / basePeriod;

        const minFirstSubTime = Math.max(15, Math.round(90 * scaleFactor));
        const nearBreakProtection = Math.max(10, Math.round(60 * scaleFactor));
        const minSubGap = Math.max(20, Math.round(90 * scaleFactor));
        const minStintDuration = Math.max(15, Math.round(45 * scaleFactor));
        const lookAheadWindow = Math.max(30, Math.round(60 * scaleFactor));

        return {
            scaleFactor,
            minFirstSubTime,
            nearBreakProtection,
            minSubGap,
            minStintDuration,
            lookAheadWindow,
            periodLength,
            basePeriod
        };
    }

    /**
     * Calculate projected end-game variance
     */
    calculateProjectedEndVariance(availablePlayers, currentField = null, currentBench = null) {
        const activePlayers = availablePlayers.filter(p => !this.removedPlayers.has(p));
        if (activePlayers.length === 0) {
            return { projectedVariance: 0, isHealthy: true };
        }

        const remainingTime = Math.max(0, this.gameLength - this.currentTime);
        const currentPlayTimes = {};

        activePlayers.forEach(player => {
            currentPlayTimes[player] = this.playerState[player]?.totalTimePlayed || 0;
        });

        const projectedPlayTimes = { ...currentPlayTimes };
        const remainingFieldTime = remainingTime * this.fieldSpots;
        const projectedAddPerPlayer = remainingFieldTime / activePlayers.length;

        activePlayers.forEach(player => {
            projectedPlayTimes[player] += projectedAddPerPlayer;
        });

        const projectedValues = Object.values(projectedPlayTimes);
        const projectedMin = Math.min(...projectedValues);
        const projectedMax = Math.max(...projectedValues);
        const projectedVariance = projectedMax - projectedMin;

        const isHealthy = projectedVariance <= this.varianceGoal;
        const needsCorrection = projectedVariance > this.varianceGoal;
        const isUrgent = projectedVariance > this.varianceGoal * 1.5;

        return {
            projectedVariance: Math.round(projectedVariance),
            currentVariance: Math.round(this.calculateRealTimeVariance(activePlayers)),
            remainingTime,
            isHealthy,
            needsCorrection,
            isUrgent,
            projectedPlayTimes
        };
    }

    /**
     * Check if balance correction should be triggered
     */
    shouldTriggerBalanceCorrection(availablePlayers) {
        const projection = this.calculateProjectedEndVariance(availablePlayers);

        if (projection.projectedVariance > this.varianceGoal) {
            const gameProgress = this.currentTime / this.gameLength;
            const urgency = projection.isUrgent ? 'urgent' : 'moderate';

            return {
                trigger: true,
                reason: `Projected variance ${projection.projectedVariance}s > goal ${this.varianceGoal}s`,
                urgency,
                gameProgress,
                projection
            };
        }

        return { trigger: false, projection };
    }

    /**
     * Get current game phase
     */
    getCurrentGamePhase() {
        const progress = this.currentTime / this.gameLength;

        if (progress < CONFIG.GAME_PROGRESS.EARLY) {
            return 'early';
        } else if (progress < CONFIG.GAME_PROGRESS.MID) {
            return 'mid';
        } else {
            return 'late';
        }
    }

    /**
     * Get phase-appropriate constraints
     */
    getPhaseConstraints() {
        const phase = this.getCurrentGamePhase();
        const currentVariance = this.calculateRealTimeVariance(
            this.players.filter(p => !this.removedPlayers.has(p))
        );

        switch (phase) {
            case 'early':
                return {
                    phase: 'early',
                    gapMultiplier: 1.0,
                    minStintMultiplier: 1.0,
                    allowShortStints: false,
                    maxSubsPerRotation: CONFIG.MAX_SUBS_DURING_PLAY || 3
                };

            case 'mid':
                const midRelaxed = currentVariance > 35;
                return {
                    phase: 'mid',
                    gapMultiplier: midRelaxed ? 0.85 : 1.0,
                    minStintMultiplier: midRelaxed ? 0.9 : 1.0,
                    allowShortStints: midRelaxed,
                    maxSubsPerRotation: CONFIG.MAX_SUBS_DURING_PLAY || 3
                };

            case 'late':
                const lateUrgent = currentVariance > 25;
                return {
                    phase: 'late',
                    gapMultiplier: lateUrgent ? 0.6 : 0.7,
                    minStintMultiplier: 0.5,
                    allowShortStints: true,
                    maxSubsPerRotation: CONFIG.MAX_SUBS_DURING_PLAY || 3
                };

            default:
                return {
                    phase: 'unknown',
                    gapMultiplier: 1.0,
                    minStintMultiplier: 1.0,
                    allowShortStints: false,
                    maxSubsPerRotation: 3
                };
        }
    }

    /**
     * Convert legacy subsPerRotation to idealShiftsPerPlayer
     */
    convertSubsToShifts(subsPerRotation) {
        if (subsPerRotation >= 3) {
            return 7;
        } else if (subsPerRotation >= 2) {
            return 5;
        } else {
            return 4;
        }
    }

    /**
     * Recalculate dynamic targets based on roster size
     */
    recalculateDynamicTargets(activePlayerCount = null, options = {}) {
        const suppressLog = options.suppressLog || false;
        const resetLastSub = options.resetLastSub || false;

        const rosterSize = Math.max(
            activePlayerCount || (this.players?.length || 0) || this.totalPlayers,
            this.fieldSpots
        );
        const benchPlayers = Math.max(0, rosterSize - this.fieldSpots);

        const protectedTime = this.getProtectedTime();
        const effectivePlayableTime = Math.max(1, this.gameLength - protectedTime);
        const targetSecondsPerPlayer = (this.gameLength * this.fieldSpots) / rosterSize;
        this.targetPlayingTime = targetSecondsPerPlayer;

        const desiredFieldStint = this.clamp(
            targetSecondsPerPlayer / 3,
            90,
            Math.max(120, Math.min(300, targetSecondsPerPlayer))
        );

        let idealShifts = this.manualIdealShifts;
        if (!Number.isFinite(idealShifts) || idealShifts <= 0) {
            idealShifts = this.determineIdealShiftCount({
                benchPlayers,
                targetSecondsPerPlayer,
                desiredFieldStint,
                effectivePlayableTime
            });
        }
        this.idealShiftsPerPlayer = Math.max(benchPlayers === 0 ? 1 : 3, idealShifts);

        const playersPerRotation = benchPlayers === 0 ? 0 : Math.min(3, benchPlayers);
        const entriesNeeded = benchPlayers * this.idealShiftsPerPlayer;
        const rotationsNeeded = playersPerRotation > 0 ? Math.ceil(entriesNeeded / playersPerRotation) : 0;
        const rawGap = rotationsNeeded > 0 ? effectivePlayableTime / rotationsNeeded : effectivePlayableTime;

        if (this.manualMinSubGap) {
            this.minSubstitutionGap = this.manualMinSubGap;
        } else if (rotationsNeeded === 0) {
            this.minSubstitutionGap = effectivePlayableTime;
        } else {
            const adaptiveGap = this.calculateAdaptiveMinGap(this.gameLength, rosterSize);
            let maxGapCap = Math.max(120, Math.min(300, this.gameLength / 8));
            if (this.gameLength <= 30 * 60) {
                maxGapCap = Math.min(maxGapCap, 75);
            }
            const desiredGap = Math.min(rawGap, adaptiveGap);
            this.minSubstitutionGap = this.clamp(desiredGap, 30, maxGapCap);
        }

        if (resetLastSub) {
            this.lastSubstitutionTime = -this.minSubstitutionGap;
        }

        const shiftCount = Math.max(1, this.idealShiftsPerPlayer);
        const fieldStint = targetSecondsPerPlayer / shiftCount;
        const benchPool = Math.max(0, this.gameLength - targetSecondsPerPlayer);
        const benchStint = benchPlayers > 0 ? benchPool / shiftCount : this.gameLength;

        this.proratedMaxFieldStint = Math.max(
            fieldStint,
            this.checkInterval * 2,
            this.minSubstitutionGap * 0.8
        );
        this.proratedMaxBenchStint = benchPlayers > 0
            ? Math.max(benchStint, this.checkInterval * 2, this.minSubstitutionGap * 0.5)
            : this.gameLength;

        if (!suppressLog) {
            console.log(
                `   Dynamic targets → shifts:${this.idealShiftsPerPlayer}, minGap:${this.formatTime(this.minSubstitutionGap)}, ` +
                `fieldMax:${this.formatTime(this.proratedMaxFieldStint)}, benchMax:${this.formatTime(this.proratedMaxBenchStint)}`
            );
        }
    }

    determineIdealShiftCount({ benchPlayers, targetSecondsPerPlayer, desiredFieldStint, effectivePlayableTime }) {
        if (benchPlayers <= 0) {
            return 1;
        }

        const baseEstimate = this.clamp(
            Math.round(targetSecondsPerPlayer / desiredFieldStint),
            1,
            8
        );

        const candidateSet = new Set();
        for (let up = baseEstimate; up <= 8; up++) candidateSet.add(up);
        for (let down = baseEstimate - 1; down >= 1; down--) candidateSet.add(down);
        if (!candidateSet.size) {
            candidateSet.add(4);
        }

        const candidates = Array.from(candidateSet).sort((a, b) => b - a);
        const playersPerRotation = Math.min(3, benchPlayers);
        const minSpacingTarget = benchPlayers >= 6 ? 75 : 60;

        for (const candidate of candidates) {
            if (candidate <= 0) continue;
            const entries = benchPlayers * candidate;
            const rotationsNeeded = playersPerRotation > 0 ? Math.ceil(entries / playersPerRotation) : 0;
            if (rotationsNeeded === 0) continue;
            const spacing = effectivePlayableTime / rotationsNeeded;
            if (spacing >= minSpacingTarget) {
                return candidate;
            }
        }

        return Math.max(1, Math.min(3, baseEstimate || 4));
    }

    getProtectedTime() {
        const periods = this.numPeriods || 4;
        const protectedTotal = this.finalNoSubWindow * periods;
        return Math.min(protectedTotal, this.gameLength * 0.3);
    }

    /**
     * Tempo property for UI compatibility
     */
    get tempo() {
        return this._tempo;
    }

    set tempo(value) {
        this._tempo = value;
        switch (value) {
            case 'aggressive':
                this.varianceGoal = 35;
                this.maxEarlyVariance = Math.max(this.varianceGoal * 3, 105);
                break;
            case 'conservative':
                this.varianceGoal = 55;
                this.maxEarlyVariance = Math.max(this.varianceGoal * 3, 165);
                break;
            default:
                this.varianceGoal = 45;
                this.maxEarlyVariance = Math.max(this.varianceGoal * 3, 135);
        }
        this.varianceThreshold = this.getDynamicVarianceThreshold();
        console.log(`Tempo: ${value}, variance goal ${this.varianceGoal}s (early cap ${this.maxEarlyVariance}s)`);
    }

    getDynamicVarianceThreshold(referenceTime = this.currentTime) {
        if (!this.gameLength) {
            return this.varianceGoal;
        }

        const progress = Math.min(1, Math.max(0, referenceTime / this.gameLength));
        const earlyCap = Math.max(this.varianceGoal, this.maxEarlyVariance);
        const allowedRange = earlyCap - this.varianceGoal;
        const dynamicThreshold = earlyCap - (allowedRange * progress);

        return Math.max(this.varianceGoal, dynamicThreshold);
    }

    /**
     * Initialize with player roster
     */
    initialize(players, currentState = null) {
        this.players = Array.isArray(players) ? [...players] : [];
        this.playerSeconds = {};

        if (this.players.length < this.fieldSpots) {
            return { success: false, error: 'Not enough players for field spots' };
        }

        this.recalculateDynamicTargets(this.players.length, { resetLastSub: true });

        // Initialize player state with 4-value tracking
        this.playerState = {};
        this.players.forEach(player => {
            this.playerSeconds[player] = 0;
            this.playerState[player] = {
                status: 'On_Bench',
                totalTimePlayed: 0,
                currentFieldStint: 0,
                currentBenchStint: 0,
                totalBenchTime: 0,
                isOnField: false,
                currentLine: 'Midfield',
                currentStintDuration: 0
            };
        });

        // Set initial field/bench state
        const initialField = currentState?.onField || this.players.slice(0, this.fieldSpots);
        const initialBench = currentState?.onBench || this.players.slice(this.fieldSpots);

        initialField.forEach(player => {
            if (this.playerState[player]) {
                this.playerState[player].status = 'On_Field';
                this.playerState[player].isOnField = true;
            }
        });

        initialBench.forEach(player => {
            if (this.playerState[player]) {
                this.playerState[player].status = 'On_Bench';
                this.playerState[player].isOnField = false;
            }
        });

        console.log(`✅ AFL Optimizer initialized: ${this.players.length} players, target ${Math.floor(this.targetPlayingTime / 60)}m each`);

        this.quarterBreakRotationDone = [false, false, false, false];
        this.removedPlayers.clear();

        return { success: true, totalPlayers: this.players.length };
    }

    /**
     * Generate rotation plan using HYBRID ALGORITHM
     */
    generatePlan(fromInterval = 0, unavailablePlayers = [], currentField = null, currentBench = null, playTimes = null) {
        const startTime = fromInterval * this.checkInterval;
        this.currentTime = startTime;

        let availablePlayers;
        if (currentField || currentBench) {
            const derivedSet = new Set();
            (currentField || []).forEach(player => {
                if (!this.removedPlayers.has(player) && !unavailablePlayers.includes(player)) {
                    derivedSet.add(player);
                }
            });
            (currentBench || []).forEach(player => {
                if (!this.removedPlayers.has(player) && !unavailablePlayers.includes(player)) {
                    derivedSet.add(player);
                }
            });

            availablePlayers = [...derivedSet];
            if (availablePlayers.length < this.fieldSpots) {
                availablePlayers = this.players.filter(p => !unavailablePlayers.includes(p) && !this.removedPlayers.has(p));
            }
        } else {
            availablePlayers = this.players.filter(p => !unavailablePlayers.includes(p) && !this.removedPlayers.has(p));
        }

        if (availablePlayers.length < this.fieldSpots) {
            return {
                rotations: [],
                schedule: [],
                targetMinutes: 0,
                expectedVariance: 0,
                error: 'Not enough available players'
            };
        }

        this.recalculateDynamicTargets(availablePlayers.length, { suppressLog: true });

        let field = currentField ? [...currentField] : availablePlayers.slice(0, this.fieldSpots);
        let bench = currentBench ? [...currentBench] : availablePlayers.slice(this.fieldSpots);

        if (playTimes) {
            availablePlayers.forEach(player => {
                if (this.playerState[player]) {
                    this.playerState[player].totalTimePlayed = playTimes[player] || 0;
                    this.playerSeconds[player] = playTimes[player] || 0;
                }
            });
        }

        availablePlayers.forEach(player => {
            if (this.playerState[player]) {
                this.playerState[player].isOnField = field.includes(player);
                this.playerState[player].status = field.includes(player) ? 'On_Field' : 'On_Bench';
                this.playerState[player].currentStintDuration = 0;
            }
        });

        this.quarterBreakRotationDone = [false, false, false, false];

        const rotations = [];

        // HYBRID ALGORITHM MAIN LOOP
        while (this.currentTime < this.gameLength - 20) {
            this.currentTime += this.checkInterval;

            this.updatePlayerStats(field, bench, this.checkInterval);

            const substitution = this.checkForSubstitutions(field, bench, availablePlayers);

            if (substitution) {
                const validPlayersOff = substitution.playersOff.filter(p => field.includes(p));
                const validPlayersOn = substitution.playersOn.filter(p => bench.includes(p));

                if (validPlayersOff.length === 0 || validPlayersOn.length === 0) {
                    console.warn(`⚠️  Skipping invalid substitution at ${this.formatTime(this.currentTime)}`);
                    continue;
                }

                const actualSwaps = Math.min(validPlayersOff.length, validPlayersOn.length);
                const actualPlayersOff = validPlayersOff.slice(0, actualSwaps);
                const actualPlayersOn = validPlayersOn.slice(0, actualSwaps);

                const rotationTime = this.currentTime;

                field = field.filter(p => !actualPlayersOff.includes(p));
                field.push(...actualPlayersOn);

                bench = bench.filter(p => !actualPlayersOn.includes(p));
                bench.push(...actualPlayersOff);

                actualPlayersOff.forEach(player => {
                    if (this.playerState[player]) {
                        this.playerState[player].status = 'On_Bench';
                        this.playerState[player].isOnField = false;
                        this.playerState[player].currentFieldStint = 0;
                        this.playerState[player].currentStintDuration = 0;
                    }
                });

                actualPlayersOn.forEach(player => {
                    if (this.playerState[player]) {
                        this.playerState[player].status = 'On_Field';
                        this.playerState[player].isOnField = true;
                        this.playerState[player].currentBenchStint = 0;
                        this.playerState[player].currentStintDuration = 0;
                    }
                });

                this.lastSubstitutionTime = rotationTime;

                rotations.push({
                    time: rotationTime,
                    off: [...actualPlayersOff],
                    on: [...actualPlayersOn],
                    reason: substitution.reason
                });

                console.log(`🔄 ${substitution.reason} at ${this.formatTime(rotationTime)}`);
            }
        }

        availablePlayers.forEach(player => {
            this.playerSeconds[player] = this.playerState[player]?.totalTimePlayed || 0;
        });

        const variance = this.calculateRealTimeVariance(availablePlayers);

        this.currentPlan = {
            rotations,
            targetMinutes: Math.round(this.targetPlayingTime / 60),
            expectedVariance: Math.round(variance)
        };

        return {
            rotations,
            schedule: rotations.map(r => r.time),
            targetMinutes: Math.round(this.targetPlayingTime / 60),
            expectedVariance: Math.round(variance),
            playerMinutes: this.getPlayerMinutes(availablePlayers),
            plan: rotations,
            debugInfo: {
                algorithm: 'hybrid-afl',
                checkInterval: this.checkInterval,
                idealShifts: this.idealShiftsPerPlayer,
                varianceThreshold: this.varianceThreshold,
                actualRotations: rotations.length
            }
        };
    }

    /**
     * Update player statistics for check interval
     */
    updatePlayerStats(field, bench, elapsed) {
        field.forEach(player => {
            if (this.playerState[player]) {
                this.playerState[player].totalTimePlayed += elapsed;
                this.playerState[player].currentFieldStint += elapsed;
                this.playerState[player].currentBenchStint = 0;
                this.playerState[player].currentStintDuration += elapsed;
                this.playerSeconds[player] = this.playerState[player].totalTimePlayed;
            }
        });

        bench.forEach(player => {
            if (this.playerState[player]) {
                this.playerState[player].totalBenchTime += elapsed;
                this.playerState[player].currentBenchStint += elapsed;
                this.playerState[player].currentFieldStint = 0;
                this.playerState[player].currentStintDuration += elapsed;
            }
        });
    }

    /**
     * Check for substitutions - CORE ALGORITHM
     */
    checkForSubstitutions(field, bench, availablePlayers) {
        // Step 0: First-sub timing guard
        if (!this.isFirstSubAllowed() && this.lastSubstitutionTime < 0) {
            return null;
        }

        const timeSinceLastSub = this.currentTime - this.lastSubstitutionTime;
        const gameProgress = this.currentTime / this.gameLength;
        const isEndGame = gameProgress >= 0.92;
        const isQuarterBreak = this.isQuarterBreak();
        const phaseConstraints = this.getPhaseConstraints();

        // Near-break protection
        const nearBreakCheck = this.isNearBreak();
        if (nearBreakCheck.nearBreak && !isQuarterBreak) {
            return null;
        }

        const remainingWindowsEstimate = Math.max(1, Math.ceil((this.gameLength - this.currentTime) / Math.max(this.minSubstitutionGap, this.checkInterval)));
        const currentVarianceSeconds = this.calculateRealTimeVariance(availablePlayers);
        const currentMaxDeviationMinutes = currentVarianceSeconds / 60;

        const baseMinGap = this.getEffectiveMinGap(
            this.minSubstitutionGap,
            this.currentTime,
            this.gameLength,
            currentMaxDeviationMinutes,
            remainingWindowsEstimate
        );
        const minGap = baseMinGap * phaseConstraints.gapMultiplier;

        const meanPlayingTime = availablePlayers.length > 0
            ? (this.fieldSpots * this.currentTime) / availablePlayers.length
            : 0;

        // Get candidates
        const urgentSubOut = this.getUrgentFieldPlayers(field);
        const urgentSubIn = this.getUrgentBenchPlayers(bench);
        const proactiveSubOut = this.getProactiveFieldCandidates(field, meanPlayingTime);
        const proactiveSubIn = this.getProactiveBenchCandidates(bench, meanPlayingTime);
        const upcomingSubOut = this.getUpcomingFieldPlayers(field, this.lookAheadWindow);
        const upcomingSubIn = this.getUpcomingBenchPlayers(bench, this.lookAheadWindow);

        const currentQuarter = this.getCurrentQuarter();
        const treatAsBreakWindow = isQuarterBreak && !this.quarterBreakRotationDone[currentQuarter - 1];

        // Quarter break handling
        if (isQuarterBreak && !this.quarterBreakRotationDone[currentQuarter - 1]) {
            const breakRotation = this.calculateBreakRotations(field, bench, availablePlayers);
            this.quarterBreakRotationDone[currentQuarter - 1] = true;
            if (breakRotation) {
                return breakRotation;
            }
        }

        // Gap constraint
        if (timeSinceLastSub < minGap && !treatAsBreakWindow) {
            if (phaseConstraints.allowShortStints && urgentSubOut.length > 0 && urgentSubIn.length > 0) {
                console.log(`🚨 LATE GAME: Overriding gap for urgent balance correction`);
            } else {
                return null;
            }
        }

        const realTimeVariance = currentVarianceSeconds;
        const varianceTrigger = this.getDynamicVarianceThreshold();
        this.varianceThreshold = varianceTrigger;

        const balanceCheck = this.shouldTriggerBalanceCorrection(availablePlayers);
        const maxSubs = phaseConstraints.maxSubsPerRotation;

        if (urgentSubOut.length > 0 || urgentSubIn.length > 0) {
            return this.createBatchSubstitution(
                { urgent: urgentSubOut, upcoming: upcomingSubOut, proactive: proactiveSubOut },
                { urgent: urgentSubIn, upcoming: upcomingSubIn, proactive: proactiveSubIn },
                'urgent',
                maxSubs
            );
        }

        if (realTimeVariance > varianceTrigger || (balanceCheck.trigger && phaseConstraints.phase === 'late')) {
            return this.createBatchSubstitution(
                { upcoming: upcomingSubOut, proactive: proactiveSubOut },
                { upcoming: upcomingSubIn, proactive: proactiveSubIn },
                'variance-correction',
                maxSubs
            );
        }

        const earlyTrigger = this.shouldTriggerEarlySub(
            this.currentTime,
            this.gameLength,
            minGap,
            field,
            availablePlayers
        );

        if (earlyTrigger.trigger) {
            return this.createBatchSubstitution(
                { upcoming: upcomingSubOut, proactive: proactiveSubOut },
                { upcoming: upcomingSubIn, proactive: proactiveSubIn },
                'proactive',
                maxSubs
            );
        }

        if (upcomingSubOut.length > 0 && (upcomingSubIn.length > 0 || proactiveSubIn.length > 0)) {
            return this.createBatchSubstitution(
                { upcoming: upcomingSubOut, proactive: proactiveSubOut },
                { upcoming: upcomingSubIn, proactive: proactiveSubIn },
                'scheduled-balance',
                maxSubs
            );
        }

        return null;
    }

    /**
     * Get urgent field players needing substitution
     */
    getUrgentFieldPlayers(field) {
        return field.filter(player => {
            const state = this.playerState[player];
            return state.currentFieldStint >= this.proratedMaxFieldStint;
        }).sort((a, b) => {
            return this.playerState[b].currentFieldStint - this.playerState[a].currentFieldStint;
        });
    }

    /**
     * Get urgent bench players ready to play
     */
    getUrgentBenchPlayers(bench) {
        return bench.filter(player => {
            const state = this.playerState[player];
            return state.currentBenchStint >= this.proratedMaxBenchStint;
        }).sort((a, b) => {
            const benchStintDiff = this.playerState[b].currentBenchStint - this.playerState[a].currentBenchStint;
            if (benchStintDiff !== 0) return benchStintDiff;
            return this.playerState[b].totalBenchTime - this.playerState[a].totalBenchTime;
        });
    }

    /**
     * Get proactive field substitution candidates
     */
    getProactiveFieldCandidates(field, meanPlayingTime) {
        return field
            .map(player => ({
                player,
                fatigueScore: (this.playerState[player].totalTimePlayed - meanPlayingTime) +
                    (this.playerState[player].currentFieldStint * 0.5)
            }))
            .sort((a, b) => b.fatigueScore - a.fatigueScore)
            .map(item => item.player);
    }

    /**
     * Get proactive bench substitution candidates
     */
    getProactiveBenchCandidates(bench, meanPlayingTime) {
        return bench
            .map(player => ({
                player,
                readinessScore: (meanPlayingTime - this.playerState[player].totalTimePlayed) +
                    (this.playerState[player].currentBenchStint * 0.3) +
                    (this.playerState[player].totalBenchTime * 0.1)
            }))
            .sort((a, b) => b.readinessScore - a.readinessScore)
            .map(item => item.player);
    }

    getUpcomingFieldPlayers(field, window) {
        if (!Array.isArray(field) || window <= 0) return [];

        return field
            .map(player => {
                const state = this.playerState[player];
                if (!state) return null;
                const timeRemaining = this.proratedMaxFieldStint - state.currentFieldStint;
                return { player, timeRemaining };
            })
            .filter(item => item && item.timeRemaining > 0 && item.timeRemaining <= window)
            .sort((a, b) => a.timeRemaining - b.timeRemaining)
            .map(item => item.player);
    }

    getUpcomingBenchPlayers(bench, window) {
        if (!Array.isArray(bench) || window <= 0) return [];

        return bench
            .map(player => {
                const state = this.playerState[player];
                if (!state) return null;
                const timeRemaining = this.proratedMaxBenchStint - state.currentBenchStint;
                return { player, timeRemaining };
            })
            .filter(item => item && item.timeRemaining > 0 && item.timeRemaining <= window)
            .sort((a, b) => {
                if (a.timeRemaining !== b.timeRemaining) {
                    return a.timeRemaining - b.timeRemaining;
                }
                return (this.playerState[b.player]?.totalBenchTime || 0) - (this.playerState[a.player]?.totalBenchTime || 0);
            })
            .map(item => item.player);
    }

    /**
     * Check if at quarter break
     */
    isQuarterBreak() {
        if (!this.periodLength) return false;
        const quarterProgress = this.currentTime % this.periodLength;
        return quarterProgress <= 30 && this.currentTime > 30;
    }

    /**
     * Get current quarter (1-4)
     */
    getCurrentQuarter() {
        if (!this.periodLength) return 1;
        return Math.min(4, Math.floor(this.currentTime / this.periodLength) + 1);
    }

    /**
     * Check if near a break
     */
    isNearBreak() {
        if (!this.periodLength) return { nearBreak: false };

        const nearBreakWindow = this.adaptiveTimings?.nearBreakProtection || 60;
        const periodProgress = this.currentTime % this.periodLength;
        const timeToBreak = this.periodLength - periodProgress;

        if (timeToBreak > 0 && timeToBreak <= nearBreakWindow) {
            return {
                nearBreak: true,
                timeToBreak,
                reason: `${Math.round(timeToBreak)}s until quarter break - waiting`
            };
        }

        return { nearBreak: false };
    }

    /**
     * Check if first sub is allowed
     */
    isFirstSubAllowed() {
        const minFirstSubTime = this.adaptiveTimings?.minFirstSubTime || 90;
        return this.currentTime >= minFirstSubTime;
    }

    /**
     * Calculate break rotations for maximum balance
     */
    calculateBreakRotations(field, bench, availablePlayers) {
        if (!Array.isArray(field) || !Array.isArray(bench) || !Array.isArray(availablePlayers)) {
            return null;
        }

        if (availablePlayers.length < this.fieldSpots) {
            return null;
        }

        const currentVariance = this.calculateRealTimeVariance(availablePlayers);
        const remainingTime = this.gameLength - this.currentTime;

        console.log(`🔄 Quarter break optimization: current variance ${currentVariance}s, remaining time ${this.formatTime(remainingTime)}`);

        if (currentVariance <= 20) {
            return this.createQuarterBreakRotation(field, bench, availablePlayers);
        }

        const avgPlayTime = availablePlayers.reduce((sum, p) =>
            sum + (this.playerState[p]?.totalTimePlayed || 0), 0) / availablePlayers.length;

        const aboveAverage = field
            .map(player => ({
                player,
                time: this.playerState[player]?.totalTimePlayed || 0,
                deviation: (this.playerState[player]?.totalTimePlayed || 0) - avgPlayTime
            }))
            .filter(p => p.deviation > 10)
            .sort((a, b) => b.deviation - a.deviation);

        const belowAverage = bench
            .map(player => ({
                player,
                time: this.playerState[player]?.totalTimePlayed || 0,
                deviation: avgPlayTime - (this.playerState[player]?.totalTimePlayed || 0)
            }))
            .filter(p => p.deviation > 10)
            .sort((a, b) => b.deviation - a.deviation);

        const maxSwaps = Math.min(
            CONFIG.MAX_SUBS_AT_BREAK || 15,
            aboveAverage.length,
            belowAverage.length
        );

        if (maxSwaps === 0) {
            return this.createQuarterBreakRotation(field, bench, availablePlayers);
        }

        const playersOff = aboveAverage.slice(0, maxSwaps).map(p => p.player);
        const playersOn = belowAverage.slice(0, maxSwaps).map(p => p.player);

        console.log(`   Quarter break optimization: ${maxSwaps} swaps`);

        return {
            playersOff,
            playersOn,
            reason: `quarter-break-optimization (${maxSwaps} swaps)`
        };
    }

    /**
     * Create quarter break rotation
     */
    createQuarterBreakRotation(field, bench, availablePlayers) {
        if (!Array.isArray(field) || !Array.isArray(availablePlayers) || availablePlayers.length < this.fieldSpots) {
            return null;
        }

        const lowestMinutePlayers = [...availablePlayers].sort((a, b) => {
            const aTime = this.playerState[a]?.totalTimePlayed || 0;
            const bTime = this.playerState[b]?.totalTimePlayed || 0;
            return aTime - bTime;
        }).slice(0, this.fieldSpots);

        const desiredSet = new Set(lowestMinutePlayers);
        const playersOff = field.filter(player => !desiredSet.has(player));
        const playersOn = lowestMinutePlayers.filter(player => !field.includes(player));

        const validPlayersOn = playersOn.filter(player => bench.includes(player));
        const swapsToMake = Math.min(playersOff.length, validPlayersOn.length);

        if (swapsToMake === 0) {
            return null;
        }

        return {
            playersOff: playersOff.slice(0, swapsToMake),
            playersOn: validPlayersOn.slice(0, swapsToMake),
            reason: `quarter-break-refresh (${swapsToMake} players)`
        };
    }

    createBatchSubstitution(outPriority, inPriority, reason, maxSubs = 3) {
        const { urgent: urgentOut = [], upcoming: upcomingOut = [], proactive: proactiveOut = [] } = outPriority || {};
        const { urgent: urgentIn = [], upcoming: upcomingIn = [], proactive: proactiveIn = [] } = inPriority || {};

        const prioritizedOut = [...urgentOut, ...upcomingOut, ...proactiveOut];
        const prioritizedIn = [...urgentIn, ...upcomingIn, ...proactiveIn];

        const uniqueOut = [];
        const seenOut = new Set();
        prioritizedOut.forEach(player => {
            if (!player || seenOut.has(player)) return;
            seenOut.add(player);
            uniqueOut.push(player);
        });

        const uniqueIn = [];
        const seenIn = new Set();
        prioritizedIn.forEach(player => {
            if (!player || seenIn.has(player)) return;
            seenIn.add(player);
            uniqueIn.push(player);
        });

        const subsToMake = Math.min(maxSubs, uniqueOut.length, uniqueIn.length);
        if (subsToMake === 0) {
            return null;
        }

        const playersOff = uniqueOut.slice(0, subsToMake);
        const playersOn = [];

        for (let i = 0; i < uniqueIn.length && playersOn.length < subsToMake; i++) {
            const candidate = uniqueIn[i];
            if (!playersOff.includes(candidate)) {
                playersOn.push(candidate);
            }
        }

        if (playersOn.length < playersOff.length) {
            return null;
        }

        return {
            playersOff,
            playersOn: playersOn.slice(0, playersOff.length),
            reason: `${reason} (${playersOff.length} players)`
        };
    }

    /**
     * Calculate real-time variance
     */
    calculateRealTimeVariance(players) {
        const activePlayers = players.filter(player => !this.removedPlayers.has(player));
        if (activePlayers.length === 0) return 0;

        const playTimes = activePlayers.map(player => this.playerState[player]?.totalTimePlayed || 0);
        const min = Math.min(...playTimes);
        const max = Math.max(...playTimes);

        return max - min;
    }

    calculateAdaptiveMinGap(gameLengthSeconds, totalPlayers) {
        const gameMinutes = Math.max(1, gameLengthSeconds / 60);
        const estimatedWindowsNeeded = Math.max(8, Math.ceil(totalPlayers * 1.5));
        const availableGameTime = Math.max(gameMinutes - 2, gameMinutes * 0.85);
        const idealGapMinutes = availableGameTime / estimatedWindowsNeeded;

        let lowerBound = 1.5;
        let upperBound = 2.5;

        if (gameMinutes <= 30) {
            lowerBound = 1.0;
            upperBound = 2.0;
        } else if (gameMinutes <= 48) {
            lowerBound = 1.5;
            upperBound = 3.0;
        }

        return this.clamp(idealGapMinutes, lowerBound, upperBound) * 60;
    }

    getEffectiveMinGap(standardMinGap, currentTime, gameLength, currentMaxDeviationMinutes, remainingWindows) {
        const progress = currentTime / gameLength;
        let effectiveGap = standardMinGap;

        if (progress < 0.3) {
            return effectiveGap;
        }

        if (progress < 0.6) {
            if (currentMaxDeviationMinutes > 1.0) {
                effectiveGap *= 0.85;
            }
            return effectiveGap;
        }

        if (progress < 0.8) {
            if (currentMaxDeviationMinutes > 0.8) {
                effectiveGap *= 0.75;
            } else if (currentMaxDeviationMinutes > 0.5) {
                effectiveGap *= 0.85;
            }
            return effectiveGap;
        }

        if (remainingWindows <= 4) {
            effectiveGap *= 0.5;
        } else {
            effectiveGap *= 0.65;
        }

        return effectiveGap;
    }

    shouldTriggerEarlySub(currentTime, gameLength, minGap, fieldPlayers, availablePlayers) {
        const progress = currentTime / gameLength;
        if (progress < 0.2) {
            return { trigger: false };
        }

        const activePlayers = availablePlayers.filter(player => !this.removedPlayers.has(player));
        if (!activePlayers.length) {
            return { trigger: false };
        }

        const currentTimes = activePlayers.map(player => this.playerState[player]?.totalTimePlayed || 0);
        const minTime = Math.min(...currentTimes);
        const maxTime = Math.max(...currentTimes);
        const currentMaxDevMinutes = (maxTime - minTime) / 60;

        const projectedTimes = new Map();
        activePlayers.forEach(player => {
            const current = this.playerState[player]?.totalTimePlayed || 0;
            projectedTimes.set(player, current);
        });

        fieldPlayers.forEach(player => {
            const current = projectedTimes.get(player) || 0;
            projectedTimes.set(player, current + minGap);
        });

        const projectedValues = Array.from(projectedTimes.values());
        const projectedMin = Math.min(...projectedValues);
        const projectedMax = Math.max(...projectedValues);
        const projectedMaxDevMinutes = (projectedMax - projectedMin) / 60;

        if (projectedMaxDevMinutes > currentMaxDevMinutes + 0.8) {
            return {
                trigger: true,
                reason: `Projected deviation ${projectedMaxDevMinutes.toFixed(2)} (current ${currentMaxDevMinutes.toFixed(2)})`
            };
        }

        if (progress > 0.85 && projectedMaxDevMinutes > 2.0) {
            return {
                trigger: true,
                reason: `Late-game prevention: projected ${projectedMaxDevMinutes.toFixed(2)}`
            };
        }

        return { trigger: false };
    }

    /**
     * Get player minutes
     */
    getPlayerMinutes(players) {
        const playerMinutes = {};
        players.forEach(player => {
            const seconds = this.playerState[player]?.totalTimePlayed || 0;
            playerMinutes[player] = Math.round(seconds / 60 * 10) / 10;
        });
        return playerMinutes;
    }

    /**
     * Handle deviations and replanning
     */
    handleDeviation(deviationType, deviationData, currentTime) {
        console.log(`🔄 Handling ${deviationType} at ${this.formatTime(currentTime)}`);

        this.currentTime = currentTime;

        const { actualField, actualBench, playTimes } = deviationData;
        const unavailable = deviationData.unavailable || [];
        const removedPlayer = deviationData.player;

        this.syncWithActualState(currentTime, actualField, actualBench, playTimes);

        if (removedPlayer && (deviationType === 'injury' || deviationType === 'foul_out')) {
            this.handlePlayerRemoval(removedPlayer, actualField, actualBench);
        }

        this.lastSubstitutionTime = currentTime;
        const currentQuarter = this.getCurrentQuarter();
        if (currentQuarter >= 1 && currentQuarter <= 4) {
            this.quarterBreakRotationDone[currentQuarter - 1] = true;
        }

        const activePlayerCount = actualField.length + actualBench.length;
        this.recalculateDynamicTargets(activePlayerCount, { suppressLog: false });

        const remainingTime = this.gameLength - currentTime;
        const targetRemaining = (remainingTime * this.fieldSpots) / activePlayerCount;
        console.log(`   New target per player: ${this.formatTime(Math.round(targetRemaining))} remaining`);

        const newPlan = this.regenerateFullPlan(currentTime, unavailable, actualField, actualBench, playTimes);

        if (newPlan && newPlan.rotations) {
            const validatedPlan = this.validateEntirePlan(newPlan, actualField, actualBench);
            console.log(`   Validated plan: ${validatedPlan.rotations.length} rotations, ${validatedPlan.expectedVariance}s variance`);
            return validatedPlan;
        }

        return newPlan;
    }

    handlePlayerRemoval(removedPlayer, actualField, actualBench) {
        console.log(`   Removing player: ${removedPlayer}`);

        this.removedPlayers.add(removedPlayer);
        if (this.playerState[removedPlayer]) {
            this.playerState[removedPlayer].status = 'Removed';
            this.playerState[removedPlayer].isOnField = false;
        }

        const newRosterSize = actualField.length + actualBench.length;
        if (newRosterSize <= this.fieldSpots) {
            console.log(`   ⚠️ Minimum roster reached (${newRosterSize} players) - disabling further subs`);
        }
    }

    regenerateFullPlan(currentTime, unavailable, actualField, actualBench, playTimes) {
        const newPlan = this.generatePlan(
            Math.floor(currentTime / this.checkInterval),
            unavailable,
            actualField,
            actualBench,
            playTimes
        );

        if (newPlan && newPlan.rotations) {
            newPlan.rotations = newPlan.rotations.filter(r => r.time > currentTime);

            newPlan.rotations = newPlan.rotations.filter(rotation => {
                const hasRemovedOff = rotation.off.some(p => this.removedPlayers.has(p));
                const hasRemovedOn = rotation.on.some(p => this.removedPlayers.has(p));
                if (hasRemovedOff || hasRemovedOn) {
                    console.log(`   Removing rotation at ${this.formatTime(rotation.time)} - references removed player`);
                    return false;
                }
                return true;
            });
        }

        return newPlan;
    }

    validateEntirePlan(plan, currentField, currentBench) {
        if (!plan || !plan.rotations || plan.rotations.length === 0) {
            return plan;
        }

        const validatedRotations = [];
        let simulatedField = [...currentField];
        let simulatedBench = [...currentBench];

        for (const rotation of plan.rotations) {
            const invalidOff = rotation.off.filter(p => !simulatedField.includes(p));
            const invalidOn = rotation.on.filter(p => !simulatedBench.includes(p));

            if (invalidOff.length > 0 || invalidOn.length > 0) {
                console.log(`   ⚠️ Removing invalid rotation at ${this.formatTime(rotation.time)}`);
                continue;
            }

            validatedRotations.push(rotation);

            simulatedField = simulatedField.filter(p => !rotation.off.includes(p));
            simulatedField.push(...rotation.on);
            simulatedBench = simulatedBench.filter(p => !rotation.on.includes(p));
            simulatedBench.push(...rotation.off);
        }

        return {
            ...plan,
            rotations: validatedRotations
        };
    }

    /**
     * Sync with actual game state
     */
    syncWithActualState(currentTime, actualField, actualBench, playTimes = null) {
        if (!Array.isArray(actualField) || !Array.isArray(actualBench)) {
            console.error('Invalid state provided to syncWithActualState');
            return;
        }

        this.currentTime = currentTime;

        const fieldSet = new Set(actualField);
        const benchSet = new Set(actualBench);

        this.players.forEach(player => {
            if (this.playerState[player]) {
                const onField = fieldSet.has(player);
                const onBench = benchSet.has(player);

                if (!onField && !onBench) {
                    this.removedPlayers.add(player);
                    this.playerState[player].status = 'Removed';
                    this.playerState[player].isOnField = false;
                } else {
                    this.removedPlayers.delete(player);
                }

                const wasOnField = this.playerState[player].isOnField;
                this.playerState[player].isOnField = onField;
                if (this.removedPlayers.has(player)) {
                    this.playerState[player].status = 'Removed';
                } else {
                    this.playerState[player].status = onField ? 'On_Field' : 'On_Bench';
                }

                if (playTimes && playTimes[player] !== undefined) {
                    this.playerState[player].totalTimePlayed = playTimes[player];
                    this.playerSeconds[player] = playTimes[player];
                }

                this.playerState[player].currentStintDuration = 0;

                if (this.removedPlayers.has(player)) {
                    this.playerState[player].currentFieldStint = 0;
                    this.playerState[player].currentBenchStint = 0;
                } else if (wasOnField !== onField) {
                    if (onField) {
                        this.playerState[player].currentFieldStint = 0;
                        this.playerState[player].currentBenchStint = 0;
                    } else {
                        this.playerState[player].currentBenchStint = 0;
                        this.playerState[player].currentFieldStint = 0;
                    }
                }
            }
        });

        console.log(`   Synced at ${this.formatTime(currentTime)}: ${actualField.length} field, ${actualBench.length} bench`);
    }

    /**
     * Get analytics
     */
    getAnalytics(currentTime = this.currentTime) {
        const availablePlayers = this.players.filter(p => this.playerState[p] && !this.removedPlayers.has(p));
        const variance = this.calculateRealTimeVariance(availablePlayers);
        const dynamicVariance = this.getDynamicVarianceThreshold(currentTime);

        return {
            currentVariance: Math.round(variance),
            metrics: {
                algorithm: 'hybrid-afl',
                checkInterval: this.checkInterval,
                idealShifts: this.idealShiftsPerPlayer,
                varianceThreshold: Math.round(dynamicVariance),
                minSubGap: Math.round(this.minSubstitutionGap),
                timeSinceLastSub: Math.round(currentTime - this.lastSubstitutionTime),
                currentTime: currentTime,
                meanPlayingTime: availablePlayers.length > 0 ? (this.fieldSpots * currentTime) / availablePlayers.length : 0,
                totalRotations: this.currentPlan?.rotations?.length || 0,
                targetMinutes: this.currentPlan?.targetMinutes || 0,
                varianceRange: Math.round(variance),
                lookAheadWindow: this.lookAheadWindow,
                varianceGoal: this.varianceGoal
            }
        };
    }

    /**
     * Format time helper
     */
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }
}
