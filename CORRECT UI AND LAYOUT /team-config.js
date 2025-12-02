// --- team-config.js ---
// Team configuration file - externalized from basketball-app.js

const TEAM_CONFIG = {
    // Default team data - can be overridden by user settings
    defaultTeam: {
        name: 'WEBBERS WARRIORS',
        players: [
            { name: 'BEN', position: 'G', points: 25, minutesPerGame: 23 },
            { name: 'TIM', position: 'G', points: 10, minutesPerGame: 23 },
            { name: 'RONALDO', position: 'C', points: 8, minutesPerGame: 23 },
            { name: 'FELIX', position: 'FWD', points: 6, minutesPerGame: 23 },
            { name: 'CHRIS', position: 'FWD', points: 4, minutesPerGame: 23 },
            { name: 'GLEN', position: 'FWD/C', points: 2, minutesPerGame: 23 },
            { name: 'MARCUS', position: 'C', points: 1, minutesPerGame: 23 },
            { name: 'HARRY', position: 'G/FWD', points: 1, minutesPerGame: 23 }
        ]
    },
    
    // Basketball court configuration
    courtConfig: {
        positions: {
            // Standard 5-player positions for basketball
            'G1': { x: 20, y: 80, label: 'G' },      // Point Guard
            'G2': { x: 80, y: 80, label: 'G' },      // Shooting Guard  
            'F1': { x: 15, y: 50, label: 'FWD' },    // Small Forward
            'F2': { x: 85, y: 50, label: 'FWD' },    // Power Forward
            'C': { x: 50, y: 30, label: 'C' }        // Center
        }
    },
    
    // Position compatibility mapping
    positionMap: {
        'G': ['G', 'PG', 'SG'],
        'FWD': ['FWD', 'F', 'SF', 'PF'],
        'C': ['C'],
        'G/FWD': ['G', 'FWD', 'F'],
        'FWD/C': ['FWD', 'F', 'C']
    },
    
    // Team presets for quick selection
    teamPresets: [
        {
            name: 'WEBBERS WARRIORS',
            coachName: 'COACH BOB',
            gamesPlayed: 24
        },
        {
            name: 'LAKERS LEGENDS',
            coachName: 'COACH PHIL',
            gamesPlayed: 82
        },
        {
            name: 'BULLS DYNASTY',
            coachName: 'COACH MICHAEL',
            gamesPlayed: 72
        }
    ],
    
    // Season statistics template
    seasonStatsTemplate: {
        pointsScored: 0,
        pointsConceded: 0,
        plusMinus: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        gamesPlayed: 0
    },
    
    // Coach rankings
    coachRankings: [
        { rank: 1, name: 'COACH BOB', games: 22 },
        { rank: 2, name: 'COACH FRED', games: 10 },
        { rank: 3, name: 'COACH JOSH', games: 5 }
    ]
};

// Function to load team configuration from localStorage
function loadTeamConfig() {
    try {
        const savedConfig = localStorage.getItem('benchbalancer_teamConfig');
        if (savedConfig) {
            const parsed = JSON.parse(savedConfig);
            return { ...TEAM_CONFIG, ...parsed };
        }
    } catch (error) {
        console.error('Error loading team config:', error);
    }
    return TEAM_CONFIG;
}

// Function to save team configuration to localStorage
function saveTeamConfig(config) {
    try {
        localStorage.setItem('benchbalancer_teamConfig', JSON.stringify(config));
        return true;
    } catch (error) {
        console.error('Error saving team config:', error);
        return false;
    }
}

// Function to get a specific team preset
function getTeamPreset(teamName) {
    const preset = TEAM_CONFIG.teamPresets.find(t => t.name === teamName);
    return preset || TEAM_CONFIG.teamPresets[0];
}

// Function to create a new team configuration
function createTeamConfig(teamData) {
    return {
        name: teamData.name || 'NEW TEAM',
        players: teamData.players || [],
        coachName: teamData.coachName || 'COACH',
        seasonStats: { ...TEAM_CONFIG.seasonStatsTemplate }
    };
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TEAM_CONFIG,
        loadTeamConfig,
        saveTeamConfig,
        getTeamPreset,
        createTeamConfig
    };
}