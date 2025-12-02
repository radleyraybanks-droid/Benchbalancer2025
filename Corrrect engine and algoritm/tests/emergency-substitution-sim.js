const assert = require('assert');

// Provide minimal browser globals expected by the engine
global.window = global.window || {};

// Load modules and expose to window for legacy compatibility
const BasketballIntervalOptimizer = require('../basketball-interval-optimizer.js');
window.BasketballIntervalOptimizer = BasketballIntervalOptimizer;
const BasketballGameEngine = require('../basketball-game-engine.js');

function autoAdvanceTo(engine, targetTimeSeconds) {
    while (engine.state.currentTime < targetTimeSeconds) {
        engine.advanceOneSecond();

        if (engine.rotations.pending) {
            assert.strictEqual(
                engine.rotations.pendingOff.length,
                engine.rotations.pendingOn.length,
                `Pending rotation at ${engine.formatTime(engine.state.currentTime)} has mismatched counts`
            );

            const confirmed = engine.confirmRotation();
            assert.strictEqual(
                confirmed,
                true,
                `Rotation confirmation failed at ${engine.formatTime(engine.state.currentTime)}`
            );
        }
    }
}

function runEmergencySubstitutionSimulation() {
    const engine = new BasketballGameEngine();

    // Escalate engine errors into test failures
    engine.callbacks.onError = (message) => {
        throw new Error(`Engine error: ${message}`);
    };

    const setupData = {
        format: 'halves',
        minutesPerPeriod: 20,
        numReserves: 4,
        enableWarningSound: false, // Avoid audio in Node environment
        starterNames: ['Phil', 'Claire', 'Luke', 'Hayley', 'Alex'],
        reserveNames: ['Gloria', 'Manny', 'Lily', 'Cam'],
        idealShiftsPerPlayer: 4,
        rotationsPerChange: 2
    };

    const initResult = engine.initialize(setupData);
    assert.ok(initResult.success, 'Engine failed to initialize');

    // Advance through early planned rotations, confirming as we go
    autoAdvanceTo(engine, 15 * 60 + 2); // 15:02

    const playerOff = engine.players.court[0];
    const playerOn = engine.players.bench[0];
    assert.ok(playerOff, 'No player available on court for emergency substitution');
    assert.ok(playerOn, 'No player available on bench for emergency substitution');

    const emergencySucceeded = engine.emergencySubstitution(playerOff, playerOn, true);
    assert.strictEqual(emergencySucceeded, true, 'Emergency substitution failed');
    assert.ok(
        engine.players.removed.has(playerOff),
        'Removed player not tracked after emergency substitution'
    );

    // Continue to halftime (20:00) confirming all planned rotations produced by the recovery plan
    autoAdvanceTo(engine, 20 * 60);

    // Validate future rotations do not reference removed players and remain balanced
    engine.rotations.plan.forEach((rotation) => {
        assert.strictEqual(
            rotation.off.length,
            rotation.on.length,
            `Rotation at ${engine.formatTime(rotation.time)} has mismatched off/on counts`
        );
        rotation.off.forEach((player) => {
            assert.ok(
                !engine.players.removed.has(player),
                `Removed player ${player} scheduled to sub off at ${engine.formatTime(rotation.time)}`
            );
        });
        rotation.on.forEach((player) => {
            assert.ok(
                !engine.players.removed.has(player),
                `Removed player ${player} scheduled to sub on at ${engine.formatTime(rotation.time)}`
            );
        });
    });

    console.log('✅ Emergency substitution simulation passed without invalid rotations.');
}

runEmergencySubstitutionSimulation();
