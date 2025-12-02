/**
 * Stats Tracker for BenchBalancer
 * Tracks and saves game statistics to Supabase for pro users
 */

console.log('Loading BenchBalancer Stats Tracker...');

class StatsTracker {
    constructor() {
        this.currentUser = null;
        this.currentGameData = null;
        this.isTracking = false;

        // Listen for auth state changes
        this.initializeAuthListener();
    }

    initializeAuthListener() {
        // Wait for Supabase to be ready
        document.addEventListener('DOMContentLoaded', () => {
            if (window.benchBalancerSupabase) {
                window.benchBalancerSupabase.auth.onAuthStateChange((event, session) => {
                    this.currentUser = session?.user || null;
                    console.log('[StatsTracker] Auth state changed:', event, this.currentUser?.email);

                    if (this.currentUser) {
                        this.enableTracking();
                    } else {
                        this.disableTracking();
                    }
                });

                // Check current session
                window.benchBalancerSupabase.auth.getSession().then(({ data: { session } }) => {
                    this.currentUser = session?.user || null;
                    if (this.currentUser) {
                        console.log('[StatsTracker] User is authenticated:', this.currentUser.email);
                        this.enableTracking();
                    }
                });
            }
        });
    }

    enableTracking() {
        this.isTracking = true;
        console.log('[StatsTracker] Stats tracking enabled for user:', this.currentUser.email);
    }

    disableTracking() {
        this.isTracking = false;
        console.log('[StatsTracker] Stats tracking disabled');
    }

    /**
     * Save a completed game to the database
     * @param {Object} gameData - The game data to save
     */
    async saveGame(gameData) {
        if (!this.isTracking || !this.currentUser) {
            console.log('[StatsTracker] Not saving - user not authenticated');
            return { success: false, reason: 'not_authenticated' };
        }

        if (!window.benchBalancerSupabase) {
            console.log('[StatsTracker] Supabase not available');
            return { success: false, reason: 'no_connection' };
        }

        try {
            // Prepare game data with metadata
            const gameRecord = {
                user_id: this.currentUser.id,
                game_data: gameData,
                sport: gameData.sport || 'basketball',
                team_name: gameData.teamName || 'Unknown Team',
                total_players: gameData.players?.length || 0,
                game_duration: gameData.duration || 0,
                quarters_played: gameData.quartersPlayed || 0,
                created_at: new Date().toISOString()
            };

            // Save to games table
            const { data, error } = await window.benchBalancerSupabase
                .from('games')
                .insert([gameRecord])
                .select()
                .single();

            if (error) {
                console.error('[StatsTracker] Error saving game:', error);
                return { success: false, error: error.message };
            }

            console.log('[StatsTracker] Game saved successfully:', data.id);

            // Also save player stats if available
            if (gameData.players && gameData.players.length > 0) {
                await this.savePlayerStats(data.id, gameData.players);
            }

            return { success: true, gameId: data.id, data };
        } catch (error) {
            console.error('[StatsTracker] Exception saving game:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Save individual player stats for a game
     * @param {string} gameId - The game ID
     * @param {Array} players - Array of player data
     */
    async savePlayerStats(gameId, players) {
        if (!window.benchBalancerSupabase) return;

        try {
            const playerRecords = players.map(player => ({
                game_id: gameId,
                user_id: this.currentUser.id,
                player_name: player.name,
                jersey_number: player.jerseyNumber,
                time_played: player.totalTime || 0,
                points_scored: player.points || 0,
                stats: {
                    timeOnCourt: player.timeOnCourt || 0,
                    timeOnBench: player.timeOnBench || 0,
                    substitutions: player.substitutions || 0,
                    ...player.stats
                }
            }));

            const { data, error } = await window.benchBalancerSupabase
                .from('player_stats')
                .insert(playerRecords);

            if (error) {
                console.error('[StatsTracker] Error saving player stats:', error);
            } else {
                console.log('[StatsTracker] Player stats saved successfully');
            }
        } catch (error) {
            console.error('[StatsTracker] Exception saving player stats:', error);
        }
    }

    /**
     * Get user's game history
     * @param {Object} options - Query options (limit, offset, sport)
     */
    async getGameHistory(options = {}) {
        if (!this.currentUser || !window.benchBalancerSupabase) {
            return { success: false, data: [] };
        }

        try {
            const { limit = 50, offset = 0, sport = null } = options;

            let query = window.benchBalancerSupabase
                .from('games')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (sport) {
                query = query.eq('sport', sport);
            }

            const { data, error } = await query;

            if (error) {
                console.error('[StatsTracker] Error fetching game history:', error);
                return { success: false, error: error.message };
            }

            return { success: true, data };
        } catch (error) {
            console.error('[StatsTracker] Exception fetching game history:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get aggregate stats for a user
     */
    async getAggregateStats() {
        if (!this.currentUser || !window.benchBalancerSupabase) {
            return null;
        }

        try {
            const { data, error } = await window.benchBalancerSupabase
                .from('games')
                .select('*')
                .eq('user_id', this.currentUser.id);

            if (error) {
                console.error('[StatsTracker] Error fetching aggregate stats:', error);
                return null;
            }

            // Calculate aggregate statistics
            const stats = {
                totalGames: data.length,
                totalPlayers: data.reduce((sum, game) => sum + (game.total_players || 0), 0),
                totalDuration: data.reduce((sum, game) => sum + (game.game_duration || 0), 0),
                avgPlayersPerGame: data.length > 0 ?
                    data.reduce((sum, game) => sum + (game.total_players || 0), 0) / data.length : 0,
                sports: [...new Set(data.map(game => game.sport))],
                teams: [...new Set(data.map(game => game.team_name))]
            };

            return stats;
        } catch (error) {
            console.error('[StatsTracker] Exception calculating aggregate stats:', error);
            return null;
        }
    }

    /**
     * Delete a game record
     * @param {string} gameId - The game ID to delete
     */
    async deleteGame(gameId) {
        if (!this.currentUser || !window.benchBalancerSupabase) {
            return { success: false };
        }

        try {
            // First delete player stats
            await window.benchBalancerSupabase
                .from('player_stats')
                .delete()
                .eq('game_id', gameId)
                .eq('user_id', this.currentUser.id);

            // Then delete the game
            const { error } = await window.benchBalancerSupabase
                .from('games')
                .delete()
                .eq('id', gameId)
                .eq('user_id', this.currentUser.id);

            if (error) {
                console.error('[StatsTracker] Error deleting game:', error);
                return { success: false, error: error.message };
            }

            console.log('[StatsTracker] Game deleted successfully');
            return { success: true };
        } catch (error) {
            console.error('[StatsTracker] Exception deleting game:', error);
            return { success: false, error: error.message };
        }
    }
}

// Create global instance
window.statsTracker = new StatsTracker();

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StatsTracker;
}

console.log('✅ BenchBalancer Stats Tracker ready!');
