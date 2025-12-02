# Authentication Troubleshooting Guide

## Quick Diagnostics

If you're experiencing authentication issues, follow these steps:

### 1. Open Browser Console

Open your browser's developer tools (F12 or right-click → Inspect) and check the Console tab for error messages.

### 2. Check for Key Messages

Look for these console messages when the page loads:

**✅ Good signs:**
```
Loading BenchBalancer Supabase integration...
[Supabase] Checking for Supabase library...
[Supabase] window.supabase: object
[Supabase] Initializing with URL: https://pomcalscfnwsqlscunxf.supabase.co
✅ Supabase client initialized successfully!
```

**❌ Bad signs:**
```
❌ Supabase library not loaded
Failed to fetch
CORS error
Network error
```

### 3. Common Issues and Fixes

#### Issue 1: "Supabase library not loaded"

**Symptoms:**
- Console shows: `❌ Supabase library not loaded`
- Sign in doesn't work at all

**Fix:**
1. Check that the Supabase CDN is loading in index.html:
   ```html
   <script src="https://unpkg.com/@supabase/supabase-js@2"></script>
   ```
2. Make sure this script is in the `<head>` section BEFORE other scripts
3. Check browser console Network tab to see if the CDN loaded successfully
4. Try hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

#### Issue 2: "Failed to fetch"

**Symptoms:**
- Console shows: `Failed to fetch`
- Sign up/Sign in buttons don't work
- Error message appears when trying to authenticate

**Possible Causes:**
1. **Internet connection issue**
   - Check your internet connection
   - Try loading https://pomcalscfnwsqlscunxf.supabase.co in a new tab

2. **CORS issue**
   - Make sure you're accessing the app from `localhost` or a properly configured domain
   - Check Supabase dashboard → Settings → API → URL Configuration

3. **Supabase service issue**
   - Check if Supabase is having issues: https://status.supabase.com
   - Verify your project is active in the Supabase dashboard

4. **Browser extension blocking**
   - Try disabling ad blockers or privacy extensions
   - Test in incognito/private mode

**Fix:**
1. Check browser console for the actual error details
2. Look for network errors in the Network tab
3. Verify Supabase URL is correct: `https://pomcalscfnwsqlscunxf.supabase.co`
4. Try in a different browser

#### Issue 3: Google OAuth Not Working

**Symptoms:**
- Google sign in button doesn't redirect
- Error message when clicking Google button

**Fix:**
1. **Enable Google OAuth in Supabase:**
   - Go to Supabase Dashboard → Authentication → Providers
   - Enable Google provider
   - Add your Google Client ID and Secret

2. **Configure redirect URLs:**
   - In Google Cloud Console, add authorized redirect URIs:
     - `https://pomcalscfnwsqlscunxf.supabase.co/auth/v1/callback`
     - `http://localhost:8000/auth/v1/callback` (for local testing)

3. **Check browser console:**
   - Look for specific error messages about OAuth
   - Verify the redirect URL in the error message

#### Issue 4: Email Confirmation Not Received

**Symptoms:**
- Sign up seems to work but no email arrives

**Fix:**
1. Check spam/junk folder
2. Verify email settings in Supabase:
   - Go to Authentication → Email Templates
   - Check if email confirmation is enabled
3. For development, you can disable email confirmation:
   - Go to Authentication → Settings
   - Disable "Enable email confirmations"

#### Issue 5: Database Tables Not Set Up

**Symptoms:**
- Authentication works but stats don't save
- Console errors about missing tables

**Fix:**
1. Go to Supabase Dashboard → SQL Editor
2. Run the SQL commands from `DATABASE-SETUP.md`
3. Verify tables exist in Table Editor:
   - `games`
   - `player_stats`
   - `profiles` (optional)

### 4. Manual Testing Steps

#### Test 1: Verify Supabase Client

Open browser console and type:
```javascript
console.log(window.benchBalancerSupabase);
```

**Expected:** Should show a Supabase client object
**If undefined:** The Supabase library didn't load or initialize properly

#### Test 2: Test Auth Manually

Try signing in manually via console:
```javascript
window.benchBalancerSupabase.auth.signInWithPassword({
    email: 'test@example.com',
    password: 'testpassword'
}).then(result => console.log(result));
```

Look for the response - it should show either success or a specific error message.

#### Test 3: Check Configuration

Verify configuration is loaded:
```javascript
console.log(window.SUPABASE_CONFIG);
```

**Expected:**
```javascript
{
    url: "https://pomcalscfnwsqlscunxf.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    // ...
}
```

### 5. Network Diagnostics

#### Check Supabase Connectivity

1. Open browser console
2. Go to Network tab
3. Click Sign In button
4. Look for requests to `pomcalscfnwsqlscunxf.supabase.co`

**Red flags:**
- Status 404 (Not Found) - Project doesn't exist or URL is wrong
- Status 403 (Forbidden) - API key is invalid
- Status 500 (Server Error) - Supabase service issue
- (failed) - Network/CORS issue

#### CORS Errors

If you see:
```
Access to fetch at 'https://pomcalscfnwsqlscunxf.supabase.co...'
from origin 'http://localhost:8000' has been blocked by CORS policy
```

**Fix:**
1. Make sure you're using HTTP (not file://)
2. Use a local server (python -m http.server or similar)
3. Check Supabase dashboard → Settings → API for allowed origins

### 6. Debug Mode

Enable detailed logging by opening console and typing:
```javascript
// Enable debug mode
localStorage.setItem('supabase.debug', 'true');
location.reload();
```

This will show more detailed logs for authentication attempts.

### 7. Common Error Messages Decoded

| Error Message | Meaning | Fix |
|--------------|---------|-----|
| "Failed to fetch" | Network/CORS issue | Check internet, CORS, browser extensions |
| "Invalid API key" | Wrong anon key | Check config/supabase-config.js |
| "Invalid login credentials" | Wrong email/password | Check credentials, verify account exists |
| "Email not confirmed" | User hasn't verified email | Check email or disable confirmation in Supabase |
| "User already registered" | Email already exists | Use sign in instead of sign up |
| "Supabase library not loaded" | CDN didn't load | Check script tag, internet connection |

### 8. Reset Everything

If all else fails:

1. **Clear browser data:**
   ```javascript
   localStorage.clear();
   sessionStorage.clear();
   ```
   Then refresh the page

2. **Hard refresh:**
   - Windows: Ctrl + Shift + R
   - Mac: Cmd + Shift + R

3. **Try incognito/private mode:**
   - This disables extensions that might interfere

4. **Check different browser:**
   - Try Chrome, Firefox, Safari to rule out browser-specific issues

### 9. Still Not Working?

**Gather this information:**

1. Browser console errors (screenshot)
2. Network tab showing failed requests (screenshot)
3. Browser and OS version
4. Are you using localhost or deployed URL?
5. What exact steps cause the error?

**Check these resources:**

1. Supabase Status: https://status.supabase.com
2. Supabase Docs: https://supabase.com/docs/guides/auth
3. Browser console for specific error messages

### 10. Verify Supabase Project Setup

In Supabase Dashboard:

1. **Project is active:**
   - Go to https://supabase.com/dashboard
   - Verify project exists and is running

2. **API credentials are correct:**
   - Settings → API
   - Copy URL and anon key
   - Verify they match config/supabase-config.js

3. **Email provider configured:**
   - Authentication → Settings
   - Check email provider settings

4. **Google OAuth configured (if using):**
   - Authentication → Providers
   - Google should be enabled with Client ID/Secret

5. **Tables exist:**
   - Table Editor
   - Should see: games, player_stats tables

## Success Checklist

✅ Supabase CDN loads (check console)
✅ window.benchBalancerSupabase exists (check console)
✅ No CORS errors in Network tab
✅ Database tables created (check Supabase dashboard)
✅ Can see auth modal when clicking Sign In
✅ Sign up/Sign in works without errors
✅ Google OAuth redirects (if configured)

If all these pass, authentication should be working correctly!
