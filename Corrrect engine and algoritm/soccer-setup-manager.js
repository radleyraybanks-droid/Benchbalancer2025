/**
 * Soccer Setup Manager
 * Handles game setup with goalkeeper management and variable player counts
 * Supports 4-11 starting players, 0-6 bench players, 0-1 goalkeepers
 * Version 1.0
 */

import { SoccerIntervalOptimizer } from './soccer-interval-optimizer.js';
import { benchBalancerSupabase } from './config/simple-supabase.js';

export class SoccerSetup {
    constructor() {
        // Initialize config with defaults
        this.config = {
            minutesPerPeriod: 20,
            numOnField: 9,          // 4-11 players on field
            numGoalkeepers: 1,       // 0-1 goalkeepers
            numReserves: 3,          // 0-6 bench players
            enableWarningSound: true,
            starterNames: [],
            starterNumbers: [],
            reserveNames: [],
            reserveNumbers: [],
            playerData: {}
        };

        // Initialize elements object
        this.elements = {};

        // Load saved lineup from Supabase first
        const loadPromise = this.loadSavedLineupFromSupabase();
        const timeoutPromise = new Promise(resolve => setTimeout(resolve, 2000));

        Promise.race([loadPromise, timeoutPromise])
            .catch(err => {
                console.warn('Lineup load failed or timed out:', err);
            })
            .finally(() => {
                this.initializeElements();
                this.attachEventListeners();
                this.generatePlayerInputs();
                this.addJerseyNumberValidation();
            });

        console.log('⚽ Soccer Setup Manager v1.0 initialized');
    }

    /**
     * Initialize DOM element references
     */
    initializeElements() {
        console.log('🔧 Initializing DOM elements...');

        // Form elements
        this.elements.minsPerPeriod = document.getElementById('minsPerPeriod');
        this.elements.numOnField = document.getElementById('numOnField');
        this.elements.numGoalkeepers = document.getElementById('numGoalkeepers');
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
        if (this.elements.minsPerPeriod) {
            this.elements.minsPerPeriod.value = this.config.minutesPerPeriod;
        }
        if (this.elements.numOnField) {
            this.elements.numOnField.value = this.config.numOnField;
        }
        if (this.elements.numGoalkeepers) {
            this.elements.numGoalkeepers.value = this.config.numGoalkeepers;
        }
        if (this.elements.numReserves) {
            this.elements.numReserves.value = this.config.numReserves;
        }

        // Calculate initial ideal shifts
        this.config.idealShiftsPerPlayer = this.calculateAutoIdealShifts(
            this.config.numOnField + this.config.numReserves
        );

        this.updateRosterSize();

        console.log('✅ DOM elements initialized');
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Minutes per half change
        this.elements.minsPerPeriod?.addEventListener('input', (e) => {
            this.config.minutesPerPeriod = parseInt(e.target.value) || 20;
        });

        // Number on field change
        this.elements.numOnField?.addEventListener('change', (e) => {
            this.config.numOnField = parseInt(e.target.value) || 9;
            this.updateRosterSize();
            this.generatePlayerInputs();
            this.addJerseyNumberValidation();
        });

        // Number of goalkeepers change
        this.elements.numGoalkeepers?.addEventListener('change', (e) => {
            this.config.numGoalkeepers = parseInt(e.target.value);
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
        const totalRoster = this.config.numOnField + this.config.numReserves;
        if (this.elements.rosterSizeIndicator) {
            this.elements.rosterSizeIndicator.textContent = `(Total Squad: ${totalRoster})`;
        }
        this.config.idealShiftsPerPlayer = this.calculateAutoIdealShifts(totalRoster);
    }

    /**
     * Calculate ideal shifts based on roster and field size
     */
    calculateAutoIdealShifts(totalPlayers) {
        const fieldSpots = this.config.numOnField;
        const benchPlayers = Math.max(0, totalPlayers - fieldSpots);

        if (benchPlayers === 0) {
            return 1;
        }

        const minutesPerPeriod = this.config.minutesPerPeriod || 20;
        const numPeriods = 2; // Soccer has 2 halves
        const gameLength = minutesPerPeriod * 60 * numPeriods;

        const protectedTime = Math.min(numPeriods * 45, gameLength * 0.4);
        const effectivePlayable = Math.max(1, gameLength - protectedTime);

        // For soccer with GK, only outfield players rotate
        const rotatingFieldSpots = this.config.numGoalkeepers === 1 ? fieldSpots - 1 : fieldSpots;
        const rotatingPlayers = this.config.numGoalkeepers === 1 ? totalPlayers - 1 : totalPlayers;

        const targetSecondsPerPlayer = rotatingPlayers > 0
            ? (gameLength * rotatingFieldSpots) / rotatingPlayers
            : gameLength;

        const desiredFieldStint = Math.min(
            Math.max(targetSecondsPerPlayer / 2, 180),
            Math.max(240, Math.min(600, targetSecondsPerPlayer))
        );

        const baseEstimate = Math.max(1, Math.round(targetSecondsPerPlayer / desiredFieldStint));
        const playersPerRotation = Math.min(2, benchPlayers);

        const candidateSet = new Set();
        for (let shift = Math.max(1, baseEstimate - 1); shift <= baseEstimate + 2; shift++) {
            candidateSet.add(shift);
        }
        candidateSet.add(2);

        const candidates = Array.from(candidateSet).sort((a, b) => a - b);
        for (const candidate of candidates) {
            if (candidate <= 0) continue;
            const entries = benchPlayers * candidate;
            const rotationsNeeded = playersPerRotation > 0 ? Math.ceil(entries / playersPerRotation) : 0;
            if (rotationsNeeded === 0) continue;
            const spacing = effectivePlayable / rotationsNeeded;
            if (spacing >= 120) {
                return Math.max(2, Math.min(candidate, 4));
            }
            if (spacing >= 90 && candidate <= 3) {
                return Math.max(2, Math.min(candidate, 3));
            }
        }

        return Math.max(2, Math.min(baseEstimate, 4));
    }

    /**
     * Generate position labels for soccer
     */
    generatePositionLabels(numPlayers, hasGK) {
        const positions = [];

        if (hasGK) {
            positions.push('GK');
            numPlayers--;
        }

        const outfieldPlayers = numPlayers;

        if (outfieldPlayers <= 3) {
            positions.push('DF');
            for (let i = 1; i < outfieldPlayers; i++) {
                positions.push(i < outfieldPlayers - 1 ? 'MF' : 'FW');
            }
        } else if (outfieldPlayers <= 6) {
            positions.push('DF', 'DF');
            const remaining = outfieldPlayers - 2;
            const mf = Math.ceil(remaining / 2);
            const fw = remaining - mf;
            for (let i = 0; i < mf; i++) positions.push('MF');
            for (let i = 0; i < fw; i++) positions.push('FW');
        } else {
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
     * Generate player input fields
     */
    generatePlayerInputs() {
        console.log('⚽ Generating player inputs...');
        console.log('   numOnField:', this.config.numOnField);
        console.log('   numGoalkeepers:', this.config.numGoalkeepers);
        console.log('   numReserves:', this.config.numReserves);

        const hasGK = this.config.numGoalkeepers === 1;
        const positions = this.generatePositionLabels(this.config.numOnField, hasGK);

        const positionNames = {
            'GK': 'Goalkeeper',
            'DF': 'Defender',
            'MF': 'Midfielder',
            'FW': 'Forward'
        };

        // Load default lineup from Pro Squad Data
        let defaultStarters = [];
        let defaultReserves = [];

        const savedLineupStr = localStorage.getItem('benchbalancer_default_lineup_soccer');
        const proSquadStr = localStorage.getItem('benchbalancer_pro_squad_soccer');

        if (savedLineupStr && proSquadStr) {
            try {
                const savedLineup = JSON.parse(savedLineupStr);
                const proSquad = JSON.parse(proSquadStr);
                const playerMap = {};
                proSquad.forEach(p => playerMap[p.id] = { name: p.name, jersey: p.jersey });

                if (savedLineup.starting) {
                    defaultStarters = savedLineup.starting.map(id => playerMap[id]).filter(p => p);
                }
                if (savedLineup.bench) {
                    defaultReserves = savedLineup.bench.map(id => playerMap[id]).filter(p => p);
                }
                console.log('   Loaded saved lineup:', defaultStarters.length, 'starters,', defaultReserves.length, 'reserves');
            } catch (e) {
                console.error("Error loading default lineup for soccer:", e);
            }
        }

        // Generate starter inputs
        if (this.elements.starterNamesContainer) {
            console.log(`✅ Generating ${this.config.numOnField} starter inputs...`);
            this.elements.starterNamesContainer.innerHTML = '';

            for (let i = 0; i < this.config.numOnField; i++) {
                const row = document.createElement('div');
                row.className = 'player-input-row';
                const prefilledData = defaultStarters[i] || {};
                const prefilledName = prefilledData.name || "";
                const prefilledNum = prefilledData.jersey || "";

                const pos = positions[i] || 'MF';
                const isGK = pos === 'GK';
                const placeholder = isGK ? 'Goalkeeper' : `Player ${i + 1}`;

                row.innerHTML = `
                    <span class="position-label ${isGK ? 'gk-label' : ''}" title="${positionNames[pos]}">${pos}</span>
                    <input type="text"
                           class="player-name-input"
                           id="starter${i}"
                           placeholder="${placeholder}"
                           value="${prefilledName}">
                    <input type="text"
                           class="jersey-number-input"
                           id="starterNum${i}"
                           placeholder="#"
                           maxlength="2"
                           value="${prefilledNum}">
                `;
                this.elements.starterNamesContainer.appendChild(row);
            }
            console.log(`✅ Created ${this.config.numOnField} starter inputs`);
        }

        // Generate reserve inputs
        if (this.elements.reserveNamesContainer) {
            console.log(`✅ Generating ${this.config.numReserves} reserve inputs...`);
            this.elements.reserveNamesContainer.innerHTML = '';

            for (let i = 0; i < this.config.numReserves; i++) {
                const row = document.createElement('div');
                row.className = 'reserve-input-row';
                const prefilledData = defaultReserves[i] || {};
                const prefilledName = prefilledData.name || "";
                const prefilledNum = prefilledData.jersey || "";

                row.innerHTML = `
                    <input type="text"
                           class="player-name-input"
                           id="reserve${i}"
                           placeholder="Reserve ${i + 1}"
                           value="${prefilledName}">
                    <input type="text"
                           class="jersey-number-input"
                           id="reserveNum${i}"
                           placeholder="#"
                           maxlength="2"
                           value="${prefilledNum}">
                `;
                this.elements.reserveNamesContainer.appendChild(row);
            }
            console.log(`✅ Created ${this.config.numReserves} reserve inputs`);
        }
    }

    /**
     * Get player names and jersey numbers from inputs
     */
    getPlayerData() {
        this.config.starterNames = [];
        this.config.starterNumbers = [];
        this.config.reserveNames = [];
        this.config.reserveNumbers = [];
        this.config.playerData = {};

        const hasGK = this.config.numGoalkeepers === 1;
        const positions = this.generatePositionLabels(this.config.numOnField, hasGK);

        // Get starter names and numbers
        for (let i = 0; i < this.config.numOnField; i++) {
            const nameInput = document.getElementById(`starter${i}`);
            const numberInput = document.getElementById(`starterNum${i}`);

            const name = nameInput?.value?.trim() || `Player ${i + 1}`;
            let number = numberInput?.value?.trim() || String(i + 1);

            if (!/^\d{1,2}$/.test(number)) {
                number = String(i + 1);
            }

            this.config.starterNames.push(name);
            this.config.starterNumbers.push(number);

            const pos = positions[i] || 'MF';
            this.config.playerData[name] = {
                name: name,
                jerseyNumber: number,
                position: pos,
                isStarter: true,
                isGoalkeeper: pos === 'GK'
            };
        }

        // Get reserve names and numbers
        for (let i = 0; i < this.config.numReserves; i++) {
            const nameInput = document.getElementById(`reserve${i}`);
            const numberInput = document.getElementById(`reserveNum${i}`);

            const name = nameInput?.value?.trim() || `Reserve ${i + 1}`;
            let number = numberInput?.value?.trim() || String(20 + i);

            if (!/^\d{1,2}$/.test(number)) {
                number = String(20 + i);
            }

            this.config.reserveNames.push(name);
            this.config.reserveNumbers.push(number);

            this.config.playerData[name] = {
                name: name,
                jerseyNumber: number,
                position: 'SUB',
                isStarter: false,
                isGoalkeeper: false
            };
        }

        return [...this.config.starterNames, ...this.config.reserveNames];
    }

    /**
     * Add jersey number validation
     */
    addJerseyNumberValidation() {
        document.querySelectorAll('.jersey-number-input').forEach(input => {
            input.addEventListener('input', function (e) {
                this.value = this.value.replace(/[^0-9]/g, '');
                if (this.value.length > 2) {
                    this.value = this.value.slice(0, 2);
                }
            });

            input.addEventListener('keypress', function (e) {
                const char = String.fromCharCode(e.which);
                if (!/[0-9]/.test(char)) {
                    e.preventDefault();
                }
            });
        });
    }

    /**
     * Show preliminary substitution plan
     */
    showPreliminaryPlan() {
        try {
            // Update config from form values
            this.config.minutesPerPeriod = parseInt(this.elements.minsPerPeriod?.value) || 20;
            this.config.numOnField = parseInt(this.elements.numOnField?.value) || 9;
            this.config.numGoalkeepers = parseInt(this.elements.numGoalkeepers?.value) || 1;
            this.config.numReserves = parseInt(this.elements.numReserves?.value) || 3;
            this.config.idealShiftsPerPlayer = this.calculateAutoIdealShifts(
                this.config.numOnField + this.config.numReserves
            );

            // Disable button
            if (this.elements.getPlanButton) {
                this.elements.getPlanButton.disabled = true;
                this.elements.getPlanButton.textContent = 'Analyzing...';
            }

            if (this.elements.preliminaryPlanOutput) {
                this.elements.preliminaryPlanOutput.innerHTML = '<p>Analyzing optimal rotations...</p>';
            }

            // Get player data
            this.getPlayerData();

            const totalPlayers = this.config.numOnField + this.config.numReserves;
            const gameLength = this.config.minutesPerPeriod * 2 * 60; // 2 halves
            const periodLength = this.config.minutesPerPeriod * 60;

            // Create optimizer
            const optimizer = new SoccerIntervalOptimizer({
                totalPlayers: totalPlayers,
                fieldSpots: this.config.numOnField,
                numGoalkeepers: this.config.numGoalkeepers,
                gameLength: gameLength,
                periodLength: periodLength,
                idealShiftsPerPlayer: this.config.idealShiftsPerPlayer,
                varianceThreshold: 90
            });

            // Initialize with player names
            const allPlayers = [...this.config.starterNames, ...this.config.reserveNames];
            if (!allPlayers || allPlayers.length < this.config.numOnField) {
                throw new Error(`Please configure at least ${this.config.numOnField} players`);
            }

            optimizer.initialize(allPlayers, {
                goalkeeper: this.config.numGoalkeepers === 1 ? this.config.starterNames[0] : null
            });

            // Generate plan
            const planObj = optimizer.generatePlan(0, []);
            if (!planObj) {
                throw new Error('Could not generate a plan with the current configuration');
            }

            // Display plan
            this.displayPreliminaryPlan({
                plan: planObj.rotations || [],
                targetMinutes: planObj.targetMinutes || Math.floor((gameLength * this.config.numOnField) / totalPlayers),
                expectedVariance: planObj.expectedVariance || 0
            }, optimizer);

        } catch (err) {
            console.error('Preliminary plan error:', err);
            if (this.elements.preliminaryPlanOutput) {
                this.elements.preliminaryPlanOutput.innerHTML =
                    `<p class="error-message">Error: ${err.message}</p>`;
            }
        } finally {
            if (this.elements.getPlanButton) {
                this.elements.getPlanButton.disabled = false;
                this.elements.getPlanButton.textContent = 'Show Preliminary Sub Plan';
            }
        }
    }

    /**
     * Display preliminary plan
     */
    displayPreliminaryPlan(plan, optimizer) {
        const hasGK = this.config.numGoalkeepers === 1;
        const gkName = hasGK ? this.config.starterNames[0] : null;

        let html = `
            <h4 style="color: var(--accent-cyan); margin-bottom: 15px;">⚽ Soccer Rotation Plan</h4>

            <div style="margin-bottom: 15px;">
                <p><strong>Game Format:</strong> 2 Halves × ${this.config.minutesPerPeriod} minutes</p>
                <p><strong>Roster:</strong> ${optimizer.totalPlayers} players (${this.config.numOnField} field + ${optimizer.benchSpots} bench)</p>
                ${hasGK ? `<p><strong>Goalkeeper:</strong> ${gkName} (protected from rotation)</p>` : ''}
                <p><strong>Strategy:</strong> Hybrid algorithm with ${this.config.idealShiftsPerPlayer} ideal shifts per outfield player</p>
            </div>

            <div style="background: rgba(0, 255, 224, 0.1); padding: 10px; border-radius: 5px; margin-bottom: 15px;">
                <p style="margin: 5px 0;"><strong>Target Minutes:</strong> ${plan.targetMinutes} per outfield player</p>
                <p style="margin: 5px 0;"><strong>Expected Variance:</strong> ${plan.expectedVariance} seconds</p>
                <p style="margin: 5px 0;"><strong>Total Rotations:</strong> ${plan.plan.length}</p>
                <p style="margin: 5px 0;"><strong>Max Field Stint:</strong> ${Math.floor(optimizer.proratedMaxFieldStint / 60)}:${(optimizer.proratedMaxFieldStint % 60).toString().padStart(2, '0')}</p>
            </div>
        `;

        // Add rotation schedule
        if (plan.plan.length > 0) {
            html += `
                <div style="max-height: 200px; overflow-y: auto;">
                    <h5 style="color: var(--accent-cyan); margin-bottom: 10px;">Rotation Schedule:</h5>
            `;

            plan.plan.forEach((rotation, index) => {
                const time = this.formatTime(rotation.time);

                const offPlayers = rotation.off.map(name => {
                    const data = this.config.playerData[name];
                    return data ? `#${data.jerseyNumber} ${name}` : name;
                }).join(', ');

                const onPlayers = rotation.on.map(name => {
                    const data = this.config.playerData[name];
                    return data ? `#${data.jerseyNumber} ${name}` : name;
                }).join(', ');

                html += `
                    <p style="margin: 8px 0; padding: 5px; background: rgba(0, 0, 0, 0.3); border-radius: 3px;">
                        <span style="color: #FFD700;">${time}</span> -
                        OFF: <span style="color: #FF8C00;">[${offPlayers}]</span> →
                        ON: <span style="color: #5CB85C;">[${onPlayers}]</span>
                    </p>
                `;
            });

            html += `</div>`;
        } else {
            html += `<p style="color: #999;">No rotations needed (no bench players available)</p>`;
        }

        // Variance message
        const targetVariance = 60;
        const warningVariance = 90;

        if (plan.expectedVariance <= targetVariance) {
            html += `
                <div style="background: rgba(76, 175, 80, 0.2); padding: 10px; border-radius: 5px; margin-top: 15px;">
                    <p style="color: #4CAF50; margin: 0;">
                        ✅ Excellent balance! Variance of ${plan.expectedVariance}s is within target.
                    </p>
                </div>
            `;
        } else if (plan.expectedVariance <= warningVariance) {
            html += `
                <div style="background: rgba(255, 165, 0, 0.2); padding: 10px; border-radius: 5px; margin-top: 15px;">
                    <p style="color: #ffa500; margin: 0;">
                        ⚠️ Marginal variance: ${plan.expectedVariance}s.
                        System will work to minimize during play.
                    </p>
                </div>
            `;
        } else {
            const varianceMinutes = Math.floor(plan.expectedVariance / 60);
            const varianceSeconds = plan.expectedVariance % 60;
            html += `
                <div style="background: rgba(255, 68, 68, 0.2); padding: 10px; border-radius: 5px; margin-top: 15px;">
                    <p style="color: #ff6b6b; margin: 0;">
                        ❌ High variance: ${varianceMinutes}:${varianceSeconds.toString().padStart(2, '0')} exceeds limits!
                    </p>
                </div>
            `;
        }

        this.elements.preliminaryPlanOutput.innerHTML = html;
    }

    /**
     * Validate setup configuration
     */
    validateSetup() {
        const errors = [];

        if (this.config.minutesPerPeriod < 1 || this.config.minutesPerPeriod > 60) {
            errors.push('Half length must be between 1 and 60 minutes');
        }

        const totalPlayers = this.config.numOnField + this.config.numReserves;
        if (totalPlayers < this.config.numOnField) {
            errors.push(`Must have at least ${this.config.numOnField} players`);
        }

        if (totalPlayers > 17) {
            errors.push('Maximum 17 players allowed');
        }

        if (this.config.numOnField < 4 || this.config.numOnField > 11) {
            errors.push('Field players must be between 4 and 11');
        }

        if (this.config.numReserves < 0 || this.config.numReserves > 6) {
            errors.push('Bench players must be between 0 and 6');
        }

        // Check for duplicate names
        const allNames = [...this.config.starterNames, ...this.config.reserveNames];
        const uniqueNames = new Set(allNames);
        if (uniqueNames.size < allNames.length) {
            errors.push('Player names must be unique');
        }

        // Check for duplicate jersey numbers
        const allNumbers = [...this.config.starterNumbers, ...this.config.reserveNumbers];
        const uniqueNumbers = new Set(allNumbers);
        if (uniqueNumbers.size < allNumbers.length) {
            errors.push('Jersey numbers must be unique');
        }

        return errors;
    }

    /**
     * Confirm setup and start game
     */
    confirmSetup() {
        console.log('Confirming soccer setup...');

        // Clear errors
        if (this.elements.setupError) {
            this.elements.setupError.textContent = '';
        }

        // Update config from form
        this.config.minutesPerPeriod = parseInt(this.elements.minsPerPeriod?.value) || 20;
        this.config.numOnField = parseInt(this.elements.numOnField?.value) || 9;
        this.config.numGoalkeepers = parseInt(this.elements.numGoalkeepers?.value) || 1;
        this.config.numReserves = parseInt(this.elements.numReserves?.value) || 3;
        this.config.idealShiftsPerPlayer = this.calculateAutoIdealShifts(
            this.config.numOnField + this.config.numReserves
        );
        this.config.enableWarningSound = this.elements.warningSoundToggle?.checked !== false;

        // Get player data
        this.getPlayerData();

        // Validate
        const errors = this.validateSetup();
        if (errors.length > 0) {
            if (this.elements.setupError) {
                this.elements.setupError.textContent = errors.join('. ');
            }
            return;
        }

        // Prepare setup data
        const setupData = {
            minutesPerPeriod: this.config.minutesPerPeriod,
            numOnField: this.config.numOnField,
            numGoalkeepers: this.config.numGoalkeepers,
            numReserves: this.config.numReserves,
            enableWarningSound: this.config.enableWarningSound,
            starterNames: this.config.starterNames,
            starterNumbers: this.config.starterNumbers,
            reserveNames: this.config.reserveNames,
            reserveNumbers: this.config.reserveNumbers,
            playerData: this.config.playerData,
            idealShiftsPerPlayer: this.config.idealShiftsPerPlayer
        };

        console.log('Setup data:', setupData);

        // Hide setup, show game
        document.getElementById('setup').classList.add('hidden');
        document.getElementById('game-container').classList.remove('hidden');

        // Scroll to top
        setTimeout(() => {
            window.scrollTo(0, 0);
            document.body.scrollTop = 0;
            document.documentElement.scrollTop = 0;
        }, 50);

        // Trigger game initialization
        if (window.startSoccerGame) {
            window.startSoccerGame(setupData);
        } else {
            console.error('Game initialization function not found');
            if (this.elements.setupError) {
                this.elements.setupError.textContent = 'Error: Game system not loaded properly';
            }
            document.getElementById('setup').classList.remove('hidden');
            document.getElementById('game-container').classList.add('hidden');
        }
    }

    /**
     * Format time for display
     */
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Load saved lineup from Supabase
     */
    async loadSavedLineupFromSupabase() {
        if (!benchBalancerSupabase) {
            console.log('Supabase not available, skipping lineup load');
            return;
        }

        try {
            const { data: { user } } = await benchBalancerSupabase.auth.getUser();
            if (!user) {
                console.log('No user logged in, skipping lineup load');
                return;
            }

            // Try to load soccer-specific lineup
            const { data, error } = await benchBalancerSupabase
                .from('default_lineups')
                .select('lineup_data')
                .eq('user_id', user.id)
                .eq('sport', 'soccer')
                .single();

            if (error && error.code !== 'PGRST116') {
                console.warn('Error loading lineup:', error);
                return;
            }

            if (data?.lineup_data) {
                localStorage.setItem('benchbalancer_default_lineup_soccer', JSON.stringify(data.lineup_data));
                console.log('Loaded soccer lineup from Supabase');
            }
        } catch (e) {
            console.warn('Failed to load lineup from Supabase:', e);
        }
    }

    /**
     * Load saved configuration
     */
    loadSavedConfig() {
        try {
            const saved = localStorage.getItem('soccerSetup');
            if (saved) {
                const config = JSON.parse(saved);

                if (config.minutesPerPeriod && this.elements.minsPerPeriod) {
                    this.elements.minsPerPeriod.value = config.minutesPerPeriod;
                    this.config.minutesPerPeriod = config.minutesPerPeriod;
                }
                if (config.numOnField && this.elements.numOnField) {
                    this.elements.numOnField.value = config.numOnField;
                    this.config.numOnField = config.numOnField;
                }
                if (config.numGoalkeepers !== undefined && this.elements.numGoalkeepers) {
                    this.elements.numGoalkeepers.value = config.numGoalkeepers;
                    this.config.numGoalkeepers = config.numGoalkeepers;
                }
                if (config.numReserves !== undefined && this.elements.numReserves) {
                    this.elements.numReserves.value = config.numReserves;
                    this.config.numReserves = config.numReserves;
                }
                if (config.enableWarningSound !== undefined && this.elements.warningSoundToggle) {
                    this.elements.warningSoundToggle.checked = config.enableWarningSound;
                    this.config.enableWarningSound = config.enableWarningSound;
                }

                this.updateRosterSize();
                this.generatePlayerInputs();
                console.log('Loaded saved configuration');
            }
        } catch (e) {
            console.warn('Could not load saved configuration:', e);
        }
    }

    /**
     * Save current configuration
     */
    saveConfig() {
        try {
            const config = {
                minutesPerPeriod: this.config.minutesPerPeriod,
                numOnField: this.config.numOnField,
                numGoalkeepers: this.config.numGoalkeepers,
                numReserves: this.config.numReserves,
                enableWarningSound: this.config.enableWarningSound
            };
            localStorage.setItem('soccerSetup', JSON.stringify(config));
            console.log('Saved configuration');
        } catch (e) {
            console.warn('Could not save configuration:', e);
        }
    }
}
