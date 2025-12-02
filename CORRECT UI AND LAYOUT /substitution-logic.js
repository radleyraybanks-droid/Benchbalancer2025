// --- START OF FILE substitution-logic.js ---

// --- substitution-logic.js ---

/**
 * ENHANCED: Calculates optimal substitution pattern using Dynamic Perfect Balance Algorithm
 * Supports unlimited recalculations and real-time adaptations
 * @param {number} durationForThisPlanSegment - The total seconds this plan should cover.
 * @param {string[]} [activePlayersListOverride=null] - Override for active players.
 * @param {number} [gamePlayersOnFieldOverride=null] - Override for players on field.
 * @param {number} [subsPerChangeOverride=null] - Override for subs per change.
 * @param {object} [gkStatusOverride=null] - Override for GK status object.
 * @param {number} [numGkOnFieldOverride=null] - Override for number of GKs on field.
 * @param {boolean} [isRecalculation=false] - Whether this is a recalculation during game
 * @returns {{times: number[], plan: Array<{time: number, off: string[], on: string[]}>}}
 */
function calculateOptimalSubstitutionPattern(
    durationForThisPlanSegment,
    activePlayersListOverride = null,
    gamePlayersOnFieldOverride = null,
    subsPerChangeOverride = null,
    gkStatusOverride = null,
    numGkOnFieldOverride = null,
    isRecalculation = false
) {
    debugLog(`${isRecalculation ? '🔄 RECALCULATING' : '🚀 CALCULATING'} optimal substitution pattern for a DURATION of: ${formatTime(durationForThisPlanSegment)}`);

    // Enhanced calculation - try Dynamic Perfect Balance Algorithm first
    if (typeof calculateDynamicPerfectPlan !== 'undefined' && !isRecalculation) {
        try {
            const dynamicResult = tryDynamicPerfectSubstitutionPlan(
                durationForThisPlanSegment,
                activePlayersListOverride,
                gamePlayersOnFieldOverride,
                subsPerChangeOverride,
                gkStatusOverride,
                numGkOnFieldOverride
            );
            
            if (dynamicResult && !dynamicResult.error) {
                debugLog(`✅ Dynamic Perfect Balance Algorithm succeeded with ${dynamicResult.finalSubTimes.length} substitutions`);
                return dynamicResult;
            } else {
                debugLog('⚠️ Dynamic algorithm failed, using original enhanced algorithm');
            }
        } catch (error) {
            debugLog('❌ Dynamic algorithm exception, using original enhanced algorithm:', error);
        }
    } else if (isRecalculation) {
        debugLog('🔄 Recalculation mode - using enhanced original algorithm with current game state');
    }

    const activePlayersToUse = activePlayersListOverride || allPlayers.filter(p => !playerRemovedStatus[p]);
    const gamePlayersOnFieldToUse = gamePlayersOnFieldOverride !== null && gamePlayersOnFieldOverride !== undefined ? gamePlayersOnFieldOverride : gameSettings.numOnField;
    const subsPerChangeToUse = subsPerChangeOverride !== null && subsPerChangeOverride !== undefined ? subsPerChangeOverride : gameSettings.subsPerChange;
    const playerGkStatusToUse = gkStatusOverride || playerGKStatus;
    const numGkOnFieldToUse = numGkOnFieldOverride !== null && numGkOnFieldOverride !== undefined ? numGkOnFieldOverride : gameSettings.numGoalkeepers;

    const totalGameSeconds = durationForThisPlanSegment;

    const targetPlaytimePerPlayer = activePlayersToUse.length > 0
        ? Math.floor((totalGameSeconds * gamePlayersOnFieldToUse) / activePlayersToUse.length)
        : 0;
    debugLog(`Target play time per player (approx for this segment): ${formatTime(targetPlaytimePerPlayer)} for ${activePlayersToUse.length} active players.`);

    const nonGkPlayers = activePlayersToUse.filter(p => !playerGkStatusToUse[p]);
    const numNonGkPlayers = nonGkPlayers.length;
    const numNonGkSpotsOnField = gamePlayersOnFieldToUse - numGkOnFieldToUse;

    if (numNonGkSpotsOnField <= 0 && numNonGkPlayers > 0) {
        debugLog("No non-GK spots on field, but non-GK players exist. No rotation plan for non-GKs.");
        return { times: [], plan: [] };
    }
    if (numNonGkSpotsOnField <= 0 && numNonGkPlayers === 0) {
        debugLog("All players on field are GKs or no non-GK players available. No rotation plan for non-GKs.");
        return { times: [], plan: [] };
    }
    if (numNonGkPlayers <= numNonGkSpotsOnField) {
        debugLog("Not enough active non-GK players for rotation (or all can be on field).");
        return { times: [], plan: [] };
    }
    if (subsPerChangeToUse <= 0) {
        debugLog("Subs per change is 0, no automatic plan.");
        return { times: [], plan: [] };
    }

    const playersOnNonGkBench = numNonGkPlayers - numNonGkSpotsOnField;
    const actualSubsPerChangeForPlanGeneration = Math.min(subsPerChangeToUse, playersOnNonGkBench, numNonGkSpotsOnField);

    if (actualSubsPerChangeForPlanGeneration <= 0) {
        debugLog("Effective subs per change for active non-GKs is 0 for plan generation. No plan.");
        return { times: [], plan: [] };
    }
    debugLog(`Effective params for plan gen: Active Non-GK: ${numNonGkPlayers}, Non-GK Spots: ${numNonGkSpotsOnField}, Subs: ${actualSubsPerChangeForPlanGeneration}`);

    const { lineups, numLineups } = calculateOptimalLineups(nonGkPlayers, numNonGkSpotsOnField, actualSubsPerChangeForPlanGeneration);

    if (!lineups || lineups.length <= 1) {
        debugLog("Optimal lineup calculation resulted in 1 or no lineups. No substitution plan generated.");
        return { times: [], plan: [] };
    }
    debugLog(`Calculated ${numLineups} distinct non-GK lineups for initial plan.`);

    // --- Robust Sub Interval Calculation ---
    let subIntervalSeconds = 0;
    const desiredNumberOfSubEvents = numLineups - 1;

    if (desiredNumberOfSubEvents > 0) {
        subIntervalSeconds = Math.floor(totalGameSeconds / numLineups); // numLineups is number of segments/stints
        debugLog(`Initial calculated subIntervalSeconds: ${formatTime(subIntervalSeconds)} (${subIntervalSeconds}s) for ${numLineups} lineups (${desiredNumberOfSubEvents} subs) over ${formatTime(totalGameSeconds)}.`);

        if (subIntervalSeconds < MIN_ACCEPTABLE_SUB_INTERVAL) {
            debugLog(`Initial interval ${formatTime(subIntervalSeconds)} (${subIntervalSeconds}s) is less than MIN_ACCEPTABLE_SUB_INTERVAL ${formatTime(MIN_ACCEPTABLE_SUB_INTERVAL)} (${MIN_ACCEPTABLE_SUB_INTERVAL}s). Attempting adjustment...`);
            
            const availableTimeForSubs = totalGameSeconds - MIN_TIME_BEFORE_END_BUFFER_SECONDS;
            if (availableTimeForSubs < MIN_ACCEPTABLE_SUB_INTERVAL) { 
                 debugLog(`Not enough available time (${formatTime(availableTimeForSubs)}) for even one sub at MIN_ACCEPTABLE_SUB_INTERVAL (${formatTime(MIN_ACCEPTABLE_SUB_INTERVAL)}). No subs will be planned effectively.`);
                 subIntervalSeconds = totalGameSeconds + 100; // Make interval larger than game to ensure no subs are generated by time loop. Add 100 to be very sure.
            } else {
                const maxSubsPossibleWithMinInterval = Math.floor(availableTimeForSubs / MIN_ACCEPTABLE_SUB_INTERVAL);

                if (desiredNumberOfSubEvents > maxSubsPossibleWithMinInterval) {
                    const newNumberOfSubEvents = maxSubsPossibleWithMinInterval;
                    if (newNumberOfSubEvents > 0) {
                        subIntervalSeconds = Math.floor(totalGameSeconds / (newNumberOfSubEvents + 1)); // +1 for number of segments
                        debugLog(`Adjusted subInterval to ${formatTime(subIntervalSeconds)} (${subIntervalSeconds}s) for ${newNumberOfSubEvents} subs (was ${desiredNumberOfSubEvents}). Total segments: ${newNumberOfSubEvents + 1}.`);
                    } else {
                        debugLog(`Cannot even fit one sub event with MIN_ACCEPTABLE_SUB_INTERVAL after considering buffer. No subs planned effectively.`);
                        subIntervalSeconds = totalGameSeconds + 100; 
                    }
                } else if (desiredNumberOfSubEvents > 0) { 
                    subIntervalSeconds = MIN_ACCEPTABLE_SUB_INTERVAL;
                    debugLog(`Original number of subs (${desiredNumberOfSubEvents}) is possible. Forced interval to MIN_ACCEPTABLE_SUB_INTERVAL: ${formatTime(subIntervalSeconds)} (${subIntervalSeconds}s).`);
                }
            }
        }
        
        if (subIntervalSeconds < MIN_ACCEPTABLE_SUB_INTERVAL && desiredNumberOfSubEvents > 0 && subIntervalSeconds <= totalGameSeconds) {
            debugLog(`Final safeguard: Interval ${formatTime(subIntervalSeconds)} (${subIntervalSeconds}s) still too short. Forcing to ${formatTime(MIN_ACCEPTABLE_SUB_INTERVAL)} (${MIN_ACCEPTABLE_SUB_INTERVAL}s) if possible.`);
            if (totalGameSeconds >= MIN_ACCEPTABLE_SUB_INTERVAL + MIN_TIME_BEFORE_END_BUFFER_SECONDS) { 
                 subIntervalSeconds = MIN_ACCEPTABLE_SUB_INTERVAL;
            } else {
                debugLog(`Cannot apply safeguard, total game time ${formatTime(totalGameSeconds)} too short for a sub at ${formatTime(MIN_ACCEPTABLE_SUB_INTERVAL)} with buffer. Subs will likely be ineffective.`);
                 subIntervalSeconds = totalGameSeconds + 100; // Ensure no subs if it's truly impossible
            }
        }

    } else { 
        debugLog("No sub events are planned (numLineups <= 1).");
        return { times: [], plan: [] }; 
    }
    
    if (subIntervalSeconds === 0 && desiredNumberOfSubEvents > 0) {
        debugLog("Sub interval calculated as 0, but subs were desired. Cannot create plan. TotalGameSeconds likely too short.");
        return { times: [], plan: [] };
    }
    // --- End of Robust Sub Interval Calculation ---

    const subTimes = [];
    if (desiredNumberOfSubEvents > 0 && subIntervalSeconds > 0 && subIntervalSeconds <= totalGameSeconds) { 
        let currentTimeMarker = 0;
        for (let i = 0; i < desiredNumberOfSubEvents; i++) { 
            currentTimeMarker += subIntervalSeconds;
            if (currentTimeMarker <= totalGameSeconds - MIN_TIME_BEFORE_END_BUFFER_SECONDS) {
                subTimes.push(currentTimeMarker);
            } else {
                debugLog(`Planned sub at ${formatTime(currentTimeMarker)} (relative) omitted as it's too close to segment end (respecting buffer ${formatTime(MIN_TIME_BEFORE_END_BUFFER_SECONDS)}). Max valid sub time: ${formatTime(totalGameSeconds - MIN_TIME_BEFORE_END_BUFFER_SECONDS)}.`);
                break;
            }
        }
    } else if (desiredNumberOfSubEvents > 0) {
        debugLog(`No sub times generated. Desired subs: ${desiredNumberOfSubEvents}, Calculated Interval: ${formatTime(subIntervalSeconds)} (${subIntervalSeconds}s), Total Game Sec: ${totalGameSeconds}`);
    }

    let initialSubPlan = [];
    for (let i = 0; i < Math.min(desiredNumberOfSubEvents, subTimes.length); i++) {
        const currentLineup = lineups[i]; 
        const nextLineup = lineups[i+1];  
        const playersOff = currentLineup.filter(p => !nextLineup.includes(p)); // Order based on `currentLineup`
        const playersOn = nextLineup.filter(p => !currentLineup.includes(p));   // Order based on `nextLineup`
        const numToSubThisEvent = Math.min(playersOff.length, playersOn.length, subsPerChangeToUse);
        const finalOff = playersOff.slice(0, numToSubThisEvent);
        const finalOn = playersOn.slice(0, numToSubThisEvent);

        if (finalOff.length > 0 && finalOn.length > 0) {
            initialSubPlan.push({ time: subTimes[i], off: finalOff, on: finalOn });
        }
    }

    debugLog("Initial substitution plan (relative times for this segment):");
    if (initialSubPlan.length > 0) {
        initialSubPlan.forEach((sub, i) => {
            debugLog(`  Initial Sub ${i+1} at ${formatTime(sub.time)}: ${sub.off.join(',')} OFF, ${sub.on.join(',')} ON`);
        });
    } else {
        debugLog("  No subs in initial plan.");
    }

    const adjustedSubPlan = applyEndGameEquityAdjustment(initialSubPlan, nonGkPlayers, numNonGkSpotsOnField, totalGameSeconds, lineups, subsPerChangeToUse);
    debugLog("Final substitution plan for this segment (after equity adjustment, relative times):");
    if (adjustedSubPlan.length > 0) {
        adjustedSubPlan.forEach((sub, i) => {
            debugLog(`  Final Sub ${i+1} at ${formatTime(sub.time)}: ${sub.off.join(',')} OFF, ${sub.on.join(',')} ON`);
        });
    } else {
        debugLog("  No subs in final plan.");
    }

    const appearances = {};
    nonGkPlayers.forEach(p => appearances[p] = 0);
    lineups.forEach(lineup => { lineup.forEach(player => { appearances[player] = (appearances[player] || 0) + 1; }); });
    debugLog("Player appearances in originally generated non-GK lineups for this segment:", appearances);

    const finalSubTimes = adjustedSubPlan.map(sub => sub.time);
    return { times: finalSubTimes, plan: adjustedSubPlan };
}

//========================================================================
// DYNAMIC PERFECT BALANCE INTEGRATION FUNCTIONS
//========================================================================

/**
 * Try to use Dynamic Perfect Balance Algorithm for substitution planning
 */
function tryDynamicPerfectSubstitutionPlan(
    durationSeconds,
    activePlayersListOverride,
    gamePlayersOnFieldOverride,
    subsPerChangeOverride,
    gkStatusOverride,
    numGkOnFieldOverride
) {
    const activePlayersToUse = activePlayersListOverride || allPlayers.filter(p => !playerRemovedStatus[p]);
    const gamePlayersOnFieldToUse = gamePlayersOnFieldOverride !== null ? gamePlayersOnFieldOverride : gameSettings.numOnField;
    const subsPerChangeToUse = subsPerChangeOverride !== null ? subsPerChangeOverride : gameSettings.subsPerChange;
    const playerGkStatusToUse = gkStatusOverride || playerGKStatus;
    
    // Filter out goalkeepers from rotation
    const rotatingPlayers = activePlayersToUse.filter(p => !playerGkStatusToUse[p]);
    const exemptPlayers = activePlayersToUse.filter(p => playerGkStatusToUse[p]);
    
    debugLog(`🧮 Dynamic Perfect: ${rotatingPlayers.length} rotating, ${exemptPlayers.length} exempt (GK), ${gamePlayersOnFieldToUse} on field`);
    
    // Prepare configuration for dynamic algorithm
    const gameConfig = {
        totalGameSeconds: durationSeconds,
        rotatingPlayers: rotatingPlayers,
        playersOnCourt: gamePlayersOnFieldToUse - exemptPlayers.length, // Subtract GK spots
        maxSubsPerChange: subsPerChangeToUse,
        exemptPlayers: exemptPlayers,
        currentGameState: getCurrentGameStateForDynamic()
    };
    
    // Call dynamic perfect balance algorithm
    const dynamicResult = calculateDynamicPerfectPlan(gameConfig);
    
    if (dynamicResult.error) {
        return { error: dynamicResult.error };
    }
    
    // Convert to expected format for existing substitution logic
    return convertDynamicToSubstitutionFormat(dynamicResult);
}

/**
 * Get current game state for dynamic algorithm
 */
function getCurrentGameStateForDynamic() {
    return {
        currentGameSeconds: currentGameSeconds || 0,
        totalGameSeconds: (gameSettings.numPeriods || 2) * (periodLengthSeconds || 1200),
        currentPlayersOnCourt: onField ? [...onField] : [],
        currentPlayersOnBench: onBench ? [...onBench] : [],
        playerPlayTimes: playerPlayTimes ? { ...playerPlayTimes } : {},
        playerStintStartTimes: playerCurrentStintStart ? { ...playerCurrentStintStart } : {},
        exemptPlayers: Object.keys(playerGKStatus || {}).filter(p => playerGKStatus[p])
    };
}

/**
 * Convert dynamic algorithm result to substitution logic format
 */
function convertDynamicToSubstitutionFormat(dynamicResult) {
    const { substitutionPlan, verification } = dynamicResult;
    
    if (!substitutionPlan || substitutionPlan.length === 0) {
        return { times: [], plan: [] };
    }
    
    const times = substitutionPlan.map(sub => sub.time);
    const plan = substitutionPlan.map(sub => ({
        time: sub.time,
        off: sub.playersOff || [],
        on: sub.playersOn || [],
        reason: sub.reason || 'Dynamic Perfect Balance'
    }));
    
    debugLog(`📊 Dynamic conversion: ${times.length} substitution times, projected variance: ${verification.variance}s`);
    
    return {
        times: times,
        plan: plan,
        finalSubTimes: times,
        verification: verification,
        algorithm: 'DYNAMIC_PERFECT'
    };
}

/**
 * ENHANCED: Trigger recalculation when disruptions occur
 * This can be called unlimited times during a game
 */
function triggerPerfectBalanceRecalculation(disruptionReason = 'Manual recalculation') {
    debugLog(`🔄 Triggering perfect balance recalculation: ${disruptionReason}`);
    
    // Calculate remaining game time
    const totalGameTime = periodLengthSeconds * gameSettings.numPeriods;
    const remainingTime = totalGameTime - currentGameSeconds;
    
    if (remainingTime <= MIN_TIME_BEFORE_END_BUFFER_SECONDS) {
        debugLog('⏰ Too little time remaining for recalculation');
        return false;
    }
    
    try {
        // Try dynamic algorithm first for recalculation
        if (typeof recalculatePerfectPlanFromCurrentState !== 'undefined') {
            const currentState = getCurrentGameStateForDynamic();
            const recalcResult = recalculatePerfectPlanFromCurrentState(currentState, {
                reason: disruptionReason,
                timestamp: Date.now()
            });
            
            if (recalcResult && !recalcResult.error && !recalcResult.noRecalculationNeeded) {
                // Apply new plan
                optimizedSubPlan = recalcResult.newSubstitutionPlan || [];
                optimizedSubSchedule = recalcResult.newSubstitutionPlan.map(sub => sub.time) || [];
                
                debugLog(`✅ Dynamic recalculation successful: ${optimizedSubPlan.length} new substitutions planned`);
                debugLog(`📊 Projected improvement: ${recalcResult.projectedImprovement}s variance reduction`);
                
                // Update next substitution time
                recalculateRemainingAutoSubTimes();
                updateDisplay();
                
                showStatusMessage(`Recalculated: ${optimizedSubPlan.length} new subs planned (${Math.round(recalcResult.projectedImprovement)}s improvement)`, 4000);
                return true;
            }
        }
        
        // Fall back to original algorithm for recalculation
        const recalcResult = calculateOptimalSubstitutionPattern(
            remainingTime,
            null, null, null, null, null,
            true // isRecalculation = true
        );
        
        if (recalcResult && recalcResult.plan.length > 0) {
            // Convert times to absolute game times
            const absoluteTimes = recalcResult.times.map(t => currentGameSeconds + t);
            const absolutePlan = recalcResult.plan.map((sub, index) => ({
                ...sub,
                time: currentGameSeconds + sub.time
            }));
            
            optimizedSubPlan = absolutePlan;
            optimizedSubSchedule = absoluteTimes;
            
            debugLog(`✅ Original algorithm recalculation: ${absolutePlan.length} substitutions planned`);
            
            recalculateRemainingAutoSubTimes();
            updateDisplay();
            
            showStatusMessage(`Recalculated: ${absolutePlan.length} substitutions planned`, 3000);
            return true;
        }
        
    } catch (error) {
        debugLog('❌ Recalculation failed:', error);
        showStatusMessage('Recalculation failed - continuing with current plan', 3000);
    }
    
    return false;
}

function calculateOptimalLineups(players, playersOnField, subsPerChange) {
    const totalPlayers = players.length;

    if (totalPlayers === 6 && playersOnField === 4 && subsPerChange === 1) {
        debugLog("Using specialized 6p/4f/1s pattern");
        return { lineups: generate6Players4OnField1SubLineups(players), numLineups: generate6Players4OnField1SubLineups(players).length };
    }
    if (totalPlayers === 6 && playersOnField === 4 && subsPerChange === 2) {
        debugLog("Using specialized 6p/4f/2s pattern");
        return { lineups: generate6Players4OnField2SubsLineups(players), numLineups: generate6Players4OnField2SubsLineups(players).length };
    }
    if (totalPlayers === 7 && playersOnField === 5 && subsPerChange === 1) {
        debugLog("Using specialized 7p/5f/1s pattern");
        return { lineups: generate7Players5OnField1SubLineups(players), numLineups: generate7Players5OnField1SubLineups(players).length };
    }
    if (totalPlayers === 7 && playersOnField === 4 && subsPerChange === 2) {
        debugLog("Using specialized 7p/4f/2s pattern");
        return { lineups: generate7Players4OnField2SubsLineups(players), numLineups: generate7Players4OnField2SubsLineups(players).length };
    }
    if (totalPlayers === 8 && playersOnField === 5 && subsPerChange === 1) {
        debugLog("Using specialized 8p/5f/1s pattern");
        return { lineups: generate8Players5OnField1SubLineups(players), numLineups: generate8Players5OnField1SubLineups(players).length };
    }
     if (totalPlayers === 8 && playersOnField === 5 && subsPerChange === 2) {
        debugLog("Using specialized 8p/5f/2s pattern");
        return { lineups: generate8Players5OnField2SubsLineups(players), numLineups: generate8Players5OnField2SubsLineups(players).length };
    }
    if (totalPlayers === 8 && playersOnField === 6 && subsPerChange === 1) {
        debugLog("Using specialized 8p/6f/1s pattern");
        return { lineups: generate8Players6OnField1SubLineups(players), numLineups: generate8Players6OnField1SubLineups(players).length };
    }
    if (totalPlayers === 9 && playersOnField === 5 && subsPerChange === 2) {
        debugLog("Using specialized 9p/5f/2s pattern");
        return { lineups: generate9Players5OnField2SubsLineups(players), numLineups: generate9Players5OnField2SubsLineups(players).length };
    }
    if (totalPlayers === 9 && playersOnField === 6 && subsPerChange === 2) {
        debugLog("Using specialized 9p/6f/2s pattern");
        return { lineups: generate9Players6OnField2SubsLineups(players), numLineups: generate9Players6OnField2SubsLineups(players).length };
    }
    if (totalPlayers === 9 && playersOnField === 7 && subsPerChange === 1) {
        debugLog("Using specialized 9p/7f/1s pattern");
        return { lineups: generate9Players7OnField1SubLineups(players), numLineups: generate9Players7OnField1SubLineups(players).length };
    }
    if (totalPlayers === 10 && playersOnField === 6 && subsPerChange === 2) {
        debugLog("Using specialized 10p/6f/2s pattern");
        return { lineups: generate10Players6OnField2SubsLineups(players), numLineups: generate10Players6OnField2SubsLineups(players).length };
    }
    if (totalPlayers === 10 && playersOnField === 7 && subsPerChange === 2) {
        debugLog("Using specialized 10p/7f/2s pattern");
        return { lineups: generate10Players7OnField2SubsLineups(players), numLineups: generate10Players7OnField2SubsLineups(players).length };
    }
    if (totalPlayers === 10 && playersOnField === 8 && subsPerChange === 1) {
        debugLog("Using specialized 10p/8f/1s pattern");
        return { lineups: generate10Players8OnField1SubLineups(players), numLineups: generate10Players8OnField1SubLineups(players).length };
    }
    if (totalPlayers === 11 && playersOnField === 8 && subsPerChange === 2) {
        debugLog("Using specialized 11p/8f/2s pattern");
        return { lineups: generate11Players8OnField2SubsLineups(players), numLineups: generate11Players8OnField2SubsLineups(players).length };
    }
    if (totalPlayers === 12 && playersOnField === 11 && subsPerChange === 1) {
        debugLog("Using specialized 12p/11f/1s pattern");
        return { lineups: generate12Players11OnField1SubLineups(players), numLineups: generate12Players11OnField1SubLineups(players).length };
    }

    debugLog("Using 'Even Fairer' general rotation algorithm for lineups as no specific pattern matched or to refine further.");
    return generateEvenMoreFairLineupsJS(players, playersOnField, subsPerChange);
}

function applyEndGameEquityAdjustment(currentPlan, rotatablePlayers, numSpotsOnField, totalDurationOfSegment, generatedLineups, subsPerChangeForSegment) {
    if (!currentPlan || currentPlan.length === 0 || !generatedLineups || generatedLineups.length === 0) {
        debugLog("EquityAdjust: No current plan, or plan/generatedLineups empty. Cannot adjust.");
        return currentPlan;
    }

    const adjustedPlan = JSON.parse(JSON.stringify(currentPlan));

    if (adjustedPlan.length === 0) return currentPlan;

    const lastSubEventIndex = adjustedPlan.length - 1;
    const lastSubEvent = adjustedPlan[lastSubEventIndex];
    const T_last_sub_time = lastSubEvent.time;
    const remainingGameTimeAfterLastSub = totalDurationOfSegment - T_last_sub_time;

    if (remainingGameTimeAfterLastSub < MIN_ACCEPTABLE_SUB_INTERVAL / 2 ||
        T_last_sub_time >= totalDurationOfSegment - MIN_TIME_BEFORE_END_BUFFER_SECONDS - MIN_ACCEPTABLE_SUB_INTERVAL / 2) {
        debugLog("EquityAdjust: Last sub too close to segment end or buffer for effective adjustment.");
        return currentPlan;
    }

    let tempPlayTimes = {};
    rotatablePlayers.forEach(p => tempPlayTimes[p] = 0);
    let tempOnField = generatedLineups[0] ? generatedLineups[0].slice() : rotatablePlayers.slice(0, numSpotsOnField);

    let prevSubTime = 0;
    for (let k = 0; k <= lastSubEventIndex; k++) {
        const subTime = (k === lastSubEventIndex) ? T_last_sub_time : adjustedPlan[k].time;
        const durationOfThisStint = subTime - prevSubTime;

        tempOnField.forEach(p => tempPlayTimes[p] += durationOfThisStint);

        if (k < lastSubEventIndex) { 
            const sub = adjustedPlan[k];
            tempOnField = tempOnField.filter(p => !sub.off.includes(p));
            tempOnField.push(...sub.on);
            if (tempOnField.length > numSpotsOnField) {
                tempOnField = tempOnField.slice(0, numSpotsOnField);
            }
        }
        prevSubTime = subTime;
    }

    let playTimesWithOriginalLastSub = JSON.parse(JSON.stringify(tempPlayTimes));
    let fieldAfterOriginalLastSub = [...tempOnField]; 
    fieldAfterOriginalLastSub = fieldAfterOriginalLastSub.filter(p => !lastSubEvent.off.includes(p));
    fieldAfterOriginalLastSub.push(...lastSubEvent.on);
    if (fieldAfterOriginalLastSub.length > numSpotsOnField) {
         fieldAfterOriginalLastSub = fieldAfterOriginalLastSub.slice(0, numSpotsOnField);
    }
    fieldAfterOriginalLastSub.forEach(p => playTimesWithOriginalLastSub[p] += remainingGameTimeAfterLastSub);


    let playerStatsOriginal = rotatablePlayers.map(p => ({ name: p, time: playTimesWithOriginalLastSub[p] || 0 })).sort((a, b) => a.time - b.time);
    const minTimeOriginal = playerStatsOriginal.length > 0 ? playerStatsOriginal[0].time : 0;
    const maxTimeOriginal = playerStatsOriginal.length > 0 ? playerStatsOriginal[playerStatsOriginal.length - 1].time : 0;
    const originalVariance = maxTimeOriginal - minTimeOriginal;

    debugLog(`EquityAdjust: Original last sub (${lastSubEvent.off.join(',')}/${lastSubEvent.on.join(',')}). MinT: ${formatTime(minTimeOriginal)}, MaxT: ${formatTime(maxTimeOriginal)}, Var: ${formatTime(originalVariance)}`);

    let fieldCandidatesForOff = tempOnField.map(p => ({
        name: p,
        projectedTimeIfStays: (tempPlayTimes[p] || 0) + remainingGameTimeAfterLastSub, 
        projectedTimeIfSubbedOutNow: tempPlayTimes[p] || 0, 
        currentAccumulatedTime: tempPlayTimes[p] || 0,
        originalOrder: allPlayers.indexOf(p) 
    })).sort((a, b) => { 
        if (b.projectedTimeIfStays !== a.projectedTimeIfStays) return b.projectedTimeIfStays - a.projectedTimeIfStays;
        return a.originalOrder - b.originalOrder;
    });

    let playersOnBenchAtLastSub = rotatablePlayers.filter(p => !tempOnField.includes(p));
    let benchCandidatesForOn = playersOnBenchAtLastSub.map(p => ({
        name: p,
        projectedTimeIfStaysOnBench: tempPlayTimes[p] || 0, 
        projectedTimeIfSubbedOnNow: (tempPlayTimes[p] || 0) + remainingGameTimeAfterLastSub, 
        currentAccumulatedTime: tempPlayTimes[p] || 0,
        originalOrder: allPlayers.indexOf(p)
    })).sort((a, b) => { 
        if (a.projectedTimeIfSubbedOnNow !== b.projectedTimeIfSubbedOnNow) return a.projectedTimeIfSubbedOnNow - b.projectedTimeIfSubbedOnNow;
        return a.originalOrder - b.originalOrder;
    });


    let newOff = [];
    let newOn = [];

    for (let k = 0; k < subsPerChangeForSegment; k++) {
        if (fieldCandidatesForOff.length > k && benchCandidatesForOn.length > k) {
            const candidateOff = fieldCandidatesForOff[k];
            const candidateOn = benchCandidatesForOn[k];
            if (candidateOff.projectedTimeIfStays > candidateOn.projectedTimeIfSubbedOnNow + (MIN_ACCEPTABLE_SUB_INTERVAL / 4)) { 
                 newOff.push(candidateOff.name);
                 newOn.push(candidateOn.name);
            } else {
                break;
            }
        } else {
            break; 
        }
    }

    const actualSubsToMake = Math.min(newOff.length, newOn.length);
    newOff = newOff.slice(0, actualSubsToMake).sort(); 
    newOn = newOn.slice(0, actualSubsToMake).sort();   

    if (actualSubsToMake > 0 && (newOff.join(',') !== lastSubEvent.off.sort().join(',') || newOn.join(',') !== lastSubEvent.on.sort().join(',')) ) {
        let playTimesWithAdjustedLastSub = JSON.parse(JSON.stringify(tempPlayTimes));
        let fieldAfterAdjustedLastSub = [...tempOnField]; 
        fieldAfterAdjustedLastSub = fieldAfterAdjustedLastSub.filter(p => !newOff.includes(p));
        fieldAfterAdjustedLastSub.push(...newOn);
        if (fieldAfterAdjustedLastSub.length > numSpotsOnField) {
            fieldAfterAdjustedLastSub = fieldAfterAdjustedLastSub.slice(0, numSpotsOnField);
        }
        fieldAfterAdjustedLastSub.forEach(p => playTimesWithAdjustedLastSub[p] += remainingGameTimeAfterLastSub);

        let playerStatsAdjusted = rotatablePlayers.map(p => ({ name: p, time: playTimesWithAdjustedLastSub[p] || 0 })).sort((a, b) => a.time - b.time);
        const minTimeAdjusted = playerStatsAdjusted.length > 0 ? playerStatsAdjusted[0].time : 0;
        const maxTimeAdjusted = playerStatsAdjusted.length > 0 ? playerStatsAdjusted[playerStatsAdjusted.length - 1].time : 0;
        const adjustedVariance = maxTimeAdjusted - minTimeAdjusted;

        debugLog(`EquityAdjust: Potential new sub (${newOff.join(',')}/${newOn.join(',')}). MinT: ${formatTime(minTimeAdjusted)}, MaxT: ${formatTime(maxTimeAdjusted)}, Var: ${formatTime(adjustedVariance)}`);

        if (adjustedVariance < originalVariance && (originalVariance - adjustedVariance >= 5)) {
            debugLog("EquityAdjust: Applying adjusted last sub.");
            adjustedPlan[lastSubEventIndex].off = newOff; 
            adjustedPlan[lastSubEventIndex].on = newOn;   
            return adjustedPlan;
        } else {
            debugLog("EquityAdjust: Original last sub kept or adjustment not significantly better/worse.");
            return currentPlan; 
        }
    } else if (actualSubsToMake === 0 && lastSubEvent.off.length > 0) { // This means the equity adjuster decided no sub is best
        let playTimesWithNoSub = JSON.parse(JSON.stringify(tempPlayTimes));
        tempOnField.forEach(p => playTimesWithNoSub[p] += remainingGameTimeAfterLastSub); 

        let playerStatsNoSub = rotatablePlayers.map(p => ({ name: p, time: playTimesWithNoSub[p] || 0 })).sort((a,b) => a.time - b.time);
        const minTimeNoSub = playerStatsNoSub.length > 0 ? playerStatsNoSub[0].time : 0;
        const maxTimeNoSub = playerStatsNoSub.length > 0 ? playerStatsNoSub[playerStatsNoSub.length-1].time : 0;
        const noSubVariance = maxTimeNoSub-minTimeNoSub;

        if (noSubVariance < originalVariance && (originalVariance - noSubVariance >=5)) {
            debugLog(`EquityAdjust: Decided NO sub is better for the last event. MinT: ${formatTime(minTimeNoSub)}, MaxT: ${formatTime(maxTimeNoSub)}, Var: ${formatTime(noSubVariance)}`);
            adjustedPlan[lastSubEventIndex].off = []; // Make it an empty sub
            adjustedPlan[lastSubEventIndex].on = [];
            return adjustedPlan;
        } else {
             debugLog("EquityAdjust: Original last sub kept as 'no sub' was not significantly better for equity.");
             return currentPlan;
        }

    } else {
        debugLog("EquityAdjust: Could not form any valid alternative subs or new sub is same as original. Using original plan.");
        return currentPlan;
    }
}


function getNextScheduledSubstitution() {
    if (!optimizedSubPlan || optimizedSubPlan.length === 0) return null;
    return optimizedSubPlan.find(sub => sub.time === nextSubTimeInPeriod) || null;
}

function getPlayersForSubstitutionAtTime(targetTime) {
    const subDetail = optimizedSubPlan.find(s => s.time === targetTime);

    if (!subDetail) {
        debugLog(`getPlayersForSubAtTime: No specific plan detail found for sub time ${formatTime(targetTime)}.`);
        return { playersOff: [], playersOn: [] };
    }

    if ((!subDetail.off || subDetail.off.length === 0) && (!subDetail.on || subDetail.on.length === 0)) {
        debugLog(`getPlayersForSubAtTime: Plan detail for ${formatTime(targetTime)} is an empty sub (no players off/on). Skipping.`);
        return { playersOff: [], playersOn: [] };
    }
    if (!subDetail.off || !subDetail.on || subDetail.off.length !== subDetail.on.length) {
        debugLog(`getPlayersForSubAtTime: Plan detail for ${formatTime(targetTime)} has mismatched off/on arrays. Off: ${subDetail.off?.join(',')}, On: ${subDetail.on?.join(',')}.`);
        return { playersOff: [], playersOn: [] };
    }

    debugLog(`getPlayersForSubAtTime: Evaluating plan for ${formatTime(targetTime)}. Plan: OFF [${subDetail.off.join(',')}] for ON [${subDetail.on.join(',')}]. SubsPerChange Setting: ${gameSettings.subsPerChange}`);

    const finalPlayersOff = [];
    const finalPlayersOn = [];
    let validatedSubsCount = 0;
    const numberOfPairsInPlanDetail = subDetail.off.length; 

    for (let i = 0; i < numberOfPairsInPlanDetail; i++) {
        if (validatedSubsCount >= gameSettings.subsPerChange) {
            debugLog(`getPlayersForSubAtTime: Reached subsPerChange limit (${gameSettings.subsPerChange}).`);
            break;
        }

        const pOff = subDetail.off[i];
        const pOn = subDetail.on[i];
        let pOffIsValid = true;
        let pOffReason = "";

        if (!onField.includes(pOff)) {
            pOffIsValid = false;
            pOffReason = `${pOff} not on field.`;
        } else if (playerGKStatus[pOff]) {
            pOffIsValid = false;
            pOffReason = `${pOff} is GK.`;
        } else if (playerRemovedStatus[pOff]) {
            pOffIsValid = false;
            pOffReason = `${pOff} is removed.`;
        } else {
            const validStintStart = (typeof playerCurrentStintStart[pOff] === 'number');
            const actualStintDuration = validStintStart ? (currentGameSeconds - playerCurrentStintStart[pOff]) : 0;

            if (actualStintDuration < MIN_TIME_ON_FIELD_SECONDS) {
                 pOffIsValid = false;
                 pOffReason = `${pOff} stint too short (${formatTime(actualStintDuration)} < ${formatTime(MIN_TIME_ON_FIELD_SECONDS)}). Stint started at ${validStintStart ? formatTime(playerCurrentStintStart[pOff]) : 'N/A'}. Current game time: ${formatTime(currentGameSeconds)}.`;
            }
        }

        let pOnIsValid = true;
        let pOnReason = "";

        if (onField.includes(pOn)) {
            pOnIsValid = false;
            pOnReason = `${pOn} already on field.`;
        } else if (!allPlayers.includes(pOn)) {
            pOnIsValid = false;
            pOnReason = `${pOn} is not in allPlayers list.`;
        } else if (playerGKStatus[pOn]) {
            pOnIsValid = false;
            pOnReason = `${pOn} is GK.`;
        } else if (playerRemovedStatus[pOn]) {
            pOnIsValid = false;
            pOnReason = `${pOn} is removed.`;
        } else if (!onBench.includes(pOn)) {
            pOnIsValid = false;
            pOnReason = `${pOn} not on current bench list.`;
        }

        if (pOffIsValid && pOnIsValid) {
            if (finalPlayersOff.includes(pOff) || finalPlayersOn.includes(pOn) || finalPlayersOff.includes(pOn) || finalPlayersOn.includes(pOff)) {
                 debugLog(`getPlayersForSubAtTime: Skipping pair ${pOff}/${pOn} due to potential duplicate entry in this sub event.`);
                 continue;
            }
            finalPlayersOff.push(pOff);
            finalPlayersOn.push(pOn);
            validatedSubsCount++;
            debugLog(`getPlayersForSubAtTime: Validated pair: ${pOff} (OFF) for ${pOn} (ON).`);
        } else {
            if (!pOffIsValid) debugLog(`getPlayersForSubAtTime: Planned player OFF ${pOff} is INELIGIBLE. Reason: ${pOffReason}`);
            if (!pOnIsValid) debugLog(`getPlayersForSubAtTime: Planned player ON ${pOn} is INELIGIBLE. Reason: ${pOnReason}`);
            debugLog(`getPlayersForSubAtTime: Skipping planned pair ${pOff} for ${pOn}.`);
        }
    }

    if (finalPlayersOff.length !== finalPlayersOn.length) {
        debugLog(`ERROR in getPlayersForSubAtTime: Mismatch in final off/on counts. Off: ${finalPlayersOff.length}, On: ${finalPlayersOn.length}. Clearing for safety.`);
        return { playersOff: [], playersOn: [] };
    }

    debugLog(`getPlayersForSubAtTime: Final validated players for sub @${formatTime(targetTime)}. OFF: [${finalPlayersOff.join(',')}], ON: [${finalPlayersOn.join(',')}]. Count: ${validatedSubsCount}`);
    return { playersOff: finalPlayersOff, playersOn: finalPlayersOn };
}

function confirmSubstitution() {
    const actualSubsMadeCount = pendingOutPlayers.length;
    if (!confirmSubButton || confirmSubButton.disabled || !subIsPending || isModalOpen || actualSubsMadeCount === 0 || pendingInPlayers.length !== actualSubsMadeCount) {
        if (subIsPending && (actualSubsMadeCount === 0 || pendingInPlayers.length !== actualSubsMadeCount)) {
            showStatusMessage("Auto sub conditions changed. Sub cancelled.", 4000);
            subIsPending = false; pendingOutPlayers = []; pendingInPlayers = []; pendingSubTriggerTime = null;
            recalculateRemainingAutoSubTimes(); updateDisplay();
        }
        return;
    }
    const playersOff = pendingOutPlayers; const playersOn = pendingInPlayers; let errorMsg = null;
    playersOn.forEach(p => {
        if (playerGKStatus[p]) errorMsg = `Cannot sub GK ${p}.`;
        if (playerRemovedStatus[p]) errorMsg = `Cannot sub removed ${p}.`;
        if (onField.includes(p)) errorMsg = `${p} already on field.`;
    });
    playersOff.forEach(p => {
        if (!onField.includes(p)) errorMsg = `${p} not on field.`;
        if (playerGKStatus[p]) errorMsg = `Cannot auto sub GK ${p}.`;
    });

    if (errorMsg) {
        showStatusMessage(`Auto sub fail: ${errorMsg}`, 5000);
        subIsPending = false; pendingOutPlayers = []; pendingInPlayers = []; pendingSubTriggerTime = null;
        recalculateRemainingAutoSubTimes(); updateDisplay();
        return;
    }

    onField = onField.filter(p => !playersOff.includes(p));
    onField.push(...playersOn);
    onBench = onBench.filter(p => !playersOn.includes(p));
    onBench.push(...playersOff); 
    sortOnBenchQueue();
    const currentTime = currentGameSeconds; 
    playersOn.forEach(p => playerCurrentStintStart[p] = currentTime);
    playersOff.forEach(p => playerCurrentStintStart[p] = null); 
    debugLog(`Sub confirmed @ ${formatTime(currentTime)}: ${playersOff.join(',')} OFF, ${playersOn.join(',')} ON.`);
    showStatusMessage(`Auto Sub (${actualSubsMadeCount}x): ${playersOff.join(',')} OFF, ${playersOn.join(',')} ON`);
    subIsPending = false;
    pendingOutPlayers = [];
    pendingInPlayers = [];
    pendingSubTriggerTime = null;
    recalculateRemainingAutoSubTimes();
    updateDisplay();
}

function recalculateRemainingAutoSubTimes() {
    debugLog("Recalculating remaining auto sub times (uses global optimizedSubSchedule which has absolute times)...");
    if (periodLengthSeconds <= 0 || gameSettings.numPeriods <= 0 || allPlayers.length === 0 || gameSettings.subsPerChange === 0) {
        nextSubTimeInPeriod = Infinity; targetSubTimes = [];
        debugLog("Recalc: No valid params/subs disabled. Next sub: Infinity.");
        return;
    }

    const fullGameDuration = periodLengthSeconds * gameSettings.numPeriods;
    if (fullGameDuration > 0 && (currentGameSeconds + MIN_ACCEPTABLE_SUB_INTERVAL + MIN_TIME_BEFORE_END_BUFFER_SECONDS) > fullGameDuration) {
        nextSubTimeInPeriod = Infinity; targetSubTimes = [];
        debugLog("Recalc: Too close to game end for more subs. Next sub: Infinity.");
        return;
    }

    targetSubTimes = optimizedSubSchedule.filter(time => time > currentGameSeconds);
    nextSubTimeInPeriod = targetSubTimes.length > 0 ? targetSubTimes[0] : Infinity;

    debugLog("Recalc: Updated sub times:", {
        currentGameSeconds: formatTime(currentGameSeconds),
        nextPlannedSubTimeAbsolute: formatTime(nextSubTimeInPeriod),
        remainingPlannedSubTimesAbsolute: targetSubTimes.map(t => formatTime(t))
    });
}
// --- END OF FILE substitution-logic.js ---