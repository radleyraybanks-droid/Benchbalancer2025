/**
 * AFL UI Manager
 * Handles all display and user interaction for AFL/Auskick game
 * Works with existing HTML structure and IDs
 * Features: Oval field display, G.B (Total) scoring, line-based positions
 * Version 2.0 - Production Ready
 */

export class AFLUI {
    constructor(gameEngine) {
        this.engine = gameEngine;
        this.elements = {};
        this.initializeElements();
        this.attachEventListeners();

        // UI state
        this.displayState = {
            lastVariance: 0,
            lastTempo: 'balanced',
            recoveryActive: false
        };

        // Scoring UI state
        this.scoringPadOpen = false;
        // Used to suppress immediate re-open from iOS/Safari "ghost clicks" when closing
        this._suppressToggleUntil = 0;
        this.startingWhistlePlayed = false;
        this.audio = this.audio || {};

        // Orientation state
        this.isMobilePortrait = false;
        this.checkOrientation();

        if (typeof window !== 'undefined') {
            window.addEventListener('resize', () => this.checkOrientation());
            window.addEventListener('orientationchange', () => this.checkOrientation());
        }

        if (typeof window !== 'undefined' && typeof Audio !== 'undefined') {
            try {
                this.audio.startingWhistle = new Audio('Game sounds/startingwhistle.wav');
                this.audio.startingWhistle.volume = 0.7;
            } catch (error) {
                console.warn('Failed to initialize starting whistle audio:', error);
            }
        }

        console.log('🏉 AFL UI Manager initialized');
    }

    /**
     * Initialize DOM element references
     */
    initializeElements() {
        // Oval display
        this.elements.oval = document.getElementById('aflOval');
        this.elements.ovalPlayers = document.getElementById('ovalPlayers');

        // Bench sections
        this.elements.benchList = document.getElementById('benchList');
        this.elements.freezeList = document.getElementById('freezeList');
        this.elements.outList = document.getElementById('outList');

        // Timer and quarter
        this.elements.gameTimer = document.getElementById('gameTimer');
        this.elements.periodTimer = document.getElementById('periodTimer');
        this.elements.periodDisplay = document.getElementById('periodDisplay');
        this.elements.varianceDisplay = document.getElementById('varianceDisplay');

        // Rotation display
        this.elements.nextSubCountdown = document.getElementById('nextSubCountdown');
        this.elements.playersComingOff = document.getElementById('playersComingOff');
        this.elements.playersComingOn = document.getElementById('playersComingOn');
        this.elements.confirmSubButton = document.getElementById('confirmSubButton');

        // Player lists
        this.elements.onFieldList = document.getElementById('onFieldList');
        this.elements.onFieldCount = document.getElementById('onFieldCount');
        this.elements.onBenchCount = document.getElementById('onBenchCount');

        // Status
        this.elements.statusMessage = document.getElementById('statusMessage');

        // Controls
        this.elements.startStopButton = document.getElementById('startStopButton');
        this.elements.emergencySubButton = document.getElementById('emergencySubButton');
        this.elements.manageRemovedButton = document.getElementById('manageRemovedButton');
        this.elements.resetButton = document.getElementById('resetButton');

        // Modals
        this.elements.emergencyModal = document.getElementById('emergencySubModal');
        this.elements.manageRemovedModal = document.getElementById('manageRemovedModal');

        // Scoring elements (G.B format)
        this.elements.homeScore = document.getElementById('homeScore');
        this.elements.awayScore = document.getElementById('awayScore');
        this.elements.homeTeamName = document.getElementById('homeTeamName');
        this.elements.awayTeamName = document.getElementById('awayTeamName');
        this.elements.scoringPad = document.getElementById('scoringPad');
        this.elements.scoringPadToggle = document.getElementById('scoringPadToggle');
        this.elements.scoringPadClose = document.getElementById('scoringPadClose');
        this.elements.scoringPadPlayers = document.getElementById('scoringPadPlayers');
        this.elements.statsGrid = document.getElementById('statsGrid');
        this.elements.statsPanel = document.getElementById('statsPanel');
        this.elements.statsDrawerToggle = document.getElementById('statsDrawerToggle');

        // AFL-specific scoring elements
        this.elements.homeGoals = document.getElementById('homeGoals');
        this.elements.homeBehinds = document.getElementById('homeBehinds');
        this.elements.awayGoals = document.getElementById('awayGoals');
        this.elements.awayBehinds = document.getElementById('awayBehinds');
    }

    /**
     * Attach event listeners to controls
     */
    attachEventListeners() {
        // Start/Stop button
        this.elements.startStopButton?.addEventListener('click', () => {
            if (this.engine.state.running) {
                this.engine.stop();
                this.updateStartStopButton(false);
            } else {
                this.engine.start();
                this.updateStartStopButton(true);
                this.playStartingWhistleIfNeeded();
            }
        });

        // Confirm substitution
        this.elements.confirmSubButton?.addEventListener('click', () => {
            if (this.engine.confirmRotation()) {
                this.elements.confirmSubButton.classList.add('hidden');
                this.clearRotationHighlights();
                // BUGFIX: Clear the "Rotation ready" notification
                this.hideStatusMessage();
            }
        });

        // Emergency sub
        this.elements.emergencySubButton?.addEventListener('click', () => {
            this.showEmergencySubModal();
        });

        // Manage removed
        this.elements.manageRemovedButton?.addEventListener('click', () => {
            this.showManageRemovedModal();
        });

        // Reset game
        this.elements.resetButton?.addEventListener('click', () => {
            if (confirm('Are you sure you want to reset the game? All progress will be lost.')) {
                this.engine.reset();
                location.reload();
            }
        });

        // Scoring pad toggle
        this.elements.scoringPadToggle?.addEventListener('click', (e) => {
            // Guard against ghost clicks after closing on iOS Safari
            if (Date.now() < this._suppressToggleUntil) {
                e?.preventDefault?.();
                e?.stopPropagation?.();
                return;
            }
            this.toggleScoringPad();
        });

        // Scoring pad close button
        const closeHandler = (evt) => {
            // Prevent default and stop propagation to avoid underlying toggle receiving a click
            evt?.preventDefault?.();
            evt?.stopPropagation?.();
            // Suppress any clicks for a short duration to dodge iOS ghost click reopening the pad
            this._suppressToggleUntil = Date.now() + 500;
            this.closeScoringPad();
        };
        // Use both events for best mobile support; prefer touchend over touchstart to avoid double-trigger on iOS
        this.elements.scoringPadClose?.addEventListener('click', closeHandler, { passive: false });
        this.elements.scoringPadClose?.addEventListener('touchend', closeHandler, { passive: false });

        // Team name editing
        this.elements.homeTeamName?.addEventListener('click', () => {
            this.editTeamName('home');
        });

        this.elements.awayTeamName?.addEventListener('click', () => {
            this.editTeamName('away');
        });

        // Stats drawer toggle
        this.elements.statsDrawerToggle?.addEventListener('click', () => {
            this.toggleStatsDrawer();
        });

        // AFL oval click - show stats panel
        this.elements.oval?.addEventListener('click', () => {
            this.showStatsPanel();
        });
    }

    /**
     * Update entire display based on game state
     */
    updateDisplay(state) {
        // Wrap each update to prevent one failure from breaking the entire UI
        try {
            this.updateTimer(state);
        } catch (err) {
            console.error('[UI ERROR] Timer update failed:', err);
        }

        try {
            this.updateOvalWithScoring(state);
        } catch (err) {
            console.error('[UI ERROR] Oval update failed:', err);
        }

        try {
            this.updateBenchWithScoring(state);
        } catch (err) {
            console.error('[UI ERROR] Bench update failed:', err);
        }

        try {
            this.updatePlayerLists(state);
        } catch (err) {
            console.error('[UI ERROR] Player lists update failed:', err);
        }

        try {
            this.updateRotationInfo(state);
        } catch (err) {
            console.error('[UI ERROR] Rotation info update failed:', err);
        }

        try {
            this.updateVariance(state);
        } catch (err) {
            console.error('[UI ERROR] Variance update failed:', err);
        }

        try {
            this.updateStatus(state);
        } catch (err) {
            console.error('[UI ERROR] Status update failed:', err);
        }

        try {
            this.updateStartStopButton(state.running);
        } catch (err) {
            console.error('[UI ERROR] Start/stop button update failed:', err);
        }

        if (!state.running && (state.currentTime ?? 0) === 0) {
            this.startingWhistlePlayed = false;
        }

        if (state.scoring) {
            try {
                this.updateScoreboard(state.scoring);
            } catch (err) {
                console.error('[UI ERROR] Scoreboard update failed:', err);
            }

            try {
                this.updateStatsPanel(state);
            } catch (err) {
                console.error('[UI ERROR] Stats panel update failed:', err);
            }

            try {
                this.updateScoringPad(state);
            } catch (err) {
                console.error('[UI ERROR] Scoring pad update failed:', err);
            }
        }

        // Toggle game controls visibility
        try {
            if (this.elements.gameControls) {
                const shouldShow = state.running || (state.currentTime > 0);
                if (shouldShow) {
                    this.elements.gameControls.classList.remove('hidden');
                } else {
                    this.elements.gameControls.classList.add('hidden');
                }
            }
        } catch (err) {
            console.error('[UI ERROR] Game controls update failed:', err);
        }
    }

    checkOrientation() {
        if (typeof window === 'undefined') {
            this.isMobilePortrait = false;
            return;
        }

        const wasPortrait = this.isMobilePortrait;
        this.isMobilePortrait = window.innerWidth <= 768 && window.innerHeight > window.innerWidth;

        if (wasPortrait !== this.isMobilePortrait && this.engine?.state?.initialized) {
            this.updateDisplay(this.engine.getState());
        }
    }

    /**
     * Update oval with scoring overlays
     */
    updateOvalWithScoring(state) {
        if (this.isMobilePortrait) {
            this.updateOvalMobile(state);
            return;
        }

        this.updateOval(state);
    }

    /**
     * Get line label abbreviation for display
     */
    getLineLabel(line) {
        const labels = {
            'Ruck': 'RCK',
            'Midfield': 'MID',
            'Forward': 'FWD',
            'Back': 'BCK'
        };
        return labels[line] || line?.substring(0, 3).toUpperCase() || '';
    }

    /**
     * Get position class for CSS styling based on player index and total field size
     */
    getPositionClass(index, fieldSize) {
        // Map index to position zones on the oval
        const zones = this.calculatePositionZones(fieldSize);
        return zones[index] || 'pos-mid';
    }

    /**
     * Calculate position zones based on field size
     */
    calculatePositionZones(fieldSize) {
        const zones = [];

        // Distribute positions across oval zones
        // Back line
        const backCount = Math.ceil(fieldSize * 0.25);
        // Mid line
        const midCount = Math.ceil(fieldSize * 0.35);
        // Forward line
        const fwdCount = Math.ceil(fieldSize * 0.25);
        // Ruck
        const ruckCount = fieldSize - backCount - midCount - fwdCount;

        // Back positions (defensive end)
        for (let i = 0; i < backCount; i++) {
            zones.push(`pos-back-${i + 1}`);
        }

        // Mid positions (center)
        for (let i = 0; i < midCount; i++) {
            zones.push(`pos-mid-${i + 1}`);
        }

        // Ruck positions (center circle area)
        for (let i = 0; i < ruckCount; i++) {
            zones.push(`pos-ruck-${i + 1}`);
        }

        // Forward positions (attacking end)
        for (let i = 0; i < fwdCount; i++) {
            zones.push(`pos-fwd-${i + 1}`);
        }

        return zones;
    }

    updateOvalMobile(state) {
        const fieldSize = state.players.field?.length || this.engine.config.fieldSpots || 12;
        let ovalHTML = '';

        state.players.field.forEach((player, idx) => {
            const safeName = this.escapeHTML(player);
            const displayName = player.length > 8 ? `${this.escapeHTML(player.slice(0, 6))}..` : safeName;
            const posClass = this.getPositionClass(idx, fieldSize);
            const line = state.players.lines?.[player] || '';
            const lineLabel = this.getLineLabel(line);

            // Get playing time for this player
            const playingTimeSeconds = (state.players.minutes[player] || 0);
            const timeDisplay = this.formatTime(playingTimeSeconds);

            // Get goals/behinds for this player
            const goals = state.scoring?.playerGoals?.[player] || 0;
            const behinds = state.scoring?.playerBehinds?.[player] || 0;

            ovalHTML += `
                <div class="player-position ${posClass}" data-player="${safeName}">
                    <span class="player-name-top">${displayName}</span>
                    <div class="player-icon" role="presentation">
                        <div class="player-silhouette"></div>
                        <div class="afl-ball"></div>
                    </div>
                    <div class="player-time-box">
                        <span class="player-time-value">${timeDisplay}</span>
                    </div>
                    <div class="player-position-label">${lineLabel}</div>
                    ${goals > 0 || behinds > 0 ? `<div class="player-score-badge">${goals}.${behinds}</div>` : ''}
                </div>
            `;
        });

        if (this.elements.ovalPlayers) {
            this.elements.ovalPlayers.innerHTML = ovalHTML;
        }
    }

    /**
     * Update bench sections with scoring controls
     */
    updateBenchWithScoring(state) {
        this.updateBenchSections(state);

        const scoring = state.scoring || {};
        const benchContainer = this.elements.benchList;
        if (!benchContainer) return;

        benchContainer.querySelectorAll('.bench-player').forEach(element => {
            const playerName = element.dataset.player;
            if (!playerName) return;

            const goals = scoring.playerGoals?.[playerName] || 0;
            const behinds = scoring.playerBehinds?.[playerName] || 0;
            const total = (goals * 6) + behinds;
            const jsName = this.escapeForJSString(playerName);

            const scoringControls = document.createElement('div');
            scoringControls.className = 'bench-player-scoring';
            scoringControls.innerHTML = `
                <div class="bench-score-chip">
                    <span class="chip-label">Score</span>
                    <span class="chip-value">${goals}.${behinds} (${total})</span>
                </div>
                <div class="bench-score-actions">
                    <button class="bench-score-btn goal" onclick="aflUI.recordPlayerGoal('${jsName}')">GOAL</button>
                    <button class="bench-score-btn behind" onclick="aflUI.recordPlayerBehind('${jsName}')">BEHIND</button>
                </div>
            `;
            element.appendChild(scoringControls);
        });
    }

    /**
     * Update scoreboard display - AFL G.B (Total) format
     */
    updateScoreboard(scoring) {
        // Home score in G.B (Total) format
        const homeGoals = scoring.homeGoals ?? 0;
        const homeBehinds = scoring.homeBehinds ?? 0;
        const homeTotal = (homeGoals * 6) + homeBehinds;

        if (this.elements.homeScore) {
            this.elements.homeScore.textContent = `${homeGoals}.${homeBehinds} (${homeTotal})`;
        }
        if (this.elements.homeGoals) {
            this.elements.homeGoals.textContent = homeGoals;
        }
        if (this.elements.homeBehinds) {
            this.elements.homeBehinds.textContent = homeBehinds;
        }

        // Away score in G.B (Total) format
        const awayGoals = scoring.awayGoals ?? 0;
        const awayBehinds = scoring.awayBehinds ?? 0;
        const awayTotal = (awayGoals * 6) + awayBehinds;

        if (this.elements.awayScore) {
            this.elements.awayScore.textContent = `${awayGoals}.${awayBehinds} (${awayTotal})`;
        }
        if (this.elements.awayGoals) {
            this.elements.awayGoals.textContent = awayGoals;
        }
        if (this.elements.awayBehinds) {
            this.elements.awayBehinds.textContent = awayBehinds;
        }

        if (this.elements.homeTeamName) {
            this.elements.homeTeamName.textContent = scoring.homeTeamName || 'Home';
        }

        if (this.elements.awayTeamName) {
            this.elements.awayTeamName.textContent = scoring.awayTeamName || 'Opposition';
        }

        const oppositionNamePad = document.getElementById('oppositionNamePad');
        if (oppositionNamePad) {
            oppositionNamePad.textContent = scoring.awayTeamName || 'Opposition';
        }

        const oppositionScorePad = document.getElementById('oppositionScorePad');
        if (oppositionScorePad) {
            oppositionScorePad.textContent = `${awayGoals}.${awayBehinds} (${awayTotal})`;
        }
    }

    /**
     * Update stats panel with player goals/behinds
     */
    updateStatsPanel(state) {
        if (!this.elements.statsGrid) return;

        const scoring = state.scoring || {};
        const playerGoals = scoring.playerGoals || {};
        const playerBehinds = scoring.playerBehinds || {};

        // Get all players with any scoring
        const scoringPlayers = new Set([
            ...Object.keys(playerGoals),
            ...Object.keys(playerBehinds)
        ]);

        const entries = Array.from(scoringPlayers)
            .map(player => ({
                player,
                goals: playerGoals[player] || 0,
                behinds: playerBehinds[player] || 0,
                total: ((playerGoals[player] || 0) * 6) + (playerBehinds[player] || 0)
            }))
            .filter(e => e.total > 0)
            .sort((a, b) => b.total - a.total);

        if (entries.length === 0) {
            this.elements.statsGrid.innerHTML = `
                <div class="stat-card">
                    <span class="stat-player-name">No goals or behinds scored yet</span>
                </div>
            `;
            return;
        }

        const statsHTML = entries.map(({ player, goals, behinds, total }) => {
            const safeName = this.escapeHTML(player);
            return `
                <div class="stat-card">
                    <span class="stat-player-name">${safeName}</span>
                    <span class="stat-player-score">${goals}.${behinds} (${total})</span>
                </div>
            `;
        }).join('');

        this.elements.statsGrid.innerHTML = statsHTML;
    }

    /**
     * Update floating scoring pad - AFL version with Goal/Behind buttons
     */
    updateScoringPad(state) {
        if (!this.elements.scoringPadPlayers) return;

        const scoring = state.scoring || {};
        const playerGoals = scoring.playerGoals || {};
        const playerBehinds = scoring.playerBehinds || {};

        const allPlayers = [...(state.players.field || []), ...(state.players.bench || [])];
        const uniquePlayers = Array.from(new Set(allPlayers));

        const padHTML = uniquePlayers.map(player => {
            const goals = playerGoals[player] || 0;
            const behinds = playerBehinds[player] || 0;
            const total = (goals * 6) + behinds;
            const displayName = this.escapeHTML(player);
            const jsName = this.escapeForJSString(player);

            return `
                <div class="scoring-pad-player">
                    <span class="scoring-pad-player-name">${displayName}</span>
                    <span class="scoring-pad-player-score">${goals}.${behinds} (${total})</span>
                    <div class="scoring-pad-controls">
                        <button class="scoring-pad-btn goal" onclick="aflUI.recordPlayerGoal('${jsName}')">GOAL</button>
                        <button class="scoring-pad-btn behind" onclick="aflUI.recordPlayerBehind('${jsName}')">BHND</button>
                    </div>
                </div>
            `;
        }).join('');

        this.elements.scoringPadPlayers.innerHTML = padHTML;
    }

    /**
     * Toggle scoring pad visibility
     */
    toggleScoringPad() {
        if (this.scoringPadOpen) {
            this.closeScoringPad();
        } else {
            this.openScoringPad();
        }
    }

    /**
     * Reveal scoring pad
     */
    openScoringPad() {
        if (this.scoringPadOpen) return;

        this.scoringPadOpen = true;
        this.elements.scoringPad?.classList.remove('hidden');
        // Avoid accidental taps on the floating toggle while pad is open
        if (this.elements.scoringPadToggle) {
            this.elements.scoringPadToggle.style.pointerEvents = 'none';
        }
        if (this.elements.scoringPadToggle) {
            this.elements.scoringPadToggle.textContent = '✕';
        }
        // Hide the quick score button when panel is open
        const quickScoreBtn = document.querySelector('.quick-score-button');
        if (quickScoreBtn) {
            quickScoreBtn.style.display = 'none';
        }
    }

    /**
     * Hide scoring pad without altering scores
     */
    closeScoringPad() {
        if (!this.scoringPadOpen) return;

        this.scoringPadOpen = false;
        this.elements.scoringPad?.classList.add('hidden');
        // Re-enable toggle after the slide-out transition completes, but keep it suppressed briefly
        if (this.elements.scoringPadToggle) {
            this.elements.scoringPadToggle.textContent = '🏉';
            // Allow CSS transition (~220ms); add a small buffer
            setTimeout(() => {
                this.elements.scoringPadToggle.style.pointerEvents = '';
            }, 300);
        }
        // Show the quick score button again when panel is closed
        const quickScoreBtn = document.querySelector('.quick-score-button');
        if (quickScoreBtn) {
            quickScoreBtn.style.display = 'flex';
        }
    }

    /**
     * Record a goal for a player via UI
     */
    recordPlayerGoal(playerName) {
        if (!this.engine) return;

        this.engine.recordGoal(playerName);
        this.updateDisplay(this.engine.getState());

        // Animate the player badge
        if (!this.isMobilePortrait) {
            const playerElement = Array.from(document.querySelectorAll('[data-player]'))
                .find(el => el.dataset.player === playerName);

            if (playerElement) {
                playerElement.style.animation = 'goalCelebration 0.5s';
                setTimeout(() => {
                    playerElement.style.animation = '';
                }, 500);
            }
        }
    }

    /**
     * Record a behind for a player via UI
     */
    recordPlayerBehind(playerName) {
        if (!this.engine) return;

        this.engine.recordBehind(playerName);
        this.updateDisplay(this.engine.getState());

        // Subtle animation for behind
        if (!this.isMobilePortrait) {
            const playerElement = Array.from(document.querySelectorAll('[data-player]'))
                .find(el => el.dataset.player === playerName);

            if (playerElement) {
                playerElement.style.animation = 'pulse 0.3s';
                setTimeout(() => {
                    playerElement.style.animation = '';
                }, 300);
            }
        }
    }

    /**
     * Record opposition goal via UI
     */
    recordOppositionGoal() {
        if (!this.engine) return;

        this.engine.recordOppositionGoal();
        this.updateDisplay(this.engine.getState());
    }

    /**
     * Record opposition behind via UI
     */
    recordOppositionBehind() {
        if (!this.engine) return;

        this.engine.recordOppositionBehind();
        this.updateDisplay(this.engine.getState());
    }

    toggleStatsDrawer() {
        if (!this.elements.statsPanel) return;

        this.elements.statsPanel.classList.toggle('open');
    }

    /**
     * Show stats panel when oval is clicked
     */
    showStatsPanel() {
        if (!this.elements.statsPanel) return;

        // Show the panel
        this.elements.statsPanel.style.display = 'block';
        // Open the drawer (for mobile)
        this.elements.statsPanel.classList.add('open');
    }

    playStartingWhistleIfNeeded() {
        if (this.startingWhistlePlayed) {
            return;
        }

        if (!this.audio || !this.audio.startingWhistle) {
            return;
        }

        const { currentTime = 0, periodElapsed = 0 } = this.engine?.state || {};
        if (currentTime === 0 && periodElapsed === 0) {
            try {
                this.audio.startingWhistle.currentTime = 0;
                this.audio.startingWhistle.play().catch(() => { });
                this.startingWhistlePlayed = true;
            } catch (error) {
                console.warn('Starting whistle playback failed:', error);
            }
        }
    }

    /**
     * Edit team name inline
     */
    editTeamName(team) {
        const element = team === 'home' ? this.elements.homeTeamName : this.elements.awayTeamName;
        if (!element) return;

        const currentName = element.textContent || '';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'team-name-input';
        input.value = currentName;
        input.maxLength = 20;

        element.replaceWith(input);
        input.focus();
        input.select();

        let saved = false;
        const saveEdit = () => {
            if (saved) {
                return;
            }
            saved = true;
            const newName = input.value.trim() || (team === 'home' ? 'Home' : 'Opposition');
            this.engine.updateTeamName(team, newName);

            const newElement = document.createElement('div');
            newElement.className = 'team-name';
            newElement.id = team === 'home' ? 'homeTeamName' : 'awayTeamName';
            newElement.dataset.editable = 'true';
            newElement.textContent = newName;

            input.replaceWith(newElement);

            newElement.addEventListener('click', () => {
                this.editTeamName(team);
            });

            if (team === 'home') {
                this.elements.homeTeamName = newElement;
            } else {
                this.elements.awayTeamName = newElement;
            }
        };

        input.addEventListener('blur', saveEdit);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveEdit();
            }
        });
    }

    /**
     * Update timer displays
     */
    updateTimer(state) {
        // Main timer
        const gameMinutes = Math.floor(state.currentTime / 60);
        const gameSeconds = state.currentTime % 60;
        if (this.elements.gameTimer) {
            this.elements.gameTimer.textContent =
                `${gameMinutes.toString().padStart(2, '0')}:${gameSeconds.toString().padStart(2, '0')}`;
        }

        // Period timer - COUNTDOWN
        const periodLength = this.engine.config.periodLength || 720; // Default 12 minutes for AFL
        const timeRemaining = Math.max(0, periodLength - state.periodElapsed);
        const periodMinutes = Math.floor(timeRemaining / 60);
        const periodSeconds = timeRemaining % 60;
        if (this.elements.periodTimer) {
            this.elements.periodTimer.textContent =
                `(Quarter: ${periodMinutes.toString().padStart(2, '0')}:${periodSeconds.toString().padStart(2, '0')})`;
        }

        // Period display - AFL always 4 quarters
        if (this.elements.periodDisplay) {
            this.elements.periodDisplay.textContent = `Q${state.currentPeriod}/4`;
        }
    }

    /**
     * Update oval player display with positions
     */
    updateOval(state) {
        const fieldSize = state.players.field?.length || this.engine.config.fieldSpots || 12;

        let ovalHTML = '';

        state.players.field.forEach((player, idx) => {
            const posClass = this.getPositionClass(idx, fieldSize);
            const safeName = this.escapeHTML(player);
            const line = state.players.lines?.[player] || '';
            const lineLabel = this.getLineLabel(line);

            // Get playing time for this player
            const playingTimeSeconds = (state.players.minutes[player] || 0);
            const timeDisplay = this.formatTime(playingTimeSeconds);

            // Check if player is rotating out
            const isRotatingOut = state.rotations.pendingOff.includes(player);
            const nextOutBadge = isRotatingOut ? '<span class="next-out-badge">NEXT OUT</span>' : '';
            const rotatingClass = isRotatingOut ? 'rotating-off' : '';

            // Get goals/behinds
            const goals = state.scoring?.playerGoals?.[player] || 0;
            const behinds = state.scoring?.playerBehinds?.[player] || 0;

            ovalHTML += `
                <div class="player-position ${posClass} ${rotatingClass}" data-player="${safeName}" data-line="${line}">
                    ${nextOutBadge}
                    <span class="player-name-top">${safeName}</span>
                    <div class="player-icon" role="presentation">
                        <div class="player-silhouette"></div>
                        <div class="afl-ball"></div>
                    </div>
                    <div class="player-time-box">
                        <span class="player-time-value">${timeDisplay}</span>
                    </div>
                    <div class="player-position-label">${lineLabel}</div>
                    ${goals > 0 || behinds > 0 ? `<div class="player-score-badge">${goals}.${behinds}</div>` : ''}
                </div>
            `;
        });

        if (this.elements.ovalPlayers) {
            this.elements.ovalPlayers.innerHTML = ovalHTML;
        }
    }

    /**
     * Update bench, freeze, and out sections
     */
    updateBenchSections(state) {
        // Bench section
        let benchHTML = '';
        state.players.bench.forEach(player => {
            const minutes = state.players.minutes[player] || 0;
            const benchMinutes = state.players.benchMinutes[player] || 0;
            const benchStint = this.calculateCurrentBenchStint(player, state);
            const isRotatingOn = state.rotations.pendingOn.includes(player);
            const safeName = this.escapeHTML(player);
            const badgeInitials = this.escapeHTML(this.getBadgeInitials(player));
            const line = state.players.lines?.[player] || '';
            const lineLabel = this.getLineLabel(line);

            benchHTML += `
                <div class="bench-player" data-player="${safeName}">
                    <div class="bench-player-header">
                        <div class="bench-player-icon" aria-hidden="true">
                            <span class="icon-base">🏉</span>
                            <span class="icon-label">${badgeInitials}</span>
                        </div>
                        <div class="bench-player-name">${safeName}</div>
                        ${lineLabel ? `<span class="line-tag">${lineLabel}</span>` : ''}
                        ${isRotatingOn ? '<span class="next-in-badge" role="status">NEXT IN</span>' : ''}
                    </div>
                    <div class="bench-player-metrics">
                        <div class="bench-chip bench-chip-play">
                            <span class="chip-label">Play</span>
                            <span class="chip-value">${this.formatTime(minutes)}</span>
                        </div>
                        <div class="bench-chip bench-chip-total">
                            <span class="chip-label">Bench</span>
                            <span class="chip-value">${this.formatTime(benchMinutes)}</span>
                        </div>
                        <div class="bench-chip bench-chip-rest">
                            <span class="chip-label">Current Rest</span>
                            <span class="chip-value">${this.formatTime(benchStint)}</span>
                        </div>
                    </div>
                </div>
            `;
        });
        if (this.elements.benchList) {
            this.elements.benchList.innerHTML = benchHTML || this.renderEmptyState('No bench players yet');
        }
        if (this.elements.onBenchCount) {
            this.elements.onBenchCount.textContent = state.players.bench.length;
        }

        // Freeze section (currently not used in AFL)
        if (this.elements.freezeList) {
            this.elements.freezeList.innerHTML = this.renderEmptyState('None');
        }

        // Out section (removed players)
        let outHTML = '';
        state.players.removed.forEach(player => {
            const minutes = state.players.minutes[player] || 0;
            const safeName = this.escapeHTML(player);
            outHTML += `
                <div class="bench-player removed-player" data-player="${safeName}">
                    <div class="bench-player-header">
                        <div class="bench-player-icon" aria-hidden="true">❌</div>
                        <div class="bench-player-name">${safeName}</div>
                    </div>
                    <div class="bench-player-times">
                        Final field time: ${this.formatTime(minutes)}
                    </div>
                </div>
            `;
        });
        if (this.elements.outList) {
            this.elements.outList.innerHTML = outHTML || this.renderEmptyState('None');
        }
    }

    /**
     * Update player lists (On Field / On Bench)
     */
    updatePlayerLists(state) {
        // On Field list
        let onFieldHTML = '';
        state.players.field.forEach(player => {
            const minutes = state.players.minutes[player] || 0;
            const benchMinutes = state.players.benchMinutes[player] || 0;
            const currentStint = this.calculateCurrentStint(player, state);
            const safeName = this.escapeHTML(player);
            const badgeInitials = this.escapeHTML(this.getBadgeInitials(player));
            const line = this.escapeHTML(state.players.lines?.[player] || '');
            const lineLabel = this.getLineLabel(state.players.lines?.[player] || '');

            onFieldHTML += `
                <li data-player="${safeName}">
                    <div class="bench-player on-field-card">
                        <div class="bench-player-header">
                            <div class="bench-player-icon" aria-hidden="true">
                                <span class="icon-base">🏉</span>
                                <span class="icon-label">${badgeInitials}</span>
                            </div>
                            <div class="bench-player-name">${safeName}</div>
                            ${line ? `<span class="line-tag">${lineLabel}</span>` : ''}
                        </div>
                        <div class="bench-player-metrics">
                            <div class="bench-chip bench-chip-play">
                                <span class="chip-label">Play</span>
                                <span class="chip-value">${this.formatTime(minutes)}</span>
                            </div>
                            <div class="bench-chip bench-chip-total">
                                <span class="chip-label">Bench</span>
                                <span class="chip-value">${this.formatTime(benchMinutes)}</span>
                            </div>
                            <div class="bench-chip bench-chip-rest">
                                <span class="chip-label">Current Stint</span>
                                <span class="chip-value">${this.formatTime(currentStint)}</span>
                            </div>
                        </div>
                    </div>
                </li>
            `;
        });
        if (this.elements.onFieldList) {
            this.elements.onFieldList.innerHTML = onFieldHTML;
        }
        if (this.elements.onFieldCount) {
            this.elements.onFieldCount.textContent = state.players.field.length;
        }
    }

    /**
     * Update rotation information display
     */
    updateRotationInfo(state) {
        if (state.rotations.pending) {
            // Show pending rotation
            if (this.elements.nextSubCountdown) {
                this.elements.nextSubCountdown.textContent = 'NOW!';
                this.elements.nextSubCountdown.style.color = '#FF8C00';
            }
            if (this.elements.playersComingOff) {
                this.elements.playersComingOff.innerHTML = this.renderPlayerChips(state.rotations.pendingOff, 'No rotation scheduled');
            }
            if (this.elements.playersComingOn) {
                this.elements.playersComingOn.innerHTML = this.renderPlayerChips(state.rotations.pendingOn, 'No rotation scheduled');
            }
            this.elements.confirmSubButton?.classList.remove('hidden');

            // Add highlights
            this.highlightRotatingPlayers(state.rotations.pendingOff, state.rotations.pendingOn);
        } else if (state.rotations.next) {
            // Show next scheduled rotation
            const timeToNext = state.rotations.next.time - state.currentTime;
            if (this.elements.nextSubCountdown) {
                this.elements.nextSubCountdown.textContent = this.formatTime(Math.max(0, timeToNext));
                this.elements.nextSubCountdown.style.color = timeToNext <= 10 ? '#FFD700' : 'orange';
            }
            if (this.elements.playersComingOff) {
                this.elements.playersComingOff.innerHTML = this.renderPlayerChips(state.rotations.next.off, 'No rotation scheduled');
            }
            if (this.elements.playersComingOn) {
                this.elements.playersComingOn.innerHTML = this.renderPlayerChips(state.rotations.next.on, 'No rotation scheduled');
            }
            this.elements.confirmSubButton?.classList.add('hidden');
        } else {
            // No rotations scheduled
            if (this.elements.nextSubCountdown) {
                this.elements.nextSubCountdown.textContent = '--:--';
                this.elements.nextSubCountdown.style.color = 'orange';
            }
            if (this.elements.playersComingOff) {
                this.elements.playersComingOff.innerHTML = this.renderPlayerChips([], 'No rotation scheduled');
            }
            if (this.elements.playersComingOn) {
                this.elements.playersComingOn.innerHTML = this.renderPlayerChips([], 'No rotation scheduled');
            }
            this.elements.confirmSubButton?.classList.add('hidden');
        }
    }

    /**
     * Update variance display
     */
    updateVariance(state) {
        const variance = state.variance || 0;

        // Variance display is now hidden - only update if element exists
        if (this.elements.varianceDisplay) {
            this.elements.varianceDisplay.textContent = `${variance}s`;

            // Color code based on variance (tighter for AFL with more players)
            if (variance <= 45) {
                this.elements.varianceDisplay.style.color = '#5CB85C'; // Green
            } else if (variance <= 75) {
                this.elements.varianceDisplay.style.color = '#FFD700'; // Yellow
            } else {
                this.elements.varianceDisplay.style.color = '#D9534F'; // Red
            }
        }

        this.displayState.lastVariance = variance;
    }

    /**
     * Update status message
     */
    updateStatus(state) {
        if (state.recoveryActive && !this.displayState.recoveryActive) {
            this.showStatusMessage('Recovery mode active - rebalancing rotations', 5000, 'warning');
            this.displayState.recoveryActive = true;
        } else if (!state.recoveryActive && this.displayState.recoveryActive) {
            this.showStatusMessage('Recovery complete - variance restored', 3000, 'success');
            this.displayState.recoveryActive = false;
        }

        if (state.tempoLocked) {
            const lockIcon = '🔒';
            if (!this.elements.statusMessage?.textContent?.includes(lockIcon)) {
                this.showStatusMessage(`${lockIcon} Tempo locked during recovery`, 3000, 'info');
            }
        }
    }

    /**
     * Show early substitution warning (1 minute before scheduled sub)
     */
    showEarlySubstitutionWarning(earlyWarning) {
        // Guard against undefined earlyWarning
        if (!earlyWarning || !earlyWarning.rotation) {
            console.warn('[UI] showEarlySubstitutionWarning called with invalid data');
            return;
        }

        const { timeRemaining, rotation } = earlyWarning;

        // Show players that will be substituted
        if (this.elements.playersComingOff) {
            this.elements.playersComingOff.innerHTML = this.renderPlayerChips(rotation.off || [], 'No rotation scheduled');
        }
        if (this.elements.playersComingOn) {
            this.elements.playersComingOn.innerHTML = this.renderPlayerChips(rotation.on || [], 'No rotation scheduled');
        }

        // Show early sub button instead of confirm button (with null checks)
        if (this.elements.earlySubButton) {
            this.elements.earlySubButton.classList.remove('hidden');
        }
        if (this.elements.confirmSubButton) {
            this.elements.confirmSubButton.classList.add('hidden');
        }

        // Highlight players
        this.highlightRotatingPlayers(rotation.off || [], rotation.on || []);

        // Show notification
        this.showStatusMessage(`Prepare next sub (in ${timeRemaining || 0}s) - or make early substitution`, 0, 'info');
    }

    /**
     * Show rotation pending notification
     */
    showRotationPending(rotation) {
        // Guard against undefined rotation
        if (!rotation) {
            console.warn('[UI] showRotationPending called with invalid data');
            return;
        }

        if (this.elements.playersComingOff) {
            this.elements.playersComingOff.innerHTML = this.renderPlayerChips(rotation.off || [], 'No rotation scheduled');
        }
        if (this.elements.playersComingOn) {
            this.elements.playersComingOn.innerHTML = this.renderPlayerChips(rotation.on || [], 'No rotation scheduled');
        }

        if (this.elements.confirmSubButton) {
            this.elements.confirmSubButton.classList.remove('hidden');
        }
        if (this.elements.earlySubButton) {
            this.elements.earlySubButton.classList.add('hidden');  // Hide early sub button when rotation is ready
        }

        // Highlight players
        this.highlightRotatingPlayers(rotation.off || [], rotation.on || []);

        // Show notification
        this.showStatusMessage('Rotation ready - confirm substitution', 0, 'warning');
    }

    /**
     * Highlight players involved in rotation
     */
    highlightRotatingPlayers(playersOff, playersOn) {
        // Clear existing highlights
        this.clearRotationHighlights();

        // Highlight players coming off (field)
        playersOff.forEach(player => {
            const element = document.querySelector(`#ovalPlayers [data-player="${player}"]`);
            if (element) {
                element.classList.add('rotating-off');
                element.style.border = '2px solid #FF8C00';
            }
        });

        // Highlight players coming on (bench)
        playersOn.forEach(player => {
            const element = document.querySelector(`#benchList [data-player="${player}"]`);
            if (element) {
                element.classList.add('rotating-on');
                element.style.border = '2px solid #5CB85C';
            }
        });
    }

    /**
     * Clear rotation highlights
     */
    clearRotationHighlights() {
        document.querySelectorAll('.rotating-off, .rotating-on').forEach(el => {
            el.classList.remove('rotating-off', 'rotating-on');
            el.style.border = '';
        });
    }

    /**
     * Show emergency substitution modal - Enhanced with playing times and line info
     */
    showEmergencySubModal() {
        // Populate dropdowns
        const offSelect = document.getElementById('subOutPlayer');
        const onSelect = document.getElementById('subInPlayer');

        // Clear and populate field players with playing times
        offSelect.innerHTML = '';
        const fieldWithTimes = this.engine.players.field.map(player => ({
            name: player,
            time: this.engine.players.minutes[player] || 0,
            line: this.engine.players.lines?.[player] || ''
        })).sort((a, b) => b.time - a.time); // Sort by most playing time first (likely to come off)

        fieldWithTimes.forEach(({ name, time, line }) => {
            const option = document.createElement('option');
            option.value = name;
            const lineLabel = line ? ` [${this.getLineLabel(line)}]` : '';
            option.textContent = `${name} (${this.formatTime(time)})${lineLabel}`;
            offSelect.appendChild(option);
        });

        // Clear and populate bench players with playing times, sorted by LOWEST first
        onSelect.innerHTML = '';
        const benchWithTimes = this.engine.players.bench.map(player => ({
            name: player,
            time: this.engine.players.minutes[player] || 0,
            line: this.engine.players.lines?.[player] || ''
        })).sort((a, b) => a.time - b.time); // Sort by LOWEST playing time first (suggested)

        benchWithTimes.forEach(({ name, time, line }, index) => {
            const option = document.createElement('option');
            option.value = name;
            // Mark the suggested player (lowest playing time)
            const suggestion = index === 0 ? ' ⭐ SUGGESTED' : '';
            const lineLabel = line ? ` [${this.getLineLabel(line)}]` : '';
            option.textContent = `${name} (${this.formatTime(time)})${lineLabel}${suggestion}`;
            if (index === 0) {
                option.style.fontWeight = 'bold';
                option.style.color = '#5CB85C';
            }
            onSelect.appendChild(option);
        });

        // Show projected variance indicator
        this.updateEmergencySubVariancePreview(offSelect, onSelect);

        // Add change listeners to update variance preview
        offSelect.onchange = () => this.updateEmergencySubVariancePreview(offSelect, onSelect);
        onSelect.onchange = () => this.updateEmergencySubVariancePreview(offSelect, onSelect);

        // Show modal
        this.elements.emergencyModal?.classList.remove('hidden');

        // Attach handlers
        document.getElementById('confirmEmergencySubButton').onclick = () => {
            const playerOff = offSelect.value;
            const playerOn = onSelect.value;
            const removeFromGame = document.querySelector('input[name="injuredFate"]:checked')?.value === 'remove';

            if (playerOff && playerOn) {
                if (this.engine.emergencySubstitution(playerOff, playerOn, removeFromGame)) {
                    this.elements.emergencyModal?.classList.add('hidden');
                    this.showStatusMessage(`Emergency sub: ${playerOff} → ${playerOn}`, 3000, 'warning');
                }
            }
        };

        document.getElementById('cancelEmergencySubButton').onclick = () => {
            this.elements.emergencyModal?.classList.add('hidden');
        };
    }

    /**
     * Update projected variance display in emergency sub modal
     */
    updateEmergencySubVariancePreview(offSelect, onSelect) {
        const variancePreview = document.getElementById('emergencySubVariancePreview');
        if (!variancePreview) {
            // Create preview element if it doesn't exist
            const previewDiv = document.createElement('div');
            previewDiv.id = 'emergencySubVariancePreview';
            previewDiv.className = 'variance-preview';
            previewDiv.style.cssText = 'margin: 10px 0; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 5px;';
            onSelect.parentElement.appendChild(previewDiv);
        }

        const playerOff = offSelect.value;
        const playerOn = onSelect.value;

        if (!playerOff || !playerOn) return;

        const offTime = this.engine.players.minutes[playerOff] || 0;
        const onTime = this.engine.players.minutes[playerOn] || 0;
        const timeDiff = offTime - onTime;

        // Calculate current and projected variance
        const activePlayers = this.engine.players.all.filter(p => !this.engine.players.removed.has(p));
        const playTimes = activePlayers.map(p => this.engine.players.minutes[p] || 0);
        const currentMin = Math.min(...playTimes);
        const currentMax = Math.max(...playTimes);
        const currentVariance = currentMax - currentMin;

        // Estimate improvement
        let varianceAssessment = '';
        let assessmentColor = '#999';

        if (timeDiff > 30) {
            varianceAssessment = '✅ Good choice - will improve balance';
            assessmentColor = '#5CB85C';
        } else if (timeDiff > 0) {
            varianceAssessment = '⚠️ Slight improvement to balance';
            assessmentColor = '#FFD700';
        } else if (timeDiff < -30) {
            varianceAssessment = '⚠️ Warning: May increase imbalance';
            assessmentColor = '#FF8C00';
        } else {
            varianceAssessment = 'ℹ️ Neutral effect on balance';
            assessmentColor = '#00FFE0';
        }

        const preview = document.getElementById('emergencySubVariancePreview');
        if (preview) {
            preview.innerHTML = `
                <div style="color: #999; font-size: 12px; margin-bottom: 5px;">BALANCE IMPACT</div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span>${playerOff}: ${this.formatTime(offTime)}</span>
                    <span>→</span>
                    <span>${playerOn}: ${this.formatTime(onTime)}</span>
                </div>
                <div style="color: ${assessmentColor}; font-weight: bold;">${varianceAssessment}</div>
                <div style="color: #666; font-size: 11px; margin-top: 5px;">Current variance: ${currentVariance}s</div>
            `;
        }
    }

    /**
     * Show manage removed players modal
     */
    showManageRemovedModal() {
        const listDiv = document.getElementById('removedPlayerList');
        listDiv.innerHTML = '';

        if (this.engine.players.removed.size === 0) {
            listDiv.innerHTML = this.renderEmptyState('No removed players');
        } else {
            this.engine.players.removed.forEach(player => {
                const playerDiv = document.createElement('div');
                playerDiv.className = 'form-group';

                const label = document.createElement('label');
                label.textContent = player + ' ';

                const button = document.createElement('button');
                button.className = 'control-button';
                button.textContent = 'Return to Game';
                button.onclick = () => {
                    this.returnPlayerToGame(player);
                };

                label.appendChild(button);
                playerDiv.appendChild(label);
                listDiv.appendChild(playerDiv);
            });
        }

        // Show modal
        this.elements.manageRemovedModal?.classList.remove('hidden');

        // Attach handlers
        document.getElementById('confirmManageRemovedButton').onclick = () => {
            this.elements.manageRemovedModal?.classList.add('hidden');
        };

        document.getElementById('cancelManageRemovedButton').onclick = () => {
            this.elements.manageRemovedModal?.classList.add('hidden');
        };
    }

    /**
     * Return player to game (called from modal)
     */
    returnPlayerToGame(player) {
        if (this.engine.returnPlayer(player)) {
            this.showStatusMessage(`${player} returned to game`, 3000, 'success');
            this.showManageRemovedModal(); // Refresh modal
        }
    }

    /**
     * Show status message
     */
    showStatusMessage(message, duration = 3000, type = 'info') {
        if (!this.elements.statusMessage) return;

        this.elements.statusMessage.textContent = message;

        // Set color based on type
        const colors = {
            'info': '#00FFE0',
            'success': '#5CB85C',
            'warning': '#FFD700',
            'error': '#D9534F'
        };

        this.elements.statusMessage.style.color = colors[type] || colors.info;

        // Auto-hide after duration
        if (duration > 0) {
            setTimeout(() => {
                if (this.elements.statusMessage?.textContent === message) {
                    this.elements.statusMessage.textContent = '';
                }
            }, duration);
        }
    }

    /**
     * Hide status message immediately
     */
    hideStatusMessage() {
        if (this.elements.statusMessage) {
            this.elements.statusMessage.textContent = '';
        }
    }

    /**
     * Show error message
     */
    showError(error) {
        this.showStatusMessage(error, 5000, 'error');
        console.error('UI Error:', error);
    }

    /**
     * Show recovery notification
     */
    showRecovery(recovery) {
        const message = `Recovery: ${recovery.strategy} strategy, ${recovery.rotations} rotations planned`;
        this.showStatusMessage(message, 5000, 'warning');
    }

    /**
     * Update start/stop button
     */
    updateStartStopButton(isRunning) {
        if (!this.elements.startStopButton) return;

        // Check for game over state
        if (this.engine && this.engine.state && this.engine.state.gameOver) {
            this.elements.startStopButton.textContent = 'GAME OVER';
            this.elements.startStopButton.classList.remove('stop');
            this.elements.startStopButton.disabled = true;
            this.elements.startStopButton.style.opacity = '0.5';
            this.elements.startStopButton.style.cursor = 'not-allowed';
            return;
        }

        // Reset disabled state
        this.elements.startStopButton.disabled = false;
        this.elements.startStopButton.style.opacity = '1';
        this.elements.startStopButton.style.cursor = 'pointer';

        if (isRunning) {
            this.elements.startStopButton.textContent = 'PAUSE CLOCK';
            this.elements.startStopButton.classList.add('stop');
        } else {
            this.elements.startStopButton.textContent = 'START';
            this.elements.startStopButton.classList.remove('stop');
        }
    }

    /**
     * Calculate current stint time for a player
     */
    calculateCurrentStint(player, state) {
        const stint = this.engine.players.currentStints?.[player];
        if (!stint || !stint.onField) return 0;

        return state.currentTime - stint.start;
    }

    calculateCurrentBenchStint(player, state) {
        const stint = this.engine.players.currentStints?.[player];
        if (!stint || stint.onField) {
            return 0;
        }

        const benchStart = this.engine.players.lastRotationTime?.[player] ?? 0;
        return Math.max(0, state.currentTime - benchStart);
    }

    /**
     * Format time for display
     */
    formatTime(seconds) {
        if (seconds < 0 || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Escape text for safe HTML rendering
     */
    escapeHTML(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    escapeForJSString(value) {
        const str = String(value ?? '');
        const backslashEscaped = str.split('\\').join('\\\\');
        return backslashEscaped.split("'").join("\'");
    }

    /**
     * Render a collection of player chips or fallback text
     */
    renderPlayerChips(list, emptyLabel = 'None') {
        if (!Array.isArray(list) || list.length === 0) {
            return `<span class="empty-state">${this.escapeHTML(emptyLabel)}</span>`;
        }

        return list
            .map(name => `<span class="player-chip">${this.escapeHTML(name)}</span>`)
            .join('');
    }

    /**
     * Render a consistent empty state block
     */
    renderEmptyState(message) {
        return `<p class="empty-state">${this.escapeHTML(message)}</p>`;
    }

    /**
     * Build avatar initials/digits for player chips
     */
    getBadgeInitials(name) {
        const raw = String(name ?? '').trim();
        if (!raw) {
            return 'BB';
        }

        const numeric = raw.match(/\d+/);
        if (numeric) {
            return numeric[0].slice(0, 2).toUpperCase();
        }

        const cleaned = raw.replace(/[^a-zA-Z ]/g, ' ').trim();
        const tokens = cleaned.split(/\s+/).filter(Boolean);

        if (tokens.length === 0) {
            return raw.slice(0, 2).toUpperCase() || 'BB';
        }

        if (tokens.length === 1) {
            const token = tokens[0];
            return token.slice(0, Math.min(2, token.length)).toUpperCase();
        }

        const first = tokens[0][0] ?? '';
        const last = tokens[tokens.length - 1][0] ?? '';
        const combo = `${first}${last}`.toUpperCase();
        return combo || tokens[0].slice(0, 2).toUpperCase() || 'BB';
    }
}
