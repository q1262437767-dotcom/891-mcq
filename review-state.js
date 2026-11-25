(function (global) {
  'use strict';

  function dayKey(time, daysAhead) {
    const date = new Date(time);
    date.setDate(date.getDate() + daysAhead);
    return String(date.getFullYear()).padStart(4, '0') + '-' +
      String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0');
  }

  function validDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T12:00:00');
    return Number.isFinite(date.getTime()) && dayKey(date.getTime(), 0) === value;
  }

  function clean(value) {
    if (!value || !Number.isInteger(value.stage) || value.stage < 0 || value.stage > 3 ||
        !Number.isSafeInteger(value.turn) || value.turn < 0 ||
        !Number.isSafeInteger(value.at) || value.at < 0) return null;
    if (value.stage === 3 ? value.due !== null : !validDay(value.due)) return null;
    return {stage: value.stage, turn: value.turn, due: value.due, at: value.at};
  }

  // Read legacy wrong answers lazily. Removing a wrong answer used to mean that
  // it was resolved; a historical first miss alone must not recreate it.
  function entry(state, id, now = Date.now()) {
    const rec = state.rec[id];
    if (!rec) return null;
    const saved = clean(rec.review);
    if (saved) return saved;
    const wrong = state.wrong[id];
    if (!wrong) return null;
    const timestamps = [wrong.last, wrong.added, rec.t].map(Number)
      .filter(time => Number.isSafeInteger(time) && time > 0 && Number.isFinite(new Date(time).getTime()));
    const last = timestamps.length ? Math.max(...timestamps) : 0;
    return {stage: 0, turn: 0, due: last ? dayKey(last, 2) : dayKey(now, 0), at: last};
  }

  function schedule(state, id, now = Date.now()) {
    const current = entry(state, id, now);
    if (current) state.rec[id].review = current;
    return current;
  }

  function dueIds(state, now = Date.now()) {
    const today = dayKey(now, 0);
    return Object.keys(state.rec).map(id => ({id: Number(id), review: entry(state, id, now)}))
      .filter(row => row.review && row.review.due && row.review.due <= today)
      .sort((a, b) => a.review.due.localeCompare(b.review.due) || a.id - b.id)
      .map(row => row.id);
  }

  function nextDue(state, now = Date.now()) {
    const today = dayKey(now, 0);
    let next = null;
    for (const id of Object.keys(state.rec)) {
      const review = entry(state, id, now);
      if (review && review.due > today && (!next || review.due < next)) next = review.due;
    }
    return next;
  }

  function close(state, id, now = Date.now()) {
    const current = entry(state, id, now);
    if (!current || !current.due) return current;
    const closed = {stage: 3, turn: current.turn, due: null, at: Math.max(now, current.at + 1)};
    state.rec[id].review = closed;
    return closed;
  }

  function grade(state, id, result, now = Date.now()) {
    const current = entry(state, id, now);
    if (!current || !current.due || current.due > dayKey(now, 0)) return null;
    let stage = current.stage;
    let due;
    switch (result) {
      case 'again':
        stage = 0;
        due = dayKey(now, 1);
        break;
      case 'partial':
        due = dayKey(now, 2);
        break;
      case 'good':
        stage += 1;
        due = stage === 3 ? null : dayKey(now, stage === 1 ? 4 : 8);
        break;
      default:
        return null;
    }
    const updated = {stage, turn: current.turn + 1, due, at: Math.max(now, current.at + 1)};
    state.rec[id].review = updated;
    return updated;
  }

  // A graduated record is retained so an older copy cannot re-enrol it during sync.
  // If two devices grade in exactly the same millisecond, prefer more attempts,
  // then the less advanced stage and earlier due date. The tie-break is symmetric.
  function merge(left, right) {
    const a = clean(left);
    const b = clean(right);
    if (!a || !b) return a || b;
    if (a.at !== b.at) return a.at > b.at ? a : b;
    if (a.turn !== b.turn) return a.turn > b.turn ? a : b;
    if (a.stage !== b.stage) return a.stage < b.stage ? a : b;
    return (a.due || '') <= (b.due || '') ? a : b;
  }

  global.ReviewState = {entry, schedule, dueIds, nextDue, grade, close, merge};
})(typeof window === 'undefined' ? globalThis : window);
