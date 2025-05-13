// utils/handlebarsHelpers.js

/**
 * Custom Handlebars helper functions
 * This file contains helper functions for use in Handlebars templates
 */

module.exports = {
  /**
   * Equality comparison helper
   * Usage: {{#if (eq var1 var2)}} ... {{/if}}
   * 
   * @param {*} val1 - First value to compare
   * @param {*} val2 - Second value to compare
   * @returns {boolean} - True if values are equal
   */
  eq: function(val1, val2) {
    return val1 === val2;
  },
  
  /**
   * Not equal comparison helper
   * Usage: {{#if (ne var1 var2)}} ... {{/if}}
   * 
   * @param {*} val1 - First value to compare
   * @param {*} val2 - Second value to compare
   * @returns {boolean} - True if values are not equal
   */
  ne: function(val1, val2) {
    return val1 !== val2;
  },
  
  /**
   * Greater than comparison helper
   * Usage: {{#if (gt var1 var2)}} ... {{/if}}
   * 
   * @param {*} val1 - First value to compare
   * @param {*} val2 - Second value to compare
   * @returns {boolean} - True if val1 > val2
   */
  gt: function(val1, val2) {
    return val1 > val2;
  },
  
  /**
   * Less than comparison helper
   * Usage: {{#if (lt var1 var2)}} ... {{/if}}
   * 
   * @param {*} val1 - First value to compare
   * @param {*} val2 - Second value to compare
   * @returns {boolean} - True if val1 < val2
   */
  lt: function(val1, val2) {
    return val1 < val2;
  },
  
  /**
   * Greater than or equal comparison helper
   * Usage: {{#if (gte var1 var2)}} ... {{/if}}
   * 
   * @param {*} val1 - First value to compare
   * @param {*} val2 - Second value to compare
   * @returns {boolean} - True if val1 >= val2
   */
  gte: function(val1, val2) {
    return val1 >= val2;
  },
  
  /**
   * Less than or equal comparison helper
   * Usage: {{#if (lte var1 var2)}} ... {{/if}}
   * 
   * @param {*} val1 - First value to compare
   * @param {*} val2 - Second value to compare
   * @returns {boolean} - True if val1 <= val2
   */
  lte: function(val1, val2) {
    return val1 <= val2;
  },
  
  /**
   * Format date helper
   * Usage: {{formatDate date "YYYY-MM-DD HH:mm:ss"}}
   * 
   * @param {Date} date - Date to format
   * @param {string} format - Format string (moment.js format)
   * @returns {string} - Formatted date string
   */
  formatDate: function(date, format) {
    if (!date) return '';
    return require('moment')(date).format(format);
  },
  
  /**
   * Format number as duration (milliseconds to human readable)
   * Usage: {{formatDuration milliseconds}}
   * 
   * @param {number} ms - Duration in milliseconds
   * @returns {string} - Human readable duration
   */
  formatDuration: function(ms) {
    if (!ms || isNaN(ms)) return '-';
    
    const moment = require('moment');
    const duration = moment.duration(ms);
    
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${duration.seconds()}.${Math.floor(duration.milliseconds() / 100)}s`;
    } else if (ms < 3600000) {
      return `${duration.minutes()}m ${duration.seconds()}s`;
    } else if (ms < 86400000) {
      return `${duration.hours()}h ${duration.minutes()}m`;
    } else {
      return `${Math.floor(duration.asDays())}d ${duration.hours()}h`;
    }
  }
};