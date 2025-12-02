// --- START OF FILE dom-elements.js ---

// Create a centralized DOM elements object  
const DOM = {};

function initializeDOMElements() {
    console.log("dom-elements.js: DOMContentLoaded fired. Initializing DOM element variables...");
    
    // Assign all elements to the DOM object
    DOM.setupDiv = document.getElementById('setup');
    DOM.confirmSetupButton = document.getElementById('confirmSetupButton');
    DOM.setupErrorP = document.getElementById('setupError');
    DOM.minsPerPeriodInput = document.getElementById('minsPerPeriod');
    DOM.numOnFieldInput = document.getElementById('numOnField');
    DOM.numGoalkeepersInput = document.getElementById('numGoalkeepers');
    DOM.numReservesInput = document.getElementById('numReserves');
    DOM.subsPerChangeSelect = document.getElementById('subsPerChange');
    DOM.warningSoundToggleInput = document.getElementById('warningSoundToggle');
    DOM.warningSoundToggleContainer = document.getElementById('warningSoundToggleContainer');
    DOM.starterNamesContainer = document.getElementById('starterNamesContainer');
    DOM.reserveNamesContainer = document.getElementById('reserveNamesContainer');
    DOM.gameContainerDiv = document.getElementById('game-container');
    DOM.gameTimerP = document.getElementById('gameTimer');
    DOM.periodTimerP = document.getElementById('periodTimer');
    DOM.periodDisplayP = document.getElementById('periodDisplay');
    DOM.nextSubCountdownP = document.getElementById('nextSubCountdown');
    DOM.nextSubInfoP = document.getElementById('nextSubInfo');
    DOM.pendingSubInfoP = document.getElementById('pendingSubInfo');
    DOM.nextSubBox = document.getElementById('nextSubBox');
    DOM.playerLists = document.getElementById('player-lists');
    DOM.gameControls = document.getElementById('game-controls');
    DOM.onFieldListUl = document.getElementById('onFieldList');
    DOM.onBenchListUl = document.getElementById('onBenchList');
    DOM.onFieldCountSpan = document.getElementById('onFieldCount');
    DOM.onBenchCountSpan = document.getElementById('onBenchCount');
    DOM.startStopButton = document.getElementById('startStopButton');
    DOM.confirmSubButton = document.getElementById('confirmSubButton');
    DOM.emergencySubButton = document.getElementById('emergencySubButton');
    DOM.manageGKButton = document.getElementById('manageGKButton');
    DOM.statusMessageP = document.getElementById('statusMessage');
    DOM.emergencySubModal = document.getElementById('emergencySubModal');
    DOM.subOutPlayerSelect = document.getElementById('subOutPlayer');
    DOM.subInPlayerSelect = document.getElementById('subInPlayer');
    DOM.injuredFateRadios = document.getElementsByName('injuredFate');
    DOM.confirmEmergencySubButton = document.getElementById('confirmEmergencySubButton');
    DOM.cancelEmergencySubButton = document.getElementById('cancelEmergencySubButton');
    DOM.emergencySubErrorP = document.getElementById('emergencySubError');
    DOM.manageGKModal = document.getElementById('manageGKModal');
    DOM.gkPlayerListDiv = document.getElementById('gkPlayerList');
    DOM.confirmManageGKButton = document.getElementById('confirmManageGKButton');
    DOM.cancelManageGKButton = document.getElementById('cancelManageGKButton');
    DOM.manageGKErrorP = document.getElementById('manageGKError');
    DOM.playersComingOffDiv = document.getElementById('playersComingOff');
    DOM.playersComingOnDiv = document.getElementById('playersComingOn');
    DOM.halftimeScreenDiv = document.getElementById('halftimeScreen');
    DOM.stopHalftimeMusicButton = document.getElementById('stopHalftimeMusicButton');
    DOM.resumeHalftimeMusicButton = document.getElementById('resumeHalftimeMusicButton');
    DOM.prepareSecondHalfButton = document.getElementById('prepareSecondHalfButton');
    DOM.proceedToHalftimeButton = document.getElementById('proceedToHalftimeButton');
    DOM.endOfPeriodActionsContainer = document.getElementById('endOfPeriodActionsContainer');
    // New elements for preliminary plan
    DOM.getPlanButton = document.getElementById('getPlanButton');
    DOM.preliminaryPlanOutput = document.getElementById('preliminaryPlanOutput');

    // Legacy compatibility - expose individual variables for backwards compatibility
    Object.assign(globalThis, DOM);

    // More comprehensive check for elements critical to setup AND player name population
    const elementsToVerify = {
        setupDiv: {el: DOM.setupDiv, id: 'setup'},
        confirmSetupButton: {el: DOM.confirmSetupButton, id: 'confirmSetupButton'},
        setupErrorP: {el: DOM.setupErrorP, id: 'setupError'},
        minsPerPeriodInput: {el: DOM.minsPerPeriodInput, id: 'minsPerPeriod'},
        numOnFieldInput: {el: DOM.numOnFieldInput, id: 'numOnField'},
        numGoalkeepersInput: {el: DOM.numGoalkeepersInput, id: 'numGoalkeepers'},
        numReservesInput: {el: DOM.numReservesInput, id: 'numReserves'},
        subsPerChangeSelect: {el: DOM.subsPerChangeSelect, id: 'subsPerChange'},
        warningSoundToggleInput: {el: DOM.warningSoundToggleInput, id: 'warningSoundToggle'},
        starterNamesContainer: {el: DOM.starterNamesContainer, id: 'starterNamesContainer'},
        reserveNamesContainer: {el: DOM.reserveNamesContainer, id: 'reserveNamesContainer'},
        // New elements
        getPlanButton: {el: DOM.getPlanButton, id: 'getPlanButton'},
        preliminaryPlanOutput: {el: DOM.preliminaryPlanOutput, id: 'preliminaryPlanOutput'}
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
    // Signal to legacy scripts that DOM elements are ready
    document.dispatchEvent(new CustomEvent('dom-elements-initialized'));
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDOMElements);
} else {
    console.log("dom-elements.js: DOM was already loaded, calling initializeDOMElements directly.");
    initializeDOMElements();
}
// --- END OF FILE dom-elements.js ---