// --- START OF FILE setup-and-reset.js ---

// File loaded successfully
console.log("setup-and-reset.js: File loaded successfully!");

// Manual test function
window.testPlayerInputs = function() {
    console.log("Testing player inputs...");
    if (typeof populatePlayerNamePlaceholders === "function") {
        console.log("Calling populatePlayerNamePlaceholders...");
        populatePlayerNamePlaceholders();
    } else {
        console.error("populatePlayerNamePlaceholders not found!");
    }
};

// Simple test - create inputs manually
window.createTestInputs = function() {
    console.log("Creating test inputs manually...");
    const starterContainer = document.getElementById('starterNamesContainer');
    const reserveContainer = document.getElementById('reserveNamesContainer');
    
    if (starterContainer) {
        starterContainer.innerHTML = '';
        for (let i = 1; i <= 9; i++) {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'player-name-input';
            input.placeholder = i === 1 ? '1GK' : String(i);
            starterContainer.appendChild(input);
        }
        console.log("Created starter inputs");
    }
    
    if (reserveContainer) {
        reserveContainer.innerHTML = '';
        for (let i = 10; i <= 12; i++) {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'player-name-input';
            input.placeholder = String(i);
            reserveContainer.appendChild(input);
        }
        console.log("Created reserve inputs");
    }
};

function resetGame() {
    console.log("setup-and-reset.js: resetGame() called.");
    stopTimer(); // Ensure stopTimer is available or defined before this script if it's in another file and called early
    subIsPending = false; pendingOutPlayers = []; pendingInPlayers = []; pendingSubTriggerTime = null;
    // Use DOM object for element access (v4 compatibility)
    const emergencySubModal = window.DOM?.emergencySubModal || window.emergencySubModal;
    const manageGKModal = window.DOM?.manageGKModal || window.manageGKModal;
    const halftimeScreenDiv = window.DOM?.halftimeScreenDiv || window.halftimeScreenDiv;
    const endOfPeriodActionsContainer = window.DOM?.endOfPeriodActionsContainer || window.endOfPeriodActionsContainer;
    const proceedToHalftimeButton = window.DOM?.proceedToHalftimeButton || window.proceedToHalftimeButton;
    const nextSubBox = window.DOM?.nextSubBox || window.nextSubBox;
    const playerLists = window.DOM?.playerLists || window.playerLists;
    const gameControls = window.DOM?.gameControls || window.gameControls;
    const startStopButton = window.DOM?.startStopButton || window.startStopButton;
    const confirmSubButton = window.DOM?.confirmSubButton || window.confirmSubButton;
    
    if (emergencySubModal && !emergencySubModal.classList.contains('hidden')) closeModal(emergencySubModal);
    if (manageGKModal && !manageGKModal.classList.contains('hidden')) closeModal(manageGKModal);
    isModalOpen = false;

    if (warningBeepSound) {
        warningBeepSound.pause();
        warningBeepSound.currentTime = 0;
        // No need to null it out if we preload it in handleSetupConfirmation / or also preload here for robustness
    }
    if (startingWhistleSound) {
        startingWhistleSound.pause();
        startingWhistleSound.currentTime = 0;
        // No need to null it out if we preload it in handleSetupConfirmation / or also preload here
    }
    startingWhistleSoundPlayed = false;

    if (halftimeMusicSound) {
        halftimeMusicSound.pause();
        halftimeMusicSound.currentTime = 0;
        halftimeMusicSound = null; // Halftime music is more specific to that event
    }
    isHalftimeScreenActive = false;
    if (halftimeScreenDiv) halftimeScreenDiv.classList.add('hidden');
    if (endOfPeriodActionsContainer) endOfPeriodActionsContainer.classList.add('hidden');
    if (proceedToHalftimeButton) proceedToHalftimeButton.classList.add('hidden');

    if (nextSubBox) nextSubBox.classList.remove('hidden');
    if (playerLists) playerLists.classList.remove('hidden');
    if (gameControls) gameControls.classList.remove('hidden');

    gameSettings = { numPeriods: 2, minsPerPeriod: 0, numOnField: 0, numGoalkeepers: 0, numReserves: 0, subsPerChange: 0 };
    allPlayers = []; starters = []; reserves = []; onField = []; onBench = []; removedPlayers = [];
    playerGKStatus = {}; playerRemovedStatus = {}; playerPlayTimes = {}; playerBenchTimes = {}; playerCurrentStintStart = {};
    periodLengthSeconds = 0; currentGameSeconds = 0; periodElapsedSeconds = 0; currentPeriod = 1; isRunning = false;
    optimizedSubSchedule = []; optimizedSubPlan = []; targetSubTimes = []; nextSubTimeInPeriod = Infinity;

    // Reset visibility tracking state to prevent stale timestamps from previous games
    lastVisibleTimestamp = null;
    wasRunningWhenHidden = false;

    // Add after other resets:
    if (typeof resetVarianceTracking !== 'undefined') {
        resetVarianceTracking();
    }

    isWarningSoundEnabled = true;
    
    // Use DOM object for element access (v4 compatibility)
    const warningSoundToggleInput = window.DOM?.warningSoundToggleInput || window.warningSoundToggleInput;
    const warningSoundToggleContainer = window.DOM?.warningSoundToggleContainer || window.warningSoundToggleContainer;
    const minsPerPeriodInput = window.DOM?.minsPerPeriodInput || window.minsPerPeriodInput;
    const numOnFieldInput = window.DOM?.numOnFieldInput || window.numOnFieldInput;
    const numGoalkeepersInput = window.DOM?.numGoalkeepersInput || window.numGoalkeepersInput;
    const numReservesInput = window.DOM?.numReservesInput || window.numReservesInput;
    const subsPerChangeSelect = window.DOM?.subsPerChangeSelect || window.subsPerChangeSelect;
    const setupErrorP = window.DOM?.setupErrorP || window.setupErrorP;
    const preliminaryPlanOutput = window.DOM?.preliminaryPlanOutput || window.preliminaryPlanOutput;
    const confirmSetupButton = window.DOM?.confirmSetupButton || window.confirmSetupButton;
    const getPlanButton = window.DOM?.getPlanButton || window.getPlanButton;
    const setupDiv = window.DOM?.setupDiv || window.setupDiv;
    const gameContainerDiv = window.DOM?.gameContainerDiv || window.gameContainerDiv;
    
    if (warningSoundToggleInput) {
        warningSoundToggleInput.checked = isWarningSoundEnabled;
        warningSoundToggleInput.disabled = false;
    }
    if (warningSoundToggleContainer) {
        warningSoundToggleContainer.classList.remove('hidden');
    }

    if (minsPerPeriodInput) minsPerPeriodInput.value = '20';
    if (numOnFieldInput) numOnFieldInput.value = '9';
    if (numGoalkeepersInput) numGoalkeepersInput.value = '1';
    if (numReservesInput) numReservesInput.value = '0';
    if (subsPerChangeSelect) subsPerChangeSelect.value = '1';

    if (setupErrorP) setupErrorP.textContent = '';
    if (preliminaryPlanOutput) preliminaryPlanOutput.innerHTML = '<p><em>Configure game and click "Show Plan".</em></p>';

    console.log("setup-and-reset.js: About to call populatePlayerNamePlaceholders...");
    if (typeof populatePlayerNamePlaceholders === "function") {
        console.log("setup-and-reset.js: populatePlayerNamePlaceholders function exists, calling it...");
        populatePlayerNamePlaceholders();
    } else {
        console.error("setup-and-reset.js: populatePlayerNamePlaceholders function not defined.");
    }

    if (confirmSetupButton) { confirmSetupButton.classList.remove('hidden'); confirmSetupButton.disabled = false; }
    if (getPlanButton) { getPlanButton.disabled = false; }
    if (setupDiv) setupDiv.classList.remove('hidden');
    if (gameContainerDiv) gameContainerDiv.classList.add('hidden');

    const mainGameResetButton = document.querySelector('#game-controls #resetButton');
    if (mainGameResetButton) mainGameResetButton.disabled = true;

    if (startStopButton) {
        startStopButton.textContent = 'START';
        startStopButton.className = 'timer-box-button start';
        startStopButton.disabled = true;
    }
    if (confirmSubButton) confirmSubButton.classList.add('hidden');

    // Preload sounds on reset as well, so they are ready if a new game is set up without full page reload.
    if (isWarningSoundEnabled) { // Only preload if enabled, though not strictly necessary for just creating object
        if (!warningBeepSound) {
            try { warningBeepSound = new Audio('beep-warning.wav'); debugLog("Warning beep preloaded on reset."); }
            catch (e) { console.error("Audio for warning sound failed on reset:", e); warningBeepSound = null; }
        }
        if (!startingWhistleSound) {
            try { startingWhistleSound = new Audio('startingwhistle.wav'); debugLog("Starting whistle preloaded on reset."); }
            catch (e) { console.error("Audio for starting whistle failed on reset:", e); startingWhistleSound = null; }
        }
    }


    debugLog("Game reset to initial state.");
    if (typeof updateDisplay === "function") updateDisplay();
    else console.error("setup-and-reset.js: updateDisplay function not defined.");
    console.log("setup-and-reset.js: resetGame() finished.");
}

function populatePlayerNamePlaceholders() {
    console.log("setup-and-reset.js: populatePlayerNamePlaceholders() called.");
    
    // Use DOM object for element access (v4 compatibility)
    const numOnFieldInput = window.DOM?.numOnFieldInput || window.numOnFieldInput;
    const numGoalkeepersInput = window.DOM?.numGoalkeepersInput || window.numGoalkeepersInput;
    const starterNamesContainer = window.DOM?.starterNamesContainer || window.starterNamesContainer;
    const numReservesInput = window.DOM?.numReservesInput || window.numReservesInput;
    const reserveNamesContainer = window.DOM?.reserveNamesContainer || window.reserveNamesContainer;
    const setupErrorP = window.DOM?.setupErrorP || window.setupErrorP;
    
    // Debug logging
    console.log("setup-and-reset.js: DOM element check:", {
        numOnFieldInput: !!numOnFieldInput,
        numGoalkeepersInput: !!numGoalkeepersInput,
        starterNamesContainer: !!starterNamesContainer,
        numReservesInput: !!numReservesInput,
        reserveNamesContainer: !!reserveNamesContainer,
        setupErrorP: !!setupErrorP,
        windowDOM: !!window.DOM,
        windowStarterNamesContainer: !!window.starterNamesContainer
    });
    

    
    if (!numOnFieldInput || !numGoalkeepersInput || !starterNamesContainer ||
        !numReservesInput || !reserveNamesContainer) {
        let missingElementsReport = [];
        if (!numOnFieldInput) missingElementsReport.push("numOnFieldInput");
        if (!numGoalkeepersInput) missingElementsReport.push("numGoalkeepersInput");
        if (!starterNamesContainer) missingElementsReport.push("starterNamesContainer");
        if (!numReservesInput) missingElementsReport.push("numReservesInput");
        if (!reserveNamesContainer) missingElementsReport.push("reserveNamesContainer");
        const detailedErrorMessage = `Cannot populate player name inputs. Crucial element(s) missing: ${missingElementsReport.join('; ')}.`;
        console.error(`setup-and-reset.js: POPULATE_ERROR - ${detailedErrorMessage}. States -> numOnField: ${!!numOnFieldInput}, numGK: ${!!numGoalkeepersInput}, starterCont: ${!!starterNamesContainer}, numRes: ${!!numReservesInput}, reserveCont: ${!!reserveNamesContainer}`);
        debugLog(detailedErrorMessage);
        if (setupErrorP) setupErrorP.textContent = detailedErrorMessage; // Show error to user
        return;
    }
    console.log("setup-and-reset.js: All required DOM elements for populatePlayerNamePlaceholders found.");

    const numOnField = parseInt(numOnFieldInput.value) || 0;
    const numGK = parseInt(numGoalkeepersInput.value) || 0;
    const numReservesVal = parseInt(numReservesInput.value) || 0;

    starterNamesContainer.innerHTML = '';
    let currentPlayerNumber = 1;

    if (numOnField > 0) {
        for (let i = 0; i < numOnField; i++) {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'player-name-input';
            let placeholderText = String(currentPlayerNumber++);
            if (numGK >= 1 && i < numGK) {
                placeholderText += "GK";
            }
            input.placeholder = placeholderText;
            starterNamesContainer.appendChild(input);
        }
    }

    reserveNamesContainer.innerHTML = '';
    if (numReservesVal > 0) {
        for (let i = 0; i < numReservesVal; i++) {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'player-name-input';
            input.placeholder = String(currentPlayerNumber++);
            reserveNamesContainer.appendChild(input);
        }
    }
    debugLog("Populated player name input fields. Starters created:", starterNamesContainer.children.length, "Reserves created:", reserveNamesContainer.children.length);
    console.log("setup-and-reset.js: populatePlayerNamePlaceholders() finished.");
}

function handleGetPreliminaryPlan() {
    // Use DOM object for element access (v4 compatibility)
    const minsPerPeriodInput = window.DOM?.minsPerPeriodInput || window.minsPerPeriodInput;
    const numOnFieldInput = window.DOM?.numOnFieldInput || window.numOnFieldInput;
    const numGoalkeepersInput = window.DOM?.numGoalkeepersInput || window.numGoalkeepersInput;
    const numReservesInput = window.DOM?.numReservesInput || window.numReservesInput;
    const subsPerChangeSelect = window.DOM?.subsPerChangeSelect || window.subsPerChangeSelect;
    const preliminaryPlanOutput = window.DOM?.preliminaryPlanOutput || window.preliminaryPlanOutput;
    const setupErrorP = window.DOM?.setupErrorP || window.setupErrorP;
    
    if (!minsPerPeriodInput || !numOnFieldInput || !numGoalkeepersInput || !numReservesInput || !subsPerChangeSelect || !preliminaryPlanOutput || !setupErrorP) {
        console.error("handleGetPreliminaryPlan: Missing crucial UI elements for plan generation.");
        if (setupErrorP) setupErrorP.textContent = "Error: Cannot generate plan, UI elements missing.";
        return;
    }
    setupErrorP.textContent = ''; 
    preliminaryPlanOutput.innerHTML = '<p><em>Calculating plan...</em></p>';

    try {
        const mins = parseInt(minsPerPeriodInput.value);
        const numOnF = parseInt(numOnFieldInput.value);
        const numGK = parseInt(numGoalkeepersInput.value);
        const numRes = parseInt(numReservesInput.value);
        const subsPC = parseInt(subsPerChangeSelect.value);
        const numPeriods = 2; 

        if(isNaN(mins)||mins<1){ preliminaryPlanOutput.innerHTML = '<p class="error-message">Minutes per half must be &ge; 1.</p>'; return; }
        if(isNaN(numOnF)||numOnF<1){ preliminaryPlanOutput.innerHTML = '<p class="error-message">Players on field must be &ge; 1.</p>'; return; }
        if(isNaN(numGK)||numGK<0||numGK>numOnF){ preliminaryPlanOutput.innerHTML = `<p class="error-message">Goalkeepers must be between 0 and ${numOnF} (total on field).</p>`; return; }
        if(isNaN(numRes)||numRes<0){ preliminaryPlanOutput.innerHTML = '<p class="error-message">Number of reserves must be &ge; 0.</p>'; return; }

        const numNonGkFieldSpots = numOnF - numGK;
        if(isNaN(subsPC)||subsPC<0|| (subsPC > 0 && subsPC > numNonGkFieldSpots && numNonGkFieldSpots > 0) ){
             preliminaryPlanOutput.innerHTML = `<p class="error-message">Subs per change must be between 0 and non-GK field spots (${numNonGkFieldSpots > 0 ? numNonGkFieldSpots : 'N/A'}).</p>`;
             return;
        }
        const totalPlayersForPlan = numOnF + numRes;
        if (numNonGkFieldSpots <= 0 && (totalPlayersForPlan - numGK > 0) && subsPC > 0) {
            preliminaryPlanOutput.innerHTML = '<p class="error-message">Cannot generate auto-sub plan if all field spots are GKs and non-GK players exist.</p>'; return;
        }
        if (subsPC > 0 && (totalPlayersForPlan - numGK) <= numNonGkFieldSpots) {
             preliminaryPlanOutput.innerHTML = '<p>Not enough non-GK players for rotation with these settings. All eligible non-GKs can be on field.</p>'; return;
        }

        const periodLengthSecondsForPlan = mins * 60;
        const fullGameDurationForPlan = periodLengthSecondsForPlan * numPeriods;

        if (subsPC === 0) {
            preliminaryPlanOutput.innerHTML = '<p>Automatic substitutions are disabled (0 subs per change). Manual subs only.</p>';
            return;
        }
        if (fullGameDurationForPlan <= 0) {
             preliminaryPlanOutput.innerHTML = '<p class="error-message">Game duration must be greater than 0.</p>'; return;
        }

        let dummyPlayersArray = [];
        for (let i = 0; i < totalPlayersForPlan; i++) {
            dummyPlayersArray.push(`Player${i + 1}`);
        }
        let dummyPlayerGKStatus = {};
        dummyPlayersArray.forEach((p, index) => {
            dummyPlayerGKStatus[p] = (index < numGK);
        });

        const { times: scheduleTimes, plan: schedulePlan } = calculateOptimalSubstitutionPattern(
            fullGameDurationForPlan,
            dummyPlayersArray,
            numOnF,
            subsPC,
            dummyPlayerGKStatus,
            numGK
        );

        if (scheduleTimes && scheduleTimes.length > 0) {
            let planHtml = `<h4>Preliminary Substitution Plan:</h4>`;
            planHtml += `<p>Based on ${mins} mins/half, ${numPeriods} halves. Total game: ${formatTime(fullGameDurationForPlan)}.</p>`;
            planHtml += `<p>~${scheduleTimes.length} automatic substitution break(s) planned for non-GKs.</p>`;
            planHtml += `<p>Target sub times (game time):</p><ul>`;
            scheduleTimes.forEach(time => {
                planHtml += `<li>${formatTime(time)}</li>`;
            });
            planHtml += `</ul>`;
            if (schedulePlan && schedulePlan.length > 0) {
                 planHtml += `<p class="small-note">Detail: First planned sub involves ~${schedulePlan[0].on.length} player(s) changing.</p>`;
            } else if (scheduleTimes.length > 0) {
                 planHtml += `<p class="small-note">Detail: Plan generated times, but specific player swaps depend on final player names and game state.</p>`;
            }
            planHtml += `<p class="small-note"><em>This is a preliminary plan. Actual substitutions depend on real-time game flow and final player setup.</em></p>`;
            preliminaryPlanOutput.innerHTML = planHtml;
        } else {
            preliminaryPlanOutput.innerHTML = '<h4>Preliminary Substitution Plan:</h4><p>No automatic substitution breaks could be planned with the current settings. This might be due to: not enough players for rotation, subs per change being zero, or insufficient game time for meaningful intervals.</p>';
        }
    } catch (e) {
        console.error("Error in handleGetPreliminaryPlan:", e);
        preliminaryPlanOutput.innerHTML = `<p class="error-message">Error generating plan: ${e.message}</p>`;
    }
}

function handleSetupConfirmation() {
    console.log("setup-and-reset.js: handleSetupConfirmation() called.");
    
    // Use DOM object for element access (v4 compatibility)
    const setupErrorP = window.DOM?.setupErrorP || window.setupErrorP;
    const minsPerPeriodInput = window.DOM?.minsPerPeriodInput || window.minsPerPeriodInput;
    const numOnFieldInput = window.DOM?.numOnFieldInput || window.numOnFieldInput;
    const numGoalkeepersInput = window.DOM?.numGoalkeepersInput || window.numGoalkeepersInput;
    const numReservesInput = window.DOM?.numReservesInput || window.numReservesInput;
    const subsPerChangeSelect = window.DOM?.subsPerChangeSelect || window.subsPerChangeSelect;
    const starterNamesContainer = window.DOM?.starterNamesContainer || window.starterNamesContainer;
    const reserveNamesContainer = window.DOM?.reserveNamesContainer || window.reserveNamesContainer;
    const warningSoundToggleInput = window.DOM?.warningSoundToggleInput || window.warningSoundToggleInput;
    const confirmSetupButton = window.DOM?.confirmSetupButton || window.confirmSetupButton;
    const preliminaryPlanOutput = window.DOM?.preliminaryPlanOutput || window.preliminaryPlanOutput;
    
    if (!setupErrorP || !minsPerPeriodInput || !numOnFieldInput || !numGoalkeepersInput || !numReservesInput ||
        !subsPerChangeSelect || !starterNamesContainer || !reserveNamesContainer || !warningSoundToggleInput || !confirmSetupButton) {
        console.error("setup-and-reset.js: Missing crucial UI elements in handleSetupConfirmation.");
        if (setupErrorP) setupErrorP.textContent = "Internal Error: Missing crucial setup UI elements.";
        return;
    }
    setupErrorP.textContent = '';
    if (preliminaryPlanOutput) preliminaryPlanOutput.innerHTML = ''; 
    if (confirmSetupButton.disabled) return;

    try {
        const mins = parseInt(minsPerPeriodInput.value);
        const numOnF = parseInt(numOnFieldInput.value); 
        const numGK = parseInt(numGoalkeepersInput.value); 
        const numRes = parseInt(numReservesInput.value); 
        const subsPC = parseInt(subsPerChangeSelect.value); 

        if(isNaN(mins)||mins<1)throw new Error("Minutes per half must be >= 1.");
        if(isNaN(numOnF)||numOnF<1) throw new Error("Players on field must be >= 1.");
        if(isNaN(numGK)||numGK<0||numGK>numOnF) throw new Error(`Number of Goalkeepers must be between 0 and ${numOnF} (total on field).`);
        if(isNaN(numRes)||numRes<0) throw new Error("Number of reserves must be >= 0.");

        const numNonGkFieldSpots=numOnF-numGK;
        if(isNaN(subsPC)||subsPC<0|| (subsPC > 0 && subsPC > numNonGkFieldSpots && numNonGkFieldSpots > 0) ) throw new Error(`Substitutions per change must be between 0 and non-GK field spots (${numNonGkFieldSpots > 0 ? numNonGkFieldSpots : 'N/A'}).`);

        const starterInputs = starterNamesContainer.querySelectorAll('input[type="text"]');
        const reserveInputs = reserveNamesContainer.querySelectorAll('input[type="text"]');

        const finalSNames = Array.from(starterInputs).map(input => (input.value.trim() || input.placeholder).trim());
        const finalRNames = Array.from(reserveInputs).map(input => (input.value.trim() || input.placeholder).trim());

        if(finalSNames.length!==numOnF)throw new Error(`Number of starter name inputs (${finalSNames.length}) must match 'Total Players on Field' (${numOnF}). Adjust settings or refresh if inputs are not appearing correctly.`);
        if(finalRNames.length!==numRes)throw new Error(`Number of reserve name inputs (${finalRNames.length}) must match 'Number of Reserves' (${numRes}). Adjust settings or refresh if inputs are not appearing correctly.`);

        finalSNames.forEach((name, i) => { if (!name) throw new Error(`Starter name ${i+1} cannot be empty.`); });
        finalRNames.forEach((name, i) => { if (!name) throw new Error(`Reserve name ${i+1} cannot be empty.`); });

        const allInputPlayers = [...finalSNames, ...finalRNames];
        if(new Set(allInputPlayers).size!==allInputPlayers.length)throw new Error("Duplicate player names are not allowed. Ensure all names (including defaults if not changed) are unique.");
        
        const estimatedNonGkInSquad = allInputPlayers.length - numGK; 
        if(subsPC > 0){
            if(numNonGkFieldSpots <= 0 && estimatedNonGkInSquad > 0 ) {
                 throw new Error(`Cannot enable auto-subs if all field spots are for Goalkeepers and non-GK players exist in squad.`);
            }
            const numNonGkOnBenchActual = Math.max(0, estimatedNonGkInSquad - numNonGkFieldSpots);
            if(subsPC > numNonGkOnBenchActual && numNonGkOnBenchActual > 0 && numNonGkFieldSpots > 0) {
                debugLog(`Warning: Subs per change (${subsPC}) is greater than actual available non-GK reserves (${numNonGkOnBenchActual}). Effective subs will be limited.`);
            }
        }

        gameSettings={minsPerPeriod:mins,numOnField:numOnF,numGoalkeepers:numGK,numReserves:numRes,subsPerChange:subsPC,numPeriods:2};
        allPlayers=allInputPlayers;starters=finalSNames;reserves=finalRNames;onField=[...finalSNames];removedPlayers=[];
        playerGKStatus={};playerRemovedStatus={};playerPlayTimes={};playerBenchTimes={};playerCurrentStintStart={};

        allPlayers.forEach(p=>{playerGKStatus[p]=false;playerRemovedStatus[p]=false;playerPlayTimes[p]=0;playerBenchTimes[p]=0;playerCurrentStintStart[p]=starters.includes(p)?0:null;});

        if(gameSettings.numGoalkeepers > 0 && starters.length > 0) {
            for (let i = 0; i < gameSettings.numGoalkeepers; i++) {
                if (starters[i]) {
                    playerGKStatus[starters[i]] = true;
                    debugLog(`Assigned ${starters[i]} as initial Goalkeeper.`);
                } else {
                    debugLog(`Warning: Tried to assign GK to starter index ${i}, but not enough starter names found.`);
                }
            }
        }

        isWarningSoundEnabled = warningSoundToggleInput.checked;
        // Preload sounds here, after user confirms setup and sound preference is known
        if (isWarningSoundEnabled) {
            if (!warningBeepSound) {
                try { warningBeepSound = new Audio('beep-warning.wav'); debugLog("Warning beep preloaded on setup confirm."); }
                catch (e) { console.error("Audio for warning sound failed on setup confirm:", e); warningBeepSound = null; }
            }
            if (!startingWhistleSound) {
                try { startingWhistleSound = new Audio('startingwhistle.wav'); debugLog("Starting whistle preloaded on setup confirm."); }
                catch (e) { console.error("Audio for starting whistle failed on setup confirm:", e); startingWhistleSound = null; }
            }
        } else { // If sound disabled, ensure they are nulled in case they were preloaded on reset
            warningBeepSound = null;
            startingWhistleSound = null;
        }


        if(warningSoundToggleInput) warningSoundToggleInput.disabled = true;
        if(warningSoundToggleContainer) warningSoundToggleContainer.classList.add('hidden');

        onBench=allPlayers.filter(p=>!onField.includes(p)&&!playerGKStatus[p]&&!playerRemovedStatus[p]);sortOnBenchQueue();
        periodLengthSeconds=mins*60;currentGameSeconds=0;periodElapsedSeconds=0;currentPeriod=1;isRunning=false;subIsPending=false;
        pendingOutPlayers=[];pendingInPlayers=[];pendingSubTriggerTime=null;isModalOpen=false;isHalftimeScreenActive=false;
        if(endOfPeriodActionsContainer) endOfPeriodActionsContainer.classList.add('hidden');
        if(proceedToHalftimeButton) proceedToHalftimeButton.classList.add('hidden');

        if(subsPC>0){
            const fullGameDurationForPlan = periodLengthSeconds * gameSettings.numPeriods;
            const {times: scheduleTimes, plan: schedulePlan} = calculateOptimalSubstitutionPattern(
                fullGameDurationForPlan,
                allPlayers,
                gameSettings.numOnField,
                gameSettings.subsPerChange,
                playerGKStatus,
                gameSettings.numGoalkeepers
            );
            optimizedSubSchedule=scheduleTimes||[];
            optimizedSubPlan=schedulePlan||[];
        }else{
            optimizedSubSchedule=[];optimizedSubPlan=[];
        }
        recalculateRemainingAutoSubTimes();

        if(setupDiv)setupDiv.classList.add('hidden');if(gameContainerDiv)gameContainerDiv.classList.remove('hidden');
        if(halftimeScreenDiv)halftimeScreenDiv.classList.add('hidden');
        if(nextSubBox)nextSubBox.classList.remove('hidden');
        if(playerLists)playerLists.classList.remove('hidden'); if(gameControls)gameControls.classList.remove('hidden');
        if(confirmSetupButton)confirmSetupButton.classList.add('hidden');
        if(getPlanButton) getPlanButton.disabled = true;

        const mainGameResetButton = document.querySelector('#game-controls #resetButton');
        if (mainGameResetButton) mainGameResetButton.disabled = false;

        debugLog("Setup complete.",{gameSettings,allPlayersCount:allPlayers.length, initialOptimizedSchedule: optimizedSubSchedule.map(formatTime)});
        updateDisplay();
        console.log("setup-and-reset.js: handleSetupConfirmation() finished successfully.");

    }catch(e){
        if(setupErrorP)setupErrorP.textContent=e.message||"Unknown setup error.";
        if(confirmSetupButton)confirmSetupButton.disabled=false;
        if(getPlanButton)getPlanButton.disabled = false;
        if(warningSoundToggleInput)warningSoundToggleInput.disabled=false;
        if(warningSoundToggleContainer && warningSoundToggleContainer.classList.contains('hidden')) warningSoundToggleContainer.classList.remove('hidden');
        console.error("Setup Error in handleSetupConfirmation:",e);
    }
}
// --- END OF FILE setup-and-reset.js ---