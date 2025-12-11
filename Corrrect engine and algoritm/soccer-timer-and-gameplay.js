var warningPlayedForCurrentSub = false;

function applyMissedTime(secondsMissed) {
    if (secondsMissed <= 0) return;

    debugLog(`Applying ${formatTime(secondsMissed)} of missed time.`);

    const totalGameDuration = periodLengthSeconds * gameSettings.numPeriods;
    const gameWasOver = totalGameDuration > 0 && currentGameSeconds >= totalGameDuration;

    if (gameWasOver) {
        debugLog("Game was already over before applying missed time. No changes made.");
        return;
    }

    onField.forEach(p => { playerPlayTimes[p] = (playerPlayTimes[p] || 0) + secondsMissed; });
    onBench.forEach(p => { playerBenchTimes[p] = (playerBenchTimes[p] || 0) + secondsMissed; });

    currentGameSeconds += secondsMissed;
    periodElapsedSeconds += secondsMissed;

    debugLog(`After applying missed time: currentGameSeconds = ${formatTime(currentGameSeconds)}, periodElapsedSeconds = ${formatTime(periodElapsedSeconds)}`);

    while (periodLengthSeconds > 0 && periodElapsedSeconds >= periodLengthSeconds && currentPeriod <= gameSettings.numPeriods) {
        const timeOverPeriod = periodElapsedSeconds - periodLengthSeconds;
        currentGameSeconds = currentPeriod * periodLengthSeconds + timeOverPeriod;

        debugLog(`Missed time caused period ${currentPeriod} to end. Time over: ${formatTime(timeOverPeriod)}`);

        if (isRunning) {
            clearInterval(timerIntervalId);
            timerIntervalId = null;
        }

        const isFinalPeriodNow = currentPeriod >= gameSettings.numPeriods;
        const isFirstHalfEndingNow = !isFinalPeriodNow && gameSettings.numPeriods === 2 && currentPeriod === 1;

        if (isFirstHalfEndingNow) {
            debugLog("Missed time crossed halftime. Setting up halftime.");
            if (endOfPeriodActionsContainer) endOfPeriodActionsContainer.classList.add('hidden');
            isHalftimeScreenActive = true;
            if (halftimeScreenDiv) halftimeScreenDiv.classList.remove('hidden');
            if (nextSubBox) nextSubBox.classList.add('hidden');
            if (playerLists) playerLists.classList.add('hidden');
            if (gameControls) gameControls.classList.add('hidden');
            showStatusMessage("HALFTIME (Resumed after pause)", 0);
            currentPeriod++;
            periodElapsedSeconds = timeOverPeriod;
            recalculateRemainingAutoSubTimes();
            updateDisplay();
            return;
        } else if (isFinalPeriodNow) {
            debugLog("Missed time caused game to end.");
            currentGameSeconds = totalGameDuration;
            periodElapsedSeconds = periodLengthSeconds;
            endGame();
            return;
        } else {
            debugLog(`Missed time advanced to end of period ${currentPeriod}. Moving to period ${currentPeriod + 1}.`);
            currentPeriod++;
            periodElapsedSeconds = timeOverPeriod;
        }
    }
    recalculateRemainingAutoSubTimes();
}


function handleVisibilityChange() {
    const totalGameDuration = periodLengthSeconds * gameSettings.numPeriods;
    const isGameOver = totalGameDuration > 0 && currentGameSeconds >= totalGameDuration;
    const isSetupScreenVisible = setupDiv && !setupDiv.classList.contains('hidden');

    if (document.hidden) {
        if (isRunning) {
            debugLog("Page hidden, timer was running. Storing timestamp and stopping interval.");
            lastVisibleTimestamp = Date.now();
            wasRunningWhenHidden = true;
            clearInterval(timerIntervalId);
            timerIntervalId = null;
        } else {
            debugLog("Page hidden, timer was not running.");
            wasRunningWhenHidden = false;
        }
    } else {
        debugLog("Page became visible.");
        if (wasRunningWhenHidden && lastVisibleTimestamp && !isGameOver && !isSetupScreenVisible && !isHalftimeScreenActive) {
            const elapsedWhileHidden = Math.round((Date.now() - lastVisibleTimestamp) / 1000);

            // Defensive check: If elapsed time is unreasonably large (>1 hour), something went wrong
            if (elapsedWhileHidden > 3600) {
                debugLog(`WARNING: Elapsed time (${formatTime(elapsedWhileHidden)}) seems excessive. Timestamp may be stale. Skipping catch-up.`);
                lastVisibleTimestamp = null;
                wasRunningWhenHidden = false;
                updateDisplay();
                return;
            }

            debugLog(`Page visible. Was running. Elapsed while hidden: ${formatTime(elapsedWhileHidden)}.`);
            if (elapsedWhileHidden > 0) {
                applyMissedTime(elapsedWhileHidden);
            }
            lastVisibleTimestamp = null;
            const newIsGameOver = totalGameDuration > 0 && currentGameSeconds >= totalGameDuration;
            if (!newIsGameOver && !isHalftimeScreenActive) {
                startTimer(true);
            } else {
                isRunning = false;
                wasRunningWhenHidden = false;
                updateDisplay();
            }
        } else {
            if (isGameOver) debugLog("Page visible, but game is over.");
            if (isSetupScreenVisible) debugLog("Page visible, but on setup screen.");
            if (isHalftimeScreenActive) debugLog("Page visible, but halftime screen active.");
            if (!wasRunningWhenHidden) debugLog("Page visible, but timer was not set to run when hidden.");
            lastVisibleTimestamp = null;
            wasRunningWhenHidden = false;
            updateDisplay();
        }
    }
}


function gameLoop() {
    if (!isRunning) return;

    onField.forEach(p => { playerPlayTimes[p] = (playerPlayTimes[p] || 0) + 1; });
    onBench.forEach(p => { playerBenchTimes[p] = (playerBenchTimes[p] || 0) + 1; });
    currentGameSeconds++;
    periodElapsedSeconds++;

    if (isWarningSoundEnabled && !subIsPending && !isModalOpen && nextSubTimeInPeriod !== Infinity &&
        (nextSubTimeInPeriod - currentGameSeconds) <= 10 && (nextSubTimeInPeriod - currentGameSeconds) > 0) {

        if (!warningPlayedForCurrentSub) {
            debugLog("Attempting to play 10-second warning beep.");
            if (!warningBeepSound) {
                try { warningBeepSound = new Audio('beep-warning.wav'); }
                catch (e) { console.error("Could not create warning sound", e); }
            }
            if (warningBeepSound) {
                try {
                    warningBeepSound.volume = 1.0;
                    warningBeepSound.currentTime = 0;
                    warningBeepSound.play().catch(e => console.warn("Beep warning sound playback error:", e));
                } catch (e) { console.error("Sound play critical error:", e); }
                warningPlayedForCurrentSub = true;
            }
        }
    } else if (nextSubTimeInPeriod !== Infinity && (nextSubTimeInPeriod - currentGameSeconds) > 12) {
        // Reset if we are far away (e.g. schedule changed)
        warningPlayedForCurrentSub = false;
    }

    if (!subIsPending && !isModalOpen && nextSubTimeInPeriod !== Infinity && currentGameSeconds >= nextSubTimeInPeriod) {
        if (gameSettings.subsPerChange === 0) {
            debugLog(`Subs disabled, but reached a theoretical sub time: ${formatTime(nextSubTimeInPeriod)}. Recalculating next.`);
            recalculateRemainingAutoSubTimes();
        } else {
            debugLog(`Reached planned sub time: ${formatTime(nextSubTimeInPeriod)} (current game time: ${formatTime(currentGameSeconds)})`);
            const { playersOff, playersOn } = getPlayersForSubstitutionAtTime(nextSubTimeInPeriod);

            if (playersOff.length > 0 && playersOn.length > 0 && playersOff.length === playersOn.length) {
                subIsPending = true;
                pendingOutPlayers = playersOff;
                pendingInPlayers = playersOn;
                pendingSubTriggerTime = currentGameSeconds;
                debugLog(`Sub pending: ${pendingOutPlayers.join(',')} OFF, ${pendingInPlayers.join(',')} ON. Triggered at: ${formatTime(pendingSubTriggerTime)}`);
                showStatusMessage("AUTO Sub Pending - Press CONFIRM!", 0);
                if (playersComingOffDiv) playersComingOffDiv.textContent = pendingOutPlayers.join(', ');
                if (playersComingOnDiv) playersComingOnDiv.textContent = pendingInPlayers.join(', ');
            } else {
                const originalSubDetailForLog = optimizedSubPlan.find(s => s.time === nextSubTimeInPeriod);
                if (playersOff.length === 0 && playersOn.length === 0 &&
                    originalSubDetailForLog &&
                    (!originalSubDetailForLog.off || originalSubDetailForLog.off.length === 0) &&
                    (!originalSubDetailForLog.on || originalSubDetailForLog.on.length === 0)) {
                    debugLog(`Planned substitution at ${formatTime(nextSubTimeInPeriod)} was an empty sub. No action needed.`);
                } else {
                    debugLog(`Planned substitution at ${formatTime(nextSubTimeInPeriod)}, but no valid players. PlayersOff: ${playersOff.length}, PlayersOn: ${playersOn.length}.`);
                }
                pendingSubTriggerTime = null;
            }
            const prevNextSubTime = nextSubTimeInPeriod;
            targetSubTimes = targetSubTimes.filter(t => t > prevNextSubTime);
            nextSubTimeInPeriod = targetSubTimes.length > 0 ? targetSubTimes[0] : Infinity;
            if (nextSubTimeInPeriod !== Infinity) debugLog(`Next planned sub time: ${formatTime(nextSubTimeInPeriod)} (absolute)`);
            else debugLog("No more subs in current target list.");
        }
    }

    if (periodLengthSeconds > 0 && periodElapsedSeconds >= periodLengthSeconds) {
        const wasRunningBeforePeriodEnd = isRunning;
        stopTimer();
        currentGameSeconds = currentPeriod * periodLengthSeconds;
        periodElapsedSeconds = periodLengthSeconds;

        const isFinalPeriod = currentPeriod >= gameSettings.numPeriods;
        const isFirstHalfEnding = !isFinalPeriod && gameSettings.numPeriods === 2 && currentPeriod === 1;

        if (isFirstHalfEnding) {
            debugLog("End of 1st Half. Proceed to Halftime sequence.");
            if (endOfPeriodActionsContainer) endOfPeriodActionsContainer.classList.remove('hidden');
            if (proceedToHalftimeButton) proceedToHalftimeButton.classList.remove('hidden');
            if (nextSubBox) nextSubBox.classList.add('hidden');
            if (playerLists) playerLists.classList.add('hidden');
            if (gameControls) gameControls.classList.add('hidden');
            showStatusMessage("1st Half Over. Click 'Proceed to Halftime'.", 0);
        } else if (isFinalPeriod) {
            endGame();
        } else {
            handlePeriodEnd();
        }
        updateDisplay();
        return;
    }
    updateDisplay();
}

function startTimer(isResume = false) {
    if (isRunning && !isResume) {
        debugLog("startTimer called but already running and not a resume.");
        return;
    }
    if (timerIntervalId && isResume) {
        debugLog("startTimer (resume): Clearing existing timerIntervalId before restart.");
        clearInterval(timerIntervalId);
        timerIntervalId = null;
    }

    const isSetupScreenVisible = setupDiv && !setupDiv.classList.contains('hidden');
    const totalGameDuration = periodLengthSeconds * gameSettings.numPeriods;
    const isGameOver = totalGameDuration > 0 && currentGameSeconds >= totalGameDuration;

    if (isHalftimeScreenActive) {
        showStatusMessage("Click 'Prepare for 2nd Half' on the halftime screen first.", 3000); return;
    }
    if (endOfPeriodActionsContainer && !endOfPeriodActionsContainer.classList.contains('hidden')) {
        if (!isHalftimeScreenActive) {
            console.warn("startTimer: Auto-hiding stray endOfPeriodActionsContainer.");
            endOfPeriodActionsContainer.classList.add('hidden');
        } else {
            showStatusMessage("Click 'Proceed to Halftime' first.", 3000); return;
        }
    }
    if (!isResume && (!startStopButton || isModalOpen || allPlayers.length === 0 || isSetupScreenVisible || isGameOver)) {
        debugLog("Start timer conditions not met (non-resume):", { isRunning, isModalOpen, allPlayersLength: allPlayers.length, isSetupScreenVisible, isGameOver });
        if (isGameOver) showStatusMessage("Game is already over.", 3000);
        else if (isModalOpen) showStatusMessage("Close modal before starting timer.", 3000);
        else if (isSetupScreenVisible) showStatusMessage("Complete setup first.", 3000);
        else if (allPlayers.length === 0) showStatusMessage("No players setup.", 3000);
        return;
    }
    if (isGameOver && !isResume) {
        showStatusMessage("Game is already over.", 3000);
        return;
    }

    // Play starting whistle immediately if it's a fresh start and sound is enabled
    if (isWarningSoundEnabled && currentGameSeconds === 0 && currentPeriod === 1 && !startingWhistleSoundPlayed && !isResume) {
        if (startingWhistleSound) { // Assumes startingWhistleSound is preloaded
            startingWhistleSound.currentTime = 0; // Ensure it plays from the beginning
            startingWhistleSound.play().then(() => {
                startingWhistleSoundPlayed = true;
                debugLog("Starting whistle played immediately.");
            }).catch(e => {
                console.warn("Starting whistle playback error (immediate attempt):", e);
                // Fallback or just log, as it might play slightly later if browser needs more time
            });
        } else {
            debugLog("Starting whistle sound object not available for immediate play.");
            // Attempt to create and play, though this might have latency
            try {
                let tempWhistle = new Audio('startingwhistle.wav');
                tempWhistle.play().then(() => startingWhistleSoundPlayed = true).catch(e => console.warn("Temp whistle play error:", e));
                startingWhistleSound = tempWhistle; // Assign if created successfully
            } catch (e) { console.error("Failed to create temp whistle:", e); }
        }
    }

    if (halftimeScreenDiv && !halftimeScreenDiv.classList.contains('hidden')) halftimeScreenDiv.classList.add('hidden');
    if (nextSubBox) nextSubBox.classList.remove('hidden');
    if (playerLists) playerLists.classList.remove('hidden');
    if (gameControls) gameControls.classList.remove('hidden');

    if (halftimeMusicSound && !halftimeMusicSound.paused) halftimeMusicSound.pause();

    isRunning = true;

    if (!timerIntervalId) {
        timerIntervalId = setInterval(gameLoop, 1000);
        debugLog(`Timer ${isResume ? 'resumed' : 'started'} for period ${currentPeriod} at game time ${formatTime(currentGameSeconds)}`);
    } else {
        debugLog(`Timer startTimer called (isResume=${isResume}), but timerIntervalId already exists. isRunning set to true.`);
    }

    // The check for warningBeepSound preloading is now mainly in handleSetupConfirmation/resetGame
    // If isWarningSoundEnabled is true, warningBeepSound should be an Audio object or null.
    // No need to create it here again unless it failed to preload.
    if (isWarningSoundEnabled && !warningBeepSound) {
        debugLog("Warning beep sound was not preloaded, attempting to create now.");
        try { warningBeepSound = new Audio('beep-warning.wav'); }
        catch (e) { console.error("Audio for warning sound failed in startTimer:", e); warningBeepSound = null; }
    }

    updateDisplay();
}

function stopTimer() {
    // ... (content of this function remains the same as your last correct version)
    if (timerIntervalId) {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
    }
    isRunning = false;
    wasRunningWhenHidden = false;
    lastVisibleTimestamp = null;
    debugLog("Timer stopped at game time " + formatTime(currentGameSeconds));
    updateDisplay();
}

function handlePeriodEnd() {
    // ... (content of this function remains the same as your last correct version)
    debugLog(`Handling end of period ${currentPeriod}. Game time: ${formatTime(currentGameSeconds)}`);

    if (subIsPending) {
        debugLog(`Period ${currentPeriod} ended with sub pending. Cancelling sub.`);
        subIsPending = false; pendingOutPlayers = []; pendingInPlayers = []; pendingSubTriggerTime = null;
    }
    if (isModalOpen) {
        if (emergencySubModal && !emergencySubModal.classList.contains('hidden')) closeModal(emergencySubModal);
        if (manageGKModal && !manageGKModal.classList.contains('hidden')) closeModal(manageGKModal);
    }

    currentPeriod++;
    periodElapsedSeconds = 0;
    recalculateRemainingAutoSubTimes();

    let message = `End of Period ${currentPeriod - 1}. Ready for Period ${currentPeriod}. Press START.`;
    showStatusMessage(message, 0);
}

function endGame() {
    // ... (content of this function remains the same as your last correct version)
    debugLog("--- endGame() called ---");
    if (isRunning || timerIntervalId) stopTimer();
    isRunning = false;
    wasRunningWhenHidden = false;
    lastVisibleTimestamp = null;
    isHalftimeScreenActive = false;

    const totalGameDuration = gameSettings.numPeriods * periodLengthSeconds;
    if (currentGameSeconds > totalGameDuration && totalGameDuration > 0) {
        debugLog(`Correcting final game time from ${formatTime(currentGameSeconds)} to ${formatTime(totalGameDuration)}`);
        currentGameSeconds = totalGameDuration;
    }
    if (periodElapsedSeconds < periodLengthSeconds && currentPeriod === gameSettings.numPeriods && periodLengthSeconds > 0) {
        periodElapsedSeconds = periodLengthSeconds;
    }

    if (warningBeepSound) { warningBeepSound.pause(); warningBeepSound.currentTime = 0; }
    if (startingWhistleSound) { startingWhistleSound.pause(); startingWhistleSound.currentTime = 0; }
    if (halftimeMusicSound && !halftimeMusicSound.paused) { halftimeMusicSound.pause(); halftimeMusicSound.currentTime = 0; }

    showStatusMessage(`Game Over! Final Time: ${formatTime(currentGameSeconds)}. Periods: ${gameSettings.numPeriods}.`, 0);
    debugLog("--- FINAL PLAYTIMES ---");
    allPlayers.sort((a, b) => a.localeCompare(b)).forEach(p => debugLog(`${p}: ${formatTime(playerPlayTimes[p] || 0)}`));
    debugLog("-----------------------");

    if (startStopButton) { startStopButton.disabled = true; startStopButton.textContent = 'Game Over'; startStopButton.className = 'timer-box-button game-over'; }
    if (confirmSubButton) { confirmSubButton.classList.add('hidden'); confirmSubButton.disabled = true; }
    if (emergencySubButton) emergencySubButton.disabled = true;
    if (manageGKButton) manageGKButton.disabled = true;
    if (warningSoundToggleInput) warningSoundToggleInput.disabled = true;

    if (halftimeScreenDiv) halftimeScreenDiv.classList.add('hidden');
    if (endOfPeriodActionsContainer) endOfPeriodActionsContainer.classList.add('hidden');
    if (proceedToHalftimeButton) proceedToHalftimeButton.classList.add('hidden');

    if (nextSubBox) nextSubBox.classList.remove('hidden');
    if (playerLists) playerLists.classList.remove('hidden');
    if (gameControls) gameControls.classList.remove('hidden');

    updateDisplay();
}
// --- END OF FILE timer-and-gameplay.js ---