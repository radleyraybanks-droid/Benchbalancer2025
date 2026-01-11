/**
 * Soccer UI Manager
 * Handles all display and user interaction for soccer game
 * Version 1.0 - Based on Basketball UI Manager v2.0
 */

export class SoccerUI {
    constructor(gameEngine) {
        this.engine = gameEngine;
        this.elements = {};
        this.initializeElements();
        this.attachEventListeners();

        // UI state
        this.displayState = {
            lastVariance: 0,
            recoveryActive: false
        };

        // Scoring UI state
        this.scoringPadOpen = false;
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
                this.audio.startingWhistle = new Audio('startingwhistle.wav');
                this.audio.startingWhistle.volume = 0.7;
            } catch (error) {
                console.warn('Failed to initialize starting whistle audio:', error);
            }
        }

        console.log('⚽ Soccer UI Manager initialized');
    }

    /**
     * Initialize DOM element references
     */
    initializeElements() {
        // Field display
        this.elements.field = document.getElementById('soccerField');
        this.elements.fieldPlayers = document.getElementById('fieldPlayers');

        // Bench sections
        this.elements.benchList = document.getElementById('benchList');
        this.elements.freezeList = document.getElementById('freezeList');
        this.elements.outList = document.getElementById('outList');

        // Timer and period
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
        this.elements.manageGKButton = document.getElementById('manageGKButton');
        this.elements.manageRemovedButton = document.getElementById('manageRemovedButton');
        this.elements.resetButton = document.getElementById('resetButton');

        // Modals
        this.elements.emergencyModal = document.getElementById('emergencySubModal');
        this.elements.manageGKModal = document.getElementById('manageGKModal');
        this.elements.manageRemovedModal = document.getElementById('manageRemovedModal');

        // Scoring elements
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
                this.hideStatusMessage();
            }
        });

        // Emergency sub
        this.elements.emergencySubButton?.addEventListener('click', () => {
            this.showEmergencySubModal();
        });

        // Manage GK
        this.elements.manageGKButton?.addEventListener('click', () => {
            this.showManageGKModal();
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
            if (Date.now() < this._suppressToggleUntil) {
                e?.preventDefault?.();
                e?.stopPropagation?.();
                return;
            }
            this.toggleScoringPad();
        });

        // Scoring pad close button
        const closeHandler = (evt) => {
            evt?.preventDefault?.();
            evt?.stopPropagation?.();
            this._suppressToggleUntil = Date.now() + 500;
            this.closeScoringPad();
        };
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

        // Field click - show stats panel
        this.elements.field?.addEventListener('click', () => {
            this.showStatsPanel();
        });
    }

    /**
     * Update entire display based on game state
     */
    updateDisplay(state) {
        try {
            this.updateTimer(state);
        } catch (err) {
            console.error('[UI ERROR] Timer update failed:', err);
        }

        try {
            this.updateFieldWithScoring(state);
        } catch (err) {
            console.error('[UI ERROR] Field update failed:', err);
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
     * Update timer display
     */
    updateTimer(state) {
        const totalSeconds = state.currentTime || 0;
        const periodSeconds = state.periodElapsed || 0;

        if (this.elements.gameTimer) {
            this.elements.gameTimer.textContent = this.formatTime(periodSeconds);
        }

        if (this.elements.periodTimer) {
            this.elements.periodTimer.textContent = `(Total: ${this.formatTime(totalSeconds)})`;
        }

        if (this.elements.periodDisplay) {
            const period = state.currentPeriod || 1;
            const numPeriods = 2;
            this.elements.periodDisplay.textContent = `${period}/${numPeriods}`;
        }
    }

    /**
     * Generate position layout for soccer field
     */
    generateFieldPositions(numPlayers, hasGK) {
        const positions = [];

        if (hasGK) {
            // Goalkeeper at bottom center
            positions.push({ x: 50, y: 92, label: 'GK', isGK: true });
            numPlayers--;
        }

        // Distribute outfield players
        if (numPlayers <= 3) {
            // 1-3 players: all across middle
            const startX = 50 - (numPlayers - 1) * 15;
            for (let i = 0; i < numPlayers; i++) {
                positions.push({ x: startX + i * 30, y: 50, label: 'MF', isGK: false });
            }
        } else if (numPlayers <= 6) {
            // 4-6 players: 2 rows
            const df = 2;
            const mf = numPlayers - df;

            // Defenders
            positions.push({ x: 35, y: 75, label: 'DF', isGK: false });
            positions.push({ x: 65, y: 75, label: 'DF', isGK: false });

            // Midfielders/Forwards
            const mfStartX = 50 - ((mf - 1) / 2) * 25;
            for (let i = 0; i < mf; i++) {
                const y = i === mf - 1 && mf > 2 ? 25 : 50;
                positions.push({ x: mfStartX + i * 25, y: y, label: i === mf - 1 ? 'FW' : 'MF', isGK: false });
            }
        } else {
            // 7-10 players: 3 rows (defense, midfield, attack)
            const df = Math.floor(numPlayers * 0.35);
            const fw = Math.floor(numPlayers * 0.25);
            const mf = numPlayers - df - fw;

            // Defenders
            const dfStartX = 50 - ((df - 1) / 2) * 20;
            for (let i = 0; i < df; i++) {
                positions.push({ x: dfStartX + i * 20, y: 75, label: 'DF', isGK: false });
            }

            // Midfielders
            const mfStartX = 50 - ((mf - 1) / 2) * 22;
            for (let i = 0; i < mf; i++) {
                positions.push({ x: mfStartX + i * 22, y: 50, label: 'MF', isGK: false });
            }

            // Forwards
            const fwStartX = 50 - ((fw - 1) / 2) * 25;
            for (let i = 0; i < fw; i++) {
                positions.push({ x: fwStartX + i * 25, y: 25, label: 'FW', isGK: false });
            }
        }

        return positions;
    }

    /**
     * Update field with player positions
     */
    updateFieldWithScoring(state) {
        if (!this.elements.fieldPlayers) return;

        const players = state.players?.field || [];
        const goalkeeper = state.players?.goalkeeper;
        const hasGK = this.engine.config?.numGoalkeepers === 1;
        const fieldPositions = this.generateFieldPositions(players.length, hasGK);

        let fieldHTML = '';

        players.forEach((player, idx) => {
            const pos = fieldPositions[idx] || { x: 50, y: 50, label: 'MF', isGK: false };
            const isGK = player === goalkeeper;
            const safeName = this.escapeHTML(player);
            const displayName = player.length > 8 ? `${this.escapeHTML(player.slice(0, 6))}..` : safeName;

            // Get playing time
            const playingTimeSeconds = (state.players.minutes[player] || 0);
            const timeDisplay = this.formatTime(playingTimeSeconds);

            fieldHTML += `
                <div class="player-position" style="left: ${pos.x}%; top: ${pos.y}%;" data-player="${safeName}">
                    <span class="player-name-top">${displayName}</span>
                    <div class="player-icon" role="presentation">
                        <div class="player-silhouette ${isGK ? 'gk-silhouette' : ''}"></div>
                        <div class="soccer-ball"></div>
                    </div>
                    <div class="player-time-box">
                        <span class="player-time-value">${timeDisplay}</span>
                    </div>
                    <div class="player-position-label">${isGK ? 'GK' : pos.label}</div>
                </div>
            `;
        });

        this.elements.fieldPlayers.innerHTML = fieldHTML;
    }

    /**
     * Update bench sections
     */
    updateBenchWithScoring(state) {
        this.updateBenchSections(state);

        const scoring = state.scoring || {};
        const benchContainer = this.elements.benchList;
        if (!benchContainer) return;

        benchContainer.querySelectorAll('.bench-player').forEach(element => {
            const playerName = element.dataset.player;
            if (!playerName) return;

            const goals = scoring.playerPoints?.[playerName] || 0;
            const jsName = this.escapeForJSString(playerName);
            const scoreLabel = goals === 1 ? '1 goal' : `${goals} goals`;

            const scoringControls = document.createElement('div');
            scoringControls.className = 'bench-player-scoring';
            scoringControls.innerHTML = `
                <div class="bench-score-chip">
                    <span class="chip-label">Goals</span>
                    <span class="chip-value">${scoreLabel}</span>
                </div>
                <div class="bench-score-actions">
                    <button class="bench-score-btn minus" onclick="soccerUI.updatePlayerScore('${jsName}', -1)">-1</button>
                    <button class="bench-score-btn" onclick="soccerUI.updatePlayerScore('${jsName}', 1)">+1</button>
                </div>
            `;
            element.appendChild(scoringControls);
        });
    }

    /**
     * Update bench sections display
     */
    updateBenchSections(state) {
        const bench = state.players?.bench || [];
        const removed = state.players?.removed || [];

        // Update bench list
        if (this.elements.benchList) {
            let benchHTML = '';

            bench.forEach(player => {
                const minutes = state.players.minutes[player] || 0;
                const benchMinutes = state.players.benchMinutes[player] || 0;
                const safeName = this.escapeHTML(player);
                const nextIn = state.rotations?.pendingOn?.includes(player);

                benchHTML += `
                    <div class="bench-player" data-player="${safeName}">
                        <div class="bench-player-header">
                            <div class="bench-player-icon">⚽</div>
                            <div class="bench-player-name">${safeName}</div>
                            ${nextIn ? '<span class="next-in-badge">NEXT IN</span>' : ''}
                        </div>
                        <div class="bench-player-metrics">
                            <div class="bench-chip">
                                <span class="chip-label">Played</span>
                                <span class="chip-value">${this.formatTime(minutes)}</span>
                            </div>
                            <div class="bench-chip">
                                <span class="chip-label">Bench</span>
                                <span class="chip-value">${this.formatTime(benchMinutes)}</span>
                            </div>
                        </div>
                    </div>
                `;
            });

            this.elements.benchList.innerHTML = benchHTML || '<p style="text-align: center; color: var(--text-muted);">No players on bench</p>';
        }

        // Update bench count
        if (this.elements.onBenchCount) {
            this.elements.onBenchCount.textContent = bench.length;
        }

        // Update freeze list (frozen players)
        if (this.elements.freezeList) {
            this.elements.freezeList.innerHTML = '<p style="text-align: center; color: var(--text-muted);">No frozen players</p>';
        }

        // Update out list (removed players)
        if (this.elements.outList) {
            if (removed.length > 0) {
                let outHTML = '';
                removed.forEach(player => {
                    const safeName = this.escapeHTML(player);
                    outHTML += `
                        <div class="bench-player" data-player="${safeName}">
                            <div class="bench-player-header">
                                <div class="bench-player-icon" style="opacity: 0.5;">⚽</div>
                                <div class="bench-player-name" style="opacity: 0.5; text-decoration: line-through;">${safeName}</div>
                            </div>
                        </div>
                    `;
                });
                this.elements.outList.innerHTML = outHTML;
            } else {
                this.elements.outList.innerHTML = '<p style="text-align: center; color: var(--text-muted);">No removed players</p>';
            }
        }
    }

    /**
     * Update player lists
     */
    updatePlayerLists(state) {
        const field = state.players?.field || [];

        // Update on field list
        if (this.elements.onFieldList) {
            let fieldHTML = '';

            field.forEach(player => {
                const minutes = state.players.minutes[player] || 0;
                const safeName = this.escapeHTML(player);
                const position = state.players.positions?.[player] || 'MF';
                const isGK = player === state.players.goalkeeper;

                fieldHTML += `
                    <li class="player-item ${isGK ? 'goalkeeper' : ''}">
                        <span class="player-position-badge">${isGK ? 'GK' : position}</span>
                        <span class="player-name">${safeName}</span>
                        <span class="player-time">${this.formatTime(minutes)}</span>
                    </li>
                `;
            });

            this.elements.onFieldList.innerHTML = fieldHTML;
        }

        // Update field count
        if (this.elements.onFieldCount) {
            this.elements.onFieldCount.textContent = field.length;
        }
    }

    /**
     * Update rotation info display
     */
    updateRotationInfo(state) {
        const rotations = state.rotations || {};

        // Update next sub countdown
        if (this.elements.nextSubCountdown) {
            if (rotations.next && !rotations.pending) {
                const timeUntil = rotations.next.time - state.currentTime;
                if (timeUntil > 0) {
                    this.elements.nextSubCountdown.textContent = this.formatTime(timeUntil);
                } else {
                    this.elements.nextSubCountdown.textContent = 'NOW!';
                }
            } else if (rotations.pending) {
                this.elements.nextSubCountdown.textContent = 'CONFIRM';
            } else {
                this.elements.nextSubCountdown.textContent = '--:--';
            }
        }

        // Update players coming off
        if (this.elements.playersComingOff) {
            if (rotations.pending && rotations.pendingOff?.length > 0) {
                this.elements.playersComingOff.innerHTML = rotations.pendingOff
                    .map(p => `<span class="player-chip">${this.escapeHTML(p)}</span>`)
                    .join(' ');
            } else if (rotations.next && !rotations.pending) {
                this.elements.playersComingOff.innerHTML = (rotations.next.off || [])
                    .map(p => `<span class="player-chip">${this.escapeHTML(p)}</span>`)
                    .join(' ');
            } else {
                this.elements.playersComingOff.textContent = 'No rotation scheduled';
            }
        }

        // Update players coming on
        if (this.elements.playersComingOn) {
            if (rotations.pending && rotations.pendingOn?.length > 0) {
                this.elements.playersComingOn.innerHTML = rotations.pendingOn
                    .map(p => `<span class="player-chip">${this.escapeHTML(p)}</span>`)
                    .join(' ');
            } else if (rotations.next && !rotations.pending) {
                this.elements.playersComingOn.innerHTML = (rotations.next.on || [])
                    .map(p => `<span class="player-chip">${this.escapeHTML(p)}</span>`)
                    .join(' ');
            } else {
                this.elements.playersComingOn.textContent = 'No rotation scheduled';
            }
        }

        // Show/hide confirm button
        if (this.elements.confirmSubButton) {
            if (rotations.pending) {
                this.elements.confirmSubButton.classList.remove('hidden');
            } else {
                this.elements.confirmSubButton.classList.add('hidden');
            }
        }
    }

    /**
     * Update variance display
     */
    updateVariance(state) {
        if (this.elements.varianceDisplay) {
            const variance = state.variance || 0;
            this.elements.varianceDisplay.textContent = `${variance}s`;

            // Color code based on variance
            if (variance <= 60) {
                this.elements.varianceDisplay.style.color = 'var(--accent-success)';
            } else if (variance <= 90) {
                this.elements.varianceDisplay.style.color = 'var(--accent-warm)';
            } else {
                this.elements.varianceDisplay.style.color = 'var(--accent-danger)';
            }

            this.displayState.lastVariance = variance;
        }
    }

    /**
     * Update status message
     */
    updateStatus(state) {
        if (!this.elements.statusMessage) return;

        if (state.gameOver) {
            this.showStatusMessage('GAME OVER', 0, 'info');
        } else if (state.isHalftime && !state.running) {
            this.showStatusMessage('HALFTIME - Press START for 2nd half', 0, 'info');
        }
    }

    /**
     * Update start/stop button
     */
    updateStartStopButton(running) {
        if (!this.elements.startStopButton) return;

        if (running) {
            this.elements.startStopButton.textContent = 'STOP';
            this.elements.startStopButton.classList.add('stop');
            this.elements.startStopButton.classList.remove('start');
        } else {
            this.elements.startStopButton.textContent = 'START';
            this.elements.startStopButton.classList.add('start');
            this.elements.startStopButton.classList.remove('stop');
        }
    }

    /**
     * Update scoreboard
     */
    updateScoreboard(scoring) {
        if (this.elements.homeScore) {
            const value = scoring.homeScore ?? scoring.home ?? 0;
            this.elements.homeScore.textContent = value;
        }

        if (this.elements.awayScore) {
            const value = scoring.awayScore ?? scoring.away ?? 0;
            this.elements.awayScore.textContent = value;
        }

        if (this.elements.homeTeamName) {
            this.elements.homeTeamName.textContent = scoring.homeTeamName || 'Home';
        }

        if (this.elements.awayTeamName) {
            this.elements.awayTeamName.textContent = scoring.awayTeamName || 'Opposition';
        }
    }

    /**
     * Update stats panel
     */
    updateStatsPanel(state) {
        if (!this.elements.statsGrid) return;

        const scoring = state.scoring || {};
        const players = state.players?.field || [];
        const allPlayers = [...players, ...(state.players?.bench || [])];

        let statsHTML = '';

        allPlayers.forEach(player => {
            const goals = scoring.playerPoints?.[player] || 0;
            const minutes = state.players.minutes[player] || 0;
            const safeName = this.escapeHTML(player);

            statsHTML += `
                <div class="stat-card">
                    <div class="stat-player-name">${safeName}</div>
                    <div class="stat-player-points">${goals} ⚽ | ${this.formatTime(minutes)}</div>
                </div>
            `;
        });

        this.elements.statsGrid.innerHTML = statsHTML;
    }

    /**
     * Update scoring pad
     */
    updateScoringPad(state) {
        if (!this.elements.scoringPadPlayers) return;

        const field = state.players?.field || [];
        const scoring = state.scoring || {};

        let padHTML = '';

        field.forEach(player => {
            const goals = scoring.playerPoints?.[player] || 0;
            const safeName = this.escapeHTML(player);
            const jsName = this.escapeForJSString(player);

            padHTML += `
                <div class="scoring-pad-player">
                    <span class="scoring-pad-player-name">${safeName}</span>
                    <span class="scoring-pad-player-points">${goals}</span>
                    <div class="scoring-pad-controls">
                        <button class="scoring-pad-btn minus" onclick="soccerUI.updatePlayerScore('${jsName}', -1)">-</button>
                        <button class="scoring-pad-btn" onclick="soccerUI.updatePlayerScore('${jsName}', 1)">+</button>
                    </div>
                </div>
            `;
        });

        this.elements.scoringPadPlayers.innerHTML = padHTML;

        // Update opposition score in pad
        const oppositionScorePad = document.getElementById('oppositionScorePad');
        if (oppositionScorePad) {
            oppositionScorePad.textContent = scoring.awayScore || 0;
        }
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

    openScoringPad() {
        if (this.elements.scoringPad) {
            this.elements.scoringPad.classList.remove('hidden');
            this.scoringPadOpen = true;
        }
    }

    closeScoringPad() {
        if (this.elements.scoringPad) {
            this.elements.scoringPad.classList.add('hidden');
            this.scoringPadOpen = false;
        }
    }

    /**
     * Update player score
     */
    updatePlayerScore(playerName, points) {
        if (this.engine) {
            this.engine.updatePlayerScore(playerName, points);
        }
    }

    /**
     * Update opposition score
     */
    updateOppositionScore(points) {
        if (this.engine) {
            this.engine.updateOppositionScore(points);
        }
    }

    /**
     * Edit team name
     */
    editTeamName(team) {
        const currentName = team === 'home'
            ? this.elements.homeTeamName?.textContent
            : this.elements.awayTeamName?.textContent;

        const newName = prompt(`Enter ${team} team name:`, currentName || '');
        if (newName !== null && newName.trim()) {
            this.engine?.updateTeamName(team, newName.trim());
        }
    }

    /**
     * Toggle stats drawer
     */
    toggleStatsDrawer() {
        if (this.elements.statsPanel) {
            this.elements.statsPanel.classList.toggle('expanded');
        }
    }

    /**
     * Show stats panel
     */
    showStatsPanel() {
        if (this.elements.statsPanel) {
            this.elements.statsPanel.classList.add('expanded');
        }
    }

    /**
     * Show status message
     */
    showStatusMessage(message, duration = 3000, type = 'info') {
        if (!this.elements.statusMessage) return;

        this.elements.statusMessage.textContent = message;
        this.elements.statusMessage.className = `game-status-top status-${type}`;

        if (duration > 0) {
            setTimeout(() => {
                this.hideStatusMessage();
            }, duration);
        }
    }

    /**
     * Hide status message
     */
    hideStatusMessage() {
        if (this.elements.statusMessage) {
            this.elements.statusMessage.textContent = '';
        }
    }

    /**
     * Show rotation pending notification
     */
    showRotationPending(rotation) {
        this.showStatusMessage('Rotation ready - Confirm when ready', 0, 'warning');
    }

    /**
     * Show recovery notification
     */
    showRecovery(recovery) {
        this.showStatusMessage(`Rotation plan updated (${recovery.strategy})`, 3000, 'info');
    }

    /**
     * Show error
     */
    showError(message) {
        this.showStatusMessage(message, 5000, 'error');
    }

    /**
     * Show early substitution warning
     */
    showEarlySubstitutionWarning() {
        this.showStatusMessage('Substitution in 1 minute!', 5000, 'warning');
    }

    /**
     * Clear rotation highlights
     */
    clearRotationHighlights() {
        document.querySelectorAll('.player-highlight').forEach(el => {
            el.classList.remove('player-highlight');
        });
    }

    /**
     * Play starting whistle
     */
    playStartingWhistleIfNeeded() {
        if (!this.startingWhistlePlayed && this.audio?.startingWhistle) {
            try {
                this.audio.startingWhistle.play().catch(e => console.warn('Whistle play failed:', e));
                this.startingWhistlePlayed = true;
            } catch (e) {
                console.warn('Whistle error:', e);
            }
        }
    }

    /**
     * Show emergency sub modal
     */
    showEmergencySubModal() {
        if (!this.elements.emergencyModal) return;

        const state = this.engine.getState();
        const field = state.players?.field || [];
        const bench = state.players?.bench || [];

        // Populate dropdowns
        const subOutSelect = document.getElementById('subOutPlayer');
        const subInSelect = document.getElementById('subInPlayer');

        if (subOutSelect) {
            subOutSelect.innerHTML = field.map(p =>
                `<option value="${this.escapeHTML(p)}">${this.escapeHTML(p)}</option>`
            ).join('');
        }

        if (subInSelect) {
            subInSelect.innerHTML = bench.map(p =>
                `<option value="${this.escapeHTML(p)}">${this.escapeHTML(p)}</option>`
            ).join('');
        }

        this.elements.emergencyModal.classList.remove('hidden');

        // Set up confirm handler
        const confirmBtn = document.getElementById('confirmEmergencySubButton');
        const cancelBtn = document.getElementById('cancelEmergencySubButton');

        const cleanup = () => {
            this.elements.emergencyModal.classList.add('hidden');
            confirmBtn?.removeEventListener('click', handleConfirm);
            cancelBtn?.removeEventListener('click', handleCancel);
        };

        const handleConfirm = () => {
            const playerOff = subOutSelect?.value;
            const playerOn = subInSelect?.value;
            const removeFromGame = document.querySelector('input[name="injuredFate"]:checked')?.value === 'remove';

            if (playerOff && playerOn) {
                const success = this.engine.emergencySubstitution(playerOff, playerOn, removeFromGame);
                if (success) {
                    cleanup();
                    this.updateDisplay(this.engine.getState());
                } else {
                    const errorEl = document.getElementById('emergencySubError');
                    if (errorEl) errorEl.textContent = 'Substitution failed. Check player positions.';
                }
            }
        };

        const handleCancel = () => {
            cleanup();
        };

        confirmBtn?.addEventListener('click', handleConfirm);
        cancelBtn?.addEventListener('click', handleCancel);
    }

    /**
     * Show manage GK modal
     */
    showManageGKModal() {
        if (!this.elements.manageGKModal) return;

        const state = this.engine.getState();
        const field = state.players?.field || [];
        const bench = state.players?.bench || [];
        const currentGK = state.players?.goalkeeper;

        // All available players except current GK
        const availablePlayers = [...field, ...bench].filter(p => p !== currentGK);

        const newGKSelect = document.getElementById('newGKPlayer');
        if (newGKSelect) {
            newGKSelect.innerHTML = availablePlayers.map(p =>
                `<option value="${this.escapeHTML(p)}">${this.escapeHTML(p)}</option>`
            ).join('');
        }

        this.elements.manageGKModal.classList.remove('hidden');

        const confirmBtn = document.getElementById('confirmManageGKButton');
        const cancelBtn = document.getElementById('cancelManageGKButton');

        const cleanup = () => {
            this.elements.manageGKModal.classList.add('hidden');
            confirmBtn?.removeEventListener('click', handleConfirm);
            cancelBtn?.removeEventListener('click', handleCancel);
        };

        const handleConfirm = () => {
            const newGK = newGKSelect?.value;
            if (newGK) {
                const success = this.engine.changeGoalkeeper(newGK);
                if (success) {
                    cleanup();
                    this.updateDisplay(this.engine.getState());
                    this.showStatusMessage(`${newGK} is now goalkeeper`, 3000, 'success');
                } else {
                    const errorEl = document.getElementById('manageGKError');
                    if (errorEl) errorEl.textContent = 'Goalkeeper change failed.';
                }
            }
        };

        const handleCancel = () => {
            cleanup();
        };

        confirmBtn?.addEventListener('click', handleConfirm);
        cancelBtn?.addEventListener('click', handleCancel);
    }

    /**
     * Show manage removed modal
     */
    showManageRemovedModal() {
        if (!this.elements.manageRemovedModal) return;

        const state = this.engine.getState();
        const removed = state.players?.removed || [];

        const removedList = document.getElementById('removedPlayerList');
        if (removedList) {
            if (removed.length === 0) {
                removedList.innerHTML = '<p style="text-align: center; color: var(--text-muted);">No removed players</p>';
            } else {
                removedList.innerHTML = removed.map(p => `
                    <div class="form-group">
                        <label>
                            <input type="checkbox" name="returnPlayer" value="${this.escapeHTML(p)}">
                            Return ${this.escapeHTML(p)} to game
                        </label>
                    </div>
                `).join('');
            }
        }

        this.elements.manageRemovedModal.classList.remove('hidden');

        const confirmBtn = document.getElementById('confirmManageRemovedButton');
        const cancelBtn = document.getElementById('cancelManageRemovedButton');

        const cleanup = () => {
            this.elements.manageRemovedModal.classList.add('hidden');
            confirmBtn?.removeEventListener('click', handleConfirm);
            cancelBtn?.removeEventListener('click', handleCancel);
        };

        const handleConfirm = () => {
            const checkboxes = document.querySelectorAll('input[name="returnPlayer"]:checked');
            checkboxes.forEach(cb => {
                this.engine.returnPlayer(cb.value);
            });
            cleanup();
            this.updateDisplay(this.engine.getState());
        };

        const handleCancel = () => {
            cleanup();
        };

        confirmBtn?.addEventListener('click', handleConfirm);
        cancelBtn?.addEventListener('click', handleCancel);
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
     * Escape HTML entities
     */
    escapeHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Escape string for JavaScript
     */
    escapeForJSString(str) {
        if (!str) return '';
        return String(str)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
    }
}
