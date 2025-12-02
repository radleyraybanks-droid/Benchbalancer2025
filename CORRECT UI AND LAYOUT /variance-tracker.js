// --- variance-tracker.js (Converted to Regular JavaScript) ---

// All dependencies should now be global variables/functions
// Constants, utility functions, and game state variables are assumed to be available globally

// Historical tracking
let varianceHistory = [];
let lastVarianceCheckTime = 0;

// Helper to read the live game state from global variables
function gs() {
    return {
        allPlayers: allPlayers,
        playerRemovedStatus: playerRemovedStatus,
        playerGKStatus: playerGKStatus,
        onField: onField,
        onBench: onBench,
        gameSettings: gameSettings,
        periodLengthSeconds: periodLengthSeconds,
        currentGameSeconds: currentGameSeconds,
        targetSubTimes: targetSubTimes,
        optimizedSubPlan: optimizedSubPlan,
        playerPlayTimes: playerPlayTimes,
        playerBenchTimes: playerBenchTimes
    };
}

/**
 * Calculate current playing time variance and statistics
 * @returns {Object} Variance data including min, max, average, and target status
 */
function calculateCurrentVariance() {
    const { allPlayers, playerRemovedStatus, playerGKStatus, onField, playerPlayTimes, playerBenchTimes } = gs();
    const activePlayers = allPlayers.filter(p => !playerRemovedStatus[p] && !playerGKStatus[p]);
    
    if (activePlayers.length === 0) {
        return {
            variance: 0,
            average: 0,
            min: 0,
            max: 0,
            minPlayer: null,
            maxPlayer: null,
            targetMet: true,
            status: 'no-players',
            playerCount: 0
        };
    }
    
    // Calculate play times with current game state
    const playerData = activePlayers.map(p => ({
        name: p,
        playTime: playerPlayTimes[p] || 0,
        benchTime: playerBenchTimes[p] || 0,
        isOnField: onField.includes(p)
    }));
    
    const playTimes = playerData.map(p => p.playTime);
    const avgPlayTime = playTimes.reduce((a, b) => a + b, 0) / playTimes.length;
    const minTime = Math.min(...playTimes);
    const maxTime = Math.max(...playTimes);
    const variance = maxTime - minTime;
    
    // Find players with min and max times
    const minPlayer = playerData.find(p => p.playTime === minTime);
    const maxPlayer = playerData.find(p => p.playTime === maxTime);
    
    // Determine status
    let status = 'excellent';
    if (variance > VARIANCE_CRITICAL_SECONDS) status = 'critical';
    else if (variance > VARIANCE_WARNING_SECONDS) status = 'warning';
    else if (variance > VARIANCE_TARGET_SECONDS) status = 'attention';
    
    return {
        variance,
        average: avgPlayTime,
        min: minTime,
        max: maxTime,
        minPlayer: minPlayer ? minPlayer.name : null,
        maxPlayer: maxPlayer ? maxPlayer.name : null,
        targetMet: variance <= VARIANCE_TARGET_SECONDS,
        status,
        playerCount: activePlayers.length,
        playerData
    };
}

/**
 * Project final variance if we continue with current plan
 * @returns {number} Projected variance in seconds
 */
function projectFinalVariance() {
    const { periodLengthSeconds, gameSettings, currentGameSeconds, allPlayers, playerRemovedStatus, playerGKStatus, onField, targetSubTimes, optimizedSubPlan, playerPlayTimes } = gs();
    const totalGameTime = periodLengthSeconds * gameSettings.numPeriods;
    const remainingGameTime = totalGameTime - currentGameSeconds;
    
    if (remainingGameTime <= 0) {
        return calculateCurrentVariance().variance;
    }
    
    const activePlayers = allPlayers.filter(p => !playerRemovedStatus[p] && !playerGKStatus[p]);
    
    // Clone current play times
    let projectedTimes = {};
    activePlayers.forEach(p => {
        projectedTimes[p] = playerPlayTimes[p] || 0;
    });
    
    // Get current non-GK field players
    let currentFieldPlayers = onField.filter(p => !playerGKStatus[p]);
    let lastSubTime = currentGameSeconds;
    
    // Simulate remaining substitutions
    const remainingSubs = targetSubTimes.filter(t => t > currentGameSeconds);
    
    remainingSubs.forEach(subTime => {
        const timeSegment = subTime - lastSubTime;
        
        // Add play time for this segment
        currentFieldPlayers.forEach(p => {
            if (projectedTimes.hasOwnProperty(p)) {
                projectedTimes[p] += timeSegment;
            }
        });
        
        // Apply planned substitution
        const plannedSub = optimizedSubPlan.find(s => s.time === subTime);
        if (plannedSub && plannedSub.off && plannedSub.on) {
            currentFieldPlayers = currentFieldPlayers.filter(p => !plannedSub.off.includes(p));
            plannedSub.on.forEach(p => {
                if (!playerGKStatus[p] && !currentFieldPlayers.includes(p)) {
                    currentFieldPlayers.push(p);
                }
            });
        }
        
        lastSubTime = subTime;
    });
    
    // Add remaining time after last sub
    const finalSegment = totalGameTime - lastSubTime;
    if (finalSegment > 0) {
        currentFieldPlayers.forEach(p => {
            if (projectedTimes.hasOwnProperty(p)) {
                projectedTimes[p] += finalSegment;
            }
        });
    }
    
    const times = Object.values(projectedTimes);
    if (times.length === 0) return 0;
    
    return Math.max(...times) - Math.min(...times);
}

/**
 * Track variance history for graphing
 * @param {boolean} force - Force recording even if recently checked
 */
function recordVarianceHistory(force = false) {
    const { currentGameSeconds } = gs();
    const now = currentGameSeconds;
    
    // Only record every 30 seconds unless forced
    if (!force && (now - lastVarianceCheckTime) < 30) return;
    
    const variance = calculateCurrentVariance();
    const projected = projectFinalVariance();
    
    varianceHistory.push({
        gameTime: now,
        actualVariance: variance.variance,
        projectedVariance: projected,
        status: variance.status,
        timestamp: new Date().toISOString()
    });
    
    lastVarianceCheckTime = now;
    
    // Limit history size to prevent memory issues
    if (varianceHistory.length > 100) {
        varianceHistory = varianceHistory.slice(-100);
    }
}

/**
 * Get variance trend (improving, stable, or worsening)
 * @returns {string} Trend description
 */
function getVarianceTrend() {
    if (varianceHistory.length < 2) return 'insufficient-data';
    
    const recent = varianceHistory.slice(-5); // Last 5 recordings
    if (recent.length < 2) return 'insufficient-data';
    
    const firstVariance = recent[0].actualVariance;
    const lastVariance = recent[recent.length - 1].actualVariance;
    const change = lastVariance - firstVariance;
    
    if (Math.abs(change) < 5) return 'stable';
    return change < 0 ? 'improving' : 'worsening';
}

/**
 * ENHANCED: Determine if we need to adjust the substitution strategy
 * Now integrates with Dynamic Perfect Balance Algorithm for intelligent recommendations
 * @returns {Object} Adjustment recommendation
 */
function shouldAdjustStrategy() {
    const current = calculateCurrentVariance();
    const projected = projectFinalVariance();
    const trend = getVarianceTrend();
    const { periodLengthSeconds, gameSettings, currentGameSeconds } = gs();
    const remainingTime = (periodLengthSeconds * gameSettings.numPeriods) - currentGameSeconds;
    
    let recommendation = {
        needsAdjustment: false,
        currentVariance: current.variance,
        projectedVariance: projected,
        trend,
        action: 'continue',
        reason: 'On track to meet target',
        suggestedSubsPerChange: gameSettings.subsPerChange,
        confidence: 'high'
    };
    
    // No adjustment needed if we're meeting target
    if (projected <= VARIANCE_TARGET_SECONDS) {
        return recommendation;
    }
    
    // Critical situation - trigger dynamic recalculation if available
    if (projected > VARIANCE_CRITICAL_SECONDS && remainingTime < 600) {
        recommendation.needsAdjustment = true;
        recommendation.action = 'urgent';
        recommendation.reason = 'Critical variance with limited time remaining';
        
        // Try dynamic recalculation first
        if (typeof triggerPerfectBalanceRecalculation !== 'undefined') {
            recommendation.action = 'trigger_recalculation';
            recommendation.reason = 'Critical variance - dynamic recalculation recommended';
            recommendation.recalculationType = 'CRITICAL_BALANCE';
        } else {
            recommendation.suggestedSubsPerChange = Math.min(3, 
                Math.min(onField.filter(p => !playerGKStatus[p]).length, 
                        onBench.filter(p => !playerGKStatus[p] && !playerRemovedStatus[p]).length));
        }
        recommendation.confidence = 'high';
    }
    // Warning situation
    else if (projected > VARIANCE_WARNING_SECONDS) {
        recommendation.needsAdjustment = true;
        recommendation.action = 'adjust';
        recommendation.reason = 'Variance exceeding warning threshold';
        
        // Suggest optimal subs based on imbalance
        const underPlayedCount = current.playerData.filter(p => p.playTime < current.average - 30).length;
        const overPlayedCount = current.playerData.filter(p => p.playTime > current.average + 30).length;
        
        if (underPlayedCount >= 2 && overPlayedCount >= 2) {
            recommendation.suggestedSubsPerChange = 2;
        } else if (underPlayedCount >= 3 && overPlayedCount >= 3 && remainingTime < 900) {
            recommendation.suggestedSubsPerChange = 3;
        } else {
            recommendation.suggestedSubsPerChange = 1;
        }
        recommendation.confidence = 'medium';
    }
    // Attention needed
    else if (projected > VARIANCE_TARGET_SECONDS) {
        recommendation.needsAdjustment = true;
        recommendation.action = 'monitor';
        recommendation.reason = 'Variance slightly above target';
        recommendation.confidence = 'low';
    }
    
    // Consider trend
    if (trend === 'worsening' && recommendation.action === 'continue') {
        recommendation.action = 'monitor';
        recommendation.reason = 'Variance trend is worsening';
    }
    
    return recommendation;
}

/**
 * Get players who need more playing time
 * @returns {Array} Array of player names sorted by need
 */
function getPlayersNeedingTime() {
    const current = calculateCurrentVariance();
    if (!current.playerData) return [];
    
    return current.playerData
        .filter(p => p.playTime < current.average - 15) // 15 seconds below average
        .sort((a, b) => a.playTime - b.playTime)
        .map(p => p.name);
}

/**
 * Get players who have excess playing time
 * @returns {Array} Array of player names sorted by excess
 */
function getPlayersWithExcessTime() {
    const current = calculateCurrentVariance();
    if (!current.playerData) return [];
    
    return current.playerData
        .filter(p => p.playTime > current.average + 15) // 15 seconds above average
        .sort((a, b) => b.playTime - a.playTime)
        .map(p => p.name);
}

/**
 * Calculate optimal substitutions for next change
 * @param {number} originalSubsPerChange - The configured subs per change
 * @returns {Object} Recommendation for next substitution
 */
function determineOptimalSubsForNextChange(originalSubsPerChange) {
    const strategy = shouldAdjustStrategy();
    const needingTime = getPlayersNeedingTime();
    const excessTime = getPlayersWithExcessTime();
    
    // Filter to only available players
    const availableNeedingTime = needingTime.filter(p => onBench.includes(p));
    const availableExcessTime = excessTime.filter(p => onField.includes(p) && !playerGKStatus[p]);
    
    let recommendation = {
        original: originalSubsPerChange,
        recommended: originalSubsPerChange,
        playersOff: [],
        playersOn: [],
        reason: 'Using configured setting',
        override: false,
        userCanReject: true,
        confidence: strategy.confidence || 'medium'
    };
    
    // If strategy suggests adjustment
    if (strategy.needsAdjustment && strategy.suggestedSubsPerChange !== originalSubsPerChange) {
        const maxPossibleSubs = Math.min(
            availableNeedingTime.length,
            availableExcessTime.length,
            3 // Maximum allowed
        );
        
        recommendation.recommended = Math.min(strategy.suggestedSubsPerChange, maxPossibleSubs);
        recommendation.override = recommendation.recommended !== originalSubsPerChange;
        
        if (recommendation.override) {
            recommendation.reason = `BALANCER OVERRIDE: ${strategy.reason}. Changing from ${originalSubsPerChange} to ${recommendation.recommended} subs`;
            
            // Suggest specific players
            recommendation.playersOff = availableExcessTime.slice(0, recommendation.recommended);
            recommendation.playersOn = availableNeedingTime.slice(0, recommendation.recommended);
        }
    }
    
    return recommendation;
}

/**
 * Get variance history for display
 * @param {number} limit - Maximum number of entries to return
 * @returns {Array} Formatted history entries
 */
function getVarianceHistoryForDisplay(limit = 10) {
    const recent = varianceHistory.slice(-limit);
    
    return recent.map(entry => ({
        time: formatTime(entry.gameTime),
        variance: formatTime(entry.actualVariance),
        projected: formatTime(entry.projectedVariance),
        status: entry.status,
        statusIcon: getStatusIcon(entry.status)
    }));
}

/**
 * Get status icon for display
 * @param {string} status - Status string
 * @returns {string} Icon character
 */
function getStatusIcon(status) {
    switch(status) {
        case 'excellent': return '✅';
        case 'attention': return '📊';
        case 'warning': return '⚠️';
        case 'critical': return '🚨';
        default: return '●';
    }
}

/**
 * Reset variance tracking (call on game reset)
 */
function resetVarianceTracking() {
    varianceHistory = [];
    lastVarianceCheckTime = 0;
    debugLog("Variance tracking reset");
}

//========================================================================
// DYNAMIC ALGORITHM INTEGRATION
//========================================================================

/**
 * ENHANCED: Smart auto-recalculation trigger
 * Monitors variance and triggers recalculation when beneficial
 */
function monitorAndTriggerRecalculation() {
    const strategy = shouldAdjustStrategy();
    
    // Trigger recalculation if recommended
    if (strategy.action === 'trigger_recalculation' && typeof triggerPerfectBalanceRecalculation !== 'undefined') {
        debugLog('🎯 Variance monitor triggering recalculation:', strategy.reason);
        
        const success = triggerPerfectBalanceRecalculation(strategy.reason);
        
        if (success) {
            // Record that we triggered a recalculation
            varianceHistory.push({
                gameTime: gs().currentGameSeconds,
                actualVariance: strategy.currentVariance,
                projectedVariance: strategy.projectedVariance,
                status: 'recalculation_triggered',
                timestamp: new Date().toISOString(),
                recalculationType: strategy.recalculationType
            });
            
            debugLog('✅ Auto-recalculation triggered successfully');
            return true;
        }
    }
    
    return false;
}

/**
 * ENHANCED: Check if dynamic algorithm can improve current situation
 */
function evaluateDynamicImprovementPotential() {
    const current = calculateCurrentVariance();
    const projected = projectFinalVariance();
    
    // If variance is already excellent, no need for dynamic intervention
    if (projected <= VARIANCE_TARGET_SECONDS) {
        return {
            improvementPotential: 'NONE',
            reason: 'Already meeting target variance',
            confidence: 'high'
        };
    }
    
    // Check if dynamic algorithm is available
    if (typeof analyzeAndOptimizeCoachIntent === 'undefined') {
        return {
            improvementPotential: 'UNKNOWN',
            reason: 'Dynamic algorithm not available',
            confidence: 'low'
        };
    }
    
    const remainingTime = (gs().periodLengthSeconds * gs().gameSettings.numPeriods) - gs().currentGameSeconds;
    
    if (remainingTime < 300) { // Less than 5 minutes
        return {
            improvementPotential: 'HIGH',
            reason: 'Limited time remaining - dynamic optimization critical',
            confidence: 'high',
            recommendAction: 'IMMEDIATE_RECALCULATION'
        };
    }
    
    if (projected > VARIANCE_CRITICAL_SECONDS) {
        return {
            improvementPotential: 'HIGH',
            reason: 'Critical variance level detected',
            confidence: 'high',
            recommendAction: 'RECALCULATION'
        };
    }
    
    if (projected > VARIANCE_WARNING_SECONDS) {
        return {
            improvementPotential: 'MEDIUM',
            reason: 'Warning variance level - improvement possible',
            confidence: 'medium',
            recommendAction: 'CONSIDER_RECALCULATION'
        };
    }
    
    return {
        improvementPotential: 'LOW',
        reason: 'Variance within acceptable range',
        confidence: 'medium'
    };
}

/**
 * ENHANCED: Get smart recommendations for coaches
 */
function getSmartCoachRecommendations() {
    const current = calculateCurrentVariance();
    const improvement = evaluateDynamicImprovementPotential();
    const strategy = shouldAdjustStrategy();
    
    const recommendations = [];
    
    // Dynamic recalculation recommendations
    if (improvement.recommendAction === 'IMMEDIATE_RECALCULATION') {
        recommendations.push({
            type: 'CRITICAL',
            icon: '🚨',
            title: 'Critical Balance Issue',
            message: 'Immediate recalculation recommended to achieve balance',
            action: 'triggerRecalculation',
            priority: 1
        });
    } else if (improvement.recommendAction === 'RECALCULATION') {
        recommendations.push({
            type: 'WARNING',
            icon: '⚠️',
            title: 'Balance Optimization Available',
            message: 'Dynamic recalculation could improve playing time balance',
            action: 'suggestRecalculation',
            priority: 2
        });
    }
    
    // Substitution strategy recommendations
    if (strategy.needsAdjustment && strategy.action !== 'trigger_recalculation') {
        recommendations.push({
            type: 'INFO',
            icon: '💡',
            title: 'Substitution Adjustment',
            message: `Consider ${strategy.suggestedSubsPerChange} substitutions for better balance`,
            action: 'adjustSubstitutions',
            priority: 3,
            data: { suggestedSubs: strategy.suggestedSubsPerChange }
        });
    }
    
    // Player-specific recommendations
    const needingTime = getPlayersNeedingTime();
    const excessTime = getPlayersWithExcessTime();
    
    if (needingTime.length > 0 && excessTime.length > 0) {
        recommendations.push({
            type: 'INFO',
            icon: '🔄',
            title: 'Player Balance Opportunity',
            message: `Consider subbing ${excessTime[0]} for ${needingTime[0]}`,
            action: 'suggestPlayerSwap',
            priority: 4,
            data: { playerOff: excessTime[0], playerOn: needingTime[0] }
        });
    }
    
    // Sort by priority and return top 3
    return recommendations
        .sort((a, b) => a.priority - b.priority)
        .slice(0, 3);
}

// --- END OF variance-tracker.js ---
