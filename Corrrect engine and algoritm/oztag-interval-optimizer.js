/**
 * Oztag Interval Optimizer - HYBRID VERSION
 * Urgency-based hybrid algorithm for superior variance control
 * Version 1.0 - Adapted for Oztag (8 players on field, rolling subs)
 *
 * @fileoverview Core substitution optimization algorithm for Oztag games.
 * Uses a 4-value fatigue tracking system and urgency-based scheduling.
 */

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================
const OZTAG_OPTIMIZER_DEFAULTS = {
    // Field Configuration
    FIELD_SPOTS: 8,
    DEFAULT_TOTAL_PLAYERS: 14,  // 8 on field + 6 reserves max

    // Timing (in seconds)
    FINAL_NO_SUB_WINDOW: 45,
    MIN_SUB_GAP_DEFAULT: 180,   // 3 minutes between subs
    CHECK_INTERVAL: 15,
    LOOK_AHEAD_WINDOW: 60,

    // Stint Limits (in seconds)
    MIN_FIELD_STINT: 180,       // 3 minutes minimum on field
    MAX_FIELD_STINT: 480,       // 8 minutes maximum on field

    // Variance Control
    VARIANCE_GOAL: 60,
    MAX_EARLY_VARIANCE_MULTIPLIER: 3,

    // Fatigue System
    FATIGUE_THRESHOLD: 0.8,

    // Game Progress Phases
    GAME_PROGRESS: {
        EARLY: 0.25,
        MID: 0.50,
        LATE: 0.75,
        END_GAME: 0.90,
    },

    // Ideal Shifts
    DEFAULT_IDEAL_SHIFTS: 4,
    MAX_IDEAL_SHIFTS: 6,
    MIN_IDEAL_SHIFTS: 2,

    // Proactive Sub Thresholds (in minutes)
    PROACTIVE_DEVIATION_TRIGGER: 1.0,
    LATE_GAME_DEVIATION_TRIGGER: 1.5,
};

// Merge with global config if available
const OZTAG_CONFIG = (typeof window !== 'undefined' && window.OztagConfig?.OZTAG_DEFAULTS)
    ? { ...OZTAG_OPTIMIZER_DEFAULTS, ...window.OztagConfig.OZTAG_DEFAULTS }
    : OZTAG_OPTIMIZER_DEFAULTS;

// ============================================================================
// TYPE DEFINITIONS (JSDoc)
// ============================================================================

/**
 * @typedef {Object} PlayerState
 * @property {string} status - 'On_Field', 'On_Bench', or 'Removed'
 * @property {number} totalTimePlayed - Cumulative playing time in seconds
 * @property {number} currentFieldStint - Current stint duration on field
 * @property {number} currentBenchStint - Current stint duration on bench
 * @property {number} totalBenchTime - Cumulative bench time in seconds
 * @property {boolean} isOnField - Whether player is currently on field
 * @property {number} currentStintDuration - Legacy compatibility field
 */

/**
 * @typedef {Object} Rotation
 * @property {number} time - Time of rotation in seconds
 * @property {string[]} off - Players coming off field
 * @property {string[]} on - Players going on field
 * @property {string} [reason] - Reason for rotation
 */

/**
 * @typedef {Object} OptimizerResult
 * @property {boolean} success - Whether operation succeeded
 * @property {Rotation[]} [rotations] - Array of planned rotations
 * @property {number[]} [schedule] - Array of rotation times
 * @property {number} [targetMinutes] - Target minutes per player
 * @property {number} [expectedVariance] - Expected variance in seconds
 * @property {Object} [playerMinutes] - Map of player names to minutes
 * @property {string} [error] - Error message if failed
 */

// ============================================================================
// MAIN CLASS
// ============================================================================

class OztagIntervalOptimizer {
    /**
     * Create a new Oztag Interval Optimizer
     * @param {Object} config - Configuration options
     */
    constructor(config = {}) {
        // Core configuration
        this.totalPlayers = config.totalPlayers || OZTAG_CONFIG.DEFAULT_TOTAL_PLAYERS;
        this.fieldSpots = config.fieldSpots || OZTAG_CONFIG.FIELD_SPOTS;
        this.benchSpots = this.totalPlayers - this.fieldSpots;
        this.gameLength = config.gameLength || 2400; // 40 minutes default (2x20min halves)
        this.periodLength = config.periodLength || 1200; // 20 minutes per half
        this.numPeriods = config.numPeriods || 2;
        this.finalNoSubWindow = config.finalNoSubWindow || OZTAG_CONFIG.FINAL_NO_SUB_WINDOW;

        // Hybrid algorithm configuration
        this.manualIdealShifts = Number.isFinite(config.idealShiftsPerPlayer) ? config.idealShiftsPerPlayer : null;
        this.idealShiftsPerPlayer = this.manualIdealShifts || this.convertSubsToShifts(config.subsPerRotation || 2);
        this.varianceGoal = config.varianceGoal || OZTAG_CONFIG.VARIANCE_GOAL;
        this.maxEarlyVariance = Math.max(this.varianceGoal, this.varianceGoal * OZTAG_CONFIG.MAX_EARLY_VARIANCE_MULTIPLIER);
        this.lookAheadWindow = config.lookAheadWindow || OZTAG_CONFIG.LOOK_AHEAD_WINDOW;
        this.varianceThreshold = this.maxEarlyVariance;

        // Adaptive minimum gap between substitutions
        this.manualMinSubGap = Number.isFinite(config.minSubstitutionGap) ? config.minSubstitutionGap : null;
        this.minSubstitutionGap = this.manualMinSubGap || Math.max(OZTAG_CONFIG.MIN_SUB_GAP_DEFAULT, this.gameLength / 12);
        this.lastSubstitutionTime = -this.minSubstitutionGap;
        this.halftimeRotationDone = false;

        // Check interval
        this.checkInterval = OZTAG_CONFIG.CHECK_INTERVAL;
        this.numIntervals = Math.floor(this.gameLength / this.checkInterval);

        // State tracking
        this.players = [];
        /** @type {Object.<string, PlayerState>} */
        this.playerState = {};
        this.currentTime = 0;
        this.removedPlayers = new Set();

        // Prorated constraints
        this.proratedMaxFieldStint = 0;
        this.proratedMaxBenchStint = 0;
        this.targetPlayingTime = 0;

        // Legacy compatibility
        this.subsPerRotation = config.subsPerRotation || 2;
        this.playerSeconds = {};
        this.currentPlan = null;
        this._tempo = 'balanced';

        this.recalculateDynamicTargets(this.totalPlayers, { initial: true, resetLastSub: true, suppressLog: true });

        console.log('🏉 Oztag Interval Optimizer v1.0 - Hybrid Algorithm');
        console.log(`   Config: ${this.totalPlayers} players, ${this.fieldSpots} field spots`);
        console.log(`   Variance goal: ${this.varianceGoal}s, Check interval: ${this.checkInterval}s`);
        console.log(`   Gap constraint: ${this.formatTime(this.minSubstitutionGap)} minimum between substitutions`);
    }

    /**
     * Convert legacy subsPerRotation to idealShiftsPerPlayer
     */
    convertSubsToShifts(subsPerRotation) {
        if (subsPerRotation >= 3) {
            return 5;
        } else if (subsPerRotation >= 2) {
            return 4;
        } else {
            return 3;
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
            targetSecondsPerPlayer / 2,
            180,
            Math.max(240, Math.min(480, targetSecondsPerPlayer))
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
        this.idealShiftsPerPlayer = Math.max(benchPlayers === 0 ? 1 : 2, idealShifts);

        const playersPerRotation = benchPlayers === 0 ? 0 : Math.min(2, benchPlayers);
        const entriesNeeded = benchPlayers * this.idealShiftsPerPlayer;
        const rotationsNeeded = playersPerRotation > 0 ? Math.ceil(entriesNeeded / playersPerRotation) : 0;
        const rawGap = rotationsNeeded > 0 ? effectivePlayableTime / rotationsNeeded : effectivePlayableTime;

        if (this.manualMinSubGap) {
            this.minSubstitutionGap = this.manualMinSubGap;
        } else if (rotationsNeeded === 0) {
            this.minSubstitutionGap = effectivePlayableTime;
        } else {
            const adaptiveGap = this.calculateAdaptiveMinGap(this.gameLength, rosterSize);
            let maxGapCap = Math.max(180, Math.min(420, this.gameLength / 6));
            const desiredGap = Math.min(rawGap, adaptiveGap);
            this.minSubstitutionGap = this.clamp(desiredGap, 60, maxGapCap);
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
            this.minSubstitutionGap * 0.9
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
            6
        );

        const candidateSet = new Set();
        for (let up = baseEstimate; up <= 6; up++) candidateSet.add(up);
        for (let down = baseEstimate - 1; down >= 1; down--) candidateSet.add(down);
        if (!candidateSet.size) {
            candidateSet.add(2);
        }

        const candidates = Array.from(candidateSet).sort((a, b) => b - a);
        const playersPerRotation = Math.min(2, benchPlayers);
        const minSpacingTarget = benchPlayers >= 4 ? 120 : 90;

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

        return Math.max(1, Math.min(2, baseEstimate || 2));
    }

    getProtectedTime() {
        const periods = this.numPeriods || 2;
        const protectedTotal = this.finalNoSubWindow * periods;
        return Math.min(protectedTotal, this.gameLength * 0.4);
    }

    /**
     * Tempo property for UI compatibility
     */
    get tempo() {
        return this._tempo;
    }

    set tempo(value) {
        this._tempo = value;
        switch(value) {
            case 'aggressive':
                this.varianceGoal = 45;
                this.maxEarlyVariance = Math.max(this.varianceGoal * 3, 135);
                break;
            case 'conservative':
                this.varianceGoal = 75;
                this.maxEarlyVariance = Math.max(this.varianceGoal * 3, 225);
                break;
            default:
                this.varianceGoal = 60;
                this.maxEarlyVariance = Math.max(this.varianceGoal * 3, 180);
        }
        this.varianceThreshold = this.getDynamicVarianceThreshold();
        console.log(`Tempo: ${value}, variance goal ${this.varianceGoal}s`);
    }

    getDynamicVarianceThreshold(referenceTime = this.currentTime) {
        if (!this.gameLength) return this.varianceGoal;

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

        // Initialize player state tracking with 4 time values
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

        console.log(`✅ Optimizer initialized: ${this.players.length} players, target ${Math.floor(this.targetPlayingTime/60)}m each`);

        this.halftimeRotationDone = false;
        this.removedPlayers.clear();

        return { success: true, totalPlayers: this.players.length };
    }

    /**
     * Generate rotation plan using hybrid urgency-based algorithm
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

        this.halftimeRotationDone = false;
        const rotations = [];

        // Main simulation loop
        while (this.currentTime < this.gameLength - 30) {
            this.currentTime += this.checkInterval;
            this.updatePlayerStats(field, bench, this.checkInterval);
            const substitution = this.checkForSubstitutions(field, bench, availablePlayers);

            if (substitution) {
                const validPlayersOff = substitution.playersOff.filter(p => field.includes(p));
                const validPlayersOn = substitution.playersOn.filter(p => bench.includes(p));

                if (validPlayersOff.length === 0 || validPlayersOn.length === 0) {
                    console.warn(`⚠️ Skipping invalid substitution at ${this.formatTime(this.currentTime)}`);
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
            plan: rotations
        };
    }

    /**
     * Update player statistics for the check interval
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
     * Check for substitutions using hybrid algorithm
     */
    checkForSubstitutions(field, bench, availablePlayers) {
        const timeSinceLastSub = this.currentTime - this.lastSubstitutionTime;
        const gameProgress = this.currentTime / this.gameLength;
        const isHalftime = this.isHalftimeBreak();
        const halfTimePoint = this.gameLength / 2;

        const currentVarianceSeconds = this.calculateRealTimeVariance(availablePlayers);
        const currentMaxDeviationMinutes = currentVarianceSeconds / 60;
        const remainingWindowsEstimate = Math.max(1, Math.ceil((this.gameLength - this.currentTime) / Math.max(this.minSubstitutionGap, this.checkInterval)));
        const minGap = this.getEffectiveMinGap(
            this.minSubstitutionGap,
            this.currentTime,
            this.gameLength,
            currentMaxDeviationMinutes,
            remainingWindowsEstimate
        );

        const meanPlayingTime = availablePlayers.length > 0
            ? (this.fieldSpots * this.currentTime) / availablePlayers.length
            : 0;

        const urgentSubOut = this.getUrgentFieldPlayers(field);
        const urgentSubIn = this.getUrgentBenchPlayers(bench);
        const proactiveSubOut = this.getProactiveFieldCandidates(field, meanPlayingTime);
        const proactiveSubIn = this.getProactiveBenchCandidates(bench, meanPlayingTime);
        const upcomingSubOut = this.getUpcomingFieldPlayers(field, this.lookAheadWindow);
        const upcomingSubIn = this.getUpcomingBenchPlayers(bench, this.lookAheadWindow);

        const treatAsHalftimeWindow = isHalftime && !this.halftimeRotationDone;

        if (isHalftime) {
            if (this.currentTime < halfTimePoint) {
                return null;
            }

            if (!this.halftimeRotationDone) {
                const halftimeRotation = this.createHalftimeRotation(field, bench, availablePlayers);
                this.halftimeRotationDone = true;
                if (halftimeRotation) {
                    return halftimeRotation;
                }
            }
        }

        if (timeSinceLastSub < minGap && !treatAsHalftimeWindow) {
            return null;
        }

        const realTimeVariance = currentVarianceSeconds;
        const varianceTrigger = this.getDynamicVarianceThreshold();
        this.varianceThreshold = varianceTrigger;

        if (urgentSubOut.length > 0 || urgentSubIn.length > 0) {
            return this.createBatchSubstitution(
                { urgent: urgentSubOut, upcoming: upcomingSubOut, proactive: proactiveSubOut },
                { urgent: urgentSubIn, upcoming: upcomingSubIn, proactive: proactiveSubIn },
                'urgent',
                2
            );
        }

        if (realTimeVariance > varianceTrigger) {
            return this.createBatchSubstitution(
                { upcoming: upcomingSubOut, proactive: proactiveSubOut },
                { upcoming: upcomingSubIn, proactive: proactiveSubIn },
                'variance-correction',
                2
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
                2
            );
        }

        if (upcomingSubOut.length > 0 && (upcomingSubIn.length > 0 || proactiveSubIn.length > 0)) {
            return this.createBatchSubstitution(
                { upcoming: upcomingSubOut, proactive: proactiveSubOut },
                { upcoming: upcomingSubIn, proactive: proactiveSubIn },
                'scheduled-balance',
                2
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

    isHalftimeBreak() {
        const halfTime = this.gameLength / 2;
        return Math.abs(this.currentTime - halfTime) <= 30;
    }

    createHalftimeRotation(field, bench, availablePlayers) {
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

        if (swapsToMake === 0) return null;

        return {
            playersOff: playersOff.slice(0, swapsToMake),
            playersOn: validPlayersOn.slice(0, swapsToMake),
            reason: `halftime-refresh (${swapsToMake} players)`
        };
    }

    createBatchSubstitution(outPriority, inPriority, reason, maxSubs = 2) {
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
        if (subsToMake === 0) return null;

        const playersOff = uniqueOut.slice(0, subsToMake);
        const playersOn = [];

        for (let i = 0; i < uniqueIn.length && playersOn.length < subsToMake; i++) {
            const candidate = uniqueIn[i];
            if (!playersOff.includes(candidate)) {
                playersOn.push(candidate);
            }
        }

        if (playersOn.length < playersOff.length) return null;

        return {
            playersOff,
            playersOn: playersOn.slice(0, playersOff.length),
            reason: `${reason} (${playersOff.length} players)`
        };
    }

    calculateRealTimeVariance(players) {
        const activePlayers = players.filter(player => !this.removedPlayers.has(player));
        if (activePlayers.length === 0) return 0;

        const playTimes = activePlayers.map(player => this.playerState[player]?.totalTimePlayed || 0);
        const mean = playTimes.reduce((sum, time) => sum + time, 0) / playTimes.length;
        const squaredDiffs = playTimes.map(time => Math.pow(time - mean, 2));
        const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / playTimes.length;

        return Math.sqrt(variance);
    }

    calculateAdaptiveMinGap(gameLengthSeconds, totalPlayers) {
        const gameMinutes = Math.max(1, gameLengthSeconds / 60);
        const estimatedWindowsNeeded = Math.max(8, Math.ceil(totalPlayers * 1.5));
        const availableGameTime = Math.max(gameMinutes - 1.5, gameMinutes * 0.8);
        const idealGapMinutes = availableGameTime / estimatedWindowsNeeded;

        let lowerBound = 2.5;
        let upperBound = 5.0;
        if (gameMinutes <= 30) {
            lowerBound = 2.0;
            upperBound = 3.5;
        } else if (gameMinutes <= 40) {
            lowerBound = 2.5;
            upperBound = 4.0;
        }

        const minimumGapMinutes = this.clamp(idealGapMinutes, lowerBound, upperBound);
        return minimumGapMinutes * 60;
    }

    getEffectiveMinGap(standardMinGap, currentTime, gameLength, currentMaxDeviationMinutes, remainingWindows) {
        const progress = currentTime / gameLength;
        let effectiveGap = standardMinGap;

        if (progress < 0.33) return effectiveGap;

        if (progress < 0.67) {
            if (currentMaxDeviationMinutes > 2.0) {
                effectiveGap *= 0.85;
            }
            return effectiveGap;
        }

        if (progress < 0.85) {
            if (currentMaxDeviationMinutes > 1.5) {
                effectiveGap *= 0.75;
            } else if (currentMaxDeviationMinutes > 1.0) {
                effectiveGap *= 0.85;
            }
            return effectiveGap;
        }

        if (remainingWindows <= 3) {
            effectiveGap *= 0.6;
        } else {
            effectiveGap *= 0.7;
        }

        return effectiveGap;
    }

    shouldTriggerEarlySub(currentTime, gameLength, minGap, fieldPlayers, availablePlayers) {
        const progress = currentTime / gameLength;
        if (progress < 0.2) return { trigger: false };

        const activePlayers = availablePlayers.filter(player => !this.removedPlayers.has(player));
        if (!activePlayers.length) return { trigger: false };

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

        if (projectedMaxDevMinutes > currentMaxDevMinutes + 1.0) {
            return {
                trigger: true,
                reason: `Projected deviation ${projectedMaxDevMinutes.toFixed(2)}`
            };
        }

        if (progress > 0.7 && projectedMaxDevMinutes > 1.5) {
            return {
                trigger: true,
                reason: `Late-game prevention: projected ${projectedMaxDevMinutes.toFixed(2)}`
            };
        }

        return { trigger: false };
    }

    getPlayerMinutes(players) {
        const playerMinutes = {};
        players.forEach(player => {
            const seconds = this.playerState[player]?.totalTimePlayed || 0;
            playerMinutes[player] = Math.round(seconds / 60 * 10) / 10;
        });
        return playerMinutes;
    }

    handleDeviation(deviationType, deviationData, currentTime) {
        console.log(`🔄 Handling ${deviationType} at ${this.formatTime(currentTime)}`);

        this.currentTime = currentTime;
        const { actualField, actualBench, playTimes } = deviationData;
        const unavailable = deviationData.unavailable || [];

        this.syncWithActualState(currentTime, actualField, actualBench, playTimes);
        this.lastSubstitutionTime = currentTime;
        if (currentTime >= this.gameLength / 2) {
            this.halftimeRotationDone = true;
        }

        const newPlan = this.generatePlan(
            Math.floor(currentTime / this.checkInterval),
            unavailable,
            actualField,
            actualBench,
            playTimes
        );

        if (newPlan && newPlan.rotations) {
            newPlan.rotations = newPlan.rotations.filter(r => r.time > currentTime);
        }

        return newPlan;
    }

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
                } else if (wasOnField !== this.playerState[player].isOnField) {
                    this.playerState[player].currentFieldStint = 0;
                    this.playerState[player].currentBenchStint = 0;
                }
            }
        });

        if (currentTime >= this.gameLength / 2) {
            this.halftimeRotationDone = true;
        }

        console.log(`   Synced at ${this.formatTime(currentTime)}: ${actualField.length} field, ${actualBench.length} bench`);
    }

    getAnalytics(currentTime = this.currentTime) {
        const availablePlayers = this.players.filter(p => this.playerState[p] && !this.removedPlayers.has(p));
        const variance = this.calculateRealTimeVariance(availablePlayers);
        const dynamicVariance = this.getDynamicVarianceThreshold(currentTime);

        return {
            currentVariance: Math.round(variance),
            metrics: {
                algorithm: 'hybrid-oztag',
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
                varianceGoal: this.varianceGoal
            }
        };
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = OztagIntervalOptimizer;
}

if (typeof window !== 'undefined') {
    window.OztagIntervalOptimizer = OztagIntervalOptimizer;
    console.log('🏉 Oztag Interval Optimizer v1.0 loaded - Hybrid Algorithm');
}
