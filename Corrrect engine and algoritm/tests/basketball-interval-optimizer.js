/**
 * Basketball Interval Optimizer - HYBRID VERSION
 * Now uses urgency-based hybrid algorithm for superior variance control
 * Maintains 100% API compatibility with existing infrastructure
 * Version 5.0 - Complete Hybrid Algorithm Implementation
 */

class BasketballIntervalOptimizer {
    constructor(config) {
        // Core configuration - maintain compatibility
        this.totalPlayers = config.totalPlayers || 8;
        this.courtSpots = config.courtSpots || 5;
        this.benchSpots = this.totalPlayers - this.courtSpots;
        this.gameLength = config.gameLength || 1800; // in seconds
        this.periodLength = config.periodLength || null;
        this.numPeriods = config.numPeriods || null;
        if (!this.numPeriods && this.periodLength) {
            this.numPeriods = Math.max(1, Math.round(this.gameLength / this.periodLength));
        }
        this.finalNoSubWindow = config.finalNoSubWindow || 45; // seconds guarded at end of each period

        // NEW: Hybrid algorithm configuration (converts from legacy config)
        this.manualIdealShifts = Number.isFinite(config.idealShiftsPerPlayer) ? config.idealShiftsPerPlayer : null;
        this.idealShiftsPerPlayer = this.manualIdealShifts || this.convertSubsToShifts(config.subsPerRotation || 1);
        const configuredVariance = config.varianceThreshold || 90; // Legacy support for direct threshold tuning
        this.varianceGoal = config.varianceGoal || 60;             // Desired end-of-game variance band
        const earlyVariancePreference = config.maxEarlyVariance || Math.max(configuredVariance, this.varianceGoal * 3);
        this.maxEarlyVariance = Math.max(this.varianceGoal, earlyVariancePreference);
        this.lookAheadWindow = config.lookAheadWindow || 60;       // Seconds to look ahead for batching
        this.varianceThreshold = this.maxEarlyVariance;            // Dynamic placeholder for legacy observers

        // NEW: Adaptive minimum gap between substitutions (preventative constraint)
        this.manualMinSubGap = Number.isFinite(config.minSubstitutionGap) ? config.minSubstitutionGap : null;
        this.minSubstitutionGap = this.manualMinSubGap || Math.max(120, this.gameLength / 15); // Placeholder until recalculated
        this.lastSubstitutionTime = -this.minSubstitutionGap; // Allow first substitution immediately
        this.halftimeRotationDone = false;

        // Check interval - now 15 seconds for better control
        this.checkInterval = 15;
        this.numIntervals = Math.floor(this.gameLength / this.checkInterval);

        // State tracking for hybrid algorithm
        this.players = [];
        this.playerState = {}; // Real-time tracking
        this.currentTime = 0;
        this.removedPlayers = new Set();

        // Prorated constraints (calculated from ideal shifts)
        this.proratedMaxCourtStint = 0;
        this.proratedMaxBenchStint = 0;
        this.targetPlayingTime = 0;

        // Legacy compatibility properties
        this.subsPerRotation = config.subsPerRotation || config.subsPerChange || config.rotationsPerChange || 1;
        this.minRotationGapSec = config.minRotationGapSec || 120; // Not used in hybrid but preserved
        this.intervalDuration = this.checkInterval; // For compatibility
        this.playerSeconds = {}; // Legacy compatibility
        this.currentPlan = null; // Legacy compatibility
        this._tempo = 'balanced'; // Legacy UI compatibility

        this.recalculateDynamicTargets(this.totalPlayers, { initial: true, resetLastSub: true, suppressLog: true });

        console.log('🏀 Basketball Interval Optimizer v5.0 - Hybrid Algorithm');
        console.log(`   Converted legacy subsPerRotation(${this.subsPerRotation}) → idealShifts(${this.idealShiftsPerPlayer})`);
        console.log(`   Variance goal: ${this.varianceGoal}s (early cap ${this.maxEarlyVariance}s), Check interval: ${this.checkInterval}s`);
        console.log(`   🔎 Look-ahead window: ${this.lookAheadWindow}s`);
        console.log(`   🚧 Gap constraint: ${this.formatTime(this.minSubstitutionGap)} minimum between substitutions`);
    }

    /**
     * Convert legacy subsPerRotation to idealShiftsPerPlayer
     */
    convertSubsToShifts(subsPerRotation) {
        // Heuristic: more subs per rotation suggests coach wants more frequent changes
        // This maps to more total shifts per player over the game
        if (subsPerRotation >= 2) {
            return 5; // More frequent rotation preference → 5 shifts per player
        } else {
            return 4; // Single sub preference → 4 shifts per player (balanced)
        }
    }

    /**
     * Recalculate shift counts, stint caps, and substitution gap dynamically
     * based on the current roster size and game length.
     */
    recalculateDynamicTargets(activePlayerCount = null, options = {}) {
        const suppressLog = options.suppressLog || false;
        const resetLastSub = options.resetLastSub || false;

        const rosterSize = Math.max(
            activePlayerCount || (this.players?.length || 0) || this.totalPlayers,
            this.courtSpots
        );
        const benchPlayers = Math.max(0, rosterSize - this.courtSpots);

        const protectedTime = this.getProtectedTime();
        const effectivePlayableTime = Math.max(1, this.gameLength - protectedTime);
        const targetSecondsPerPlayer = (this.gameLength * this.courtSpots) / rosterSize;
        this.targetPlayingTime = targetSecondsPerPlayer;

        const desiredCourtStint = this.clamp(
            targetSecondsPerPlayer / 2,
            150,
            Math.max(180, Math.min(360, targetSecondsPerPlayer))
        );

        let idealShifts = this.manualIdealShifts;
        if (!Number.isFinite(idealShifts) || idealShifts <= 0) {
            idealShifts = this.determineIdealShiftCount({
                benchPlayers,
                targetSecondsPerPlayer,
                desiredCourtStint,
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
            if (this.gameLength <= 20 * 60) {
                maxGapCap = Math.min(maxGapCap, 90);
            }
            const desiredGap = Math.min(rawGap, adaptiveGap);
            this.minSubstitutionGap = this.clamp(desiredGap, 45, maxGapCap);
        }

        if (resetLastSub) {
            this.lastSubstitutionTime = -this.minSubstitutionGap;
        }

        const shiftCount = Math.max(1, this.idealShiftsPerPlayer);
        const courtStint = targetSecondsPerPlayer / shiftCount;
        const benchPool = Math.max(0, this.gameLength - targetSecondsPerPlayer);
        const benchStint = benchPlayers > 0 ? benchPool / shiftCount : this.gameLength;

        this.proratedMaxCourtStint = Math.max(
            courtStint,
            this.checkInterval * 2,
            this.minSubstitutionGap * 0.9
        );
        this.proratedMaxBenchStint = benchPlayers > 0
            ? Math.max(benchStint, this.checkInterval * 2, this.minSubstitutionGap * 0.5)
            : this.gameLength;

        if (!suppressLog) {
            console.log(
                `   Dynamic targets → shifts:${this.idealShiftsPerPlayer}, minGap:${this.formatTime(this.minSubstitutionGap)}, ` +
                `courtMax:${this.formatTime(this.proratedMaxCourtStint)}, benchMax:${this.formatTime(this.proratedMaxBenchStint)}`
            );
        }
    }

    determineIdealShiftCount({ benchPlayers, targetSecondsPerPlayer, desiredCourtStint, effectivePlayableTime }) {
        if (benchPlayers <= 0) {
            return 1;
        }

        const baseEstimate = this.clamp(
            Math.round(targetSecondsPerPlayer / desiredCourtStint),
            1,
            5
        );

        const candidateSet = new Set();
        for (let up = baseEstimate; up <= 5; up++) candidateSet.add(up);
        for (let down = baseEstimate - 1; down >= 1; down--) candidateSet.add(down);
        if (!candidateSet.size) {
            candidateSet.add(2);
        }

        const candidates = Array.from(candidateSet).sort((a, b) => b - a);
        const playersPerRotation = Math.min(2, benchPlayers);
        const minSpacingTarget = benchPlayers >= 4 ? 105 : 75;

        for (const candidate of candidates) {
            if (candidate <= 0) {
                continue;
            }
            const entries = benchPlayers * candidate;
            const rotationsNeeded = playersPerRotation > 0 ? Math.ceil(entries / playersPerRotation) : 0;
            if (rotationsNeeded === 0) {
                continue;
            }
            const spacing = effectivePlayableTime / rotationsNeeded;
            if (spacing >= minSpacingTarget) {
                return candidate;
            }
        }

        return Math.max(1, Math.min(2, baseEstimate || 2));
    }

    getProtectedTime() {
        const periods = this.numPeriods || (this.periodLength ? Math.max(1, Math.round(this.gameLength / this.periodLength)) : 2);
        const protectedTotal = this.finalNoSubWindow * periods;
        return Math.min(protectedTotal, this.gameLength * 0.4);
    }

    /**
     * Legacy tempo property for UI compatibility
     */
    get tempo() {
        return this._tempo;
    }

    set tempo(value) {
        this._tempo = value;
        // Adjust variance threshold based on tempo
        switch(value) {
            case 'aggressive':
                this.varianceGoal = 45;
                this.maxEarlyVariance = Math.max(this.varianceGoal * 3, 135);
                break;
            case 'conservative':
                this.varianceGoal = 75;
                this.maxEarlyVariance = Math.max(this.varianceGoal * 3, 225);
                break;
            default: // balanced
                this.varianceGoal = 60;
                this.maxEarlyVariance = Math.max(this.varianceGoal * 3, 180);
        }
        this.varianceThreshold = this.getDynamicVarianceThreshold(); // Keep analytics aligned with dynamic trigger
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
     * Initialize with player roster - HYBRID ALGORITHM
     */
    initialize(players, currentState = null) {
        this.players = Array.isArray(players) ? [...players] : [];
        this.playerSeconds = {}; // Legacy compatibility

        if (this.players.length < this.courtSpots) {
            return { success: false, error: 'Not enough players for court spots' };
        }

        this.recalculateDynamicTargets(this.players.length, { resetLastSub: true });
        console.log(
            `   Target: ${Math.floor(this.targetPlayingTime / 60)}m, ` +
            `Court stint: ${Math.floor(this.proratedMaxCourtStint / 60)}m, ` +
            `Bench stint: ${Math.floor(this.proratedMaxBenchStint / 60)}m`
        );

        // Initialize hybrid player state tracking with 4 time values
        this.playerState = {};
        this.players.forEach(player => {
            this.playerSeconds[player] = 0; // Legacy compatibility
            this.playerState[player] = {
                status: 'On_Bench',
                totalTimePlayed: 0,           // 1st: Total playing time (cumulative)
                currentCourtStint: 0,         // 2nd: Current stint on court
                currentBenchStint: 0,         // 3rd: Current stint on bench
                totalBenchTime: 0,            // 4th: Total time spent on bench (cumulative)
                isOnCourt: false,
                // Legacy compatibility
                currentStintDuration: 0
            };
        });

        // Set initial court/bench state
        const initialCourt = currentState?.onCourt || this.players.slice(0, this.courtSpots);
        const initialBench = currentState?.onBench || this.players.slice(this.courtSpots);

        // Update player states
        initialCourt.forEach(player => {
            if (this.playerState[player]) {
                this.playerState[player].status = 'On_Court';
                this.playerState[player].isOnCourt = true;
            }
        });

        initialBench.forEach(player => {
            if (this.playerState[player]) {
                this.playerState[player].status = 'On_Bench';
                this.playerState[player].isOnCourt = false;
            }
        });

        console.log(`✅ Hybrid optimizer initialized with ${this.players.length} players`);
        console.log(`   Target: ${Math.floor(this.targetPlayingTime/60)}m, Court stint: ${Math.floor(this.proratedMaxCourtStint/60)}m, Bench stint: ${Math.floor(this.proratedMaxBenchStint/60)}m`);

        this.halftimeRotationDone = false;
        this.removedPlayers.clear();

        return { success: true, totalPlayers: this.players.length };
    }

    /**
     * Generate plan using HYBRID URGENCY-BASED ALGORITHM
     * This completely replaces the old interval-based approach
     */
    generatePlan(fromInterval = 0, unavailablePlayers = [], currentCourt = null, currentBench = null, playTimes = null) {
        const startTime = fromInterval * this.checkInterval;
        this.currentTime = startTime;

        // Derive available players from actual state when provided so removed players stay excluded
        let availablePlayers;
        if (currentCourt || currentBench) {
            const derivedSet = new Set();
            (currentCourt || []).forEach(player => {
                if (!this.removedPlayers.has(player) && !unavailablePlayers.includes(player)) {
                    derivedSet.add(player);
                }
            });
            (currentBench || []).forEach(player => {
                if (!this.removedPlayers.has(player) && !unavailablePlayers.includes(player)) {
                    derivedSet.add(player);
                }
            });

            // Fallback to known roster if derived state is unexpectedly small
            availablePlayers = [...derivedSet];
            if (availablePlayers.length < this.courtSpots) {
                availablePlayers = this.players.filter(p => !unavailablePlayers.includes(p) && !this.removedPlayers.has(p));
            }
        } else {
            availablePlayers = this.players.filter(p => !unavailablePlayers.includes(p) && !this.removedPlayers.has(p));
        }
        if (availablePlayers.length < this.courtSpots) {
            return {
                rotations: [],
                schedule: [],
                targetMinutes: 0,
                expectedVariance: 0,
                error: 'Not enough available players'
            };
        }

        this.recalculateDynamicTargets(availablePlayers.length, { suppressLog: true });

        // Set up initial state
        let court = currentCourt ? [...currentCourt] : availablePlayers.slice(0, this.courtSpots);
        let bench = currentBench ? [...currentBench] : availablePlayers.slice(this.courtSpots);

        // Initialize player times if provided
        if (playTimes) {
            availablePlayers.forEach(player => {
                if (this.playerState[player]) {
                    this.playerState[player].totalTimePlayed = playTimes[player] || 0;
                    this.playerSeconds[player] = playTimes[player] || 0; // Legacy compatibility
                }
            });
        }

        // Update player states to match current court/bench
        availablePlayers.forEach(player => {
            if (this.playerState[player]) {
                this.playerState[player].isOnCourt = court.includes(player);
                this.playerState[player].status = court.includes(player) ? 'On_Court' : 'On_Bench';
                this.playerState[player].currentStintDuration = 0; // Reset for new plan
            }
        });

        // Reset halftime flag whenever we start a fresh simulation
        this.halftimeRotationDone = false;

        const rotations = [];

        // HYBRID ALGORITHM MAIN LOOP
        while (this.currentTime < this.gameLength - 30) { // Stop 30 seconds before end
            this.currentTime += this.checkInterval;

            // Update player stats for this check interval
            this.updatePlayerStats(court, bench, this.checkInterval);

            // Check for substitutions using hybrid algorithm
            const substitution = this.checkForSubstitutions(court, bench, availablePlayers);

            if (substitution) {
                // Execute the substitution
                const rotationTime = this.currentTime;

                // Update court and bench
                court = court.filter(p => !substitution.playersOff.includes(p));
                court.push(...substitution.playersOn);

                bench = bench.filter(p => !substitution.playersOn.includes(p));
                bench.push(...substitution.playersOff);

                // Update player states - Enhanced with 4-value tracking
                substitution.playersOff.forEach(player => {
                    if (this.playerState[player]) {
                        this.playerState[player].status = 'On_Bench';
                        this.playerState[player].isOnCourt = false;
                        this.playerState[player].currentCourtStint = 0;         // Reset court stint
                        this.playerState[player].currentStintDuration = 0;     // Legacy
                    }
                });

                substitution.playersOn.forEach(player => {
                    if (this.playerState[player]) {
                        this.playerState[player].status = 'On_Court';
                        this.playerState[player].isOnCourt = true;
                        this.playerState[player].currentBenchStint = 0;        // Reset bench stint
                        this.playerState[player].currentStintDuration = 0;     // Legacy
                    }
                });

                // Track last substitution time for gap constraint
                const previousSubTime = this.lastSubstitutionTime;
                this.lastSubstitutionTime = rotationTime;

                // Record rotation
                rotations.push({
                    time: rotationTime,
                    off: [...substitution.playersOff],
                    on: [...substitution.playersOn],
                    reason: substitution.reason
                });

                const actualGap = rotationTime - previousSubTime;
                console.log(`🔄 ${substitution.reason} at ${this.formatTime(rotationTime)} (gap: ${this.formatTime(actualGap)})`);
                console.log(`   OFF: [${substitution.playersOff.join(', ')}]`);
                console.log(`   ON: [${substitution.playersOn.join(', ')}]`);
            }
        }

        // Update legacy playerSeconds for compatibility
        availablePlayers.forEach(player => {
            this.playerSeconds[player] = this.playerState[player]?.totalTimePlayed || 0;
        });

        // Calculate final variance
        const variance = this.calculateRealTimeVariance(availablePlayers);

        // Store current plan for legacy compatibility
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
            plan: rotations, // Compatibility with existing code
            debugInfo: {
                algorithm: 'hybrid-urgency',
                checkInterval: this.checkInterval,
                idealShifts: this.idealShiftsPerPlayer,
                varianceThreshold: this.varianceThreshold,
                actualRotations: rotations.length
            }
        };
    }

    /**
     * Update player statistics for the current check interval - Enhanced 4-value tracking
     */
    updatePlayerStats(court, bench, elapsed) {
        // Update court players - track playing time and current court stint
        court.forEach(player => {
            if (this.playerState[player]) {
                this.playerState[player].totalTimePlayed += elapsed;      // 1st: Total playing time
                this.playerState[player].currentCourtStint += elapsed;     // 2nd: Current court stint
                this.playerState[player].currentBenchStint = 0;            // Reset bench stint (they're on court)
                this.playerState[player].currentStintDuration += elapsed; // Legacy compatibility
                this.playerSeconds[player] = this.playerState[player].totalTimePlayed; // Legacy sync
            }
        });

        // Update bench players - track bench time and current bench stint
        bench.forEach(player => {
            if (this.playerState[player]) {
                this.playerState[player].totalBenchTime += elapsed;        // 4th: Total bench time
                this.playerState[player].currentBenchStint += elapsed;     // 3rd: Current bench stint
                this.playerState[player].currentCourtStint = 0;            // Reset court stint (they're on bench)
                this.playerState[player].currentStintDuration += elapsed; // Legacy compatibility
            }
        });
    }

    /**
     * ENHANCED CORE ALGORITHM: Preventative substitution batching with gap constraints
     * Implements 4-value fatigue prioritization and adaptive gap management
     */
    checkForSubstitutions(court, bench, availablePlayers) {
        // Step 1: Calculate current gap constraints
        const timeSinceLastSub = this.currentTime - this.lastSubstitutionTime;
        const gameProgress = this.currentTime / this.gameLength;
        const isEndGame = gameProgress >= 0.9; // Last 10% of game
        const isHalftime = this.isHalftimeBreak();
        const halfTimePoint = this.gameLength / 2;

        const remainingWindowsEstimate = Math.max(1, Math.ceil((this.gameLength - this.currentTime) / Math.max(this.minSubstitutionGap, this.checkInterval)));
        const currentVarianceSeconds = this.calculateRealTimeVariance(availablePlayers);
        const currentMaxDeviationMinutes = currentVarianceSeconds / 60;
        const minGap = this.getEffectiveMinGap(
            this.minSubstitutionGap,
            this.currentTime,
            this.gameLength,
            currentMaxDeviationMinutes,
            remainingWindowsEstimate
        );

        // Step 2: Calculate Mean Playing Time and identify all potential substitution candidates
        const meanPlayingTime = (5 * this.currentTime) / availablePlayers.length;

        // Enhanced urgent candidates based on 4-value fatigue system
        const urgentSubOut = this.getUrgentCourtPlayers(court);
        const urgentSubIn = this.getUrgentBenchPlayers(bench);

        // Enhanced proactive candidates - sorted by 4-value fatigue priority
        const proactiveSubOut = this.getProactiveCourtCandidates(court, meanPlayingTime);
        const proactiveSubIn = this.getProactiveBenchCandidates(bench, meanPlayingTime);

        // Look-ahead batching candidates
        const upcomingSubOut = this.getUpcomingCourtPlayers(court, this.lookAheadWindow);
        const upcomingSubIn = this.getUpcomingBenchPlayers(bench, this.lookAheadWindow);

        const urgentPairs = Math.min(urgentSubOut.length, urgentSubIn.length);

        const treatAsHalftimeWindow = isHalftime && !this.halftimeRotationDone;

        if (isHalftime) {
            if (this.currentTime < halfTimePoint) {
                // Wait until we reach the midpoint exactly so all halftime subs batch together
                return null;
            }

            if (!this.halftimeRotationDone) {
                const halftimeRotation = this.createHalftimeRotation(court, bench, availablePlayers);
                this.halftimeRotationDone = true;
                if (halftimeRotation) {
                    return halftimeRotation;
                }
            }
        }

        // Step 3: GAP CONSTRAINT ENFORCEMENT
        const benchDepth = Array.isArray(bench)
            ? bench.filter(player => !this.removedPlayers.has(player))
            : [];

        if (timeSinceLastSub < minGap && !treatAsHalftimeWindow) {
            console.log(`⏱️  WAITING: Gap constraint active (${this.formatTime(timeSinceLastSub)}/${this.formatTime(minGap)})`);
            return null;
        }

        const realTimeVariance = currentVarianceSeconds;
        const varianceTrigger = this.getDynamicVarianceThreshold();
        this.varianceThreshold = varianceTrigger;

        // Step 4: STANDARD SUBSTITUTION LOGIC (gap constraint satisfied or halftime)
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
            court,
            availablePlayers
        );

        if (earlyTrigger.trigger) {
            console.log(`🔎 Proactive substitution scheduled (${earlyTrigger.reason})`);
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
     * Enhanced 4-value fatigue system: Get urgent court players needing immediate substitution
     */
    getUrgentCourtPlayers(court) {
        return court.filter(player => {
            const state = this.playerState[player];
            return state.currentCourtStint >= this.proratedMaxCourtStint;
        }).sort((a, b) => {
            // Prioritize by fatigue severity (court stint duration descending)
            return this.playerState[b].currentCourtStint - this.playerState[a].currentCourtStint;
        });
    }

    /**
     * Enhanced 4-value fatigue system: Get urgent bench players ready to play
     */
    getUrgentBenchPlayers(bench) {
        return bench.filter(player => {
            const state = this.playerState[player];
            return state.currentBenchStint >= this.proratedMaxBenchStint;
        }).sort((a, b) => {
            // Prioritize by readiness (bench stint duration descending, then total bench time descending)
            const benchStintDiff = this.playerState[b].currentBenchStint - this.playerState[a].currentBenchStint;
            if (benchStintDiff !== 0) return benchStintDiff;
            return this.playerState[b].totalBenchTime - this.playerState[a].totalBenchTime;
        });
    }

    /**
     * Enhanced 4-value fatigue system: Get proactive court substitution candidates
     */
    getProactiveCourtCandidates(court, meanPlayingTime) {
        return court
            .map(player => ({
                player,
                // Composite fatigue score: playing time deviation + court stint weight
                fatigueScore: (this.playerState[player].totalTimePlayed - meanPlayingTime) +
                             (this.playerState[player].currentCourtStint * 0.5)
            }))
            .sort((a, b) => b.fatigueScore - a.fatigueScore) // Most fatigued first
            .map(item => item.player);
    }

    /**
     * Enhanced 4-value fatigue system: Get proactive bench substitution candidates
     */
    getProactiveBenchCandidates(bench, meanPlayingTime) {
        return bench
            .map(player => ({
                player,
                // Composite readiness score: playing time deficit + bench rest weight
                readinessScore: (meanPlayingTime - this.playerState[player].totalTimePlayed) +
                               (this.playerState[player].currentBenchStint * 0.3) +
                               (this.playerState[player].totalBenchTime * 0.1)
            }))
            .sort((a, b) => b.readinessScore - a.readinessScore) // Most ready first
            .map(item => item.player);
    }

    getUpcomingCourtPlayers(court, window) {
        if (!Array.isArray(court) || window <= 0) {
            return [];
        }

        return court
            .map(player => {
                const state = this.playerState[player];
                if (!state) {
                    return null;
                }
                const timeRemaining = this.proratedMaxCourtStint - state.currentCourtStint;
                return { player, timeRemaining };
            })
            .filter(item => item && item.timeRemaining > 0 && item.timeRemaining <= window)
            .sort((a, b) => a.timeRemaining - b.timeRemaining)
            .map(item => item.player);
    }

    getUpcomingBenchPlayers(bench, window) {
        if (!Array.isArray(bench) || window <= 0) {
            return [];
        }

        return bench
            .map(player => {
                const state = this.playerState[player];
                if (!state) {
                    return null;
                }
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
     * Check for players approaching fatigue thresholds (preventative detection)
     */
    getApproachingFatigueCourtPlayers(court) {
        const approachingThreshold = this.proratedMaxCourtStint * 0.8; // 80% of max stint
        return court.filter(player => {
            const state = this.playerState[player];
            return state.currentCourtStint >= approachingThreshold && state.currentCourtStint < this.proratedMaxCourtStint;
        });
    }

    /**
     * Check for bench players approaching readiness (preventative detection)
     */
    getApproachingReadyBenchPlayers(bench) {
        const approachingThreshold = this.proratedMaxBenchStint * 0.8; // 80% of max bench stint
        return bench.filter(player => {
            const state = this.playerState[player];
            return state.currentBenchStint >= approachingThreshold && state.currentBenchStint < this.proratedMaxBenchStint;
        });
    }

    /**
     * Check if there are pending urgent needs in near future (preventative detection)
     */
    hasPendingUrgentNeeds(court, bench) {
        const upcomingCourt = this.getUpcomingCourtPlayers(court, this.lookAheadWindow);
        const upcomingBench = this.getUpcomingBenchPlayers(bench, this.lookAheadWindow);
        return upcomingCourt.length > 0 && (upcomingBench.length > 0);
    }

    /**
     * Check if currently at halftime break
     */
    isHalftimeBreak() {
        // Simplified: check if we're at the midpoint of the game (±30 seconds)
        const halfTime = this.gameLength / 2;
        return Math.abs(this.currentTime - halfTime) <= 30;
    }

    /**
     * Enhanced batch substitution creator (replaces old single/double methods)
     */
    createHalftimeRotation(court, bench, availablePlayers) {
        if (!Array.isArray(court) || !Array.isArray(availablePlayers) || availablePlayers.length < this.courtSpots) {
            return null;
        }

        const lowestMinutePlayers = [...availablePlayers].sort((a, b) => {
            const aTime = this.playerState[a]?.totalTimePlayed || 0;
            const bTime = this.playerState[b]?.totalTimePlayed || 0;
            return aTime - bTime;
        }).slice(0, this.courtSpots);

        const desiredSet = new Set(lowestMinutePlayers);
        const playersOff = court.filter(player => !desiredSet.has(player));
        const playersOn = lowestMinutePlayers.filter(player => !court.includes(player));

        const swapsToMake = Math.min(playersOff.length, playersOn.length);
        if (swapsToMake === 0) {
            return null;
        }

        return {
            playersOff: playersOff.slice(0, swapsToMake),
            playersOn: playersOn.slice(0, swapsToMake),
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
            if (!player || seenOut.has(player)) {
                return;
            }
            seenOut.add(player);
            uniqueOut.push(player);
        });

        const uniqueIn = [];
        const seenIn = new Set();
        prioritizedIn.forEach(player => {
            if (!player || seenIn.has(player)) {
                return;
            }
            seenIn.add(player);
            uniqueIn.push(player);
        });

        const subsToMake = Math.min(maxSubs, uniqueOut.length, uniqueIn.length);
        if (subsToMake === 0) {
            return null; // No valid substitutions
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
     * Create a single substitution (1 player off, 1 player on)
     */
    createSingleSubstitution(urgentOut, urgentIn, proactiveOut, proactiveIn, reason) {
        return this.createBatchSubstitution(
            { urgent: urgentOut, proactive: proactiveOut },
            { urgent: urgentIn, proactive: proactiveIn },
            reason,
            1
        );
    }

    /**
     * Calculate real-time variance (range between highest and lowest minutes)
     */
    calculateRealTimeVariance(players) {
        const activePlayers = players.filter(player => !this.removedPlayers.has(player));
        if (activePlayers.length === 0) {
            return 0;
        }

        let minTime = Infinity;
        let maxTime = -Infinity;

        activePlayers.forEach(player => {
            const playTime = this.playerState[player]?.totalTimePlayed || 0;
            if (playTime < minTime) {
                minTime = playTime;
            }
            if (playTime > maxTime) {
                maxTime = playTime;
            }
        });

        if (minTime === Infinity || maxTime === -Infinity) {
            return 0;
        }

        return maxTime - minTime;
    }

    calculateAdaptiveMinGap(gameLengthSeconds, totalPlayers) {
        const gameMinutes = Math.max(1, gameLengthSeconds / 60);
        const estimatedWindowsNeeded = Math.max(6, Math.ceil(totalPlayers * 1.2));
        const availableGameTime = Math.max(gameMinutes - 1.5, gameMinutes * 0.8);
        const idealGapMinutes = availableGameTime / estimatedWindowsNeeded;

        let minimumGapMinutes;
        let lowerBound;
        let upperBound;
        if (gameMinutes <= 20) {
            lowerBound = 2.0;
            upperBound = 3.0;
        } else if (gameMinutes <= 40) {
            lowerBound = 2.4;
            upperBound = 4.0;
        } else {
            lowerBound = 2.6;
            upperBound = 4.0;
        }
        minimumGapMinutes = this.clamp(idealGapMinutes, lowerBound, upperBound);

        return minimumGapMinutes * 60;
    }

    getEffectiveMinGap(standardMinGap, currentTime, gameLength, currentMaxDeviationMinutes, remainingWindows) {
        const progress = currentTime / gameLength;
        let effectiveGap = standardMinGap;

        if (progress < 0.33) {
            return effectiveGap;
        }

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

    shouldTriggerEarlySub(currentTime, gameLength, minGap, courtPlayers, availablePlayers) {
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

        courtPlayers.forEach(player => {
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
                reason: `Projected deviation ${projectedMaxDevMinutes.toFixed(2)} (current ${currentMaxDevMinutes.toFixed(2)})`
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

    /**
     * Get player minutes for compatibility
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
     * Handle deviations and replanning (for compatibility with existing game engine)
     */
    handleDeviation(deviationType, deviationData, currentTime) {
        console.log(`🔄 Handling ${deviationType} at ${this.formatTime(currentTime)}`);

        // Update current time
        this.currentTime = currentTime;

        // Get current state from deviationData
        const { actualCourt, actualBench, playTimes } = deviationData;
        const unavailable = deviationData.unavailable || [];

        // Sync our state with actual game state
        this.syncWithActualState(currentTime, actualCourt, actualBench, playTimes);

        // Use the real-world substitution time as the new gap baseline so future checks don't see "future" subs
        this.lastSubstitutionTime = currentTime;
        if (currentTime >= this.gameLength / 2) {
            this.halftimeRotationDone = true;
        }

        // Generate new plan from current point
        const newPlan = this.generatePlan(
            Math.floor(currentTime / this.checkInterval),
            unavailable,
            actualCourt,
            actualBench,
            playTimes
        );

        if (newPlan && newPlan.rotations) {
            // Filter future rotations only
            newPlan.rotations = newPlan.rotations.filter(r => r.time > currentTime);
            console.log(`   New plan: ${newPlan.rotations.length} rotations, ${newPlan.expectedVariance}s variance`);
        }

        return newPlan;
    }

    /**
     * Sync with actual game state
     */
    syncWithActualState(currentTime, actualCourt, actualBench, playTimes = null) {
        if (!Array.isArray(actualCourt) || !Array.isArray(actualBench)) {
            console.error('Invalid state provided to syncWithActualState');
            return;
        }

        this.currentTime = currentTime;

        // Update player states to match actual game state
        const courtSet = new Set(actualCourt);
        const benchSet = new Set(actualBench);

        this.players.forEach(player => {
            if (this.playerState[player]) {
                const onCourt = courtSet.has(player);
                const onBench = benchSet.has(player);

                if (!onCourt && !onBench) {
                    this.removedPlayers.add(player);
                    this.playerState[player].status = 'Removed';
                    this.playerState[player].isOnCourt = false;
                } else {
                    this.removedPlayers.delete(player);
                }

                const wasOnCourt = this.playerState[player].isOnCourt;
                // Update position
                this.playerState[player].isOnCourt = onCourt;
                if (this.removedPlayers.has(player)) {
                    this.playerState[player].status = 'Removed';
                } else {
                    this.playerState[player].status = onCourt ? 'On_Court' : 'On_Bench';
                }

                // Update play times if provided
                if (playTimes && playTimes[player] !== undefined) {
                    this.playerState[player].totalTimePlayed = playTimes[player];
                    this.playerSeconds[player] = playTimes[player]; // Legacy sync
                }

                // Reset stint duration (we'll estimate it)
                this.playerState[player].currentStintDuration = 0;

                const nowOnCourt = this.playerState[player].isOnCourt;
                if (this.removedPlayers.has(player)) {
                    this.playerState[player].currentCourtStint = 0;
                    this.playerState[player].currentBenchStint = 0;
                } else if (wasOnCourt !== nowOnCourt) {
                    if (nowOnCourt) {
                        this.playerState[player].currentCourtStint = 0;
                        this.playerState[player].currentBenchStint = 0;
                    } else {
                        this.playerState[player].currentBenchStint = 0;
                        this.playerState[player].currentCourtStint = 0;
                    }
                }
            }
        });

        if (currentTime >= this.gameLength / 2) {
            this.halftimeRotationDone = true;
        }

        console.log(`   Synced at ${this.formatTime(currentTime)}: ${actualCourt.length} court, ${actualBench.length} bench`);
    }

    /**
     * Get analytics for compatibility with existing UI
     */
    getAnalytics(currentTime = this.currentTime) {
        const availablePlayers = this.players.filter(p => this.playerState[p] && !this.removedPlayers.has(p));
        const variance = this.calculateRealTimeVariance(availablePlayers);
        const dynamicVariance = this.getDynamicVarianceThreshold(currentTime);

        return {
            currentVariance: Math.round(variance),
            metrics: {
                algorithm: 'hybrid-preventative',
                checkInterval: this.checkInterval,
                idealShifts: this.idealShiftsPerPlayer,
                varianceThreshold: Math.round(dynamicVariance),
                minSubGap: Math.round(this.minSubstitutionGap),
                timeSinceLastSub: Math.round(currentTime - this.lastSubstitutionTime),
                currentTime: currentTime,
                meanPlayingTime: availablePlayers.length > 0 ? (5 * currentTime) / availablePlayers.length : 0,
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

    /**
     * Legacy methods for compatibility
     */
    compressRotations(rotations, subsPerChange = this.subsPerRotation, minGap = 60) {
        if (!Array.isArray(rotations)) return [];

        return rotations.filter(r => {
            return r &&
                   r.time &&
                   Array.isArray(r.off) &&
                   Array.isArray(r.on) &&
                   r.off.length === r.on.length &&
                   r.off.length > 0;
        }).sort((a, b) => a.time - b.time);
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BasketballIntervalOptimizer;
}

if (typeof window !== 'undefined') {
    window.BasketballIntervalOptimizer = BasketballIntervalOptimizer;
    console.log('🏀 Basketball Interval Optimizer v5.0 loaded - Complete Hybrid Algorithm');
}
