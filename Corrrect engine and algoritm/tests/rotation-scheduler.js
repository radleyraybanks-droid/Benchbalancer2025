/**
 * Generate a rotation schedule with configurable time constraints.
 * All time-based arguments are expressed in minutes.
 */
function GenerateRotationSchedule(
    totalPlayers,
    gameLength,
    starters = 5,
    planningSegmentSize = 1,
    executionSegmentSize = 3,
    maxRegularSubs = 2,
    max3PlayerSubs = 3,
    halftimeMinute = gameLength / 2,
    minGapBetweenSubs = 3.0,
    endPeriodLockout = 0.75,
    allow3PlayerMinGap = 5.0
) {
    if (!Number.isFinite(totalPlayers) || totalPlayers < starters) {
        throw new Error('totalPlayers must be at least the number of starters');
    }
    if (!Number.isFinite(gameLength) || gameLength <= 0) {
        throw new Error('gameLength must be positive');
    }

    const totalPlayerMinutes = starters * gameLength;
    const avgMinutesPerPlayer = totalPlayerMinutes / totalPlayers;
    const minutesHigh = Math.ceil(avgMinutesPerPlayer);
    const minutesLow = Math.floor(avgMinutesPerPlayer);
    const totalHighMinutes = totalPlayerMinutes - minutesLow * totalPlayers;
    const playersGettingHigh = totalHighMinutes;
    const playersGettingLow = totalPlayers - playersGettingHigh;

    const playerTargetMinutes = new Array(totalPlayers + 1).fill(minutesLow);
    for (let i = 1; i <= playersGettingHigh; i += 1) {
        playerTargetMinutes[i] = minutesHigh;
    }

    console.log('Target distribution:');
    console.log(`  ${playersGettingHigh} players: ${minutesHigh} min`);
    console.log(`  ${playersGettingLow} players: ${minutesLow} min`);

    const legalSubWindows = GenerateLegalSubWindows(
        gameLength,
        halftimeMinute,
        minGapBetweenSubs,
        endPeriodLockout,
        totalPlayers,
        starters
    );

    console.log('\nLegal substitution windows:');
    legalSubWindows.forEach((window) => {
        console.log(`  ${FormatTime(window.time)} (${window.period})`);
    });

    const startingLineup = Array.from({ length: starters }, (_, idx) => idx + 1);
    const courtTimeline = [{
        time: 0,
        players: [...startingLineup]
    }];

    const playerMinutesPlayed = new Array(totalPlayers + 1).fill(0);
    const playerLastOnCourt = new Array(totalPlayers + 1).fill(-Infinity);
    const substitutionLog = [];

    let currentLineup = [...startingLineup];
    let lastAccountedTime = 0;
    let lastSubstitutionTime = 0;
    let threePlayerSubsUsed = 0;

    startingLineup.forEach((player) => {
        playerLastOnCourt[player] = 0;
    });

    legalSubWindows.forEach((window) => {
        const subTime = window.time;
        let timeElapsed = subTime - lastAccountedTime;
        if (timeElapsed < 0) {
            if (Math.abs(timeElapsed) < 1e-6) {
                timeElapsed = 0;
            } else {
                throw new Error(`Substitution window ${FormatTime(subTime)} precedes previous timeline entry`);
            }
        }

        currentLineup.forEach((player) => {
            playerMinutesPlayed[player] += timeElapsed;
            playerLastOnCourt[player] = subTime;
        });
        lastAccountedTime = subTime;

        const playerStatus = [];
        for (let player = 1; player <= totalPlayers; player += 1) {
            const played = playerMinutesPlayed[player];
            const target = playerTargetMinutes[player];
            const minutesNeeded = target - played;
            playerStatus[player] = {
                player,
                played,
                target,
                needed: minutesNeeded,
                priority: minutesNeeded,
                onCourt: currentLineup.includes(player)
            };
        }
        const playerStatusList = playerStatus.slice(1);

        const isHalftime = Math.abs(subTime - halftimeMinute) < 1e-6;
        let newLineup = [...currentLineup];
        let subType = '';
        let executedPlayersOff = [];
        let executedPlayersOn = [];

        if (isHalftime) {
            newLineup = SelectHalftimePlayers(playerStatusList, starters, startingLineup, halftimeMinute);
            subType = 'HALF-TIME';
        } else {
            const timeSinceLastSub = subTime - lastSubstitutionTime;
            const progressFactor = Math.min(1, Math.max(0, subTime / gameLength));
            const futureWindows = GetRemainingWindows(legalSubWindows, subTime, gameLength);
            const remainingWindowsCount = futureWindows.length;

            let balanceThreshold = calculateDynamicThreshold(
                subTime,
                gameLength,
                remainingWindowsCount,
                totalPlayers
            );

            const currentVariance = CalculateVariance(playerMinutesPlayed, playerTargetMinutes);
            const currentMaxDeviation = MaxDeviation(playerMinutesPlayed, playerTargetMinutes);

            const projection = PredictFinalBalance(
                playerMinutesPlayed,
                playerTargetMinutes,
                currentLineup,
                subTime,
                gameLength,
                futureWindows
            );

            const onCourtStatuses = playerStatusList
                .filter((status) => status.onCourt)
                .sort((a, b) => {
                    if (a.needed === b.needed) {
                        return b.played - a.played;
                    }
                    return a.needed - b.needed;
                });

            const benchStatuses = playerStatusList
                .filter((status) => !status.onCourt)
                .sort((a, b) => {
                    if (a.needed === b.needed) {
                        return a.played - b.played;
                    }
                    return b.needed - a.needed;
                });

            const { candidatesOff, candidatesOn } = getDynamicCandidates(playerStatusList, progressFactor);

            const mustBringOn = candidatesOn.filter((status) => {
                if (status.needed <= 0.5) {
                    return false;
                }
                const lastOn = playerLastOnCourt[status.player];
                if (!Number.isFinite(lastOn)) {
                    return true;
                }
                return (subTime - lastOn) >= Math.max(minGapBetweenSubs, 2);
            });

            const mustTakeOff = candidatesOff.filter((status) => status.needed < -0.75);
            const mustBringOnSet = new Set(mustBringOn.map((status) => status.player));

            const forcedCorrection = shouldForceSubstitution(
                subTime,
                gameLength,
                playerMinutesPlayed,
                playerTargetMinutes,
                timeSinceLastSub,
                minGapBetweenSubs,
                remainingWindowsCount
            );

            let forceSub = projection.warning || currentMaxDeviation > 2.5
                || mustBringOn.length > 0
                || mustTakeOff.length > 0;

            if (forcedCorrection.force) {
                forceSub = true;
                balanceThreshold = Math.min(balanceThreshold, 0.15);
            }

            if (window.forcedBalance) {
                balanceThreshold = Math.min(balanceThreshold, 0.1);
                if (currentMaxDeviation > 0.4 || currentVariance > balanceThreshold) {
                    forceSub = true;
                }
            }

            if (remainingWindowsCount <= 3 && currentMaxDeviation > 1.2) {
                forceSub = true;
                balanceThreshold = Math.min(balanceThreshold, 0.2);
            }

            if (remainingWindowsCount <= 2) {
                forceSub = true;
                balanceThreshold = Math.min(balanceThreshold, 0.1);
            }

            const gapCheck = canSubstituteAtWindow(
                window,
                lastSubstitutionTime,
                currentMaxDeviation,
                remainingWindowsCount,
                progressFactor,
                minGapBetweenSubs
            );

            if (!forceSub && currentVariance <= balanceThreshold && !isHalftime) {
                currentLineup = [...newLineup];
                return;
            }

            if (!isHalftime) {
                if (!forceSub && !gapCheck.allowed) {
                    currentLineup = [...newLineup];
                    return;
                }

                if (forceSub && !gapCheck.allowed) {
                    const relaxedGap = Math.max(0.5, gapCheck.effectiveGap * 0.5);
                    if (gapCheck.actualGap < relaxedGap) {
                        currentLineup = [...newLineup];
                        return;
                    }
                }
            }

            const prioritizedOff = mergeUniqueStatusLists([
                mustTakeOff.sort((a, b) => a.needed - b.needed),
                candidatesOff,
                onCourtStatuses
            ]);
            const prioritizedOn = mergeUniqueStatusLists([
                mustBringOn.sort((a, b) => b.needed - a.needed),
                candidatesOn,
                benchStatuses
            ]);

            const dynamicNeedGap = forceSub || remainingWindowsCount <= 2
                ? 0
                : Math.max(0.1, 0.5 * (1 - progressFactor * 0.4));

            let maxSubsAllowed = Math.min(
                prioritizedOff.length,
                prioritizedOn.length,
                executionSegmentSize,
                maxRegularSubs
            );

            let allowThreePlayer = should3PlayerBeConsidered(
                progressFactor,
                currentMaxDeviation,
                remainingWindowsCount,
                threePlayerSubsUsed,
                max3PlayerSubs,
                candidatesOff,
                candidatesOn
            );

            if (allowThreePlayer && executionSegmentSize < 3) {
                allowThreePlayer = false;
            }

            if (maxSubsAllowed <= 0) {
                currentLineup = [...newLineup];
                return;
            }

            const largeBench = totalPlayers - starters >= 4;
            const bestTwoOption = selectBestSubstitution(
                prioritizedOff,
                prioritizedOn,
                playerMinutesPlayed,
                currentLineup,
                subTime,
                gameLength,
                legalSubWindows,
                playerTargetMinutes,
                2,
                starters,
                mustBringOn,
                mustTakeOff
            );

            let bestOption = bestTwoOption ? { ...bestTwoOption, type: '2-player' } : null;

            const twoPlayerProjectedDev = bestTwoOption ? bestTwoOption.projectedMaxDev : Number.POSITIVE_INFINITY;
            const threeDecision = evaluate3PlayerNeed(
                progressFactor,
                currentMaxDeviation,
                twoPlayerProjectedDev,
                threePlayerSubsUsed,
                max3PlayerSubs,
                totalPlayers,
                candidatesOn
            );

            const minGapForThree = Math.max(minGapBetweenSubs * 0.75, allow3PlayerMinGap * 0.5);
            let allowThreeNow = allowThreePlayer && timeSinceLastSub >= minGapForThree;
            if (threeDecision.force) {
                allowThreeNow = timeSinceLastSub >= minGapForThree;
            }

            let threeOptionResult = null;
            if (allowThreeNow) {
                threeOptionResult = selectBestSubstitution(
                    prioritizedOff,
                    prioritizedOn,
                    playerMinutesPlayed,
                    currentLineup,
                    subTime,
                    gameLength,
                    legalSubWindows,
                    playerTargetMinutes,
                    3,
                    starters,
                    mustBringOn,
                    mustTakeOff
                );

                if (threeOptionResult) {
                    const improvementTwo = bestTwoOption
                        ? currentMaxDeviation - bestTwoOption.projectedMaxDev
                        : 0;
                    const improvementThree = currentMaxDeviation - threeOptionResult.projectedMaxDev;
                    if (
                        threeDecision.force
                        || !bestOption
                        || improvementThree > improvementTwo + 0.3
                        || mustBringOn.length >= 3
                    ) {
                        bestOption = { ...threeOptionResult, type: '3-player' };
                    }
                    if (
                        threeDecision.suggest
                        && (!bestOption || threeOptionResult.projectedMaxDev < (bestOption.projectedMaxDev ?? Infinity))
                    ) {
                        bestOption = { ...threeOptionResult, type: '3-player' };
                    }
                }
            }

            const targetMaxDeviation = totalPlayers <= 8 ? 0.8 : totalPlayers <= 10 ? 1.0 : 1.2;
            if (
                bestOption
                && bestOption.projectedMaxDev !== undefined
                && bestOption.projectedMaxDev > targetMaxDeviation
                && threeOptionResult
            ) {
                bestOption = { ...threeOptionResult, type: '3-player' };
            }

            if ((!bestOption || (bestOption.projectedMaxDev !== undefined && bestOption.projectedMaxDev >= currentMaxDeviation - 0.2)) && mustBringOn.length > 0) {
                const forcedCount = Math.min(
                    allowThreeNow ? Math.min(3, executionSegmentSize) : Math.min(2, executionSegmentSize),
                    prioritizedOff.length,
                    prioritizedOn.length,
                    mustBringOn.length
                );
                if (forcedCount > 0) {
                    bestOption = {
                        off: prioritizedOff.slice(0, forcedCount),
                        on: prioritizedOn.slice(0, forcedCount),
                        type: forcedCount === 3 ? '3-player' : `${forcedCount}-player`
                    };
                }
            }

            if (!bestOption || !bestOption.off || !bestOption.on || bestOption.off.length === 0) {
                currentLineup = [...newLineup];
                return;
            }

            executedPlayersOff = bestOption.off.map((status) => status.player);
            executedPlayersOn = bestOption.on.map((status) => status.player);

            newLineup = currentLineup.filter((player) => !executedPlayersOff.includes(player));
            executedPlayersOn.forEach((player) => {
                if (!newLineup.includes(player)) {
                    newLineup.push(player);
                }
            });
            newLineup = newLineup.sort((a, b) => a - b);

            if (bestOption.type === '3-player') {
                threePlayerSubsUsed += 1;
                subType = '3-player sub';
            } else {
                subType = `${executedPlayersOff.length}-player sub`;
            }
        }

        if (isHalftime || executedPlayersOff.length > 0) {
            const lineupBefore = [...currentLineup];
            const lineupAfter = [...newLineup];
            const playersOff = lineupBefore.filter((player) => !lineupAfter.includes(player));
            const playersOn = lineupAfter.filter((player) => !lineupBefore.includes(player));

            currentLineup = [...lineupAfter];

            substitutionLog.push({
                time: subTime,
                lineupBefore,
                lineupAfter,
                playersOff,
                playersOn,
                type: subType
            });

            courtTimeline.push({
                time: subTime,
                players: lineupAfter
            });

            lastSubstitutionTime = subTime;
        } else {
            currentLineup = [...newLineup];
        }
    });

    const finalTimeElapsed = gameLength - lastAccountedTime;
    currentLineup.forEach((player) => {
        playerMinutesPlayed[player] += finalTimeElapsed;
        playerLastOnCourt[player] = gameLength;
    });

    console.log('\n=== ROTATION SCHEDULE ===');
    console.log('Time    | Players On Court     | Off → On              | Type');
    console.log('--------+----------------------+-----------------------+--------------');
    console.log(`${FormatTime(0)} | ${FormatPlayers(startingLineup)} | Starting lineup       | -`);

    substitutionLog.forEach((sub) => {
        const offList = FormatPlayers(sub.playersOff);
        const onList = FormatPlayers(sub.playersOn);
        console.log(`${FormatTime(sub.time)} | ${FormatPlayers(sub.lineupAfter)} | ${offList} → ${onList} | ${sub.type}`);
    });

    console.log('\n=== FINAL PLAYING TIME ===');
    for (let player = 1; player <= totalPlayers; player += 1) {
        const actual = roundTo(playerMinutesPlayed[player], 3);
        const target = playerTargetMinutes[player];
        const diff = roundTo(actual - target, 3);
        const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
        console.log(`Player ${player}: ${actual} min (target: ${target} min, ${diffStr} min)`);
    }

    const maxMinutes = Math.max(...playerMinutesPlayed.slice(1));
    const minMinutes = Math.min(...playerMinutesPlayed.slice(1));
    const maxDiff = roundTo(maxMinutes - minMinutes, 3);

    console.log('\n=== BALANCE METRICS ===');
    console.log(`Max difference: ${maxDiff} min`);
    console.log(`3-player subs used: ${threePlayerSubsUsed}/${max3PlayerSubs}`);
    console.log(`Total substitutions: ${substitutionLog.length}`);

    if (maxDiff <= 1) {
        console.log('✓ Excellent balance!');
    } else if (maxDiff <= 2) {
        console.log('✓ Good balance');
    } else {
        console.log('⚠ Balance could be improved');
    }

    return {
        substitutionLog,
        playerMinutesPlayed: playerMinutesPlayed.slice(1),
        targetMinutes: playerTargetMinutes.slice(1),
        totalPlayers,
        threePlayerSubsUsed,
        maxThreePlayerSubs: max3PlayerSubs,
        legalWindows: legalSubWindows
    };
}

function GenerateLegalSubWindows(gameLength, halftimeMinute, minGap, endPeriodLockout, totalPlayers, starters = 5) {
    return generateAdaptiveSubWindows(
        gameLength,
        halftimeMinute,
        endPeriodLockout,
        totalPlayers,
        minGap,
        starters
    );
}

function CountRemainingWindows(windows, currentTime, gameLength) {
    return windows.filter((window) => window.time > currentTime && window.time < gameLength).length;
}

function GetRemainingWindows(windows, currentTime, gameLength) {
    return windows
        .filter((window) => window.time > currentTime && window.time < gameLength)
        .sort((a, b) => a.time - b.time);
}

function generateAdaptiveSubWindows(
    gameLength,
    halftimeMinute,
    endPeriodLockout,
    totalPlayers,
    defaultGap = 3,
    starters = 5
) {
    const epsilon = 1e-6;
    const windows = [];

    const pushWindow = (time, period, gap, forcedBalance = false) => {
        if (time <= epsilon || time >= gameLength - endPeriodLockout + epsilon) {
            return;
        }
        const rounded = roundTo(time);
        if (!windows.some((w) => Math.abs(w.time - rounded) < epsilon)) {
            windows.push({
                time: rounded,
                period,
                minGap: roundTo(gap, 2),
                forcedBalance
            });
        }
    };

    // Phase 1: Early (0-33%) – 4 minute gaps
    const phase1Gap = Math.max(defaultGap + 1, 4);
    const phase1End = Math.min(gameLength * 0.33, halftimeMinute - endPeriodLockout);
    let currentTime = phase1Gap;
    while (currentTime <= phase1End + epsilon) {
        pushWindow(currentTime, 'early', phase1Gap);
        currentTime += phase1Gap;
    }

    // Phase 2: Mid (33-67%) – 3 minute gaps
    const phase2Gap = Math.max(defaultGap, 3);
    const phase2End = Math.min(gameLength * 0.67, halftimeMinute - endPeriodLockout);
    currentTime = Math.max(currentTime, phase1End + 0.5) + phase2Gap;
    while (currentTime <= phase2End + epsilon) {
        pushWindow(currentTime, 'mid', phase2Gap);
        currentTime += phase2Gap;
    }

    // Halftime
    pushWindow(halftimeMinute, 'halftime', 0);

    // Phase 3: Late (67-85%) – 2.5 minute gaps
    const phase3Gap = Math.max(defaultGap * 0.8, 2.5);
    const phase3End = Math.min(gameLength * 0.85, gameLength - endPeriodLockout);
    currentTime = halftimeMinute + phase3Gap;
    while (currentTime <= phase3End + epsilon) {
        pushWindow(currentTime, 'late', phase3Gap);
        currentTime += phase3Gap;
    }

    // Phase 4: Final (85-90%) – 2 minute gaps
    const phase4Gap = Math.max(defaultGap * 0.65, 2.0);
    const phase4End = Math.min(gameLength * 0.9, gameLength - endPeriodLockout);
    const lastPhase3Window = windows.length ? windows[windows.length - 1].time : halftimeMinute;
    let phase4Time = Math.max(lastPhase3Window + phase4Gap, phase3End);
    while (phase4Time <= phase4End + epsilon) {
        pushWindow(phase4Time, 'final', phase4Gap);
        phase4Time += phase4Gap;
    }

    // Phase 5: Ultra late (90%+) – 1.5 minute micro adjustments
    const phase5Gap = Math.max(defaultGap * 0.5, 1.5);
    const lastPhase4Window = windows.length ? windows[windows.length - 1].time : phase4End;
    let phase5Time = Math.max(lastPhase4Window + phase5Gap, phase4End + phase5Gap);
    while (phase5Time <= gameLength - endPeriodLockout + epsilon) {
        pushWindow(phase5Time, 'ultra_late', phase5Gap, true);
        phase5Time += phase5Gap;
    }

    return windows.sort((a, b) => a.time - b.time);
}

function SelectHalftimePlayers(playerStatus, starters, firstHalfStarters = [], halftimeMinute = null) {
    const firstHalfSet = new Set(firstHalfStarters);
    const fatigueThreshold = halftimeMinute ? Math.max(halftimeMinute * 0.75, 10) : 12;
    const statusByPlayer = new Map();
    playerStatus.forEach((status) => {
        statusByPlayer.set(status.player, status);
    });

    const restedPlayers = [];
    const tiredPlayers = [];

    playerStatus.forEach((status) => {
        if (firstHalfSet.has(status.player) && status.played >= fatigueThreshold) {
            tiredPlayers.push(status);
        } else {
            restedPlayers.push(status);
        }
    });

    const sortByNeed = (a, b) => {
        if (b.needed === a.needed) {
            return a.played - b.played;
        }
        return b.needed - a.needed;
    };

    restedPlayers.sort(sortByNeed);
    tiredPlayers.sort(sortByNeed);

    const lineup = [];
    restedPlayers.forEach((status) => {
        if (lineup.length < starters) {
            lineup.push(status.player);
        }
    });

    tiredPlayers.forEach((status) => {
        if (lineup.length < starters && !lineup.includes(status.player)) {
            lineup.push(status.player);
        }
    });

    if (lineup.length < starters) {
        [...playerStatus]
            .sort(sortByNeed)
            .forEach((status) => {
                if (lineup.length < starters && !lineup.includes(status.player)) {
                    lineup.push(status.player);
                }
            });
    }

    const priorityTired = tiredPlayers.filter((status) => status.needed > 3);
    priorityTired.forEach((status) => {
        if (lineup.includes(status.player)) {
            return;
        }
        let replaceIndex = -1;
        let lowestNeeded = Infinity;
        lineup.forEach((player, index) => {
            const lineupStatus = statusByPlayer.get(player);
            if (!lineupStatus) {
                return;
            }
            if (lineupStatus.needed < lowestNeeded) {
                lowestNeeded = lineupStatus.needed;
                replaceIndex = index;
            }
        });
        if (replaceIndex >= 0 && lowestNeeded < status.needed) {
            lineup[replaceIndex] = status.player;
        }
    });

    const retainedStarters = lineup.filter((player) => firstHalfSet.has(player)).length;
    const minStartersToKeep = Math.min(starters, Math.ceil(starters * 0.6));
    if (retainedStarters < minStartersToKeep) {
        const starterCandidates = playerStatus
            .filter((status) => firstHalfSet.has(status.player) && !lineup.includes(status.player))
            .sort(sortByNeed);

        starterCandidates.forEach((status) => {
            if (lineup.filter((player) => firstHalfSet.has(player)).length >= minStartersToKeep) {
                return;
            }
            const replaceIndex = lineup.findIndex((player) => !firstHalfSet.has(player));
            if (replaceIndex !== -1) {
                lineup[replaceIndex] = status.player;
            }
        });
    }

    return lineup.slice(0, starters).sort((a, b) => a - b);
}

function Calculate2PlayerImprovement(
    currentMinutes,
    targetMinutes,
    playersOff,
    playersOn,
    currentTime,
    gameLength,
    remainingWindows
) {
    if (playersOff.length < 2 || playersOn.length < 2) {
        return 0;
    }

    return CalculateImprovement(
        currentMinutes,
        targetMinutes,
        playersOff,
        playersOn,
        currentTime,
        gameLength,
        remainingWindows
    );
}

function Calculate3PlayerImprovement(
    currentMinutes,
    targetMinutes,
    playersOff,
    playersOn,
    currentTime,
    gameLength,
    remainingWindows
) {
    if (playersOff.length < 3 || playersOn.length < 3) {
        return 0;
    }

    return CalculateImprovement(
        currentMinutes,
        targetMinutes,
        playersOff,
        playersOn,
        currentTime,
        gameLength,
        remainingWindows
    );
}

function CalculateImprovement(
    currentMinutes,
    targetMinutes,
    playersOff,
    playersOn,
    currentTime,
    gameLength,
    remainingWindows
) {
    if (!playersOff.length || !playersOn.length) {
        return 0;
    }

    const simulated = currentMinutes.slice();
    const remainingTime = Math.max(0, gameLength - currentTime);
    const futureWindows = remainingWindows || [];
    const numFutureWindows = futureWindows.length;
    const estimatedTimePerStint = numFutureWindows > 0
        ? remainingTime / (numFutureWindows + 1)
        : remainingTime;

    const nextWindow = futureWindows.length > 0 ? futureWindows[0].time : null;
    const thisStint = nextWindow !== null ? Math.max(0, nextWindow - currentTime) : remainingTime;

    playersOff.forEach((status) => {
        const futureStints = Math.min(2, numFutureWindows);
        if (simulated[status.player] < currentMinutes[status.player]) {
            simulated[status.player] = currentMinutes[status.player];
        }
        simulated[status.player] += futureStints * estimatedTimePerStint * 0.5;
    });

    playersOn.forEach((status) => {
        simulated[status.player] += thisStint;
        const futureStints = Math.max(0, numFutureWindows - 1);
        simulated[status.player] += futureStints * estimatedTimePerStint * 0.3;
    });

    const varianceBefore = CalculateVariance(currentMinutes, targetMinutes);
    const varianceAfter = CalculateVariance(simulated, targetMinutes);
    const maxDevBefore = MaxDeviation(currentMinutes, targetMinutes);
    const maxDevAfter = MaxDeviation(simulated, targetMinutes);

    const improvementVariance = varianceBefore - varianceAfter;
    const improvementMaxDev = maxDevBefore - maxDevAfter;

    return (improvementVariance * 0.3) + (improvementMaxDev * 6.0);
}

function CalculateVariance(actualMinutes, targetMinutes) {
    let totalVariance = 0;
    const length = Math.min(actualMinutes.length, targetMinutes.length);
    for (let player = 1; player < length; player += 1) {
        const diff = (actualMinutes[player] || 0) - (targetMinutes[player] || 0);
        totalVariance += diff * diff;
    }
    return totalVariance;
}

function MaxDeviation(actualMinutes, targetMinutes) {
    let maxDiff = 0;
    const length = Math.min(actualMinutes.length, targetMinutes.length);
    for (let player = 1; player < length; player += 1) {
        const diff = Math.abs((actualMinutes[player] || 0) - (targetMinutes[player] || 0));
        if (diff > maxDiff) {
            maxDiff = diff;
        }
    }
    return maxDiff;
}

function PredictFinalBalance(
    currentMinutes,
    targetMinutes,
    currentLineup,
    currentTime,
    gameLength,
    remainingWindows
) {
    const simulated = currentMinutes.slice();
    const remainingTime = Math.max(0, gameLength - currentTime);

    currentLineup.forEach((player) => {
        simulated[player] += remainingTime;
    });

    const projectedVariance = CalculateVariance(simulated, targetMinutes);
    const projectedMaxDeviation = MaxDeviation(simulated, targetMinutes);
    if (projectedMaxDeviation > 3.0) {
        return {
            warning: true,
            projectedVariance,
            projectedMaxDeviation,
            message: `Current trajectory will cause ${roundTo(projectedMaxDeviation, 2)} min imbalance`,
            action: 'Consider substitution now'
        };
    }

    return {
        warning: false,
        projectedVariance,
        projectedMaxDeviation
    };
}

function calculateDynamicThreshold(subTime, gameLength, remainingWindows, totalPlayers) {
    const progress = Math.max(0, Math.min(1, subTime / gameLength));
    const baseThreshold = totalPlayers / 2;

    let progressMultiplier;
    if (progress < 0.33) {
        progressMultiplier = 1.0;
    } else if (progress < 0.67) {
        progressMultiplier = 0.6;
    } else {
        progressMultiplier = 0.2;
    }

    if (remainingWindows <= 2) {
        progressMultiplier *= 0.3;
    }

    return Math.max(0, baseThreshold * progressMultiplier);
}

function shouldForceSubstitution(
    subTime,
    gameLength,
    currentMinutes,
    targetMinutes,
    timeSinceLastSub,
    standardMinGap,
    remainingWindows
) {
    const maxDev = MaxDeviation(currentMinutes, targetMinutes);
    const checkpoints = [
        { time: gameLength * 0.40, maxAllowedDev: 3.0 },
        { time: gameLength * 0.60, maxAllowedDev: 2.5 },
        { time: gameLength * 0.75, maxAllowedDev: 2.0 },
        { time: gameLength * 0.85, maxAllowedDev: 1.5 }
    ];

    for (const checkpoint of checkpoints) {
        if (subTime >= checkpoint.time && maxDev > checkpoint.maxAllowedDev) {
            if (timeSinceLastSub >= standardMinGap * 0.75) {
                return {
                    force: true,
                    reason: `Checkpoint ${(checkpoint.time / gameLength * 100).toFixed(0)}% exceeded`
                };
            }
        }
    }

    if (remainingWindows <= 2 && maxDev > 1.2) {
        if (timeSinceLastSub >= standardMinGap * 0.5) {
            return {
                force: true,
                reason: `End-game correction (${remainingWindows} windows left)`
            };
        }
    }

    return { force: false, reason: null };
}

function canSubstituteAtWindow(
    window,
    lastSubTime,
    currentMaxDeviation,
    remainingWindows,
    gameProgress,
    fallbackGap
) {
    const timeSinceLastSub = window.time - lastSubTime;
    const standardGap = window?.minGap || fallbackGap || 3.0;
    let effectiveGap = standardGap;

    if (currentMaxDeviation > 3.0) {
        effectiveGap *= 0.6;
    } else if (currentMaxDeviation > 2.5) {
        effectiveGap *= 0.7;
    } else if (currentMaxDeviation > 2.0) {
        effectiveGap *= 0.85;
    }

    if (gameProgress > 0.85) {
        effectiveGap *= 0.6;
    } else if (gameProgress > 0.75) {
        effectiveGap *= 0.75;
    }

    if (remainingWindows <= 2) {
        effectiveGap *= 0.5;
    } else if (remainingWindows <= 3) {
        effectiveGap *= 0.7;
    }

    if (gameProgress < 0.25 && currentMaxDeviation < 2.0) {
        effectiveGap *= 1.2;
    }

    effectiveGap = Math.max(0.5, effectiveGap);

    return {
        allowed: timeSinceLastSub >= effectiveGap,
        effectiveGap,
        actualGap: timeSinceLastSub
    };
}

function simulateRemainingGame(currentMinutes, lineup, currentTime, gameLength, remainingWindows, targetMinutes) {
    const simulated = currentMinutes.slice();
    let currentLineup = [...lineup];
    let lastTime = currentTime;

    const windowTimes = (remainingWindows || []).map((window) => window.time).filter((time) => time > currentTime);
    const totalPlayers = targetMinutes.length - 1;

    windowTimes.forEach((windowTime) => {
        const stint = Math.max(0, windowTime - lastTime);
        currentLineup.forEach((player) => {
            simulated[player] += stint;
        });

        const onCourt = currentLineup
            .map((player) => ({
                player,
                deviation: simulated[player] - (targetMinutes[player] || 0)
            }))
            .sort((a, b) => b.deviation - a.deviation);

        const resting = [];
        for (let player = 1; player <= totalPlayers; player += 1) {
            if (!currentLineup.includes(player)) {
                resting.push({
                    player,
                    deviation: simulated[player] - (targetMinutes[player] || 0)
                });
            }
        }
        resting.sort((a, b) => a.deviation - b.deviation);

        if (onCourt.length >= 2 && resting.length >= 2) {
            const playersLeaving = onCourt.slice(0, 2).map((entry) => entry.player);
            const playersEntering = resting.slice(0, 2).map((entry) => entry.player);

            currentLineup = currentLineup.filter((player) => !playersLeaving.includes(player));
            currentLineup.push(...playersEntering);
        }

        lastTime = windowTime;
    });

    const finalStint = Math.max(0, gameLength - lastTime);
    currentLineup.forEach((player) => {
        simulated[player] += finalStint;
    });

    return MaxDeviation(simulated, targetMinutes);
}

function evaluateSubstitutionWithLookAhead(
    currentMinutes,
    currentLineup,
    playersOff,
    playersOn,
    currentTime,
    gameLength,
    remainingWindows,
    targetMinutes
) {
    const updatedLineup = currentLineup
        .filter((player) => !playersOff.some((status) => status.player === player));

    playersOn.forEach((status) => {
        if (!updatedLineup.includes(status.player)) {
            updatedLineup.push(status.player);
        }
    });

    return simulateRemainingGame(
        currentMinutes,
        updatedLineup,
        currentTime,
        gameLength,
        remainingWindows,
        targetMinutes
    );
}

function selectBestSubstitutionGroup(
    candidatesOff,
    candidatesOn,
    numSubs,
    currentMinutes,
    targetMinutes,
    currentLineup,
    currentTime,
    gameLength,
    remainingWindows,
    mustBringOn = [],
    mustTakeOff = []
) {
    if (numSubs <= 0) {
        return null;
    }
    if (candidatesOff.length < numSubs || candidatesOn.length < numSubs) {
        return null;
    }

    const mustBringSet = new Set((mustBringOn || []).map((status) => status.player));
    const usableCandidatesOn = candidatesOn.filter(
        (status) => status.needed > -0.1 || mustBringSet.has(status.player)
    );
    const effectiveCandidatesOn = usableCandidatesOn.length >= numSubs ? usableCandidatesOn : candidatesOn;

    const offPoolSize = Math.min(candidatesOff.length, Math.max(numSubs + 1, 4));
    const onPoolSize = Math.min(effectiveCandidatesOn.length, Math.max(numSubs + 1, 4));
    const offPool = candidatesOff.slice(0, offPoolSize);
    const onPool = effectiveCandidatesOn.slice(0, onPoolSize);

    const mandatoryMap = new Map();
    (mustBringOn || []).forEach((status) => {
        if (status && !mandatoryMap.has(status.player)) {
            mandatoryMap.set(status.player, status);
        }
    });

    const filteredMandatory = [];
    mandatoryMap.forEach((status, player) => {
        if (filteredMandatory.length >= numSubs) {
            return;
        }
        if (onPool.some((candidate) => candidate.player === player)) {
            filteredMandatory.push(status);
        }
    });

    const remainingSlots = Math.max(0, numSubs - filteredMandatory.length);
    const effectiveOnPool = onPool.filter(
        (status) => !filteredMandatory.some((mandatory) => mandatory.player === status.player)
    );

    const offCombos = generateCombinations(offPool, numSubs);
    const optionalOnCombos = remainingSlots > 0
        ? generateCombinations(
            effectiveOnPool,
            remainingSlots
        )
        : [[]];
    const onCombos = optionalOnCombos.map((combo) => [...filteredMandatory, ...combo]);

    let best = null;
    const mandatoryPlayers = new Set(filteredMandatory.map((status) => status.player));
    const requiredOffPlayers = new Set(
        (mustTakeOff || [])
            .slice(0, numSubs)
            .map((status) => status.player)
    );
    const requireInclusion = mandatoryPlayers.size > 0;

    offCombos.forEach((offCombo) => {
        if (requiredOffPlayers.size > 0) {
            const offSet = new Set(offCombo.map((status) => status.player));
            let includesRequired = true;
            requiredOffPlayers.forEach((player) => {
                if (!offSet.has(player)) {
                    includesRequired = false;
                }
            });
            if (!includesRequired) {
                return;
            }
        }

        onCombos.forEach((onCombo) => {
            if (requireInclusion) {
                const onSet = new Set(onCombo.map((status) => status.player));
                let includesAllMandatory = true;
                mandatoryPlayers.forEach((player) => {
                    if (!onSet.has(player)) {
                        includesAllMandatory = false;
                    }
                });
                if (!includesAllMandatory) {
                    return;
                }
            }

            const improvementScore = CalculateImprovement(
                currentMinutes,
                targetMinutes,
                offCombo,
                onCombo,
                currentTime,
                gameLength,
                remainingWindows
            );

            const projectedDev = evaluateSubstitutionWithLookAhead(
                currentMinutes,
                currentLineup,
                offCombo,
                onCombo,
                currentTime,
                gameLength,
                remainingWindows,
                targetMinutes
            );

            const lookAheadScore = Number.isFinite(projectedDev) ? -projectedDev * 10 : Number.NEGATIVE_INFINITY;
            const combinedScore = (Number.isFinite(lookAheadScore) ? lookAheadScore : 0) + improvementScore;

            if (!best || combinedScore > best.score) {
                best = {
                    score: combinedScore,
                    off: offCombo,
                    on: onCombo,
                    projectedDev
                };
            }
        });
    });

    if (!best && requireInclusion) {
        return selectBestSubstitutionGroup(
            candidatesOff,
            candidatesOn,
            numSubs,
            currentMinutes,
            targetMinutes,
            currentLineup,
            currentTime,
            gameLength,
            remainingWindows,
            [],
            mustTakeOff
        );
    }

    return best;
}

function generateCombinations(items, size) {
    const results = [];

    function helper(startIndex, combo) {
        if (combo.length === size) {
            results.push([...combo]);
            return;
        }

        for (let i = startIndex; i < items.length; i += 1) {
            combo.push(items[i]);
            helper(i + 1, combo);
            combo.pop();
        }
    }

    helper(0, []);
    return results.length > 0 ? results : [];
}

function simulateRestOfGame(
    currentMinutes,
    currentLineup,
    currentTime,
    gameLength,
    legalWindows,
    targetMinutes,
    starters = 5
) {
    const simMinutes = currentMinutes.slice();
    let lineup = [...currentLineup];
    const futureWindows = (legalWindows || [])
        .filter((window) => window.time > currentTime)
        .sort((a, b) => a.time - b.time);

    const deviationTrajectory = [];
    let maxObservedDev = MaxDeviation(simMinutes, targetMinutes);
    let lastTime = currentTime;

    futureWindows.forEach((window) => {
        const stintDuration = Math.max(0, window.time - lastTime);
        lineup.forEach((player) => {
            simMinutes[player] += stintDuration;
        });

        const currentDev = MaxDeviation(simMinutes, targetMinutes);
        deviationTrajectory.push(currentDev);
        maxObservedDev = Math.max(maxObservedDev, currentDev);

        const rotation = decideSimulationRotation(simMinutes, lineup, targetMinutes, starters);
        if (rotation.shouldRotate) {
            lineup = lineup.filter((player) => !rotation.out.includes(player));
            lineup.push(...rotation.in);
        }

        lastTime = window.time;
    });

    const finalDuration = Math.max(0, gameLength - lastTime);
    lineup.forEach((player) => {
        simMinutes[player] += finalDuration;
    });

    const finalDeviation = MaxDeviation(simMinutes, targetMinutes);
    deviationTrajectory.push(finalDeviation);
    maxObservedDev = Math.max(maxObservedDev, finalDeviation);

    const variance = CalculateVariance(simMinutes, targetMinutes);
    const projectedImbalances = findImbalancedPlayers(simMinutes, targetMinutes, 1.0).length;
    const trajectoryVolatility = calculateTrajectoryVolatility(deviationTrajectory);

    return {
        finalMinutes: simMinutes,
        maxDeviation: finalDeviation,
        maxObservedDev,
        trajectoryVolatility,
        deviationTrajectory,
        variance,
        projectedImbalances
    };
}

function decideSimulationRotation(simMinutes, lineup, targetMinutes, starters) {
    const totalPlayers = targetMinutes.length - 1;

    const onCourt = lineup.map((player) => ({
        player,
        deviation: simMinutes[player] - (targetMinutes[player] || 0)
    })).sort((a, b) => b.deviation - a.deviation);

    const resting = [];
    for (let player = 1; player <= totalPlayers; player += 1) {
        if (!lineup.includes(player)) {
            resting.push({
                player,
                deviation: simMinutes[player] - (targetMinutes[player] || 0)
            });
        }
    }
    resting.sort((a, b) => a.deviation - b.deviation);

    if (onCourt.length === 0 || resting.length === 0) {
        return { shouldRotate: false };
    }

    const improvementThreshold = 0.2;
    const worstOn = onCourt[0];
    const mostNeedy = resting[0];
    const improvement = worstOn.deviation - mostNeedy.deviation;

    if (improvement <= improvementThreshold) {
        return { shouldRotate: false };
    }

    const out = [worstOn.player];
    const inn = [mostNeedy.player];

    if (onCourt.length > 1 && resting.length > 1) {
        out.push(onCourt[1].player);
        inn.push(resting[1].player);
    }

    if (improvement > 1.2 && onCourt.length > 2 && resting.length > 2) {
        out.push(onCourt[2].player);
        inn.push(resting[2].player);
    }

    while (inn.length > out.length) {
        inn.pop();
    }
    while (out.length > inn.length) {
        out.pop();
    }

    if (!out.length || !inn.length) {
        return { shouldRotate: false };
    }

    return {
        shouldRotate: true,
        out,
        in: inn
    };
}

function findImbalancedPlayers(minutes, targets, threshold) {
    const imbalanced = [];
    for (let player = 1; player < minutes.length; player += 1) {
        const diff = (minutes[player] || 0) - (targets[player] || 0);
        if (Math.abs(diff) > threshold) {
            imbalanced.push({
                player,
                actual: minutes[player],
                target: targets[player],
                deviation: diff
            });
        }
    }
    return imbalanced;
}

function calculateTrajectoryVolatility(trajectory) {
    if (!trajectory || trajectory.length < 2) {
        return 0;
    }

    let sumSquaredChanges = 0;
    for (let i = 1; i < trajectory.length; i += 1) {
        const change = trajectory[i] - trajectory[i - 1];
        sumSquaredChanges += change * change;
    }

    return Math.sqrt(sumSquaredChanges / (trajectory.length - 1));
}

function getDynamicCandidates(playerStatusList, gameProgress) {
    let deviationThreshold;
    if (gameProgress < 0.5) {
        deviationThreshold = 1.0;
    } else if (gameProgress < 0.75) {
        deviationThreshold = 0.5;
    } else {
        deviationThreshold = 0.25;
    }

    const toCandidate = (status) => ({
        ...status,
        priority: Math.abs(status.needed)
    });

    const candidatesOff = playerStatusList
        .filter((status) => status.onCourt && status.needed < -deviationThreshold)
        .map(toCandidate)
        .sort((a, b) => b.priority - a.priority);

    const candidatesOn = playerStatusList
        .filter((status) => !status.onCourt && status.needed > deviationThreshold)
        .map(toCandidate)
        .sort((a, b) => b.priority - a.priority);

    return { candidatesOff, candidatesOn };
}

function calculateTrajectoryVolatility(trajectory) {
    if (!trajectory || trajectory.length < 2) {
        return 0;
    }

    let sumSquaredChanges = 0;
    for (let i = 1; i < trajectory.length; i += 1) {
        const change = trajectory[i] - trajectory[i - 1];
        sumSquaredChanges += change * change;
    }

    return Math.sqrt(sumSquaredChanges / (trajectory.length - 1));
}

function calculateOptionScore(simulation) {
    const maxDevPenalty = simulation.maxDeviation * 15;
    const maxObservedPenalty = (simulation.maxObservedDev || simulation.maxDeviation) * 8;
    const trajectoryPenalty = (simulation.trajectoryVolatility || 0) * 5;
    const variancePenalty = simulation.variance * 1.5;
    const imbalancePenalty = (simulation.projectedImbalances || 0) * 8;
    return -(maxDevPenalty + maxObservedPenalty + trajectoryPenalty + variancePenalty + imbalancePenalty);
}

function should3PlayerBeConsidered(
    gameProgress,
    currentMaxDev,
    remainingWindows,
    threePlayerSubsUsed,
    maxThreePlayerSubs,
    candidatesOff,
    candidatesOn
) {
    if (threePlayerSubsUsed >= maxThreePlayerSubs) {
        return false;
    }
    if (!candidatesOff || !candidatesOn || candidatesOff.length < 3 || candidatesOn.length < 3) {
        return false;
    }

    if (gameProgress < 0.25) {
        return currentMaxDev > 2.5;
    }
    if (gameProgress < 0.5) {
        return currentMaxDev > 1.8;
    }
    if (gameProgress < 0.67) {
        return currentMaxDev > 1.2;
    }
    if (gameProgress < 0.85) {
        return currentMaxDev > 1.0;
    }
    if (remainingWindows <= 3) {
        return currentMaxDev > 0.8;
    }

    return false;
}

function evaluate3PlayerNeed(
    gameProgress,
    currentMaxDev,
    twoPlayerProjectedDev,
    threePlayerSubsUsed,
    maxThreePlayerSubs,
    totalPlayers,
    candidatesOn
) {
    let targetDev;
    if (totalPlayers <= 8) {
        targetDev = 0.8;
    } else if (totalPlayers <= 10) {
        targetDev = 1.0;
    } else {
        targetDev = 1.2;
    }

    if (Number.isFinite(twoPlayerProjectedDev)
        && twoPlayerProjectedDev > targetDev
        && threePlayerSubsUsed < maxThreePlayerSubs) {
        if (gameProgress > 0.7) {
            return {
                force: true,
                reason: `Projected deviation ${twoPlayerProjectedDev.toFixed(2)} exceeds target ${targetDev.toFixed(2)}`
            };
        }
        if (gameProgress > 0.4 && gameProgress <= 0.7) {
            return {
                suggest: true,
                reason: 'Consider 3-player swap to reach target balance'
            };
        }
    }

    if (gameProgress < 0.35 && totalPlayers >= 10 && threePlayerSubsUsed === 0) {
        const severeDeficit = (candidatesOn || []).some((candidate) => candidate.needed > 2.0);
        if (severeDeficit) {
            return {
                force: true,
                reason: 'Deep bench player 2+ minutes behind target'
            };
        }
    }

    return { force: false };
}

function evaluateThreePlayerOption(
    off,
    on,
    currentMinutes,
    currentLineup,
    subTime,
    gameLength,
    legalWindows,
    targetMinutes,
    starters
) {
    if (!off || !on || off.length < 3 || on.length < 3) {
        return null;
    }

    const newLineup = currentLineup.filter((player) => !off.some((status) => status.player === player));
    on.forEach((status) => {
        if (!newLineup.includes(status.player)) {
            newLineup.push(status.player);
        }
    });

    const simulation = simulateRestOfGame(
        currentMinutes,
        newLineup,
        subTime,
        gameLength,
        legalWindows,
        targetMinutes,
        starters
    );

    return {
        off,
        on,
        projectedMaxDev: simulation.maxDeviation,
        projectedVariance: simulation.variance,
        projectedImbalances: simulation.projectedImbalances,
        score: calculateOptionScore(simulation)
    };
}

function selectBestSubstitution(
    candidatesOff,
    candidatesOn,
    currentMinutes,
    currentLineup,
    subTime,
    gameLength,
    legalWindows,
    targetMinutes,
    numSubs,
    starters,
    mustBringOn = [],
    mustTakeOff = []
) {
    if (numSubs <= 0) {
        return null;
    }
    if (candidatesOff.length < numSubs || candidatesOn.length < numSubs) {
        return null;
    }

    const futureWindows = (legalWindows || []).filter((window) => window.time > subTime);
    const options = [];
    const requiredOn = new Set((mustBringOn || []).map((status) => status.player));
    const requiredOff = new Set((mustTakeOff || []).map((status) => status.player));

    if (numSubs === 2) {
        const topOff = candidatesOff.slice(0, Math.min(5, candidatesOff.length));
        const topOn = candidatesOn.slice(0, Math.min(5, candidatesOn.length));

        for (let i = 0; i < topOff.length - 1; i += 1) {
            for (let j = i + 1; j < topOff.length; j += 1) {
                const offPair = [topOff[i], topOff[j]];
                const offPlayers = new Set(offPair.map((status) => status.player));
                let satisfiesOff = true;
                if (requiredOff.size <= numSubs && requiredOff.size > 0) {
                    requiredOff.forEach((player) => {
                        if (!offPlayers.has(player)) {
                            satisfiesOff = false;
                        }
                    });
                }
                if (!satisfiesOff) {
                    continue;
                }

                for (let k = 0; k < topOn.length - 1; k += 1) {
                    for (let l = k + 1; l < topOn.length; l += 1) {
                        const onPair = [topOn[k], topOn[l]];
                        const onPlayers = new Set(onPair.map((status) => status.player));
                        let satisfiesOn = true;
                        if (requiredOn.size <= numSubs && requiredOn.size > 0) {
                            requiredOn.forEach((player) => {
                                if (!onPlayers.has(player)) {
                                    satisfiesOn = false;
                                }
                            });
                        }
                        if (!satisfiesOn) {
                            continue;
                        }

                        const newLineup = currentLineup
                            .filter((player) => !offPair.some((status) => status.player === player));
                        onPair.forEach((status) => {
                            if (!newLineup.includes(status.player)) {
                                newLineup.push(status.player);
                            }
                        });

                        const simulation = simulateRestOfGame(
                            currentMinutes,
                            newLineup,
                            subTime,
                            gameLength,
                            futureWindows,
                            targetMinutes,
                            starters
                        );

                        options.push({
                            off: offPair,
                            on: onPair,
                            projectedMaxDev: simulation.maxDeviation,
                            projectedVariance: simulation.variance,
                            projectedImbalances: simulation.projectedImbalances,
                            score: calculateOptionScore(simulation)
                        });
                    }
                }
            }
        }
    } else if (numSubs === 3) {
        const topOff = candidatesOff.slice(0, Math.min(5, candidatesOff.length));
        const topOn = candidatesOn.slice(0, Math.min(5, candidatesOn.length));

        const baseOption = evaluateThreePlayerOption(
            topOff.slice(0, 3),
            topOn.slice(0, 3),
            currentMinutes,
            currentLineup,
            subTime,
            gameLength,
            futureWindows,
            targetMinutes,
            starters
        );
            if (baseOption) {
                options.push(baseOption);
            }

            if (topOff.length >= 4 && topOn.length >= 4) {
                const altOption = evaluateThreePlayerOption(
                [topOff[0], topOff[1], topOff[3]],
                [topOn[0], topOn[1], topOn[3]],
                currentMinutes,
                currentLineup,
                subTime,
                gameLength,
                futureWindows,
                targetMinutes,
                starters
            );
            if (altOption) {
                options.push(altOption);
            }
        }
    }

    if (!options.length) {
        return null;
    }

    options.sort((a, b) => b.score - a.score);
    return options[0];
}
function mergeUniqueStatusLists(lists) {
    const merged = [];
    const seen = new Set();

    lists.forEach((list) => {
        (list || []).forEach((status) => {
            if (!status) {
                return;
            }
            if (!seen.has(status.player)) {
                seen.add(status.player);
                merged.push(status);
            }
        });
    });

    return merged;
}

function FormatTime(minutes) {
    const wholeMinutes = Math.floor(minutes);
    let seconds = Math.round((minutes - wholeMinutes) * 60);
    let mins = wholeMinutes;
    if (seconds === 60) {
        mins += 1;
        seconds = 0;
    }
    return `${mins}:${seconds.toString().padStart(2, '0')}`;
}

function FormatPlayers(playerArray) {
    if (!playerArray || playerArray.length === 0) {
        return 'none';
    }
    return playerArray.join(', ');
}

function roundTo(value, precision = 3) {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
}

module.exports = {
    GenerateRotationSchedule,
    GenerateLegalSubWindows,
    CountRemainingWindows,
    GetRemainingWindows,
    SelectHalftimePlayers,
    CalculateVariance,
    MaxDeviation,
    PredictFinalBalance,
    calculateDynamicThreshold,
    shouldForceSubstitution,
    should3PlayerBeConsidered,
    evaluate3PlayerNeed,
    canSubstituteAtWindow,
    simulateRestOfGame,
    getDynamicCandidates,
    selectBestSubstitution,
    calculateOptionScore,
    calculateTrajectoryVolatility,
    FormatTime,
    FormatPlayers
};
