import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST',
                'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            }
        })
    }

    try {
        const { email, gameData } = await req.json()

        // Validate input
        if (!email || !gameData) {
            return new Response(
                JSON.stringify({ error: 'Email and game data required' }),
                { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
            )
        }

        // Create HTML email
        const htmlContent = createEmailHTML(gameData)

        // Send email via Resend
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
                from: 'Bench Balancer <noreply@benchbalancer.com>',
                to: [email],
                subject: `🏀 Your Game Stats - ${gameData.finalScore}`,
                html: htmlContent,
            }),
        })

        const data = await res.json()

        if (res.ok) {
            return new Response(
                JSON.stringify({ success: true, messageId: data.id }),
                {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                }
            )
        } else {
            throw new Error(data.message || 'Failed to send email')
        }

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            }
        )
    }
})

function createEmailHTML(gameData) {
    const { finalScore, gameDate, gameTime, variance, players, totalPlayers } = gameData

    const playerRows = players.map((p, i) => `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 12px; font-weight: 600; color: #1f2937;">${i + 1}</td>
      <td style="padding: 12px; font-weight: 600; color: #1f2937;">${p.name}</td>
      <td style="padding: 12px; text-align: center; color: #6b7280;">${p.position}</td>
      <td style="padding: 12px; text-align: center; color: #10b981; font-weight: 600;">${p.courtTime}</td>
      <td style="padding: 12px; text-align: center; color: #6b7280;">${p.benchTime}</td>
      <td style="padding: 12px; text-align: center; color: #00ffe0; font-weight: 700; font-size: 16px;">${p.points}</td>
    </tr>
  `).join('')

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Your Game Stats</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff;">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #0a1220 0%, #0d1626 100%); padding: 40px 20px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 16px;">🏀</div>
      <h1 style="margin: 0; color: #00ffe0; font-size: 32px; font-weight: 700; text-shadow: 0 0 20px rgba(0, 255, 224, 0.5);">
        Game Stats Report
      </h1>
      <p style="margin: 12px 0 0 0; color: #94a3b8; font-size: 16px;">
        ${gameDate} at ${gameTime}
      </p>
    </div>

    <!-- Final Score -->
    <div style="padding: 32px 20px; text-align: center; background: linear-gradient(180deg, #ffffff 0%, #f9fafb 100%);">
      <div style="display: inline-block; background: rgba(0, 255, 224, 0.1); border: 2px solid #00ffe0; border-radius: 16px; padding: 24px 48px;">
        <div style="color: #6b7280; font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;">
          Final Score
        </div>
        <div style="font-size: 48px; font-weight: 700; color: #00ffe0; font-family: 'Courier New', monospace;">
          ${finalScore}
        </div>
      </div>
    </div>

    <!-- Stats Summary -->
    <div style="padding: 32px 20px; background: #f9fafb;">
      <h2 style="margin: 0 0 24px 0; color: #1f2937; font-size: 24px; font-weight: 700;">
        📊 Game Summary
      </h2>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
        <div style="background: white; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb;">
          <div style="color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
            Total Players
          </div>
          <div style="font-size: 32px; font-weight: 700; color: #00ffe0;">
            ${totalPlayers}
          </div>
        </div>
        
        <div style="background: white; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb;">
          <div style="color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
            Rotation Variance
          </div>
          <div style="font-size: 32px; font-weight: 700; color: ${variance <= 60 ? '#10b981' : '#f59e0b'};">
            ${variance}s
          </div>
        </div>
      </div>

      ${variance <= 60 ? `
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 12px; padding: 16px; color: white; text-align: center;">
          <div style="font-size: 20px; margin-bottom: 4px;">🎯</div>
          <div style="font-weight: 600;">Excellent Rotation Balance!</div>
          <div style="font-size: 14px; opacity: 0.9; margin-top: 4px;">Your players had fair court time.</div>
        </div>
      ` : `
        <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 12px; padding: 16px; color: white; text-align: center;">
          <div style="font-size: 20px; margin-bottom: 4px;">⚠️</div>
          <div style="font-weight: 600;">Room for Improvement</div>
          <div style="font-size: 14px; opacity: 0.9; margin-top: 4px;">Some players got more court time than others.</div>
        </div>
      `}
    </div>

    <!-- Player Stats Table -->
    <div style="padding: 32px 20px;">
      <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 700;">
        👥 Player Statistics
      </h2>
      
      <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
        <thead>
          <tr style="background: linear-gradient(135deg, #0d1626 0%, #0a1220 100%);">
            <th style="padding: 12px; text-align: left; color: #00ffe0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">#</th>
            <th style="padding: 12px; text-align: left; color: #00ffe0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Player</th>
            <th style="padding: 12px; text-align: center; color: #00ffe0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Pos</th>
            <th style="padding: 12px; text-align: center; color: #00ffe0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Court</th>
            <th style="padding: 12px; text-align: center; color: #00ffe0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Bench</th>
            <th style="padding: 12px; text-align: center; color: #00ffe0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Points</th>
          </tr>
        </thead>
        <tbody>
          ${playerRows}
        </tbody>
      </table>
    </div>

    <!-- CTA -->
    <div style="padding: 40px 20px; text-align: center; background: linear-gradient(180deg, #f9fafb 0%, #fff 100%);">
      <h3 style="margin: 0 0 12px 0; color: #1f2937; font-size: 20px;">
        Want more advanced features?
      </h3>
      <p style="margin: 0 0 24px 0; color: #6b7280; line-height: 1.6;">
        Upgrade to <strong>Bench Balancer Pro</strong> for automatic stat tracking, season analytics, and team management tools!
      </p>
      <a href="https://benchbalancer.com/index.html" style="display: inline-block; background: linear-gradient(135deg, #00ffe0 0%, #00cdb8 100%); color: #000; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-weight: 700; font-size: 16px; text-transform: uppercase; letter-spacing: 0.05em;">
        Upgrade to Pro
      </a>
    </div>

    <!-- Footer -->
    <div style="padding: 32px 20px; background: #0a1220; text-align: center;">
      <p style="margin: 0 0 12px 0; color: #94a3b8; font-size: 14px;">
        Thanks for using Bench Balancer!
      </p>
      <p style="margin: 0; color: #64748b; font-size: 12px;">
        <a href="https://benchbalancer.com" style="color: #00ffe0; text-decoration: none;">benchbalancer.com</a>
      </p>
    </div>

  </div>
</body>
</html>
  `
}
