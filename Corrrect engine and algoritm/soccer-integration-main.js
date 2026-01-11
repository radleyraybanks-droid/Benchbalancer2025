/**
 * Soccer Integration - Main Orchestrator
 * Connects all components and manages game flow
 * This is the main entry point for the soccer game
 * Version 2.0 - Production Ready
 */

import { SoccerGameEngine } from './soccer-game-engine.js';
import { SoccerUI } from './soccer-ui-manager-new.js';
import { SoccerSetup } from './soccer-setup-manager.js';
import { benchBalancerSupabase, initAuth } from './config/simple-supabase.js';
import { SubscriptionLimits } from './js/subscription-limits.js';

// Global variables for game components
let gameEngine = null;
let gameUI = null;
let setupManager = null;

// Auth will be initialized after DOM is ready

/**
 * Initialize soccer game system
 */
function initializeSoccerSystem() {
    console.log('⚽ Initializing Soccer System...');

    // Initialize setup manager
    setupManager = new SoccerSetup();

    // Load any saved configuration
    setupManager.loadSavedConfig();

    // Check for active game session to restore
    try {
        const savedState = localStorage.getItem('soccerGameState');
        if (savedState) {
            console.log('📦 Found saved game state, attempting restore...');
            const snapshot = JSON.parse(savedState);

            // Only restore if less than 24 hours old
            if (Date.now() - snapshot.timestamp < 24 * 60 * 60 * 1000) {
                // Initialize engine
                gameEngine = new SoccerGameEngine();

                // Initialize UI first so it's ready
                gameUI = new SoccerUI(gameEngine);
                if (typeof window !== 'undefined') {
                    window.soccerUI = gameUI;
                }

                if (gameEngine.restoreFromSnapshot(snapshot)) {
                    console.log('♻️ Game restored!');
                    setupGameCallbacks();

                    // Hide setup, show game
                    const setupEl = document.getElementById('setup');
                    const gameEl = document.getElementById('game-container');
                    if (setupEl) setupEl.classList.add('hidden');
                    if (gameEl) gameEl.classList.remove('hidden');

                    // Update display immediately
                    gameUI.updateDisplay(gameEngine.getState());
                    gameUI.showStatusMessage('Game restored from previous session (Paused)', 5000, 'info');

                    return true;
                }
            } else {
                console.log('🗑️ Saved state expired, clearing...');
                localStorage.removeItem('soccerGameState');
            }
        }
    } catch (e) {
        console.warn('Failed to restore saved game:', e);
        // Clear corrupt state
        localStorage.removeItem('soccerGameState');
    }

    // Check for competitive match mode
    const urlParams = new URLSearchParams(window.location.search);
    const isCompetitiveMode = urlParams.get('mode') === 'competitive';

    if (isCompetitiveMode) {
        console.log('🏆 Competitive Match Mode Detected');
        const matchData = sessionStorage.getItem('competitiveMatchData');
        if (matchData) {
            try {
                const parsedMatch = JSON.parse(matchData);
                console.log('📋 Match Data:', parsedMatch);
                // Store globally for game initialization
                window.competitiveMatchData = parsedMatch;
            } catch (e) {
                console.warn('Failed to parse match data:', e);
            }
        }
    }

    console.log('✅ Soccer System initialized successfully');
    return true;
}

/**
 * Start soccer game with configuration
 */
function startSoccerGame(setupData) {
    console.log('⚽ Starting Soccer Game...');
    console.log('Setup data:', setupData);

    try {
        // Create game engine
        gameEngine = new SoccerGameEngine();

        // EXPOSE TO WINDOW FOR DEBUGGING
        window.gameEngine = gameEngine;
        console.log('🎮 gameEngine exposed to window.gameEngine');

        // Initialize game with setup data
        const initResult = gameEngine.initialize(setupData);

        if (!initResult.success) {
            throw new Error('Game initialization failed');
        }

        // Create UI manager
        gameUI = new SoccerUI(gameEngine);
        if (typeof window !== 'undefined') {
            window.soccerUI = gameUI;
        }

        // Set up callbacks
        setupGameCallbacks();

        // Initial display update
        gameUI.updateDisplay(gameEngine.getState());

        // Save configuration for next time
        if (setupManager) {
            setupManager.saveConfig();
        }

        console.log('✅ Game started successfully');
        console.log(`   Roster: ${initResult.roster} players`);
        console.log(`   Field Players: ${initResult.fieldSpots}`);
        console.log(`   Goalkeeper: ${initResult.hasGoalkeeper ? 'Yes' : 'No'}`);
        console.log(`   Rotations: ${initResult.rotations} planned`);
        console.log(`   Target: ${Math.floor(initResult.targetMinutes / 60)} minutes per player`);
        console.log(`   Expected variance: ${initResult.expectedVariance}s`);

        // Show initial status
        gameUI.showStatusMessage('Game ready - press START to begin', 3000, 'success');

        return true;

    } catch (error) {
        console.error('Failed to start game:', error);
        showGameError('Failed to start game: ' + error.message);

        // Return to setup
        document.getElementById('setup').classList.remove('hidden');
        document.getElementById('game-container').classList.add('hidden');

        return false;
    }
}

/**
 * Set up game callbacks
 */
function setupGameCallbacks() {
    // Update display on every tick
    gameEngine.callbacks.onUpdate = (state) => {
        gameUI.updateDisplay(state);
    };

    // Handle score updates
    gameEngine.callbacks.onScoreUpdate = (scoring) => {
        gameUI.updateScoreboard(scoring);
        // Save immediately on score change (only if getSnapshot exists)
        if (typeof gameEngine.getSnapshot === 'function') {
            const snapshot = gameEngine.getSnapshot();
            localStorage.setItem('soccerGameState', JSON.stringify(snapshot));
        }
    };

    // Handle rotation notifications
    gameEngine.callbacks.onRotation = (rotation) => {
        gameUI.showRotationPending(rotation);
    };

    // Handle period end
    gameEngine.callbacks.onPeriodEnd = (periodInfo) => {
        handlePeriodEnd(periodInfo);
        // Save at period end (only if getSnapshot exists)
        if (typeof gameEngine.getSnapshot === 'function') {
            const snapshot = gameEngine.getSnapshot();
            localStorage.setItem('soccerGameState', JSON.stringify(snapshot));
        }
    };

    // Handle game end
    gameEngine.callbacks.onGameEnd = (stats) => {
        handleGameEnd(stats);
        // Clear saved state when game finishes naturally
        localStorage.removeItem('soccerGameState');
    };

    // Handle errors
    gameEngine.callbacks.onError = (error) => {
        gameUI.showError(error);
    };

    // Handle warnings
    gameEngine.callbacks.onWarning = (secondsRemaining) => {
        const seconds = secondsRemaining || (gameEngine && gameEngine.config && gameEngine.config.warningBeepTime) || 10;
        gameUI.showStatusMessage(`Rotation in ${seconds} seconds!`, 2000, 'warning');
    };

    // NEW: Handle 1-minute early warning
    gameEngine.callbacks.onEarlyWarning = (earlyWarning) => {
        gameUI.showEarlySubstitutionWarning(earlyWarning);
    };

    // Handle recovery notifications
    gameEngine.callbacks.onRecovery = (recovery) => {
        gameUI.showRecovery(recovery);
    };

    // Handle goalkeeper change notifications
    gameEngine.callbacks.onGoalkeeperChange = (gkChange) => {
        gameUI.showGoalkeeperChange(gkChange);
    };

    // =========================================================================
    // Robust State Persistence (Auto-save & Save-on-Exit)
    // =========================================================================

    // 1. periodic auto-save (every 30 seconds)
    if (window.gameAutoSaveInterval) clearInterval(window.gameAutoSaveInterval);
    window.gameAutoSaveInterval = setInterval(() => {
        if (gameEngine && gameEngine.state.running && typeof gameEngine.getSnapshot === 'function') {
            const snapshot = gameEngine.getSnapshot();
            localStorage.setItem('soccerGameState', JSON.stringify(snapshot));
        }
    }, 30000);

    // 2. Save on tab close/refresh
    window.addEventListener('beforeunload', () => {
        if (gameEngine && gameEngine.state.initialized && typeof gameEngine.getSnapshot === 'function') {
            const snapshot = gameEngine.getSnapshot();
            localStorage.setItem('soccerGameState', JSON.stringify(snapshot));
        }
    });
}

/**
 * Handle period end
 */
function handlePeriodEnd(periodInfo) {
    console.log('Period ended:', periodInfo);

    if (periodInfo.isHalftime) {
        gameUI.showStatusMessage('HALFTIME - Take a break!', 0, 'info');
    } else {
        gameUI.showStatusMessage(`Half ${periodInfo.period} complete`, 3000, 'info');
    }

    // Update button to show ready for next period
    gameUI.updateStartStopButton(false);
}

/**
 * Handle game end
 */
async function handleGameEnd(stats) {
    console.log('Game ended with stats:', stats);

    // Show final statistics
    let message = '🏁 FULL TIME! ';

    if (stats.variance <= 60) {
        message += `Perfect balance achieved! Variance: ${stats.variance}s`;
        gameUI.showStatusMessage(message, 0, 'success');
    } else if (stats.variance <= 90) {
        message += `Good balance. Variance: ${stats.variance}s`;
        gameUI.showStatusMessage(message, 0, 'info');
    } else {
        message += `Variance: ${stats.variance}s`;
        gameUI.showStatusMessage(message, 0, 'warning');
    }

    // Display detailed stats
    displayFinalStats(stats);

    // Check if this was a competitive match
    const isCompetitive = window.competitiveMatchData !== undefined;

    // MATCH REPORT FLOW
    // Show buttons for post-match actions
    const container = document.getElementById('game-container');
    const reportBtnId = 'downloadReportBtn_' + Date.now();

    // Create or find a wrapper for end game actions
    let actionWrapper = document.getElementById('endGameActions');
    if (!actionWrapper) {
        actionWrapper = document.createElement('div');
        actionWrapper.id = 'endGameActions';
        actionWrapper.style.cssText = 'position:fixed; top:120px; left:50%; transform:translateX(-50%); z-index:1001; display:flex; gap:16px; flex-direction:column; width:320px; background: rgba(4, 7, 13, 0.95); padding: 20px; border-radius: 16px; border: 2px solid var(--accent-cyan); box-shadow: 0 0 30px rgba(0, 255, 224, 0.3);';
        container.appendChild(actionWrapper);
    }
    actionWrapper.innerHTML = ''; // Clear old buttons

    // Check if user is authenticated first
    let isAuthenticated = false;
    if (window.benchBalancerSupabase) {
        try {
            const { data: { user } } = await window.benchBalancerSupabase.auth.getUser();
            isAuthenticated = !!user;
        } catch (e) {
            isAuthenticated = false;
        }
    }

    // ===========================================
    // SAVE TO DATABASE BUTTON (authenticated users only)
    // ===========================================
    if (isAuthenticated) {
        gameUI.showStatusMessage('Adjust scores if needed, then SAVE to database', 0, 'info');

        const saveBtn = document.createElement('button');
        saveBtn.id = 'saveToDbBtn';
        saveBtn.className = 'btn-primary';
        saveBtn.style.cssText = 'background: linear-gradient(135deg, #00ffe0, #00cdb8); color: #041018; font-weight:bold; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow: 0 4px 15px rgba(0, 255, 224, 0.4); padding: 14px 20px; border-radius: 12px; border: none; cursor: pointer; font-size: 14px; letter-spacing: 0.1em;';
        saveBtn.innerHTML = '<span>💾</span> SAVE TO DATABASE';

        saveBtn.onclick = async () => {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span>⏳</span> SAVING...';
            saveBtn.style.opacity = '0.7';
            saveBtn.style.cursor = 'not-allowed';

            try {
                // Get FRESH stats from game engine (includes any post-game score adjustments)
                const finalStats = gameEngine.getStats();
                console.log('📊 Final stats to save:', finalStats);

                if (isCompetitive) {
                    await saveCompetitiveMatchResults(finalStats, window.competitiveMatchData);
                } else if (window.statsTracker) {
                    // For practice matches, check pro status
                    let isPro = false;
                    if (window.benchBalancerSupabase) {
                        const { data: { user } } = await window.benchBalancerSupabase.auth.getUser();
                        if (user) {
                            isPro = await SubscriptionLimits.isProUser(user.id);
                        }
                    }

                    if (isPro) {
                        const result = await window.statsTracker.saveGame(finalStats);
                        if (result.success) {
                            gameUI.showStatusMessage('✅ Stats saved successfully!', 5000, 'success');
                        } else {
                            gameUI.showStatusMessage('⚠️ Stats save failed', 5000, 'warning');
                        }
                    } else {
                        gameUI.showStatusMessage('⚠️ Pro subscription required to save practice stats', 5000, 'warning');
                    }
                }

                saveBtn.innerHTML = '<span>✅</span> SAVED!';
                saveBtn.style.background = 'linear-gradient(135deg, #4be9a6, #3dd192)';

            } catch (error) {
                console.error('Save failed:', error);
                saveBtn.innerHTML = '<span>❌</span> SAVE FAILED - TRY AGAIN';
                saveBtn.disabled = false;
                saveBtn.style.opacity = '1';
                saveBtn.style.cursor = 'pointer';
                gameUI.showStatusMessage('Error saving stats: ' + error.message, 5000, 'error');
            }
        };

        actionWrapper.appendChild(saveBtn);
    } else {
        // ===========================================
        // DOWNLOAD REPORT BUTTON (guests only)
        // ===========================================
        gameUI.showStatusMessage('Game complete! Download your match report below.', 0, 'info');

        const downloadBtn = document.createElement('button');
        downloadBtn.id = reportBtnId;
        downloadBtn.className = 'btn-primary';
        downloadBtn.style.cssText = 'background: linear-gradient(135deg, #00ffe0, #00cdb8); color: #041018; font-weight:bold; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow: 0 4px 15px rgba(0, 255, 224, 0.4); padding: 14px 20px; border-radius: 12px; border: none; cursor: pointer; font-size: 14px; letter-spacing: 0.1em;';
        downloadBtn.innerHTML = '<span>📄</span> DOWNLOAD MATCH REPORT';

        downloadBtn.onclick = () => {
            // Get fresh stats for email
            const reportStats = gameEngine.getStats();
            showGuestStatsEmailModal(reportStats);
        };

        actionWrapper.appendChild(downloadBtn);
    }
}

/**
 * Save competitive match results to Supabase
 */
async function saveCompetitiveMatchResults(stats, matchData) {
    if (!benchBalancerSupabase) {
        console.warn('Supabase not available');
        gameUI.showStatusMessage('Match finished (Not connected to save stats)', 5000, 'warning');
        return;
    }

    try {
        const { data: { user } } = await benchBalancerSupabase.auth.getUser();

        if (!user) {
            console.warn('User not authenticated');
            gameUI.showStatusMessage('Match finished (Sign in to save stats)', 5000, 'warning');
            return;
        }

        // Determine result
        console.log('📊 Stats received for save:', {
            homeScore: stats.homeScore,
            awayScore: stats.awayScore,
            teamName: stats.teamName,
            opponentName: stats.opponentName,
            players: Object.keys(stats.players || {}).length
        });

        let result = 'draw';
        if (stats.homeScore > stats.awayScore) result = 'win';
        else if (stats.homeScore < stats.awayScore) result = 'loss';

        console.log('📊 Determined result:', result, `(${stats.homeScore} vs ${stats.awayScore})`);

        // Get planned lineup from localStorage
        let plannedLineup = null;
        try {
            const lineupData = localStorage.getItem('benchbalancer_soccer_default_lineup');
            if (lineupData) {
                const parsed = JSON.parse(lineupData);
                plannedLineup = {
                    starting: parsed.starting || [],
                    bench: parsed.bench || [],
                    goalkeeper: parsed.goalkeeper || null,
                    unavailable: parsed.unavailable || []
                };
            }
        } catch (e) {
            console.warn('Could not load planned lineup:', e);
        }

        // Get actual lineup from game stats (who actually played)
        const actualLineup = {
            played: Object.keys(stats.players || {}),
            starters: Object.keys(stats.players || {}).filter(name => {
                const p = stats.players[name];
                return p && p.minutes > 0;
            }),
            goalkeeper: stats.goalkeeper || null
        };

        // Save match result
        const insertData = {
            scheduled_match_id: matchData.scheduleId || null,
            opponent: matchData.opponent || stats.opponentName,
            match_date: matchData.date || new Date().toISOString().split('T')[0],
            match_time: matchData.time || null,
            venue: matchData.venue || null,
            home_away: matchData.homeAway !== undefined ? matchData.homeAway : true,
            team_score: stats.homeScore || 0,
            opponent_score: stats.awayScore || 0,
            game_format: 'halves', // Soccer is always halves
            sport_type: 'soccer', // Mark as soccer match
            result: result,
            planned_lineup: plannedLineup,
            actual_lineup: actualLineup,
            user_id: user.id
        };

        console.log('📤 Inserting match data:', insertData);

        const { data: matchResult, error: matchError } = await benchBalancerSupabase
            .from('match_results')
            .insert(insertData)
            .select()
            .single();

        if (matchError) {
            console.error('Failed to save match result:', matchError);
            console.error('Error details:', matchError.message, matchError.details, matchError.hint);
            gameUI.showStatusMessage('Error saving: ' + matchError.message, 5000, 'warning');
            return;
        }

        console.log('✅ Match result saved:', matchResult);

        // Save player stats
        const playerStats = Object.entries(stats.players).map(([playerName, playerData]) => ({
            match_result_id: matchResult.id,
            user_id: user.id,
            player_name: playerName,
            jersey_number: playerData.jerseyNumber ? parseInt(playerData.jerseyNumber, 10) : null,
            position: playerData.position || null,
            is_goalkeeper: playerData.isGoalkeeper || false,
            time_on_field: playerData.minutes || 0,
            time_on_bench: playerData.benchMinutes || 0,
            goals_scored: playerData.goals || 0
        }));

        console.log('📤 Saving player stats:', playerStats);
        console.log('📊 Stats object structure:', stats.players);

        const { error: statsError } = await benchBalancerSupabase
            .from('match_player_stats')
            .insert(playerStats);

        if (statsError) {
            console.error('❌ Failed to save player stats:', statsError);
            console.error('Error details:', JSON.stringify(statsError, null, 2));
            gameUI.showStatusMessage('Match saved but player stats failed: ' + statsError.message, 5000, 'warning');
            return;
        }

        console.log('✅ Player stats saved for', playerStats.length, 'players');
        gameUI.showStatusMessage(`✅ Competitive match saved! Result: ${result.toUpperCase()}`, 6000, 'success');

        // Clear competitive match data
        sessionStorage.removeItem('competitiveMatchData');
        window.competitiveMatchData = undefined;

    } catch (error) {
        console.error('Error saving competitive match:', error);
        gameUI.showStatusMessage('Match finished (Error saving to database)', 5000, 'warning');
    }
}

/**
 * Report Download Logic
 */
async function initiateReportDownload(stats) {
    // Check if user is logged in (using existing token check)
    const session = localStorage.getItem('sb-pomcalscfnwsqlscunxf-auth-token');

    if (session) {
        // Logged in: Direct Download
        generateMatchReportPDF(stats);
    } else {
        // Not logged in: Show Email Capture
        showEmailCaptureModal(stats);
    }
}

function showEmailCaptureModal(stats) {
    const modalId = 'emailCaptureModal';
    let modal = document.getElementById(modalId);

    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="text-align:center; max-width:350px;">
                <h2 style="color:var(--accent-cyan); margin-top:0;">Get your Report</h2>
                <p style="color:#aaa; font-size:14px; margin-bottom:20px;">Enter your email to unlock the professional match report PDF.</p>

                <input type="email" id="leadEmailInput" placeholder="coach@example.com"
                    style="width:100%; padding:12px; border-radius:8px; border:1px solid #444; background:#111; color:white; margin-bottom:16px;">

                <button id="unlockReportBtn" style="width:100%; padding:14px; background:var(--accent-cyan); color:black; font-weight:bold; border-radius:8px; border:none; cursor:pointer;">
                    UNLOCK PDF
                </button>
                <div id="leadError" style="color:red; font-size:12px; margin-top:8px; display:none;"></div>
                <button onclick="document.getElementById('${modalId}').remove()" style="background:none; border:none; color:#666; font-size:12px; margin-top:16px; cursor:pointer;">No thanks</button>
            </div>
        `;
        document.body.appendChild(modal);

        // Handler
        document.getElementById('unlockReportBtn').onclick = async () => {
            const email = document.getElementById('leadEmailInput').value;
            const btn = document.getElementById('unlockReportBtn');
            const err = document.getElementById('leadError');

            if (!email || !email.includes('@')) {
                err.innerText = "Please enter a valid email";
                err.style.display = 'block';
                return;
            }

            btn.innerText = "Generating...";
            btn.disabled = true;

            // Save Lead
            try {
                if (benchBalancerSupabase) {
                    await benchBalancerSupabase.from('leads').insert([{ email: email, source: 'soccer_match_report' }]);
                }
            } catch (e) { console.warn('Lead save failed', e); }

            modal.remove();
            generateMatchReportPDF(stats);
            gameUI.showStatusMessage('Report generated! Check your downloads.', 4000, 'success');
        };
    } else {
        modal.style.display = 'flex';
    }
}

/**
 * Generate PDF using jsPDF
 */
function generateMatchReportPDF(stats) {
    // Check for jsPDF in both lowercase and uppercase (different CDN versions)
    const jsPDFLib = window.jspdf || window.jsPDF;

    if (!jsPDFLib) {
        console.error('jsPDF not loaded. window.jspdf:', window.jspdf, 'window.jsPDF:', window.jsPDF);
        alert('PDF generator not loaded. Please refresh the page.');
        return;
    }

    const jsPDF = jsPDFLib.jsPDF || jsPDFLib;
    const doc = new jsPDF();

    // Colors & Fonts
    const primaryColor = [0, 204, 221]; // Neon Cyan-ish
    const darkBg = [15, 21, 31];

    // Header Section
    doc.setFillColor(...darkBg);
    doc.rect(0, 0, 210, 50, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text("SOCCER MATCH REPORT", 105, 20, null, null, "center");

    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text(`${stats.teamName}  vs  ${stats.opponentName}`, 105, 35, null, null, "center");

    // Score Big
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(48);
    doc.setFont('helvetica', 'bold');
    doc.text(`${stats.homeScore}  -  ${stats.awayScore}`, 105, 75, null, null, "center");

    // Fairness Card
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');

    let varianceText = "Excellent Balance";
    if (stats.variance > 60) varianceText = "Good Balance";
    if (stats.variance > 120) varianceText = "Uneven Playing Time";

    doc.text(`Fairness Analysis: ${varianceText} (${stats.variance}s variance)`, 105, 90, null, null, "center");

    // Table Data
    const tableData = [];
    Object.entries(stats.players).forEach(([name, data]) => {
        const mins = Math.floor(data.minutes / 60);
        const secs = data.minutes % 60;
        const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
        const pct = data.percentage + '%';
        const goals = data.goals !== undefined ? data.goals : '-';
        const pos = data.isGoalkeeper ? 'GK' : (data.position || '-');

        tableData.push([name, pos, timeStr, pct, goals]);
    });

    // Sort by Time
    tableData.sort((a, b) => parseFloat(b[3]) - parseFloat(a[3]));

    doc.autoTable({
        startY: 100,
        head: [['Player Name', 'Pos', 'Time on Field', 'Share %', 'Goals']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 11, cellPadding: 6 },
        alternateRowStyles: { fillColor: [245, 245, 245] }
    });

    // Footer
    const finalY = doc.lastAutoTable.finalY + 20;
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text("Generated by Bench Balancer - The Fair Play App", 105, 280, null, null, "center");

    const filename = `SoccerMatchReport_${stats.teamName.replace(/\s/g, '')}.pdf`;
    doc.save(filename);
}

/**
 * Display final game statistics
 */
function displayFinalStats(stats) {
    console.log('📊 Final Game Statistics:');
    console.log('========================');

    // Overall stats
    console.log(`Total Rotations: ${stats.rotations}`);
    console.log(`Final Variance: ${stats.variance} seconds`);
    console.log(`Average Minutes: ${Math.floor(stats.averageMinutes / 60)}`);

    // Goalkeeper info
    if (stats.goalkeeper) {
        console.log(`Goalkeeper: ${stats.goalkeeper}`);
    }

    // Per-player stats
    console.log('\nPlayer Statistics:');
    console.log('------------------');

    const sortedPlayers = Object.entries(stats.players)
        .sort((a, b) => b[1].minutes - a[1].minutes);

    sortedPlayers.forEach(([player, data]) => {
        const mins = Math.floor(data.minutes / 60);
        const secs = data.minutes % 60;
        const gkIndicator = data.isGoalkeeper ? ' [GK]' : '';
        console.log(`${player}${gkIndicator}: ${mins}:${secs.toString().padStart(2, '0')} (${data.percentage}%)`);
    });

    // Enforcer analytics
    if (stats.enforcerAnalytics) {
        console.log('\nEnforcer Analytics:');
        console.log('-------------------');
        console.log(`Disruptions Handled: ${stats.enforcerAnalytics.metrics.disruptions}`);
        console.log(`Recoveries Executed: ${stats.enforcerAnalytics.metrics.recoveries}`);
        console.log(`Max Variance Reached: ${stats.enforcerAnalytics.metrics.maxVarianceReached}s`);
        console.log(`Players Removed: ${stats.enforcerAnalytics.removedPlayers}`);
    }
}

/**
 * Show game error
 */
function showGameError(message) {
    console.error('Game Error:', message);

    const errorElement = document.getElementById('setupError');
    if (errorElement) {
        errorElement.textContent = message;
    }
}

/**
 * Global keyboard shortcuts
 */
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Don't trigger shortcuts when typing in inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        // Space bar - start/stop game
        if (e.code === 'Space' && gameEngine && gameEngine.state.initialized) {
            e.preventDefault();
            if (gameEngine.state.running) {
                gameEngine.stop();
                gameUI.updateStartStopButton(false);
            } else {
                gameEngine.start();
                gameUI.updateStartStopButton(true);
            }
        }

        // Enter - confirm pending rotation
        if (e.code === 'Enter' && gameEngine && gameEngine.rotations.pending) {
            e.preventDefault();
            gameEngine.confirmRotation();
            gameUI.elements.confirmSubButton.classList.add('hidden');
            gameUI.clearRotationHighlights();
        }

        // Escape - cancel pending rotation
        if (e.code === 'Escape' && gameEngine && gameEngine.rotations.pending) {
            e.preventDefault();
            gameEngine.cancelRotation();
            gameUI.elements.confirmSubButton.classList.add('hidden');
            gameUI.clearRotationHighlights();
        }

        // G key - quick goalkeeper change modal
        if (e.code === 'KeyG' && gameEngine && gameEngine.state.initialized && !gameEngine.state.gameOver) {
            e.preventDefault();
            gameUI.showManageGoalkeeperModal();
        }
    });

    console.log('⌨️ Keyboard shortcuts enabled (Space=Start/Stop, Enter=Confirm, Esc=Cancel, G=Goalkeeper)');
}

/**
 * Debug functions for testing
 */
window.soccerDebug = {
    /**
     * Simulate player injury
     */
    simulateInjury: function (playerName) {
        if (!gameEngine) {
            console.error('Game not running');
            return;
        }

        const player = playerName || gameEngine.players.field[0];
        console.log(`Simulating injury: ${player}`);
        gameEngine.removePlayer(player, 'injury');
    },

    /**
     * Simulate missed rotation
     */
    simulateMissedRotation: function () {
        if (!gameEngine || !gameEngine.rotations.pending) {
            console.error('No pending rotation to miss');
            return;
        }

        console.log('Simulating missed rotation');
        gameEngine.cancelRotation();
    },

    /**
     * Change goalkeeper
     */
    changeGoalkeeper: function (newGoalkeeperName) {
        if (!gameEngine) {
            console.error('Game not running');
            return;
        }

        console.log(`Changing goalkeeper to: ${newGoalkeeperName}`);
        gameEngine.changeGoalkeeper(newGoalkeeperName);
    },

    /**
     * Force tempo change
     */
    forceTempoChange: function (tempo) {
        if (!gameEngine) {
            console.error('Game not running');
            return;
        }

        console.log(`Forcing tempo change to: ${tempo}`);
        gameEngine.changeTempo(tempo);
    },

    /**
     * Show current analytics
     */
    showAnalytics: function () {
        if (!gameEngine || !gameEngine.enforcer) {
            console.error('Game not running');
            return;
        }

        const analytics = gameEngine.enforcer.getAnalytics();
        console.table(analytics);
        console.table(analytics.metrics);
    },

    /**
     * Show rotation plan
     */
    showRotationPlan: function () {
        if (!gameEngine) {
            console.error('Game not running');
            return;
        }

        console.log('Current Rotation Plan:');
        gameEngine.rotations.plan.forEach((r, i) => {
            const status = i < gameEngine.rotations.currentPlanIndex ? '✅' :
                i === gameEngine.rotations.currentPlanIndex ? '▶️' : '⏰';
            console.log(`${status} ${gameEngine.formatTime(r.time)}: OFF [${r.off.join(', ')}] ON [${r.on.join(', ')}]`);
        });
    },

    /**
     * Show goalkeeper info
     */
    showGoalkeeperInfo: function () {
        if (!gameEngine) {
            console.error('Game not running');
            return;
        }

        console.log('Goalkeeper Info:');
        console.log(`  Current GK: ${gameEngine.players.goalkeeper || 'None'}`);
        console.log(`  GK Changes: ${gameEngine.goalkeeperChanges || 0}`);
    }
};

/**
 * Initialize everything when DOM is ready
 */
document.addEventListener('DOMContentLoaded', function () {
    console.log('=================================');
    console.log('⚽ SOCCER BENCH BALANCER ⚽');
    console.log('=================================');
    console.log('Version 2.0 - Production Ready');
    console.log('Target: Maintain variance < 60s');
    console.log('Field players: 4-11 (variable)');
    console.log('Goalkeeper: 0-1 (protected)');
    console.log('=================================');

    // Initialize auth system first
    initAuth();

    // Initialize system
    if (initializeSoccerSystem()) {
        // Set up keyboard shortcuts
        setupKeyboardShortcuts();

        // Make start function globally available
        window.startSoccerGame = startSoccerGame;

        // Make UI globally available for modal callbacks
        window.soccerUI = gameUI;

        console.log('✅ System ready - configure game and press START');

        // Set up Page Visibility API for time-tracking catch-up
        if (typeof document.hidden !== "undefined") {
            document.addEventListener('visibilitychange', function () {
                if (gameEngine) {
                    gameEngine.handleVisibilityChange();
                }
            });
            console.log('✅ Page Visibility API listener attached');
        } else {
            console.warn('⚠️ Page Visibility API not supported by this browser');
        }

        // Fallback for mobile browsers - pagehide/pageshow
        window.addEventListener('pagehide', function () {
            if (gameEngine && gameEngine.state.running) {
                console.log('📴 pagehide event - recording timestamp');
                gameEngine.lastVisibleTimestamp = Date.now();
                gameEngine.wasRunningWhenHidden = true;
            }
        });

        window.addEventListener('pageshow', function (event) {
            if (event.persisted && gameEngine) {
                console.log('📱 pageshow event (from bfcache)');
                if (gameEngine.wasRunningWhenHidden && gameEngine.lastVisibleTimestamp) {
                    setTimeout(() => {
                        if (gameEngine.lastVisibleTimestamp) {
                            console.log("Pageshow fallback is taking action.");
                            gameEngine.handleVisibilityChange();
                        }
                    }, 100);
                }
            }
        });

        console.log('✅ Page visibility handlers configured');

        // Debug mode indicator
        if (window.location.hash === '#debug') {
            console.log('🔍 Debug mode enabled - use soccerDebug.* functions');
        }
    } else {
        console.error('❌ System initialization failed');
    }
});

/**
 * Handle page unload
 */
window.addEventListener('beforeunload', function (e) {
    // Save configuration if game is running
    if (gameEngine && gameEngine.state.initialized && !gameEngine.state.gameOver) {
        if (setupManager) {
            setupManager.saveConfig();
        }

        // Warn about leaving during game
        if (gameEngine.state.running) {
            e.preventDefault();
            e.returnValue = 'Game in progress. Are you sure you want to leave?';
        }
    }
});

/**
 * Show email collection modal for guest users
 */
function showGuestStatsEmailModal(stats) {
    // Don't show if modal already exists
    if (document.getElementById('guestStatsModal')) return;

    // Create modal HTML
    const modalHtml = `
        <div id="guestStatsModal" style="
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.9);
            backdrop-filter: blur(10px);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            animation: fadeIn 0.3s ease;
        ">
            <div style="
                background: linear-gradient(180deg, #0d1626 0%, #08101a 100%);
                border: 2px solid rgba(0, 255, 224, 0.3);
                border-radius: 24px;
                padding: 40px;
                max-width: 500px;
                width: 100%;
                box-shadow: 0 20px 60px rgba(0, 255, 224, 0.3);
                animation: slideUp 0.4s ease;
            ">
                <div style="text-align: center; margin-bottom: 24px;">
                    <div style="font-size: 48px; margin-bottom: 16px;">⚽</div>
                    <h2 style="
                        font-family: 'Russo One', sans-serif;
                        font-size: 28px;
                        color: #00ffe0;
                        margin: 0 0 12px 0;
                        text-shadow: 0 0 20px rgba(0, 255, 224, 0.5);
                    ">Full Time!</h2>
                    <p style="
                        color: #94a3b8;
                        font-size: 16px;
                        line-height: 1.6;
                        margin: 0;
                    ">Want your detailed game stats sent to your email?</p>
                </div>

                <div style="
                    background: rgba(0, 255, 224, 0.05);
                    border: 1px solid rgba(0, 255, 224, 0.2);
                    border-radius: 12px;
                    padding: 16px;
                    margin-bottom: 24px;
                ">
                    <div style="color: #94a3b8; font-size: 14px; margin-bottom: 8px;">You'll receive:</div>
                    <ul style="
                        list-style: none;
                        padding: 0;
                        margin: 0;
                        color: #f5fbff;
                        font-size: 14px;
                    ">
                        <li style="padding: 4px 0;">✓ Final score breakdown</li>
                        <li style="padding: 4px 0;">✓ Individual player statistics</li>
                        <li style="padding: 4px 0;">✓ Field time & bench time analysis</li>
                        <li style="padding: 4px 0;">✓ Rotation variance report</li>
                    </ul>
                </div>

                <form id="guestEmailForm" style="margin-bottom: 20px;">
                    <input type="email" id="guestEmail" required placeholder="Enter your email..." style="
                        width: 100%;
                        background: rgba(4, 7, 13, 0.8);
                        border: 1px solid rgba(0, 255, 224, 0.3);
                        border-radius: 12px;
                        padding: 16px;
                        font-size: 16px;
                        color: #f5fbff;
                        margin-bottom: 16px;
                        outline: none;
                        transition: all 0.2s;
                    " onfocus="this.style.borderColor='#00ffe0'; this.style.boxShadow='0 0 0 3px rgba(0, 255, 224, 0.2)'"
                       onblur="this.style.borderColor='rgba(0, 255, 224, 0.3)'; this.style.boxShadow='none'">

                    <button type="submit" id="sendStatsBtn" style="
                        width: 100%;
                        background: linear-gradient(135deg, #00ffe0 0%, #00cdb8 100%);
                        color: #000;
                        border: none;
                        border-radius: 12px;
                        padding: 16px;
                        font-family: 'Russo One', sans-serif;
                        font-size: 16px;
                        cursor: pointer;
                        transition: all 0.2s;
                        text-transform: uppercase;
                        letter-spacing: 0.05em;
                    " onmouseover="this.style.transform='scale(1.02)'; this.style.boxShadow='0 8px 24px rgba(0, 255, 224, 0.4)'"
                       onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none'">
                        📧 Send Me My Stats
                    </button>
                </form>

                <button onclick="window.closeGuestStatsModal()" style="
                    width: 100%;
                    background: transparent;
                    color: #94a3b8;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    padding: 12px;
                    font-size: 14px;
                    cursor: pointer;
                    transition: all 0.2s;
                " onmouseover="this.style.borderColor='rgba(255, 255, 255, 0.3)'"
                   onmouseout="this.style.borderColor='rgba(255, 255, 255, 0.1)'">
                    No thanks, skip
                </button>

                <p style="
                    text-align: center;
                    color: #64748b;
                    font-size: 12px;
                    margin: 16px 0 0 0;
                    line-height: 1.5;
                ">By providing your email, you'll receive game stats and occasional updates about Bench Balancer Pro features.</p>
            </div>
        </div>

        <style>
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes slideUp {
                from {
                    opacity: 0;
                    transform: translateY(30px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            @keyframes fadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
        </style>
    `;

    // Add to DOM
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Add form submission handler
    document.getElementById('guestEmailForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('guestEmail').value.trim();
        await sendGuestStats(email, stats);
    });
}

/**
 * Send stats to guest email and save to marketing list
 */
async function sendGuestStats(email, stats) {
    const btn = document.getElementById('sendStatsBtn');
    const originalText = btn.innerHTML;

    try {
        // Update button state
        btn.disabled = true;
        btn.innerHTML = '⏳ Sending...';
        btn.style.opacity = '0.7';

        // Format stats for email
        const emailData = formatStatsForEmail(stats, email);

        // Save email to marketing list
        await saveMarketingEmail(email, emailData);

        // Success state
        btn.innerHTML = '✅ Stats Sent!';
        btn.style.background = 'linear-gradient(135deg, #4be9a6 0%, #39d98a 100%)';

        setTimeout(() => {
            window.closeGuestStatsModal();
        }, 1500);

    } catch (error) {
        console.error('Error sending stats:', error);
        btn.innerHTML = '❌ Error - Try Again';
        btn.style.background = 'linear-gradient(135deg, #ff5f6d 0%, #ff4757 100%)';
        btn.disabled = false;

        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.background = 'linear-gradient(135deg, #00ffe0 0%, #00cdb8 100%)';
            btn.style.opacity = '1';
        }, 2000);
    }
}

/**
 * Format stats for email
 */
function formatStatsForEmail(stats, email) {
    // Helper function to format seconds as "1m 27s" format
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        if (secs === 0) {
            return `${mins}m`;
        }
        return `${mins}m ${secs}s`;
    };

    const players = Object.entries(stats.players || {}).map(([name, data]) => ({
        name,
        fieldTime: formatTime(data.minutes || 0),
        benchTime: formatTime(data.benchMinutes || 0),
        fieldTimeSeconds: Math.round(data.minutes || 0),
        benchTimeSeconds: Math.round(data.benchMinutes || 0),
        goals: data.goals || 0,
        position: data.isGoalkeeper ? 'GK' : (data.position || '-')
    }));

    return {
        email,
        sportType: 'soccer',
        gameDate: new Date().toLocaleDateString(),
        gameTime: new Date().toLocaleTimeString(),
        finalScore: `${stats.homeScore || 0} - ${stats.awayScore || 0}`,
        homeScore: stats.homeScore || 0,
        awayScore: stats.awayScore || 0,
        variance: Math.round(stats.variance || 0),
        format: 'halves',
        goalkeeper: stats.goalkeeper || null,
        players,
        totalPlayers: players.length
    };
}

/**
 * Save email to Supabase marketing list
 */
async function saveMarketingEmail(email, gameData) {
    if (!benchBalancerSupabase) {
        console.warn('Supabase not available - email saved locally only');
        // Save to localStorage as backup
        const savedEmails = JSON.parse(localStorage.getItem('benchbalancer_guest_emails') || '[]');
        savedEmails.push({ email, gameData, timestamp: new Date().toISOString() });
        localStorage.setItem('benchbalancer_guest_emails', JSON.stringify(savedEmails));
        return;
    }

    try {
        // Save to database first
        const { error: dbError } = await benchBalancerSupabase
            .from('guest_emails')
            .insert({
                email,
                source: 'soccer_game_stats',
                game_data: gameData,
                subscribed: true,
                created_at: new Date().toISOString()
            });

        if (dbError) throw dbError;
        console.log('✅ Email saved to marketing list:', email);

        // Send actual email via Edge Function
        try {
            const { data: emailResponse, error: emailError } = await benchBalancerSupabase.functions.invoke(
                'send-game-stats-email',
                {
                    body: {
                        email,
                        gameData
                    }
                }
            );

            if (emailError) {
                console.error('Email send error:', emailError);
            } else {
                console.log('✅ Stats email sent successfully to:', email);
            }
        } catch (emailErr) {
            console.error('Failed to send email:', emailErr);
            // Don't throw - email is still saved to database
        }

    } catch (error) {
        console.error('Error saving email to Supabase:', error);
        // Save to localStorage as backup
        const savedEmails = JSON.parse(localStorage.getItem('benchbalancer_guest_emails') || '[]');
        savedEmails.push({ email, gameData, timestamp: new Date().toISOString() });
        localStorage.setItem('benchbalancer_guest_emails', JSON.stringify(savedEmails));
        console.log('📋 Email saved to localStorage as backup');
    }
}

/**
 * Close guest stats modal
 */
window.closeGuestStatsModal = function () {
    const modal = document.getElementById('guestStatsModal');
    if (modal) {
        modal.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => modal.remove(), 300);
    }
};

console.log('⚽ Soccer Integration loaded - Main orchestrator ready');
