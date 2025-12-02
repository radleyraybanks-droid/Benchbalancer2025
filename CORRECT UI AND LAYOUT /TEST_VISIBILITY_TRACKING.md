# Time-Tracking Visibility Fix - Testing Guide

## Overview
This document provides step-by-step instructions to test the visibility tracking mechanism that handles real-time catch-up when a page becomes inactive (tab switching, minimizing, etc.).

## What Was Fixed

### Soccer Game (app.html)
1. **Removed conflicting flag updates** in `startTimer()` that were overwriting visibility timestamps
2. **Added visibility variable reset** in `resetGame()` to clear state between games
3. **Added defensive checks** to prevent excessive catch-up from stale timestamps

### Basketball Game (basketball-app.html)
1. **Added visibility tracking system** (was completely missing)
2. **Created applyMissedTime method** to handle catch-up
3. **Added event listeners** for visibility changes

## Test Procedures

### Test 1: Soccer Game - Basic Visibility Tracking
**Purpose:** Verify that switching tabs correctly applies missed time

1. Open `app.html` in your browser
2. Open the browser's Developer Console (F12)
3. Configure a game:
   - 2 periods
   - 3 minutes per period
   - Set up your players
4. Start the game
5. Wait until the timer shows **1:00** (1 minute)
6. Switch to another browser tab
7. Wait exactly **30 seconds** (use your phone timer)
8. Switch back to the game tab

**Expected Results:**
- Timer should immediately show **1:30** (not 1:01 or 1:02)
- Console should show:
  - "Page hidden, timer was running. Storing timestamp and stopping interval."
  - "Page became visible."
  - "Page visible. Was running. Elapsed while hidden: 00:30."
  - "Applying 00:30 of missed time."

### Test 2: Soccer Game - Game Reset State
**Purpose:** Verify that resetting the game clears visibility state

1. Complete Test 1 first
2. Click the RESET button
3. Start a new game
4. Wait until timer shows **0:30**
5. Switch tabs for **20 seconds**
6. Switch back

**Expected Results:**
- Timer should show **0:50** (0:30 + 0:20)
- NOT affected by the previous game's timestamps

### Test 3: Soccer Game - Multiple Tab Switches
**Purpose:** Verify multiple visibility changes work correctly

1. Start a new game
2. At **0:30**, switch tabs for 10 seconds → return
   - Should show **0:40**
3. At **1:00**, switch tabs for 20 seconds → return
   - Should show **1:20**
4. At **2:00**, switch tabs for 15 seconds → return
   - Should show **2:15**

**Expected Results:**
- Each catch-up should be accurate
- No cumulative errors

### Test 4: Soccer Game - Defensive Check
**Purpose:** Test protection against excessive elapsed time

1. Start a game
2. Let it run to **1:00**
3. Open Console and type:
   ```javascript
   lastVisibleTimestamp = Date.now() - 7200000; // 2 hours ago
   wasRunningWhenHidden = true;
   ```
4. Switch tabs and immediately return

**Expected Results:**
- Console should show: "WARNING: Elapsed time (02:00:00) seems excessive. Likely stale timestamp. Skipping catch-up."
- Timer should NOT jump ahead by 2 hours
- Timer should continue normally from 1:00

### Test 5: Basketball Game - Basic Visibility
**Purpose:** Verify basketball now has working visibility tracking

1. Open `basketball-app.html`
2. Open Developer Console
3. Click "Start Game" button
4. Note the timer (e.g., **13:56**)
5. Switch tabs for **30 seconds**
6. Switch back

**Expected Results:**
- Timer should show 30 seconds less (e.g., **13:26**)
- Console should show:
  - "Page hidden, basketball timer was running. Storing timestamp."
  - "Page became visible (basketball)."
  - "Basketball was running. Elapsed while hidden: 30s"
  - "Applying 30 seconds of missed time"

### Test 6: Mobile Browser Testing
**Purpose:** Test on mobile devices where visibility API might differ

1. Open either game on a mobile browser
2. Start the game
3. Test these scenarios:
   - Switch to another app for 30 seconds
   - Lock the phone screen for 30 seconds
   - Receive a phone call (if possible)

**Expected Results:**
- Timer should catch up by the exact time away
- May see "pagehide" and "pageshow" events in console instead of visibility events

### Test 7: Period Boundary Crossing
**Purpose:** Test if missed time correctly crosses period boundaries

1. Start soccer game with 2-minute periods
2. At **1:50** (10 seconds before period ends)
3. Switch tabs for **30 seconds**
4. Return

**Expected Results:**
- Should be in Period 2
- Period elapsed should show **0:20** (crossed boundary + 20 seconds)
- Total game time should show **2:20**

## Troubleshooting

### If catch-up is NOT working:

1. **Check Console for Errors**
   - Look for any JavaScript errors
   - Verify you see visibility change messages

2. **Verify Files Were Updated**
   - Check that `timer-and-gameplay.js` lines 275-276 are comments (not setting flags)
   - Check that `setup-and-reset.js` has visibility reset around line 101
   - Check that `basketball-app.js` has new methods around line 523-599

3. **Browser Compatibility**
   - Test in Chrome/Edge (most reliable)
   - Safari may have different behavior
   - Firefox should work but verify

4. **Clear Browser Cache**
   - Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
   - Clear browser cache and reload

### Debug Commands (Console)

To check current state:
```javascript
// Soccer game
console.log('lastVisibleTimestamp:', lastVisibleTimestamp);
console.log('wasRunningWhenHidden:', wasRunningWhenHidden);
console.log('isRunning:', isRunning);

// Basketball game (if app instance is available)
console.log('Basketball timestamp:', basketballApp.lastVisibleTimestamp);
console.log('Basketball was running:', basketballApp.wasRunningWhenHidden);
```

## Success Criteria

✅ All tests pass as described
✅ No JavaScript errors in console
✅ Visibility messages appear in console
✅ Timer catch-up is accurate to the second
✅ Works on multiple browsers
✅ Works on mobile devices
✅ Game reset clears visibility state
✅ Defensive checks prevent extreme catch-ups

## Notes

- The mechanism uses the Page Visibility API which is well-supported in modern browsers
- Mobile browsers may use pagehide/pageshow events as fallback
- The 1-hour (3600 second) limit prevents issues with stale timestamps
- Basketball timer counts DOWN, so missed time is subtracted
- Soccer timer counts UP, so missed time is added

## Contact

If any tests fail or you encounter issues, please note:
1. Which test failed
2. Browser and version used
3. Console error messages (if any)
4. Actual vs. expected behavior