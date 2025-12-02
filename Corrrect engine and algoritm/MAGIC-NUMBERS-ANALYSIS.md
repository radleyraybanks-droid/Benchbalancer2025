# Magic Number Analysis & Real-World Comparison

## Basketball (`basketball-interval-optimizer.js`)

### Extracted Magic Numbers
| Variable/Concept | Value(s) | Location | Description |
| :--- | :--- | :--- | :--- |
| `finalNoSubWindow` | 45s | Line 20 | Time at end of period where no subs are allowed. |
| `minSubstitutionGap` | 120s (default) | Line 34, 55 | Minimum time between substitution events. |
| `checkInterval` | 15s | Line 39 | How often the optimizer checks for subs. |
| `lookAheadWindow` | 60s | Line 29 | Time window to look ahead for batching subs. |
| `varianceGoal` | 60s | Line 26 | Target max difference in playing time. |
| `desiredCourtStint` | 150s - 360s | Lines 104-105 | Target duration for a player to be on court (2.5 - 6 mins). |
| `fatigueThreshold` | 0.8 (80%) | Line 741 | % of max stint where player is considered "approaching fatigue". |
| `gameProgress` | 0.33, 0.67, 0.9 | Various | Phase transitions (Early, Mid, Late, End). |

### Real-World Comparison (Basketball)
- **Stint Length**:
    - **Code**: 2.5 - 6 minutes.
    - **Real World**:
        - **NBA/Pro**: Starters often play 6-10 minute stints. Role players play 3-6 minutes.
        - **Youth/Amateur**: 3-5 minutes is common to ensure equal time.
    - **Verdict**: The code's range (2.5-6m) is well-suited for **youth/amateur** leagues where equal playing time is priority. It is too short for high-level competitive play.
- **Substitution Gap**:
    - **Code**: 2 minutes (120s).
    - **Real World**: Basketball is stop-start. Subs happen at dead balls. 2 minutes is a reasonable minimum to prevent the game from becoming disjointed.
- **End Game Lockout**:
    - **Code**: 45 seconds.
    - **Real World**: In close games, coaches often ride their best lineup for the last 2-5 minutes. 45s is very short; it implies "fairness" overrides "winning" until the very last moment.

## Soccer (`soccer-constants.js`, `soccer-substitution-logic.js`)

### Extracted Magic Numbers
| Variable/Concept | Value(s) | Location | Description |
| :--- | :--- | :--- | :--- |
| `MIN_TIME_ON_FIELD_SECONDS` | 120s | Constants | Minimum time a player must stay on field. |
| `MIN_ACCEPTABLE_SUB_INTERVAL` | 120s | Constants | Minimum time between substitution events. |
| `MIN_TIME_BEFORE_END_BUFFER` | 45s | Constants | Buffer at end of game/period. |
| `Equity Threshold` | 5s | Logic Line 381 | Minimum variance improvement to justify a swap. |

### Real-World Comparison (Soccer)
- **Stint Length / Interval**:
    - **Code**: 2 minutes (120s).
    - **Real World**:
        - **Pro**: Limited subs (3-5 windows), players play 45-90 mins.
        - **Youth/Amateur (Rolling Subs)**: Even with rolling subs, 2 minutes is **extremely short**. Soccer is a flow game. It takes time to settle into a position. Frequent subs disrupt the team's shape.
    - **Verdict**: 120s is likely **too short** even for young children. It risks turning the game into a chaotic revolving door. 5-10 minutes (300-600s) is a more realistic minimum for "flow".
- **End Game Buffer**:
    - **Code**: 45 seconds.
    - **Real World**: Subs are often used in the final seconds of soccer to waste time or replace a tired player. However, for an auto-scheduler, avoiding the last minute is fine to prevent administrative hassle.

## Improvement Ideas

### 1. Configuration Profiles (Presets)
Instead of hardcoded numbers, introduce "Game Mode" presets:

**Basketball:**
- **"Fairness First" (Current)**: Min Stint 3m, Variance Goal 60s.
- **"Competitive"**: Min Stint 6m, Variance Goal 180s (allows stars to play more).
- **"Pro Style"**: Min Stint 8m, Manual Subs prioritized.

**Soccer:**
- **"U8-U10 (Chaos)"**: Min Stint 3m.
- **"Youth Competitive"**: Min Stint 10m.
- **"Adult Social"**: Min Stint 15m.

### 2. Dynamic "Flow" Constraints
- **Soccer**: Increase `MIN_ACCEPTABLE_SUB_INTERVAL` based on game length.
    - Formula: `Max(120, GameLength / 10)`.
    - Example: 40 min game -> 4 min min-interval.
- **Basketball**: Tie `minSubstitutionGap` to the number of players.
    - More players = shorter allowed gaps (to fit everyone in).
    - Fewer players = longer gaps (let them play).

### 3. User-Facing Controls
Expose key "Levers" to the user in the UI:
- [ ] **"Disruption Tolerance"**: Slider (Low = few subs, High = many subs).
- [ ] **"Fairness Strictness"**: Slider (Strict = equal minutes, Loose = best players play more).

### 4. Refactoring
- Move all magic numbers in `basketball-interval-optimizer.js` to a `defaultConfig` object at the top of the class or in a separate config file, similar to `soccer-constants.js`.
- Replace hardcoded `0.8` multipliers with named constants like `FATIGUE_WARNING_THRESHOLD`.
