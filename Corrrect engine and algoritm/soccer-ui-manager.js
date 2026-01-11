/**
 * soccer-ui-manager.js
 * Central UI coordination and initialization for Soccer.
 * Includes 3D field player rendering for visual balance.
 */

console.log("soccer-ui-manager.js: Loading...");

// Field player rendering configuration
const FIELD_POSITIONS = {
    // Balanced grid layout for different team sizes
    // Format: { top: %, left: % }

    // Goalkeeper always at bottom center
    gk: { top: 92, left: 50 },

    // Outfield player positions based on count (excluding GK)
    positions: {
        1: [{ top: 60, left: 50 }],
        2: [{ top: 60, left: 35 }, { top: 60, left: 65 }],
        3: [{ top: 40, left: 50 }, { top: 65, left: 30 }, { top: 65, left: 70 }],
        4: [{ top: 35, left: 35 }, { top: 35, left: 65 }, { top: 65, left: 30 }, { top: 65, left: 70 }],
        5: [{ top: 30, left: 50 }, { top: 50, left: 25 }, { top: 50, left: 75 }, { top: 70, left: 35 }, { top: 70, left: 65 }],
        6: [{ top: 25, left: 35 }, { top: 25, left: 65 }, { top: 50, left: 25 }, { top: 50, left: 75 }, { top: 70, left: 35 }, { top: 70, left: 65 }],
        7: [{ top: 20, left: 50 }, { top: 40, left: 25 }, { top: 40, left: 50 }, { top: 40, left: 75 }, { top: 68, left: 30 }, { top: 68, left: 50 }, { top: 68, left: 70 }],
        8: [{ top: 18, left: 35 }, { top: 18, left: 65 }, { top: 42, left: 25 }, { top: 42, left: 50 }, { top: 42, left: 75 }, { top: 68, left: 30 }, { top: 68, left: 50 }, { top: 68, left: 70 }],
        9: [{ top: 15, left: 35 }, { top: 15, left: 65 }, { top: 38, left: 20 }, { top: 38, left: 50 }, { top: 38, left: 80 }, { top: 62, left: 25 }, { top: 62, left: 50 }, { top: 62, left: 75 }, { top: 78, left: 50 }],
        10: [{ top: 12, left: 35 }, { top: 12, left: 65 }, { top: 32, left: 20 }, { top: 32, left: 50 }, { top: 32, left: 80 }, { top: 55, left: 25 }, { top: 55, left: 50 }, { top: 55, left: 75 }, { top: 75, left: 35 }, { top: 75, left: 65 }]
    },

    // Position labels
    getPositionLabel: function (index, totalOutfield, isGK) {
        if (isGK) return 'GK';
        if (totalOutfield <= 3) return ['FW', 'MF', 'DF'][index] || 'FW';
        if (totalOutfield <= 5) return ['FW', 'MF', 'MF', 'DF', 'DF'][index] || 'FW';
        if (totalOutfield <= 7) return ['FW', 'FW', 'MF', 'MF', 'MF', 'DF', 'DF'][index] || 'FW';
        return ['FW', 'FW', 'MF', 'MF', 'MF', 'MF', 'DF', 'DF', 'DF', 'DF'][index] || 'FW';
    }
};

/**
 * Render players on the 3D soccer field
 */
function renderFieldPlayers() {
    const fieldPlayersContainer = document.getElementById('fieldPlayers');
    if (!fieldPlayersContainer) {
        console.warn('soccer-ui-manager: #fieldPlayers container not found');
        return;
    }

    // Get players on field
    if (typeof onField === 'undefined' || !Array.isArray(onField)) {
        fieldPlayersContainer.innerHTML = '';
        return;
    }

    // Separate GK and outfield players
    const gkPlayers = onField.filter(p => playerGKStatus && playerGKStatus[p]);
    const outfieldPlayers = onField.filter(p => !playerGKStatus || !playerGKStatus[p]);

    fieldPlayersContainer.innerHTML = '';

    // Get position set for outfield count
    const outfieldCount = outfieldPlayers.length;
    const positionSet = FIELD_POSITIONS.positions[Math.min(outfieldCount, 10)] || FIELD_POSITIONS.positions[10];

    // Render goalkeeper(s)
    gkPlayers.forEach((player, idx) => {
        const pos = FIELD_POSITIONS.gk;
        const element = createPlayerElement(player, pos, 'GK', true);
        fieldPlayersContainer.appendChild(element);
    });

    // Render outfield players
    outfieldPlayers.forEach((player, idx) => {
        const pos = positionSet[idx] || { top: 50, left: 50 };
        const label = FIELD_POSITIONS.getPositionLabel(idx, outfieldCount, false);
        const element = createPlayerElement(player, pos, label, false);
        fieldPlayersContainer.appendChild(element);
    });
}

/**
 * Create a player element for the 3D field
 */
function createPlayerElement(playerName, position, posLabel, isGK) {
    const div = document.createElement('div');
    div.className = 'player-position';
    div.style.top = `${position.top}%`;
    div.style.left = `${position.left}%`;
    div.dataset.player = playerName;

    // Get player stats
    const playTime = (typeof playerPlayTimes !== 'undefined' && playerPlayTimes[playerName]) ? playerPlayTimes[playerName] : 0;
    const goals = (typeof scoringState !== 'undefined' && scoringState.playerPoints && scoringState.playerPoints[playerName]) ? scoringState.playerPoints[playerName] : 0;

    // Format time
    const formatFieldTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Truncate long names
    const displayName = playerName.length > 10 ? playerName.substring(0, 9) + '…' : playerName;

    div.innerHTML = `
        <span class="player-name-top">${displayName}</span>
        <div class="player-icon">
            <div class="player-silhouette ${isGK ? 'gk-silhouette' : ''}"></div>
            <div class="soccer-ball"></div>
        </div>
        <div class="player-position-label">${posLabel}</div>
        <div class="player-stats-row">
            <span class="stat-badge">${formatFieldTime(playTime)}</span>
            ${goals > 0 ? `<span class="stat-badge goals-badge">⚽${goals}</span>` : ''}
        </div>
    `;

    return div;
}

/**
 * Initialize field rendering - hook into updateDisplay
 */
function initFieldRendering() {
    // Store original updateDisplay
    const originalUpdateDisplay = window.updateDisplay;

    // Wrap with field rendering
    window.updateDisplay = function () {
        if (typeof originalUpdateDisplay === 'function') {
            originalUpdateDisplay();
        }
        renderFieldPlayers();
    };

    console.log("soccer-ui-manager.js: Field rendering initialized");
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("soccer-ui-manager.js: DOMContentLoaded - Initializing...");

    // Preload Sounds
    preloadSounds();

    // Initialize field rendering
    setTimeout(initFieldRendering, 100); // Small delay to ensure other scripts loaded
});

function preloadSounds() {
    console.log("soccer-ui-manager.js: Preloading sounds...");

    // Starting Whistle
    if (!startingWhistleSound) {
        try {
            startingWhistleSound = new Audio('startingwhistle.wav');
            startingWhistleSound.load(); // Force load
            console.log("soccer-ui-manager.js: startingWhistleSound created.");
        } catch (e) {
            console.error("soccer-ui-manager.js: Failed to init startingWhistleSound:", e);
        }
    }

    // Warning Beep
    if (!warningBeepSound) {
        try {
            warningBeepSound = new Audio('beep-warning.wav');
            warningBeepSound.load(); // Force load
            console.log("soccer-ui-manager.js: warningBeepSound created.");
        } catch (e) {
            console.error("soccer-ui-manager.js: Failed to init warningBeepSound:", e);
        }
    }
}

// Ensure functions are available globally if needed
window.preloadSounds = preloadSounds;
window.renderFieldPlayers = renderFieldPlayers;
