// --- balance-display-component.js (Modern Web Component) ---

// Create safe fallback functions if they don't exist
if (typeof shouldAdjustStrategy === 'undefined') {
    window.shouldAdjustStrategy = function() {
        return {
            needsAdjustment: false,
            action: 'continue',
            reason: 'No adjustment needed',
            suggestedSubsPerChange: 1
        };
    };
}

if (typeof recordVarianceHistory === 'undefined') {
    window.recordVarianceHistory = function() {
        console.log('recordVarianceHistory called');
    };
}

// Also ensure these are available globally
window.shouldAdjustStrategy = window.shouldAdjustStrategy || function() {
    return {
        needsAdjustment: false,
        action: 'continue',
        reason: 'No adjustment needed',
        suggestedSubsPerChange: 1
    };
};

window.recordVarianceHistory = window.recordVarianceHistory || function() {
    console.log('recordVarianceHistory called');
};

class BalanceDisplay extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.updateInterval = null;
        this.chartCanvas = null;
        this.historyData = [];
    }

    connectedCallback() {
        this.render();
        this.startUpdating();
    }

    disconnectedCallback() {
        this.stopUpdating();
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 12px;
                    padding: 20px;
                    color: white;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                    position: relative;
                    overflow: hidden;
                }

                .balance-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 15px;
                }

                .balance-title {
                    font-size: 1.2rem;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .status-indicator {
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    animation: pulse 2s infinite;
                    box-shadow: 0 0 10px currentColor;
                }

                .status-indicator.excellent { background: #2ecc71; }
                .status-indicator.attention { background: #3498db; }
                .status-indicator.warning { background: #f39c12; }
                .status-indicator.critical { background: #e74c3c; }

                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.7; transform: scale(1.1); }
                }

                .variance-display {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 15px;
                    margin-bottom: 15px;
                }

                .variance-metric {
                    background: rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(10px);
                    border-radius: 8px;
                    padding: 12px;
                    text-align: center;
                }

                .metric-label {
                    font-size: 0.75rem;
                    opacity: 0.9;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }

                .metric-value {
                    font-size: 1.8rem;
                    font-weight: bold;
                    margin: 5px 0;
                }

                .metric-detail {
                    font-size: 0.65rem;
                    opacity: 0.8;
                }

                .trend-indicator {
                    display: inline-block;
                    margin-left: 5px;
                }

                .players-balance {
                    background: rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(10px);
                    border-radius: 8px;
                    padding: 12px;
                    margin-top: 15px;
                }

                .balance-chart {
                    height: 60px;
                    position: relative;
                    margin: 10px 0;
                }

                .balance-bar {
                    position: absolute;
                    bottom: 0;
                    width: 4px;
                    background: linear-gradient(to top, #3498db, #2ecc71);
                    border-radius: 2px;
                    transition: height 0.3s ease;
                }

                .recommendation {
                    background: rgba(255, 255, 255, 0.2);
                    border-radius: 8px;
                    padding: 10px;
                    margin-top: 10px;
                    font-size: 0.85rem;
                    display: none;
                    animation: slideIn 0.3s ease;
                }

                .recommendation.show {
                    display: block;
                }

                @keyframes slideIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .override-controls {
                    display: flex;
                    gap: 10px;
                    margin-top: 10px;
                }

                .override-btn {
                    flex: 1;
                    padding: 8px;
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 0.8rem;
                    transition: all 0.3s ease;
                }

                .override-btn:hover {
                    background: rgba(255, 255, 255, 0.2);
                    transform: translateY(-2px);
                }

                .override-btn.accept {
                    background: rgba(46, 204, 113, 0.3);
                    border-color: #2ecc71;
                }

                .override-btn.reject {
                    background: rgba(231, 76, 60, 0.3);
                    border-color: #e74c3c;
                }

                .history-toggle {
                    position: absolute;
                    top: 20px;
                    right: 20px;
                    background: rgba(255, 255, 255, 0.2);
                    border: none;
                    color: white;
                    padding: 5px 10px;
                    border-radius: 20px;
                    cursor: pointer;
                    font-size: 0.75rem;
                    transition: all 0.3s ease;
                }

                .history-toggle:hover {
                    background: rgba(255, 255, 255, 0.3);
                }

                .history-panel {
                    position: absolute;
                    top: 60px;
                    right: 20px;
                    background: rgba(0, 0, 0, 0.8);
                    border-radius: 8px;
                    padding: 15px;
                    width: 250px;
                    max-height: 300px;
                    overflow-y: auto;
                    display: none;
                    z-index: 10;
                }

                .history-panel.show {
                    display: block;
                    animation: fadeIn 0.3s ease;
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                .history-entry {
                    display: flex;
                    justify-content: space-between;
                    padding: 5px 0;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    font-size: 0.75rem;
                }

                .history-entry:last-child {
                    border-bottom: none;
                }

                @media (max-width: 600px) {
                    :host {
                        padding: 15px;
                    }

                    .variance-display {
                        grid-template-columns: 1fr;
                    }

                    .metric-value {
                        font-size: 1.5rem;
                    }
                }
            </style>

            <div class="balance-header">
                <div class="balance-title">
                    Balance Tracker
                    <span class="status-indicator"></span>
                </div>
                <button class="history-toggle">History</button>
            </div>

            <div class="variance-display">
                <div class="variance-metric">
                    <div class="metric-label">Current Variance</div>
                    <div class="metric-value" id="currentVariance">--:--</div>
                    <div class="metric-detail" id="varianceDetail"></div>
                </div>
                <div class="variance-metric">
                    <div class="metric-label">Projected Final</div>
                    <div class="metric-value" id="projectedVariance">--:--</div>
                    <div class="metric-detail" id="projectionDetail"></div>
                </div>
            </div>

            <div class="players-balance">
                <div class="metric-label">Player Distribution</div>
                <div class="balance-chart" id="balanceChart"></div>
            </div>

            <div class="recommendation" id="recommendation">
                <div id="recommendationText"></div>
                <div class="override-controls" id="overrideControls"></div>
            </div>

            <div class="history-panel" id="historyPanel">
                <div class="metric-label">Variance History</div>
                <div id="historyContent"></div>
            </div>
        `;

        this.setupEventListeners();
    }

    setupEventListeners() {
        const historyToggle = this.shadowRoot.querySelector('.history-toggle');
        const historyPanel = this.shadowRoot.querySelector('#historyPanel');

        historyToggle?.addEventListener('click', () => {
            historyPanel?.classList.toggle('show');
            this.updateHistory();
        });

        // Close history panel when clicking outside
        this.shadowRoot.addEventListener('click', (e) => {
            if (!e.target.closest('.history-toggle') && !e.target.closest('#historyPanel')) {
                historyPanel?.classList.remove('show');
            }
        });
    }

    startUpdating() {
        this.updateDisplay();
        this.updateInterval = setInterval(() => this.updateDisplay(), 2000);
    }

    stopUpdating() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    updateDisplay() {
        if (typeof calculateCurrentVariance === 'undefined') return;

        const variance = calculateCurrentVariance();
        const projected = projectFinalVariance();
        const strategy = shouldAdjustStrategy();

        // Update status indicator
        const indicator = this.shadowRoot.querySelector('.status-indicator');
        if (indicator) {
            indicator.className = `status-indicator ${variance.status}`;
        }

        // Update current variance
        const currentEl = this.shadowRoot.querySelector('#currentVariance');
        if (currentEl) {
            currentEl.textContent = formatTime(variance.variance);
            currentEl.style.color = this.getVarianceColor(variance.variance);
        }

        // Update variance detail
        const detailEl = this.shadowRoot.querySelector('#varianceDetail');
        if (detailEl && variance.minPlayer && variance.maxPlayer) {
            detailEl.textContent = `${variance.minPlayer} ↔ ${variance.maxPlayer}`;
        }

        // Update projected variance
        const projectedEl = this.shadowRoot.querySelector('#projectedVariance');
        if (projectedEl) {
            projectedEl.textContent = formatTime(projected);
            projectedEl.style.color = this.getVarianceColor(projected);
        }

        // Update projection detail
        const projDetailEl = this.shadowRoot.querySelector('#projectionDetail');
        if (projDetailEl) {
            const trend = getVarianceTrend();
            const trendIcon = trend === 'improving' ? '↓' : trend === 'worsening' ? '↑' : '→';
            projDetailEl.innerHTML = `Trend: <span class="trend-indicator">${trendIcon}</span>`;
        }

        // Update player distribution chart
        this.updateBalanceChart(variance);

        // Update recommendation if needed
        this.updateRecommendation(strategy);

        // Record for history
        recordVarianceHistory();
    }

    updateBalanceChart(variance) {
        const chartContainer = this.shadowRoot.querySelector('#balanceChart');
        if (!chartContainer || !variance.playerData) return;

        const maxTime = Math.max(...variance.playerData.map(p => p.playTime));
        const chartHTML = variance.playerData
            .sort((a, b) => a.playTime - b.playTime)
            .map((player, index) => {
                const height = maxTime > 0 ? (player.playTime / maxTime) * 100 : 0;
                const left = (index / variance.playerData.length) * 100;
                const color = player.isOnField ? '#2ecc71' : '#3498db';
                
                return `<div class="balance-bar" 
                    style="height: ${height}%; left: ${left}%; background: ${color};"
                    title="${player.name}: ${formatTime(player.playTime)}">
                </div>`;
            }).join('');

        chartContainer.innerHTML = chartHTML;
    }

    updateRecommendation(strategy) {
        const recommendationEl = this.shadowRoot.querySelector('#recommendation');
        const textEl = this.shadowRoot.querySelector('#recommendationText');
        const controlsEl = this.shadowRoot.querySelector('#overrideControls');

        if (!recommendationEl || !textEl) return;

        if (strategy.needsAdjustment && strategy.action !== 'continue') {
            recommendationEl.classList.add('show');
            
            let message = `<strong>Balancer Override:</strong> ${strategy.reason}`;
            if (strategy.suggestedSubsPerChange !== gameSettings.subsPerChange) {
                message += `<br>Recommending ${strategy.suggestedSubsPerChange} subs (currently ${gameSettings.subsPerChange})`;
            }
            
            textEl.innerHTML = message;

            // Show override controls if applicable
            if (controlsEl && strategy.suggestedSubsPerChange !== gameSettings.subsPerChange) {
                controlsEl.innerHTML = `
                    <button class="override-btn accept" data-action="accept">
                        Accept (${strategy.suggestedSubsPerChange} subs)
                    </button>
                    <button class="override-btn reject" data-action="reject">
                        Keep Original (${gameSettings.subsPerChange} subs)
                    </button>
                `;

                // Add event listeners
                controlsEl.querySelectorAll('.override-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const action = e.target.dataset.action;
                        this.handleOverrideDecision(action, strategy);
                    });
                });
            }
        } else {
            recommendationEl.classList.remove('show');
        }
    }

    handleOverrideDecision(action, strategy) {
        const event = new CustomEvent('balanceOverride', {
            detail: {
                accepted: action === 'accept',
                original: gameSettings.subsPerChange,
                recommended: strategy.suggestedSubsPerChange,
                reason: strategy.reason
            }
        });
        
        this.dispatchEvent(event);
        
        // Hide controls after decision
        const recommendationEl = this.shadowRoot.querySelector('#recommendation');
        recommendationEl?.classList.remove('show');
    }

    updateHistory() {
        const historyContent = this.shadowRoot.querySelector('#historyContent');
        if (!historyContent) return;

        const history = getVarianceHistoryForDisplay(15);
        
        if (history.length === 0) {
            historyContent.innerHTML = '<div style="opacity: 0.7;">No history yet</div>';
            return;
        }

        const historyHTML = history.map(entry => `
            <div class="history-entry">
                <span>${entry.time}</span>
                <span>${entry.statusIcon}</span>
                <span>${entry.variance}</span>
                <span style="opacity: 0.7;">→${entry.projected}</span>
            </div>
        `).join('');

        historyContent.innerHTML = historyHTML;
    }

    getVarianceColor(variance) {
        if (variance <= VARIANCE_TARGET_SECONDS) return '#2ecc71';
        if (variance <= VARIANCE_WARNING_SECONDS) return '#f39c12';
        return '#e74c3c';
    }
}

// Register the custom element
customElements.define('balance-display', BalanceDisplay);
