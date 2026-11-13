'use strict';

const groups = [
  {name: 'Projects', prefix: 'p', label: 'Project', weights: Array(9).fill(3), max: 100},
  {name: 'Quizzes', prefix: 'q', label: 'Quiz', weights: Array(5).fill(4), max: 30},
  {name: 'Midterms', prefix: 'e', label: 'Midterm', weights: [10, 11, 12], max: 100},
  {name: 'Final', prefix: 'f', label: 'Final exam', weights: [20], max: 100}
];
const items = groups.flatMap(group => group.weights.map((weight, index) => ({
  id: group.prefix + (index + 1),
  label: group.label + (group.prefix === 'f' ? '' : ' ' + (index + 1)),
  group: group.name,
  weight,
  max: group.max
})));
const storageKey = 'cmsc131-grade-tracker-v1';
const defaults = {
  scores: Object.fromEntries(items.map(item => [item.id, {
    value: null, status: 'estimate'
  }])),
  target: 80,
  passing: 70,
  future: 80,
  preset: '80'
};

function summarize(state) {
  let actualPoints = 0, actualWeight = 0, estimatePoints = 0, estimateWeight = 0, blanks = 0;
  let finalOtherPoints = 0, completed = 0;
  for (const item of items) {
    const {value, status} = state.scores[item.id];
    const points = value === null ? null : value / item.max * item.weight;
    if (points === null) {
      blanks++;
    } else if (status === 'confirmed') {
      actualPoints += points;
      actualWeight += item.weight;
      completed++;
    } else {
      estimatePoints += points;
      estimateWeight += item.weight;
    }
    if (item.id !== 'f1') finalOtherPoints += points ?? state.future * item.weight / 100;
  }
  const fixed = actualPoints + estimatePoints;
  const blankWeight = 100 - actualWeight - estimateWeight;
  return {
    actualPoints, actualWeight, estimateWeight, blankWeight, completed, blanks,
    current: actualWeight ? actualPoints / actualWeight * 100 : null,
    projection: fixed + blankWeight * state.future / 100,
    needed: blankWeight ? (state.target - fixed) / blankWeight * 100 : null,
    finalNeeded: (state.target - finalOtherPoints) / 20 * 100
  };
}

const el = id => document.getElementById(id);
function loadState() {
  const state = structuredClone(defaults);
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (!saved) return state;
    for (const item of items) {
      const score = saved.scores?.[item.id];
      if (score && (score.value === null || isScore(score.value, item.max))) {
        state.scores[item.id] = {value: score.value, status: score.status === 'confirmed' ? 'confirmed' : 'estimate'};
      }
    }
    for (const field of ['target', 'passing', 'future']) {
      if (isScore(saved[field], 100)) state[field] = saved[field];
    }
    state.preset = ['70', '80', '90', 'pass'].includes(saved.preset) ? saved.preset : null;
  } catch {
    el('save').textContent = 'Browser storage unavailable';
  }
  return state;
}
function isScore(value, max) {
  return Number.isFinite(value) && value >= 0 && value <= max;
}
function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
    el('save').textContent = 'Saved on this browser';
  } catch {
    el('save').textContent = 'Browser storage unavailable';
  }
}
const state = loadState();
let filter = 'All';
const pct = (value, digits = 2) => value === null ? '—' : value.toFixed(digits) + '%';
const atLeast = value => pct(Math.ceil((value - 1e-9) * 100) / 100);

function renderSummary() {
  const math = summarize(state);
  el('current').textContent = pct(math.current);
  el('current-note').textContent = math.actualWeight ? math.actualPoints.toFixed(2) + ' weighted points earned · confirmed only' : 'Enter a confirmed score';
  el('graded').textContent = pct(math.actualWeight, 0);
  el('graded-note').textContent = math.completed + ' of ' + items.length + ' scores confirmed';
  el('progress').setAttribute('aria-valuenow', math.actualWeight);
  el('progress').firstElementChild.style.width = math.actualWeight + '%';
  el('projection').textContent = pct(math.projection);
  el('projection-note').textContent = math.blankWeight ? 'Uses estimates and ' + state.future + '% for blank scores' : math.estimateWeight ? 'Uses confirmed scores and estimates' : 'All scores confirmed';
  el('need-label').textContent = math.blankWeight ? 'NEEDED ON BLANK SCORES' : 'TARGET STATUS';
  if (!math.blankWeight) {
    el('needed').textContent = math.projection + 1e-9 >= state.target ? 'On target' : 'Below target';
    el('need-note').textContent = 'All scores entered. Adjust an estimate to test another outcome.';
  } else if (math.needed > 100 + 1e-9) {
    el('needed').textContent = 'Out of reach';
    el('need-note').textContent = 'Needs a ' + atLeast(math.needed) + ' weighted average with these scores.';
  } else {
    el('needed').textContent = atLeast(Math.max(0, math.needed));
    el('need-note').textContent = 'Weighted average across ' + math.blanks + ' blank scores (' + math.blankWeight + '% of course). Entered estimates are held fixed.';
  }
  const final = state.scores.f1;
  if (final.value !== null && final.status === 'confirmed') {
    el('final-needed').textContent = 'Final exam confirmed at ' + pct(final.value) + '.';
  } else {
    const needed = math.finalNeeded > 100 + 1e-9 ? 'Above 100%' : atLeast(Math.max(0, math.finalNeeded));
    el('final-needed').innerHTML = '<strong>Final exam needed: ' + needed + '</strong> at these other scores.';
  }
  document.querySelectorAll('[data-target]').forEach(button => button.setAttribute('aria-pressed', button.dataset.target === state.preset));
  document.querySelectorAll('[data-future]').forEach(button => button.setAttribute('aria-pressed', Number(button.dataset.future) === state.future));
}
function renderRemaining() {
  const remaining = items.filter(item => {
    const score = state.scores[item.id];
    return score.value === null || score.status !== 'confirmed';
  });
  el('remaining-note').textContent = remaining.length ? remaining.length + ' scores awaiting confirmation. Select an item to update it.' : 'All scores confirmed.';
  el('remaining-list').innerHTML = groups.map(group => {
    const unfinished = remaining.filter(item => item.group === group.name);
    return '<div class="remain-row"><strong>' + group.name + '</strong><div class="remain-items">' +
      (unfinished.length ? unfinished.map(item => {
        const score = state.scores[item.id];
        const estimated = score.value !== null;
        return '<button type="button" data-item="' + item.id + '" class="' + (estimated ? 'estimated' : '') +
          '" aria-label="Update ' + item.label + (estimated ? ' estimate' : '') + '">' +
          item.label + (estimated ? ' · ' + score.value + '/' + item.max : '') + '</button>';
      }).join('') : '<span>Complete</span>') + '</div></div>';
  }).join('');
}
function renderGradebook() {
  el('filters').innerHTML = ['All', ...groups.map(group => group.name)].map(name =>
    '<button type="button" data-filter="' + name + '" aria-pressed="' + (filter === name) + '">' + name + '</button>'
  ).join('');
  el('grade-rows').innerHTML = groups.filter(group => filter === 'All' || filter === group.name).map(group =>
    '<div class="group-label"><span>' + group.name.toUpperCase() + '</span><b>' + group.weights.reduce((a, b) => a + b, 0) +
    '% of course</b></div>' + items.filter(item => item.group === group.name).map(item => {
      const score = state.scores[item.id];
      const status = score.value === null ? 'blank' : score.status;
      return '<div class="grade-row"><label class="item-label" for="score-' + item.id + '">' + item.label +
        '<span class="weight">' + item.weight + '% of course</span></label><span class="score"><input id="score-' + item.id +
        '" data-score="' + item.id + '" type="number" min="0" max="' + item.max +
        '" step="any" inputmode="decimal" placeholder="—" value="' + (score.value ?? '') + '"><span>/ ' + item.max +
        '</span></span><select class="state" id="state-' + item.id + '" data-status="' + item.id + '" data-state="' + status +
        '" aria-label="' + item.label + ' status"' + (score.value === null ? ' disabled' : '') + '>' +
        '<option value="blank" disabled' + (status === 'blank' ? ' selected' : '') + '>Unentered</option>' +
        '<option value="confirmed"' + (status === 'confirmed' ? ' selected' : '') + '>Confirmed</option>' +
        '<option value="estimate"' + (status === 'estimate' ? ' selected' : '') + '>Estimate</option></select></div>';
    }).join('')
  ).join('');
}
function commit() {
  save();
  renderSummary();
  renderRemaining();
}
el('grade-rows').addEventListener('input', event => {
  const input = event.target;
  const id = input.dataset.score;
  if (!id) return;
  const score = state.scores[id];
  const max = items.find(item => item.id === id).max;
  if (input.validity.badInput || (input.value !== '' && !isScore(input.valueAsNumber, max))) return;
  score.value = input.value === '' ? null : input.valueAsNumber;
  const status = el('state-' + id);
  status.disabled = score.value === null;
  status.dataset.state = status.value = score.value === null ? 'blank' : score.status;
  commit();
});
el('grade-rows').addEventListener('focusout', event => {
  const input = event.target;
  if (input.dataset.score && !input.validity.valid) input.value = state.scores[input.dataset.score].value ?? '';
});
el('grade-rows').addEventListener('change', event => {
  const id = event.target.dataset.status;
  if (!id) return;
  state.scores[id].status = event.target.value;
  event.target.dataset.state = event.target.value;
  commit();
});
el('filters').addEventListener('click', event => {
  const name = event.target.dataset.filter;
  if (!name) return;
  filter = name;
  renderGradebook();
  el('filters').querySelector('[aria-pressed=true]').focus();
});
el('remaining-list').addEventListener('click', event => {
  const id = event.target.dataset.item;
  if (!id) return;
  if (!el('score-' + id)) {
    filter = items.find(item => item.id === id).group;
    renderGradebook();
  }
  el('score-' + id).focus();
});
for (const field of ['target', 'passing', 'future']) {
  const input = el(field);
  input.value = state[field];
  input.addEventListener('input', () => {
    if (!isScore(input.valueAsNumber, 100)) return;
    state[field] = input.valueAsNumber;
    if (field === 'target') state.preset = null;
    if (field === 'passing' && state.preset === 'pass') el('target').value = state.target = state.passing;
    commit();
  });
  input.addEventListener('blur', () => {
    if (!isScore(input.valueAsNumber, 100)) input.value = state[field];
  });
}
el('planner').addEventListener('click', event => {
  const {target, future} = event.target.dataset;
  if (target) {
    state.preset = target;
    el('target').value = state.target = target === 'pass' ? state.passing : Number(target);
  } else if (future) {
    el('future').value = state.future = Number(future);
  } else return;
  commit();
});
renderGradebook();
renderSummary();
renderRemaining();
