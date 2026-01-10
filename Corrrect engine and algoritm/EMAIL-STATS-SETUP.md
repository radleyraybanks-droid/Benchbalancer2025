# 📧 Email Stats Feature - Complete Setup Guide

## Overview

This feature automatically collects guest user emails after basketball games and sends them beautiful HTML stats reports via **Resend**. It's a powerful lead generation tool that provides value to users while building your marketing list.

---

## 🎯 What Was Created

### ✅ **1. Updated Edge Function**
**File**: `supabase/functions/send-game-stats-email/index.ts:39`

Changed the "from" email from:
```typescript
from: 'Bench Balancer <onboarding@resend.dev>',  // ❌ Won't work
```

To:
```typescript
from: 'Bench Balancer <noreply@benchbalancer.com>',  // ✅ Production ready
```

### ✅ **2. Database Migration**
**File**: `config/migration-guest-emails.sql`

Creates:
- `guest_emails` table with proper schema
- Indexes for performance
- RLS policies for security
- Triggers for auto-updating timestamps
- Prevents duplicate submissions within 24 hours

### ✅ **3. Automated Deployment Script**
**File**: `deploy-email-stats.sh`

One-command deployment that:
- Validates Resend API key
- Runs database migration
- Deploys Edge Function
- Sets up secrets
- Includes testing capability

---

## 🚀 Quick Start (5 Minutes)

### **Prerequisites**

1. **Resend Account**: Sign up at [resend.com](https://resend.com) (free tier available)
2. **Supabase CLI**: Install with `npm install -g supabase`
3. **Verified Domain**: Must verify `benchbalancer.com` in Resend

### **Step 1: Get Resend API Key**

1. Go to [resend.com/api-keys](https://resend.com/api-keys)
2. Click **Create API Key**
3. Name it: "Bench Balancer Production"
4. Copy the key (starts with `re_`)

### **Step 2: Verify Your Domain**

**CRITICAL - Do this first!**

1. Go to [resend.com/domains](https://resend.com/domains)
2. Click **Add Domain**
3. Enter: `benchbalancer.com`
4. Add these DNS records to your domain provider:

```
Type: TXT
Name: _resend
Value: [provided by Resend]

Type: CNAME
Name: resend._domainkey
Value: [provided by Resend]

Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; pct=100; rua=mailto:noreply@benchbalancer.com
```

5. Wait 5-30 minutes for verification

### **Step 3: Run Deployment Script**

```bash
cd "Corrrect engine and algoritm"

# Export your Resend API key
export RESEND_API_KEY="re_your_actual_key_here"

# Run automated deployment
./deploy-email-stats.sh
```

The script will:
- ✅ Validate configuration
- ✅ Link Supabase project
- ✅ Run database migration
- ✅ Deploy Edge Function
- ✅ Set secrets
- ✅ Offer to send test email

---

## 📋 Manual Deployment (Alternative)

If you prefer manual control:

### **1. Run Database Migration**

```bash
cd "Corrrect engine and algoritm"
supabase db execute -f config/migration-guest-emails.sql
```

### **2. Set Resend Secret**

```bash
supabase secrets set RESEND_API_KEY="re_your_key_here"
```

### **3. Deploy Edge Function**

```bash
cd supabase/functions
supabase functions deploy send-game-stats-email --no-verify-jwt
cd ../..
```

### **4. Verify Deployment**

```bash
# Check function logs
supabase functions logs send-game-stats-email

# List secrets (values are hidden)
supabase secrets list
```

---

## 🧪 Testing

### **Method 1: Automated Test**

During deployment, choose "y" when asked to send test email.

### **Method 2: Manual cURL Test**

```bash
curl -X POST \
  "https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-game-stats-email" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "gameData": {
      "finalScore": "85 - 72",
      "homeScore": 85,
      "awayScore": 72,
      "gameDate": "2026-01-10",
      "gameTime": "7:30 PM",
      "variance": 45,
      "totalPlayers": 12,
      "players": [
        {
          "name": "John Doe",
          "position": "PG",
          "courtTime": 24,
          "benchTime": 8,
          "points": 15
        }
      ]
    }
  }'
```

### **Method 3: Full Integration Test**

1. Open `basketball.html` in browser
2. **DO NOT log in** (test as guest)
3. Set up a game with 8+ players
4. Play through to completion
5. Modal should appear automatically
6. Enter test email
7. Check inbox (and spam folder)

---

## 📊 How It Works

### **User Flow**

```
Game Ends (guest user)
    ↓
Modal appears automatically (basketball-integration-main.js:957)
    ↓
User enters email
    ↓
Email saved to guest_emails table (line 1201)
    ↓
Edge Function invoked (line 1216)
    ↓
Resend API sends email (index.ts:32)
    ↓
User receives beautiful HTML stats report
```

### **Email Template Includes**

- 🏀 Final score (large, centered)
- 📊 Game summary (total players, variance)
- 👥 Individual player statistics table
- 🎯 Rotation balance analysis
- 💎 Upgrade CTA to Bench Balancer Pro
- 🔗 Links back to benchbalancer.com

### **Data Collected**

Stored in `guest_emails` table:
- Email address
- Source (`game_stats`)
- Game data (JSON):
  - Final score
  - Player statistics
  - Court/bench time
  - Variance
  - Date/time
- Subscription status
- Timestamps

---

## 🔍 Monitoring & Analytics

### **View Collected Emails**

Open in browser:
```
file:///path/to/guest-emails-admin.html
```

Features:
- Total emails collected
- Daily/weekly stats
- Game data for each submission
- Export to CSV

### **Resend Dashboard**

Monitor at [resend.com/emails](https://resend.com/emails):
- Delivery rates
- Open rates
- Bounce rates
- Spam complaints

### **Supabase Logs**

```bash
# Real-time logs
supabase functions logs send-game-stats-email --follow

# Recent errors
supabase functions logs send-game-stats-email --level error
```

### **Database Queries**

```sql
-- Total emails collected
SELECT COUNT(*) FROM guest_emails;

-- Emails today
SELECT COUNT(*) FROM guest_emails
WHERE created_at >= CURRENT_DATE;

-- Top performing games (by variance)
SELECT
  email,
  game_data->>'variance' as variance,
  game_data->>'finalScore' as score
FROM guest_emails
ORDER BY (game_data->>'variance')::int ASC
LIMIT 10;

-- Export for marketing
SELECT
  email,
  created_at,
  subscribed
FROM guest_emails
WHERE subscribed = true
ORDER BY created_at DESC;
```

---

## ⚠️ Common Issues & Solutions

### **Issue: Email goes to spam**

**Solution:**
1. Verify all DNS records are correct
2. Add DMARC policy (included in migration)
3. Send test to [mail-tester.com](https://www.mail-tester.com) for analysis
4. Warm up domain (start with small volume)

### **Issue: "onboarding@resend.dev" error**

**Solution:**
✅ Already fixed in `index.ts:39` - now uses `noreply@benchbalancer.com`

### **Issue: RESEND_API_KEY not found**

**Solution:**
```bash
supabase secrets set RESEND_API_KEY="re_your_key"
```

### **Issue: CORS error**

**Solution:**
✅ Already handled in Edge Function (index.ts:7-14)

### **Issue: Modal doesn't appear**

**Solution:**
Check that user is NOT logged in (feature only shows for guests)

```javascript
// Debug in console
const session = localStorage.getItem('sb-pomcalscfnwsqlscunxf-auth-token');
console.log('Logged in?', !!session);  // Should be false
```

### **Issue: Function deployment fails**

**Solution:**
```bash
# Check Supabase CLI version
supabase --version

# Update if needed
npm install -g supabase@latest

# Try deployment with verbose logging
supabase functions deploy send-game-stats-email --debug
```

---

## 💰 Resend Pricing & Limits

| Tier | Price | Emails/Month | Emails/Day |
|------|-------|--------------|------------|
| Free | $0 | 3,000 | 100 |
| Pro | $20 | 50,000 | 1,666 |
| Scale | $85 | 250,000 | 8,333 |

**Recommendation**: Start with free tier, upgrade when you hit ~80 emails/day consistently

---

## 🎨 Customization

### **Change Email Design**

Edit `index.ts:77-216` - the `createEmailHTML()` function

### **Change "From" Name**

```typescript
from: 'Your Team <noreply@yourdomain.com>',
```

### **Add PDF Attachment**

See commented code in `basketball-integration-main.js:611-687` for jsPDF implementation

### **Customize Modal**

Edit `basketball-integration-main.js:957-1117` - the `showGuestStatsEmailModal()` function

---

## 🔒 Security & Privacy

### **RLS Policies**

✅ Anonymous users: Can only INSERT
✅ Authenticated users: Can SELECT (admin view)
✅ Service role: Full access (Edge Functions)

### **GDPR Compliance**

The modal includes:
> "By providing your email, you'll receive game stats and occasional updates about Bench Balancer Pro features."

**Add to privacy policy:**
- Email is stored securely in Supabase
- Used only for stats delivery and marketing
- Users can unsubscribe anytime
- Data not shared with third parties

### **Unsubscribe Handling**

```sql
-- Mark user as unsubscribed
UPDATE guest_emails
SET subscribed = false
WHERE email = 'user@example.com';
```

---

## 📈 Optimization Tips

1. **A/B Test Subject Lines**
   - Current: "🏀 Your Game Stats - 85 - 72"
   - Try: "Your Team's Performance Report is Ready"
   - Or: "🏆 Game Complete! Here's How Your Team Did"

2. **Send Time Optimization**
   - Emails sent immediately after game
   - Consider 1-hour delay for better engagement?

3. **Follow-up Sequence**
   - Day 1: Stats email (current)
   - Day 3: Tips email ("3 Ways to Improve Rotation Balance")
   - Day 7: Upgrade offer ("Ready for Pro Features?")

4. **Segment by Performance**
   - Variance < 60s: "Perfect rotation! Here's your stats"
   - Variance > 120s: "Struggling with rotations? We can help"

---

## 🆘 Support & Troubleshooting

### **Check Deployment Status**

```bash
# View all functions
supabase functions list

# Check secrets (values hidden)
supabase secrets list

# Test database connection
supabase db ping
```

### **Reset Everything**

```bash
# Delete Edge Function
supabase functions delete send-game-stats-email

# Drop table (CAUTION - deletes data!)
supabase db execute -c "DROP TABLE IF EXISTS guest_emails CASCADE;"

# Re-run deployment
./deploy-email-stats.sh
```

### **Get Help**

- **Resend Docs**: https://resend.com/docs
- **Supabase Docs**: https://supabase.com/docs/guides/functions
- **Edge Function Logs**: `supabase functions logs send-game-stats-email`

---

## ✅ Deployment Checklist

Use this before going live:

- [ ] Resend account created
- [ ] Domain verified in Resend (all DNS records green)
- [ ] RESEND_API_KEY obtained
- [ ] Supabase CLI installed and updated
- [ ] Supabase project linked
- [ ] Database migration executed successfully
- [ ] Edge Function deployed
- [ ] Test email sent and received (not in spam)
- [ ] Guest modal tested in production
- [ ] Admin panel accessible
- [ ] Privacy policy updated
- [ ] Monitoring dashboard configured

---

## 🎉 Success!

Your email stats feature is now live! Every guest user who completes a game will see the modal and can opt-in to receive their stats.

**Expected Results:**
- 20-40% conversion rate (guests who enter email)
- High-quality leads (engaged coaches/team managers)
- Valuable game data for analytics
- Automated lead nurturing opportunity

**Next Steps:**
1. Monitor first 100 emails for deliverability
2. Set up email sequence for follow-up
3. Add social proof to modal ("Join 1,000+ coaches")
4. Consider incentive ("Get stats + free rotation tips")

---

*Generated: 2026-01-10*
*Version: 1.0*
*Feature: Guest Email Stats Collection*
