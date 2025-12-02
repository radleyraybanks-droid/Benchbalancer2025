/**
 * BenchBalancer - Centralized Game Configuration
 * All magic numbers and default settings in one place
 * Version 1.0
 */

// ============================================================================
// BASKETBALL CONFIGURATION
// ============================================================================

const BASKETBALL_DEFAULTS = {
    // Court Configuration
    COURT_SPOTS: 5,
    DEFAULT_BENCH_SIZE: 3,

    // Timing (in seconds)
    FINAL_NO_SUB_WINDOW: 45,        // No subs allowed in last 45s of period
    MIN_SUB_GAP_DEFAULT: 120,       // 2 minutes minimum between subs
    CHECK_INTERVAL: 15,             // Check for subs every 15 seconds
    LOOK_AHEAD_WINDOW: 60,          // Batch subs within 60 second window
    WARNING_BEEP_TIME: 10,          // Warning beep 10 seconds before rotation
    EARLY_WARNING_TIME: 60,         // Early warning 1 minute before rotation

    // Stint Limits (in seconds)
    MIN_COURT_STINT: 150,           // 2.5 minutes minimum on court
    MAX_COURT_STINT: 360,           // 6 minutes maximum on court

    // Variance Control
    VARIANCE_GOAL: 60,              // Target max variance (standard deviation) in seconds
    MAX_EARLY_VARIANCE_MULTIPLIER: 3, // Early game allows 3x variance goal

    // Fatigue System
    FATIGUE_THRESHOLD: 0.8,         // 80% of max stint = approaching fatigue

    // Game Progress Phases
    GAME_PROGRESS: {
        EARLY: 0.33,                // First third of game
        MID: 0.67,                  // Middle phase ends
        LATE: 0.85,                 // Late game begins
        END_GAME: 0.9,              // Final 10%
    },

    // Gap Multipliers for Game Phases
    GAP_MULTIPLIERS: {
        EARLY: 1.0,                 // Full gap in early game
        MID_HIGH_VARIANCE: 0.85,    // Reduce gap if variance > 2 min
        LATE_HIGH_VARIANCE: 0.75,   // More aggressive in late game
        LATE_MODERATE_VARIANCE: 0.85,
        END_GAME_FEW_WINDOWS: 0.6,  // Very aggressive if few windows left
        END_GAME_NORMAL: 0.7,
    },

    // Ideal Shifts
    DEFAULT_IDEAL_SHIFTS: 4,
    MAX_IDEAL_SHIFTS: 5,
    MIN_IDEAL_SHIFTS: 2,

    // Proactive Sub Thresholds (in minutes)
    PROACTIVE_DEVIATION_TRIGGER: 1.0,     // Trigger if projected deviation > 1 min
    LATE_GAME_DEVIATION_TRIGGER: 1.5,     // Late game threshold
};

// ============================================================================
// SOCCER CONFIGURATION
// ============================================================================

const SOCCER_DEFAULTS = {
    // Field Configuration
    DEFAULT_PLAYERS_ON_FIELD: 11,
    MIN_PLAYERS_ON_FIELD: 7,        // Minimum to continue match
    DEFAULT_GOALKEEPERS: 1,

    // Timing (in seconds)
    MIN_TIME_ON_FIELD: 300,         // 5 minutes minimum per stint (was 120, too short)
    MIN_SUB_INTERVAL: 300,          // 5 minutes between sub events (was 120)
    END_BUFFER: 60,                 // No subs in last minute

    // Dynamic Interval Formula
    // MIN_INTERVAL = max(MIN_SUB_INTERVAL, gameLength / INTERVAL_DIVISOR)
    INTERVAL_DIVISOR: 10,

    // Equity Adjustment
    EQUITY_IMPROVEMENT_THRESHOLD: 5, // Must improve variance by 5+ seconds to swap

    // Period Configuration
    DEFAULT_PERIOD_LENGTH: 2400,    // 40 minutes per half
    DEFAULT_NUM_PERIODS: 2,
};

// ============================================================================
// SHARED CONFIGURATION
// ============================================================================

const SHARED_DEFAULTS = {
    // Audio
    AUDIO_ENABLED: true,
    SOUND_VOLUME: 0.5,

    // UI
    UPDATE_THROTTLE_MS: 100,        // Throttle UI updates
    VALIDATION_INTERVAL: 30,        // Validate state every 30 seconds

    // Visibility Handling
    MAX_CATCHUP_SECONDS: 3600,      // Don't catch up more than 1 hour

    // Logging
    DEBUG_MODE: false,

    // Time Formats
    TIME_FORMAT: 'mm:ss',
};

// ============================================================================
// CONFIGURATION PROFILES (Presets)
// ============================================================================

const BASKETBALL_PROFILES = {
    // Youth leagues - prioritize equal playing time
    FAIRNESS_FIRST: {
        ...BASKETBALL_DEFAULTS,
        VARIANCE_GOAL: 45,
        MIN_COURT_STINT: 120,
        MAX_COURT_STINT: 240,
        DEFAULT_IDEAL_SHIFTS: 5,
    },

    // Competitive leagues - allow star players more time
    COMPETITIVE: {
        ...BASKETBALL_DEFAULTS,
        VARIANCE_GOAL: 120,
        MIN_COURT_STINT: 180,
        MAX_COURT_STINT: 480,
        DEFAULT_IDEAL_SHIFTS: 3,
    },

    // Adult recreational - balanced approach
    BALANCED: {
        ...BASKETBALL_DEFAULTS,
    },

    // Pro style - minimal automatic subs
    PRO_STYLE: {
        ...BASKETBALL_DEFAULTS,
        VARIANCE_GOAL: 300,
        MIN_COURT_STINT: 360,
        MAX_COURT_STINT: 720,
        DEFAULT_IDEAL_SHIFTS: 2,
        MIN_SUB_GAP_DEFAULT: 240,
    },
};

const SOCCER_PROFILES = {
    // U8-U10 - frequent rotations for young kids
    YOUTH_BEGINNER: {
        ...SOCCER_DEFAULTS,
        MIN_TIME_ON_FIELD: 180,     // 3 minutes
        MIN_SUB_INTERVAL: 180,
    },

    // U11-U14 - moderate rotation
    YOUTH_COMPETITIVE: {
        ...SOCCER_DEFAULTS,
        MIN_TIME_ON_FIELD: 600,     // 10 minutes
        MIN_SUB_INTERVAL: 600,
    },

    // Adult social - less frequent changes
    ADULT_SOCIAL: {
        ...SOCCER_DEFAULTS,
        MIN_TIME_ON_FIELD: 900,     // 15 minutes
        MIN_SUB_INTERVAL: 900,
    },

    // Default balanced
    BALANCED: {
        ...SOCCER_DEFAULTS,
    },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get basketball configuration with optional profile
 * @param {string} [profile='BALANCED'] - Profile name
 * @returns {Object} Configuration object
 */
function getBasketballConfig(profile = 'BALANCED') {
    return BASKETBALL_PROFILES[profile] || BASKETBALL_PROFILES.BALANCED;
}

/**
 * Get soccer configuration with optional profile
 * @param {string} [profile='BALANCED'] - Profile name
 * @returns {Object} Configuration object
 */
function getSoccerConfig(profile = 'BALANCED') {
    return SOCCER_PROFILES[profile] || SOCCER_PROFILES.BALANCED;
}

/**
 * Calculate dynamic minimum sub interval for soccer
 * @param {number} gameLength - Total game length in seconds
 * @param {Object} [config=SOCCER_DEFAULTS] - Configuration to use
 * @returns {number} Minimum interval in seconds
 */
function calculateSoccerMinInterval(gameLength, config = SOCCER_DEFAULTS) {
    return Math.max(
        config.MIN_SUB_INTERVAL,
        Math.floor(gameLength / config.INTERVAL_DIVISOR)
    );
}

/**
 * Calculate adaptive minimum gap for basketball
 * @param {number} gameLength - Total game length in seconds
 * @param {number} totalPlayers - Number of players
 * @param {Object} [config=BASKETBALL_DEFAULTS] - Configuration to use
 * @returns {number} Minimum gap in seconds
 */
function calculateBasketballMinGap(gameLength, totalPlayers, config = BASKETBALL_DEFAULTS) {
    const gameMinutes = Math.max(1, gameLength / 60);
    const estimatedWindowsNeeded = Math.max(6, Math.ceil(totalPlayers * 1.2));
    const availableGameTime = Math.max(gameMinutes - 1.5, gameMinutes * 0.8);
    const idealGapMinutes = availableGameTime / estimatedWindowsNeeded;

    let lowerBound, upperBound;
    if (gameMinutes <= 20) {
        lowerBound = 2.0;
        upperBound = 3.0;
    } else if (gameMinutes <= 40) {
        lowerBound = 2.4;
        upperBound = 4.0;
    } else {
        lowerBound = 2.6;
        upperBound = 4.0;
    }

    const gapMinutes = Math.min(Math.max(idealGapMinutes, lowerBound), upperBound);
    return gapMinutes * 60;
}

/**
 * Format seconds as mm:ss
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
 * Clamp a value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

// ============================================================================
// EXPORTS
// ============================================================================

// Export for ES6 modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        BASKETBALL_DEFAULTS,
        SOCCER_DEFAULTS,
        SHARED_DEFAULTS,
        BASKETBALL_PROFILES,
        SOCCER_PROFILES,
        getBasketballConfig,
        getSoccerConfig,
        calculateSoccerMinInterval,
        calculateBasketballMinGap,
        formatTime,
        clamp,
    };
}

// Export for browser
if (typeof window !== 'undefined') {
    window.GameConfig = {
        BASKETBALL_DEFAULTS,
        SOCCER_DEFAULTS,
        SHARED_DEFAULTS,
        BASKETBALL_PROFILES,
        SOCCER_PROFILES,
        getBasketballConfig,
        getSoccerConfig,
        calculateSoccerMinInterval,
        calculateBasketballMinGap,
        formatTime,
        clamp,
    };
    console.log('⚙️ Game Configuration module loaded');
}
