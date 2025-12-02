const assert = require('assert');
global.window = global.window || {};
window.BasketballIntervalOptimizer = require('../basketball-interval-optimizer.js');

/**
 * Build an optimizer in the same configuration the game uses (8 players,
 * three bench) and feed it a state snapshot taken immediately after a
 * rotation is confirmed 120 seconds late (at 6:30 instead of 4:30).
 * We expect the recovery plan to schedule the catch-up substitution
 * within a single check interval (15 seconds) rather than waiting the
 * full 12+ minutes that used to happen.
 */
function verifyFirstHalfLateSubCatchUp() {
    const optimizer = new window.BasketballIntervalOptimizer({
        totalPlayers: 8,
        courtSpots: 5,
        gameLength: 40 * 60,
        idealShiftsPerPlayer: 3,
        varianceThreshold: 120
    });

    const players = ['Phil', 'Claire', 'Hayley', 'Gloria', 'Mitchel', 'Cam', 'Lily', 'Manny'];
    optimizer.initialize(players);

    const currentCourt = ['Mitchel', 'Cam', 'Lily', 'Manny', 'Phil'];
    const currentBench = ['Claire', 'Hayley', 'Gloria'];
    const playTimes = {
        Mitchel: 390,
        Cam: 390,
        Lily: 390,
        Manny: 120,
        Phil: 120,
        Claire: 270,
        Hayley: 270,
        Gloria: 270
    };

    optimizer.syncWithActualState(390, currentCourt, currentBench, playTimes);
    const plan = optimizer.generatePlan(Math.floor(390 / optimizer.checkInterval), [], currentCourt, currentBench, playTimes);
    assert.ok(plan.rotations.length > 0, 'Recovery plan has no rotations after late substitution');
    assert.ok(
        plan.rotations[0].time <= 390 + optimizer.checkInterval,
        `First recovery rotation scheduled too late: ${optimizer.formatTime(plan.rotations[0].time)}`
    );
}

/**
 * Repeat the check for a second-half delay (rotation due at 22:30,
 * confirmed at 24:30). We again expect the plan to queue the catch-up
 * rotation immediately rather than idling for double-digit minutes.
 */
function verifySecondHalfLateSubCatchUp() {
    const optimizer = new window.BasketballIntervalOptimizer({
        totalPlayers: 8,
        courtSpots: 5,
        gameLength: 40 * 60,
        idealShiftsPerPlayer: 3,
        varianceThreshold: 120
    });

    const players = ['Phil', 'Claire', 'Hayley', 'Gloria', 'Mitchel', 'Cam', 'Lily', 'Manny'];
    optimizer.initialize(players);

    const currentCourt = ['Claire', 'Hayley', 'Gloria', 'Phil', 'Lily'];
    const currentBench = ['Mitchel', 'Cam', 'Manny'];
    const playTimes = {
        Claire: 1200,
        Hayley: 1200,
        Gloria: 1200,
        Phil: 930,
        Lily: 1020,
        Mitchel: 780,
        Cam: 780,
        Manny: 780
    };

    optimizer.syncWithActualState(1350, currentCourt, currentBench, playTimes);
    const plan = optimizer.generatePlan(Math.floor(1350 / optimizer.checkInterval), [], currentCourt, currentBench, playTimes);
    assert.ok(plan.rotations.length > 0, 'Second-half recovery plan has no rotations');
    assert.ok(
        plan.rotations[0].time <= 1350 + optimizer.checkInterval,
        `Second-half recovery rotation scheduled too late: ${optimizer.formatTime(plan.rotations[0].time)}`
    );
}

verifyFirstHalfLateSubCatchUp();
verifySecondHalfLateSubCatchUp();
console.log('✅ Late substitution catch-up simulations passed.');
