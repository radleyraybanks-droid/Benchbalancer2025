// --- START OF FILE event-listeners.js ---

// Create safe fallback functions if they don't exist
if (typeof debugLog === 'undefined') {
    window.debugLog = function(...args) {
        console.log('debugLog:', ...args);
    };
}

if (typeof formatTime === 'undefined') {
    window.formatTime = function(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };
}

if (typeof showStatusMessage === 'undefined') {
    window.showStatusMessage = function(message, duration = 3000) {
        console.log('Status:', message);
    };
}

if (typeof updateDisplay === 'undefined') {
    window.updateDisplay = function() {
        console.log('updateDisplay called');
    };
}

console.log("event-listeners.js: Script loaded and function initializeEventListeners defined.");

function initializeEventListeners() {
    console.log("event-listeners.js: initializeEventListeners() called.");
    try {
        if (typeof DEBUG_MODE !== 'undefined' && DEBUG_MODE) {
            debugLog("Bench Balancer code loaded and initializing (v.CatchUp)"); // Updated version
            console.log("BENCH BALANCER CODE INITIALIZED (v.CatchUp)"); // Updated version
        } else if (typeof DEBUG_MODE === 'undefined') {
            console.warn("event-listeners.js: DEBUG_MODE is undefined...");
        }
    } catch (e) { console.error("Error checking DEBUG_MODE:", e); }

    // Page Visibility API Listener
    if (typeof document.hidden !== "undefined") { // Check for browser support
        document.addEventListener('visibilitychange', handleVisibilityChange);
        debugLog("event-listeners.js: Visibility change listener attached.");
    } else {
        debugLog("event-listeners.js: Page Visibility API not supported by this browser.");
        // Consider fallback or inform user if this is critical and unsupported.
    }
    // For some mobile browsers, pagehide/show might be more reliable for full app switches
    window.addEventListener('pagehide', () => {
        if (isRunning) {
            debugLog("Window 'pagehide' event triggered, timer was running.");
            lastVisibleTimestamp = Date.now(); // Ensure timestamp is set
            wasRunningWhenHidden = true;
             // Don't call stopTimer() here as it might interfere with browser's own suspension.
             // The main goal is to record state. Interval will be cleared on 'pageshow' or 'visibilitychange'.
        }
    });
    window.addEventListener('pageshow', (event) => {
        // event.persisted is true if page is from bfcache (back/forward cache)
        if (event.persisted) {
            debugLog("Window 'pageshow' event (from bfcache). Re-evaluating timer state.");
            // This is similar to document.hidden === false logic
            // Call handleVisibilityChange to consolidate logic, or replicate parts of it.
            // For simplicity, directly invoke a check, but ensure it doesn't conflict if visibilitychange also fires.
            if (wasRunningWhenHidden && lastVisibleTimestamp) {
                 const elapsedWhileHidden = Math.round((Date.now() - lastVisibleTimestamp) / 1000);

                 // Defensive check: Prevent stale timestamp issues
                 if (elapsedWhileHidden > 3600) {
                     debugLog(`WARNING: Elapsed time (${formatTime(elapsedWhileHidden)}) on pageshow seems excessive. Skipping.`);
                     lastVisibleTimestamp = null;
                     wasRunningWhenHidden = false;
                     updateDisplay();
                     return;
                 }

                 debugLog(`Page 'pageshow' (persisted). Was running. Elapsed: ${formatTime(elapsedWhileHidden)}.`);
                 if (elapsedWhileHidden > 0) {
                    applyMissedTime(elapsedWhileHidden);
                 }
                 lastVisibleTimestamp = null;
                 const totalGameDuration = periodLengthSeconds * gameSettings.numPeriods;
                 const isGameOver = totalGameDuration > 0 && currentGameSeconds >= totalGameDuration;
                 if (!isGameOver && !isHalftimeScreenActive) {
                    startTimer(true);
                 } else {
                    isRunning = false; wasRunningWhenHidden = false; updateDisplay();
                 }
            }
        }
    });


    if (confirmSetupButton) {
        confirmSetupButton.addEventListener('click', handleSetupConfirmation);
    } else { console.error("event-listeners.js: confirmSetupButton NOT FOUND."); }

    if (getPlanButton) {
        getPlanButton.addEventListener('click', handleGetPreliminaryPlan);
    } else { console.error("event-listeners.js: getPlanButton NOT FOUND."); }

    // Use DOM object for element access (v4 compatibility)
    const warningSoundToggleInput = window.DOM?.warningSoundToggleInput || window.warningSoundToggleInput;
    
    if (warningSoundToggleInput) {
        warningSoundToggleInput.addEventListener('change', (e) => {
            isWarningSoundEnabled = e.target.checked;
            debugLog("Warning sound enabled: " + isWarningSoundEnabled);
            if (!isWarningSoundEnabled && warningBeepSound) {
                warningBeepSound.pause();
                warningBeepSound.currentTime = 0;
            }
        });
    }

    if (startStopButton) startStopButton.addEventListener('click', () => { isRunning ? stopTimer() : startTimer(); });
    if (confirmSubButton) confirmSubButton.addEventListener('click', confirmSubstitution);
    if (emergencySubButton) emergencySubButton.addEventListener('click', showEmergencySubModal);
    if (manageGKButton) manageGKButton.addEventListener('click', showManageGKModal);

    const mainGameResetButton = document.querySelector('#game-controls #resetButton');
    if (mainGameResetButton) mainGameResetButton.addEventListener('click', resetGame);
    else console.warn("event-listeners.js: Main game reset button not found.");

    if (confirmEmergencySubButton) confirmEmergencySubButton.addEventListener('click', handleConfirmEmergencySub);
    if (cancelEmergencySubButton) cancelEmergencySubButton.addEventListener('click', handleCancelEmergencySub);
    if (confirmManageGKButton) confirmManageGKButton.addEventListener('click', handleConfirmManageGK);
    if (cancelManageGKButton) cancelManageGKButton.addEventListener('click', handleCancelManageGK);

    if (proceedToHalftimeButton) proceedToHalftimeButton.addEventListener('click', () => {
        debugLog("User clicked 'Proceed to Halftime'.");
        if (endOfPeriodActionsContainer) endOfPeriodActionsContainer.classList.add('hidden');
        isHalftimeScreenActive = true;
        if (halftimeScreenDiv) halftimeScreenDiv.classList.remove('hidden');
        if (!halftimeMusicSound) {
            try {
                halftimeMusicSound = new Audio('song.mp3');
                halftimeMusicSound.loop = true;
                halftimeMusicSound.addEventListener('error', (e) => { console.error("Halftime music error:", halftimeMusicSound.error, e); showStatusMessage("Error loading halftime music.", 3000); updateDisplay(); });
            } catch (e) { console.error("Audio object creation for halftime music failed:", e); showStatusMessage("Halftime music system error.", 3000); }
        }
        if (halftimeMusicSound) {
            halftimeMusicSound.currentTime = 0;
            const playPromise = halftimeMusicSound.play();
            if (playPromise !== undefined) {
                playPromise.then(() => { debugLog("Halftime music started."); }).catch(error => { console.warn("Halftime music play prevented:", error); showStatusMessage("HALFTIME! Tap 'Play Music'.", 0); }).finally(() => { updateDisplay(); });
            } else { updateDisplay(); }
        } else { updateDisplay(); }
        currentPeriod++;
        recalculateRemainingAutoSubTimes();
        updateDisplay();
    });

    if (stopHalftimeMusicButton) stopHalftimeMusicButton.addEventListener('click', () => {
        if (halftimeMusicSound && !halftimeMusicSound.paused) { halftimeMusicSound.pause(); debugLog("Halftime music paused."); updateDisplay(); }
    });
    if (resumeHalftimeMusicButton) resumeHalftimeMusicButton.addEventListener('click', () => {
        if (halftimeMusicSound && halftimeMusicSound.paused) {
            const playPromise = halftimeMusicSound.play();
            if (playPromise !== undefined) {
                playPromise.then(() => { debugLog("Halftime music resumed."); }).catch(e => { console.warn("Error resuming halftime music:", e); showStatusMessage("Could not resume music.", 2000); }).finally(() => { updateDisplay(); });
            } else { updateDisplay(); }
        }
    });
    if (prepareSecondHalfButton) prepareSecondHalfButton.addEventListener('click', () => {
        if (isHalftimeScreenActive) {
            if (halftimeMusicSound && !halftimeMusicSound.paused) { halftimeMusicSound.pause(); halftimeMusicSound.currentTime = 0; }
            isHalftimeScreenActive = false;
            if (halftimeScreenDiv) halftimeScreenDiv.classList.add('hidden');
            if (endOfPeriodActionsContainer) endOfPeriodActionsContainer.classList.add('hidden');
            if (nextSubBox) nextSubBox.classList.remove('hidden');
            if (playerLists) playerLists.classList.remove('hidden');
            if (gameControls) gameControls.classList.remove('hidden');
            periodElapsedSeconds = 0;
            debugLog(`Prepared for Period ${currentPeriod}.`);
            updateDisplay();
        }
    });

    // Add after other event listeners:
    const balanceTracker = document.getElementById('balanceTracker');
    if (balanceTracker) {
        balanceTracker.addEventListener('balanceOverride', (event) => {
            const { accepted, recommended, original, reason } = event.detail;
            if (accepted) {
                gameSettings.subsPerChange = recommended;
                showStatusMessage(`Override accepted: Using ${recommended} subs instead of ${original}`, 4000);
            } else {
                showStatusMessage(`Override rejected: Keeping ${original} subs`, 3000);
            }
        });
    }

    // Use DOM object for element access (v4 compatibility)
    const numOnFieldInput = window.DOM?.numOnFieldInput || window.numOnFieldInput;
    const numGoalkeepersInput = window.DOM?.numGoalkeepersInput || window.numGoalkeepersInput;
    const numReservesInput = window.DOM?.numReservesInput || window.numReservesInput;
    const subsPerChangeSelect = window.DOM?.subsPerChangeSelect || window.subsPerChangeSelect;
    const minsPerPeriodInput = window.DOM?.minsPerPeriodInput || window.minsPerPeriodInput;
    const preliminaryPlanOutput = window.DOM?.preliminaryPlanOutput || window.preliminaryPlanOutput;
    
    const setupConfigInputs = [numOnFieldInput, numGoalkeepersInput, numReservesInput, subsPerChangeSelect, minsPerPeriodInput];
    setupConfigInputs.forEach(input => {
        if (input) {
            input.addEventListener('change', () => {
                console.log(`event-listeners.js: Config input changed.`);
                if (typeof populatePlayerNamePlaceholders === "function") populatePlayerNamePlaceholders();
                else console.error("event-listeners.js: populatePlayerNamePlaceholders not found.");
                if (preliminaryPlanOutput) preliminaryPlanOutput.innerHTML = '<p><em>Config changed. Click "Show Plan".</em></p>';
            });
        }
    });
    
    if (typeof resetGame === "function") {
        console.log("event-listeners.js: Calling resetGame() for initial setup.");
        // Safe access to warningSoundToggleInput
        if (warningSoundToggleInput && typeof warningSoundToggleInput.checked !== 'undefined') {
            isWarningSoundEnabled = warningSoundToggleInput.checked;
        } else {
            isWarningSoundEnabled = true;
        }
        resetGame();
    } else {
        console.error("event-listeners.js: resetGame function not found.");
        if(document.getElementById('setupError')) document.getElementById('setupError').textContent = "Error: App components failed (E3).";
    }
    console.log("event-listeners.js: Event listeners initialization complete.");
}

// Auto-init once DOM elements are ready (compat with module order)
document.addEventListener('dom-elements-initialized', () => {
    try { initializeEventListeners(); } catch (e) { console.error('Failed to init event listeners:', e); }
});

// --- END OF FILE event-listeners.js ---