function openModal(modalElement) {
    if (!modalElement) return;
    isModalOpen = true; modalElement.classList.remove('hidden');
    if (subIsPending) {
        debugLog("Modal opened while sub pending. Cancelling auto sub.");
        subIsPending = false;
        pendingOutPlayers = [];
        pendingInPlayers = [];
        pendingSubTriggerTime = null;
    }
    updateDisplay();
}

function closeModal(modalElement) {
    if (!modalElement) return;
    modalElement.classList.add('hidden'); isModalOpen = false;
    updateDisplay();
}

function showEmergencySubModal() {
    if (!emergencySubModal || !subOutPlayerSelect || !subInPlayerSelect || !emergencySubErrorP || !confirmEmergencySubButton || !cancelEmergencySubButton || !injuredFateRadios || injuredFateRadios.length === 0) {
        showStatusMessage("Error: Emergency sub UI elements missing.", 3000);
        return;
    }
    const eligibleNotOnField = allPlayers.filter(p => !onField.includes(p) && !playerGKStatus[p] && !playerRemovedStatus[p]);
    if (onField.length === 0) {
        showStatusMessage("Emergency sub: No players on field.", 4000);
        return;
    }
    if (eligibleNotOnField.length === 0) {
        showStatusMessage("Emergency sub: No eligible players on bench.", 4000);
        return;
    }

    openModal(emergencySubModal);
    emergencySubErrorP.textContent = '';
    subOutPlayerSelect.innerHTML = '';
    onField.slice().sort((a,b)=>a.localeCompare(b)).forEach(player => {
        const opt = document.createElement('option');
        opt.value = player;
        let txt = player;
        if (playerGKStatus[player]) txt += ' (GK)';
        opt.textContent = txt;
        subOutPlayerSelect.appendChild(opt);
    });

    subInPlayerSelect.innerHTML = '';
    eligibleNotOnField.sort((a, b) => (playerPlayTimes[a] || 0) - (playerPlayTimes[b] || 0) || a.localeCompare(b))
        .forEach(player => {
            const opt = document.createElement('option');
            opt.value = player;
            opt.textContent = `${player} (P: ${formatTime(playerPlayTimes[player] || 0)})`;
            subInPlayerSelect.appendChild(opt);
        });

    for (const radio of injuredFateRadios) radio.checked = (radio.value === 'bench');
    if (confirmEmergencySubButton) confirmEmergencySubButton.disabled = onField.length === 0 || eligibleNotOnField.length === 0;
}

// Replace the existing function with:
function regenerateAndApplyOptimalPlan() {
    debugLog("Regenerating optimal substitution plan...");
    
    const currentVariance = typeof calculateCurrentVariance !== 'undefined' 
        ? calculateCurrentVariance() 
        : { variance: 0 };
    const wasHighVariance = currentVariance.variance > 90;

    const activePlayersCurrent = allPlayers.filter(p => !playerRemovedStatus[p]);
    const numGkOnFieldTarget = gameSettings.numGoalkeepers;

    const nonGkSpots = gameSettings.numOnField - numGkOnFieldTarget;
    const activeNonGkPlayersCount = activePlayersCurrent.filter(p => !playerGKStatus[p]).length;

    const canGeneratePlan = gameSettings.subsPerChange > 0 &&
                            activeNonGkPlayersCount > nonGkSpots &&
                            nonGkSpots >= 0 &&
                            periodLengthSeconds > 0 &&
                            gameSettings.numPeriods > 0;

    if (canGeneratePlan && nonGkSpots === 0 && activeNonGkPlayersCount > 0) {
        debugLog("Regen: No non-GK spots on field, but active non-GKs exist. No rotation plan for non-GKs.");
        optimizedSubSchedule = [];
        optimizedSubPlan = [];
    } else if (canGeneratePlan) {
        const fullGameDurationTotal = periodLengthSeconds * gameSettings.numPeriods;
        const timeAlreadyElapsedInGame = currentGameSeconds;
        const remainingGameDurationForNewPlan = fullGameDurationTotal - timeAlreadyElapsedInGame;

        if (remainingGameDurationForNewPlan < MIN_ACCEPTABLE_SUB_INTERVAL * 1.5) {
            optimizedSubSchedule = [];
            optimizedSubPlan = [];
            debugLog("Regen: Not enough remaining game time to generate a meaningful new plan.");
        } else {
            const { times: newRelativeTimes, plan: newRelativePlan } = calculateOptimalSubstitutionPattern(
                remainingGameDurationForNewPlan,
                activePlayersCurrent,
                gameSettings.numOnField,
                gameSettings.subsPerChange,
                playerGKStatus,
                numGkOnFieldTarget,
                wasHighVariance // NEW parameter for variance optimization
            );

            optimizedSubSchedule = newRelativeTimes.map(t => t + timeAlreadyElapsedInGame);
            optimizedSubPlan = newRelativePlan.map(sub => ({
                ...sub,
                time: sub.time + timeAlreadyElapsedInGame
            }));
            debugLog("New optimal plan (absolute times) generated for remaining game:", { schedule: optimizedSubSchedule.map(formatTime), planDetailsCount: optimizedSubPlan.length });
        }
    } else {
         optimizedSubSchedule = [];
         optimizedSubPlan = [];
         debugLog("Conditions not met for generating a new optimal plan (e.g., not enough active players for rotation, subs disabled, game settings invalid).");
    }
    recalculateRemainingAutoSubTimes();
    updateDisplay();
}


function handleConfirmEmergencySub() {
    if (!subOutPlayerSelect || !subInPlayerSelect || !emergencySubErrorP || !injuredFateRadios || injuredFateRadios.length === 0) return;
    const pOut = subOutPlayerSelect.value;
    const pIn = subInPlayerSelect.value;

    if (!pOut || !pIn) { emergencySubErrorP.textContent = "Both players must be selected."; return; }
    if (pOut === pIn) { emergencySubErrorP.textContent = "Players cannot be the same."; return; }

    const onFIdx = onField.indexOf(pOut);
    if (onFIdx === -1) { emergencySubErrorP.textContent = `Player to sub out (${pOut}) is not currently on the field.`; return; }
    if (onField.includes(pIn)) { emergencySubErrorP.textContent = `Player to sub in (${pIn}) is already on the field.`; return; }
    if (playerGKStatus[pIn]) { emergencySubErrorP.textContent = `Player to sub in (${pIn}) is a designated GK. Use Manage GK for GK changes.`; return; }
    if (playerRemovedStatus[pIn]) { emergencySubErrorP.textContent = `Player to sub in (${pIn}) has been removed from the game.`; return; }
    if (!allPlayers.includes(pOut) || !allPlayers.includes(pIn)) { emergencySubErrorP.textContent = `Invalid player names detected.`; return;}

    let fate = 'bench';
    for (const radio of injuredFateRadios) { if (radio.checked) fate = radio.value; }

    onField.splice(onFIdx, 1);
    const onBIdx = onBench.indexOf(pIn);
    if (onBIdx > -1) onBench.splice(onBIdx, 1);
    onField.push(pIn);
    playerCurrentStintStart[pIn] = currentGameSeconds;
    playerCurrentStintStart[pOut] = null;

    debugLog(`Emergency sub: ${pOut} OFF, ${pIn} ON at ${formatTime(currentGameSeconds)}. ${pOut} fate: ${fate}`);

    let planNeedsRegeneration = false;

    if (fate === 'bench') {
        playerRemovedStatus[pOut] = false;
        const remIdx = removedPlayers.indexOf(pOut);
        if (remIdx > -1) removedPlayers.splice(remIdx, 1);

        if (!playerGKStatus[pOut] && !onBench.includes(pOut)) {
            onBench.push(pOut);
        }
        sortOnBenchQueue();
        planNeedsRegeneration = true;
        debugLog("Emergency sub: Player benched. Plan regeneration triggered due to changed player field/bench status.");

    } else { // fate === 'remove'
        const wasAlreadyRemoved = playerRemovedStatus[pOut];
        playerRemovedStatus[pOut] = true;
        if (!removedPlayers.includes(pOut)) removedPlayers.push(pOut);
        const benchFateIdx = onBench.indexOf(pOut);
        if (benchFateIdx > -1) onBench.splice(benchFateIdx, 1);

        planNeedsRegeneration = true;
        if (!wasAlreadyRemoved) {
            debugLog("Emergency sub: Player status changed to removed. Plan regeneration triggered.");
        } else {
            debugLog("Emergency sub: Player confirmed as removed (was already). Plan regeneration triggered because player counts for planning changed.");
        }
    }

    closeModal(emergencySubModal);

    if (planNeedsRegeneration) {
        regenerateAndApplyOptimalPlan();
    } else {
        debugLog("Emergency sub: Plan regeneration NOT flagged (unexpected). Doing minimal recalculateRemainingAutoSubTimes().");
        recalculateRemainingAutoSubTimes();
        updateDisplay();
    }
    showStatusMessage(`Emergency Sub: ${pOut} OFF, ${pIn} ON. Fate: ${fate}. Substitution plan ${planNeedsRegeneration ? 'recalculated' : 'checked'}.`);
}


function handleCancelEmergencySub() {
    showStatusMessage("Emergency sub cancelled.", 2000);
    closeModal(emergencySubModal);
}

function showManageGKModal() {
    if (!manageGKModal || !gkPlayerListDiv || !confirmManageGKButton || !cancelManageGKButton || !manageGKErrorP) {
        showStatusMessage("Error: Manage GK UI elements missing.", 3000);
        return;
    }
    if (allPlayers.length === 0) {
        showStatusMessage("Cannot manage Goalkeepers before game setup is complete.", 3000);
        return;
    }

    openModal(manageGKModal);
    manageGKErrorP.textContent = '';
    gkPlayerListDiv.innerHTML = '';
    const pForGKList = allPlayers.filter(p => !playerRemovedStatus[p]).sort((a,b)=>a.localeCompare(b));

    if (pForGKList.length === 0) {
        gkPlayerListDiv.innerHTML = "<p>No active players available to assign as Goalkeeper.</p>";
        if (confirmManageGKButton) confirmManageGKButton.disabled = true;
        return;
    }

    pForGKList.forEach(player => {
        const div = document.createElement('div');
        const lbl = document.createElement('label');
        const chk = document.createElement('input');
        const span = document.createElement('span');
        chk.type = 'checkbox';
        chk.value = player;
        chk.checked = playerGKStatus[player] || false;
        span.textContent = player;
        lbl.appendChild(span);
        lbl.appendChild(chk);
        div.appendChild(lbl);
        gkPlayerListDiv.appendChild(div);
    });
    if (confirmManageGKButton) confirmManageGKButton.disabled = pForGKList.length === 0;
}


function handleConfirmManageGK() {
    if (!gkPlayerListDiv || !manageGKErrorP || !confirmManageGKButton) return;

    const newGKStatusesFromModal = {};
    const chks = gkPlayerListDiv.querySelectorAll('input[type="checkbox"]');
    let numGKsSelectedInModal = 0;
    chks.forEach(chk => {
        newGKStatusesFromModal[chk.value] = chk.checked;
        if (chk.checked) numGKsSelectedInModal++;
    });

    const prevPlayerGKStatus = JSON.parse(JSON.stringify(playerGKStatus));

    const tempProposedPlayerGKStatus = { ...playerGKStatus };
    allPlayers.forEach(p => {
        if (newGKStatusesFromModal.hasOwnProperty(p)) {
            tempProposedPlayerGKStatus[p] = newGKStatusesFromModal[p];
        }
    });

    const numNonGksInSquadProposed = allPlayers.filter(p => !tempProposedPlayerGKStatus[p] && !playerRemovedStatus[p]).length;
    const numNonGkSpotsNeededOnFieldProposed = gameSettings.numOnField - numGKsSelectedInModal;

    if (numGKsSelectedInModal > gameSettings.numOnField) {
        manageGKErrorP.textContent = `Cannot have more GKs (${numGKsSelectedInModal}) than total players on field (${gameSettings.numOnField}).`;
        return;
    }
    if (numNonGkSpotsNeededOnFieldProposed < 0 ) {
        manageGKErrorP.textContent = `Invalid GK configuration: results in negative non-GK spots on field.`;
        return;
    }
    if (numNonGksInSquadProposed < numNonGkSpotsNeededOnFieldProposed) {
        manageGKErrorP.textContent = `Not enough active non-GK players in squad (${numNonGksInSquadProposed}) to fill the required ${numNonGkSpotsNeededOnFieldProposed} non-GK spots on field.`;
        return;
    }
    if (gameSettings.subsPerChange > 0 && numNonGkSpotsNeededOnFieldProposed === 0 && gameSettings.numOnField > 0 && numNonGksInSquadProposed > 0) {
        manageGKErrorP.textContent = `Cannot make all field spots GK if auto-subs are enabled and active non-GKs exist in squad. Rotation needs non-GK spots.`;
        return;
    }

    playerGKStatus = tempProposedPlayerGKStatus;
    gameSettings.numGoalkeepers = numGKsSelectedInModal;

    let planNeedsRegeneration = false;
    allPlayers.forEach(p => {
        const oldStatus = prevPlayerGKStatus[p];
        const newStatus = playerGKStatus[p];

        if (oldStatus !== newStatus) {
            planNeedsRegeneration = true;
            if (newStatus === true) {
                const benchIdx = onBench.indexOf(p);
                if (benchIdx > -1) onBench.splice(benchIdx, 1);
            } else {
                if (!onField.includes(p) && !playerRemovedStatus[p] && !onBench.includes(p)) {
                    onBench.push(p);
                }
            }
        }
    });
    sortOnBenchQueue();

    closeModal(manageGKModal);

    if (planNeedsRegeneration) {
        regenerateAndApplyOptimalPlan();
    } else {
        debugLog("Manage GK: No individual player GK status changed that requires plan regeneration, but regenerating for safety.");
        regenerateAndApplyOptimalPlan();
    }
    showStatusMessage(`Goalkeeper status updated. Substitution plan ${planNeedsRegeneration ? 'recalculated' : 'checked and likely recalculated'}.`);
}

function handleCancelManageGK() {
    showStatusMessage("Manage Goalkeeper cancelled.", 2000);
    closeModal(manageGKModal);
}