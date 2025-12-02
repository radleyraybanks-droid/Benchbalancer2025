// --- ui-updates.js (Converted to Regular JavaScript) ---

// All dependencies should now be global variables/functions
// Utility functions, constants, game state variables, substitution logic, and DOM elements
// are assumed to be available globally

// Utility function for cleaner code
function isFinalPeriod() {
    return currentPeriod >= gameSettings.numPeriods;
}

function updatePlayerList(listElement, countElement, players) {
    if (!listElement || !countElement) return;
    listElement.innerHTML = '';
    players.forEach(player => {
        const li = document.createElement('li');
        const nameSpan = document.createElement('span');
        nameSpan.classList.add('player-name');
        let nameText = player;
        if (playerGKStatus[player] && (onField.includes(player) || onBench.includes(player) || (starters && starters.includes(player)))) {
            nameSpan.classList.add('is-gk'); nameText += ' (GK)';
        }
        if (playerRemovedStatus[player]) {
            nameSpan.classList.add('is-removed'); nameText += ' (Removed)';
        }
        nameSpan.textContent = nameText; li.appendChild(nameSpan);

        const timesSpan = document.createElement('span'); timesSpan.classList.add('player-times');
        const playTime = playerPlayTimes[player] || 0;
        const benchTime = playerBenchTimes[player] || 0;

        let stintInfo = '';
        if (onField.includes(player) && playerCurrentStintStart.hasOwnProperty(player) && playerCurrentStintStart[player] !== null) {
            const stintDuration = currentGameSeconds - playerCurrentStintStart[player];
            if (stintDuration >= 0) { stintInfo = `, Stint: ${formatTime(stintDuration)}`; }
        }
        timesSpan.textContent = `(P: ${formatTime(playTime)} / B: ${formatTime(benchTime)}${stintInfo})`;
        li.appendChild(timesSpan); listElement.appendChild(li);
    });
    countElement.textContent = players.length;
}

function updateDisplay() {
    const totalGameDuration = periodLengthSeconds * gameSettings.numPeriods;
    const isGameOver = totalGameDuration > 0 && currentGameSeconds >= totalGameDuration;
    const isSetupScreenVisible = DOM.setupDiv && !DOM.setupDiv.classList.contains('hidden');
    const isProceedToHalftimeVisible = DOM.endOfPeriodActionsContainer && !DOM.endOfPeriodActionsContainer.classList.contains('hidden');

    // Timer and Period Display
    if (isHalftimeScreenActive) {
        if (DOM.gameTimerP) DOM.gameTimerP.textContent = "HALFTIME";
        if (DOM.periodTimerP) DOM.periodTimerP.textContent = `(Total: ${formatTime(currentGameSeconds)})`;
        if (DOM.periodDisplayP) DOM.periodDisplayP.textContent = `${Math.min(currentPeriod -1, gameSettings.numPeriods)}/${gameSettings.numPeriods}`;
    } else {
        if (DOM.gameTimerP) DOM.gameTimerP.textContent = formatTime(Math.max(0, periodLengthSeconds - periodElapsedSeconds));
        if (DOM.periodTimerP) DOM.periodTimerP.textContent = `(Total: ${formatTime(currentGameSeconds)})`;
        if (DOM.periodDisplayP) DOM.periodDisplayP.textContent = `${currentPeriod}/${gameSettings.numPeriods}`;
    }

    // Show/Hide Main Content Sections based on game state
    if (isHalftimeScreenActive) {
        if (DOM.nextSubBox) DOM.nextSubBox.classList.add('hidden');
        if (DOM.playerLists) DOM.playerLists.classList.add('hidden');
        if (DOM.gameControls) DOM.gameControls.classList.add('hidden');
        if (DOM.halftimeScreenDiv) DOM.halftimeScreenDiv.classList.remove('hidden');
        if (DOM.endOfPeriodActionsContainer) DOM.endOfPeriodActionsContainer.classList.add('hidden');
        if (DOM.statusMessageP) DOM.statusMessageP.classList.remove('hidden'); // Keep visible for halftime message
    } else if (isProceedToHalftimeVisible) {
        if (DOM.nextSubBox) DOM.nextSubBox.classList.add('hidden');
        if (DOM.playerLists) DOM.playerLists.classList.add('hidden');
        if (DOM.gameControls) DOM.gameControls.classList.add('hidden');
        if (DOM.halftimeScreenDiv) DOM.halftimeScreenDiv.classList.add('hidden');
        if (DOM.statusMessageP) DOM.statusMessageP.classList.remove('hidden');
    } else if (!isSetupScreenVisible && DOM.gameContainerDiv && !DOM.gameContainerDiv.classList.contains('hidden')) {
        if (DOM.halftimeScreenDiv) DOM.halftimeScreenDiv.classList.add('hidden');
        if (DOM.endOfPeriodActionsContainer) DOM.endOfPeriodActionsContainer.classList.add('hidden');
        if (DOM.nextSubBox) isGameOver ? DOM.nextSubBox.classList.add('hidden') : DOM.nextSubBox.classList.remove('hidden');
        if (DOM.playerLists) DOM.playerLists.classList.remove('hidden');
        if (DOM.gameControls) DOM.gameControls.classList.remove('hidden');
        if (DOM.statusMessageP) DOM.statusMessageP.classList.remove('hidden');
    } else { // Setup screen is visible
        if (DOM.statusMessageP) DOM.statusMessageP.classList.remove('hidden');
    }


    // Halftime Music Buttons
    if (isHalftimeScreenActive) {
        if (halftimeMusicSound) {
            if(DOM.stopHalftimeMusicButton) DOM.stopHalftimeMusicButton.classList.toggle('hidden', halftimeMusicSound.paused);
            if(DOM.resumeHalftimeMusicButton) DOM.resumeHalftimeMusicButton.classList.toggle('hidden', !halftimeMusicSound.paused);
        } else {
            if(DOM.stopHalftimeMusicButton) DOM.stopHalftimeMusicButton.classList.add('hidden');
            if(DOM.resumeHalftimeMusicButton) DOM.resumeHalftimeMusicButton.classList.remove('hidden');
        }
        const halftimeButtonsDisabled = isGameOver;
        if(DOM.stopHalftimeMusicButton) DOM.stopHalftimeMusicButton.disabled = halftimeButtonsDisabled;
        if(DOM.resumeHalftimeMusicButton) DOM.resumeHalftimeMusicButton.disabled = halftimeButtonsDisabled;
        if(DOM.prepareSecondHalfButton) DOM.prepareSecondHalfButton.disabled = halftimeButtonsDisabled;
    } else {
        if(DOM.stopHalftimeMusicButton) DOM.stopHalftimeMusicButton.classList.add('hidden');
        if(DOM.resumeHalftimeMusicButton) DOM.resumeHalftimeMusicButton.classList.add('hidden');
    }

    // Next Sub Box
    if (!isHalftimeScreenActive && !isProceedToHalftimeVisible && !isGameOver &&
        DOM.nextSubBox && DOM.nextSubCountdownP && DOM.nextSubInfoP && DOM.pendingSubInfoP && DOM.confirmSubButton) {
        if (subIsPending) {
            DOM.nextSubCountdownP.textContent = "PENDING";
            DOM.pendingSubInfoP.classList.remove('hidden');
            const outS = pendingOutPlayers.join(', ') || 'N/A';
            const inS = pendingInPlayers.join(', ') || 'N/A';
            DOM.pendingSubInfoP.textContent = `CONFIRM ${pendingInPlayers.length}x SUB: OUT: ${outS}, IN: ${inS}`;
            DOM.nextSubInfoP.classList.add('hidden');
            if (DOM.playersComingOffDiv) DOM.playersComingOffDiv.textContent = pendingOutPlayers.join(', ');
            if (DOM.playersComingOnDiv) DOM.playersComingOnDiv.textContent = pendingInPlayers.join(', ');
        } else {
            DOM.pendingSubInfoP.classList.add('hidden'); DOM.nextSubInfoP.classList.remove('hidden');
            const activeNonGk = allPlayers.filter(p=>!playerRemovedStatus[p]&&!playerGKStatus[p]).length;
            const nonGkSpots = gameSettings.numOnField-gameSettings.numGoalkeepers;
            const canEverSub = gameSettings.subsPerChange > 0 && activeNonGk > nonGkSpots && nonGkSpots > 0 && totalGameDuration > 0 && periodLengthSeconds > 0;

            if(!canEverSub && gameSettings.subsPerChange > 0 && allPlayers.length > 0 && periodLengthSeconds > 0){
                DOM.nextSubCountdownP.textContent="--:--";
                if(nonGkSpots<=0&&activeNonGk>0)DOM.nextSubInfoP.textContent="(All spots GK/no non-GK spots)";
                else if(activeNonGk<=nonGkSpots)DOM.nextSubInfoP.textContent="(Not enough players for rotation)";
                else DOM.nextSubInfoP.textContent="(Auto subs not possible)";
            } else if(nextSubTimeInPeriod===Infinity || gameSettings.subsPerChange===0 || periodLengthSeconds === 0){
                DOM.nextSubCountdownP.textContent="--:--";
                if(gameSettings.subsPerChange===0&&allPlayers.length>0)DOM.nextSubInfoP.textContent="(Auto subs disabled)";
                else if(totalGameDuration>0 && optimizedSubSchedule.length > 0 && targetSubTimes.length === 0 && currentGameSeconds >= optimizedSubSchedule[optimizedSubSchedule.length-1] && optimizedSubSchedule[optimizedSubSchedule.length-1] > 0) DOM.nextSubInfoP.textContent="(All subs completed)";
                else if(totalGameDuration>0 && (currentGameSeconds + MIN_TIME_BEFORE_END_BUFFER_SECONDS) >= totalGameDuration) DOM.nextSubInfoP.textContent="(Game ending soon)";
                else if(allPlayers.length>0 && optimizedSubSchedule.length === 0 && gameSettings.subsPerChange > 0 && periodLengthSeconds > 0) DOM.nextSubInfoP.textContent="(No plan generated)";
                else if(allPlayers.length>0 && periodLengthSeconds > 0)DOM.nextSubInfoP.textContent="(No further auto subs)"; else DOM.nextSubInfoP.textContent="";
            } else {
                DOM.nextSubCountdownP.textContent=formatTime(Math.max(0,nextSubTimeInPeriod-currentGameSeconds));
                const{playersOff,playersOn}=getPlayersForSubstitutionAtTime(nextSubTimeInPeriod);
                if(playersOff.length>0&&playersOn.length>0){DOM.nextSubInfoP.textContent=`(Plan: ${playersOff.length}x ${playersOff.join(',')} OFF, ${playersOn.join(',')} ON)`;
                    if(DOM.playersComingOffDiv)DOM.playersComingOffDiv.textContent=playersOff.join(', ');if(DOM.playersComingOnDiv)DOM.playersComingOnDiv.textContent=playersOn.join(', ');
                }else{DOM.nextSubInfoP.textContent=`(Sub planned for ${formatTime(nextSubTimeInPeriod)}, but no valid players found)`;if(DOM.playersComingOffDiv)DOM.playersComingOffDiv.textContent='TBD';if(DOM.playersComingOnDiv)DOM.playersComingOnDiv.textContent='TBD';}
            }
             if (DOM.playersComingOffDiv && (DOM.nextSubInfoP.textContent.includes("No further") || DOM.nextSubInfoP.textContent.includes("disabled") || DOM.nextSubInfoP.textContent.includes("not possible") || DOM.nextSubInfoP.textContent.includes("completed") || DOM.nextSubInfoP.textContent.includes("No plan generated"))) {
                DOM.playersComingOffDiv.textContent = ''; if (DOM.playersComingOnDiv) DOM.playersComingOnDiv.textContent = '';
            }
        }
        DOM.confirmSubButton.disabled=!(subIsPending&&!isModalOpen);
        subIsPending&&!isModalOpen?DOM.confirmSubButton.classList.remove('hidden'):DOM.confirmSubButton.classList.add('hidden');
    } else if (DOM.nextSubBox) {
        if(DOM.nextSubCountdownP) DOM.nextSubCountdownP.textContent = "--:--";
        if(DOM.nextSubInfoP) DOM.nextSubInfoP.textContent = isGameOver ? "(Game Over)" : (isProceedToHalftimeVisible || isHalftimeScreenActive ? "" : "(Sub info hidden)");
        if(DOM.pendingSubInfoP) DOM.pendingSubInfoP.classList.add('hidden');
        if(DOM.confirmSubButton) DOM.confirmSubButton.classList.add('hidden');
        if(DOM.playersComingOffDiv) DOM.playersComingOffDiv.textContent = '';
        if(DOM.playersComingOnDiv) DOM.playersComingOnDiv.textContent = '';
    }

    if (!isSetupScreenVisible && DOM.gameContainerDiv && !DOM.gameContainerDiv.classList.contains('hidden') && !isHalftimeScreenActive && !isProceedToHalftimeVisible) {
        updatePlayerList(DOM.onFieldListUl, DOM.onFieldCountSpan, onField);
        const activeBench = onBench.sort((a, b) => (playerPlayTimes[a] || 0) - (playerPlayTimes[b] || 0) || a.localeCompare(b));
        const removedList = removedPlayers.sort((a,b) => a.localeCompare(b));
        const benchListDisp = [...activeBench, ...removedList];
        updatePlayerList(DOM.onBenchListUl, DOM.onBenchCountSpan, benchListDisp);
    }

    const isSetupComplete = allPlayers.length > 0 && periodLengthSeconds > 0;
    if(DOM.startStopButton) {
        DOM.startStopButton.disabled = isModalOpen || isSetupScreenVisible || !isSetupComplete || isGameOver || isHalftimeScreenActive || isProceedToHalftimeVisible;
        if(!DOM.startStopButton.disabled) {
            DOM.startStopButton.textContent = isRunning ? 'STOP' : 'START';
            DOM.startStopButton.className = 'timer-box-button ' + (isRunning ? 'stop' : 'start');
            if (subIsPending) {
                DOM.startStopButton.textContent = isRunning ? 'STOP (Sub Pending)' : 'START (Sub Pending)';
                DOM.startStopButton.classList.add('pending-sub-warning');
            } else {
                DOM.startStopButton.classList.remove('pending-sub-warning');
            }
        } else {
            DOM.startStopButton.classList.remove('pending-sub-warning');
            if(isGameOver) { DOM.startStopButton.textContent = 'Game Over'; DOM.startStopButton.className = 'timer-box-button game-over'; }
            else { DOM.startStopButton.textContent = isRunning ? 'STOP' : 'START'; DOM.startStopButton.className = 'timer-box-button ' + (isRunning ? 'stop' : 'start');}
        }
    }

    const eligibleBenchForEmergency = allPlayers.filter(p => !onField.includes(p) && !playerGKStatus[p] && !playerRemovedStatus[p]).length;
    const canDoEmergencySub = isSetupComplete && !isGameOver && onField.length > 0 && eligibleBenchForEmergency > 0 && !isModalOpen && !isHalftimeScreenActive && !isProceedToHalftimeVisible;
    if(DOM.emergencySubButton) DOM.emergencySubButton.disabled = !canDoEmergencySub;
    if(DOM.manageGKButton) DOM.manageGKButton.disabled = !isSetupComplete || isGameOver || isModalOpen || isHalftimeScreenActive || !isProceedToHalftimeVisible;

    const mainGameResetButton = document.querySelector('#game-controls #resetButton');
    if(mainGameResetButton) mainGameResetButton.disabled = isModalOpen || (isSetupScreenVisible && (!DOM.gameContainerDiv || DOM.gameContainerDiv.classList.contains('hidden')));


    // Status Message Logic (targets #statusMessage, now located under #game-header)
    if (!isModalOpen && DOM.statusMessageP) {
        let message = "";
        if (isSetupScreenVisible) {
            message = "Please complete setup.";
        } else if (isProceedToHalftimeVisible) {
            message = "1st Half Over. Click 'Proceed to Halftime'.";
        } else if (isHalftimeScreenActive) {
            message = halftimeMusicSound && !halftimeMusicSound.paused ? "HALFTIME! Music playing..." : "HALFTIME! Music paused.";
        } else if (isGameOver) {
            message = `Game Over! Final Time: ${formatTime(currentGameSeconds)}.`;
        } else if (subIsPending) {
            message = "AUTO SUB PENDING - Press CONFIRM!";
        } else if (isRunning) {
            message = "Timer Running. Press STOP with whistle/stoppage.";
            if (nextSubTimeInPeriod !== Infinity && nextSubTimeInPeriod > currentGameSeconds) {
                const timeToNextSub = nextSubTimeInPeriod - currentGameSeconds;
                message += ` Next auto-sub in ${formatTime(timeToNextSub)}.`;
            }
        } else if (isSetupComplete) { 
            if (currentGameSeconds === 0 && currentPeriod === 1) {
                message = "Setup Complete. Press START with referee's whistle.";
            } else {
                 // Check if it's an intermediate period break or game just paused
                const finalPeriod = isFinalPeriod();
                if (periodElapsedSeconds === periodLengthSeconds && periodLengthSeconds > 0 && currentPeriod <= gameSettings.numPeriods && !finalPeriod) {
                    message = `End of Period ${currentPeriod -1}. Ready for Period ${currentPeriod}. Press START.`;
                } else {
                    message = `Timer Paused (Period ${currentPeriod}). Press START to resume.`;
                }
            }
            if (pendingOutPlayers.length > 0 && !isRunning) { // If sub was pending when timer stopped
                 message = `SUB PENDING. ${message}`;
            }
        }
        
        if (DOM.statusMessageP.textContent !== message || message === "") { // Update if different or if message should be cleared
            showStatusMessage(message, message === "" ? 1 : 0); // Clear if empty, else persist
        }
    } else if (isModalOpen && DOM.statusMessageP) {
        // Clear general status when a modal is open, as modals handle their own messages/errors.
        if (DOM.statusMessageP.textContent) showStatusMessage("", 1); // Clear it quickly
    }
}