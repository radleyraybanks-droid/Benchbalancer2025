// --- constants.js ---

// Game timing constants
const MIN_TIME_BEFORE_END_BUFFER_SECONDS = 45;
const MIN_AUTO_SUB_INTERVAL_SECONDS = 60;
const MIN_TIME_FOR_FIRST_SUB_OF_PERIOD_SECONDS = 90;
const MIN_TIME_ON_FIELD_SECONDS = 120; // FIXED: Reverted to 120 seconds like Version 3
const MIN_ACCEPTABLE_SUB_INTERVAL = 120; // FIXED: Made consistent with MIN_TIME_ON_FIELD_SECONDS

// Variance tracking constants  
const VARIANCE_TARGET_SECONDS = 60;
const VARIANCE_WARNING_SECONDS = 90;
const VARIANCE_CRITICAL_SECONDS = 120;

// Debug mode
const DEBUG_MODE = true;

console.log('Constants.js loaded successfully, DEBUG_MODE:', DEBUG_MODE);

// Audio file paths
const AUDIO_FILES = {
    WARNING_BEEP: './beep-warning.wav',
    STARTING_WHISTLE: './startingwhistle.wav',
    HALFTIME_MUSIC: './song.mp3'
};

// Local storage keys for persistence
const STORAGE_KEYS = {
    GAME_STATE: 'benchbalancer_gameState',
    SETTINGS: 'benchbalancer_settings',
    HISTORY: 'benchbalancer_history'
};

// Animation timings (ms)
const ANIMATIONS = {
    TRANSITION_DURATION: 300,
    FADE_DURATION: 200,
    SLIDE_DURATION: 400
};

// Game configuration limits
const GAME_LIMITS = {
    MIN_PLAYERS: 4,
    MAX_PLAYERS: 30,
    MIN_PERIOD_MINUTES: 1,
    MAX_PERIOD_MINUTES: 90,
    MAX_PERIODS: 4,
    MAX_GOALKEEPERS: 2,
    MAX_SUBS_PER_CHANGE: 5
};

// Default game settings
const DEFAULT_SETTINGS = {
    numPeriods: 2,
    minsPerPeriod: 20,
    numOnField: 9,
    numGoalkeepers: 1,
    numReserves: 0,
    subsPerChange: 2,
    warningSoundEnabled: true,
    varianceTrackingEnabled: true,
    autoBalanceEnabled: true
};