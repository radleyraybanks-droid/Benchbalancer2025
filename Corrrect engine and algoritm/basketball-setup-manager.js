/**
 * Basketball Setup Manager - Fixed Jersey Number UI
 * Version 3.1 - Corrected input sizing and types
 */

class BasketballSetup {
    constructor() {
        // Initialize config with defaults including jersey numbers
        this.config = {
            format: 'halves',
            minutesPerPeriod: 20,
            numReserves: 3,
            rotationsPerChange: 2, // LEGACY: Keep for compatibility during transition
            enableWarningSound: true,
            starterNames: [],
            starterNumbers: [],  // NEW: Jersey numbers for starters
            reserveNames: [],
            reserveNumbers: [],  // NEW: Jersey numbers for reserves
            playerData: {}       // NEW: Combined player data object
        };
        
        // Initialize elements object
        this.elements = {};
        
        // Then initialize DOM elements
        this.initializeElements();
        this.attachEventListeners();
        this.generatePlayerInputs();
        this.addJerseyNumberValidation();
        
        console.log('🏀 Basketball Setup Manager v3.1 with Jersey Numbers initialized');
    }
    
    /**
     * Initialize DOM element references
     */
    initializeElements() {
        // Form elements
        this.elements.gameFormat = document.getElementById('gameFormat');
        this.elements.minsPerPeriod = document.getElementById('minsPerPeriod');
        this.elements.numReserves = document.getElementById('numReserves');
        this.elements.subsPerChange = document.getElementById('subsPerChange'); // LEGACY compatibility
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
        if (this.elements.gameFormat) {
            this.elements.gameFormat.value = this.config.format;
        }
        if (this.elements.minsPerPeriod) {
            this.elements.minsPerPeriod.value = this.config.minutesPerPeriod;
        }
        if (this.elements.numReserves) {
            this.elements.numReserves.value = this.config.numReserves;
        }
        if (this.elements.subsPerChange) {
            this.elements.subsPerChange.value = this.config.rotationsPerChange; // Legacy compatibility
        }

        // Establish initial auto-calculated shifts
        this.config.idealShiftsPerPlayer = this.calculateAutoIdealShifts(5 + this.config.numReserves);
        this.updateLegacyRotationPreference();
    }
    
    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Game format change
        this.elements.gameFormat?.addEventListener('change', (e) => {
            this.config.format = e.target.value;
            this.updatePeriodLabel();
        });
        
        // Minutes per period change
        this.elements.minsPerPeriod?.addEventListener('input', (e) => {
            this.config.minutesPerPeriod = parseInt(e.target.value) || 20;
        });
        
        // Number of reserves change
        this.elements.numReserves?.addEventListener('change', (e) => {
            this.config.numReserves = parseInt(e.target.value) || 0;
            this.updateRosterSize();
            this.generatePlayerInputs();
            this.addJerseyNumberValidation();
        });

        // LEGACY: Substitutions per change (for backwards compatibility)
        this.elements.subsPerChange?.addEventListener('change', (e) => {
            this.config.rotationsPerChange = parseInt(e.target.value) || 1;
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
     * Update period label based on format
     */
    updatePeriodLabel() {
        if (this.elements.periodLabel) {
            this.elements.periodLabel.textContent = 
                this.config.format === 'quarters' ? 'Minutes per Quarter:' : 'Minutes per Half:';
        }
    }
    
    /**
     * Update roster size indicator
     */
    updateRosterSize() {
        const totalRoster = 5 + this.config.numReserves;
        if (this.elements.rosterSizeIndicator) {
            this.elements.rosterSizeIndicator.textContent = `(Total Roster: ${totalRoster})`;
        }
        this.config.idealShiftsPerPlayer = this.calculateAutoIdealShifts(totalRoster);
        this.updateLegacyRotationPreference();
    }

    /**
     * Automatically determine ideal shifts per player based on roster size
     * Mirrors production heuristic for balancing variance without manual input
     */
    calculateAutoIdealShifts(totalPlayers) {
        const courtSpots = 5;
        const benchPlayers = Math.max(0, totalPlayers - courtSpots);
        if (benchPlayers === 0) {
            return 1;
        }

        const minutesPerPeriod = this.config.minutesPerPeriod || 20;
        const numPeriods = this.config.format === 'quarters' ? 4 : 2;
        const gameLength = minutesPerPeriod * 60 * numPeriods;

        const protectedTime = Math.min(numPeriods * 45, gameLength * 0.4);
        const effectivePlayable = Math.max(1, gameLength - protectedTime);
        const targetSecondsPerPlayer = (gameLength * courtSpots) / totalPlayers;

        const desiredCourtStint = Math.min(
            Math.max(targetSecondsPerPlayer / 2, 150),
            Math.max(180, Math.min(360, targetSecondsPerPlayer))
        );

        const baseEstimate = Math.max(1, Math.round(targetSecondsPerPlayer / desiredCourtStint));
        const playersPerRotation = Math.min(2, benchPlayers);

        const candidateSet = new Set();
        for (let shift = Math.max(1, baseEstimate - 1); shift <= baseEstimate + 2; shift++) {
            candidateSet.add(shift);
        }
        candidateSet.add(2);

        const candidates = Array.from(candidateSet).sort((a, b) => a - b);
        for (const candidate of candidates) {
            if (candidate <= 0) {
                continue;
            }
            const entries = benchPlayers * candidate;
            const rotationsNeeded = playersPerRotation > 0 ? Math.ceil(entries / playersPerRotation) : 0;
            if (rotationsNeeded === 0) {
                continue;
            }
            const spacing = effectivePlayable / rotationsNeeded;
            if (spacing >= 75) {
                return Math.max(2, Math.min(candidate, 4));
            }
            if (spacing >= 55 && candidate <= 3) {
                return Math.max(2, Math.min(candidate, 3));
            }
        }

        return Math.max(2, Math.min(baseEstimate, 4));
    }

    /**
     * Keep legacy rotation preference in sync with automatically calculated shifts
     */
    updateLegacyRotationPreference() {
        this.config.rotationsPerChange = this.config.idealShiftsPerPlayer >= 5 ? 2 : 1;
        if (this.elements.subsPerChange) {
            this.elements.subsPerChange.value = this.config.rotationsPerChange;
        }
    }
    
    /**
     * Generate player input fields WITH JERSEY NUMBERS (Fixed UI)
     */
    generatePlayerInputs() {
        const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
        const positionNames = {
            'PG': 'Point Guard',
            'SG': 'Shooting Guard',
            'SF': 'Small Forward',
            'PF': 'Power Forward',
            'C': 'Center'
        };
        
        // Generate starter inputs with properly sized jersey numbers
        if (this.elements.starterNamesContainer) {
            this.elements.starterNamesContainer.innerHTML = '';
            
            for (let i = 0; i < 5; i++) {
                const row = document.createElement('div');
                row.className = 'player-input-row';
                row.innerHTML = `
                    <span class="position-label" title="${positionNames[positions[i]]}">${positions[i]}</span>
                    <input type="text" 
                           class="player-name-input" 
                           id="starter${i}" 
                           placeholder="Player ${i + 1}"
                           value="">
                    <input type="text" 
                           class="jersey-number-input" 
                           id="starterNum${i}" 
                           placeholder="#"
                           maxlength="2"
                           value="">
                `;
                this.elements.starterNamesContainer.appendChild(row);
            }
        }
        
        // Generate reserve inputs with properly sized jersey numbers
        if (this.elements.reserveNamesContainer) {
            this.elements.reserveNamesContainer.innerHTML = '';
            
            for (let i = 0; i < this.config.numReserves; i++) {
                const row = document.createElement('div');
                row.className = 'reserve-input-row';
                row.innerHTML = `
                    <input type="text" 
                           class="player-name-input" 
                           id="reserve${i}" 
                           placeholder="Reserve ${i + 1}"
                           value="">
                    <input type="text" 
                           class="jersey-number-input" 
                           id="reserveNum${i}" 
                           placeholder="#"
                           maxlength="2"
                           value="">
                `;
                this.elements.reserveNamesContainer.appendChild(row);
            }
        }
    }
    
    /**
     * Get player names AND jersey numbers from inputs (Updated for text inputs)
     */
    getPlayerData() {
        // Reset arrays
        this.config.starterNames = [];
        this.config.starterNumbers = [];
        this.config.reserveNames = [];
        this.config.reserveNumbers = [];
        this.config.playerData = {};
        
        // Get starter names and numbers
        for (let i = 0; i < 5; i++) {
            const nameInput = document.getElementById(`starter${i}`);
            const numberInput = document.getElementById(`starterNum${i}`);
            
            const name = nameInput?.value?.trim() || `Player ${i + 1}`;
            // Parse jersey number from text input, allow any 1-2 digit number
            let number = numberInput?.value?.trim() || String(i + 1);
            
            // Validate jersey number (must be numeric, 0-99)
            if (!/^\d{1,2}$/.test(number)) {
                number = String(i + 1); // Default if invalid
            }
            
            this.config.starterNames.push(name);
            this.config.starterNumbers.push(number);
            
            // Store combined data
            this.config.playerData[name] = {
                name: name,
                jerseyNumber: number,
                position: ['PG', 'SG', 'SF', 'PF', 'C'][i],
                isStarter: true
            };
        }
        
        // Get reserve names and numbers
        for (let i = 0; i < this.config.numReserves; i++) {
            const nameInput = document.getElementById(`reserve${i}`);
            const numberInput = document.getElementById(`reserveNum${i}`);
            
            const name = nameInput?.value?.trim() || `Reserve ${i + 1}`;
            // Parse jersey number from text input
            let number = numberInput?.value?.trim() || String(10 + i);
            
            // Validate jersey number
            if (!/^\d{1,2}$/.test(number)) {
                number = String(10 + i); // Default if invalid
            }
            
            this.config.reserveNames.push(name);
            this.config.reserveNumbers.push(number);
            
            // Store combined data
            this.config.playerData[name] = {
                name: name,
                jerseyNumber: number,
                position: 'SUB',
                isStarter: false
            };
        }
        
        return [...this.config.starterNames, ...this.config.reserveNames];
    }
    
    /**
     * Add input validation to restrict jersey number inputs to numbers only
     */
    addJerseyNumberValidation() {
        // Add this after generating inputs
        document.querySelectorAll('.jersey-number-input').forEach(input => {
            input.addEventListener('input', function(e) {
                // Remove any non-numeric characters
                this.value = this.value.replace(/[^0-9]/g, '');
                // Limit to 2 digits
                if (this.value.length > 2) {
                    this.value = this.value.slice(0, 2);
                }
            });
            
            // Prevent non-numeric key presses
            input.addEventListener('keypress', function(e) {
                const char = String.fromCharCode(e.which);
                if (!/[0-9]/.test(char)) {
                    e.preventDefault();
                }
            });
        });
    }
    
    /**
     * Show preliminary plan WITH JERSEY NUMBERS
     */
    showPreliminaryPlan() {
        try {
            // Update config from current form values
            this.config.format = this.elements.gameFormat?.value || 'halves';
            this.config.minutesPerPeriod = parseInt(this.elements.minsPerPeriod?.value) || 20;
            this.config.numReserves = parseInt(this.elements.numReserves?.value) || 3;
            this.config.idealShiftsPerPlayer = this.calculateAutoIdealShifts(5 + this.config.numReserves);
            this.updateLegacyRotationPreference();
            if (this.elements.subsPerChange) {
                this.config.rotationsPerChange = parseInt(this.elements.subsPerChange.value) || 2; // Legacy
            }
            
            // Disable button temporarily
            if (this.elements.getPlanButton) {
                this.elements.getPlanButton.disabled = true;
                this.elements.getPlanButton.textContent = 'Analyzing...';
            }

            // Show analyzing state
            if (this.elements.preliminaryPlanOutput) {
                this.elements.preliminaryPlanOutput.innerHTML = '<p>Analyzing optimal rotations...</p>';
            }

            // Get player names and jersey numbers
            this.getPlayerData();

            const totalPlayers = 5 + this.config.numReserves;
            const gameLength = this.config.minutesPerPeriod *
                              (this.config.format === 'quarters' ? 4 : 2) * 60;
            const periodLength = this.config.minutesPerPeriod * 60;
            // Note: subsPerRotation no longer used in hybrid algorithm, but kept for compatibility

            if (!window.BasketballIntervalOptimizer) {
                throw new Error('Optimizer script not loaded');
            }

            // Create optimizer with NEW hybrid configuration
            const optimizer = new BasketballIntervalOptimizer({
                totalPlayers: totalPlayers,
                courtSpots: 5,
                gameLength: gameLength,
                periodLength: periodLength,
                idealShiftsPerPlayer: this.config.idealShiftsPerPlayer, // NEW: Primary configuration
                varianceThreshold: 90, // NEW: Variance control threshold
                // Legacy compatibility parameters (not used in hybrid algorithm)
                subsPerRotation: 1, // Placeholder for compatibility
                minRotationGapSec: 120 // Placeholder for compatibility
            });

            // Initialize with player names
            const allPlayers = [...this.config.starterNames, ...this.config.reserveNames];
            if (!allPlayers || allPlayers.length < 5) {
                throw new Error('Please configure at least 5 players');
            }
            optimizer.initialize(allPlayers);

            // Generate plan
            const planObj = optimizer.generatePlan(0, []);
            if (!planObj) {
                throw new Error('Could not generate a plan with the current configuration');
            }

            // Display plan with jersey numbers
            this.displayPreliminaryPlan({
                plan: planObj.rotations || [],
                targetMinutes: planObj.targetMinutes || Math.floor((gameLength * 5) / totalPlayers),
                expectedVariance: planObj.expectedVariance || 0
            }, optimizer);

        } catch (err) {
            console.error('Preliminary plan error:', err);
            if (this.elements.preliminaryPlanOutput) {
                this.elements.preliminaryPlanOutput.innerHTML = 
                    `<p class="error-message">Error: ${err.message}</p>`;
            }
        } finally {
            // Re-enable button
            if (this.elements.getPlanButton) {
                this.elements.getPlanButton.disabled = false;
                this.elements.getPlanButton.textContent = 'Show Preliminary Sub Plan';
            }
        }
    }
    
    /**
     * Display preliminary plan WITH JERSEY NUMBERS
     */
    displayPreliminaryPlan(plan, optimizer) {
        let html = `
            <h4 style="color: var(--accent-cyan); margin-bottom: 15px;">🏀 Basketball Rotation Plan</h4>
            
            <div style="margin-bottom: 15px;">
                <p><strong>Game Format:</strong> ${this.config.format === 'quarters' ? '4 Quarters' : '2 Halves'} × ${this.config.minutesPerPeriod} minutes</p>
                <p><strong>Roster:</strong> ${optimizer.totalPlayers} players (5 court + ${optimizer.benchSpots} bench)</p>
                <p><strong>Strategy:</strong> Hybrid algorithm with ${this.config.idealShiftsPerPlayer} ideal shifts per player</p>
                <p><strong>Sub Decision:</strong> System determines 1 or 2 subs based on urgency</p>
            </div>
            
            <div style="background: rgba(0, 255, 224, 0.1); padding: 10px; border-radius: 5px; margin-bottom: 15px;">
                <p style="margin: 5px 0;"><strong>Target Minutes:</strong> ${plan.targetMinutes} per player</p>
                <p style="margin: 5px 0;"><strong>Expected Variance:</strong> ${plan.expectedVariance} seconds</p>
                <p style="margin: 5px 0;"><strong>Total Rotations:</strong> ${plan.plan.length}</p>
                <p style="margin: 5px 0;"><strong>Algorithm:</strong> Hybrid urgency-based (15s checks)</p>
                <p style="margin: 5px 0;"><strong>Max Court Stint:</strong> ${Math.floor(optimizer.proratedMaxCourtStint/60)}:${(optimizer.proratedMaxCourtStint%60).toString().padStart(2,'0')}</p>
            </div>
        `;
        
        // Add rotation schedule WITH JERSEY NUMBERS
        if (plan.plan.length > 0) {
            html += `
                <div style="max-height: 200px; overflow-y: auto;">
                    <h5 style="color: var(--accent-cyan); margin-bottom: 10px;">Rotation Schedule:</h5>
            `;
            
            plan.plan.forEach((rotation, index) => {
                const time = this.formatTime(rotation.time);
                
                // Format players with jersey numbers
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
     * Validate setup configuration INCLUDING JERSEY NUMBERS
     */
    validateSetup() {
        const errors = [];
        
        if (this.config.minutesPerPeriod < 1 || this.config.minutesPerPeriod > 60) {
            errors.push('Period length must be between 1 and 60 minutes');
        }
        
        const totalPlayers = 5 + this.config.numReserves;
        if (totalPlayers < 5) {
            errors.push('Must have at least 5 players');
        }
        
        if (totalPlayers > 15) {
            errors.push('Maximum 15 players allowed');
        }
        
        if (this.config.rotationsPerChange > this.config.numReserves && this.config.numReserves > 0) {
            errors.push('Cannot rotate more players than available on bench');
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
     * Confirm setup and start game WITH JERSEY NUMBERS
     */
    confirmSetup() {
        console.log('Confirming setup with jersey numbers...');
        
        // Clear any previous errors
        if (this.elements.setupError) {
            this.elements.setupError.textContent = '';
        }
        
        // Update config from form
        this.config.format = this.elements.gameFormat?.value || 'halves';
        this.config.minutesPerPeriod = parseInt(this.elements.minsPerPeriod?.value) || 20;
        this.config.numReserves = parseInt(this.elements.numReserves?.value) || 3;
        this.config.idealShiftsPerPlayer = this.calculateAutoIdealShifts(5 + this.config.numReserves);
        this.updateLegacyRotationPreference();
        if (this.elements.subsPerChange) {
            this.config.rotationsPerChange = parseInt(this.elements.subsPerChange.value) || 2; // Legacy
        }
        this.config.enableWarningSound = this.elements.warningSoundToggle?.checked !== false;
        
        // Get final player data with jersey numbers
        this.getPlayerData();
        
        // Validate setup
        const errors = this.validateSetup();
        if (errors.length > 0) {
            if (this.elements.setupError) {
                this.elements.setupError.textContent = errors.join('. ');
            }
            return;
        }
        
        // Prepare setup data INCLUDING JERSEY NUMBERS
        const setupData = {
            format: this.config.format,
            minutesPerPeriod: this.config.minutesPerPeriod,
            numReserves: this.config.numReserves,
            enableWarningSound: this.config.enableWarningSound,
            starterNames: this.config.starterNames,
            starterNumbers: this.config.starterNumbers,  // NEW
            reserveNames: this.config.reserveNames,
            reserveNumbers: this.config.reserveNumbers,  // NEW
            playerData: this.config.playerData,           // NEW: Complete player data
            idealShiftsPerPlayer: this.config.idealShiftsPerPlayer, // NEW: Primary configuration
            rotationsPerChange: this.config.rotationsPerChange, // Legacy compatibility
            subsPerChange: this.config.rotationsPerChange // Legacy compatibility
        };
        
        console.log('Setup data with jerseys:', setupData);
        
        // Hide setup, show game
        document.getElementById('setup').classList.add('hidden');
        document.getElementById('game-container').classList.remove('hidden');
        
        // Trigger game initialization with jersey data
        if (window.startBasketballGame) {
            window.startBasketballGame(setupData);
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
     * Load saved configuration
     */
    loadSavedConfig() {
        try {
            const saved = localStorage.getItem('basketballSetup');
            if (saved) {
                const config = JSON.parse(saved);
                
                // Apply saved values
                if (config.format && this.elements.gameFormat) {
                    this.elements.gameFormat.value = config.format;
                    this.config.format = config.format;
                }
                if (config.minutesPerPeriod && this.elements.minsPerPeriod) {
                    this.elements.minsPerPeriod.value = config.minutesPerPeriod;
                    this.config.minutesPerPeriod = config.minutesPerPeriod;
                }
                if (config.numReserves !== undefined && this.elements.numReserves) {
                    this.elements.numReserves.value = config.numReserves;
                    this.config.numReserves = config.numReserves;
                    this.updateRosterSize();
                    this.generatePlayerInputs();
                }
                if (config.rotationsPerChange !== undefined && this.elements.subsPerChange) {
                    this.elements.subsPerChange.value = config.rotationsPerChange;
                    this.config.rotationsPerChange = config.rotationsPerChange;
                }
                if (config.enableWarningSound !== undefined && this.elements.warningSoundToggle) {
                    this.elements.warningSoundToggle.checked = config.enableWarningSound;
                    this.config.enableWarningSound = config.enableWarningSound;
                }
                
                this.updateLegacyRotationPreference();
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
                format: this.config.format,
                minutesPerPeriod: this.config.minutesPerPeriod,
                numReserves: this.config.numReserves,
                rotationsPerChange: this.config.rotationsPerChange,
                enableWarningSound: this.config.enableWarningSound
            };
            
            localStorage.setItem('basketballSetup', JSON.stringify(config));
            console.log('Configuration saved');
        } catch (e) {
            console.warn('Could not save configuration:', e);
        }
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BasketballSetup;
}

if (typeof window !== 'undefined') {
    window.BasketballSetup = BasketballSetup;
    console.log('🏀 Basketball Setup Manager with Jersey Numbers loaded - v3.1');
}
