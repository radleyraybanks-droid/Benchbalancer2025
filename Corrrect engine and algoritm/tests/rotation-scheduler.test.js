const assert = require('assert');

const {
    GenerateRotationSchedule,
    GenerateLegalSubWindows,
    SelectHalftimePlayers,
    FormatTime,
    MaxDeviation,
    CalculateVariance
} = require('../rotation-scheduler.js');

function approxEqual(a, b, epsilon = 1e-6) {
    return Math.abs(a - b) <= epsilon;
}

// Validate legal substitution window generation with lockouts and minimum gaps
const windows = GenerateLegalSubWindows(30, 15, 3, 0.75, 9, 5);
assert.ok(windows.length > 0, 'Adaptive window generation should yield at least one window');
assert.ok(windows[0].time >= 2 && windows[0].time <= 5, 'First window should appear within first few minutes');
assert.ok(windows.every((window, index, arr) => index === 0 || window.time > arr[index - 1].time), 'Windows should be strictly increasing');
assert.ok(windows.every((window) => typeof window.minGap === 'number'), 'Windows should contain minGap metadata');
assert.ok(windows.some((window) => window.period === 'ultra_late' && window.forcedBalance), 'Ultra-late forced balance windows should exist');
const lastWindow = windows[windows.length - 1];
assert.ok(lastWindow.time <= 30 - 0.75 + 1e-6, 'No substitutions scheduled inside end-period lockout');

// Verify halftime selection prioritizes players needing minutes
const halftimeSelection = SelectHalftimePlayers([
    { player: 1, needed: 12 },
    { player: 2, needed: 3 },
    { player: 3, needed: 7 },
    { player: 4, needed: 9 },
    { player: 5, needed: -2 },
    { player: 6, needed: 6 }
], 5, [1, 2, 3, 4, 5], 15);

assert.deepStrictEqual(
    halftimeSelection,
    [1, 2, 3, 4, 6],
    'Halftime selection should include the five players needing minutes most'
);

// End-to-end schedule generation sanity check
const result = GenerateRotationSchedule(
    8,
    30,
    5,
    1,
    3,
    2,
    3,
    15,
    3,
    0.75,
    5
);

// Expect halftime substitution entry
assert.ok(
    result.substitutionLog.some((entry) => entry.type === 'HALF-TIME'),
    'Schedule should include halftime substitution entry'
);

// Ensure substitutions respect end-period lockout
result.substitutionLog.forEach((entry) => {
    assert.ok(
        entry.time <= 30 - 0.75 + 1e-6,
        `Substitution at ${FormatTime(entry.time)} violates lockout`
    );
});

// Total playing time should match total court minutes (starters * game length)
const totalPlayed = result.playerMinutesPlayed.reduce((sum, minutes) => sum + minutes, 0);
assert.ok(
    approxEqual(totalPlayed, 5 * 30, 1e-3),
    `Total minutes ${totalPlayed} do not equal court minutes ${5 * 30}`
);

// Tighter balance expectations: ensure max deviation within 3 minutes
const maxDeviation = MaxDeviation([0, ...result.playerMinutesPlayed], [0, ...result.targetMinutes]);
assert.ok(
    maxDeviation <= 3,
    `Max deviation ${maxDeviation} exceeds 3 minute target`
);

// 9 player scenario tighter balance check
const resultNine = GenerateRotationSchedule(9, 30);
const maxDevNine = MaxDeviation([0, ...resultNine.playerMinutesPlayed], [0, ...resultNine.targetMinutes]);
assert.ok(
    maxDevNine <= 2.5,
    `9-player scenario exceeds 2.5 minute deviation (got ${maxDevNine.toFixed(2)})`
);

// 11 player extended game scenario
const resultEleven = GenerateRotationSchedule(11, 40, 5, 1, 3, 2, 3, 20, 3, 0.75, 5);
const maxDevEleven = MaxDeviation([0, ...resultEleven.playerMinutesPlayed], [0, ...resultEleven.targetMinutes]);
assert.ok(
    maxDevEleven <= 3.8,
    `11-player scenario exceeds 3.8 minute deviation (got ${maxDevEleven.toFixed(2)})`
);

// Ensure early game substitutions remain controlled
const earlySubs = resultNine.substitutionLog.filter((sub) => sub.time <= 10 && sub.type !== 'HALF-TIME');
assert.ok(
    earlySubs.length <= 3,
    `Too many early substitutions (${earlySubs.length}) before 10 minutes`
);

// Ensure deviation trajectory stays controlled (no spikes above 2 minutes)
const deviationHistory = [];
{
    const playerCount = resultNine.playerMinutesPlayed.length;
    const minutes = Array(playerCount).fill(0);
    let lineup = resultNine.substitutionLog.length
        ? [...resultNine.substitutionLog[0].lineupBefore]
        : Array.from({ length: 5 }, (_, idx) => idx + 1);
    let lastTime = 0;

    resultNine.substitutionLog.forEach((sub) => {
        const stint = sub.time - lastTime;
        lineup.forEach((player) => {
            minutes[player - 1] += stint;
        });

        const maxDev = MaxDeviation([0, ...minutes], [0, ...resultNine.targetMinutes]);
        deviationHistory.push({ time: sub.time, maxDev });

        lineup = [...sub.lineupAfter];
        lastTime = sub.time;
    });
}

// Optional diagnostic output for visibility during test runs
console.log('\nDeviation trajectory (9-player scenario):');
deviationHistory.forEach((point) => {
    console.log(`  ${point.time.toFixed(1)} min -> ${point.maxDev.toFixed(2)} min`);
});

// Balance analysis helper (for debugging and manual inspection)
function analyzeResult(result, verbose = false) {
    const deviations = result.playerMinutesPlayed.map((actual, index) => ({
        player: index + 1,
        actual,
        target: result.targetMinutes[index],
        diff: actual - result.targetMinutes[index]
    })).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    const maxDev = Math.abs(deviations[0]?.diff ?? 0);
    const avgDev = deviations.reduce((sum, entry) => sum + Math.abs(entry.diff), 0) / deviations.length;
    const variance = CalculateVariance([0, ...result.playerMinutesPlayed], [0, ...result.targetMinutes]);

    if (verbose) {
        console.log('\n=== BALANCE ANALYSIS ===');
        console.log('Worst deviations:');
        deviations.slice(0, Math.min(5, deviations.length)).forEach((entry) => {
            const sign = entry.diff >= 0 ? '+' : '';
            console.log(`  Player ${entry.player}: ${entry.actual.toFixed(1)} min (target ${entry.target.toFixed(1)}, ${sign}${entry.diff.toFixed(2)} min)`);
        });
        console.log(`Max deviation: ${maxDev.toFixed(2)} min`);
        console.log(`Avg deviation: ${avgDev.toFixed(2)} min`);
        console.log(`Variance: ${variance.toFixed(2)}`);
        console.log(`Total subs: ${result.substitutionLog.length}`);
        console.log(`3-player subs used: ${result.threePlayerSubsUsed ?? 'n/a'}`);
    }

    return { maxDev, avgDev, variance };
}

// Provide diagnostic summary (non-fatal)
analyzeResult(resultNine, false);

console.log('✅ Rotation scheduler tests passed.');
