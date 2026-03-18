/**
 * Feature Flags Configuration
 * 
 * Control runtime behavior without redeploying
 * Each flag can be toggled via environment variables or dynamically
 * 
 * Usage:
 *   if (features.isEnabled('ENABLE_NOTIFICATIONS')) {
 *     // Feature code here
 *   }
 */

class FeatureFlags {
  constructor() {
    /**
     * Define all feature flags here
     * Structure: flagName: {
     *   enabled: boolean,           // Default turnover state
     *   rolloutPercent: 0-100,      // % of users to enable for (0 = disabled, 100 = all)
     *   description: string,        // What this flag controls
     *   linkedIssue: string         // e.g. "GH-123", "JIRA-456"
     * }
     */
    this.flags = {
      ENABLE_NOTIFICATIONS: {
        enabled: process.env.FEATURE_NOTIFICATIONS === '1',
        rolloutPercent: 100,
        description: 'Enable user notifications and notification inbox',
        linkedIssue: 'Phase-2'
      },
      ENABLE_RECOMMENDATIONS: {
        enabled: process.env.FEATURE_RECOMMENDATIONS === '1',
        rolloutPercent: 100,
        description: 'Enable AI recommendations engine',
        linkedIssue: 'Phase-2'
      },
      ENABLE_SOCIAL_FEATURES: {
        enabled: process.env.FEATURE_SOCIAL === '1',
        rolloutPercent: 50,
        description: 'Enable community features and friend lists',
        linkedIssue: 'Backlog'
      },
      ENABLE_NEWS_JOB: {
        enabled: process.env.FEATURE_NEWS_JOB === '1',
        rolloutPercent: 100,
        description: 'Enable background job for anime news ingestion',
        linkedIssue: 'Phase-2'
      },
      ENABLE_LIFECYCLE_JOB: {
        enabled: process.env.FEATURE_LIFECYCLE_JOB === '1',
        rolloutPercent: 100,
        description: 'Enable background job for anime status lifecycle scanning',
        linkedIssue: 'Phase-2'
      },
      ENABLE_RECOMMENDATIONS_JOB: {
        enabled: process.env.FEATURE_RECOMMENDATIONS_JOB === '1',
        rolloutPercent: 50,
        description: 'Enable background job for recommendation generation',
        linkedIssue: 'Backlog'
      },
      USE_REDIS_CACHE: {
        enabled: process.env.FEATURE_REDIS_CACHE === '1',
        rolloutPercent: 100,
        description: 'Use Redis for distributed caching (Phase-4)',
        linkedIssue: 'Phase-4'
      },
      ENABLE_ADVANCED_FILTERING: {
        enabled: process.env.FEATURE_ADVANCED_FILTERS === '1',
        rolloutPercent: 100,
        description: 'Enable advanced anime search filters',
        linkedIssue: 'Phase-3'
      },
      ENABLE_PAGINATION: {
        enabled: process.env.FEATURE_PAGINATION === '1',
        rolloutPercent: 100,
        description: 'Use new pagination system for lists',
        linkedIssue: 'Phase-2'
      }
    };
  }

  /**
   * Check if a feature is enabled for a user
   * @param {string} flagName - Name of the feature flag
   * @param {string} userId - User ID for consistent bucketing
   * @returns {boolean} Whether feature is enabled for this user
   */
  isEnabled(flagName, userId = 'anonymous') {
    const flag = this.flags[flagName];
    if (!flag) {
      console.warn(`Unknown feature flag: ${flagName}`);
      return false;
    }

    if (!flag.enabled) return false;

    // Global rollout - apply percentage rollout
    if (flag.rolloutPercent < 100) {
      // Consistent hashing: same user always gets same result
      const hash = this.hashUserId(userId);
      return (hash % 100) < flag.rolloutPercent;
    }

    return true;
  }

  /**
   * Hash user ID to consistent bucket (0-99)
   * @param {string} userId - User ID to hash
   * @returns {number} Hash bucket 0-99
   */
  hashUserId(userId) {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) % 100;
  }

  /**
   * Get all flags and their current state
   * @returns {Object} Flag configurations
   */
  getAll() {
    return this.flags;
  }

  /**
   * Get feature flag status for admin panel
   * @returns {Array} Array of flags with status
   */
  getStatus() {
    return Object.entries(this.flags).map(([name, config]) => ({
      name,
      enabled: config.enabled,
      rollout: config.rolloutPercent,
      description: config.description,
      linkedIssue: config.linkedIssue
    }));
  }

  /**
   * Check multiple flags at once
   * @param {string[]} flagNames - Array of flag names
   * @param {string} userId - User ID for rollout checks
   * @returns {Object} Object with flag names as keys and boolean values
   */
  isEnabledAll(flagNames, userId = 'anonymous') {
    return flagNames.reduce((acc, flagName) => {
      acc[flagName] = this.isEnabled(flagName, userId);
      return acc;
    }, {});
  }
}

// Singleton instance
const features = new FeatureFlags();

module.exports = features;
