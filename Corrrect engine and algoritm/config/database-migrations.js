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
    {
        version: '1.5.0',
        name: 'Add Last Login Tracking',
        description: 'Adds last_login to profiles and syncs with Auth',
        up: `
-- Migration 1.5.0: Last Login Tracking
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

-- Create function to sync last_login from auth.users
CREATE OR REPLACE FUNCTION public.handle_user_login()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.profiles
    SET last_login = NEW.last_sign_in_at
    WHERE id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users update
DROP TRIGGER IF EXISTS on_auth_user_login ON auth.users;
CREATE TRIGGER on_auth_user_login
    AFTER UPDATE OF last_sign_in_at ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_user_login();
        `,
        down: `
-- Revert Migration 1.5.0
DROP TRIGGER IF EXISTS on_auth_user_login ON auth.users;
DROP FUNCTION IF EXISTS public.handle_user_login();
ALTER TABLE profiles DROP COLUMN IF EXISTS last_login;
        `,
    },
    {
        version: '1.6.0',
        name: 'Add Rosters and Schedules',
        description: 'Adds teams_roster and scheduled_matches tables',
        up: `
-- Migration 1.6.0: Rosters and Schedules
-- 1. Teams Roster (Players)
CREATE TABLE IF NOT EXISTS teams_roster (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    jersey_number VARCHAR(10), -- String to allow "00" or similar
    position VARCHAR(50),
    notes TEXT,
    parent_contact JSONB, -- Stores parent name/phone
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for Rosters
ALTER TABLE teams_roster ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own roster" ON teams_roster FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_teams_roster_user ON teams_roster(user_id);

-- 2. Scheduled Matches
CREATE TABLE IF NOT EXISTS scheduled_matches (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    opponent_name VARCHAR(100),
    match_date VARCHAR(20), -- Store as YYYY-MM-DD string for simplicity or DATE type
    match_time VARCHAR(10), -- HH:MM
    is_home BOOLEAN DEFAULT false,
    venue VARCHAR(150),
    status VARCHAR(20) DEFAULT 'scheduled', -- scheduled, completed, cancelled
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for Schedules
ALTER TABLE scheduled_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own schedule" ON scheduled_matches FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_matches_user_date ON scheduled_matches(user_id, match_date);
        `,
        down: `
-- Revert Migration 1.6.0
DROP TABLE IF EXISTS scheduled_matches;
DROP TABLE IF EXISTS teams_roster;
        `,
    },
    {
        version: '1.7.0',
        name: 'Add Leads Capture',
        description: 'Adds leads table for marketing',
        up: `
-- Migration 1.7.0: Leads Capture
CREATE TABLE IF NOT EXISTS leads (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    source VARCHAR(50) DEFAULT 'match_report',
    converted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (Public Insert, Admin View)
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
-- Allow anyone to insert (public lead magnet)
CREATE POLICY "Public insert leads" ON leads FOR INSERT WITH CHECK (true);
-- Only authenticated users (admins usually, but here maybe just self? simplified for now)
-- Actually, we likely only want service_role to view/export, or specific admin.
-- For now, let's keep it locked down.
        `,
        down: `
-- Revert Migration 1.7.0
DROP TABLE IF EXISTS leads;
        `,
    },
    {
        version: '1.8.0',
        name: 'Add Admin Role',
        description: 'Adds role column to profiles and admin RLS policies',
        up: `
-- Migration 1.8.0: Add Admin Role
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';

-- Create index for faster role lookups
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- RLS: Allow Admins to View ALL Profiles (for counting stats)
CREATE POLICY "Admins can view all profiles"
    ON profiles FOR SELECT
    USING (
        auth.uid() IN (
            SELECT id FROM profiles WHERE role = 'admin'
        )
    );

-- RLS: Allow Admins to View ALL Games (for counting stats)
-- Note: We need to check if a policy already exists that conflicts, 
-- but generally adding a new permitted policy is additive.
CREATE POLICY "Admins can view all games"
    ON games FOR SELECT
    USING (
        auth.uid() IN (
            SELECT id FROM profiles WHERE role = 'admin'
        )
    );
        `,
        down: `
-- Revert Migration 1.8.0
DROP POLICY IF EXISTS "Admins can view all games" ON games;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP INDEX IF EXISTS idx_profiles_role;
ALTER TABLE profiles DROP COLUMN IF EXISTS role;
        `,
    },
    {
        version: '1.9.0',
        name: 'Add Home Club Field',
        description: 'Adds home_club column to profiles for organization tracking',
        up: `
-- Migration 1.9.0: Add Home Club Field
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS home_club VARCHAR(150);

-- Update the profile creation trigger to capture home_club
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, home_club)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'home_club'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
        `,
        down: `
-- Revert Migration 1.9.0
ALTER TABLE profiles DROP COLUMN IF EXISTS home_club;

-- Restore original trigger without home_club
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
        `,
    },
    {
        version: '2.0.0',
        name: 'Add AFL Support',
        description: 'Adds AFL-specific columns for Goals/Behinds scoring and detailed player stats',
        up: `
-- Migration 2.0.0: Add AFL Support
-- Adds AFL-specific scoring (Goals/Behinds) and player statistics

-- Add AFL scoring columns to games table
ALTER TABLE games ADD COLUMN IF NOT EXISTS home_goals INTEGER DEFAULT 0;
ALTER TABLE games ADD COLUMN IF NOT EXISTS home_behinds INTEGER DEFAULT 0;
ALTER TABLE games ADD COLUMN IF NOT EXISTS away_goals INTEGER DEFAULT 0;
ALTER TABLE games ADD COLUMN IF NOT EXISTS away_behinds INTEGER DEFAULT 0;

-- Add AFL-specific columns to player_stats table
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS goals INTEGER DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS behinds INTEGER DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS disposals INTEGER DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS kicks INTEGER DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS handballs INTEGER DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS marks INTEGER DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS tackles INTEGER DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS hitouts INTEGER DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS clearances INTEGER DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS inside_50s INTEGER DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS turnovers INTEGER DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS line_played VARCHAR(20);

-- Add field size and age group to games table for AFL
ALTER TABLE games ADD COLUMN IF NOT EXISTS field_size INTEGER DEFAULT 13;
ALTER TABLE games ADD COLUMN IF NOT EXISTS age_group VARCHAR(20);

-- Add sport column to teams_roster for sport-specific squads
ALTER TABLE teams_roster ADD COLUMN IF NOT EXISTS sport VARCHAR(50) DEFAULT 'basketball';
CREATE INDEX IF NOT EXISTS idx_teams_roster_sport ON teams_roster(sport);

-- Add sport column to scheduled_matches for sport-specific schedules
ALTER TABLE scheduled_matches ADD COLUMN IF NOT EXISTS sport VARCHAR(50) DEFAULT 'basketball';
CREATE INDEX IF NOT EXISTS idx_scheduled_matches_sport ON scheduled_matches(sport);

-- Add index for AFL games
CREATE INDEX IF NOT EXISTS idx_games_afl ON games(sport) WHERE sport = 'afl';

-- Add constraints for AFL scoring (non-negative)
ALTER TABLE games ADD CONSTRAINT IF NOT EXISTS games_home_goals_non_negative
    CHECK (home_goals >= 0);
ALTER TABLE games ADD CONSTRAINT IF NOT EXISTS games_home_behinds_non_negative
    CHECK (home_behinds >= 0);
ALTER TABLE games ADD CONSTRAINT IF NOT EXISTS games_away_goals_non_negative
    CHECK (away_goals >= 0);
ALTER TABLE games ADD CONSTRAINT IF NOT EXISTS games_away_behinds_non_negative
    CHECK (away_behinds >= 0);
ALTER TABLE player_stats ADD CONSTRAINT IF NOT EXISTS player_stats_goals_non_negative
    CHECK (goals >= 0);
ALTER TABLE player_stats ADD CONSTRAINT IF NOT EXISTS player_stats_behinds_non_negative
    CHECK (behinds >= 0);
        `,
        down: `
-- Revert Migration 2.0.0
-- Remove AFL-specific columns

-- Drop constraints
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_home_goals_non_negative;
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_home_behinds_non_negative;
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_away_goals_non_negative;
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_away_behinds_non_negative;
ALTER TABLE player_stats DROP CONSTRAINT IF EXISTS player_stats_goals_non_negative;
ALTER TABLE player_stats DROP CONSTRAINT IF EXISTS player_stats_behinds_non_negative;

-- Drop indexes
DROP INDEX IF EXISTS idx_games_afl;
DROP INDEX IF EXISTS idx_teams_roster_sport;
DROP INDEX IF EXISTS idx_scheduled_matches_sport;

-- Drop columns from games
ALTER TABLE games DROP COLUMN IF EXISTS home_goals;
ALTER TABLE games DROP COLUMN IF EXISTS home_behinds;
ALTER TABLE games DROP COLUMN IF EXISTS away_goals;
ALTER TABLE games DROP COLUMN IF EXISTS away_behinds;
ALTER TABLE games DROP COLUMN IF EXISTS field_size;
ALTER TABLE games DROP COLUMN IF EXISTS age_group;

-- Drop columns from player_stats
ALTER TABLE player_stats DROP COLUMN IF EXISTS goals;
ALTER TABLE player_stats DROP COLUMN IF EXISTS behinds;
ALTER TABLE player_stats DROP COLUMN IF EXISTS disposals;
ALTER TABLE player_stats DROP COLUMN IF EXISTS kicks;
ALTER TABLE player_stats DROP COLUMN IF EXISTS handballs;
ALTER TABLE player_stats DROP COLUMN IF EXISTS marks;
ALTER TABLE player_stats DROP COLUMN IF EXISTS tackles;
ALTER TABLE player_stats DROP COLUMN IF EXISTS hitouts;
ALTER TABLE player_stats DROP COLUMN IF EXISTS clearances;
ALTER TABLE player_stats DROP COLUMN IF EXISTS inside_50s;
ALTER TABLE player_stats DROP COLUMN IF EXISTS turnovers;
ALTER TABLE player_stats DROP COLUMN IF EXISTS line_played;

-- Drop sport columns from related tables
ALTER TABLE teams_roster DROP COLUMN IF EXISTS sport;
ALTER TABLE scheduled_matches DROP COLUMN IF EXISTS sport;
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
