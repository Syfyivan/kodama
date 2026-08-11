const PERFORMANCE_MODES = Object.freeze({
  balanced: Object.freeze({
    id: 'balanced',
    larkWebPush: false,
    larkPollIntervalMs: 3 * 60 * 1000,
    decorativeMotion: true,
  }),
  realtime: Object.freeze({
    id: 'realtime',
    larkWebPush: true,
    larkPollIntervalMs: 3 * 60 * 1000,
    decorativeMotion: true,
  }),
  saver: Object.freeze({
    id: 'saver',
    larkWebPush: false,
    larkPollIntervalMs: 10 * 60 * 1000,
    decorativeMotion: false,
  }),
})

function normalizePerformanceMode(value) {
  return Object.prototype.hasOwnProperty.call(PERFORMANCE_MODES, value) ? value : 'balanced'
}

function performanceProfile(value) {
  return PERFORMANCE_MODES[normalizePerformanceMode(value)]
}

module.exports = {
  PERFORMANCE_MODES,
  normalizePerformanceMode,
  performanceProfile,
}
