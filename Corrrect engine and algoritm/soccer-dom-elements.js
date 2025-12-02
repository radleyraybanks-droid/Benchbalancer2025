// --- START OF FILE dom-elements.js ---

// Define all DOM element variables (these will be assigned in initializeDOMElements)
let setupDiv, confirmSetupButton, setupErrorP, minsPerPeriodInput, numOnFieldInput,
    numGoalkeepersInput, numReservesInput, subsPerChangeSelect, warningSoundToggleInput,
    warningSoundToggleContainer, starterNamesContainer, reserveNamesContainer,
    gameContainerDiv, gameTimerP, periodTimerP, periodDisplayP, nextSubCountdownP,
    nextSubInfoP, pendingSubInfoP, nextSubBox, playerLists, gameControls,
    onFieldListUl, onBenchListUl, onFieldCountSpan, onBenchCountSpan,
    startStopButton, confirmSubButton, emergencySubButton, manageGKButton,
    statusMessageP, emergencySubModal, subOutPlayerSelect,
    subInPlayerSelect, injuredFateRadios, confirmEmergencySubButton,
    cancelEmergencySubButton, emergencySubErrorP, manageGKModal, gkPlayerListDiv,
    confirmManageGKButton, cancelManageGKButton, manageGKErrorP,
    playersComingOffDiv, playersComingOnDiv, halftimeScreenDiv,
    stopHalftimeMusicButton, resumeHalftimeMusicButton, prepareSecondHalfButton,
    proceedToHalftimeButton, endOfPeriodActionsContainer,
    // New elements for preliminary plan
    getPlanButton, preliminaryPlanOutput;


function initializeDOMElements() {
    console.log("dom-elements.js: DOMContentLoaded fired. Initializing DOM element variables...");
    // Assign all elements
    setupDiv = document.getElementById('setup');
    confirmSetupButton = document.getElementById('confirmSetupButton');
    setupErrorP = document.getElementById('setupError');
    minsPerPeriodInput = document.getElementById('minsPerPeriod');
    numOnFieldInput = document.getElementById('numOnField');
    numGoalkeepersInput = document.getElementById('numGoalkeepers');
    numReservesInput = document.getElementById('numReserves');
    subsPerChangeSelect = document.getElementById('subsPerChange');
    warningSoundToggleInput = document.getElementById('warningSoundToggle');
    warningSoundToggleContainer = document.getElementById('warningSoundToggleContainer');
    starterNamesContainer = document.getElementById('starterNamesContainer');
    reserveNamesContainer = document.getElementById('reserveNamesContainer');
    gameContainerDiv = document.getElementById('game-container');
    gameTimerP = document.getElementById('gameTimer');
    periodTimerP = document.getElementById('periodTimer');
    periodDisplayP = document.getElementById('periodDisplay');
    nextSubCountdownP = document.getElementById('nextSubCountdown');
    nextSubInfoP = document.getElementById('nextSubInfo');
    pendingSubInfoP = document.getElementById('pendingSubInfo');
    nextSubBox = document.getElementById('nextSubBox');
    playerLists = document.getElementById('player-lists');
    gameControls = document.getElementById('game-controls');
    onFieldListUl = document.getElementById('onFieldList');
    onBenchListUl = document.getElementById('onBenchList');
    onFieldCountSpan = document.getElementById('onFieldCount');
    onBenchCountSpan = document.getElementById('onBenchCount');
    startStopButton = document.getElementById('startStopButton');
    confirmSubButton = document.getElementById('confirmSubButton');
    emergencySubButton = document.getElementById('emergencySubButton');
    manageGKButton = document.getElementById('manageGKButton');
    statusMessageP = document.getElementById('statusMessage');
    emergencySubModal = document.getElementById('emergencySubModal');
    subOutPlayerSelect = document.getElementById('subOutPlayer');
    subInPlayerSelect = document.getElementById('subInPlayer');
    injuredFateRadios = document.getElementsByName('injuredFate');
    confirmEmergencySubButton = document.getElementById('confirmEmergencySubButton');
    cancelEmergencySubButton = document.getElementById('cancelEmergencySubButton');
    emergencySubErrorP = document.getElementById('emergencySubError');
    manageGKModal = document.getElementById('manageGKModal');
    gkPlayerListDiv = document.getElementById('gkPlayerList');
    confirmManageGKButton = document.getElementById('confirmManageGKButton');
    cancelManageGKButton = document.getElementById('cancelManageGKButton');
    manageGKErrorP = document.getElementById('manageGKError');
    playersComingOffDiv = document.getElementById('playersComingOff');
    playersComingOnDiv = document.getElementById('playersComingOn');
    halftimeScreenDiv = document.getElementById('halftimeScreen');
    stopHalftimeMusicButton = document.getElementById('stopHalftimeMusicButton');
    resumeHalftimeMusicButton = document.getElementById('resumeHalftimeMusicButton');
    prepareSecondHalfButton = document.getElementById('prepareSecondHalfButton');
    proceedToHalftimeButton = document.getElementById('proceedToHalftimeButton');
    endOfPeriodActionsContainer = document.getElementById('endOfPeriodActionsContainer');
    // New elements for preliminary plan
    getPlanButton = document.getElementById('getPlanButton');
    preliminaryPlanOutput = document.getElementById('preliminaryPlanOutput');


    // More comprehensive check for elements critical to setup AND player name population
    const elementsToVerify = {
        setupDiv: {el: setupDiv, id: 'setup'},
        confirmSetupButton: {el: confirmSetupButton, id: 'confirmSetupButton'},
        setupErrorP: {el: setupErrorP, id: 'setupError'},
        minsPerPeriodInput: {el: minsPerPeriodInput, id: 'minsPerPeriod'},
        numOnFieldInput: {el: numOnFieldInput, id: 'numOnField'},
        numGoalkeepersInput: {el: numGoalkeepersInput, id: 'numGoalkeepers'},
        numReservesInput: {el: numReservesInput, id: 'numReserves'},
        subsPerChangeSelect: {el: subsPerChangeSelect, id: 'subsPerChange'},
        warningSoundToggleInput: {el: warningSoundToggleInput, id: 'warningSoundToggle'},
        starterNamesContainer: {el: starterNamesContainer, id: 'starterNamesContainer'},
        reserveNamesContainer: {el: reserveNamesContainer, id: 'reserveNamesContainer'},
        // New elements
        getPlanButton: {el: getPlanButton, id: 'getPlanButton'},
        preliminaryPlanOutput: {el: preliminaryPlanOutput, id: 'preliminaryPlanOutput'}
    };

    let firstMissingElementKey = null;
    for (const key in elementsToVerify) {
        if (!elementsToVerify[key].el) {
            firstMissingElementKey = key;
            console.error(`dom-elements.js: CRITICAL - DOM element variable '${key}' (expected ID: '${elementsToVerify[key].id}') is null after getElementById.`);
            break;
        }
    }

    if (firstMissingElementKey) {
        const errorDisplayElement = document.getElementById('setupError');
        const errorMessage = `Initialization Error: A crucial UI element ('${elementsToVerify[firstMissingElementKey].id}') could not be found. Please refresh. (CODE: DE-CRITICAL-${firstMissingElementKey.toUpperCase()})`;
        if (errorDisplayElement) {
            errorDisplayElement.textContent = errorMessage;
            if (setupDiv && setupDiv.classList.contains('hidden')) {
                setupDiv.classList.remove('hidden');
            }
            if (gameContainerDiv && !gameContainerDiv.classList.contains('hidden')) {
                gameContainerDiv.classList.add('hidden');
            }
        } else {
            alert(errorMessage);
        }
        const confirmBtn = document.getElementById('confirmSetupButton');
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = "Setup Error";
        }
        return;
    }

    console.log("dom-elements.js: All checked DOM element variables initialized successfully.");

    if (typeof initializeEventListeners === "function") {
        console.log("dom-elements.js: Calling initializeEventListeners().");
        initializeEventListeners();
    } else {
        console.error("dom-elements.js: initializeEventListeners function is not defined when trying to call it.");
        if (setupErrorP) setupErrorP.textContent = "Error: App components failed to load correctly (E2).";
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDOMElements);
} else {
    console.log("dom-elements.js: DOM was already loaded, calling initializeDOMElements directly.");
    initializeDOMElements();
}
// --- END OF FILE dom-elements.js ---