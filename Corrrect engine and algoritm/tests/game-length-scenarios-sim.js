const assert = require('assert');

global.window = global.window || {};
window.BasketballIntervalOptimizer = require('../basketball-interval-optimizer.js');

function buildRoster(size) {
    return Array.from({ length: size }, (_, i) => `Player ${i + 1}`);
}

function runScenario({
    name,
    gameLength,
    periodLength,
    totalPlayers,
    expectedVarianceCap,
    minMinGap,
    maxMinGap
}) {
    const optimizer = new window.BasketballIntervalOptimizer({
        totalPlayers,
        courtSpots: 5,
        gameLength,
        periodLength
    });

    const roster = buildRoster(totalPlayers);
    const initResult = optimizer.initialize(roster);
    assert.ok(initResult.success, `${name}: initialization failed`);

    const plan = optimizer.generatePlan(0, []);
    assert.ok(plan.rotations.length > 0, `${name}: planner produced no rotations`);

    if (Number.isFinite(expectedVarianceCap)) {
        assert.ok(
            plan.expectedVariance <= expectedVarianceCap,
            `${name}: variance ${plan.expectedVariance}s exceeds cap ${expectedVarianceCap}s`
        );
    }

    if (Number.isFinite(minMinGap)) {
        assert.ok(
            optimizer.minSubstitutionGap >= minMinGap,
            `${name}: min gap ${optimizer.minSubstitutionGap}s below floor ${minMinGap}s`
        );
    }

    if (Number.isFinite(maxMinGap)) {
        assert.ok(
            optimizer.minSubstitutionGap <= maxMinGap,
            `${name}: min gap ${optimizer.minSubstitutionGap}s above ceiling ${maxMinGap}s`
        );
    }

    console.log(`✅ ${name} → rotations:${plan.rotations.length}, variance:${plan.expectedVariance}s, minGap:${optimizer.minSubstitutionGap}s`);
}

runScenario({
    name: 'Short format - 4 minute quarters',
    gameLength: 4 * 60 * 4, // 4 quarters × 4 minutes
    periodLength: 4 * 60,
    totalPlayers: 9,
    expectedVarianceCap: 150,
    maxMinGap: 200
});

runScenario({
    name: 'Long format - 45 minute halves',
    gameLength: 45 * 60 * 2,
    periodLength: 45 * 60,
    totalPlayers: 10,
    expectedVarianceCap: 240,
    minMinGap: 90
});
