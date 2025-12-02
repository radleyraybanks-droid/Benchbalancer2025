// --- missing-functions.js ---
// This file contains functions that were referenced but not defined in the codebase

/**
 * Try to use the Dynamic Perfect Substitution Plan algorithm
 * This is a wrapper function for the dynamic perfect balance algorithm
 */
function tryDynamicPerfectSubstitutionPlan(
    durationForThisPlanSegment,
    activePlayersListOverride,
    gamePlayersOnFieldOverride,
    subsPerChangeOverride,
    gkStatusOverride,
    numGkOnFieldOverride
) {
    try {
        const activePlayersToUse = activePlayersListOverride || allPlayers.filter(p => !playerRemovedStatus[p]);
        const gamePlayersOnFieldToUse = gamePlayersOnFieldOverride !== null ? gamePlayersOnFieldOverride : gameSettings.numOnField;
        const subsPerChangeToUse = subsPerChangeOverride !== null ? subsPerChangeOverride : gameSettings.subsPerChange;
        
        // Filter out goalkeepers if needed
        const rotatingPlayers = gkStatusOverride 
            ? activePlayersToUse.filter(p => !gkStatusOverride[p])
            : activePlayersToUse.filter(p => !playerGKStatus[p]);
        
        const result = calculateDynamicPerfectPlan({
            totalGameSeconds: durationForThisPlanSegment,
            rotatingPlayers: rotatingPlayers,
            playersOnCourt: gamePlayersOnFieldToUse - (numGkOnFieldOverride || gameSettings.numGoalkeepers),
            maxSubsPerChange: subsPerChangeToUse,
            exemptPlayers: [],
            currentGameState: null
        });
        
        if (result && result.substitutionPlan) {
            // Convert to expected format
            const times = result.substitutionPlan.map(sub => sub.time);
            const plan = result.substitutionPlan.map(sub => ({
                time: sub.time,
                off: sub.playersOff,
                on: sub.playersOn
            }));
            
            return {
                finalSubTimes: times,
                times: times,
                plan: plan,
                verification: result.verification,
                algorithm: result.algorithm
            };
        }
        
        return null;
    } catch (error) {
        debugLog('Error in tryDynamicPerfectSubstitutionPlan:', error);
        return null;
    }
}

/**
 * Generate even more fair lineups using JavaScript
 * Fallback function for when the dynamic perfect algorithm needs a heuristic
 */
function generateEvenMoreFairLineupsJS(players, playersOnCourt, maxSubsPerChange) {
    debugLog('Generating fair lineups using heuristic algorithm');
    
    const lineups = [];
    const playerTimes = {};
    players.forEach(p => playerTimes[p] = 0);
    
    // Calculate ideal number of lineups
    const totalPlayers = players.length;
    const benchPlayers = totalPlayers - playersOnCourt;
    
    if (benchPlayers <= 0) {
        // All players can be on court at once
        return { lineups: [players.slice(0, playersOnCourt)] };
    }
    
    // Calculate minimum number of rotations needed for balance
    const minRotations = Math.ceil(totalPlayers / maxSubsPerChange);
    const idealLineups = Math.max(minRotations + 1, Math.ceil(totalPlayers * 2 / playersOnCourt));
    
    // Generate lineups using round-robin approach
    for (let i = 0; i < idealLineups; i++) {
        // Sort players by current playing time (ascending)
        const sortedPlayers = [...players].sort((a, b) => {
            const timeA = playerTimes[a] || 0;
            const timeB = playerTimes[b] || 0;
            return timeA - timeB;
        });
        
        // Select players with least playing time
        const lineup = sortedPlayers.slice(0, playersOnCourt);
        lineups.push(lineup);
        
        // Update playing times (assuming equal stint duration)
        lineup.forEach(player => {
            playerTimes[player] = (playerTimes[player] || 0) + 1;
        });
    }
    
    return { lineups: lineups };
}

/**
 * Calculate current playing times for all players
 */
function calculateCurrentPlayingTimes(currentGameState) {
    const playerTimes = {};
    const allRotatingPlayers = [...(currentGameState.currentPlayersOnCourt || []), 
                                ...(currentGameState.currentPlayersOnBench || [])];
    
    allRotatingPlayers.forEach(player => {
        playerTimes[player] = currentGameState.playerPlayTimes?.[player] || 0;
    });
    
    // Calculate variance
    const times = Object.values(playerTimes);
    const minTime = times.length > 0 ? Math.min(...times) : 0;
    const maxTime = times.length > 0 ? Math.max(...times) : 0;
    const variance = maxTime - minTime;
    
    return {
        playerTimes: playerTimes,
        minTime: minTime,
        maxTime: maxTime,
        projectedVariance: variance
    };
}

/**
 * Simulate what would happen if a substitution is made
 */
function simulateSubstitutionOutcome(coachIntent, currentGameState) {
    const { requestedSubsCount, preferredPlayersOff = [], preferredPlayersOn = [] } = coachIntent;
    const { currentPlayersOnCourt = [], currentPlayersOnBench = [], playerPlayTimes = {} } = currentGameState;
    
    // Simulate the substitution
    const newOnCourt = [...currentPlayersOnCourt];
    const newOnBench = [...currentPlayersOnBench];
    
    preferredPlayersOff.forEach(player => {
        const index = newOnCourt.indexOf(player);
        if (index > -1) {
            newOnCourt.splice(index, 1);
            newOnBench.push(player);
        }
    });
    
    preferredPlayersOn.forEach(player => {
        const index = newOnBench.indexOf(player);
        if (index > -1) {
            newOnBench.splice(index, 1);
            newOnCourt.push(player);
        }
    });
    
    // Calculate projected variance after this substitution
    const remainingTime = currentGameState.totalGameSeconds - currentGameState.currentGameSeconds;
    const timePerStint = remainingTime / 2; // Simplified projection
    
    const projectedTimes = {};
    [...newOnCourt, ...newOnBench].forEach(player => {
        projectedTimes[player] = playerPlayTimes[player] || 0;
        if (newOnCourt.includes(player)) {
            projectedTimes[player] += timePerStint;
        }
    });
    
    const times = Object.values(projectedTimes);
    const projectedVariance = times.length > 0 ? Math.max(...times) - Math.min(...times) : 0;
    
    return {
        projectedVariance: projectedVariance,
        newOnCourt: newOnCourt,
        newOnBench: newOnBench
    };
}

/**
 * Generate an optimal substitution for the current game state
 */
function generateOptimalSubstitution(currentGameState, subsCount) {
    const { currentPlayersOnCourt = [], currentPlayersOnBench = [], playerPlayTimes = {} } = currentGameState;
    
    if (currentPlayersOnBench.length === 0 || currentPlayersOnCourt.length === 0) {
        return { isValid: false };
    }
    
    // Sort bench players by playing time (ascending)
    const sortedBench = [...currentPlayersOnBench].sort((a, b) => {
        const timeA = playerPlayTimes[a] || 0;
        const timeB = playerPlayTimes[b] || 0;
        return timeA - timeB;
    });
    
    // Sort court players by playing time (descending)
    const sortedCourt = [...currentPlayersOnCourt].sort((a, b) => {
        const timeA = playerPlayTimes[a] || 0;
        const timeB = playerPlayTimes[b] || 0;
        return timeB - timeA;
    });
    
    // Select players to substitute
    const actualSubsCount = Math.min(subsCount, sortedBench.length, sortedCourt.length);
    const playersOff = sortedCourt.slice(0, actualSubsCount);
    const playersOn = sortedBench.slice(0, actualSubsCount);
    
    // Simulate outcome
    const simulatedOutcome = simulateSubstitutionOutcome({
        requestedSubsCount: actualSubsCount,
        preferredPlayersOff: playersOff,
        preferredPlayersOn: playersOn
    }, currentGameState);
    
    return {
        isValid: true,
        playersOff: playersOff,
        playersOn: playersOn,
        projectedVariance: simulatedOutcome.projectedVariance
    };
}

/**
 * Calculate optimal lineups for substitution pattern
 */
function calculateOptimalLineups(players, spotsOnField, subsPerChange) {
    if (players.length <= spotsOnField) {
        return { lineups: [players], numLineups: 1 };
    }
    
    const result = generateEvenMoreFairLineupsJS(players, spotsOnField, subsPerChange);
    return {
        lineups: result.lineups,
        numLineups: result.lineups.length
    };
}

// Export functions if module system is available
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        tryDynamicPerfectSubstitutionPlan,
        generateEvenMoreFairLineupsJS,
        calculateCurrentPlayingTimes,
        simulateSubstitutionOutcome,
        generateOptimalSubstitution,
        calculateOptimalLineups
    };
}