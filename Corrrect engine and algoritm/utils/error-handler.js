/**
 * BenchBalancer - Centralized Error Handler
 * Version 1.0
 *
 * @fileoverview Provides standardized error handling, logging, and recovery
 * mechanisms for the BenchBalancer application.
 */

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Error severity levels
 * @readonly
 * @enum {string}
 */
const ErrorSeverity = {
    /** Informational - not an error, just logging */
    INFO: 'info',
    /** Warning - something unexpected but recoverable */
    WARNING: 'warning',
    /** Error - something failed but app can continue */
    ERROR: 'error',
    /** Critical - app may need to stop or reset */
    CRITICAL: 'critical',
};

/**
 * Error categories for grouping and filtering
 * @readonly
 * @enum {string}
 */
const ErrorCategory = {
    /** Validation errors (invalid input, state) */
    VALIDATION: 'validation',
    /** State management errors */
    STATE: 'state',
    /** Timer/timing errors */
    TIMER: 'timer',
    /** Rotation/substitution errors */
    ROTATION: 'rotation',
    /** Audio/media errors */
    AUDIO: 'audio',
    /** Network/API errors */
    NETWORK: 'network',
    /** Storage/database errors */
    STORAGE: 'storage',
    /** Unknown/general errors */
    UNKNOWN: 'unknown',
};

// ============================================================================
// ERROR CLASS
// ============================================================================

/**
 * Custom error class with additional metadata
 */
class GameError extends Error {
    /**
     * Create a GameError
     * @param {string} message - Error message
     * @param {Object} [options={}] - Additional options
     * @param {ErrorSeverity} [options.severity=ErrorSeverity.ERROR] - Error severity
     * @param {ErrorCategory} [options.category=ErrorCategory.UNKNOWN] - Error category
     * @param {string} [options.context] - Context where error occurred
     * @param {Object} [options.data] - Additional data
     * @param {boolean} [options.recoverable=true] - Whether error is recoverable
     */
    constructor(message, options = {}) {
        super(message);
        this.name = 'GameError';
        this.severity = options.severity || ErrorSeverity.ERROR;
        this.category = options.category || ErrorCategory.UNKNOWN;
        this.context = options.context || '';
        this.data = options.data || {};
        this.recoverable = options.recoverable !== false;
        this.timestamp = new Date().toISOString();
    }

    /**
     * Get formatted error string
     * @returns {string}
     */
    toString() {
        return `[${this.severity.toUpperCase()}] [${this.category}] ${this.context ? `(${this.context}) ` : ''}${this.message}`;
    }

    /**
     * Get error as plain object
     * @returns {Object}
     */
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            severity: this.severity,
            category: this.category,
            context: this.context,
            data: this.data,
            recoverable: this.recoverable,
            timestamp: this.timestamp,
            stack: this.stack,
        };
    }
}

// ============================================================================
// ERROR HANDLER CLASS
// ============================================================================

/**
 * Centralized error handler for the application
 */
class GameErrorHandler {
    constructor() {
        /** @type {GameError[]} */
        this.errorLog = [];

        /** @type {number} Maximum errors to keep in log */
        this.maxLogSize = 100;

        /** @type {Function[]} Error listeners */
        this.listeners = [];

        /** @type {boolean} Whether to log to console */
        this.consoleLogging = true;

        /** @type {Object} Error counts by category */
        this.errorCounts = {};
        Object.values(ErrorCategory).forEach(cat => {
            this.errorCounts[cat] = 0;
        });
    }

    /**
     * Handle an error
     * @param {Error|GameError|string} error - Error to handle
     * @param {Object} [options={}] - Additional options
     * @returns {GameError} The processed error
     */
    handle(error, options = {}) {
        // Convert to GameError if needed
        let gameError;
        if (error instanceof GameError) {
            gameError = error;
        } else if (error instanceof Error) {
            gameError = new GameError(error.message, {
                ...options,
                data: { ...options.data, originalError: error.name, stack: error.stack },
            });
        } else {
            gameError = new GameError(String(error), options);
        }

        // Update counts
        this.errorCounts[gameError.category] = (this.errorCounts[gameError.category] || 0) + 1;

        // Add to log
        this.errorLog.push(gameError);
        if (this.errorLog.length > this.maxLogSize) {
            this.errorLog.shift();
        }

        // Console logging
        if (this.consoleLogging) {
            this.logToConsole(gameError);
        }

        // Notify listeners
        this.notifyListeners(gameError);

        return gameError;
    }

    /**
     * Log error to console with appropriate method
     * @param {GameError} error
     */
    logToConsole(error) {
        const prefix = `[BenchBalancer] ${error.context ? `[${error.context}] ` : ''}`;
        const message = `${prefix}${error.message}`;

        switch (error.severity) {
            case ErrorSeverity.INFO:
                console.info(message, error.data);
                break;
            case ErrorSeverity.WARNING:
                console.warn(`⚠️ ${message}`, error.data);
                break;
            case ErrorSeverity.ERROR:
                console.error(`❌ ${message}`, error.data);
                break;
            case ErrorSeverity.CRITICAL:
                console.error(`🚨 CRITICAL: ${message}`, error.data);
                break;
        }
    }

    /**
     * Add error listener
     * @param {Function} callback - Function to call on error
     * @returns {Function} Unsubscribe function
     */
    addListener(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    /**
     * Notify all listeners of an error
     * @param {GameError} error
     */
    notifyListeners(error) {
        this.listeners.forEach(listener => {
            try {
                listener(error);
            } catch (e) {
                console.error('Error in error listener:', e);
            }
        });
    }

    /**
     * Create a validation error
     * @param {string} message
     * @param {string} [context]
     * @param {Object} [data]
     * @returns {GameError}
     */
    validation(message, context, data) {
        return this.handle(new GameError(message, {
            severity: ErrorSeverity.WARNING,
            category: ErrorCategory.VALIDATION,
            context,
            data,
        }));
    }

    /**
     * Create a state error
     * @param {string} message
     * @param {string} [context]
     * @param {Object} [data]
     * @returns {GameError}
     */
    state(message, context, data) {
        return this.handle(new GameError(message, {
            severity: ErrorSeverity.ERROR,
            category: ErrorCategory.STATE,
            context,
            data,
        }));
    }

    /**
     * Create a rotation error
     * @param {string} message
     * @param {string} [context]
     * @param {Object} [data]
     * @returns {GameError}
     */
    rotation(message, context, data) {
        return this.handle(new GameError(message, {
            severity: ErrorSeverity.WARNING,
            category: ErrorCategory.ROTATION,
            context,
            data,
        }));
    }

    /**
     * Log info (not really an error)
     * @param {string} message
     * @param {string} [context]
     * @param {Object} [data]
     */
    info(message, context, data) {
        return this.handle(new GameError(message, {
            severity: ErrorSeverity.INFO,
            category: ErrorCategory.UNKNOWN,
            context,
            data,
        }));
    }

    /**
     * Log warning
     * @param {string} message
     * @param {string} [context]
     * @param {Object} [data]
     */
    warn(message, context, data) {
        return this.handle(new GameError(message, {
            severity: ErrorSeverity.WARNING,
            category: ErrorCategory.UNKNOWN,
            context,
            data,
        }));
    }

    /**
     * Get error statistics
     * @returns {Object}
     */
    getStats() {
        return {
            total: this.errorLog.length,
            bySeverity: {
                info: this.errorLog.filter(e => e.severity === ErrorSeverity.INFO).length,
                warning: this.errorLog.filter(e => e.severity === ErrorSeverity.WARNING).length,
                error: this.errorLog.filter(e => e.severity === ErrorSeverity.ERROR).length,
                critical: this.errorLog.filter(e => e.severity === ErrorSeverity.CRITICAL).length,
            },
            byCategory: { ...this.errorCounts },
            recentErrors: this.errorLog.slice(-5),
        };
    }

    /**
     * Get errors filtered by criteria
     * @param {Object} [filter={}]
     * @param {ErrorSeverity} [filter.severity]
     * @param {ErrorCategory} [filter.category]
     * @param {number} [filter.limit=50]
     * @returns {GameError[]}
     */
    getErrors(filter = {}) {
        let errors = [...this.errorLog];

        if (filter.severity) {
            errors = errors.filter(e => e.severity === filter.severity);
        }

        if (filter.category) {
            errors = errors.filter(e => e.category === filter.category);
        }

        if (filter.limit) {
            errors = errors.slice(-filter.limit);
        }

        return errors;
    }

    /**
     * Clear error log
     */
    clear() {
        this.errorLog = [];
        Object.values(ErrorCategory).forEach(cat => {
            this.errorCounts[cat] = 0;
        });
    }

    /**
     * Try to execute a function with error handling
     * @template T
     * @param {Function} fn - Function to execute
     * @param {Object} [options={}] - Options
     * @param {string} [options.context] - Context for errors
     * @param {T} [options.fallback] - Fallback value on error
     * @returns {T|undefined}
     */
    try(fn, options = {}) {
        try {
            return fn();
        } catch (error) {
            this.handle(error, {
                context: options.context,
                category: ErrorCategory.UNKNOWN,
            });
            return options.fallback;
        }
    }

    /**
     * Try to execute an async function with error handling
     * @template T
     * @param {Function} fn - Async function to execute
     * @param {Object} [options={}] - Options
     * @param {string} [options.context] - Context for errors
     * @param {T} [options.fallback] - Fallback value on error
     * @returns {Promise<T|undefined>}
     */
    async tryAsync(fn, options = {}) {
        try {
            return await fn();
        } catch (error) {
            this.handle(error, {
                context: options.context,
                category: ErrorCategory.UNKNOWN,
            });
            return options.fallback;
        }
    }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/** @type {GameErrorHandler} */
const errorHandler = new GameErrorHandler();

// ============================================================================
// EXPORTS
// ============================================================================

// Export for ES6 modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        GameError,
        GameErrorHandler,
        ErrorSeverity,
        ErrorCategory,
        errorHandler,
    };
}

// Export for browser
if (typeof window !== 'undefined') {
    window.GameError = GameError;
    window.GameErrorHandler = GameErrorHandler;
    window.ErrorSeverity = ErrorSeverity;
    window.ErrorCategory = ErrorCategory;
    window.errorHandler = errorHandler;
    console.log('🛡️ Error Handler utility loaded');
}
