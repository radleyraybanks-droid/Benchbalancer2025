/**
 * BenchBalancer - Database Migration Helpers
 * Version 1.0
 *
 * @fileoverview Provides SQL migrations and helpers for updating the database schema.
 * Run these in the Supabase SQL Editor when upgrading.
 */

// ============================================================================
// MIGRATION DEFINITIONS
// ============================================================================

/**
 * All migrations in order. Each migration has:
 * - version: Semantic version
 * - name: Human-readable name
 * - description: What this migration does
 * - up: SQL to apply the migration
 * - down: SQL to revert the migration (if possible)
 */
const MIGRATIONS = [
    {
        version: '1.0.0',
        name: 'Initial Schema',
        description: 'Creates games, player_stats, and profiles tables',
        up: `
-- Migration 1.0.0: Initial Schema
-- Creates the base tables for BenchBalancer

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Games table
CREATE TABLE IF NOT EXISTS games (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    game_data JSONB NOT NULL,
    sport VARCHAR(50) DEFAULT 'basketball',
    team_name VARCHAR(100),
    total_players INTEGER DEFAULT 0,
    game_duration INTEGER DEFAULT 0,
    quarters_played INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for games
CREATE INDEX IF NOT EXISTS idx_games_user_id ON games(user_id);
CREATE INDEX IF NOT EXISTS idx_games_created_at ON games(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_sport ON games(sport);

-- Enable RLS on games
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

-- RLS policies for games
CREATE POLICY "Users can view their own games"
    ON games FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own games"
    ON games FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own games"
    ON games FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own games"
    ON games FOR DELETE
    USING (auth.uid() = user_id);

-- Player stats table
CREATE TABLE IF NOT EXISTS player_stats (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    game_id UUID REFERENCES games(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    player_name VARCHAR(100) NOT NULL,
    jersey_number INTEGER,
    time_played INTEGER DEFAULT 0,
    points_scored INTEGER DEFAULT 0,
    stats JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for player_stats
CREATE INDEX IF NOT EXISTS idx_player_stats_game_id ON player_stats(game_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_user_id ON player_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_player_name ON player_stats(player_name);

-- Enable RLS on player_stats
ALTER TABLE player_stats ENABLE ROW LEVEL SECURITY;

-- RLS policies for player_stats
CREATE POLICY "Users can view their own player stats"
    ON player_stats FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own player stats"
    ON player_stats FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own player stats"
    ON player_stats FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own player stats"
    ON player_stats FOR DELETE
    USING (auth.uid() = user_id);

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email VARCHAR(255),
    full_name VARCHAR(100),
    subscription_tier VARCHAR(50) DEFAULT 'free',
    subscription_status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS policies for profiles
CREATE POLICY "Users can view their own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
        `,
        down: `
-- Revert Migration 1.0.0
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP TABLE IF EXISTS player_stats;
DROP TABLE IF EXISTS games;
DROP TABLE IF EXISTS profiles;
        `,
    },
    {
        version: '1.1.0',
        name: 'Add Scoring Columns',
        description: 'Adds home_score and away_score columns to games table',
        up: `
-- Migration 1.1.0: Add Scoring Columns
ALTER TABLE games ADD COLUMN IF NOT EXISTS home_score INTEGER DEFAULT 0;
ALTER TABLE games ADD COLUMN IF NOT EXISTS away_score INTEGER DEFAULT 0;
ALTER TABLE games ADD COLUMN IF NOT EXISTS opponent_name VARCHAR(100);

-- Add constraint to ensure non-negative scores
ALTER TABLE games ADD CONSTRAINT IF NOT EXISTS games_home_score_non_negative
    CHECK (home_score >= 0);
ALTER TABLE games ADD CONSTRAINT IF NOT EXISTS games_away_score_non_negative
    CHECK (away_score >= 0);
        `,
        down: `
-- Revert Migration 1.1.0
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_home_score_non_negative;
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_away_score_non_negative;
ALTER TABLE games DROP COLUMN IF EXISTS home_score;
ALTER TABLE games DROP COLUMN IF EXISTS away_score;
ALTER TABLE games DROP COLUMN IF EXISTS opponent_name;
        `,
    },
    {
        version: '1.2.0',
        name: 'Add Variance Tracking',
        description: 'Adds variance and fairness metrics to games table',
        up: `
-- Migration 1.2.0: Add Variance Tracking
ALTER TABLE games ADD COLUMN IF NOT EXISTS final_variance INTEGER DEFAULT 0;
ALTER TABLE games ADD COLUMN IF NOT EXISTS total_rotations INTEGER DEFAULT 0;
ALTER TABLE games ADD COLUMN IF NOT EXISTS target_minutes_per_player INTEGER DEFAULT 0;

-- Add index for analyzing game quality
CREATE INDEX IF NOT EXISTS idx_games_variance ON games(final_variance);
        `,
        down: `
-- Revert Migration 1.2.0
DROP INDEX IF EXISTS idx_games_variance;
ALTER TABLE games DROP COLUMN IF EXISTS final_variance;
ALTER TABLE games DROP COLUMN IF EXISTS total_rotations;
ALTER TABLE games DROP COLUMN IF EXISTS target_minutes_per_player;
        `,
    },
    {
        version: '1.3.0',
        name: 'Add Player Stats Enhancements',
        description: 'Adds bench time and stint tracking to player_stats',
        up: `
-- Migration 1.3.0: Player Stats Enhancements
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS bench_time INTEGER DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS num_stints INTEGER DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS avg_stint_length INTEGER DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS position VARCHAR(20);

-- Add constraints
ALTER TABLE player_stats ADD CONSTRAINT IF NOT EXISTS player_stats_time_non_negative
    CHECK (time_played >= 0);
ALTER TABLE player_stats ADD CONSTRAINT IF NOT EXISTS player_stats_bench_non_negative
    CHECK (bench_time >= 0);
        `,
        down: `
-- Revert Migration 1.3.0
ALTER TABLE player_stats DROP CONSTRAINT IF EXISTS player_stats_time_non_negative;
ALTER TABLE player_stats DROP CONSTRAINT IF EXISTS player_stats_bench_non_negative;
ALTER TABLE player_stats DROP COLUMN IF EXISTS bench_time;
ALTER TABLE player_stats DROP COLUMN IF EXISTS num_stints;
ALTER TABLE player_stats DROP COLUMN IF EXISTS avg_stint_length;
ALTER TABLE player_stats DROP COLUMN IF EXISTS position;
        `,
    },
    {
        version: '1.4.0',
        name: 'Add Composite Indexes',
        description: 'Adds composite indexes for common query patterns',
        up: `
-- Migration 1.4.0: Composite Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_games_user_sport_date
    ON games(user_id, sport, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_player_stats_user_player
    ON player_stats(user_id, player_name);

CREATE INDEX IF NOT EXISTS idx_games_user_team
    ON games(user_id, team_name);
        `,
        down: `
-- Revert Migration 1.4.0
DROP INDEX IF EXISTS idx_games_user_sport_date;
DROP INDEX IF EXISTS idx_player_stats_user_player;
DROP INDEX IF EXISTS idx_games_user_team;
        `,
    },
];

// ============================================================================
// MIGRATION HELPER FUNCTIONS
// ============================================================================

/**
 * Get migration by version
 * @param {string} version
 * @returns {Object|null}
 */
function getMigration(version) {
    return MIGRATIONS.find(m => m.version === version) || null;
}

/**
 * Get all migrations after a given version
 * @param {string} currentVersion
 * @returns {Object[]}
 */
function getMigrationsAfter(currentVersion) {
    const currentIndex = MIGRATIONS.findIndex(m => m.version === currentVersion);
    if (currentIndex === -1) {
        return MIGRATIONS;
    }
    return MIGRATIONS.slice(currentIndex + 1);
}

/**
 * Get the latest migration version
 * @returns {string}
 */
function getLatestVersion() {
    return MIGRATIONS[MIGRATIONS.length - 1]?.version || '0.0.0';
}

/**
 * Generate SQL for all migrations up to a version
 * @param {string} [toVersion] - Target version (latest if omitted)
 * @returns {string}
 */
function generateMigrationSQL(toVersion) {
    const targetVersion = toVersion || getLatestVersion();
    const migrations = MIGRATIONS.filter(m => {
        return compareVersions(m.version, targetVersion) <= 0;
    });

    let sql = `-- BenchBalancer Database Migration\n`;
    sql += `-- Target Version: ${targetVersion}\n`;
    sql += `-- Generated: ${new Date().toISOString()}\n\n`;

    migrations.forEach(m => {
        sql += `-- ============================================\n`;
        sql += `-- Migration ${m.version}: ${m.name}\n`;
        sql += `-- ${m.description}\n`;
        sql += `-- ============================================\n\n`;
        sql += m.up.trim();
        sql += '\n\n';
    });

    return sql;
}

/**
 * Generate rollback SQL for a specific version
 * @param {string} version
 * @returns {string}
 */
function generateRollbackSQL(version) {
    const migration = getMigration(version);
    if (!migration) {
        return `-- No migration found for version ${version}`;
    }

    let sql = `-- BenchBalancer Rollback Migration\n`;
    sql += `-- Rolling back: ${version} - ${migration.name}\n`;
    sql += `-- Generated: ${new Date().toISOString()}\n\n`;
    sql += migration.down.trim();

    return sql;
}

/**
 * Compare two semantic versions
 * @param {string} v1
 * @param {string} v2
 * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p1 < p2) return -1;
        if (p1 > p2) return 1;
    }
    return 0;
}

/**
 * Get migration summary
 * @returns {Object}
 */
function getMigrationSummary() {
    return {
        totalMigrations: MIGRATIONS.length,
        latestVersion: getLatestVersion(),
        migrations: MIGRATIONS.map(m => ({
            version: m.version,
            name: m.name,
            description: m.description,
        })),
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

// Export for ES6 modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MIGRATIONS,
        getMigration,
        getMigrationsAfter,
        getLatestVersion,
        generateMigrationSQL,
        generateRollbackSQL,
        compareVersions,
        getMigrationSummary,
    };
}

// Export for browser
if (typeof window !== 'undefined') {
    window.DatabaseMigrations = {
        MIGRATIONS,
        getMigration,
        getMigrationsAfter,
        getLatestVersion,
        generateMigrationSQL,
        generateRollbackSQL,
        compareVersions,
        getMigrationSummary,
    };
    console.log('💾 Database Migration helpers loaded');
}

// ============================================================================
// QUICK REFERENCE
// ============================================================================

/*
USAGE:
======

1. To get full migration SQL for Supabase:
   console.log(DatabaseMigrations.generateMigrationSQL());

2. To get migrations summary:
   console.log(DatabaseMigrations.getMigrationSummary());

3. To rollback a specific version:
   console.log(DatabaseMigrations.generateRollbackSQL('1.1.0'));

4. Copy the generated SQL and paste it into Supabase SQL Editor.

MIGRATION WORKFLOW:
==================

1. Add new migration to MIGRATIONS array above
2. Test on development database
3. Run generateMigrationSQL() to get full SQL
4. Apply to production via Supabase SQL Editor
5. Update version tracking in your app config
*/
