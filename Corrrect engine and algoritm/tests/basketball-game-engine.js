/**
 * Basketball Game Engine - FIXED VERSION
 * Ensures exactly 5 players on court at all times
 * Version 3.0 - Production Ready
 */

class BasketballGameEngine {
    constructor() {
        // Game configuration
        this.config = {
            format: 'halves',
            periodLength: 1200,
            numPeriods: 2,
            courtSpots: 5,  // ALWAYS 5
            defaultBench: 3,
            defaultRotationsPerChange: 2,
            autoConfirmRotations: false,
            warningBeepTime: 10
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
            onRecovery: null,
            onScoreUpdate: null
        };
        
        // Timer
        this.timerInterval = null;
        this.lastTickTime = null;
        this.warningPlayed = false;
        
        // Audio
        this.audio = {
            warningBeep: null,
            whistle: null,
            enabled: true
        };
        
        this.planTargetMinutes = 0;
        this.totalGameLength = 0;
        
        console.log('🏀 Basketball Game Engine v3.0 initialized');
    }
    
    /**
     * Validate court/bench state - CRITICAL METHOD
     */
    validatePlayerState() {
        const errors = [];
        
        // Check court has exactly 5
        if (this.players.court.length !== 5) {
            errors.push(`Court has ${this.players.court.length} players, should be 5`);
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
     */
    fixPlayerState() {
        console.warn('🔧 Fixing player state...');
        
        // Get all active players
        const activePlayers = this.players.all.filter(p => !this.players.removed.has(p));
        
        // Current court players (deduplicated)
        const currentCourt = [...new Set(this.players.court)];
        
        // If too many on court, move extras to bench
        if (currentCourt.length > 5) {
            const toRemove = currentCourt.length - 5;
            const removed = currentCourt.splice(5, toRemove);
            this.players.court = currentCourt.slice(0, 5);
            this.players.bench = [...new Set([...this.players.bench, ...removed])];
        }
        
        // If too few on court, pull from bench
        else if (currentCourt.length < 5) {
            const needed = 5 - currentCourt.length;
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
        
        const now = Date.now();
        const elapsed = Math.round((now - this.lastTickTime) / 1000);
        this.lastTickTime = now;
        
        for (let i = 0; i < Math.min(elapsed, 10); i++) {
            this.advanceOneSecond();
        }
        
        // Validate periodically
        if (this.state.currentTime % 30 === 0) {
            this.validatePlayerState();
        }
        
        if (this.callbacks.onUpdate) {
            this.callbacks.onUpdate(this.getState());
        }
    }
    
    /**
     * Advance game by one second
     */
    advanceOneSecond() {
        this.state.currentTime++;
        this.state.periodElapsed++;
        
        // Update player minutes
        this.players.court.forEach(player => {
            this.players.minutes[player] = (this.players.minutes[player] || 0) + 1;
        });
        
        this.players.bench.forEach(player => {
            this.players.benchMinutes[player] = (this.players.benchMinutes[player] || 0) + 1;
        });
        
        // Check for rotation timing
        if (this.rotations.nextScheduled && !this.rotations.pending) {
            const timeToRotation = this.rotations.nextScheduled.time - this.state.currentTime;
            
            if (timeToRotation === this.config.warningBeepTime && !this.warningPlayed) {
                this.warningPlayed = true;
                if (this.audio.enabled) {
                    this.playSound('warningBeep');
                }
                if (this.callbacks.onWarning) {
                    this.callbacks.onWarning(timeToRotation);
                }
            }
            
            if (timeToRotation <= 0) {
                this.triggerRotation(this.rotations.nextScheduled);
            }
        }
        
        if (this.state.periodElapsed >= this.config.periodLength) {
            this.handlePeriodEnd();
        }
    }
    
    /**
     * Trigger a scheduled rotation
     */
    triggerRotation(rotation) {
        console.log(`🔄 Rotation triggered at ${this.formatTime(this.state.currentTime)}`);
        console.log(`   OFF: [${rotation.off.join(', ')}]`);
        console.log(`   ON: [${rotation.on.join(', ')}]`);
        
        this.rotations.pending = true;
        this.rotations.pendingOff = rotation.off;
        this.rotations.pendingOn = rotation.on;
        this.rotations.pendingTime = this.state.currentTime;
        this.warningPlayed = false;
        
        if (this.config.autoConfirmRotations) {
            setTimeout(() => this.confirmRotation(), 100);
        } else {
            if (this.callbacks.onRotation) {
                this.callbacks.onRotation({
                    pending: true,
                    off: rotation.off,
                    on: rotation.on,
                    time: this.state.currentTime
                });
            }
            
            if (this.audio.enabled) {
                this.playSound('whistle');
            }
        }
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
        } else {
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
        
        activePlayers.forEach(player => {
            const minutes = this.players.minutes[player] || 0;
            const benchMinutes = this.players.benchMinutes[player] || 0;
            
            stats.players[player] = {
                minutes: minutes,
                benchMinutes: benchMinutes,
                percentage: ((minutes / this.state.currentTime) * 100).toFixed(1)
            };
            
            totalMinutes += minutes;
            
            if (minutes > stats.maxMinutes) stats.maxMinutes = minutes;
            if (stats.minMinutes === 0 || minutes < stats.minMinutes) stats.minMinutes = minutes;
        });
        
        stats.variance = stats.maxMinutes - stats.minMinutes;
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
     */
    getState() {
        const analytics = this.enforcer ? this.enforcer.getAnalytics(this.state.currentTime) : null;
        
        // Always validate before returning state
        this.validatePlayerState();
        
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
            this.audio.warningBeep = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSpy0Oy9diMFl2+z5lU3HS6wzN2PhRMh');
            this.audio.whistle = new Audio('data:audio/wav;base64,UklGRkQGAABXQVZFZm10IBAAAAABAAEAIlYAAIhYAQACABAAZGF0YSAGAADJycnJyMjIx8fHx8bGxsbFxcXFxMTEw8PDw8LCwsLBwcHBwMDAwL+/v7++vr6+vb29vby8vLu7u7u6urq6ubm5ubm5ubi4uLi3t7e3t7e2tra2tbW1tbW1tLSz');
            
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
    console.log('🏀 Basketball Game Engine v3.0 loaded - Always 5 players on court');
}
