// --- START OF FILE soccer-constants.js ---

/**
 * Soccer Game Constants - Centralized Configuration
 * Version 2.0 - Improved with dynamic interval support
 *
 * @fileoverview Configuration constants for soccer substitution logic.
 * These values control the timing and behavior of automatic substitutions.
 */

// ============================================================================
// TIMING CONSTANTS (in seconds)
// ============================================================================

/**
 * Minimum time before the end of a period/game that a new auto-sub should be scheduled.
 * This prevents subs happening right at the whistle.
 * @constant {number}
 */
const MIN_TIME_BEFORE_END_BUFFER_SECONDS = 60; // Increased from 45 for better game flow

/**
 * Minimum time a player should stay on the field once substituted on,
 * before they can be substituted off again by an *automatic* substitution.
 * This is for player welfare and game rhythm.
 *
 * NOTE: 120s (2 min) is too short for soccer - causes chaotic rotations.
 * Increased to 300s (5 min) for better game flow.
 * @constant {number}
 */
const MIN_TIME_ON_FIELD_SECONDS = 300; // 5 minutes (was 120)

/**
 * The shortest duration the substitution plan generator should aim for between
 * scheduled substitution events.
 *
 * CRITICAL: This value MUST BE >= MIN_TIME_ON_FIELD_SECONDS.
 * If it's less, the plan generator might create sub intervals that are too short
 * for players to become eligible to be subbed off.
 *
 * @constant {number}
 */
const MIN_ACCEPTABLE_SUB_INTERVAL = 300; // 5 minutes (was 120)

/**
 * Minimum time into a period before the first auto-sub can occur.
 * Allows game to settle before rotations begin.
 * @constant {number}
 */
const MIN_TIME_FOR_FIRST_SUB_OF_PERIOD_SECONDS = 180; // 3 minutes (was 90)

/**
 * Fallback minimum interval if other planning fails.
 * @constant {number}
 * @deprecated Use MIN_ACCEPTABLE_SUB_INTERVAL instead
 */
const MIN_AUTO_SUB_INTERVAL_SECONDS = 120;

// ============================================================================
// DYNAMIC INTERVAL CALCULATION
// ============================================================================

/**
 * Divisor for calculating dynamic minimum interval.
 * Formula: Math.max(MIN_SUB_INTERVAL, gameLength / INTERVAL_DIVISOR)
 * @constant {number}
 */
const SUB_INTERVAL_DIVISOR = 10;

/**
 * Calculate dynamic minimum substitution interval based on game length.
 * Longer games can have slightly shorter relative intervals.
 *
 * @param {number} gameLengthSeconds - Total game length in seconds
 * @returns {number} Minimum interval between substitutions in seconds
 *
 * @example
 * // 40 minute game (2400s) -> max(300, 240) = 300s interval
 * calculateDynamicSubInterval(2400);
 *
 * @example
 * // 60 minute game (3600s) -> max(300, 360) = 360s interval
 * calculateDynamicSubInterval(3600);
 */
function calculateDynamicSubInterval(gameLengthSeconds) {
    if (!Number.isFinite(gameLengthSeconds) || gameLengthSeconds <= 0) {
        return MIN_ACCEPTABLE_SUB_INTERVAL;
    }
    return Math.max(
        MIN_ACCEPTABLE_SUB_INTERVAL,
        Math.floor(gameLengthSeconds / SUB_INTERVAL_DIVISOR)
    );
}

// ============================================================================
// EQUITY/FAIRNESS CONSTANTS
// ============================================================================

/**
 * Minimum variance improvement required to justify swapping players.
 * If the new lineup doesn't improve variance by at least this much,
 * keep the original plan.
 * @constant {number}
 */
const EQUITY_IMPROVEMENT_THRESHOLD = 5; // seconds

/**
 * Weight factor for playing time balance in sub decisions.
 * Higher = more aggressive equalization.
 * @constant {number}
 */
const EQUITY_WEIGHT = 1.0;

// ============================================================================
// GAME CONFIGURATION PRESETS
// ============================================================================

/**
 * Configuration presets for different league types.
 * Use these to quickly configure the system for specific scenarios.
 */
const SOCCER_PRESETS = {
    /**
     * U8-U10 youth leagues - frequent rotations for participation
     */
    YOUTH_BEGINNER: {
        MIN_TIME_ON_FIELD: 180,      // 3 minutes
        MIN_SUB_INTERVAL: 180,       // 3 minutes
        END_BUFFER: 45,
        FIRST_SUB_DELAY: 120,
    },

    /**
     * U11-U14 youth leagues - moderate rotation frequency
     */
    YOUTH_COMPETITIVE: {
        MIN_TIME_ON_FIELD: 600,      // 10 minutes
        MIN_SUB_INTERVAL: 600,       // 10 minutes
        END_BUFFER: 60,
        FIRST_SUB_DELAY: 300,
    },

    /**
     * Adult recreational leagues - less frequent changes
     */
    ADULT_SOCIAL: {
        MIN_TIME_ON_FIELD: 900,      // 15 minutes
        MIN_SUB_INTERVAL: 900,       // 15 minutes
        END_BUFFER: 60,
        FIRST_SUB_DELAY: 300,
    },

    /**
     * Default balanced configuration
     */
    BALANCED: {
        MIN_TIME_ON_FIELD: 300,      // 5 minutes
        MIN_SUB_INTERVAL: 300,       // 5 minutes
        END_BUFFER: 60,
        FIRST_SUB_DELAY: 180,
    },
};

/**
 * Get configuration values for a preset.
 *
 * @param {string} presetName - Name of preset (YOUTH_BEGINNER, YOUTH_COMPETITIVE, ADULT_SOCIAL, BALANCED)
 * @returns {Object} Configuration object with timing values
 */
function getSoccerPreset(presetName) {
    return SOCCER_PRESETS[presetName] || SOCCER_PRESETS.BALANCED;
}

// ============================================================================
// DEBUG MODE
// ============================================================================

/**
 * Enable/disable debug logging.
 * Set to false for production to reduce console noise.
 * @constant {boolean}
 */
const DEBUG_MODE = false; // Changed to false for production

/**
 * Conditional debug logging function.
 * Only logs if DEBUG_MODE is true.
 *
 * @param {...any} args - Arguments to log
 */
function debugLog(...args) {
    if (DEBUG_MODE) {
        console.log('[Soccer]', ...args);
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format seconds as mm:ss string.
 *
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time string
 */
function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return '0:00';
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Validate that a time value is reasonable.
 *
 * @param {number} seconds - Time value to validate
 * @param {number} [min=0] - Minimum allowed value
 * @param {number} [max=7200] - Maximum allowed value (default 2 hours)
 * @returns {boolean} Whether the value is valid
 */
function isValidTime(seconds, min = 0, max = 7200) {
    return Number.isFinite(seconds) && seconds >= min && seconds <= max;
}

// ============================================================================
// EXPORTS
// ============================================================================

// Export for ES6 modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        // Timing constants
        MIN_TIME_BEFORE_END_BUFFER_SECONDS,
        MIN_TIME_ON_FIELD_SECONDS,
        MIN_ACCEPTABLE_SUB_INTERVAL,
        MIN_TIME_FOR_FIRST_SUB_OF_PERIOD_SECONDS,
        MIN_AUTO_SUB_INTERVAL_SECONDS,
        SUB_INTERVAL_DIVISOR,

        // Equity constants
        EQUITY_IMPROVEMENT_THRESHOLD,
        EQUITY_WEIGHT,

        // Presets
        SOCCER_PRESETS,

        // Functions
        calculateDynamicSubInterval,
        getSoccerPreset,
        debugLog,
        formatTime,
        isValidTime,

        // Debug
        DEBUG_MODE,
    };
}

// Export for browser (attach to window)
if (typeof window !== 'undefined') {
    window.SoccerConfig = {
        MIN_TIME_BEFORE_END_BUFFER_SECONDS,
        MIN_TIME_ON_FIELD_SECONDS,
        MIN_ACCEPTABLE_SUB_INTERVAL,
        MIN_TIME_FOR_FIRST_SUB_OF_PERIOD_SECONDS,
        MIN_AUTO_SUB_INTERVAL_SECONDS,
        SUB_INTERVAL_DIVISOR,
        EQUITY_IMPROVEMENT_THRESHOLD,
        EQUITY_WEIGHT,
        SOCCER_PRESETS,
        calculateDynamicSubInterval,
        getSoccerPreset,
        debugLog,
        formatTime,
        isValidTime,
        DEBUG_MODE,
    };
    console.log('⚽ Soccer Constants v2.0 loaded - Dynamic intervals enabled');
}

// --- END OF FILE soccer-constants.js ---
