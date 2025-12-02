// --- START OF FILE game-state.js ---

// --- Game State Variables ---
let gameSettings = { numPeriods: 2, minsPerPeriod: 0, numOnField: 0, numGoalkeepers: 0, numReserves: 0, subsPerChange: 0 };
let allPlayers = [];
let starters = [];
let reserves = [];
let onField = [];
let onBench = [];
let removedPlayers = [];
let playerGKStatus = {};
let playerRemovedStatus = {};
let playerPlayTimes = {};
let playerBenchTimes = {};
let playerCurrentStintStart = {};
let periodLengthSeconds = 0;
let currentGameSeconds = 0;
let periodElapsedSeconds = 0;
let currentPeriod = 1;
let isRunning = false;
let timerIntervalId = null;

let targetSubTimes = [];
let nextSubTimeInPeriod = Infinity;

let subIsPending = false;
let pendingOutPlayers = [];
let pendingInPlayers = [];
let pendingSubTriggerTime = null;
let statusTimeoutId = null;
let isModalOpen = false;
let isWarningSoundEnabled = true;
let warningBeepSound = null;
let startingWhistleSound = null;
let startingWhistleSoundPlayed = false;

let optimizedSubSchedule = [];
let optimizedSubPlan = [];

// --- Game State Variables for Halftime ---
let halftimeMusicSound = null;
let isHalftimeScreenActive = false;

// --- NEW Game State Variable for Catch-Up Logic ---
let lastVisibleTimestamp = null; // Timestamp when the page was last visible and timer was running
let wasRunningWhenHidden = false; // Flag to indicate if timer should auto-restart

// --- END OF FILE game-state.js ---