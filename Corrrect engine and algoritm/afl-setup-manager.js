/**
 * AFL Setup Manager - Auskick/Junior Australian Rules Football
 * Version 1.0 - Age Group Configuration and Line-Based Setup
 *
 * @fileoverview Manages game setup for AFL including age group selection,
 * field size configuration, and player/line management.
 */

import { AFLIntervalOptimizer } from './afl-interval-optimizer.js';
import { benchBalancerSupabase } from './config/simple-supabase.js';

export class AFLSetup {
    constructor() {
        // Initialize config with AFL-specific defaults
        this.config = {
            format: 'quarters',
            ageGroup: 'U11',
            minutesPerPeriod: 12,
            fieldSpots: 13,
            numReserves: 5,
            enableWarningSound: true,
            starterNames: [],
            starterNumbers: [],
            reserveNames: [],
            reserveNumbers: [],
            playerData: {},

            // AFL-specific line configuration
            lines: ['Ruck', 'Midfield', 'Forward', 'Back'],

            // Age group configurations
            ageGroupConfigs: {
                'U9': { fieldSpots: 9, minutesPerPeriod: 10 },
                'U10': { fieldSpots: 11, minutesPerPeriod: 11 },
                'U11': { fieldSpots: 13, minutesPerPeriod: 12 },
                'U12': { fieldSpots: 15, minutesPerPeriod: 13 }
            },

            // Algorithm Configuration
            varianceGoal: 45,
            maxSubsAtBreak: 15,
            maxSubsDuringPlay: 3,
            enableBreakMaximization: true,
            enablePhaseConstraints: true,
            gameProgressPhases: {
                early: 0.55,
                mid: 0.80,
                late: 1.0
            }
        };

        // Initialize elements object
        this.elements = {};

        // Initialize DOM elements
        this.initializeElements();
        this.attachEventListeners();
        this.generatePlayerInputs();
        this.addJerseyNumberValidation();

        // Load saved lineup from Supabase in background
        this.loadSavedLineupFromSupabase()
            .then(() => {
                this.generatePlayerInputs();
                this.addJerseyNumberValidation();
            })
            .catch(err => {
                console.warn('Lineup load failed:', err);
            });

        console.log('🏈 AFL Setup Manager v1.0 with Age Groups initialized');
    }

    /**
     * Initialize DOM element references
     */
    initializeElements() {
        console.log('🔧 Initializing DOM elements...');

        // AFL-specific form elements
        this.elements.ageGroup = document.getElementById('ageGroup');
        this.elements.minsPerPeriod = document.getElementById('minsPerPeriod');
        this.elements.fieldSpots = document.getElementById('fieldSpots');
        this.elements.numReserves = document.getElementById('numReserves');
        this.elements.warningSoundToggle = document.getElementById('warningSoundToggle');

        // Player name containers
        this.elements.starterNamesContainer = document.getElementById('starterNamesContainer');
        this.elements.reserveNamesContainer = document.getElementById('reserveNamesContainer');

        // Roster size indicator
        this.elements.rosterSizeIndicator = document.getElementById('rosterSizeIndicator');

        // Period label
        this.elements.periodLabel = document.getElementById('periodLabel');

        // Buttons
        this.elements.getPlanButton = document.getElementById('getPlanButton');
        this.elements.confirmSetupButton = document.getElementById('confirmSetupButton');

        // Output areas
        this.elements.preliminaryPlanOutput = document.getElementById('preliminaryPlanOutput');
        this.elements.setupError = document.getElementById('setupError');

        // Set initial values from config
        if (this.elements.ageGroup) {
            this.elements.ageGroup.value = this.config.ageGroup;
        }
        if (this.elements.minsPerPeriod) {
            this.elements.minsPerPeriod.value = this.config.minutesPerPeriod;
        }
        if (this.elements.fieldSpots) {
            this.elements.fieldSpots.value = this.config.fieldSpots;
        }
        if (this.elements.numReserves) {
            this.elements.numReserves.value = this.config.numReserves;
        }

        // Apply age group configuration
        this.applyAgeGroupConfig();

        console.log('✅ DOM elements initialized');
    }

    /**
     * Apply age group configuration
     */
    applyAgeGroupConfig() {
        const ageConfig = this.config.ageGroupConfigs[this.config.ageGroup];
        if (ageConfig) {
            this.config.fieldSpots = ageConfig.fieldSpots;
            this.config.minutesPerPeriod = ageConfig.minutesPerPeriod;

            if (this.elements.fieldSpots) {
                this.elements.fieldSpots.value = this.config.fieldSpots;
            }
            if (this.elements.minsPerPeriod) {
                this.elements.minsPerPeriod.value = this.config.minutesPerPeriod;
            }
        }
        this.updateRosterSize();
        this.config.idealShiftsPerPlayer = this.calculateAutoIdealShifts(
            this.config.fieldSpots + this.config.numReserves
        );
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Age group change
        this.elements.ageGroup?.addEventListener('change', (e) => {
            this.config.ageGroup = e.target.value;
            this.applyAgeGroupConfig();
            this.generatePlayerInputs();
            this.addJerseyNumberValidation();
        });

        // Minutes per period change
        this.elements.minsPerPeriod?.addEventListener('input', (e) => {
            this.config.minutesPerPeriod = parseInt(e.target.value) || 12;
        });

        // Field spots change (manual override)
        this.elements.fieldSpots?.addEventListener('change', (e) => {
            this.config.fieldSpots = parseInt(e.target.value) || 13;
            this.updateRosterSize();
            this.generatePlayerInputs();
            this.addJerseyNumberValidation();
        });

        // Number of reserves change
        this.elements.numReserves?.addEventListener('change', (e) => {
            this.config.numReserves = parseInt(e.target.value) || 0;
            this.updateRosterSize();
            this.generatePlayerInputs();
            this.addJerseyNumberValidation();
        });

        // Warning sound toggle
        this.elements.warningSoundToggle?.addEventListener('change', (e) => {
            this.config.enableWarningSound = e.target.checked;
        });

        // Get plan button
        this.elements.getPlanButton?.addEventListener('click', () => {
            this.showPreliminaryPlan();
        });

        // Confirm setup button
        this.elements.confirmSetupButton?.addEventListener('click', () => {
            this.confirmSetup();
        });
    }

    /**
     * Update roster size indicator
     */
    updateRosterSize() {
        const totalRoster = this.config.fieldSpots + this.config.numReserves;
        if (this.elements.rosterSizeIndicator) {
            this.elements.rosterSizeIndicator.textContent = `(TOTAL ROSTER: ${totalRoster})`;
        }
        this.config.idealShiftsPerPlayer = this.calculateAutoIdealShifts(totalRoster);
    }

    /**
     * Calculate ideal shifts per player
     */
    calculateAutoIdealShifts(totalPlayers) {
        const fieldSpots = this.config.fieldSpots;
        const benchPlayers = Math.max(0, totalPlayers - fieldSpots);

        if (benchPlayers === 0) {
            return 1;
        }

        const minutesPerPeriod = this.config.minutesPerPeriod || 12;
        const numPeriods = 4; // AFL always 4 quarters
        const gameLength = minutesPerPeriod * 60 * numPeriods;

        const protectedTime = Math.min(numPeriods * 30, gameLength * 0.3);
        const effectivePlayable = Math.max(1, gameLength - protectedTime);
        const targetSecondsPerPlayer = (gameLength * fieldSpots) / totalPlayers;

        const desiredFieldStint = Math.min(
            Math.max(targetSecondsPerPlayer / 3, 90),
            Math.max(120, Math.min(300, targetSecondsPerPlayer))
        );

        const baseEstimate = Math.max(1, Math.round(targetSecondsPerPlayer / desiredFieldStint));
        const playersPerRotation = Math.min(3, benchPlayers);

        const candidateSet = new Set();
        for (let shift = Math.max(1, baseEstimate - 1); shift <= baseEstimate + 2; shift++) {
            candidateSet.add(shift);
        }
        candidateSet.add(4);

        const candidates = Array.from(candidateSet).sort((a, b) => a - b);
        for (const candidate of candidates) {
            if (candidate <= 0) continue;
            const entries = benchPlayers * candidate;
            const rotationsNeeded = playersPerRotation > 0 ? Math.ceil(entries / playersPerRotation) : 0;
            if (rotationsNeeded === 0) continue;
            const spacing = effectivePlayable / rotationsNeeded;
            if (spacing >= 60) {
                return Math.max(3, Math.min(candidate, 6));
            }
            if (spacing >= 45 && candidate <= 5) {
                return Math.max(3, Math.min(candidate, 5));
            }
        }

        return Math.max(3, Math.min(baseEstimate, 5));
    }

    /**
     * Get line distribution for field spots
     */
    getLineDistribution() {
        const fieldSpots = this.config.fieldSpots;

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
     * Generate player input fields with line assignments
     */
    generatePlayerInputs() {
        console.log('🏈 Generating player inputs...');
        console.log('   fieldSpots:', this.config.fieldSpots);
        console.log('   numReserves:', this.config.numReserves);

        const distribution = this.getLineDistribution();
        const lineOrder = ['Ruck', 'Midfield', 'Forward', 'Back'];

        // Load saved lineup
        let defaultStarters = [];
        let defaultReserves = [];

        const savedLineupStr = localStorage.getItem('benchbalancer_afl_default_lineup');
        const proSquadStr = localStorage.getItem('benchbalancer_afl_squad');

        if (savedLineupStr && proSquadStr) {
            try {
                const savedLineup = JSON.parse(savedLineupStr);
                const proSquad = JSON.parse(proSquadStr);
                const playerMap = {};
                proSquad.forEach(p => playerMap[p.id] = { name: p.name, jersey: p.jersey, line: p.position });

                if (savedLineup.starting) {
                    defaultStarters = savedLineup.starting.map(id => playerMap[id]).filter(p => p);
                }
                if (savedLineup.bench) {
                    defaultReserves = savedLineup.bench.map(id => playerMap[id]).filter(p => p);
                }
                console.log('   Loaded saved lineup:', defaultStarters.length, 'starters,', defaultReserves.length, 'reserves');
            } catch (e) {
                console.error("Error loading default lineup for AFL:", e);
            }
        }

        // Generate starter inputs with line labels
        if (this.elements.starterNamesContainer) {
            let startersHTML = '';
            let playerIndex = 0;

            lineOrder.forEach(line => {
                const count = distribution[line] || 0;
                if (count > 0) {
                    startersHTML += `<div class="line-group">
                        <div class="line-label">${line.toUpperCase()}</div>
                        <div class="line-players">`;

                    for (let i = 0; i < count; i++) {
                        const defaultPlayer = defaultStarters[playerIndex];
                        const defaultName = defaultPlayer?.name || '';
                        const defaultJersey = defaultPlayer?.jersey || '';
                        const posLabel = line === 'Ruck' ? 'Ruck' : `${line.charAt(0)}${i + 1}`;

                        startersHTML += `
                            <div class="player-input-row" data-line="${line}">
                                <span class="position-label">${posLabel}</span>
                                <input type="text"
                                       class="player-name-input"
                                       placeholder="Player ${playerIndex + 1}"
                                       id="starter${playerIndex}"
                                       value="${defaultName}"
                                       autocomplete="off">
                                <input type="text"
                                       class="jersey-number-input"
                                       placeholder="#"
                                       id="starterJersey${playerIndex}"
                                       value="${defaultJersey}"
                                       maxlength="2"
                                       inputmode="numeric"
                                       pattern="[0-9]*"
                                       autocomplete="off">
                            </div>`;
                        playerIndex++;
                    }

                    startersHTML += `</div></div>`;
                }
            });

            this.elements.starterNamesContainer.innerHTML = startersHTML;
        }

        // Generate reserve inputs
        if (this.elements.reserveNamesContainer) {
            let reservesHTML = '';

            for (let i = 0; i < this.config.numReserves; i++) {
                const defaultPlayer = defaultReserves[i];
                const defaultName = defaultPlayer?.name || '';
                const defaultJersey = defaultPlayer?.jersey || '';

                reservesHTML += `
                    <div class="player-input-row interchange">
                        <span class="position-label">INT${i + 1}</span>
                        <input type="text"
                               class="player-name-input"
                               placeholder="Reserve ${i + 1}"
                               id="reserve${i}"
                               value="${defaultName}"
                               autocomplete="off">
                        <input type="text"
                               class="jersey-number-input"
                               placeholder="#"
                               id="reserveJersey${i}"
                               value="${defaultJersey}"
                               maxlength="2"
                               inputmode="numeric"
                               pattern="[0-9]*"
                               autocomplete="off">
                    </div>`;
            }

            this.elements.reserveNamesContainer.innerHTML = reservesHTML;
        }

        this.updateRosterSize();
        console.log('✅ Player inputs generated');
    }

    /**
     * Add jersey number validation
     */
    addJerseyNumberValidation() {
        const jerseyInputs = document.querySelectorAll('.jersey-number-input');
        jerseyInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                // Only allow numbers
                e.target.value = e.target.value.replace(/[^0-9]/g, '');
            });
        });
    }

    /**
     * Get all player data from inputs
     */
    getPlayerData() {
        const starterNames = [];
        const starterNumbers = [];
        const reserveNames = [];
        const reserveNumbers = [];
        const playerData = {};

        // Get starters
        for (let i = 0; i < this.config.fieldSpots; i++) {
            const nameInput = document.getElementById(`starter${i}`);
            const jerseyInput = document.getElementById(`starterJersey${i}`);
            const row = nameInput?.closest('.player-input-row');
            const line = row?.dataset.line || 'Midfield';

            const name = nameInput?.value?.trim() || `Player ${i + 1}`;
            const jersey = jerseyInput?.value?.trim() || String(i + 1);

            starterNames.push(name);
            starterNumbers.push(jersey);
            playerData[name] = {
                name: name,
                jerseyNumber: jersey,
                line: line,
                isStarter: true
            };
        }

        // Get reserves
        for (let i = 0; i < this.config.numReserves; i++) {
            const nameInput = document.getElementById(`reserve${i}`);
            const jerseyInput = document.getElementById(`reserveJersey${i}`);

            const name = nameInput?.value?.trim() || `Reserve ${i + 1}`;
            const jersey = jerseyInput?.value?.trim() || String(this.config.fieldSpots + i + 1);

            reserveNames.push(name);
            reserveNumbers.push(jersey);
            playerData[name] = {
                name: name,
                jerseyNumber: jersey,
                line: 'Interchange',
                isStarter: false
            };
        }

        this.config.starterNames = starterNames;
        this.config.starterNumbers = starterNumbers;
        this.config.reserveNames = reserveNames;
        this.config.reserveNumbers = reserveNumbers;
        this.config.playerData = playerData;

        return [...starterNames, ...reserveNames];
    }

    /**
     * Validate setup
     */
    validateSetup() {
        const errors = [];

        // Check period length
        if (this.config.minutesPerPeriod < 1 || this.config.minutesPerPeriod > 30) {
            errors.push('Quarter length must be between 1 and 30 minutes');
        }

        // Check roster size
        const totalRoster = this.config.fieldSpots + this.config.numReserves;
        if (totalRoster < 9 || totalRoster > 30) {
            errors.push('Total roster must be between 9 and 30 players');
        }

        // Check for duplicates
        const allNames = this.getPlayerData();
        const uniqueNames = new Set(allNames.filter(n => n && n.trim()));
        if (uniqueNames.size !== allNames.filter(n => n && n.trim()).length) {
            errors.push('Duplicate player names detected');
        }

        // Check jersey numbers for duplicates
        const allJerseys = [...this.config.starterNumbers, ...this.config.reserveNumbers].filter(j => j);
        const uniqueJerseys = new Set(allJerseys);
        if (uniqueJerseys.size !== allJerseys.length) {
            errors.push('Duplicate jersey numbers detected');
        }

        return errors;
    }

    /**
     * Show preliminary rotation plan
     */
    showPreliminaryPlan() {
        console.log('📋 Generating preliminary plan...');

        // Get player data
        this.getPlayerData();

        // Validate
        const errors = this.validateSetup();
        if (errors.length > 0) {
            this.showError(errors.join('. '));
            return;
        }

        // Create temporary optimizer
        const gameLength = this.config.minutesPerPeriod * 60 * 4; // 4 quarters
        const totalPlayers = this.config.fieldSpots + this.config.numReserves;

        const optimizer = new AFLIntervalOptimizer({
            gameLength: gameLength,
            periodLength: this.config.minutesPerPeriod * 60,
            totalPlayers: totalPlayers,
            fieldSpots: this.config.fieldSpots,
            idealShiftsPerPlayer: this.config.idealShiftsPerPlayer,
            subsPerRotation: 2
        });

        const allPlayers = [...this.config.starterNames, ...this.config.reserveNames];
        optimizer.initialize(allPlayers);

        const plan = optimizer.generatePlan(0, []);

        // Display plan
        let output = `
            <div class="plan-summary">
                <h3>🏈 ROTATION PLAN PREVIEW</h3>
                <div class="plan-info">
                    <div class="plan-stat">
                        <span class="stat-label">Age Group</span>
                        <span class="stat-value">${this.config.ageGroup}</span>
                    </div>
                    <div class="plan-stat">
                        <span class="stat-label">Game Format</span>
                        <span class="stat-value">4 × ${this.config.minutesPerPeriod} min</span>
                    </div>
                    <div class="plan-stat">
                        <span class="stat-label">Total Players</span>
                        <span class="stat-value">${totalPlayers}</span>
                    </div>
                    <div class="plan-stat">
                        <span class="stat-label">On Field</span>
                        <span class="stat-value">${this.config.fieldSpots}</span>
                    </div>
                    <div class="plan-stat">
                        <span class="stat-label">Target Minutes</span>
                        <span class="stat-value">${plan.targetMinutes} min</span>
                    </div>
                    <div class="plan-stat">
                        <span class="stat-label">Expected Variance</span>
                        <span class="stat-value">${plan.expectedVariance}s</span>
                    </div>
                    <div class="plan-stat">
                        <span class="stat-label">Planned Rotations</span>
                        <span class="stat-value">${plan.rotations.length}</span>
                    </div>
                </div>
            </div>
        `;

        // Show rotation schedule
        if (plan.rotations && plan.rotations.length > 0) {
            output += `<div class="rotation-schedule">
                <h4>ROTATION SCHEDULE</h4>
                <div class="rotation-list">`;

            plan.rotations.forEach((rotation, index) => {
                const mins = Math.floor(rotation.time / 60);
                const secs = rotation.time % 60;
                const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
                const quarter = Math.floor(rotation.time / (this.config.minutesPerPeriod * 60)) + 1;

                output += `
                    <div class="rotation-item">
                        <span class="rotation-time">Q${quarter} ${timeStr}</span>
                        <span class="rotation-off">OFF: ${rotation.off.map(p => {
                            const jersey = this.config.playerData[p]?.jerseyNumber || '';
                            return jersey ? `#${jersey} ${p}` : p;
                        }).join(', ')}</span>
                        <span class="rotation-on">ON: ${rotation.on.map(p => {
                            const jersey = this.config.playerData[p]?.jerseyNumber || '';
                            return jersey ? `#${jersey} ${p}` : p;
                        }).join(', ')}</span>
                    </div>`;
            });

            output += `</div></div>`;
        }

        // Player summary
        output += `<div class="player-summary">
            <h4>STARTING LINEUP</h4>
            <div class="player-grid">`;

        const distribution = this.getLineDistribution();
        let playerIdx = 0;

        ['Ruck', 'Midfield', 'Forward', 'Back'].forEach(line => {
            const count = distribution[line] || 0;
            for (let i = 0; i < count; i++) {
                const player = this.config.starterNames[playerIdx];
                const jersey = this.config.starterNumbers[playerIdx];
                output += `<div class="player-card">
                    <span class="jersey">#${jersey}</span>
                    <span class="name">${player}</span>
                    <span class="line-badge">${line}</span>
                </div>`;
                playerIdx++;
            }
        });

        output += `</div></div>`;

        // Interchange
        output += `<div class="player-summary">
            <h4>INTERCHANGE BENCH</h4>
            <div class="player-grid">`;

        this.config.reserveNames.forEach((player, i) => {
            const jersey = this.config.reserveNumbers[i];
            output += `<div class="player-card interchange">
                <span class="jersey">#${jersey}</span>
                <span class="name">${player}</span>
            </div>`;
        });

        output += `</div></div>`;

        if (this.elements.preliminaryPlanOutput) {
            this.elements.preliminaryPlanOutput.innerHTML = output;
            this.elements.preliminaryPlanOutput.classList.remove('hidden');
        }

        // Enable confirm button
        if (this.elements.confirmSetupButton) {
            this.elements.confirmSetupButton.disabled = false;
        }

        this.hideError();
    }

    /**
     * Confirm setup and start game
     */
    confirmSetup() {
        console.log('✅ Confirming setup...');

        // Get player data
        this.getPlayerData();

        // Validate
        const errors = this.validateSetup();
        if (errors.length > 0) {
            this.showError(errors.join('. '));
            return;
        }

        // Build setup data
        const setupData = {
            format: 'quarters',
            ageGroup: this.config.ageGroup,
            minutesPerPeriod: this.config.minutesPerPeriod,
            fieldSpots: this.config.fieldSpots,
            numReserves: this.config.numReserves,
            starterNames: this.config.starterNames,
            reserveNames: this.config.reserveNames,
            playerData: this.config.playerData,
            idealShiftsPerPlayer: this.config.idealShiftsPerPlayer,
            enableWarningSound: this.config.enableWarningSound,
            subsPerChange: 2
        };

        console.log('Setup data:', setupData);

        // Hide setup, show game
        const setupSection = document.getElementById('setupSection');
        const gameContainer = document.getElementById('gameContainer');

        if (setupSection) {
            setupSection.classList.add('hidden');
        }
        if (gameContainer) {
            gameContainer.classList.remove('hidden');
        }

        // Save config to localStorage
        localStorage.setItem('benchbalancer_afl_config', JSON.stringify(setupData));

        // Start the game
        if (typeof window.startAFLGame === 'function') {
            window.startAFLGame(setupData);
        } else {
            console.error('startAFLGame function not found');
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        if (this.elements.setupError) {
            this.elements.setupError.textContent = message;
            this.elements.setupError.classList.remove('hidden');
        }
    }

    /**
     * Hide error message
     */
    hideError() {
        if (this.elements.setupError) {
            this.elements.setupError.classList.add('hidden');
        }
    }

    /**
     * Load saved lineup from Supabase
     */
    async loadSavedLineupFromSupabase() {
        try {
            if (!benchBalancerSupabase) {
                console.log('Supabase not available');
                return;
            }

            const { data: { user } } = await benchBalancerSupabase.auth.getUser();
            if (!user) {
                console.log('No authenticated user');
                return;
            }

            // Load default lineup for AFL
            const { data: lineupData, error } = await benchBalancerSupabase
                .from('default_lineups')
                .select('*')
                .eq('user_id', user.id)
                .eq('sport', 'afl')
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('Error loading lineup:', error);
                return;
            }

            if (lineupData) {
                localStorage.setItem('benchbalancer_afl_default_lineup', JSON.stringify({
                    starting: lineupData.starting_players || [],
                    bench: lineupData.bench_players || []
                }));
                console.log('Loaded AFL lineup from Supabase');
            }

        } catch (err) {
            console.error('Error in loadSavedLineupFromSupabase:', err);
        }
    }

    /**
     * Reset setup to defaults
     */
    reset() {
        this.config.ageGroup = 'U11';
        this.config.minutesPerPeriod = 12;
        this.config.fieldSpots = 13;
        this.config.numReserves = 5;
        this.config.enableWarningSound = true;

        this.applyAgeGroupConfig();
        this.generatePlayerInputs();
        this.addJerseyNumberValidation();

        if (this.elements.preliminaryPlanOutput) {
            this.elements.preliminaryPlanOutput.innerHTML = '';
            this.elements.preliminaryPlanOutput.classList.add('hidden');
        }

        if (this.elements.confirmSetupButton) {
            this.elements.confirmSetupButton.disabled = true;
        }

        this.hideError();

        console.log('🔄 Setup reset to defaults');
    }
}
