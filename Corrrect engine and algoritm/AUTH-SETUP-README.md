# Authentication & Pro Features Setup - BenchBalancer

## Overview

Your BenchBalancer application now has full authentication and database integration! Users can sign in with Google or email, and all their game stats will be automatically saved to the cloud.

## What's Been Added

### 1. Authentication System
- **Google OAuth**: Users can sign in with their Google account
- **Email/Password**: Traditional email and password authentication
- **Session Management**: Automatic session handling and token refresh
- **Secure**: All authentication handled by Supabase with industry-standard security

### 2. Database Integration
- **Supabase Backend**: Connected to your existing Supabase instance
- **Automatic Stats Tracking**: Games are automatically saved when users are logged in
- **Player Stats**: Individual player performance is recorded
- **Game History**: Users can view their past games and statistics

### 3. New Files Added

```
/config/
  ├── supabase-config.js      # Supabase configuration
  ├── simple-supabase.js      # Authentication UI and logic
  └── stats-tracker.js        # Game stats tracking system

/auth/
  └── auth-manager.js         # Authentication manager

/DATABASE-SETUP.md            # Database schema instructions
/AUTH-SETUP-README.md         # This file
```

## Quick Start Guide

### Step 1: Verify Supabase Configuration

Your Supabase credentials are already configured in `config/supabase-config.js`:
- Project URL: `https://pomcalscfnwsqlscunxf.supabase.co`
- Anon Key: Already configured

### Step 2: Set Up Database Tables

1. Go to your Supabase dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **SQL Editor** (left sidebar)
4. Copy and paste the SQL commands from `DATABASE-SETUP.md`
5. Run each section (Games table, Player Stats table, Profiles table)

### Step 3: Configure Google OAuth (Optional)

If you want Google sign-in to work:

1. Go to **Authentication > Providers** in Supabase dashboard
2. Enable **Google** provider
3. Follow the instructions to create Google OAuth credentials
4. Add your Google Client ID and Secret to Supabase

### Step 4: Test Authentication

1. Open your web app
2. Click the **"Sign In"** button on the landing page
3. Try signing up with email or Google
4. You should see a confirmation and be logged in

## How It Works

### For Users

1. **Landing Page**: Users see the normal landing page with a "Sign In" button
2. **Sign In Modal**: Clicking "Sign In" opens a modal with options for:
   - Google Sign In (one click)
   - Email/Password Sign Up
   - Email/Password Sign In
3. **Automatic Tracking**: Once signed in, all games are automatically saved
4. **Cloud Sync**: Stats are saved to the cloud and accessible from any device

### For Developers

The authentication and stats tracking are fully integrated but non-intrusive:

#### Checking Auth Status
```javascript
// Check if user is authenticated
if (window.statsTracker.currentUser) {
    console.log('User is logged in:', window.statsTracker.currentUser.email);
}
```

#### Saving Game Stats
```javascript
// When a game ends, save it automatically
const gameData = {
    sport: 'basketball',
    teamName: 'Lakers',
    players: [...], // Array of player objects
    duration: 2400, // in seconds
    quartersPlayed: 4
};

await window.statsTracker.saveGame(gameData);
```

#### Getting User's Game History
```javascript
// Get user's past games
const history = await window.statsTracker.getGameHistory({
    limit: 20,
    offset: 0,
    sport: 'basketball'
});

console.log('User has played', history.data.length, 'games');
```

#### Getting Aggregate Stats
```javascript
// Get user's overall statistics
const stats = await window.statsTracker.getAggregateStats();
console.log('Total games:', stats.totalGames);
console.log('Average players per game:', stats.avgPlayersPerGame);
```

## Integrating Stats Tracking into Your Game Engine

To automatically save games when they complete, add this to your game engine code:

```javascript
// In your game completion function (basketball-game-engine.js or similar)
function onGameComplete(gameData) {
    // Your existing game completion logic
    console.log('Game completed!');

    // Save to cloud if user is authenticated
    if (window.statsTracker && window.statsTracker.isTracking) {
        window.statsTracker.saveGame({
            sport: 'basketball',
            teamName: gameData.teamName || 'My Team',
            players: gameData.players,
            duration: gameData.totalGameTime,
            quartersPlayed: gameData.quartersCompleted,
            // Include any other relevant data
        }).then(result => {
            if (result.success) {
                console.log('✅ Game saved to cloud!', result.gameId);
                // Optionally show a success message to the user
            }
        });
    }
}
```

## User Experience Features

### Authentication Modal
The sign-in modal includes:
- Clean, modern UI matching your app's design
- Google OAuth button with official Google branding
- Email/password fields
- Sign Up and Sign In options in one modal
- Cancel button and click-outside-to-close functionality

### Pro User Benefits
When users sign in, they get:
- ✅ Unlimited game storage
- ✅ Detailed player statistics
- ✅ Game history and analytics
- ✅ Cloud sync across devices
- ✅ Export capabilities (future feature)

## API Reference

### StatsTracker Class

Global instance: `window.statsTracker`

#### Methods

**`saveGame(gameData)`**
- Saves a completed game to the database
- Parameters:
  - `gameData`: Object containing game information
- Returns: `Promise<{success, gameId, error}>`

**`getGameHistory(options)`**
- Retrieves user's game history
- Parameters:
  - `options.limit`: Number of games to retrieve (default: 50)
  - `options.offset`: Pagination offset (default: 0)
  - `options.sport`: Filter by sport (optional)
- Returns: `Promise<{success, data, error}>`

**`getAggregateStats()`**
- Gets user's overall statistics
- Returns: `Promise<{totalGames, totalPlayers, avgPlayersPerGame, ...}>`

**`deleteGame(gameId)`**
- Deletes a game and its player stats
- Parameters:
  - `gameId`: UUID of the game to delete
- Returns: `Promise<{success, error}>`

#### Properties

**`currentUser`**
- The currently authenticated user object (or null)

**`isTracking`**
- Boolean indicating if stats tracking is enabled

## Security & Privacy

- ✅ All data is user-specific (users can only see their own data)
- ✅ Row Level Security (RLS) enabled on all tables
- ✅ Secure authentication via Supabase Auth
- ✅ No sensitive data stored in client-side code
- ✅ HTTPS required for production

## Troubleshooting

### "Supabase not available" message
- Check that the Supabase CDN script loaded: `<script src="https://unpkg.com/@supabase/supabase-js@2"></script>`
- Check browser console for network errors
- Verify your internet connection

### Google Sign In not working
- Ensure Google OAuth is configured in Supabase dashboard
- Check that redirect URLs are set correctly
- Verify Google Client ID and Secret

### Stats not saving
- Ensure database tables are created (see DATABASE-SETUP.md)
- Check browser console for errors
- Verify user is authenticated: `console.log(window.statsTracker.currentUser)`

### RLS Policy errors
- Make sure you've run all the RLS policy SQL commands
- Verify the user_id is being set correctly
- Check Supabase logs for detailed error messages

## Next Steps

### Recommended Enhancements

1. **User Profile Page**
   - Display user's stats and game history
   - Show aggregate statistics
   - Allow users to view/delete past games

2. **Leaderboards**
   - Compare stats with other users
   - Weekly/monthly challenges

3. **Team Management**
   - Save team rosters
   - Track team performance over time

4. **Export Features**
   - Export stats to PDF or CSV
   - Share game summaries

5. **Offline Support**
   - Queue saves when offline
   - Sync when connection restored

### Code Examples

Check out the `DATABASE-SETUP.md` file for more detailed examples and SQL queries.

## Support

If you encounter issues:
1. Check the browser console for error messages
2. Verify database tables are set up correctly
3. Check Supabase dashboard logs
4. Review the configuration in `config/supabase-config.js`

## Summary

Your BenchBalancer app is now fully equipped with:
- ✅ Google OAuth and Email authentication
- ✅ Automatic stats tracking for authenticated users
- ✅ Cloud database integration with Supabase
- ✅ Secure, scalable backend infrastructure
- ✅ Pro user features ready to go

Users can now sign in, play games, and have all their stats automatically tracked and saved to the cloud!
