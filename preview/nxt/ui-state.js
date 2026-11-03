export const UI_SCREENS = Object.freeze(['top10', 'queue', 'unassigned']);
export const UI_SESSIONS = Object.freeze(['PRE', 'AFTER']);

export function sessionForNavigationKey(currentSession, key) {
  if (key === 'Home') return 'PRE';
  if (key === 'End') return 'AFTER';
  if (key === 'ArrowLeft' || key === 'ArrowRight') return currentSession === 'PRE' ? 'AFTER' : 'PRE';
  return null;
}

export function createNxtUiState(initial = {}) {
  return {
    screen: UI_SCREENS.includes(initial.screen) ? initial.screen : 'top10',
    session: UI_SESSIONS.includes(initial.session) ? initial.session : 'PRE',
    selectedSymbol: typeof initial.selectedSymbol === 'string' ? initial.selectedSymbol : null,
    selectedReviewId: typeof initial.selectedReviewId === 'string' ? initial.selectedReviewId : null,
    filters: initial.filters && typeof initial.filters === 'object' && !Array.isArray(initial.filters) ? structuredClone(initial.filters) : {},
    offset: Number.isInteger(initial.offset) && initial.offset > 0 ? initial.offset : 0,
    exportError: false
  };
}

/** Shared state transitions used by the preview's delegated DOM event handlers and Node tests. */
export function transitionNxtUiState(current, action, {filteredCount = 0, pageSize = 20} = {}) {
  const state = createNxtUiState(current);
  if (!action || typeof action !== 'object') return state;
  switch (action.type) {
    case 'select-session':
      if (UI_SESSIONS.includes(action.session)) {
        state.session = action.session;
        state.selectedSymbol = null;
      }
      break;
    case 'select-screen':
      if (UI_SCREENS.includes(action.screen)) {
        state.screen = action.screen;
        state.selectedSymbol = null;
        state.selectedReviewId = null;
        state.offset = 0;
        state.exportError = false;
      }
      break;
    case 'select-symbol':
      if (typeof action.ticker === 'string' && /^\d{6}$/.test(action.ticker)) {
        state.screen = 'top10';
        state.selectedSymbol = action.ticker;
      }
      break;
    case 'select-review':
      if (typeof action.reviewId === 'string' && action.reviewId) {
        state.selectedReviewId = action.reviewId;
        if (state.screen === 'top10') state.screen = 'queue';
      }
      break;
    case 'back-to-top10':
      state.selectedSymbol = null;
      state.selectedReviewId = null;
      break;
    case 'set-filter':
      if (typeof action.key === 'string' && action.key) {
        if (typeof action.value === 'string' && action.value) state.filters[action.key] = action.value;
        else delete state.filters[action.key];
        state.offset = 0;
        state.selectedReviewId = null;
      }
      break;
    case 'clear-filters':
      state.filters = {};
      state.offset = 0;
      state.selectedReviewId = null;
      break;
    case 'move-page': {
      const pageSizeSafe = Number.isInteger(pageSize) ? Math.max(1, Math.min(pageSize, 100)) : 20;
      const count = Number.isInteger(filteredCount) ? Math.max(0, filteredCount) : 0;
      const lastOffset = count ? Math.floor((count - 1) / pageSizeSafe) * pageSizeSafe : 0;
      state.offset = action.direction === 'next'
        ? Math.min(state.offset + pageSizeSafe, lastOffset)
        : action.direction === 'previous' ? Math.max(0, state.offset - pageSizeSafe) : state.offset;
      state.selectedReviewId = null;
      break;
    }
    case 'export-error':
      state.exportError = true;
      break;
    case 'export-ok':
      state.exportError = false;
      break;
    default:
      break;
  }
  return state;
}
