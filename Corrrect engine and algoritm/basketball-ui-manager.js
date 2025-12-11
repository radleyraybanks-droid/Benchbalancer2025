/**
 * Basketball UI Manager
 * Handles all display and user interaction for basketball game
 * Works with existing HTML structure and IDs
 * Version 2.0 - Production Ready
 */

class BasketballUI {
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
                this.audio.startingWhistle = new Audio('startingwhistle.wav');
                this.audio.startingWhistle.volume = 0.7;
            } catch (error) {
                console.warn('Failed to initialize starting whistle audio:', error);
            }
        }

        console.log('🎨 Basketball UI Manager initialized');
    }

    /**
     * Initialize DOM element references
     */
    initializeElements() {
        // Court display
        this.elements.court = document.getElementById('basketballCourt');
        this.elements.courtPlayers = document.getElementById('courtPlayers');

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

        // Basketball court click - show stats panel
        this.elements.court?.addEventListener('click', () => {
            this.showStatsPanel();
        });
    }

    /**
     * Update entire display based on game state
     */
    updateDisplay(state) {
        this.updateTimer(state);
        this.updateCourtWithScoring(state);
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
     * Update court with scoring overlays
     */
    updateCourtWithScoring(state) {
        if (this.isMobilePortrait) {
            this.updateCourtMobile(state);
            return;
        }

        this.updateCourt(state);
    }

    updateCourtMobile(state) {
        const positions = ['pg', 'sg', 'sf', 'pf', 'c'];
        const positionLabels = { pg: 'G', sg: 'G', sf: 'FWD', pf: 'FWD', c: 'C' };
        let courtHTML = '';

        state.players.court.forEach((player, idx) => {
            const safeName = this.escapeHTML(player);
            const displayName = player.length > 8 ? `${this.escapeHTML(player.slice(0, 6))}..` : safeName;
            const posClass = `pos-${positions[idx]}`;
            const posLabel = positionLabels[positions[idx]];

            // Get playing time for this player
            const playingTimeSeconds = (state.players.minutes[player] || 0);
            const timeDisplay = this.formatTime(playingTimeSeconds);

            courtHTML += `
                <div class="player-position ${posClass}" data-player="${safeName}">
                    <span class="player-name-top">${displayName}</span>
                    <div class="player-icon" role="presentation">
                        <div class="player-silhouette"></div>
                        <div class="basketball-ball"></div>
                    </div>
                    <div class="player-time-box">
                        <span class="player-time-value">${timeDisplay}</span>
                    </div>
                    <div class="player-position-label">${posLabel}</div>
                </div>
            `;
        });

        this.elements.courtPlayers.innerHTML = courtHTML;
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

            const points = scoring.playerPoints?.[playerName] || 0;
            const jsName = this.escapeForJSString(playerName);
            const scoreLabel = points === 1 ? '1 pt' : `${points} pts`;

            const scoringControls = document.createElement('div');
            scoringControls.className = 'bench-player-scoring';
            scoringControls.innerHTML = `
                <div class="bench-score-chip">
                    <span class="chip-label">Score</span>
                    <span class="chip-value">${scoreLabel}</span>
                </div>
                <div class="bench-score-actions">
                    <button class="bench-score-btn minus" onclick="basketballUI.updatePlayerScore('${jsName}', -1)">-1</button>
                    <button class="bench-score-btn" onclick="basketballUI.updatePlayerScore('${jsName}', 1)">+1</button>
                </div>
            `;
            element.appendChild(scoringControls);
        });
    }

    /**
     * Update scoreboard display
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

        const oppositionNamePad = document.getElementById('oppositionNamePad');
        if (oppositionNamePad) {
            oppositionNamePad.textContent = scoring.awayTeamName || 'Opposition';
        }

        const oppositionScorePad = document.getElementById('oppositionScorePad');
        if (oppositionScorePad) {
            const value = scoring.awayScore ?? scoring.away ?? 0;
            oppositionScorePad.textContent = value;
        }
    }

    /**
     * Update stats panel with player points
     */
    updateStatsPanel(state) {
        if (!this.elements.statsGrid) return;

        const scoring = state.scoring || {};
        const playerPoints = scoring.playerPoints || {};

        const entries = Object.entries(playerPoints)
            .sort((a, b) => b[1] - a[1]);

        if (entries.length === 0) {
            this.elements.statsGrid.innerHTML = `
                <div class="stat-card">
                    <span class="stat-player-name">No points scored yet</span>
                </div>
            `;
            return;
        }

        const statsHTML = entries.map(([player, points]) => {
            const safeName = this.escapeHTML(player);
            return `
                <div class="stat-card">
                    <span class="stat-player-name">${safeName}</span>
                    <span class="stat-player-points">${points} pts</span>
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
        const playerPoints = scoring.playerPoints || {};

        const allPlayers = [...state.players.court, ...state.players.bench];
        const uniquePlayers = Array.from(new Set(allPlayers));

        const padHTML = uniquePlayers.map(player => {
            const points = playerPoints[player] || 0;
            const displayName = this.escapeHTML(player);
            const jsName = this.escapeForJSString(player);

            return `
                <div class="scoring-pad-player">
                    <span class="scoring-pad-player-name">${displayName}</span>
                    <span class="scoring-pad-player-points">${points}</span>
                    <div class="scoring-pad-controls">
                        <button class="scoring-pad-btn minus" onclick="basketballUI.updatePlayerScore('${jsName}', -1)">-</button>
                        <button class="scoring-pad-btn" onclick="basketballUI.updatePlayerScore('${jsName}', 1)">+</button>
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
            this.elements.scoringPadToggle.textContent = '🏀';
            // Allow CSS transition (~220ms); add a small buffer
            setTimeout(() => {
                this.elements.scoringPadToggle.style.pointerEvents = '';
            }, 300);
        }
    }

    /**
     * Update player score via UI
     */
    updatePlayerScore(playerName, points) {
        if (!this.engine) return;

        this.engine.updatePlayerScore(playerName, points);
        this.updateDisplay(this.engine.getState());

        // Only animate the player badge on larger viewports
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
    updateOppositionScore(points) {
        if (!this.engine) return;

        this.engine.updateOppositionScore(points);
        this.updateDisplay(this.engine.getState());
    }

    toggleStatsDrawer() {
        if (!this.elements.statsPanel) return;

        this.elements.statsPanel.classList.toggle('open');
    }

    /**
     * Show stats panel when basketball court is clicked
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
        this.elements.gameTimer.textContent =
            `${gameMinutes.toString().padStart(2, '0')}:${gameSeconds.toString().padStart(2, '0')}`;

        // Period timer - COUNTDOWN
        const periodLength = this.engine.config.periodLength || 1200; // Default 20 minutes
        const timeRemaining = Math.max(0, periodLength - state.periodElapsed);
        const periodMinutes = Math.floor(timeRemaining / 60);
        const periodSeconds = timeRemaining % 60;
        this.elements.periodTimer.textContent =
            `(Period: ${periodMinutes.toString().padStart(2, '0')}:${periodSeconds.toString().padStart(2, '0')})`;

        // Period display
        const periodFormat = this.engine.config.format === 'quarters' ? '4' : '2';
        this.elements.periodDisplay.textContent = `${state.currentPeriod}/${periodFormat}`;
    }

    /**
     * Update court player display with 3D isometric silhouettes
     */
    updateCourt(state) {
        const positions = ['pg', 'sg', 'sf', 'pf', 'c'];
        const positionLabels = { pg: 'G', sg: 'G', sf: 'FWD', pf: 'FWD', c: 'C' };

        let courtHTML = '';

        state.players.court.forEach((player, idx) => {
            const posClass = `pos-${positions[idx]}`;
            const safeName = this.escapeHTML(player);
            const posLabel = positionLabels[positions[idx]];

            // Get playing time for this player
            const playingTimeSeconds = (state.players.minutes[player] || 0);
            const timeDisplay = this.formatTime(playingTimeSeconds);

            // Check if player is rotating out
            const isRotatingOut = state.rotations.pendingOff.includes(player);
            const nextOutBadge = isRotatingOut ? '<span class="next-out-badge">NEXT OUT</span>' : '';
            const rotatingClass = isRotatingOut ? 'rotating-off' : '';

            courtHTML += `
                <div class="player-position ${posClass} ${rotatingClass}" data-player="${safeName}" data-role="${positions[idx]}">
                    ${nextOutBadge}
                    <span class="player-name-top">${safeName}</span>
                    <div class="player-icon" role="presentation">
                        <div class="player-silhouette"></div>
                        <div class="basketball-ball"></div>
                    </div>
                    <div class="player-time-box">
                        <span class="player-time-value">${timeDisplay}</span>
                    </div>
                    <div class="player-position-label">${posLabel}</div>
                </div>
            `;
        });

        this.elements.courtPlayers.innerHTML = courtHTML;
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

            benchHTML += `
                <div class="bench-player" data-player="${safeName}">
                    <div class="bench-player-header">
                        <div class="bench-player-icon" aria-hidden="true">
                            <span class="icon-base">🏀</span>
                            <span class="icon-label">${badgeInitials}</span>
                        </div>
                        <div class="bench-player-name">${safeName}</div>
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
        this.elements.benchList.innerHTML = benchHTML || this.renderEmptyState('No bench players yet');
        if (this.elements.onBenchCount) {
            this.elements.onBenchCount.textContent = state.players.bench.length;
        }

        // Freeze section (currently not used in basketball)
        this.elements.freezeList.innerHTML = this.renderEmptyState('None');

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
                        Final court time: ${this.formatTime(minutes)}
                    </div>
                </div>
            `;
        });
        this.elements.outList.innerHTML = outHTML || this.renderEmptyState('None');
    }

    /**
     * Update player lists (On Court / On Bench)
     */
    updatePlayerLists(state) {
        // On Court list
        let onCourtHTML = '';
        state.players.court.forEach(player => {
            const minutes = state.players.minutes[player] || 0;
            const benchMinutes = state.players.benchMinutes[player] || 0;
            const currentStint = this.calculateCurrentStint(player, state);
            const safeName = this.escapeHTML(player);
            const badgeInitials = this.escapeHTML(this.getBadgeInitials(player));
            const position = this.escapeHTML(state.players.positions[player] || '');

            onCourtHTML += `
                <li data-player="${safeName}">
                    <div class="bench-player on-court-card">
                        <div class="bench-player-header">
                            <div class="bench-player-icon" aria-hidden="true">
                                <span class="icon-base">🏀</span>
                                <span class="icon-label">${badgeInitials}</span>
                            </div>
                            <div class="bench-player-name">${safeName}</div>
                            ${position ? `<span class="position-tag">${position}</span>` : ''}
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
        this.elements.onFieldList.innerHTML = onCourtHTML;
        this.elements.onFieldCount.textContent = state.players.court.length;
    }

    /**
     * Update rotation information display
     */
    updateRotationInfo(state) {
        if (state.rotations.pending) {
            // Show pending rotation
            this.elements.nextSubCountdown.textContent = 'NOW!';
            this.elements.nextSubCountdown.style.color = '#FF8C00';
            this.elements.playersComingOff.innerHTML = this.renderPlayerChips(state.rotations.pendingOff, 'No rotation scheduled');
            this.elements.playersComingOn.innerHTML = this.renderPlayerChips(state.rotations.pendingOn, 'No rotation scheduled');
            this.elements.confirmSubButton.classList.remove('hidden');

            // Add highlights
            this.highlightRotatingPlayers(state.rotations.pendingOff, state.rotations.pendingOn);
        } else if (state.rotations.next) {
            // Show next scheduled rotation
            const timeToNext = state.rotations.next.time - state.currentTime;
            this.elements.nextSubCountdown.textContent = this.formatTime(Math.max(0, timeToNext));
            this.elements.nextSubCountdown.style.color = timeToNext <= 10 ? '#FFD700' : 'orange';
            this.elements.playersComingOff.innerHTML = this.renderPlayerChips(state.rotations.next.off, 'No rotation scheduled');
            this.elements.playersComingOn.innerHTML = this.renderPlayerChips(state.rotations.next.on, 'No rotation scheduled');
            this.elements.confirmSubButton.classList.add('hidden');
        } else {
            // No rotations scheduled
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

        // Variance display is now hidden - only update if element exists
        if (this.elements.varianceDisplay) {
            this.elements.varianceDisplay.textContent = `${variance}s`;

            // Color code based on variance
            if (variance <= 60) {
                this.elements.varianceDisplay.style.color = '#5CB85C'; // Green
            } else if (variance <= 90) {
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
            if (!this.elements.statusMessage.textContent.includes(lockIcon)) {
                this.showStatusMessage(`${lockIcon} Tempo locked during recovery`, 3000, 'info');
            }
        }
    }

    /**
     * NEW: Show early substitution warning (1 minute before scheduled sub)
     */
    showEarlySubstitutionWarning(earlyWarning) {
        const { timeRemaining, rotation } = earlyWarning;

        // Show players that will be substituted
        this.elements.playersComingOff.innerHTML = this.renderPlayerChips(rotation.off, 'No rotation scheduled');
        this.elements.playersComingOn.innerHTML = this.renderPlayerChips(rotation.on, 'No rotation scheduled');

        // Show early sub button instead of confirm button
        this.elements.earlySubButton.classList.remove('hidden');
        this.elements.confirmSubButton.classList.add('hidden');

        // Highlight players
        this.highlightRotatingPlayers(rotation.off, rotation.on);

        // Show notification
        this.showStatusMessage(`Prepare next sub (in ${timeRemaining}s) - or make early substitution`, 0, 'info');
    }

    /**
     * Show rotation pending notification
     */
    showRotationPending(rotation) {
        this.elements.playersComingOff.innerHTML = this.renderPlayerChips(rotation.off, 'No rotation scheduled');
        this.elements.playersComingOn.innerHTML = this.renderPlayerChips(rotation.on, 'No rotation scheduled');
        this.elements.confirmSubButton.classList.remove('hidden');
        this.elements.earlySubButton.classList.add('hidden');  // Hide early sub button when rotation is ready

        // Highlight players
        this.highlightRotatingPlayers(rotation.off, rotation.on);

        // Show notification
        this.showStatusMessage('Rotation ready - confirm substitution', 0, 'warning');
    }

    /**
     * Highlight players involved in rotation
     */
    highlightRotatingPlayers(playersOff, playersOn) {
        // Clear existing highlights
        this.clearRotationHighlights();

        // Highlight players coming off (court)
        playersOff.forEach(player => {
            const element = document.querySelector(`#courtPlayers [data-player="${player}"]`);
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
     * Show emergency substitution modal
     */
    showEmergencySubModal() {
        // Populate dropdowns
        const offSelect = document.getElementById('subOutPlayer');
        const onSelect = document.getElementById('subInPlayer');

        // Clear and populate court players
        offSelect.innerHTML = '';
        this.engine.players.court.forEach(player => {
            const option = document.createElement('option');
            option.value = player;
            option.textContent = player;
            offSelect.appendChild(option);
        });

        // Clear and populate bench players
        onSelect.innerHTML = '';
        this.engine.players.bench.forEach(player => {
            const option = document.createElement('option');
            option.value = player;
            option.textContent = player;
            onSelect.appendChild(option);
        });

        // Show modal
        this.elements.emergencyModal.classList.remove('hidden');

        // Attach handlers
        document.getElementById('confirmEmergencySubButton').onclick = () => {
            const playerOff = offSelect.value;
            const playerOn = onSelect.value;
            const removeFromGame = document.querySelector('input[name="injuredFate"]:checked').value === 'remove';

            if (playerOff && playerOn) {
                if (this.engine.emergencySubstitution(playerOff, playerOn, removeFromGame)) {
                    this.elements.emergencyModal.classList.add('hidden');
                    this.showStatusMessage(`Emergency sub: ${playerOff} → ${playerOn}`, 3000, 'warning');
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

        // Show modal
        this.elements.manageRemovedModal.classList.remove('hidden');

        // Attach handlers
        document.getElementById('confirmManageRemovedButton').onclick = () => {
            this.elements.manageRemovedModal.classList.add('hidden');
        };

        document.getElementById('cancelManageRemovedButton').onclick = () => {
            this.elements.manageRemovedModal.classList.add('hidden');
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
                if (this.elements.statusMessage.textContent === message) {
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
        const stint = this.engine.players.currentStints[player];
        if (!stint || !stint.onCourt) return 0;

        return state.currentTime - stint.start;
    }

    calculateCurrentBenchStint(player, state) {
        const stint = this.engine.players.currentStints[player];
        if (!stint || stint.onCourt) {
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

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BasketballUI;
}

if (typeof window !== 'undefined') {
    window.BasketballUI = BasketballUI;
    console.log('🎨 Basketball UI Manager loaded');
}
