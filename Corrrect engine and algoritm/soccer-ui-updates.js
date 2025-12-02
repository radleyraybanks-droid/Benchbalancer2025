// --- ui-updates.js ---

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
    const isSetupScreenVisible = setupDiv && !setupDiv.classList.contains('hidden');
    const isProceedToHalftimeVisible = endOfPeriodActionsContainer && !endOfPeriodActionsContainer.classList.contains('hidden');

    // Timer and Period Display
    if (isHalftimeScreenActive) {
        if (gameTimerP) gameTimerP.textContent = "HALFTIME";
        if (periodTimerP) periodTimerP.textContent = `(Total: ${formatTime(currentGameSeconds)})`;
        if (periodDisplayP) periodDisplayP.textContent = `${Math.min(currentPeriod -1, gameSettings.numPeriods)}/${gameSettings.numPeriods}`;
    } else {
        if (gameTimerP) gameTimerP.textContent = formatTime(Math.max(0, periodLengthSeconds - periodElapsedSeconds));
        if (periodTimerP) periodTimerP.textContent = `(Total: ${formatTime(currentGameSeconds)})`;
        if (periodDisplayP) periodDisplayP.textContent = `${currentPeriod}/${gameSettings.numPeriods}`;
    }

    // Show/Hide Main Content Sections based on game state
    if (isHalftimeScreenActive) {
        if (nextSubBox) nextSubBox.classList.add('hidden');
        if (playerLists) playerLists.classList.add('hidden');
        if (gameControls) gameControls.classList.add('hidden');
        if (halftimeScreenDiv) halftimeScreenDiv.classList.remove('hidden');
        if (endOfPeriodActionsContainer) endOfPeriodActionsContainer.classList.add('hidden');
        if (statusMessageP) statusMessageP.classList.remove('hidden'); // Keep visible for halftime message
    } else if (isProceedToHalftimeVisible) {
        if (nextSubBox) nextSubBox.classList.add('hidden');
        if (playerLists) playerLists.classList.add('hidden');
        if (gameControls) gameControls.classList.add('hidden');
        if (halftimeScreenDiv) halftimeScreenDiv.classList.add('hidden');
        if (statusMessageP) statusMessageP.classList.remove('hidden');
    } else if (!isSetupScreenVisible && gameContainerDiv && !gameContainerDiv.classList.contains('hidden')) {
        if (halftimeScreenDiv) halftimeScreenDiv.classList.add('hidden');
        if (endOfPeriodActionsContainer) endOfPeriodActionsContainer.classList.add('hidden');
        if (nextSubBox) isGameOver ? nextSubBox.classList.add('hidden') : nextSubBox.classList.remove('hidden');
        if (playerLists) playerLists.classList.remove('hidden');
        if (gameControls) gameControls.classList.remove('hidden');
        if (statusMessageP) statusMessageP.classList.remove('hidden');
    } else { // Setup screen is visible
        if (statusMessageP) statusMessageP.classList.remove('hidden');
    }


    // Halftime Music Buttons
    if (isHalftimeScreenActive) {
        if (halftimeMusicSound) {
            if(stopHalftimeMusicButton) stopHalftimeMusicButton.classList.toggle('hidden', halftimeMusicSound.paused);
            if(resumeHalftimeMusicButton) resumeHalftimeMusicButton.classList.toggle('hidden', !halftimeMusicSound.paused);
        } else {
            if(stopHalftimeMusicButton) stopHalftimeMusicButton.classList.add('hidden');
            if(resumeHalftimeMusicButton) resumeHalftimeMusicButton.classList.remove('hidden');
        }
        const halftimeButtonsDisabled = isGameOver;
        if(stopHalftimeMusicButton) stopHalftimeMusicButton.disabled = halftimeButtonsDisabled;
        if(resumeHalftimeMusicButton) resumeHalftimeMusicButton.disabled = halftimeButtonsDisabled;
        if(prepareSecondHalfButton) prepareSecondHalfButton.disabled = halftimeButtonsDisabled;
    } else {
        if(stopHalftimeMusicButton) stopHalftimeMusicButton.classList.add('hidden');
        if(resumeHalftimeMusicButton) resumeHalftimeMusicButton.classList.add('hidden');
    }

    // Next Sub Box
    if (!isHalftimeScreenActive && !isProceedToHalftimeVisible && !isGameOver &&
        nextSubBox && nextSubCountdownP && nextSubInfoP && pendingSubInfoP && confirmSubButton) {
        if (subIsPending) {
            nextSubCountdownP.textContent = "PENDING";
            pendingSubInfoP.classList.remove('hidden');
            const outS = pendingOutPlayers.join(', ') || 'N/A';
            const inS = pendingInPlayers.join(', ') || 'N/A';
            pendingSubInfoP.textContent = `CONFIRM ${pendingInPlayers.length}x SUB: OUT: ${outS}, IN: ${inS}`;
            nextSubInfoP.classList.add('hidden');
            if (playersComingOffDiv) playersComingOffDiv.textContent = pendingOutPlayers.join(', ');
            if (playersComingOnDiv) playersComingOnDiv.textContent = pendingInPlayers.join(', ');
        } else {
            pendingSubInfoP.classList.add('hidden'); nextSubInfoP.classList.remove('hidden');
            const activeNonGk = allPlayers.filter(p=>!playerRemovedStatus[p]&&!playerGKStatus[p]).length;
            const nonGkSpots = gameSettings.numOnField-gameSettings.numGoalkeepers;
            const canEverSub = gameSettings.subsPerChange > 0 && activeNonGk > nonGkSpots && nonGkSpots > 0 && totalGameDuration > 0 && periodLengthSeconds > 0;

            if(!canEverSub && gameSettings.subsPerChange > 0 && allPlayers.length > 0 && periodLengthSeconds > 0){
                nextSubCountdownP.textContent="--:--";
                if(nonGkSpots<=0&&activeNonGk>0)nextSubInfoP.textContent="(All spots GK/no non-GK spots)";
                else if(activeNonGk<=nonGkSpots)nextSubInfoP.textContent="(Not enough players for rotation)";
                else nextSubInfoP.textContent="(Auto subs not possible)";
            } else if(nextSubTimeInPeriod===Infinity || gameSettings.subsPerChange===0 || periodLengthSeconds === 0){
                nextSubCountdownP.textContent="--:--";
                if(gameSettings.subsPerChange===0&&allPlayers.length>0)nextSubInfoP.textContent="(Auto subs disabled)";
                else if(totalGameDuration>0 && optimizedSubSchedule.length > 0 && targetSubTimes.length === 0 && currentGameSeconds >= optimizedSubSchedule[optimizedSubSchedule.length-1] && optimizedSubSchedule[optimizedSubSchedule.length-1] > 0) nextSubInfoP.textContent="(All subs completed)";
                else if(totalGameDuration>0 && (currentGameSeconds + MIN_TIME_BEFORE_END_BUFFER_SECONDS) >= totalGameDuration) nextSubInfoP.textContent="(Game ending soon)";
                else if(allPlayers.length>0 && optimizedSubSchedule.length === 0 && gameSettings.subsPerChange > 0 && periodLengthSeconds > 0) nextSubInfoP.textContent="(No plan generated)";
                else if(allPlayers.length>0 && periodLengthSeconds > 0)nextSubInfoP.textContent="(No further auto subs)"; else nextSubInfoP.textContent="";
            } else {
                nextSubCountdownP.textContent=formatTime(Math.max(0,nextSubTimeInPeriod-currentGameSeconds));
                const{playersOff,playersOn}=getPlayersForSubstitutionAtTime(nextSubTimeInPeriod);
                if(playersOff.length>0&&playersOn.length>0){nextSubInfoP.textContent=`(Plan: ${playersOff.length}x ${playersOff.join(',')} OFF, ${playersOn.join(',')} ON)`;
                    if(playersComingOffDiv)playersComingOffDiv.textContent=playersOff.join(', ');if(playersComingOnDiv)playersComingOnDiv.textContent=playersOn.join(', ');
                }else{nextSubInfoP.textContent=`(Sub planned for ${formatTime(nextSubTimeInPeriod)}, but no valid players found)`;if(playersComingOffDiv)playersComingOffDiv.textContent='TBD';if(playersComingOnDiv)playersComingOnDiv.textContent='TBD';}
            }
             if (playersComingOffDiv && (nextSubInfoP.textContent.includes("No further") || nextSubInfoP.textContent.includes("disabled") || nextSubInfoP.textContent.includes("not possible") || nextSubInfoP.textContent.includes("completed") || nextSubInfoP.textContent.includes("No plan generated"))) {
                playersComingOffDiv.textContent = ''; if (playersComingOnDiv) playersComingOnDiv.textContent = '';
            }
        }
        confirmSubButton.disabled=!(subIsPending&&!isModalOpen);
        subIsPending&&!isModalOpen?confirmSubButton.classList.remove('hidden'):confirmSubButton.classList.add('hidden');
    } else if (nextSubBox) {
        if(nextSubCountdownP) nextSubCountdownP.textContent = "--:--";
        if(nextSubInfoP) nextSubInfoP.textContent = isGameOver ? "(Game Over)" : (isProceedToHalftimeVisible || isHalftimeScreenActive ? "" : "(Sub info hidden)");
        if(pendingSubInfoP) pendingSubInfoP.classList.add('hidden');
        if(confirmSubButton) confirmSubButton.classList.add('hidden');
        if(playersComingOffDiv) playersComingOffDiv.textContent = '';
        if(playersComingOnDiv) playersComingOnDiv.textContent = '';
    }

    if (!isSetupScreenVisible && gameContainerDiv && !gameContainerDiv.classList.contains('hidden') && !isHalftimeScreenActive && !isProceedToHalftimeVisible) {
        updatePlayerList(onFieldListUl, onFieldCountSpan, onField);
        const activeBench = onBench.sort((a, b) => (playerPlayTimes[a] || 0) - (playerPlayTimes[b] || 0) || a.localeCompare(b));
        const removedList = removedPlayers.sort((a,b) => a.localeCompare(b));
        const benchListDisp = [...activeBench, ...removedList];
        updatePlayerList(onBenchListUl, onBenchCountSpan, benchListDisp);
    }

    const isSetupComplete = allPlayers.length > 0 && periodLengthSeconds > 0;
    if(startStopButton) {
        startStopButton.disabled = isModalOpen || isSetupScreenVisible || !isSetupComplete || isGameOver || isHalftimeScreenActive || isProceedToHalftimeVisible;
        if(!startStopButton.disabled) {
            startStopButton.textContent = isRunning ? 'STOP' : 'START';
            startStopButton.className = 'timer-box-button ' + (isRunning ? 'stop' : 'start');
            if (subIsPending) {
                startStopButton.textContent = isRunning ? 'STOP (Sub Pending)' : 'START (Sub Pending)';
                startStopButton.classList.add('pending-sub-warning');
            } else {
                startStopButton.classList.remove('pending-sub-warning');
            }
        } else {
            startStopButton.classList.remove('pending-sub-warning');
            if(isGameOver) { startStopButton.textContent = 'Game Over'; startStopButton.className = 'timer-box-button game-over'; }
            else { startStopButton.textContent = isRunning ? 'STOP' : 'START'; startStopButton.className = 'timer-box-button ' + (isRunning ? 'stop' : 'start');}
        }
    }

    const eligibleBenchForEmergency = allPlayers.filter(p => !onField.includes(p) && !playerGKStatus[p] && !playerRemovedStatus[p]).length;
    const canDoEmergencySub = isSetupComplete && !isGameOver && onField.length > 0 && eligibleBenchForEmergency > 0 && !isModalOpen && !isHalftimeScreenActive && !isProceedToHalftimeVisible;
    if(emergencySubButton) emergencySubButton.disabled = !canDoEmergencySub;
    if(manageGKButton) manageGKButton.disabled = !isSetupComplete || isGameOver || isModalOpen || isHalftimeScreenActive || !isProceedToHalftimeVisible;

    const mainGameResetButton = document.querySelector('#game-controls #resetButton');
    if(mainGameResetButton) mainGameResetButton.disabled = isModalOpen || (isSetupScreenVisible && (!gameContainerDiv || gameContainerDiv.classList.contains('hidden')));


    // Status Message Logic (targets #statusMessage, now located under #game-header)
    if (!isModalOpen && statusMessageP) {
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
                if (periodElapsedSeconds === periodLengthSeconds && periodLengthSeconds > 0 && currentPeriod <= gameSettings.numPeriods && !isFinalPeriod) { // isFinalPeriod needs to be defined or logic adjusted
                    message = `End of Period ${currentPeriod -1}. Ready for Period ${currentPeriod}. Press START.`;
                } else {
                    message = `Timer Paused (Period ${currentPeriod}). Press START to resume.`;
                }
            }
            if (pendingOutPlayers.length > 0 && !isRunning) { // If sub was pending when timer stopped
                 message = `SUB PENDING. ${message}`;
            }
        }
        
        if (statusMessageP.textContent !== message || message === "") { // Update if different or if message should be cleared
            showStatusMessage(message, message === "" ? 1 : 0); // Clear if empty, else persist
        }
    } else if (isModalOpen && statusMessageP) {
        // Clear general status when a modal is open, as modals handle their own messages/errors.
        if (statusMessageP.textContent) showStatusMessage("", 1); // Clear it quickly
    }
}