# Supabase Database Setup for BenchBalancer

This document outlines the required database schema for BenchBalancer's authentication and stats tracking features.

## Prerequisites

1. A Supabase account at https://supabase.com
2. A project created in Supabase
3. The project URL and anon key (found in Settings > API)

## Database Tables

### 1. Games Table

Stores information about completed games.

```sql
-- Create games table
CREATE TABLE games (
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

-- Create index for faster queries
CREATE INDEX idx_games_user_id ON games(user_id);
CREATE INDEX idx_games_created_at ON games(created_at DESC);
CREATE INDEX idx_games_sport ON games(sport);

-- Enable Row Level Security (RLS)
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

-- Create policies for games table
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
```

### 2. Player Stats Table

Stores individual player statistics for each game.

```sql
-- Create player_stats table
CREATE TABLE player_stats (
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

-- Create indexes
CREATE INDEX idx_player_stats_game_id ON player_stats(game_id);
CREATE INDEX idx_player_stats_user_id ON player_stats(user_id);
CREATE INDEX idx_player_stats_player_name ON player_stats(player_name);

-- Enable Row Level Security
ALTER TABLE player_stats ENABLE ROW LEVEL SECURITY;

-- Create policies for player_stats table
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
```

### 3. User Profiles Table (Optional)

Stores additional user information beyond what's in auth.users.

```sql
-- Create profiles table
CREATE TABLE profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email VARCHAR(255),
    full_name VARCHAR(100),
    subscription_tier VARCHAR(50) DEFAULT 'free',
    subscription_status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles table
CREATE POLICY "Users can view their own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- Create trigger to auto-create profile on user signup
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

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

## Authentication Setup

### Google OAuth Setup

1. Go to your Supabase project > Authentication > Providers
2. Enable Google provider
3. Add your Google Client ID and Client Secret
4. Add authorized redirect URL: `https://[your-project-ref].supabase.co/auth/v1/callback`
5. For local development, also add: `http://localhost:8000/auth/v1/callback`

### Email Authentication Setup

Email authentication is enabled by default in Supabase. To configure:

1. Go to Authentication > Settings
2. Configure email templates if needed
3. Set up email confirmation requirements
4. Configure password requirements

## Configuration

Update the `config/supabase-config.js` file with your Supabase credentials:

```javascript
const SUPABASE_CONFIG = {
  url: 'https://your-project-ref.supabase.co',
  anonKey: 'your-anon-key-here',
  // ... other config
}
```

## Testing the Setup

After setting up the tables, you can test the connection:

1. Open the web app
2. Click "Sign In"
3. Create an account or sign in with Google
4. Play a game and complete it
5. Check the Supabase dashboard > Table Editor to see the saved game data

## API Usage

The app automatically tracks stats when:
- A user is authenticated
- A game is completed
- The `statsTracker.saveGame()` method is called with game data

Example:
```javascript
// Save a game
await window.statsTracker.saveGame({
    sport: 'basketball',
    teamName: 'Lakers',
    players: [...],
    duration: 2400,
    quartersPlayed: 4
});

// Get game history
const history = await window.statsTracker.getGameHistory({ limit: 10 });

// Get aggregate stats
const stats = await window.statsTracker.getAggregateStats();
```

## Security Notes

- All tables use Row Level Security (RLS) to ensure users can only access their own data
- The anon key is safe to use in client-side code
- Never expose the service role key in client-side code
- User authentication is handled by Supabase Auth

## Troubleshooting

### "relation does not exist" error
- Make sure you've run all the SQL commands in the Supabase SQL Editor
- Check that the tables were created successfully in the Table Editor

### Authentication not working
- Verify your Supabase URL and anon key in `config/supabase-config.js`
- Check browser console for error messages
- Ensure Google OAuth is properly configured if using Google sign-in

### Stats not saving
- Check that the user is authenticated (`window.statsTracker.currentUser`)
- Verify the game data structure matches the expected format
- Check browser console for error messages
- Verify RLS policies are set up correctly
