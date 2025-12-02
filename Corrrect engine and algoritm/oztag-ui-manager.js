/**
 * Oztag UI Manager
 * Handles all display and user interaction for Oztag game
 * Version 1.0 - Production Ready
 */

class OztagUI {
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

        console.log('🏉 Oztag UI Manager initialized');
    }

    /**
     * Initialize DOM element references
     */
    initializeElements() {
        // Field display
        this.elements.field = document.getElementById('oztagField');
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
        this.elements.earlySubButton = document.getElementById('earlySubButton');

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
                this.engine.pause();
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

        // Early substitution button
        this.elements.earlySubButton?.addEventListener('click', () => {
            if (this.engine.rotations.nextRotationTime) {
                this.engine.triggerRotation();
                this.elements.earlySubButton.classList.add('hidden');
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
        this.updateTimer(state);
        this.updateFieldWithScoring(state);
        this.updateBenchWithScoring(state);
        this.updatePlayerLists(state);
        this.updateRotationInfo(state);
        this.updateVariance(state);
        this.updateStatus(state);
        this.updateStartStopButton(state.running);

        if (!state.running && (state.currentTime ?? 0) === 0) {
            this.startingWhistlePlayed = false;
        }

        if (state.scoring) {
            this.updateScoreboard(state.scoring);
            this.updateStatsPanel(state);
            this.updateScoringPad(state);
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
     * Update field with scoring overlays
     */
    updateFieldWithScoring(state) {
        if (this.isMobilePortrait) {
            this.updateFieldMobile(state);
            return;
        }
        this.updateField(state);
    }

    updateFieldMobile(state) {
        // 8 Oztag positions
        const positions = ['lw', 'lc', 'rc', 'rw', 'lh', 'mh', 'rh', 'fb'];
        const positionLabels = {
            'lw': 'LW', 'lc': 'LC', 'rc': 'RC', 'rw': 'RW',
            'lh': 'LH', 'mh': 'MH', 'rh': 'RH', 'fb': 'FB'
        };
        let fieldHTML = '';

        state.players.field.forEach((player, idx) => {
            const safeName = this.escapeHTML(player);
            const displayName = player.length > 8 ? `${this.escapeHTML(player.slice(0, 6))}..` : safeName;
            const posClass = `pos-${positions[idx]}`;
            const posLabel = positionLabels[positions[idx]];

            const playingTimeSeconds = (state.players.minutes[player] || 0);
            const timeDisplay = this.formatTime(playingTimeSeconds);

            const isRotatingOut = state.rotations.pendingOff.includes(player);
            const rotatingClass = isRotatingOut ? 'rotating-off' : '';

            fieldHTML += `
                <div class="player-position ${posClass} ${rotatingClass}" data-player="${safeName}">
                    <div class="player-icon" role="presentation">
                        <div class="player-silhouette"></div>
                        <div class="oztag-ball"></div>
                    </div>
                    <span class="player-name-label">${displayName}</span>
                    <div class="player-time-chip">
                        <span>${timeDisplay}</span>
                    </div>
                    <span class="player-pos-label">${posLabel}</span>
                </div>
            `;
        });

        this.elements.fieldPlayers.innerHTML = fieldHTML;
    }

    /**
     * Update bench sections with scoring controls
     */
    updateBenchWithScoring(state) {
        this.updateBenchSections(state);
        // Scoring controls are now in the floating scoring pad
        // No need to add inline scoring controls to bench cards
    }

    /**
     * Update scoreboard display
     */
    updateScoreboard(scoring) {
        if (this.elements.homeScore) {
            const value = scoring.home ?? 0;
            this.elements.homeScore.textContent = value;
        }

        if (this.elements.awayScore) {
            const value = scoring.away ?? 0;
            this.elements.awayScore.textContent = value;
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
            const value = scoring.away ?? 0;
            oppositionScorePad.textContent = value;
        }
    }

    /**
     * Update stats panel with player tries
     */
    updateStatsPanel(state) {
        if (!this.elements.statsGrid) return;

        const scoring = state.scoring || {};
        const playerTries = scoring.playerTries || {};

        const entries = Object.entries(playerTries)
            .filter(([, tries]) => tries > 0)
            .sort((a, b) => b[1] - a[1]);

        if (entries.length === 0) {
            this.elements.statsGrid.innerHTML = `
                <div class="stat-card">
                    <span class="stat-player-name">No tries scored yet</span>
                </div>
            `;
            return;
        }

        const statsHTML = entries.map(([player, tries]) => {
            const safeName = this.escapeHTML(player);
            return `
                <div class="stat-card">
                    <span class="stat-player-name">${safeName}</span>
                    <span class="stat-player-points">${tries} ${tries === 1 ? 'try' : 'tries'}</span>
                </div>
            `;
        }).join('');

        this.elements.statsGrid.innerHTML = statsHTML;
    }

    /**
     * Update floating scoring pad
     */
    updateScoringPad(state) {
        if (!this.elements.scoringPadPlayers) return;

        const scoring = state.scoring || {};
        const playerTries = scoring.playerTries || {};

        const allPlayers = [...state.players.field, ...state.players.bench];
        const uniquePlayers = Array.from(new Set(allPlayers));

        const padHTML = uniquePlayers.map(player => {
            const tries = playerTries[player] || 0;
            const displayName = this.escapeHTML(player);
            const jsName = this.escapeForJSString(player);

            return `
                <div class="scoring-pad-player">
                    <span class="scoring-pad-player-name">${displayName}</span>
                    <span class="scoring-pad-player-tries">${tries}</span>
                    <div class="scoring-pad-controls">
                        <button class="scoring-pad-btn minus" onclick="oztagUI.updatePlayerScore('${jsName}', -1)">-</button>
                        <button class="scoring-pad-btn" onclick="oztagUI.updatePlayerScore('${jsName}', 1)">+</button>
                    </div>
                </div>
            `;
        }).join('');

        this.elements.scoringPadPlayers.innerHTML = padHTML;
    }

    toggleScoringPad() {
        if (this.scoringPadOpen) {
            this.closeScoringPad();
        } else {
            this.openScoringPad();
        }
    }

    openScoringPad() {
        if (this.scoringPadOpen) return;
        this.scoringPadOpen = true;
        this.elements.scoringPad?.classList.remove('hidden');
        if (this.elements.scoringPadToggle) {
            this.elements.scoringPadToggle.style.pointerEvents = 'none';
            this.elements.scoringPadToggle.textContent = '✕';
        }
    }

    closeScoringPad() {
        if (!this.scoringPadOpen) return;
        this.scoringPadOpen = false;
        this.elements.scoringPad?.classList.add('hidden');
        if (this.elements.scoringPadToggle) {
            this.elements.scoringPadToggle.textContent = '🏉';
            setTimeout(() => {
                this.elements.scoringPadToggle.style.pointerEvents = '';
            }, 300);
        }
    }

    /**
     * Update player score (try) via UI
     */
    updatePlayerScore(playerName, delta) {
        if (!this.engine) return;

        if (delta > 0) {
            this.engine.recordTry(playerName);
        } else {
            // Allow decrementing
            if (this.engine.scoring.playerTries[playerName] > 0) {
                this.engine.scoring.playerTries[playerName]--;
                this.engine.scoring.home = Math.max(0, this.engine.scoring.home - 1);
            }
        }
        this.updateDisplay(this.engine.getState());

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
     * Update opposition score via UI
     */
    updateOppositionScore(delta) {
        if (!this.engine) return;
        this.engine.updateOppositionScore(delta);
        this.updateDisplay(this.engine.getState());
    }

    toggleStatsDrawer() {
        if (!this.elements.statsPanel) return;
        this.elements.statsPanel.classList.toggle('open');
    }

    showStatsPanel() {
        if (!this.elements.statsPanel) return;
        this.elements.statsPanel.style.display = 'block';
        this.elements.statsPanel.classList.add('open');
    }

    playStartingWhistleIfNeeded() {
        if (this.startingWhistlePlayed) return;
        if (!this.audio || !this.audio.startingWhistle) return;

        const { currentTime = 0, periodElapsed = 0 } = this.engine?.state || {};
        if (currentTime === 0 && periodElapsed === 0) {
            try {
                this.audio.startingWhistle.currentTime = 0;
                this.audio.startingWhistle.play().catch(() => {});
                this.startingWhistlePlayed = true;
            } catch (error) {
                console.warn('Starting whistle playback failed:', error);
            }
        }
    }

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
            if (saved) return;
            saved = true;
            const newName = input.value.trim() || (team === 'home' ? 'Home' : 'Opposition');

            // Update engine scoring
            if (team === 'home') {
                this.engine.scoring.homeTeamName = newName;
            } else {
                this.engine.scoring.awayTeamName = newName;
            }

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
        this.elements.gameTimer.textContent =
            `${gameMinutes.toString().padStart(2, '0')}:${gameSeconds.toString().padStart(2, '0')}`;

        // Period timer - COUNTDOWN
        const periodLength = this.engine.config.periodLength || 1200;
        const timeRemaining = Math.max(0, periodLength - state.periodElapsed);
        const periodMinutes = Math.floor(timeRemaining / 60);
        const periodSeconds = timeRemaining % 60;
        this.elements.periodTimer.textContent =
            `(Half: ${periodMinutes.toString().padStart(2, '0')}:${periodSeconds.toString().padStart(2, '0')})`;

        // Period display
        this.elements.periodDisplay.textContent = `${state.currentPeriod}/2`;
    }

    /**
     * Update field player display with 8 Oztag positions
     */
    updateField(state) {
        // 8 Oztag positions in formation
        const positions = ['lw', 'lc', 'rc', 'rw', 'lh', 'mh', 'rh', 'fb'];
        const positionLabels = {
            'lw': 'LW', 'lc': 'LC', 'rc': 'RC', 'rw': 'RW',
            'lh': 'LH', 'mh': 'MH', 'rh': 'RH', 'fb': 'FB'
        };

        let fieldHTML = '';

        state.players.field.forEach((player, idx) => {
            const posClass = `pos-${positions[idx]}`;
            const safeName = this.escapeHTML(player);
            const displayName = player.length > 8 ? `${this.escapeHTML(player.slice(0, 6))}..` : safeName;
            const posLabel = positionLabels[positions[idx]];

            const playingTimeSeconds = (state.players.minutes[player] || 0);
            const timeDisplay = this.formatTime(playingTimeSeconds);

            const isRotatingOut = state.rotations.pendingOff.includes(player);
            const nextOutBadge = isRotatingOut ? '<span class="next-out-badge">NEXT OUT</span>' : '';
            const rotatingClass = isRotatingOut ? 'rotating-off' : '';

            fieldHTML += `
                <div class="player-position ${posClass} ${rotatingClass}" data-player="${safeName}" data-role="${positions[idx]}">
                    ${nextOutBadge}
                    <div class="player-icon" role="presentation">
                        <div class="player-silhouette"></div>
                        <div class="oztag-ball"></div>
                    </div>
                    <span class="player-name-label">${displayName}</span>
                    <div class="player-time-chip">
                        <span>${timeDisplay}</span>
                    </div>
                    <span class="player-pos-label">${posLabel}</span>
                </div>
            `;
        });

        this.elements.fieldPlayers.innerHTML = fieldHTML;
    }

    /**
     * Update bench, freeze, and out sections
     */
    updateBenchSections(state) {
        let benchHTML = '';
        state.players.bench.forEach(player => {
            const minutes = state.players.minutes[player] || 0;
            const benchMinutes = state.players.benchMinutes[player] || 0;
            const benchStint = this.calculateCurrentBenchStint(player, state);
            const isRotatingOn = state.rotations.pendingOn.includes(player);
            const safeName = this.escapeHTML(player);
            const badgeInitials = this.escapeHTML(this.getBadgeInitials(player));

            benchHTML += `
                <div class="player-card" data-player="${safeName}">
                    <div class="player-card-header">
                        <div class="player-avatar">${badgeInitials}</div>
                        <div class="player-card-name">${safeName}</div>
                        ${isRotatingOn ? '<span class="next-in-badge">NEXT IN</span>' : ''}
                    </div>
                    <div class="player-metrics">
                        <div class="metric-chip">
                            <span class="label">Play</span>
                            <span class="value">${this.formatTime(minutes)}</span>
                        </div>
                        <div class="metric-chip">
                            <span class="label">Bench</span>
                            <span class="value">${this.formatTime(benchMinutes)}</span>
                        </div>
                        <div class="metric-chip">
                            <span class="label">Rest</span>
                            <span class="value">${this.formatTime(benchStint)}</span>
                        </div>
                    </div>
                </div>
            `;
        });
        this.elements.benchList.innerHTML = benchHTML || this.renderEmptyState('No bench players');
        if (this.elements.onBenchCount) {
            this.elements.onBenchCount.textContent = state.players.bench.length;
        }

        // Freeze section (hidden in new design, but maintain for compatibility)
        if (this.elements.freezeList) {
            this.elements.freezeList.innerHTML = this.renderEmptyState('None');
        }

        // Out section (removed players - hidden in new design)
        if (this.elements.outList) {
            let outHTML = '';
            state.players.removed.forEach(player => {
                const minutes = state.players.minutes[player] || 0;
                const safeName = this.escapeHTML(player);
                outHTML += `
                    <div class="player-card removed-player" data-player="${safeName}">
                        <div class="player-card-header">
                            <div class="player-avatar" style="background: var(--accent-danger);">❌</div>
                            <div class="player-card-name">${safeName}</div>
                        </div>
                        <div class="player-metrics">
                            <div class="metric-chip">
                                <span class="label">Final Time</span>
                                <span class="value">${this.formatTime(minutes)}</span>
                            </div>
                        </div>
                    </div>
                `;
            });
            this.elements.outList.innerHTML = outHTML || this.renderEmptyState('None');
        }
    }

    /**
     * Update player lists (On Field / On Bench)
     */
    updatePlayerLists(state) {
        let onFieldHTML = '';
        state.players.field.forEach(player => {
            const minutes = state.players.minutes[player] || 0;
            const benchMinutes = state.players.benchMinutes[player] || 0;
            const currentStint = this.calculateCurrentStint(player, state);
            const safeName = this.escapeHTML(player);
            const badgeInitials = this.escapeHTML(this.getBadgeInitials(player));
            const isRotatingOut = state.rotations.pendingOff.includes(player);

            onFieldHTML += `
                <div class="player-card ${isRotatingOut ? 'rotating-off' : ''}" data-player="${safeName}">
                    <div class="player-card-header">
                        <div class="player-avatar">${badgeInitials}</div>
                        <div class="player-card-name">${safeName}</div>
                        ${isRotatingOut ? '<span class="next-out-badge" style="position: static; transform: none; font-size: 9px;">NEXT OUT</span>' : ''}
                    </div>
                    <div class="player-metrics">
                        <div class="metric-chip">
                            <span class="label">Play</span>
                            <span class="value">${this.formatTime(minutes)}</span>
                        </div>
                        <div class="metric-chip">
                            <span class="label">Bench</span>
                            <span class="value">${this.formatTime(benchMinutes)}</span>
                        </div>
                        <div class="metric-chip">
                            <span class="label">Stint</span>
                            <span class="value">${this.formatTime(currentStint)}</span>
                        </div>
                    </div>
                </div>
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
            this.elements.nextSubCountdown.textContent = 'NOW!';
            this.elements.nextSubCountdown.style.color = '#FF8C00';
            this.elements.playersComingOff.innerHTML = this.renderPlayerChips(state.rotations.pendingOff, 'No rotation scheduled');
            this.elements.playersComingOn.innerHTML = this.renderPlayerChips(state.rotations.pendingOn, 'No rotation scheduled');
            this.elements.confirmSubButton.classList.remove('hidden');
            this.highlightRotatingPlayers(state.rotations.pendingOff, state.rotations.pendingOn);
        } else if (state.rotations.nextRotationTime) {
            const timeToNext = state.rotations.nextRotationTime - state.currentTime;
            this.elements.nextSubCountdown.textContent = this.formatTime(Math.max(0, timeToNext));
            this.elements.nextSubCountdown.style.color = timeToNext <= 10 ? '#FFD700' : 'orange';
            this.elements.playersComingOff.innerHTML = this.renderPlayerChips([], 'Calculating...');
            this.elements.playersComingOn.innerHTML = this.renderPlayerChips([], 'Calculating...');
            this.elements.confirmSubButton.classList.add('hidden');
        } else {
            this.elements.nextSubCountdown.textContent = '--:--';
            this.elements.nextSubCountdown.style.color = 'orange';
            this.elements.playersComingOff.innerHTML = this.renderPlayerChips([], 'No rotation scheduled');
            this.elements.playersComingOn.innerHTML = this.renderPlayerChips([], 'No rotation scheduled');
            this.elements.confirmSubButton.classList.add('hidden');
        }
    }

    /**
     * Update variance display
     */
    updateVariance(state) {
        const variance = state.variance || 0;

        if (this.elements.varianceDisplay) {
            this.elements.varianceDisplay.textContent = `${variance}s`;

            if (variance <= 60) {
                this.elements.varianceDisplay.style.color = '#5CB85C';
            } else if (variance <= 90) {
                this.elements.varianceDisplay.style.color = '#FFD700';
            } else {
                this.elements.varianceDisplay.style.color = '#D9534F';
            }
        }

        this.displayState.lastVariance = variance;
    }

    /**
     * Update status message
     */
    updateStatus(state) {
        if (state.isHalftime && !this.displayState.halftimeShown) {
            this.showStatusMessage('Halftime - Click START to begin 2nd half', 0, 'warning');
            this.displayState.halftimeShown = true;
        } else if (!state.isHalftime) {
            this.displayState.halftimeShown = false;
        }

        if (state.gameOver) {
            this.showStatusMessage('Game Over!', 0, 'success');
        }
    }

    /**
     * Show early substitution warning
     */
    showEarlySubstitutionWarning(earlyWarning) {
        const { timeRemaining, rotation } = earlyWarning;
        this.elements.playersComingOff.innerHTML = this.renderPlayerChips(rotation.off, 'No rotation scheduled');
        this.elements.playersComingOn.innerHTML = this.renderPlayerChips(rotation.on, 'No rotation scheduled');
        this.elements.earlySubButton.classList.remove('hidden');
        this.elements.confirmSubButton.classList.add('hidden');
        this.highlightRotatingPlayers(rotation.off, rotation.on);
        this.showStatusMessage(`Prepare next sub (in ${timeRemaining}s) - or make early substitution`, 0, 'info');
    }

    /**
     * Show rotation pending notification
     */
    showRotationPending(rotation) {
        this.elements.playersComingOff.innerHTML = this.renderPlayerChips(rotation.off, 'No rotation scheduled');
        this.elements.playersComingOn.innerHTML = this.renderPlayerChips(rotation.on, 'No rotation scheduled');
        this.elements.confirmSubButton.classList.remove('hidden');
        this.elements.earlySubButton.classList.add('hidden');
        this.highlightRotatingPlayers(rotation.off, rotation.on);
        this.showStatusMessage('Rotation ready - confirm substitution', 0, 'warning');
    }

    /**
     * Highlight players involved in rotation
     */
    highlightRotatingPlayers(playersOff, playersOn) {
        this.clearRotationHighlights();

        playersOff.forEach(player => {
            const element = document.querySelector(`#fieldPlayers [data-player="${player}"]`);
            if (element) {
                element.classList.add('rotating-off');
                element.style.border = '2px solid #FF8C00';
            }
        });

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
     * Show emergency substitution modal
     */
    showEmergencySubModal() {
        const offSelect = document.getElementById('subOutPlayer');
        const onSelect = document.getElementById('subInPlayer');

        offSelect.innerHTML = '';
        this.engine.players.field.forEach(player => {
            const option = document.createElement('option');
            option.value = player;
            option.textContent = player;
            offSelect.appendChild(option);
        });

        onSelect.innerHTML = '';
        this.engine.players.bench.forEach(player => {
            const option = document.createElement('option');
            option.value = player;
            option.textContent = player;
            onSelect.appendChild(option);
        });

        this.elements.emergencyModal.classList.remove('hidden');

        document.getElementById('confirmEmergencySubButton').onclick = () => {
            const playerOff = offSelect.value;
            const playerOn = onSelect.value;
            const removeFromGame = document.querySelector('input[name="injuredFate"]:checked')?.value === 'remove';

            if (playerOff && playerOn) {
                const result = this.engine.emergencySubstitution(playerOff, playerOn);
                if (result.success) {
                    if (removeFromGame) {
                        this.engine.removePlayer(playerOff);
                    }
                    this.elements.emergencyModal.classList.add('hidden');
                    this.showStatusMessage(`Emergency sub: ${playerOff} → ${playerOn}`, 3000, 'warning');
                    this.updateDisplay(this.engine.getState());
                }
            }
        };

        document.getElementById('cancelEmergencySubButton').onclick = () => {
            this.elements.emergencyModal.classList.add('hidden');
        };
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

        this.elements.manageRemovedModal.classList.remove('hidden');

        document.getElementById('confirmManageRemovedButton').onclick = () => {
            this.elements.manageRemovedModal.classList.add('hidden');
        };

        document.getElementById('cancelManageRemovedButton').onclick = () => {
            this.elements.manageRemovedModal.classList.add('hidden');
        };
    }

    /**
     * Return player to game
     */
    returnPlayerToGame(player) {
        const result = this.engine.returnPlayer(player);
        if (result.success) {
            this.showStatusMessage(`${player} returned to game`, 3000, 'success');
            this.showManageRemovedModal();
            this.updateDisplay(this.engine.getState());
        }
    }

    /**
     * Show status message
     */
    showStatusMessage(message, duration = 3000, type = 'info') {
        this.elements.statusMessage.textContent = message;

        const colors = {
            'info': '#00FFE0',
            'success': '#5CB85C',
            'warning': '#FFD700',
            'error': '#D9534F'
        };

        this.elements.statusMessage.style.color = colors[type] || colors.info;

        if (duration > 0) {
            setTimeout(() => {
                if (this.elements.statusMessage.textContent === message) {
                    this.elements.statusMessage.textContent = '';
                }
            }, duration);
        }
    }

    hideStatusMessage() {
        this.elements.statusMessage.textContent = '';
    }

    /**
     * Show error message
     */
    showError(error) {
        this.showStatusMessage(error, 5000, 'error');
        console.error('UI Error:', error);
    }

    /**
     * Update start/stop button
     */
    updateStartStopButton(isRunning) {
        if (isRunning) {
            this.elements.startStopButton.textContent = 'PAUSE CLOCK';
            this.elements.startStopButton.classList.add('stop');
        } else {
            this.elements.startStopButton.textContent = 'START';
            this.elements.startStopButton.classList.remove('stop');
        }
    }

    /**
     * Calculate current stint time for a player on field
     */
    calculateCurrentStint(player, state) {
        const stintStart = this.engine.players.stintStart[player];
        if (stintStart === null || stintStart === undefined) return 0;
        return state.currentTime - stintStart;
    }

    calculateCurrentBenchStint(player, state) {
        const stintStart = this.engine.players.stintStart[player];
        if (stintStart !== null && stintStart !== undefined) {
            return 0; // Player is on field
        }
        // Estimate bench stint from bench minutes and current time
        return state.players.benchMinutes[player] || 0;
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
        return backslashEscaped.split("'").join("\\'");
    }

    renderPlayerChips(list, emptyLabel = 'None') {
        if (!Array.isArray(list) || list.length === 0) {
            return `<span class="empty-state">${this.escapeHTML(emptyLabel)}</span>`;
        }

        return list
            .map(name => `<span class="player-chip">${this.escapeHTML(name)}</span>`)
            .join('');
    }

    renderEmptyState(message) {
        return `<p class="empty-state">${this.escapeHTML(message)}</p>`;
    }

    getBadgeInitials(name) {
        const raw = String(name ?? '').trim();
        if (!raw) return 'OZ';

        const numeric = raw.match(/\d+/);
        if (numeric) {
            return numeric[0].slice(0, 2).toUpperCase();
        }

        const cleaned = raw.replace(/[^a-zA-Z ]/g, ' ').trim();
        const tokens = cleaned.split(/\s+/).filter(Boolean);

        if (tokens.length === 0) {
            return raw.slice(0, 2).toUpperCase() || 'OZ';
        }

        if (tokens.length === 1) {
            const token = tokens[0];
            return token.slice(0, Math.min(2, token.length)).toUpperCase();
        }

        const first = tokens[0][0] ?? '';
        const last = tokens[tokens.length - 1][0] ?? '';
        const combo = `${first}${last}`.toUpperCase();
        return combo || tokens[0].slice(0, 2).toUpperCase() || 'OZ';
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OztagUI;
}

if (typeof window !== 'undefined') {
    window.OztagUI = OztagUI;
    console.log('🏉 Oztag UI Manager loaded');
}
