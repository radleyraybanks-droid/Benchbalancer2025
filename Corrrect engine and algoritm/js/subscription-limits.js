/**
 * Subscription Limits Manager
 * Handles logic for free tier game limits (3 competitive matches)
 */

import { benchBalancerSupabase } from '../config/simple-supabase.js';

export const SubscriptionLimits = {
    // Constants
    FREE_TIER_LIMIT: 3,

    /**
     * Check if user is Pro or Elite
     * @param {string} userId
     * @returns {Promise<boolean>}
     */
    async isProUser(userId) {
        if (!userId || !benchBalancerSupabase) return false;

        const { data: profile } = await benchBalancerSupabase
            .from('profiles')
            .select('subscription_tier')
            .eq('id', userId)
            .single();

        // Both 'pro' and 'elite' tiers have unlimited access
        return profile?.subscription_tier === 'pro' || profile?.subscription_tier === 'elite';
    },

    /**
     * Check if user is Elite (has access to all sports)
     * @param {string} userId
     * @returns {Promise<boolean>}
     */
    async isEliteUser(userId) {
        if (!userId || !benchBalancerSupabase) return false;

        const { data: profile } = await benchBalancerSupabase
            .from('profiles')
            .select('subscription_tier')
            .eq('id', userId)
            .single();

        return profile?.subscription_tier === 'elite';
    },

    /**
     * Get user's subscription tier
     * @param {string} userId
     * @returns {Promise<string>} 'free', 'pro', or 'elite'
     */
    async getSubscriptionTier(userId) {
        if (!userId || !benchBalancerSupabase) return 'free';

        const { data: profile } = await benchBalancerSupabase
            .from('profiles')
            .select('subscription_tier')
            .eq('id', userId)
            .single();

        return profile?.subscription_tier || 'free';
    },

    /**
     * Get count of competitive matches played by user
     * @param {string} userId
     * @returns {Promise<number>}
     */
    async getCompetitiveMatchCount(userId) {
        if (!userId || !benchBalancerSupabase) return 0;

        const { count, error } = await benchBalancerSupabase
            .from('match_results')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId);

        if (error) {
            console.error('[Limits] Error counting matches:', error);
            return 0;
        }

        return count || 0;
    },

    /**
     * Check if user can play a new competitive match
     * @param {string} userId
     * @returns {Promise<{allowed: boolean, isPro: boolean, remaining: number, played: number}>}
     */
    async checkCanPlayMatch(userId) {
        if (!userId) return { allowed: false, error: 'not_authenticated' };

        const isPro = await this.isProUser(userId);
        if (isPro) {
            return { allowed: true, isPro: true, remaining: Infinity, played: 0 };
        }

        const played = await this.getCompetitiveMatchCount(userId);
        const remaining = Math.max(0, this.FREE_TIER_LIMIT - played);

        return {
            allowed: remaining > 0,
            isPro: false,
            remaining,
            played
        };
    },

    /**
     * Show appropriate modal/alert based on status
     * @param {Object} status - Result from checkCanPlayMatch
     * @returns {boolean} - True if user can proceed (after acknowledgement), False if blocked
     */
    showLimitWarning(status) {
        if (status.isPro) return true;

        if (!status.allowed) {
            // Blocked
            this.showUpgradeModal('limit_reached');
            return false;
        }

        // Warnings
        if (status.played === 0) {
            alert(`🏆 Welcome to Competitive Mode!\n\nAs a free user, you can play and save 3 competitive matches.\n\nMatch 1 of 3 starting now.`);
            return true;
        } else if (status.remaining === 1) {
            alert(`⚠️ Final Free Competitive Match\n\nThis is your last match with saved stats.\n\nMatch ${status.played + 1} of 3 starting now.\nUpgrade to Pro to continue tracking your team!`);
            return true;
        } else {
            alert(`📊 Competitive Match ${status.played + 1} of 3\n\nYou have ${status.remaining} matches remaining on the free tier.`);
            return true;
        }
    },

    /**
     * Render and show the Upgrade Modal
     * @param {string} reason - 'limit_reached' or other context
     */
    showUpgradeModal(reason) {
        const modalId = 'upgradeLimitModal';
        let modal = document.getElementById(modalId);

        if (!modal) {
            modal = document.createElement('div');
            modal.id = modalId;
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(4, 7, 13, 0.95); backdrop-filter: blur(10px);
                display: flex; align-items: center; justify-content: center; z-index: 10000;
            `;

            modal.innerHTML = `
                <div style="background: linear-gradient(135deg, #0d1626 0%, #060b14 100%); border: 1px solid rgba(0, 255, 224, 0.3); border-radius: 20px; padding: 40px; max-width: 500px; width: 90%; text-align: center; box-shadow: 0 0 50px rgba(0, 255, 224, 0.15);">
                    <div style="font-size: 48px; margin-bottom: 20px;">🔒</div>
                    <h2 style="font-family: 'Bebas Neue', sans-serif; font-size: 36px; color: #fff; margin-bottom: 15px; letter-spacing: 2px;">MATCH LIMIT REACHED</h2>
                    <p style="color: #94a3b8; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
                        You've used all 3 free competitive matches. Your stats for these games are safe and viewable forever.
                        <br><br>
                        <strong>Upgrade to Pro to:</strong>
                    </p>
                    <ul style="text-align: left; color: #fff; margin-bottom: 30px; list-style: none; padding-left: 20px;">
                        <li style="margin-bottom: 10px;">✅ Play unlimited competitive matches</li>
                        <li style="margin-bottom: 10px;">✅ Save full team history & stats</li>
                        <li style="margin-bottom: 10px;">✅ Access advanced analytics</li>
                    </ul>
                    
                    <button onclick="window.location.href='pro-squad-management.html?upgrade=true'" style="width: 100%; background: linear-gradient(90deg, #00ffe0 0%, #00cdb8 100%); color: #04070d; border: none; padding: 16px; border-radius: 12px; font-weight: bold; font-family: 'Russo One', sans-serif; letter-spacing: 1px; cursor: pointer; font-size: 16px; margin-bottom: 15px; text-transform: uppercase;">
                        UPGRADE TO PRO
                    </button>
                    
                    <button onclick="document.getElementById('${modalId}').style.display='none'" style="background: transparent; border: 1px solid #2d3748; color: #94a3b8; padding: 12px 24px; border-radius: 12px; cursor: pointer; font-size: 14px;">
                        Close & View History
                    </button>
                </div>
            `;
            document.body.appendChild(modal);
        }

        modal.style.display = 'flex';
    }
};

// Expose globally
window.SubscriptionLimits = SubscriptionLimits;
