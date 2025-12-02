/**
 * BenchBalancer - Event Bus System
 * Version 1.0
 *
 * @fileoverview Provides a centralized event system for decoupled communication
 * between game components. Replaces callback spaghetti with clean pub/sub.
 */

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Standard event types used throughout the application.
 * Use these constants instead of string literals for type safety.
 * @readonly
 * @enum {string}
 */
const GameEvents = {
    // Game lifecycle
    GAME_INITIALIZED: 'game:initialized',
    GAME_STARTED: 'game:started',
    GAME_PAUSED: 'game:paused',
    GAME_RESUMED: 'game:resumed',
    GAME_ENDED: 'game:ended',
    GAME_RESET: 'game:reset',

    // Timer events
    TIMER_TICK: 'timer:tick',
    TIMER_WARNING: 'timer:warning',
    TIMER_EARLY_WARNING: 'timer:earlyWarning',
    PERIOD_END: 'period:end',
    HALFTIME_START: 'halftime:start',
    HALFTIME_END: 'halftime:end',

    // Rotation events
    ROTATION_SCHEDULED: 'rotation:scheduled',
    ROTATION_PENDING: 'rotation:pending',
    ROTATION_CONFIRMED: 'rotation:confirmed',
    ROTATION_CANCELLED: 'rotation:cancelled',
    ROTATION_SKIPPED: 'rotation:skipped',

    // Player events
    PLAYER_ON_COURT: 'player:onCourt',
    PLAYER_ON_BENCH: 'player:onBench',
    PLAYER_REMOVED: 'player:removed',
    PLAYER_RETURNED: 'player:returned',
    PLAYER_FOULED_OUT: 'player:fouledOut',

    // Scoring events
    SCORE_UPDATED: 'score:updated',
    PLAYER_SCORED: 'player:scored',

    // Plan events
    PLAN_GENERATED: 'plan:generated',
    PLAN_UPDATED: 'plan:updated',
    RECOVERY_PLAN_APPLIED: 'plan:recovery',

    // State events
    STATE_CHANGED: 'state:changed',
    STATE_VALIDATED: 'state:validated',
    STATE_ERROR: 'state:error',

    // Audio events
    AUDIO_PLAY: 'audio:play',
    AUDIO_STOP: 'audio:stop',

    // UI events
    UI_UPDATE: 'ui:update',
    MODAL_OPEN: 'modal:open',
    MODAL_CLOSE: 'modal:close',

    // Auth events
    USER_SIGNED_IN: 'auth:signedIn',
    USER_SIGNED_OUT: 'auth:signedOut',

    // Stats events
    STATS_SAVED: 'stats:saved',
    STATS_LOADED: 'stats:loaded',

    // Error events
    ERROR: 'error',
    WARNING: 'warning',
};

// ============================================================================
// EVENT BUS CLASS
// ============================================================================

/**
 * Event bus for pub/sub communication between components.
 * Supports typed events, one-time listeners, and namespaced events.
 */
class GameEventBus {
    constructor() {
        /**
         * Map of event names to listener arrays
         * @type {Map<string, Array<{callback: Function, once: boolean, context: any}>>}
         */
        this.listeners = new Map();

        /**
         * History of recent events for debugging
         * @type {Array<{event: string, data: any, timestamp: number}>}
         */
        this.history = [];

        /**
         * Maximum history size
         * @type {number}
         */
        this.maxHistory = 50;

        /**
         * Whether to log events to console
         * @type {boolean}
         */
        this.debug = false;
    }

    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     * @param {Object} [options={}] - Options
     * @param {boolean} [options.once=false] - Only fire once
     * @param {any} [options.context] - Context for callback
     * @returns {Function} Unsubscribe function
     */
    on(event, callback, options = {}) {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }

        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }

        const listener = {
            callback,
            once: options.once || false,
            context: options.context,
        };

        this.listeners.get(event).push(listener);

        // Return unsubscribe function
        return () => this.off(event, callback);
    }

    /**
     * Subscribe to an event (fires only once)
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     * @param {Object} [options={}] - Options
     * @returns {Function} Unsubscribe function
     */
    once(event, callback, options = {}) {
        return this.on(event, callback, { ...options, once: true });
    }

    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {Function} [callback] - Specific callback to remove (removes all if omitted)
     */
    off(event, callback) {
        if (!this.listeners.has(event)) {
            return;
        }

        if (callback) {
            const listeners = this.listeners.get(event);
            this.listeners.set(
                event,
                listeners.filter(l => l.callback !== callback)
            );
        } else {
            this.listeners.delete(event);
        }
    }

    /**
     * Emit an event
     * @param {string} event - Event name
     * @param {any} [data] - Event data
     * @returns {boolean} Whether any listeners were called
     */
    emit(event, data) {
        // Log to history
        this.addToHistory(event, data);

        // Debug logging
        if (this.debug) {
            console.log(`[EventBus] ${event}`, data);
        }

        if (!this.listeners.has(event)) {
            return false;
        }

        const listeners = this.listeners.get(event);
        const toRemove = [];

        listeners.forEach((listener, index) => {
            try {
                if (listener.context) {
                    listener.callback.call(listener.context, data, event);
                } else {
                    listener.callback(data, event);
                }

                if (listener.once) {
                    toRemove.push(index);
                }
            } catch (error) {
                console.error(`[EventBus] Error in listener for ${event}:`, error);
            }
        });

        // Remove one-time listeners (in reverse order to maintain indices)
        toRemove.reverse().forEach(index => {
            listeners.splice(index, 1);
        });

        return true;
    }

    /**
     * Emit event and wait for async handlers
     * @param {string} event - Event name
     * @param {any} [data] - Event data
     * @returns {Promise<void>}
     */
    async emitAsync(event, data) {
        this.addToHistory(event, data);

        if (!this.listeners.has(event)) {
            return;
        }

        const listeners = this.listeners.get(event);
        const toRemove = [];

        const promises = listeners.map(async (listener, index) => {
            try {
                if (listener.context) {
                    await listener.callback.call(listener.context, data, event);
                } else {
                    await listener.callback(data, event);
                }

                if (listener.once) {
                    toRemove.push(index);
                }
            } catch (error) {
                console.error(`[EventBus] Error in async listener for ${event}:`, error);
            }
        });

        await Promise.all(promises);

        // Remove one-time listeners
        toRemove.reverse().forEach(index => {
            listeners.splice(index, 1);
        });
    }

    /**
     * Add event to history
     * @param {string} event
     * @param {any} data
     */
    addToHistory(event, data) {
        this.history.push({
            event,
            data,
            timestamp: Date.now(),
        });

        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
    }

    /**
     * Get listener count for an event
     * @param {string} event - Event name
     * @returns {number}
     */
    listenerCount(event) {
        if (!this.listeners.has(event)) {
            return 0;
        }
        return this.listeners.get(event).length;
    }

    /**
     * Get all registered event names
     * @returns {string[]}
     */
    eventNames() {
        return Array.from(this.listeners.keys());
    }

    /**
     * Check if event has listeners
     * @param {string} event
     * @returns {boolean}
     */
    hasListeners(event) {
        return this.listenerCount(event) > 0;
    }

    /**
     * Remove all listeners
     * @param {string} [event] - Specific event (all events if omitted)
     */
    removeAllListeners(event) {
        if (event) {
            this.listeners.delete(event);
        } else {
            this.listeners.clear();
        }
    }

    /**
     * Get event history
     * @param {string} [eventFilter] - Filter by event name
     * @param {number} [limit=20] - Max events to return
     * @returns {Array}
     */
    getHistory(eventFilter, limit = 20) {
        let history = [...this.history];

        if (eventFilter) {
            history = history.filter(h => h.event === eventFilter);
        }

        return history.slice(-limit);
    }

    /**
     * Clear event history
     */
    clearHistory() {
        this.history = [];
    }

    /**
     * Create a namespaced event bus
     * Events are prefixed with the namespace
     * @param {string} namespace
     * @returns {Object} Namespaced event interface
     */
    namespace(namespace) {
        const bus = this;
        return {
            on: (event, callback, options) => bus.on(`${namespace}:${event}`, callback, options),
            once: (event, callback, options) => bus.once(`${namespace}:${event}`, callback, options),
            off: (event, callback) => bus.off(`${namespace}:${event}`, callback),
            emit: (event, data) => bus.emit(`${namespace}:${event}`, data),
        };
    }

    /**
     * Pipe events from one bus to another
     * @param {GameEventBus} targetBus
     * @param {string[]} [events] - Specific events to pipe (all if omitted)
     * @returns {Function} Stop piping function
     */
    pipe(targetBus, events) {
        const handler = (data, event) => targetBus.emit(event, data);

        if (events) {
            events.forEach(event => this.on(event, handler));
            return () => events.forEach(event => this.off(event, handler));
        } else {
            // Pipe all events - this requires intercepting emit
            const originalEmit = this.emit.bind(this);
            this.emit = (event, data) => {
                originalEmit(event, data);
                targetBus.emit(event, data);
            };
            return () => {
                this.emit = originalEmit;
            };
        }
    }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/** @type {GameEventBus} */
const eventBus = new GameEventBus();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a debounced event emitter
 * @param {GameEventBus} bus - Event bus
 * @param {string} event - Event name
 * @param {number} delay - Debounce delay in ms
 * @returns {Function} Debounced emit function
 */
function createDebouncedEmitter(bus, event, delay) {
    let timeoutId = null;
    return (data) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            bus.emit(event, data);
            timeoutId = null;
        }, delay);
    };
}

/**
 * Create a throttled event emitter
 * @param {GameEventBus} bus - Event bus
 * @param {string} event - Event name
 * @param {number} limit - Minimum time between emits in ms
 * @returns {Function} Throttled emit function
 */
function createThrottledEmitter(bus, event, limit) {
    let lastEmit = 0;
    return (data) => {
        const now = Date.now();
        if (now - lastEmit >= limit) {
            lastEmit = now;
            bus.emit(event, data);
        }
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

// Export for ES6 modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        GameEventBus,
        GameEvents,
        eventBus,
        createDebouncedEmitter,
        createThrottledEmitter,
    };
}

// Export for browser
if (typeof window !== 'undefined') {
    window.GameEventBus = GameEventBus;
    window.GameEvents = GameEvents;
    window.eventBus = eventBus;
    window.createDebouncedEmitter = createDebouncedEmitter;
    window.createThrottledEmitter = createThrottledEmitter;
    console.log('📡 Event Bus system loaded');
}
