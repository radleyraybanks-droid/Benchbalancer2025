/**
 * Oztag Game Constants - Centralized Configuration
 * Version 1.0
 *
 * Oztag Rules:
 * - Maximum 8 players on field at any time
 * - Up to 6 reserves (14 player roster max)
 * - Rolling substitutions allowed
 * - Two 20-minute halves (typical)
 * - Non-contact sport with tag system
 */

// ============================================================================
// FIELD CONFIGURATION
// ============================================================================

const OZTAG_DEFAULTS = {
    // Field Configuration
    PLAYERS_ON_FIELD: 8,
    MAX_RESERVES: 6,
    MAX_ROSTER_SIZE: 14,
    MIN_PLAYERS_ON_FIELD: 6,  // Minimum to continue match

    // Timing (in seconds)
    DEFAULT_HALF_LENGTH: 1200,      // 20 minutes per half
    DEFAULT_NUM_HALVES: 2,
    MIN_TIME_ON_FIELD: 180,         // 3 minutes minimum per stint
    MIN_SUB_INTERVAL: 180,          // 3 minutes between sub events
    END_BUFFER: 45,                 // No subs in last 45 seconds
    FIRST_SUB_DELAY: 120,           // 2 minutes before first sub

    // Variance Control
    VARIANCE_GOAL: 60,              // Target max variance in seconds
    EQUITY_IMPROVEMENT_THRESHOLD: 5,

    // Position names for 8 players
    POSITIONS: ['LW', 'LC', 'RC', 'RW', 'LH', 'MH', 'RH', 'FB'],
    POSITION_LABELS: {
        'LW': 'Left Wing',
        'LC': 'Left Center',
        'RC': 'Right Center',
        'RW': 'Right Wing',
        'LH': 'Left Half',
        'MH': 'Middle Half',
        'RH': 'Right Half',
        'FB': 'Fullback'
    },

    // Game Progress Phases
    GAME_PROGRESS: {
        EARLY: 0.25,
        MID: 0.50,
        LATE: 0.75,
        END_GAME: 0.90,
    },
};

// ============================================================================
// CONFIGURATION PRESETS
// ============================================================================

const OZTAG_PRESETS = {
    // Junior/Social - frequent rotations
    JUNIOR: {
        ...OZTAG_DEFAULTS,
        MIN_TIME_ON_FIELD: 120,     // 2 minutes
        MIN_SUB_INTERVAL: 120,
        VARIANCE_GOAL: 45,
    },

    // Competitive - less frequent changes
    COMPETITIVE: {
        ...OZTAG_DEFAULTS,
        MIN_TIME_ON_FIELD: 300,     // 5 minutes
        MIN_SUB_INTERVAL: 300,
        VARIANCE_GOAL: 90,
    },

    // Default balanced
    BALANCED: {
        ...OZTAG_DEFAULTS,
    },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get Oztag configuration with optional preset
 * @param {string} [preset='BALANCED'] - Preset name
 * @returns {Object} Configuration object
 */
function getOztagConfig(preset = 'BALANCED') {
    return OZTAG_PRESETS[preset] || OZTAG_PRESETS.BALANCED;
}

/**
 * Calculate dynamic minimum substitution interval based on game length
 * @param {number} gameLengthSeconds - Total game length in seconds
 * @returns {number} Minimum interval in seconds
 */
function calculateOztagMinInterval(gameLengthSeconds) {
    const config = OZTAG_DEFAULTS;
    return Math.max(
        config.MIN_SUB_INTERVAL,
        Math.floor(gameLengthSeconds / 12)
    );
}

/**
 * Format seconds as mm:ss string
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
 * Debug logging function
 * @param {...any} args - Arguments to log
 */
const DEBUG_MODE = false;
function debugLog(...args) {
    if (DEBUG_MODE) {
        console.log('[Oztag]', ...args);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        OZTAG_DEFAULTS,
        OZTAG_PRESETS,
        getOztagConfig,
        calculateOztagMinInterval,
        formatTime,
        debugLog,
        DEBUG_MODE,
    };
}

if (typeof window !== 'undefined') {
    window.OztagConfig = {
        OZTAG_DEFAULTS,
        OZTAG_PRESETS,
        getOztagConfig,
        calculateOztagMinInterval,
        formatTime,
        debugLog,
        DEBUG_MODE,
    };
    console.log('🏉 Oztag Constants v1.0 loaded');
}
