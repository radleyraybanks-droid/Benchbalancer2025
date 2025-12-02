// Basketball Bench Balancers - Enhanced UI Controller
// This file handles the basketball-specific UI elements and interactions

class BasketballApp {
    constructor() {
        this.currentScreen = 'home';
        this.players = [];
        this.gameState = null;
        this.courtPositions = [];
        this.isGameActive = false;
        this.gameTimerInterval = null;

        // Page visibility tracking for catch-up when tab is hidden/restored
        this.lastVisibleTimestamp = null;
        this.wasRunningWhenHidden = false;
        
        // Load team configuration from external config
        const config = typeof loadTeamConfig !== 'undefined' ? loadTeamConfig() : TEAM_CONFIG;
        this.defaultTeam = config.defaultTeam;
        this.courtConfig = config.courtConfig;
        this.positionMap = config.positionMap;
        
        this.init();
    }
    
    init() {
        try {
            this.initializeEventListeners();
            this.renderBasketballCourt();
            this.populateDashboard();
            this.setupScoring();
            console.log('Basketball App initialized');
        } catch (error) {
            console.error('Error initializing Basketball App:', error);
        }
    }
    
    initializeEventListeners() {
        try {
            // Page Visibility API for time-tracking catch-up
            if (typeof document.hidden !== "undefined") {
                document.addEventListener('visibilitychange', () => {
                    this.handleVisibilityChange();
                });
                console.log('Basketball: Page Visibility API listener attached');
            } else {
                console.warn('Basketball: Page Visibility API not supported by this browser');
            }

            // Fallback for mobile browsers - pagehide/pageshow
            window.addEventListener('pagehide', () => {
                if (this.isGameActive && this.gameTimerInterval) {
                    console.log('Basketball pagehide event - recording timestamp');
                    this.lastVisibleTimestamp = Date.now();
                    this.wasRunningWhenHidden = true;
                }
            });

            window.addEventListener('pageshow', (event) => {
                if (event.persisted && this.wasRunningWhenHidden && this.lastVisibleTimestamp) {
                    const elapsedWhileHidden = Math.round((Date.now() - this.lastVisibleTimestamp) / 1000);

                    // Defensive check
                    if (elapsedWhileHidden > 3600) {
                        console.warn(`Basketball pageshow: Excessive elapsed time (${elapsedWhileHidden}s), skipping`);
                        this.lastVisibleTimestamp = null;
                        this.wasRunningWhenHidden = false;
                        return;
                    }

                    console.log(`Basketball pageshow: Applying ${elapsedWhileHidden}s of missed time`);

                    if (elapsedWhileHidden > 0) {
                        this.applyMissedTime(elapsedWhileHidden);
                    }

                    this.lastVisibleTimestamp = null;

                    // Resume if still active
                    if (this.isGameActive && this.gameTimer &&
                        (this.gameTimer.minutes > 0 || this.gameTimer.seconds > 0)) {
                        this.startGameTimer();
                    }

                    this.wasRunningWhenHidden = false;
                }
            });

            // Navigation
            const navButtons = document.querySelectorAll('.nav-item');
            if (navButtons.length > 0) {
                navButtons.forEach(button => {
                    if (button) {
                        button.addEventListener('click', (e) => {
                            const screen = button.getAttribute('data-screen');
                            if (screen) {
                                this.switchScreen(screen);
                                this.updateActiveNav(button);
                            }
                        });
                    }
                });
            }
            
            // Start Game Button
            const startGameBtn = document.getElementById('startGameBtn');
            if (startGameBtn) {
                startGameBtn.addEventListener('click', () => {
                    this.switchScreen('start');
                    this.startGame();
                });
            } else {
                console.warn('Start game button not found');
            }
            
            // Edit Team Button
            const editTeamBtn = document.getElementById('editTeamBtn');
            if (editTeamBtn) {
                editTeamBtn.addEventListener('click', () => {
                    this.showEditTeamModal();
                });
            }
            
            // Team tabs
            const teamTabs = document.querySelectorAll('.team-tab');
            if (teamTabs.length > 0) {
                teamTabs.forEach(tab => {
                    if (tab) {
                        tab.addEventListener('click', (e) => {
                            this.switchTeamTab(tab);
                        });
                    }
                });
            }
            
            // Formation selector
            const formationSelect = document.getElementById('formationSelect');
            if (formationSelect) {
                formationSelect.addEventListener('change', (e) => {
                    this.changeFormation(e.target.value);
                });
            }
        } catch (error) {
            console.error('Error initializing event listeners:', error);
        }
    }
    
    switchScreen(screenName) {
        // Hide all screens
        const screens = document.querySelectorAll('.screen');
        screens.forEach(screen => screen.classList.remove('active'));
        
        // Show target screen
        const targetScreen = document.getElementById(screenName + 'Screen');
        if (targetScreen) {
            targetScreen.classList.add('active');
            this.currentScreen = screenName;
            
            // Screen-specific initialization
            switch (screenName) {
                case 'teams':
                    this.renderBasketballCourt();
                    break;
                case 'start':
                    this.renderLiveCourt();
                    break;
                case 'stats':
                    this.updateStatsScreen();
                    break;
            }
        }
    }
    
    updateActiveNav(activeButton) {
        const navButtons = document.querySelectorAll('.nav-item');
        navButtons.forEach(btn => btn.classList.remove('active'));
        activeButton.classList.add('active');
    }
    
    renderBasketballCourt() {
        const courtContainer = document.getElementById('basketballCourt');
        if (!courtContainer) {
            console.warn('Basketball court container not found');
            return;
        }
        
        // Clear existing court
        let positionsContainer = courtContainer.querySelector('.player-positions');
        if (!positionsContainer) {
            // Create positions container if it doesn't exist
            positionsContainer = document.createElement('div');
            positionsContainer.className = 'player-positions';
            courtContainer.appendChild(positionsContainer);
        }
        positionsContainer.innerHTML = '';
        
        // Create player positions
        Object.entries(this.courtConfig.positions).forEach(([positionId, config]) => {
            const playerDiv = this.createPlayerPosition(positionId, config);
            positionsContainer.appendChild(playerDiv);
        });
        
        this.renderBenchPlayers();
    }
    
    createPlayerPosition(positionId, config) {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-position';
        playerDiv.style.left = config.x + '%';
        playerDiv.style.top = config.y + '%';
        playerDiv.setAttribute('data-position', positionId);
        
        // Find player for this position
        const player = this.getPlayerForPosition(config.label);
        
        playerDiv.innerHTML = `
            <div class="player-avatar">
                <div class="player-icon">🏀</div>
            </div>
            <div class="position-label">${config.label}</div>
            <div class="player-name-label">${player ? player.name : 'EMPTY'}</div>
        `;
        
        // Add click handler for player management
        playerDiv.addEventListener('click', () => {
            this.handlePlayerPositionClick(positionId, player);
        });
        
        return playerDiv;
    }
    
    getPlayerForPosition(positionLabel) {
        // Use position map from configuration
        const compatiblePositions = this.positionMap[positionLabel] || [positionLabel];
        
        return this.defaultTeam.players.find(player => 
            compatiblePositions.some(pos => player.position.includes(pos))
        );
    }
    
    renderBenchPlayers() {
        const benchContainer = document.getElementById('benchPlayers');
        if (!benchContainer) return;
        
        benchContainer.innerHTML = '';
        
        // Get players not currently on court (simplified logic)
        const benchPlayers = this.defaultTeam.players.slice(5); // Last 3 players on bench
        
        benchPlayers.forEach(player => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'bench-player';
            playerDiv.innerHTML = `
                <div class="player-avatar">
                    <div class="player-icon">🏀</div>
                </div>
                <div class="player-info">
                    <div class="player-name">${player.name}</div>
                    <div class="player-position-text">${player.position}</div>
                </div>
            `;
            
            playerDiv.addEventListener('click', () => {
                this.handleBenchPlayerClick(player);
            });
            
            benchContainer.appendChild(playerDiv);
        });
    }
    
    renderLiveCourt() {
        const liveCourtContainer = document.getElementById('liveBasketballCourt');
        if (!liveCourtContainer) return;
        
        liveCourtContainer.className = 'basketball-court live-court';
        liveCourtContainer.innerHTML = `
            <div class="player-positions" id="livePlayerPositions"></div>
        `;
        
        const positionsContainer = liveCourtContainer.querySelector('.player-positions');
        
        // Create live player positions with timers
        Object.entries(this.courtConfig.positions).forEach(([positionId, config]) => {
            const playerDiv = this.createLivePlayerPosition(positionId, config);
            positionsContainer.appendChild(playerDiv);
        });
        
        this.renderLiveBench();
        this.updateGameTimer();
    }
    
    createLivePlayerPosition(positionId, config) {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-position';
        playerDiv.style.left = config.x + '%';
        playerDiv.style.top = config.y + '%';
        
        const player = this.getPlayerForPosition(config.label);
        const playerTime = this.generateRandomTime(); // Placeholder for real time tracking
        
        playerDiv.innerHTML = `
            <div class="player-avatar">
                <div class="player-icon">🏀</div>
            </div>
            <div class="player-time-overlay">${playerTime}</div>
            <div class="position-label">${config.label}</div>
        `;
        
        // Add next out/in indicators based on substitution logic
        if (Math.random() > 0.7) { // 30% chance to be next out (placeholder)
            playerDiv.classList.add('next-out');
        }
        
        return playerDiv;
    }
    
    renderLiveBench() {
        const benchContainer = document.getElementById('benchPlayersLive');
        if (!benchContainer) return;
        
        benchContainer.innerHTML = '';
        
        const benchPlayers = this.defaultTeam.players.slice(5);
        
        benchPlayers.forEach((player, index) => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'bench-player-live';
            
            const benchTime = this.generateRandomTime();
            const isNextIn = index === 0; // First bench player is next in (placeholder)
            
            if (isNextIn) {
                playerDiv.classList.add('next-in');
                playerDiv.innerHTML = `
                    <div class="next-in-indicator">NEXT IN</div>
                    <div class="player-avatar">
                        <div class="player-icon">🏀</div>
                    </div>
                    <div class="player-info">
                        <div class="player-name">${player.name}</div>
                        <div class="player-position-text">${player.position}</div>
                    </div>
                    <div class="player-time-display">${benchTime}</div>
                `;
            } else {
                playerDiv.innerHTML = `
                    <div class="player-avatar">
                        <div class="player-icon">🏀</div>
                    </div>
                    <div class="player-info">
                        <div class="player-name">${player.name}</div>
                        <div class="player-position-text">${player.position}</div>
                    </div>
                    <div class="player-time-display">${benchTime}</div>
                `;
            }
            
            benchContainer.appendChild(playerDiv);
        });
    }
    
    populateDashboard() {
        // Update bench balance
        this.updateBenchBalance();
        
        // Update top players
        this.updateTopPlayers();
        
        // Update team stats (placeholder data)
        this.updateTeamStats();
    }
    
    updateBenchBalance() {
        const benchBalanceList = document.getElementById('benchBalanceList');
        if (!benchBalanceList) return;
        
        benchBalanceList.innerHTML = '';
        
        this.defaultTeam.players.forEach(player => {
            const statDiv = document.createElement('div');
            statDiv.className = 'player-stat';
            statDiv.innerHTML = `
                <span class="player-name">${player.name}</span>
                <span class="stat-value">${player.minutesPerGame}mins/G</span>
            `;
            benchBalanceList.appendChild(statDiv);
        });
    }
    
    updateTopPlayers() {
        const topPlayersList = document.getElementById('topPlayersList');
        if (!topPlayersList) return;
        
        topPlayersList.innerHTML = '';
        
        // Sort players by points
        const sortedPlayers = [...this.defaultTeam.players].sort((a, b) => b.points - a.points);
        
        sortedPlayers.forEach(player => {
            const statDiv = document.createElement('div');
            statDiv.className = 'player-stat';
            statDiv.innerHTML = `
                <span class="player-name">${player.name}</span>
                <span class="stat-value">${player.points}P/G</span>
            `;
            topPlayersList.appendChild(statDiv);
        });
    }
    
    updateTeamStats() {
        // This would integrate with actual game data
        const seasonStats = {
            pointsScored: 1255,
            pointsConceded: 925,
            plusMinus: 330,
            wins: 20,
            losses: 4,
            draws: 0
        };
        
        // Update stats in dashboard
        const seasonStatsContainer = document.getElementById('seasonStats');
        if (seasonStatsContainer) {
            seasonStatsContainer.innerHTML = `
                <div class="stat-row">
                    <span class="stat-label">POINTS SCORED</span>
                    <span class="stat-value">${seasonStats.pointsScored}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">POINTS CONCEDED</span>
                    <span class="stat-value">${seasonStats.pointsConceded}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">+/-</span>
                    <span class="stat-value positive">${seasonStats.plusMinus}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">WINS</span>
                    <span class="stat-value">${seasonStats.wins}</span>
                </div>
            `;
        }
    }
    
    setupScoring() {
        const playersScoring = document.getElementById('playersScoring');
        if (!playersScoring) return;
        
        playersScoring.innerHTML = '';
        
        this.defaultTeam.players.forEach(player => {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'player-scoring-row';
            rowDiv.innerHTML = `
                <span class="player-name">${player.name}</span>
                <div class="scoring-controls">
                    <button class="score-btn add" data-player="${player.name}" data-action="add">+</button>
                    <button class="score-btn subtract" data-player="${player.name}" data-action="subtract">−</button>
                </div>
                <span class="player-score" id="score-${player.name}">${player.points}</span>
            `;
            
            // Add event listeners for scoring buttons
            const addBtn = rowDiv.querySelector('.score-btn.add');
            const subtractBtn = rowDiv.querySelector('.score-btn.subtract');
            
            addBtn.addEventListener('click', () => {
                this.updatePlayerScore(player.name, 1);
            });
            
            subtractBtn.addEventListener('click', () => {
                this.updatePlayerScore(player.name, -1);
            });
            
            playersScoring.appendChild(rowDiv);
        });
    }
    
    updatePlayerScore(playerName, change) {
        const player = this.defaultTeam.players.find(p => p.name === playerName);
        if (player) {
            player.points = Math.max(0, player.points + change);
            
            // Update display
            const scoreElement = document.getElementById(`score-${playerName}`);
            if (scoreElement) {
                scoreElement.textContent = player.points;
            }
            
            // Update top players list
            this.updateTopPlayers();
        }
    }
    
    switchTeamTab(activeTab) {
        const tabs = document.querySelectorAll('.team-tab');
        tabs.forEach(tab => tab.classList.remove('active'));
        activeTab.classList.add('active');
    }
    
    updateStatsScreen() {
        // Update live stats displays
        this.updateTopPlayers();
        this.updateBenchBalance();
    }
    
    startGame() {
        this.isGameActive = true;
        
        // Initialize game timer
        this.gameTimer = {
            minutes: 13,
            seconds: 56,
            period: 'H2'
        };
        
        // Start timer countdown (placeholder)
        this.startGameTimer();
        
        console.log('Game started');
    }
    
    startGameTimer() {
        const timerDisplay = document.getElementById('timerDisplay');
        const periodIndicator = document.getElementById('periodIndicator');
        
        if (!timerDisplay) return;
        
        // Clear any existing timer
        if (this.gameTimerInterval) {
            clearInterval(this.gameTimerInterval);
            this.gameTimerInterval = null;
        }
        
        // Update timer display
        const updateTimer = () => {
            if (this.gameTimer.seconds > 0) {
                this.gameTimer.seconds--;
            } else if (this.gameTimer.minutes > 0) {
                this.gameTimer.minutes--;
                this.gameTimer.seconds = 59;
            } else {
                // Game ended, stop timer
                this.stopGameTimer();
                return;
            }
            
            const displayTime = `${this.gameTimer.minutes}:${this.gameTimer.seconds.toString().padStart(2, '0')}`;
            timerDisplay.textContent = displayTime;
            
            if (periodIndicator) {
                periodIndicator.textContent = this.gameTimer.period;
            }
        };
        
        // Update every second (for demo purposes)
        this.gameTimerInterval = setInterval(updateTimer, 1000);
    }
    
    stopGameTimer() {
        if (this.gameTimerInterval) {
            clearInterval(this.gameTimerInterval);
            this.gameTimerInterval = null;
        }
        this.isGameActive = false;
    }

    /**
     * Apply missed time when page was hidden
     * @param {number} secondsMissed - Seconds elapsed while page was hidden
     */
    applyMissedTime(secondsMissed) {
        if (secondsMissed <= 0 || !this.gameTimer) return;

        console.log(`Applying ${secondsMissed} seconds of missed time`);

        // Calculate total seconds remaining
        const totalSeconds = this.gameTimer.minutes * 60 + this.gameTimer.seconds;

        // Subtract missed time (timer counts down in basketball)
        const newTotalSeconds = Math.max(0, totalSeconds - secondsMissed);

        // Update timer
        this.gameTimer.minutes = Math.floor(newTotalSeconds / 60);
        this.gameTimer.seconds = newTotalSeconds % 60;

        // Update display
        const timerDisplay = document.getElementById('timerDisplay');
        if (timerDisplay) {
            const displayTime = `${this.gameTimer.minutes}:${this.gameTimer.seconds.toString().padStart(2, '0')}`;
            timerDisplay.textContent = displayTime;
        }

        // Check if game ended while hidden
        if (newTotalSeconds === 0) {
            this.stopGameTimer();
            console.log('Game ended while page was hidden');
        }
    }

    /**
     * Handle page visibility changes for catch-up logic
     */
    handleVisibilityChange() {
        if (document.hidden) {
            // Page became hidden
            if (this.isGameActive && this.gameTimerInterval) {
                console.log('Page hidden, basketball timer was running. Storing timestamp.');
                this.lastVisibleTimestamp = Date.now();
                this.wasRunningWhenHidden = true;
                this.stopGameTimer(); // Stop the timer while hidden
            } else {
                console.log('Page hidden, basketball timer was not running.');
                this.wasRunningWhenHidden = false;
            }
        } else {
            // Page became visible
            console.log('Page became visible (basketball).');

            if (this.wasRunningWhenHidden && this.lastVisibleTimestamp) {
                const elapsedWhileHidden = Math.round((Date.now() - this.lastVisibleTimestamp) / 1000);

                // Defensive check: If elapsed time is unreasonably large (>1 hour), likely stale
                if (elapsedWhileHidden > 3600) {
                    console.warn(`Elapsed time (${elapsedWhileHidden}s) seems excessive. Skipping catch-up.`);
                    this.lastVisibleTimestamp = null;
                    this.wasRunningWhenHidden = false;
                    return;
                }

                console.log(`Basketball was running. Elapsed while hidden: ${elapsedWhileHidden}s`);

                if (elapsedWhileHidden > 0) {
                    this.applyMissedTime(elapsedWhileHidden);
                }

                this.lastVisibleTimestamp = null;

                // Resume timer if game is still active
                if (this.isGameActive && this.gameTimer &&
                    (this.gameTimer.minutes > 0 || this.gameTimer.seconds > 0)) {
                    this.startGameTimer(); // Resume
                }
            }

            this.wasRunningWhenHidden = false;
        }
    }
    
    updateGameTimer() {
        // This will integrate with the existing game timer logic
        const timerDisplay = document.getElementById('timerDisplay');
        const periodIndicator = document.getElementById('periodIndicator');
        
        if (timerDisplay) {
            timerDisplay.textContent = '13:56';
        }
        
        if (periodIndicator) {
            periodIndicator.textContent = 'H2';
        }
    }
    
    generateRandomTime() {
        // Placeholder for actual time tracking
        const minutes = Math.floor(Math.random() * 20) + 10;
        const seconds = Math.floor(Math.random() * 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    handlePlayerPositionClick(positionId, player) {
        console.log(`Clicked position ${positionId}`, player);
        // Handle player position interactions
    }
    
    handleBenchPlayerClick(player) {
        console.log('Clicked bench player', player);
        // Handle bench player interactions
    }
    
    changeFormation(formation) {
        console.log('Changed formation to:', formation);
        // Implement formation changes
    }
    
    showEditTeamModal() {
        console.log('Show edit team modal');
        // Implement team editing modal
    }
    
    // Integration methods for existing game logic
    integrateWithGameState(gameState) {
        this.gameState = gameState;
        // Update UI with real game state
    }
    
    updatePlayersFromGameState() {
        // Update player data from actual game state
        if (this.gameState && this.gameState.allPlayers) {
            // Convert game state players to UI format
            this.players = this.gameState.allPlayers.map(playerName => {
                return {
                    name: playerName,
                    position: this.determinePlayerPosition(playerName),
                    points: this.getPlayerPoints(playerName),
                    minutesPerGame: this.getPlayerMinutes(playerName)
                };
            });
        }
    }
    
    determinePlayerPosition(playerName) {
        // Logic to determine player position based on game state
        return 'G'; // Placeholder
    }
    
    getPlayerPoints(playerName) {
        // Get actual player points from game tracking
        return Math.floor(Math.random() * 30); // Placeholder
    }
    
    getPlayerMinutes(playerName) {
        // Get actual player minutes from game state
        return 23; // Placeholder
    }
}

// Initialize Basketball App when DOM is ready
let basketballApp;

document.addEventListener('DOMContentLoaded', () => {
    basketballApp = new BasketballApp();
    
    // Integration with existing game logic
    if (typeof window.gameState !== 'undefined') {
        basketballApp.integrateWithGameState(window.gameState);
    }
});

// Export for potential integration
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BasketballApp;
}