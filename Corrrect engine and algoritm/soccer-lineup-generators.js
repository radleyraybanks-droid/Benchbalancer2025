// --- lineup-generators.js ---

//========================================================================
// SPECIALIZED PATTERN GENERATORS - SMALL-SIDED GAMES
//========================================================================

/**
 * 6 players total, 4 on field, 1 substitution at a time
 */
function generate6Players4OnField1SubLineups(players) {
    // P0,P1,P2,P3 on field; P4,P5 on bench
    // Lineup 1: P0,P1,P2,P3
    // Lineup 2: P4,P1,P2,P3 (P0 off, P4 on)
    // Lineup 3: P4,P5,P2,P3 (P1 off, P5 on)
    // Lineup 4: P4,P5,P0,P3 (P2 off, P0 on)
    // Lineup 5: P4,P5,P0,P1 (P3 off, P1 on)
    // Lineup 6: P2,P5,P0,P1 (P4 off, P2 on)
    // The key is 5 distinct changes to rotate everyone through the bench once.
    // Total of 6 unique lineups needed to give everyone equal bench time initially.
    return [
        [players[0], players[1], players[2], players[3]],
        [players[4], players[1], players[2], players[3]],
        [players[4], players[5], players[2], players[3]],
        [players[4], players[5], players[0], players[3]],
        [players[4], players[5], players[0], players[1]],
        [players[2], players[5], players[0], players[1]],
    ].map(l => l.sort());
}

/**
 * 6 players total, 4 on field, 2 substitutions at a time
 * Rotates the two bench players completely every sub.
 */
function generate6Players4OnField2SubsLineups(players) {
    // P0,P1,P2,P3 on field; P4,P5 on bench
    // Lineup 1: P0,P1,P2,P3
    // Lineup 2: P4,P5,P2,P3 (P0,P1 off; P4,P5 on)
    // Lineup 3: P0,P1,P4,P5 (P2,P3 off; P0,P1 on)
    // Needs 3 lineups for a full cycle.
    return [
        [players[0], players[1], players[2], players[3]],
        [players[4], players[5], players[2], players[3]],
        [players[0], players[1], players[4], players[5]]
    ].map(l => l.sort());
}


/**
 * 7 players total, 4 on field, 2 substitutions at a time
 */
function generate7Players4OnField2SubsLineups(players) { // players = [P0, P1, P2, P3, P4, P5, P6]
     // Aim for 7 unique lineups if possible to cycle everyone.
    return [
        [players[0], players[1], players[2], players[3]], // Bench: 4,5,6
        [players[4], players[5], players[2], players[3]], // 0,1 off; 4,5 on. Bench: 0,1,6
        [players[4], players[5], players[6], players[0]], // 2,3 off; 6,0 on. Bench: 2,3,1
        [players[1], players[2], players[6], players[0]], // 4,5 off; 1,2 on. Bench: 4,5,3
        [players[1], players[2], players[3], players[4]], // 6,0 off; 3,4 on. Bench: 6,0,5
        [players[5], players[6], players[3], players[4]], // 1,2 off; 5,6 on. Bench: 1,2,0
        [players[5], players[6], players[0], players[1]], // 3,4 off; 0,1 on. Bench: 3,4,2
    ].map(l => l.sort());
}

/**
 * 7 players total, 5 on field, 1 substitution at a time
 */
function generate7Players5OnField1SubLineups(players) {
    // 7 lineups for full cycle
    return [
        [players[0], players[1], players[2], players[3], players[4]], // Bench: 5,6
        [players[5], players[1], players[2], players[3], players[4]], // 0 off, 5 on. Bench: 0,6
        [players[5], players[6], players[2], players[3], players[4]], // 1 off, 6 on. Bench: 0,1
        [players[5], players[6], players[0], players[3], players[4]], // 2 off, 0 on. Bench: 1,2
        [players[5], players[6], players[0], players[1], players[4]], // 3 off, 1 on. Bench: 2,3
        [players[5], players[6], players[0], players[1], players[2]], // 4 off, 2 on. Bench: 3,4
        [players[3], players[6], players[0], players[1], players[2]], // 5 off, 3 on. Bench: 4,5 (player 3 re-enters)
    ].map(l => l.sort());
}

/**
 * 8 players total, 5 on field, 1 substitution at a time
 */
function generate8Players5OnField1SubLineups(players) { // 8 lineups
    return [
        [players[0], players[1], players[2], players[3], players[4]],
        [players[5], players[1], players[2], players[3], players[4]],
        [players[5], players[6], players[2], players[3], players[4]],
        [players[5], players[6], players[7], players[3], players[4]],
        [players[5], players[6], players[7], players[0], players[4]],
        [players[5], players[6], players[7], players[0], players[1]],
        [players[2], players[6], players[7], players[0], players[1]],
        [players[2], players[3], players[7], players[0], players[1]],
    ].map(l => l.sort());
}

/**
 * 8 players total, 5 on field, 2 substitutions at a time
 */
function generate8Players5OnField2SubsLineups(players) {
    // This pattern creates 4 unique changes before repeating player pairs on bench.
    // The original had 8 lineups, let's stick to that for now.
    return [
        [players[0], players[1], players[2], players[3], players[4]],
        [players[5], players[6], players[2], players[3], players[4]],
        [players[5], players[6], players[7], players[0], players[4]],
        [players[1], players[2], players[7], players[0], players[4]],
        [players[1], players[2], players[3], players[5], players[6]],
        [players[7], players[0], players[3], players[5], players[6]],
        [players[7], players[0], players[4], players[1], players[2]],
        [players[3], players[5], players[4], players[1], players[2]],
    ].map(l => l.sort());
}


/**
 * 8 players total, 6 on field, 1 substitution at a time
 */
function generate8Players6OnField1SubLineups(players) { // 8 lineups
    return [
        [players[0], players[1], players[2], players[3], players[4], players[5]],
        [players[6], players[1], players[2], players[3], players[4], players[5]],
        [players[6], players[7], players[2], players[3], players[4], players[5]],
        [players[6], players[7], players[0], players[3], players[4], players[5]],
        [players[6], players[7], players[0], players[1], players[4], players[5]],
        [players[6], players[7], players[0], players[1], players[2], players[5]],
        [players[6], players[7], players[0], players[1], players[2], players[3]],
        [players[4], players[7], players[0], players[1], players[2], players[3]],
    ].map(l => l.sort());
}

//========================================================================
// SPECIALIZED PATTERN GENERATORS - MEDIUM-SIDED GAMES
//========================================================================

/**
 * 9 players total, 5 on field, 2 substitutions at a time (4 reserves)
 */
function generate9Players5OnField2SubsLineups(players) { // 9 lineups
    return [
        [players[0], players[1], players[2], players[3], players[4]],
        [players[5], players[6], players[2], players[3], players[4]],
        [players[5], players[6], players[7], players[8], players[4]],
        [players[0], players[1], players[7], players[8], players[4]],
        [players[0], players[1], players[2], players[5], players[7]],
        [players[3], players[6], players[2], players[5], players[7]],
        [players[3], players[6], players[8], players[0], players[7]],
        [players[3], players[4], players[8], players[0], players[1]],
        [players[2], players[4], players[5], players[6], players[1]],
    ].map(l => l.sort());
}


/**
 * 9 players total, 6 on field, 2 substitutions at a time (3 reserves)
 */
function generate9Players6OnField2SubsLineups(players) { // 9 lineups
    return [
        [players[0], players[1], players[2], players[3], players[4], players[5]],
        [players[6], players[7], players[2], players[3], players[4], players[5]],
        [players[6], players[7], players[8], players[0], players[4], players[5]],
        [players[6], players[7], players[8], players[0], players[1], players[2]],
        [players[3], players[4], players[8], players[0], players[1], players[2]],
        [players[3], players[4], players[5], players[6], players[1], players[2]],
        [players[3], players[4], players[5], players[6], players[7], players[8]],
        [players[0], players[1], players[5], players[6], players[7], players[8]],
        [players[0], players[1], players[2], players[3], players[7], players[8]],
    ].map(l => l.sort());
}

/**
 * 9 players total, 7 on field, 1 substitution at a time (2 reserves)
 */
function generate9Players7OnField1SubLineups(players) { // 9 lineups
    return [
        [players[0], players[1], players[2], players[3], players[4], players[5], players[6]],
        [players[7], players[1], players[2], players[3], players[4], players[5], players[6]],
        [players[7], players[8], players[2], players[3], players[4], players[5], players[6]],
        [players[7], players[8], players[0], players[3], players[4], players[5], players[6]],
        [players[7], players[8], players[0], players[1], players[4], players[5], players[6]],
        [players[7], players[8], players[0], players[1], players[2], players[5], players[6]],
        [players[7], players[8], players[0], players[1], players[2], players[3], players[6]],
        [players[7], players[8], players[0], players[1], players[2], players[3], players[4]],
        [players[5], players[8], players[0], players[1], players[2], players[3], players[4]],
    ].map(l => l.sort());
}

/**
 * 10 players total, 6 on field, 2 substitutions at a time (4 reserves)
 */
function generate10Players6OnField2SubsLineups(players) { // 10 lineups, or use general if cycle is shorter
    return [
        [players[0], players[1], players[2], players[3], players[4], players[5]],
        [players[6], players[7], players[2], players[3], players[4], players[5]],
        [players[6], players[7], players[8], players[9], players[4], players[5]],
        [players[0], players[1], players[8], players[9], players[4], players[5]],
        [players[0], players[1], players[8], players[9], players[2], players[3]],
        [players[6], players[7], players[8], players[9], players[2], players[3]],
        [players[6], players[7], players[0], players[1], players[2], players[3]],
        [players[4], players[5], players[0], players[1], players[2], players[3]],
        [players[4], players[5], players[6], players[7], players[2], players[3]],
        [players[4], players[5], players[6], players[7], players[8], players[9]],
    ].map(l => l.sort());
}

/**
 * 10 players total, 7 on field, 2 substitutions at a time (3 reserves)
 */
function generate10Players7OnField2SubsLineups(players) { // 10 lineups
    return [
        [players[0], players[1], players[2], players[3], players[4], players[5], players[6]],
        [players[7], players[8], players[2], players[3], players[4], players[5], players[6]],
        [players[7], players[8], players[9], players[0], players[4], players[5], players[6]],
        [players[7], players[8], players[9], players[0], players[1], players[2], players[6]],
        [players[3], players[4], players[9], players[0], players[1], players[2], players[5]],
        [players[3], players[4], players[5], players[6], players[1], players[2], players[7]],
        [players[3], players[4], players[5], players[6], players[8], players[9], players[0]],
        [players[1], players[2], players[5], players[6], players[7], players[8], players[9]],
        [players[1], players[2], players[3], players[4], players[7], players[8], players[9]],
        [players[0], players[1], players[2], players[3], players[4], players[5], players[9]],
    ].map(l => l.sort());
}


/**
 * 10 players total, 8 on field, 1 substitution at a time (2 reserves)
 */
function generate10Players8OnField1SubLineups(players) { // 10 lineups
    return [
        [players[0], players[1], players[2], players[3], players[4], players[5], players[6], players[7]],
        [players[8], players[1], players[2], players[3], players[4], players[5], players[6], players[7]],
        [players[8], players[9], players[2], players[3], players[4], players[5], players[6], players[7]],
        [players[8], players[9], players[0], players[3], players[4], players[5], players[6], players[7]],
        [players[8], players[9], players[0], players[1], players[4], players[5], players[6], players[7]],
        [players[8], players[9], players[0], players[1], players[2], players[5], players[6], players[7]],
        [players[8], players[9], players[0], players[1], players[2], players[3], players[6], players[7]],
        [players[8], players[9], players[0], players[1], players[2], players[3], players[4], players[7]],
        [players[8], players[9], players[0], players[1], players[2], players[3], players[4], players[5]],
        [players[6], players[9], players[0], players[1], players[2], players[3], players[4], players[5]],
    ].map(l => l.sort());
}

//========================================================================
// SPECIALIZED PATTERN GENERATORS - LARGE-SIDED GAMES
//========================================================================

/**
 * 11 players total, 8 on field, 2 substitutions at a time (3 reserves)
 */
function generate11Players8OnField2SubsLineups(players) { // 11 lineups
    return [
        [players[0], players[1], players[2], players[3], players[4], players[5], players[6], players[7]],
        [players[8], players[9], players[2], players[3], players[4], players[5], players[6], players[7]],
        [players[8], players[9], players[10], players[0], players[4], players[5], players[6], players[7]],
        [players[8], players[9], players[10], players[0], players[1], players[2], players[6], players[7]],
        [players[8], players[9], players[10], players[0], players[1], players[2], players[3], players[4]],
        [players[5], players[6], players[10], players[0], players[1], players[2], players[3], players[4]],
        [players[5], players[6], players[7], players[8], players[1], players[2], players[3], players[4]],
        [players[5], players[6], players[7], players[8], players[9], players[10], players[3], players[4]],
        [players[5], players[6], players[7], players[8], players[9], players[10], players[0], players[1]],
        [players[2], players[3], players[7], players[8], players[9], players[10], players[0], players[1]],
        [players[2], players[3], players[4], players[5], players[9], players[10], players[0], players[1]],
    ].map(l => l.sort());
}

//========================================================================
// SPECIALIZED PATTERN GENERATORS - FULL-SIDED FOOTBALL/SOCCER
//========================================================================

/**
 * 12 players total, 11 on field, 1 substitution at a time (1 reserve)
 */
function generate12Players11OnField1SubLineups(players) {
    const lineups = [];
    const numPlayers = players.length; // Should be 12
    for (let i = 0; i < numPlayers; i++) {
        // Player at index `i` is on the bench for this lineup
        const lineup = players.filter((_, idx) => idx !== i);
        lineups.push(lineup.sort());
    }
    return lineups; // Will produce 12 lineups, each with a different player on bench
}


/**
 * Simple rotation where the entire bench swaps with a corresponding number of field players.
 * This is typically used when the number of reserves equals the number of substitutions per change.
 * Results in only two distinct lineups.
 */
function generateTwoLineupRotation(players, playersOnField) {
    const numTotalPlayers = players.length;
    const numReserves = numTotalPlayers - playersOnField;

    if (numReserves === 0 || numReserves >= playersOnField) {
        // This simple rotation isn't suitable or doesn't make sense.
        debugLog("generateTwoLineupRotation: Not suitable for these player counts.");
        return [players.slice(0, playersOnField).sort()];
    }

    const lineup1 = players.slice(0, playersOnField).sort();
    // Players from playersOnField to numTotalPlayers-1 are the reserves
    // Players from 0 to numReserves-1 are the first field players to be subbed out
    const lineup2 = [
        ...players.slice(playersOnField), // All reserves come on
        ...players.slice(numReserves, playersOnField) // Remaining field players who were not subbed out
    ].sort();

    return [lineup1, lineup2];
}


/**
 * General purpose fair lineup generator.
 * Tries to create N unique lineups (where N is total players) by prioritizing
 * players with longest current stint on field (to go off) and players with fewest
 * total appearances in generated lineups (to come on).
 */
function generateEvenMoreFairLineupsJS(allPlayersList, playersOnField, subsPerChangeNominal) {
    debugLog(`JS: Generating fairer lineups for ${allPlayersList.length} players, ${playersOnField} on field, ${subsPerChangeNominal} subs target.`);
    const numTotalPlayers = allPlayersList.length;

    // Sort players by their original index in the global `allPlayers` list to ensure deterministic behavior.
    const playersSorted = [...allPlayersList].sort((a, b) => {
        const indexA = allPlayers.indexOf(a);
        const indexB = allPlayers.indexOf(b);
        if (indexA === -1 && indexB === -1) return a.localeCompare(b);
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });


    let currentField = playersSorted.slice(0, playersOnField);
    let lineups = [currentField.slice().sort()]; // Store sorted lineups

    let playerLineupAppearances = {};
    allPlayersList.forEach(p => playerLineupAppearances[p] = 0);
    let playerLineupStint = {}; // Tracks continuous "stints" within the lineup generation process
    allPlayersList.forEach(p => playerLineupStint[p] = 0);

    currentField.forEach(p => {
        playerLineupAppearances[p] = 1;
        playerLineupStint[p] = 1;
    });

    const maxIterations = Math.min(numTotalPlayers * 3, 50) ;

    for (let i = 1; i < maxIterations; i++) {
        let currentBench = playersSorted.filter(p => !currentField.includes(p));

        if (currentBench.length === 0) {
            debugLog("FairerJS: Bench empty, stopping lineup generation. Lineups:", lineups.length);
            break;
        }

        const numCanSubOut = Math.min(subsPerChangeNominal, currentField.length);
        const numCanSubIn = Math.min(subsPerChangeNominal, currentBench.length);
        const actualSubsThisStep = Math.min(numCanSubOut, numCanSubIn);

        if (actualSubsThisStep === 0) {
            debugLog("FairerJS: actualSubsThisStep is 0, stopping lineup generation. Lineups:", lineups.length);
            break;
        }

        let fieldCandidates = currentField.map(p => ({
            name: p,
            stint: playerLineupStint[p],
            appearances: playerLineupAppearances[p],
            originalOrder: allPlayers.indexOf(p)
        })).sort((a, b) => {
            if (b.stint !== a.stint) return b.stint - a.stint;
            if (b.appearances !== a.appearances) return b.appearances - a.appearances;
            return a.originalOrder - b.originalOrder;
        });
        const playersToGoOff = fieldCandidates.slice(0, actualSubsThisStep).map(p_obj => p_obj.name);

        let benchCandidates = currentBench.map(p => ({
            name: p,
            appearances: playerLineupAppearances[p],
            originalOrder: allPlayers.indexOf(p)
        })).sort((a, b) => {
            if (a.appearances !== b.appearances) return a.appearances - b.appearances;
            return a.originalOrder - b.originalOrder;
        });
        const playersToComeOn = benchCandidates.slice(0, actualSubsThisStep).map(p_obj => p_obj.name);

        let nextFieldUnsorted = currentField.filter(p => !playersToGoOff.includes(p));
        nextFieldUnsorted.push(...playersToComeOn);

        let nextFieldSorted = nextFieldUnsorted.slice().sort();

        if (lineups.some(l => l.join(',') === nextFieldSorted.join(','))) {
            debugLog(`FairerJS: Lineup repeated. Generated ${lineups.length} unique lineups. Stopping.`);
            break;
        }
        lineups.push(nextFieldSorted);

        playersToGoOff.forEach(pOff => playerLineupStint[pOff] = 0);

        nextFieldUnsorted.forEach(pOnFieldNow => {
            playerLineupAppearances[pOnFieldNow]++;
            if (playersToComeOn.includes(pOnFieldNow)) {
                playerLineupStint[pOnFieldNow] = 1;
            } else {
                playerLineupStint[pOnFieldNow]++;
            }
        });
        currentField = nextFieldUnsorted;

        if (lineups.length >= numTotalPlayers && numTotalPlayers <= 7) {
            // Small squad optimization: if N lineups found, it's often a full cycle.
            // No break, allow to run to maxIterations to find potentially longer stable cycles.
        }
    }
    debugLog(`FairerJS: Final generated ${lineups.length} distinct lineups.`);
    if (lineups.length === 0 && playersSorted.length >= playersOnField) {
        return { lineups: [playersSorted.slice(0, playersOnField).sort()], numLineups: 1};
    }
    return { lineups: lineups, numLineups: lineups.length };
}