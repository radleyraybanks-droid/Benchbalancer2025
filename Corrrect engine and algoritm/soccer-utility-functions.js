// --- Debug Logging Function ---
function debugLog(...args) {
    if (DEBUG_MODE) {
        console.log('[GameChangerDebug]', ...args);
    }
}

// --- Helper Functions ---
function formatTime(totalSeconds) {
    if (isNaN(totalSeconds) || totalSeconds === Infinity || totalSeconds < 0) return "--:--";
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function clearStatusMessage() {
    if (statusTimeoutId) clearTimeout(statusTimeoutId);
    if (statusMessageP) statusMessageP.textContent = '';
}

function showStatusMessage(message, durationMs = 3000) {
    clearStatusMessage();
    if (statusMessageP) statusMessageP.textContent = message;
    if (durationMs > 0) {
        statusTimeoutId = setTimeout(() => { if (statusMessageP && statusMessageP.textContent === message) statusMessageP.textContent = ''; }, durationMs);
    }
}

function getEligiblePlayers(playerList) {
    return playerList.filter(player => !playerGKStatus[player] && !playerRemovedStatus[player]);
}

function getNonGKPlayersOnField() {
    return onField.filter(player => !playerGKStatus[player]);
}

function sortOnBenchQueue() {
    onBench.sort((a, b) => {
        const timeA = playerPlayTimes[a] || 0;
        const timeB = playerPlayTimes[b] || 0;
        if (timeA !== timeB) return timeA - timeB;
        return a.localeCompare(b); // Alphabetical tie-breaker
    });
}