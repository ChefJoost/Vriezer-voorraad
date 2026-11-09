import { firebaseConfig } from './config.js';
import { createStore, newId } from './store.js';
import { usageStats, predictRunOut, suggestBuy, pickCounts, monthStats, recipeScore, DAY } from './insights.js';
import { parseIngredients, ingredientToText, checkIngredient, findMatches, toShopping, cookAmount } from './recipes.js';

/* ---------------- Constanten ---------------- */
const SPACES = [
  { id: 'vriezer',  label: 'Vriezer',      short: 'Vriezer',  icon: '❄️', in: 'in de vriezer',      out: 'uit de vriezer',      loc: 'bijv. Lade 1' },
  { id: 'kast',     label: 'Voorraadkast', short: 'Kast',     icon: '🥫', in: 'in de voorraadkast', out: 'uit de voorraadkast', loc: 'bijv. Bovenste plank' },
  { id: 'koelkast', label: 'Koelkast',     short: 'Koelkast', icon: '🥛', in: 'in de koelkast',     out: 'uit de koelkast',     loc: 'bijv. Deur' },
];
const SPACE = Object.fromEntries(SPACES.map((s) => [s.id, s]));

// `months` = standaard bewaartijd in de vriezer, globaal gebaseerd op
// richtlijnen van o.a. het Voedingscentrum. Aanpasbaar in Instellingen.
const CATEGORIES = [
  { id: 'vlees',      label: 'Vlees',              icon: '🥩', months: 6 },
  { id: 'gehakt',     label: 'Gehakt & worst',     icon: '🍖', months: 3 },
  { id: 'gevogelte',  label: 'Kip & gevogelte',    icon: '🍗', months: 6 },
  { id: 'vis',        label: 'Vis',                icon: '🐟', months: 3 },
  { id: 'groente',    label: 'Groente',            icon: '🥦', months: 9 },
  { id: 'fruit',      label: 'Fruit',              icon: '🍓', months: 9 },
  { id: 'brood',      label: 'Brood & gebak',      icon: '🍞', months: 3 },
  { id: 'maaltijd',   label: 'Maaltijd/restje',    icon: '🍲', months: 3 },
  { id: 'soep',       label: 'Soep & saus',        icon: '🥣', months: 4 },
  { id: 'zuivel',     label: 'Zuivel & kaas',      icon: '🧀', months: 3 },
  { id: 'ijs',        label: 'IJs & dessert',      icon: '🍨', months: 4 },
  { id: 'droog',      label: 'Pasta, rijst & granen', icon: '🍝', months: 6 },
  { id: 'conserven',  label: 'Blik & pot',         icon: '🥫', months: 6 },
  { id: 'ontbijt',    label: 'Ontbijt & beleg',    icon: '🍯', months: 6 },
  { id: 'bakken',     label: 'Bakken & kruiden',   icon: '🧂', months: 6 },
  { id: 'snacks',     label: 'Snacks & snoep',     icon: '🍪', months: 6 },
  { id: 'dranken',    label: 'Dranken',            icon: '🧃', months: 6 },
  { id: 'huishouden', label: 'Huishouden & verzorging', icon: '🧻', months: 6 },
  { id: 'overig',     label: 'Overig',             icon: '📦', months: 6 },
];
const FREEZER_CATS = ['vlees', 'gehakt', 'gevogelte', 'vis', 'groente', 'fruit', 'brood', 'maaltijd', 'soep', 'zuivel', 'ijs', 'overig'];
const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
const UNITS = ['stuks', 'porties', 'zakjes', 'bakjes', 'pakken', 'potten', 'blikken', 'flessen', 'gram', 'kg', 'liter'];
const SINGULAR = { stuks: 'stuk', porties: 'portie', zakjes: 'zakje', bakjes: 'bakje', pakken: 'pak', potten: 'pot', blikken: 'blik', flessen: 'fles' };
const WEIGHT_UNITS = ['gram', 'kg', 'liter'];
const DEFAULT_STORES = ['Albert Heijn', 'Jumbo', 'Lidl', 'Aldi', 'Plus', 'Dirk'];
const WARN_DAYS = 14;
const SNOOZE_DAYS = 7;

/* ---------------- Helpers ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const round = (n) => Math.round(n * 1000) / 1000;

const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s) => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => toISO(new Date());
const addMonths = (iso, m) => {
  const d = parseISO(iso); const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + m);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return toISO(d);
};
const daysUntil = (iso) => Math.round((parseISO(iso) - parseISO(today())) / 86400000);
const fmtDate = (iso, withYear) => {
  if (!iso) return '';
  const d = parseISO(iso);
  const y = withYear ?? d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', ...(y ? { year: 'numeric' } : {}) });
};
const fmtNum = (q) => Number(q).toLocaleString('nl-NL', { maximumFractionDigits: 2 });
const fmtUnit = (q, u) => (Number(q) === 1 ? SINGULAR[u] || u : u);
const fmtQty = (q, u) => `${fmtNum(q)} ${fmtUnit(q, u)}`;
const stepFor = (unit) => (unit === 'gram' ? 100 : unit === 'kg' || unit === 'liter' ? 0.5 : 1);
const durationFor = (cat) => ls.get('vv:durations', {})[cat] ?? CAT[cat]?.months ?? 6;
const spaceOf = (i) => (SPACE[i.space] ? i.space : 'vriezer'); // oude items zonder locatie = vriezer
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

function expiryState(item) {
  if (!item.bestBefore || item.qty <= 0) return { cls: '', label: '', days: Infinity };
  const days = daysUntil(item.bestBefore);
  if (days < 0) return { cls: 'bad', label: days === -1 ? 'gisteren over datum' : `${-days} dgn over datum`, days };
  if (days === 0) return { cls: 'bad', label: 'THT vandaag', days };
  if (days <= WARN_DAYS) return { cls: 'warn', label: `nog ${days} dg${days === 1 ? '' : 'n'}`, days };
  return { cls: '', label: `tot ${fmtDate(item.bestBefore)}`, days };
}

// Hoeveel moet er gekocht worden? (min-voorraad of handmatig op de lijst)
function needOf(i) {
  const want = Number(i.want) || 0;
  const short = (Number(i.min) || 0) - (Number(i.qty) || 0);
  const snoozed = i.snoozedUntil && i.snoozedUntil > Date.now() && !want;
  return Math.max(want, snoozed ? 0 : round(short), 0);
}
const inStockView = (i) => i.qty > 0 || Number(i.min) > 0;

// Verbruiksvoorspelling (gecachet per item zolang voorraad en geschiedenis gelijk blijven)
const statsCache = new Map();
function statsFor(i) {
  const k = `${i.id}|${i.qty}|${i.unit}|${state.log.length}|${state.log[0]?.at || 0}`;
  if (!statsCache.has(k)) statsCache.set(k, usageStats(state.log, i));
  return statsCache.get(k);
}
const runOutIn = (i) => (needOf(i) > 0 ? null : predictRunOut(i, statsFor(i)));
const daysLeftOf = (i) => (i.bestBefore && i.qty > 0 ? daysUntil(i.bestBefore) : null);

let toastTimer;
function toast(msg, actions = []) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>`;
  [].concat(actions).filter(Boolean).forEach((a) => {
    const b = document.createElement('button');
    b.textContent = a.label;
    b.onclick = () => { el.classList.remove('show'); a.run(); };
    el.append(b);
  });
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), actions.length ? 6000 : 2500);
}
const undoAction = (fn) => ({ label: 'Ongedaan', run: fn });

/* ---------------- Huishouden (gedeelde code) ---------------- */
function resolveHousehold() {
  const m = location.hash.match(/h=([a-z0-9]{16,})/i);
  if (m) {
    ls.set('vv:household', m[1].toLowerCase());
    history.replaceState(null, '', location.pathname + location.search);
    setTimeout(() => toast('Gekoppeld aan gedeelde voorraad ✔️'), 300);
  }
  let hid = ls.get('vv:household');
  if (!hid) { hid = newId(20); ls.set('vv:household', hid); }
  return hid;
}

/* ---------------- State ---------------- */
const state = {
  items: [],
  log: [],
  space: ls.get('vv:space', 'all'),
  filter: 'all',
  search: '',
  sort: ls.get('vv:sort', 'tht'),
  storeFilter: 'all',
  editingId: null,
  takingId: null,
  quickId: null,
  recipes: [],
  recipeId: null,
  editingRecipeId: null,
  recipeSearch: '',
};
let store;
const me = () => ls.get('vv:name', '') || 'Iemand';
const byId = (id) => state.items.find((i) => i.id === id);

/* ---------------- Mutaties ---------------- */
// Logregel toevoegen; snelle herhaalde tikken op hetzelfde product worden samengevoegd.
async function logChange(entry) {
  entry = { by: me(), at: Date.now(), ...entry };
  const last = state.log[0];
  if (last && last.itemId === entry.itemId && last.type === entry.type && (last.reason || '') === (entry.reason || '')
      && last.by === entry.by && entry.at - last.at < 2 * 60 * 1000 && last.unit === entry.unit) {
    const prev = last.qty;
    await store.updateLog(last.id, { qty: round(prev + entry.qty), at: entry.at });
    return () => store.updateLog(last.id, { qty: prev });
  }
  const id = await store.addLog(entry);
  return () => store.deleteLog(id);
}
const logBase = (i) => ({ itemId: i.id, name: i.name, unit: i.unit, category: i.category, space: spaceOf(i), barcode: i.barcode || '' });

async function changeQty(item, delta, { reason = 'used', toList = false } = {}) {
  const { id, ...before } = item;
  const next = round(Math.max(0, item.qty + delta));
  const restore = () => store.setItem(id, before);
  let undoLog;
  if (delta > 0) {
    const patch = { qty: next, updatedBy: me(), updatedAt: Date.now() };
    if (item.qty <= 0) Object.assign(patch, freshDates(item), { want: 0, wantFor: '' });
    await store.updateItem(id, patch);
    undoLog = await logChange({ ...logBase(item), type: 'in', qty: round(next - item.qty) });
    toast(`${item.name}: nu ${fmtQty(next, item.unit)}`, [undoAction(() => { restore(); undoLog(); })]);
    return;
  }
  const taken = round(item.qty - next);
  if (taken <= 0) return;
  if (next > 0 || Number(item.min) > 0) {
    await store.updateItem(id, { qty: next, updatedBy: me(), updatedAt: Date.now() });
  } else if (toList) {
    await store.updateItem(id, { qty: 0, want: WEIGHT_UNITS.includes(item.unit) ? item.qty : 1, updatedBy: me(), updatedAt: Date.now() });
  } else {
    await store.deleteItem(id);
  }
  undoLog = await logChange({ ...logBase(item), type: 'out', reason, qty: taken });
  const undo = undoAction(() => { restore(); undoLog(); });
  if (next > 0) return toast(`${item.name}: nog ${fmtQty(next, item.unit)}`, [undo]);
  if (Number(item.min) > 0 || toList) return toast(`${item.name} is op · staat op de lijst 🛒`, [undo]);
  toast(`${item.name} is op`, [undo, { label: '🛒 Op lijst', run: () => store.setItem(id, { ...before, qty: 0, want: 1 }) }]);
}

function freshDates(item) {
  const sp = spaceOf(item);
  return { frozenAt: today(), bestBefore: sp === 'vriezer' ? addMonths(today(), durationFor(item.category)) : '' };
}

/* ---------------- Render: voorraad ---------------- */
function itemsInSpace() {
  return state.items.filter((i) => inStockView(i) && (state.space === 'all' || spaceOf(i) === state.space));
}

function renderSpaces() {
  const counts = { all: 0 };
  state.items.filter(inStockView).forEach((i) => { counts.all++; counts[spaceOf(i)] = (counts[spaceOf(i)] || 0) + 1; });
  const tabs = [{ id: 'all', short: 'Alles', icon: '🏠' }, ...SPACES];
  $('#spaces').innerHTML = tabs.map((s) =>
    `<button class="${state.space === s.id ? 'active' : ''}" data-space="${s.id}"><span>${s.icon}</span>${esc(s.short)}<small>${counts[s.id] || 0}</small></button>`
  ).join('');
  const cur = SPACE[state.space];
  if ($('#view-stock').classList.contains('active')) $('#appTitle').textContent = cur ? `${cur.icon} ${cur.label}` : '🏠 Voorraad';
}

function renderChips() {
  const list = itemsInSpace();
  const counts = {};
  list.forEach((i) => { counts[i.category] = (counts[i.category] || 0) + 1; });
  if (state.filter in CAT && !counts[state.filter]) state.filter = 'all';
  const chips = [{ id: 'all', label: 'Alles', icon: '', n: list.length }]
    .concat(CATEGORIES.filter((c) => counts[c.id]).map((c) => ({ ...c, n: counts[c.id] })));
  $('#chips').innerHTML = chips.length > 2 ? chips.map((c) =>
    `<button class="chip ${state.filter === c.id ? 'active' : ''}" data-filter="${c.id}">${c.icon} ${esc(c.label)}<span class="count">${c.n}</span></button>`
  ).join('') : '';
}

function renderSummary() {
  const list = itemsInSpace();
  let soon = 0, over = 0;
  list.forEach((i) => { const e = expiryState(i); if (e.cls === 'bad') over++; else if (e.cls === 'warn') soon++; });
  const low = list.filter((i) => needOf(i) > 0).length;
  const parts = [`<span class="pill">${list.length} product${list.length === 1 ? '' : 'en'}</span>`];
  if (over) parts.push(`<button class="pill bad" data-filter="soon">⚠️ ${over} over datum</button>`);
  if (soon) parts.push(`<button class="pill warn" data-filter="soon">⏰ ${soon} binnen ${WARN_DAYS} dgn</button>`);
  if (low) parts.push(`<button class="pill" data-goto="shop">🛒 ${low} bijna op</button>`);
  if (state.filter === 'soon') parts.push(`<button class="pill" data-filter="all">✕ filter wissen</button>`);
  $('#summary').innerHTML = parts.join('');
}

function filteredItems() {
  const q = state.search.trim().toLowerCase();
  const list = itemsInSpace().filter((i) => {
    if (state.filter === 'soon' && expiryState(i).days > WARN_DAYS) return false;
    if (state.filter in CAT && i.category !== state.filter) return false;
    if (q && !`${i.name} ${i.note || ''} ${i.location || ''} ${i.barcode || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const byName = (a, b) => a.name.localeCompare(b.name, 'nl');
  const byTht = (a, b) => (a.qty > 0 ? 0 : 1) - (b.qty > 0 ? 0 : 1) || (a.bestBefore || '9999').localeCompare(b.bestBefore || '9999') || byName(a, b);
  const placeKey = (i) => `${SPACES.findIndex((s) => s.id === spaceOf(i))}|${i.location || '~'}`;
  const sorters = {
    tht: byTht,
    name: byName,
    recent: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    location: (a, b) => placeKey(a).localeCompare(placeKey(b), 'nl', { numeric: true }) || byName(a, b),
  };
  return list.sort(sorters[state.sort] || byTht);
}

function itemHTML(i) {
  const c = CAT[i.category] || CAT.overig;
  const e = expiryState(i);
  const sp = SPACE[spaceOf(i)];
  const dateLabel = spaceOf(i) === 'vriezer' ? 'in' : 'sinds';
  const meta = [
    state.space === 'all' ? `${sp.icon} ${sp.short}` : '',
    i.location,
    i.qty > 0 && i.frozenAt ? `${dateLabel} ${fmtDate(i.frozenAt)}` : '',
  ].filter(Boolean).map(esc).join(' · ');
  const need = needOf(i);
  const badges = [
    e.label ? `<span class="badge ${e.cls}">${esc(e.label)}</span>` : '',
    i.qty <= 0 ? `<span class="badge bad">op</span>` : '',
    runOutIn(i) !== null ? `<span class="badge warn">🔮 op over ~${runOutIn(i)} dg${runOutIn(i) === 1 ? '' : 'n'}</span>` : '',
    need > 0 ? `<span class="badge info">🛒 op de lijst</span>` : (Number(i.min) > 0 ? `<span class="badge muted">min ${fmtNum(i.min)}</span>` : ''),
  ].join('');
  return `<li class="item ${e.cls} ${i.qty <= 0 ? 'zero' : ''}">
    <div class="item-icon" aria-hidden="true">${c.icon}</div>
    <button class="item-main" data-edit="${i.id}">
      <div class="item-name">${esc(i.name)}</div>
      ${meta ? `<div class="item-meta">${meta}</div>` : ''}
      ${i.note ? `<div class="item-note">${esc(i.note)}</div>` : ''}
      ${badges ? `<div class="badges">${badges}</div>` : ''}
    </button>
    <div class="qty-ctl">
      <button data-dec="${i.id}" aria-label="${esc(i.name)} min één" ${i.qty <= 0 ? 'disabled' : ''}>−</button>
      <div class="qty"><b>${fmtNum(i.qty)}</b><small>${esc(fmtUnit(i.qty, i.unit))}</small></div>
      <button data-inc="${i.id}" aria-label="${esc(i.name)} plus één">+</button>
    </div>
  </li>`;
}

/* Natellen (cycle counting): elke dag max. 3 producten */
let countEditing = null;
function renderCountCard() {
  const el = $('#countCard');
  if (ls.get('vv:countDone', '') === today()) { el.innerHTML = ''; return; }
  const countedToday = state.log.filter((l) => l.type === 'count' && toISO(new Date(l.at)) === today()).length;
  const picks = pickCounts(state.items, state.log, Date.now(), Math.max(0, 3 - countedToday));
  if (!picks.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="card count-card">
    <div class="count-head"><b>🔍 Klopt dit nog?</b><button class="link-btn" data-count-skip>Later</button></div>
    <p class="muted small">Even natellen houdt de voorraad betrouwbaar.</p>
    ${picks.map((i) => `<div class="count-row">
      <span class="count-name">${CAT[i.category]?.icon || '📦'} ${esc(i.name)}<small>${SPACE[spaceOf(i)].icon} ${esc(i.location || SPACE[spaceOf(i)].short)}</small></span>
      ${countEditing === i.id
        ? `<input type="number" inputmode="decimal" min="0" step="any" value="${i.qty}" data-count-input="${i.id}" aria-label="Werkelijk aantal">
           <button class="btn primary small-btn" data-count-save="${i.id}">OK</button>`
        : `<b class="count-qty">${esc(fmtQty(i.qty, i.unit))}</b>
           <button class="btn secondary small-btn" data-count-ok="${i.id}" aria-label="Klopt">✓</button>
           <button class="btn secondary small-btn" data-count-edit="${i.id}" aria-label="Klopt niet">✗</button>`}
    </div>`).join('')}
  </div>`;
}
async function recordCount(item, actual) {
  const match = round(actual) === round(item.qty);
  const patch = { checkedAt: Date.now(), ...(match ? {} : { qty: round(actual), updatedBy: me(), updatedAt: Date.now() }) };
  if (!match && actual <= 0 && !(Number(item.min) > 0)) await store.deleteItem(item.id);
  else await store.updateItem(item.id, patch);
  await store.addLog({ ...logBase(item), type: 'count', match, before: item.qty, qty: round(actual), by: me(), at: Date.now() });
  countEditing = null;
  if (!match) toast(`${item.name} bijgewerkt: ${fmtQty(actual, item.unit)}`);
}
$('#countCard').addEventListener('click', (e) => {
  const t = e.target;
  if (t.closest('[data-count-skip]')) { ls.set('vv:countDone', today()); return renderCountCard(); }
  const ok = t.closest('[data-count-ok]');
  if (ok) { const i = byId(ok.dataset.countOk); return i && recordCount(i, i.qty); }
  const ed = t.closest('[data-count-edit]');
  if (ed) { countEditing = ed.dataset.countEdit; renderCountCard(); $(`[data-count-input="${countEditing}"]`)?.select(); return; }
  const sv = t.closest('[data-count-save]');
  if (sv) { const i = byId(sv.dataset.countSave); const v = Number($(`[data-count-input="${sv.dataset.countSave}"]`).value); if (i && v >= 0) recordCount(i, v); }
});

function renderStock() {
  renderSpaces();
  renderCountCard();
  renderChips();
  renderSummary();
  const list = filteredItems();
  let html = '';
  if (state.sort === 'location') {
    let cur;
    list.forEach((i) => {
      const sp = SPACE[spaceOf(i)];
      const loc = `${state.space === 'all' ? `${sp.icon} ${sp.short} · ` : ''}${i.location || 'Geen plek'}`;
      if (loc !== cur) { cur = loc; html += `<li class="group-title">${esc(loc)}</li>`; }
      html += itemHTML(i);
    });
  } else {
    html = list.map(itemHTML).join('');
  }
  const total = itemsInSpace().length;
  $('#stockList').innerHTML = total && !list.length ? `<li class="empty"><p class="muted">Niets gevonden.</p></li>` : html;
  $('#emptyStock').hidden = total > 0;
  $('#emptyText').textContent = SPACE[state.space] ? `De ${SPACE[state.space].label.toLowerCase()} is (nog) leeg.` : 'Hier ligt (nog) niets.';
  renderDatalists();
}

function renderDatalists() {
  const names = new Map();
  [...state.log].reverse().forEach((l) => names.set(l.name.toLowerCase(), l.name));
  state.items.forEach((i) => names.set(i.name.toLowerCase(), i.name));
  $('#nameList').innerHTML = [...names.values()].sort((a, b) => a.localeCompare(b, 'nl')).map((n) => `<option value="${esc(n)}">`).join('');
  const sp = $('#itemForm').space?.value || 'vriezer';
  const locs = new Set(sp === 'vriezer' ? ['Lade 1', 'Lade 2', 'Lade 3'] : []);
  state.items.forEach((i) => i.location && spaceOf(i) === sp && locs.add(i.location));
  $('#locationList').innerHTML = [...locs].sort((a, b) => a.localeCompare(b, 'nl', { numeric: true })).map((n) => `<option value="${esc(n)}">`).join('');
  $('#storeList').innerHTML = allStores().map((n) => `<option value="${esc(n)}">`).join('');
}
function allStores() {
  const s = new Set(DEFAULT_STORES);
  state.items.forEach((i) => i.store && s.add(i.store));
  return [...s].sort((a, b) => a.localeCompare(b, 'nl'));
}

/* ---------------- Render: boodschappen ---------------- */
function shopItems() {
  return state.items.filter((i) => needOf(i) > 0);
}
function renderShop() {
  const all = shopItems();
  const badge = $('#shopBadge');
  badge.textContent = all.length; badge.hidden = !all.length;

  const stores = [...new Set(all.map((i) => i.store || ''))];
  if (state.storeFilter !== 'all' && !stores.includes(state.storeFilter)) state.storeFilter = 'all';
  $('#storeChips').innerHTML = stores.length > 1 ? [{ id: 'all', label: 'Alle winkels' }, ...stores.sort().map((s) => ({ id: s, label: s || 'Geen winkel' }))]
    .map((s) => `<button class="chip ${state.storeFilter === s.id ? 'active' : ''}" data-store="${esc(s.id)}">${esc(s.label)}</button>`).join('') : '';

  const list = all.filter((i) => state.storeFilter === 'all' || (i.store || '') === state.storeFilter)
    .sort((a, b) => (a.store || '~').localeCompare(b.store || '~', 'nl') || a.name.localeCompare(b.name, 'nl'));
  let html = '', cur;
  list.forEach((i) => {
    const st = i.store || 'Geen winkel';
    if (stores.length > 1 && state.storeFilter === 'all' && st !== cur) { cur = st; html += `<li class="group-title">${esc(st)}</li>`; }
    const need = needOf(i);
    const sp = SPACE[spaceOf(i)];
    const why = Number(i.min) > 0 && !(Number(i.want) > 0) ? `nog ${fmtNum(i.qty)} in huis, min ${fmtNum(i.min)}` : (i.qty > 0 ? `nog ${fmtNum(i.qty)} in huis` : 'op');
    html += `<li class="item shop">
      <button class="check-btn" data-bought="${i.id}" aria-label="${esc(i.name)} gekocht">✓</button>
      <button class="item-main" data-edit="${i.id}">
        <div class="item-name">${esc(i.name)} <span class="muted">· ${esc(fmtQty(need, i.unit))}</span></div>
        <div class="item-meta">${sp.icon} ${esc(sp.short)} · ${esc(i.wantFor ? `voor ${i.wantFor}` : why)}</div>
      </button>
      <button class="icon-btn" data-skip="${i.id}" aria-label="Niet nodig" title="Niet nodig">✕</button>
    </li>`;
  });
  $('#shopList').innerHTML = html;
  $('#emptyShop').hidden = all.length > 0;
  $('#shareList').hidden = !all.length;
  renderForecast();
}

function renderForecast() {
  const soon = state.items.map((i) => ({ i, d: runOutIn(i) })).filter((x) => x.d !== null).sort((a, b) => a.d - b.d);
  $('#forecastBlock').innerHTML = soon.length ? `<h2 class="section-title">🔮 Binnenkort op</h2>
    <p class="muted small">Op basis van jullie verbruik.</p>
    <ul class="list">${soon.map(({ i, d }) => {
      const st = statsFor(i);
      return `<li class="item">
        <div class="item-icon">${CAT[i.category]?.icon || '📦'}</div>
        <div class="item-main">
          <div class="item-name">${esc(i.name)}</div>
          <div class="item-meta">nog ${esc(fmtQty(i.qty, i.unit))} · ± ${esc(fmtNum(round(st.perWeek)))} per week · op over ~${d} dg${d === 1 ? '' : 'n'}</div>
        </div>
        <button class="take-btn" data-forecast="${i.id}">＋ ${esc(fmtQty(suggestBuy(i, st), i.unit))}</button>
      </li>`;
    }).join('')}</ul>` : '';
}
$('#forecastBlock').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-forecast]');
  if (!b) return;
  const i = byId(b.dataset.forecast);
  const amount = suggestBuy(i, statsFor(i));
  await store.updateItem(i.id, { want: amount, wantFor: '', snoozedUntil: 0 });
  toast(`${i.name} op de lijst`, [undoAction(() => store.updateItem(i.id, { want: Number(i.want) || 0 }))]);
});

async function markBought(item) {
  const need = needOf(item);
  const { id, ...before } = item;
  const patch = { qty: round(item.qty + need), want: 0, wantFor: '', snoozedUntil: 0, updatedBy: me(), updatedAt: Date.now() };
  if (item.qty <= 0) Object.assign(patch, freshDates(item));
  await store.updateItem(id, patch);
  const undoLog = await logChange({ ...logBase(item), type: 'in', reason: 'bought', qty: need });
  toast(`${item.name} gekocht → ${SPACE[spaceOf(item)].in}`, [undoAction(() => { store.setItem(id, before); undoLog(); })]);
}

async function skipItem(item) {
  const { id, ...before } = item;
  const belowMin = Number(item.min) > 0 && item.qty < Number(item.min);
  if (item.qty <= 0 && !(Number(item.min) > 0)) await store.deleteItem(id);
  else await store.updateItem(id, { want: 0, wantFor: '', ...(belowMin ? { snoozedUntil: Date.now() + SNOOZE_DAYS * 86400000 } : {}) });
  toast(belowMin ? `${item.name} ${SNOOZE_DAYS} dagen van de lijst` : `${item.name} van de lijst`, [undoAction(() => store.setItem(id, before))]);
}

$('#shopAdd').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = e.target.name.value.trim();
  if (!name) return;
  e.target.name.value = '';
  const existing = state.items.find((i) => sameName(i.name, name));
  if (existing) {
    await store.updateItem(existing.id, { want: Math.max(needOf(existing), 0) + stepFor(existing.unit), snoozedUntil: 0 });
  } else {
    const prev = state.log.find((l) => sameName(l.name, name));
    await store.addItem({
      name, qty: 0, want: 1, unit: prev?.unit || 'stuks', category: prev?.category || 'overig',
      space: prev?.space || (SPACE[state.space] ? state.space : 'kast'), location: '', frozenAt: today(), bestBefore: '',
      note: '', min: 0, store: '', barcode: prev?.barcode || '', addedBy: me(), createdAt: Date.now(),
    });
  }
  toast(`${name} staat op de lijst`);
});

$('#shareList').addEventListener('click', async () => {
  const lines = shopItems().sort((a, b) => (a.store || '~').localeCompare(b.store || '~')).map((i) => `• ${i.name} (${fmtQty(needOf(i), i.unit)})${i.store ? ` – ${i.store}` : ''}`);
  const text = `🛒 Boodschappen\n${lines.join('\n')}`;
  if (navigator.share) { try { await navigator.share({ text }); } catch {} }
  else { await navigator.clipboard?.writeText(text); toast('Lijst gekopieerd'); }
});

/* ---------------- Render: geschiedenis ---------------- */
function renderStatsCard() {
  const m = monthStats(state.log);
  const acc = m.accuracy === null ? '–' : `${Math.round(m.accuracy * 100)}%`;
  const accCls = m.accuracy === null ? '' : m.accuracy >= 0.95 ? 'good' : m.accuracy >= 0.8 ? 'warn' : 'bad';
  $('#statsCard').innerHTML = `<div class="card stats">
    <h2>📊 Afgelopen 30 dagen</h2>
    <div class="stat-grid">
      <div><b class="${accCls}">${acc}</b><small>voorraad klopt${m.counts ? ` (${m.counts}× geteld)` : ''}</small></div>
      <div><b class="${m.trashed ? 'warn' : 'good'}">${m.trashed}</b><small>weggegooid</small></div>
      <div><b>${m.topUsed[0] ? esc(m.topUsed[0].name) : '–'}</b><small>meest gebruikt</small></div>
    </div>
    ${m.trashedNames.length ? `<p class="muted small">Weggegooid: ${esc(m.trashedNames.join(', '))}</p>` : ''}
    <p class="muted small">Doel: voorraad klopt ≥ 95% en zo min mogelijk weggooien.</p>
  </div>`;
}

function renderLog() {
  renderStatsCard();
  $('#emptyLog').hidden = state.log.length > 0;
  let html = '', curDay;
  state.log.forEach((l) => {
    const d = new Date(l.at);
    const day = toISO(d);
    if (day !== curDay) {
      curDay = day;
      const label = day === today() ? 'Vandaag' : daysUntil(day) === -1 ? 'Gisteren'
        : d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
      html += `<li class="group-title">${esc(label)}</li>`;
    }
    const sp = SPACE[l.space] || SPACE.vriezer;
    const [icon, verb] = l.type === 'count'
      ? ['🔍', l.match ? 'telde na: klopt' : `telde na: ${fmtNum(l.before)} → ${fmtNum(l.qty)}`]
      : l.type === 'in'
      ? (l.reason === 'bought' ? ['🛒', `kocht → ${sp.short.toLowerCase()}`] : ['⬇️', `legde ${sp.in}`])
      : (l.reason === 'trashed' ? ['🗑️', 'gooide weg'] : ['⬆️', `pakte ${sp.out}`]);
    const time = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
    html += `<li class="item">
      <div class="item-icon">${icon}</div>
      <div class="item-main">
        <div class="item-name">${esc(l.name)}${l.type === 'count' ? '' : ` <span class="muted">· ${esc(fmtQty(l.qty, l.unit))}</span>`}</div>
        <div class="when">${esc(l.by)} ${esc(verb)} · ${time}</div>
      </div>
      ${l.type === 'count' ? '' : `<button class="readd" data-readd="${l.id}" aria-label="Opnieuw toevoegen" title="Opnieuw toevoegen">＋</button>`}
    </li>`;
  });
  $('#logList').innerHTML = html;
}

/* ---------------- Toevoegen / bewerken ---------------- */
const itemForm = $('#itemForm');
let thtTouched = false;

function fillSelects() {
  itemForm.unit.innerHTML = UNITS.map((u) => `<option>${u}</option>`).join('');
  $('#spaceSeg').innerHTML = SPACES.map((s) =>
    `<label><input type="radio" name="space" value="${s.id}"><span>${s.icon} ${esc(s.short)}</span></label>`).join('');
}
function fillCategories(space, selected) {
  const ids = space === 'vriezer' ? FREEZER_CATS : CATEGORIES.map((c) => c.id);
  if (selected && !ids.includes(selected)) ids.push(selected);
  itemForm.category.innerHTML = ids.map((id) => `<option value="${id}">${CAT[id].icon} ${esc(CAT[id].label)}</option>`).join('');
  itemForm.category.value = selected && ids.includes(selected) ? selected : 'overig';
}

function onSpaceChange() {
  const sp = itemForm.space.value || 'vriezer';
  fillCategories(sp, itemForm.category.value);
  $('#dateLabel').textContent = sp === 'vriezer' ? 'In vriezer' : 'Toegevoegd';
  itemForm.location.placeholder = SPACE[sp].loc;
  renderDatalists();
  suggestTht();
}

function suggestTht() {
  const sp = itemForm.space.value;
  if (sp !== 'vriezer') {
    $('#thtHint').textContent = '(van verpakking)';
    if (!thtTouched) itemForm.bestBefore.value = '';
    return;
  }
  const months = durationFor(itemForm.category.value);
  $('#thtHint').textContent = `(± ${months} mnd)`;
  if (!thtTouched && itemForm.frozenAt.value) itemForm.bestBefore.value = addMonths(itemForm.frozenAt.value, months);
}

function setBarcodeInfo(code) {
  itemForm.barcode.value = code || '';
  $('#barcodeInfo').textContent = code ? `Barcode: ${code}` : '';
}

function openItem(item = null, prefill = null) {
  state.editingId = item?.id || null;
  const d = item || prefill || {};
  $('#itemTitle').textContent = item ? 'Bewerken' : 'Toevoegen';
  itemForm.name.value = d.name || '';
  itemForm.qty.value = item ? item.qty : d.qty ?? 1;
  itemForm.unit.value = d.unit || 'stuks';
  itemForm.space.value = item ? spaceOf(item) : d.space || (SPACE[state.space] ? state.space : 'vriezer');
  fillCategories(itemForm.space.value, d.category || (state.filter in CAT ? state.filter : 'overig'));
  itemForm.location.value = d.location || '';
  itemForm.frozenAt.value = item?.frozenAt || today();
  itemForm.bestBefore.value = item ? item.bestBefore || '' : '';
  itemForm.min.value = Number(d.min) > 0 ? d.min : '';
  itemForm.store.value = d.store || '';
  itemForm.note.value = d.note || '';
  setBarcodeInfo(d.barcode);
  thtTouched = !!item;
  onSpaceChange();
  $('#deleteItem').hidden = !item;
  $('#takeFromEdit').hidden = !item || item.qty <= 0;
  $('#itemDialog').showModal();
  if (!item && !prefill) setTimeout(() => itemForm.name.focus(), 50);
}

// Bekend product gekozen → eigenschappen overnemen
function knownProduct({ name, barcode }) {
  const match = (x) => (barcode && x.barcode === barcode) || (name && sameName(x.name, name));
  return state.items.find(match) || state.log.find((l) => match(l) && l.category);
}
itemForm.name.addEventListener('change', () => {
  if (state.editingId) return;
  const prev = knownProduct({ name: itemForm.name.value });
  if (!prev) return;
  if (prev.space) itemForm.space.value = prev.space;
  onSpaceChange();
  if (prev.category) { fillCategories(itemForm.space.value, prev.category); }
  itemForm.unit.value = prev.unit || itemForm.unit.value;
  if (prev.location && !itemForm.location.value) itemForm.location.value = prev.location;
  if (prev.store && !itemForm.store.value) itemForm.store.value = prev.store;
  if (Number(prev.min) > 0 && !itemForm.min.value) itemForm.min.value = prev.min;
  if (prev.barcode && !itemForm.barcode.value) setBarcodeInfo(prev.barcode);
  suggestTht();
});
$('#spaceSeg').addEventListener('change', onSpaceChange);
itemForm.category.addEventListener('change', suggestTht);
itemForm.frozenAt.addEventListener('change', suggestTht);
itemForm.bestBefore.addEventListener('input', () => { thtTouched = !!itemForm.bestBefore.value; });
itemForm.unit.addEventListener('change', () => {
  if (itemForm.unit.value === 'gram' && Number(itemForm.qty.value) < 10) itemForm.qty.value = 500;
});

itemForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = {
    name: itemForm.name.value.trim(),
    qty: round(Number(itemForm.qty.value) || 0),
    unit: itemForm.unit.value,
    space: itemForm.space.value || 'vriezer',
    category: itemForm.category.value,
    location: itemForm.location.value.trim(),
    frozenAt: itemForm.frozenAt.value,
    bestBefore: itemForm.bestBefore.value || '',
    min: Math.max(0, Number(itemForm.min.value) || 0),
    store: itemForm.store.value.trim(),
    barcode: itemForm.barcode.value,
    note: itemForm.note.value.trim(),
  };
  if (!data.name) return;
  const editing = byId(state.editingId);
  if (!editing && data.qty <= 0 && !data.min) return;
  $('#itemDialog').close();
  if (editing) {
    await store.updateItem(editing.id, { ...data, ...(data.qty > 0 ? { want: 0 } : {}), updatedBy: me(), updatedAt: Date.now() });
    const diff = round(data.qty - editing.qty);
    if (diff) await logChange({ ...logBase({ ...editing, ...data }), type: diff > 0 ? 'in' : 'out', reason: 'used', qty: Math.abs(diff) });
    toast('Opgeslagen');
    return;
  }
  // Nieuw: bestaat hetzelfde product al op dezelfde plek zonder voorraad (bijv. op de lijst)? Dan aanvullen.
  const twin = state.items.find((i) => sameName(i.name, data.name) && spaceOf(i) === data.space && i.qty <= 0);
  let id;
  if (twin) {
    id = twin.id;
    await store.updateItem(id, { ...data, min: data.min || twin.min || 0, want: 0, snoozedUntil: 0, updatedBy: me(), updatedAt: Date.now() });
  } else {
    id = await store.addItem({ ...data, want: 0, addedBy: me(), createdAt: Date.now() });
  }
  if (data.qty > 0) await logChange({ ...logBase({ id, ...data }), type: 'in', qty: data.qty });
  toast(`${data.name} toegevoegd ${SPACE[data.space].in}`);
});

$('#deleteItem').addEventListener('click', async () => {
  const item = byId(state.editingId);
  if (!item || !confirm(`"${item.name}" helemaal verwijderen?\n\n(Tip: gebruik "Eruit halen" als je het hebt opgemaakt of weggegooid.)`)) return;
  $('#itemDialog').close();
  const { id, ...data } = item;
  await store.deleteItem(id);
  toast('Verwijderd', [undoAction(() => store.setItem(id, data))]);
});
$('#takeFromEdit').addEventListener('click', () => {
  const item = byId(state.editingId);
  $('#itemDialog').close();
  if (item) openTake(item);
});

/* ---------------- Eruit halen ---------------- */
const takeForm = $('#takeForm');
function openTake(item) {
  state.takingId = item.id;
  $('#takeTitle').textContent = `${item.name} eruit`;
  $('#takeInfo').textContent = `Er ligt nu ${fmtQty(item.qty, item.unit)} ${SPACE[spaceOf(item)].in}${item.location ? ` (${item.location})` : ''}.`;
  const step = stepFor(item.unit);
  takeForm.qty.max = item.qty;
  takeForm.qty.value = item.qty <= step ? item.qty : step;
  takeForm.reason.value = 'used';
  takeForm.toList.checked = false;
  $('#toListRow').hidden = Number(item.min) > 0;
  $('#takeDialog').showModal();
}
async function takeOut(qty) {
  const item = byId(state.takingId);
  if (!item) return;
  qty = Math.min(Math.max(Number(qty) || 0, 0), item.qty);
  if (qty <= 0) return;
  $('#takeDialog').close();
  await changeQty(item, -qty, { reason: takeForm.reason.value, toList: takeForm.toList.checked });
}
takeForm.addEventListener('submit', (e) => { e.preventDefault(); takeOut(takeForm.qty.value); });
$('#takeAll').addEventListener('click', () => { const item = byId(state.takingId); if (item) takeOut(item.qty); });

/* ---------------- Barcode ---------------- */
let scanStream = null, scanTimer = null;
async function getDetector() {
  if ('BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes('ean_13')) return new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
    } catch {}
  }
  const { BarcodeDetector } = await import('./vendor/barcode.js');
  return new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
}
function stopScan() {
  clearTimeout(scanTimer);
  scanStream?.getTracks().forEach((t) => t.stop());
  scanStream = null;
}
let onScanned = null;
async function openScanner(cb) {
  onScanned = cb;
  const dlg = $('#scanDialog');
  const video = $('#scanVideo');
  $('#scanMsg').textContent = 'Camera starten…';
  $('#manualCode').code.value = '';
  dlg.showModal();
  try {
    const [detector, stream] = await Promise.all([
      getDetector(),
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false }),
    ]);
    if (!dlg.open) { stream.getTracks().forEach((t) => t.stop()); return; }
    scanStream = stream;
    video.srcObject = stream;
    await video.play();
    $('#scanMsg').textContent = 'Richt de camera op de barcode…';
    const tick = async () => {
      if (!scanStream) return;
      try {
        const codes = await detector.detect(video);
        if (codes.length) return finishScan(codes[0].rawValue);
      } catch {}
      scanTimer = setTimeout(tick, 200);
    };
    tick();
  } catch (err) {
    console.warn(err);
    $('#scanMsg').textContent = 'Camera niet beschikbaar. Typ de barcode hieronder in.';
  }
}
function finishScan(code) {
  code = String(code || '').trim();
  if (!code) return;
  navigator.vibrate?.(60);
  stopScan();
  $('#scanDialog').close();
  onScanned?.(code);
}
$('#scanDialog').addEventListener('close', stopScan);
$('#manualCode').addEventListener('submit', (e) => { e.preventDefault(); finishScan(e.target.code.value.replace(/\D/g, '')); });

async function lookupBarcode(code) {
  const cache = ls.get('vv:barcodes', {});
  if (cache[code]) return cache[code];
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name_nl,product_name,generic_name_nl,brands`, { signal: ctrl.signal });
    clearTimeout(t);
    const data = await res.json();
    const p = data?.product;
    if (!p) return null;
    let name = (p.product_name_nl || p.product_name || p.generic_name_nl || '').trim();
    const brand = (p.brands || '').split(',')[0].trim();
    if (brand && name && !name.toLowerCase().includes(brand.toLowerCase())) name = `${brand} ${name}`;
    if (!name) return null;
    cache[code] = { name };
    ls.set('vv:barcodes', cache);
    return cache[code];
  } catch { return null; }
}

// Scannen vanuit de voorraad: bekend → snelle actie, onbekend → toevoegen
$('#scanBtn').addEventListener('click', () => openScanner(async (code) => {
  const inStock = state.items.find((i) => i.barcode === code && (state.space === 'all' || spaceOf(i) === state.space))
    || state.items.find((i) => i.barcode === code);
  if (inStock) return openQuick(inStock);
  const prev = knownProduct({ barcode: code });
  if (prev) return openItem(null, { ...prev, qty: 1, barcode: code, location: prev.location || '' });
  toast('Product opzoeken…');
  const found = await lookupBarcode(code);
  openItem(null, { name: found?.name || '', barcode: code, qty: 1 });
  if (!found) { toast('Onbekende barcode: vul de naam zelf in'); setTimeout(() => itemForm.name.focus(), 50); }
}));
$('#formScan').addEventListener('click', () => {
  const wasOpen = $('#itemDialog').open;
  openScanner(async (code) => {
    setBarcodeInfo(code);
    if (!itemForm.name.value.trim()) {
      const prev = knownProduct({ barcode: code });
      const found = prev || await lookupBarcode(code);
      if (found?.name) { itemForm.name.value = found.name; itemForm.name.dispatchEvent(new Event('change')); }
      else toast('Onbekende barcode: vul de naam zelf in');
    }
    if (wasOpen && !$('#itemDialog').open) $('#itemDialog').showModal();
  });
});

function openQuick(item) {
  state.quickId = item.id;
  $('#quickTitle').textContent = item.name;
  $('#quickInfo').textContent = `${fmtQty(item.qty, item.unit)} ${SPACE[spaceOf(item)].in}${item.location ? ` (${item.location})` : ''}`;
  $('#quickDialog [data-quick="dec"]').disabled = item.qty <= 0;
  $('#quickDialog').showModal();
}
$('#quickDialog').addEventListener('click', (e) => {
  const b = e.target.closest('[data-quick]');
  if (!b) return;
  const item = byId(state.quickId);
  $('#quickDialog').close();
  if (!item) return;
  if (b.dataset.quick === 'inc') changeQty(item, stepFor(item.unit));
  if (b.dataset.quick === 'dec') decrement(item);
  if (b.dataset.quick === 'edit') openItem(item);
});

function decrement(item) {
  if (WEIGHT_UNITS.includes(item.unit)) return openTake(item);
  changeQty(item, -1);
}


/* ---------------- Recepten ---------------- */
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const recipeById = (id) => state.recipes.find((r) => r.id === id);
const personsFor = (r) => Number(r.planned) || Number(r.servings) || 2;

function recipeStatus(r, persons = personsFor(r)) {
  const factor = persons / (Number(r.servings) || 1);
  const rows = (r.ingredients || []).map((ing) => ({ ing, ...checkIngredient(ing, state.items, factor) }));
  const lacking = rows.filter((x) => x.status === 'missing' || x.status === 'short');
  const onList = lacking.filter((x) => x.matches[0] && needOf(x.matches[0]) > 0).length;
  return { rows, missing: lacking.length - onList, onList, factor };
}
function statusBadge(st, asText = false) {
  if (st.missing) return asText ? `<span class="warn-text">${st.missing} ontbreken</span>` : `<span class="badge warn">${st.missing} ontbreken</span>`;
  if (st.onList) return asText ? `🛒 ${st.onList} op de lijst` : `<span class="badge info">🛒 ${st.onList} op de lijst</span>`;
  return asText ? '✓ alles in huis' : '<span class="badge">✓ alles in huis</span>';
}

function renderSuggestions() {
  const scored = state.recipes
    .map((r) => ({ r, s: recipeScore(recipeStatus(r).rows, daysLeftOf) }))
    .filter((x) => x.s && x.s.missing === 0 && !(Number(x.r.planned) > 0))
    .sort((a, b) => b.s.score - a.s.score || (a.r.lastCooked || 0) - (b.r.lastCooked || 0))
    .slice(0, 3);
  $('#suggestBlock').innerHTML = scored.length ? `<h2 class="section-title">💡 Wat eten we?</h2>
    <p class="muted small">Alles in huis${scored.some((x) => x.s.usesSoon.length) ? ', en het maakt op wat het eerst over datum gaat' : ''}.</p>
    <ul class="list">${scored.map(({ r, s }) => {
      const soon = [...new Map(s.usesSoon.map((u) => [u.item.id, u])).values()].sort((a, b) => a.days - b.days);
      return `<li class="item">
        <div class="item-icon">💡</div>
        <button class="item-main" data-recipe="${r.id}">
          <div class="item-name">${esc(r.name)}</div>
          <div class="item-meta">${soon.length ? soon.map((u) => `${esc(u.item.name)} (${u.days <= 0 ? 'THT vandaag' : `nog ${u.days} dg${u.days === 1 ? '' : 'n'}`})`).join(', ') : '✓ alles in huis'}</div>
        </button>
      </li>`;
    }).join('')}</ul>` : '';
}

function renderRecipes() {
  renderSuggestions();
  const planned = state.recipes.filter((r) => Number(r.planned) > 0).sort((a, b) => (a.plannedAt || 0) - (b.plannedAt || 0));
  const menu = $('#menuBlock');
  if (planned.length) {
    menu.innerHTML = `<h2 class="section-title">📅 Op het menu</h2>
      <ul class="list">${planned.map((r) => {
        const st = recipeStatus(r);
        return `<li class="item">
          <div class="item-icon">🍽️</div>
          <button class="item-main" data-recipe="${r.id}">
            <div class="item-name">${esc(r.name)}</div>
            <div class="item-meta">${personsFor(r)} pers · ${statusBadge(st, true)}</div>
          </button>
          <button class="take-btn" data-cooked="${r.id}">🍳 Gekookt</button>
        </li>`;
      }).join('')}</ul>
      <button id="menuToList" class="btn secondary block">🛒 Alles voor het menu op de lijst</button>`;
  } else menu.innerHTML = '';

  const q = state.recipeSearch.trim().toLowerCase();
  const list = state.recipes
    .filter((r) => !q || `${r.name} ${(r.ingredients || []).map((i) => i.name).join(' ')}`.toLowerCase().includes(q))
    .sort((a, b) => (b.lastCooked || 0) - (a.lastCooked || 0) || a.name.localeCompare(b.name, 'nl'));
  $('#recipeList').innerHTML = list.map((r) => {
    const st = recipeStatus(r);
    const n = (r.ingredients || []).length;
    return `<li class="item">
      <div class="item-icon">🍳</div>
      <button class="item-main" data-recipe="${r.id}">
        <div class="item-name">${esc(r.name)}</div>
        <div class="item-meta">${r.servings} pers · ${n} ingrediënt${n === 1 ? '' : 'en'}${r.lastCooked ? ` · laatst ${fmtDate(toISO(new Date(r.lastCooked)))}` : ''}</div>
        <div class="badges">${statusBadge(st)}${Number(r.planned) > 0 ? '<span class="badge info">📅 op het menu</span>' : ''}</div>
      </button>
    </li>`;
  }).join('');
  $('#emptyRecipes').hidden = state.recipes.length > 0;
}

$('#view-recipes').addEventListener('click', (e) => {
  const c = e.target.closest('[data-cooked]');
  if (c) return openCook(recipeById(c.dataset.cooked));
  const r = e.target.closest('[data-recipe]');
  if (r) return openRecipe(recipeById(r.dataset.recipe));
  if (e.target.closest('#menuToList')) menuToList();
});
$('#recipeSearch').addEventListener('input', (e) => { state.recipeSearch = e.target.value; renderRecipes(); });
$('#newRecipe').addEventListener('click', () => openRecipeEdit());

/* Detail */
const ingChecked = new Map(); // index → aangevinkt voor de lijst
function openRecipe(r) {
  if (!r) return;
  state.recipeId = r.id;
  ingChecked.clear();
  $('#persons').value = personsFor(r);
  $('#recipeDialog').showModal();
  renderRecipeDetail();
}
function renderRecipeDetail() {
  const r = recipeById(state.recipeId);
  if (!r) { $('#recipeDialog').close(); return; }
  $('#recipeTitle').textContent = r.name;
  $('#recipeNote').textContent = r.note || '';
  $('#recipeNote').hidden = !r.note;
  const st = recipeStatus(r, Number($('#persons').value) || 1);
  $('#ingList').innerHTML = st.rows.map((x, idx) => {
    const scaled = { ...x.ing, qty: round(x.need) };
    const m = x.matches[0];
    const icon = { ok: '✅', short: '⚠️', missing: '❌', basic: '❔' }[x.status];
    const info = x.status === 'ok' ? `in huis: ${x.matches.map((mm) => fmtQty(mm.qty, mm.unit)).join(' + ')}`
      : x.status === 'short' ? `nog ${fmtNum(round(x.have))}, tekort ${fmtNum(round(x.missing))}${m && needOf(m) > 0 ? ' · 🛒 op de lijst' : ''}`
      : x.status === 'basic' ? 'basis – zelf checken' : (m && needOf(m) > 0 ? '🛒 staat al op de lijst' : 'niet in huis');
    const checkable = x.status !== 'ok';
    if (checkable && !ingChecked.has(idx)) ingChecked.set(idx, x.status !== 'basic' && !(m && needOf(m) > 0));
    return `<li class="ing ${x.status}">
      ${checkable ? `<input type="checkbox" data-ing="${idx}" ${ingChecked.get(idx) ? 'checked' : ''} aria-label="Op de lijst">` : '<span class="ing-spacer"></span>'}
      <span class="ing-icon">${icon}</span>
      <span class="ing-text"><b>${esc(ingredientToText(scaled))}</b><small>${esc(info)}</small></span>
    </li>`;
  }).join('');
  const n = [...ingChecked.entries()].filter(([idx, v]) => v && st.rows[idx] && st.rows[idx].status !== 'ok').length;
  $('#addMissing').textContent = n ? `🛒 Zet ${n} ingrediënt${n === 1 ? '' : 'en'} op de lijst` : '✓ Niets nodig voor de lijst';
  $('#addMissing').disabled = !n;
  $('#planBtn').textContent = Number(r.planned) > 0 ? '📅 Van het menu' : '📅 Op het menu';
}
$('#ingList').addEventListener('change', (e) => {
  const cb = e.target.closest('[data-ing]');
  if (cb) { ingChecked.set(Number(cb.dataset.ing), cb.checked); renderRecipeDetail(); }
});
$('#recipeView').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pstep]');
  if (!b) return;
  const inp = $('#persons');
  inp.value = Math.max(1, (Number(inp.value) || 1) + Number(b.dataset.pstep));
  renderRecipeDetail();
});
$('#persons').addEventListener('input', renderRecipeDetail);

$('#addMissing').addEventListener('click', async () => {
  const r = recipeById(state.recipeId);
  const st = recipeStatus(r, Number($('#persons').value) || 1);
  const lines = st.rows.filter((x, idx) => ingChecked.get(idx) && x.status !== 'ok');
  const n = await addToList(lines.map((x) => ({ ing: x.ing, missing: x.status === 'short' ? x.missing : x.need, match: x.matches[0] })), r.name);
  ingChecked.clear();
  toast(`${n} ingrediënt${n === 1 ? '' : 'en'} op de lijst 🛒`, [{ label: 'Bekijk', run: () => { $('#recipeDialog').close(); showView('shop'); } }]);
});

// Zet ingrediënten op de boodschappenlijst; bundelt alles per product in één schrijfactie
async function addToList(lines, forName) {
  const updates = new Map(); // item-id → extra
  const creates = new Map(); // naam → nieuw item
  lines.forEach(({ ing, missing, match }) => {
    const shop = toShopping(ing, missing, match);
    if (match) {
      const u = updates.get(match.id) || { item: match, add: 0 };
      u.add += shop.qty; updates.set(match.id, u);
    } else {
      const key = ing.name.toLowerCase();
      const c = creates.get(key) || { ing, unit: shop.unit, qty: 0 };
      c.qty += shop.qty; creates.set(key, c);
    }
  });
  for (const { item, add } of updates.values()) {
    await store.updateItem(item.id, { want: round(needOf(item) + add), wantFor: forName, snoozedUntil: 0 });
  }
  for (const { ing, unit, qty } of creates.values()) {
    const prev = state.log.find((l) => sameName(l.name, ing.name));
    await store.addItem({
      name: capitalize(ing.name), qty: 0, want: round(qty), wantFor: forName, unit: prev?.unit || unit,
      category: prev?.category || 'overig', space: prev?.space || 'kast', location: '', frozenAt: today(), bestBefore: '',
      note: '', min: 0, store: '', barcode: '', addedBy: me(), createdAt: Date.now(),
    });
  }
  return updates.size + creates.size;
}

async function menuToList() {
  const planned = state.recipes.filter((r) => Number(r.planned) > 0);
  // ingrediënten van alle geplande recepten samenvoegen, zodat gedeelde producten niet dubbel geteld worden
  const combined = new Map();
  planned.forEach((r) => {
    const factor = personsFor(r) / (Number(r.servings) || 1);
    (r.ingredients || []).forEach((ing) => {
      const key = `${ing.name.toLowerCase()}|${ing.unit}`;
      const c = combined.get(key) || { ...ing, qty: 0 };
      c.qty += ing.qty * factor; combined.set(key, c);
    });
  });
  const lines = [];
  combined.forEach((ing) => {
    const x = checkIngredient(ing, state.items, 1);
    if (x.status === 'missing' || x.status === 'short') {
      const m = x.matches[0];
      if (m && needOf(m) > 0 && x.status === 'missing') return; // staat al op de lijst
      lines.push({ ing, missing: x.status === 'short' ? x.missing : x.need, match: m });
    }
  });
  if (!lines.length) return toast('Alles voor het menu is in huis ✓');
  const n = await addToList(lines, planned.length === 1 ? planned[0].name : 'het menu');
  toast(`${n} ingrediënt${n === 1 ? '' : 'en'} op de lijst 🛒`, [{ label: 'Bekijk', run: () => showView('shop') }]);
}

$('#planBtn').addEventListener('click', async () => {
  const r = recipeById(state.recipeId);
  const on = !(Number(r.planned) > 0);
  await store.updateItem(r.id, on ? { planned: Number($('#persons').value) || r.servings, plannedAt: Date.now() } : { planned: 0 });
  toast(on ? `${r.name} staat op het menu 📅` : `${r.name} van het menu`);
});
$('#cookBtn').addEventListener('click', () => {
  const r = recipeById(state.recipeId);
  $('#recipeDialog').close();
  openCook(r, Number($('#persons').value) || personsFor(r));
});
$('#editRecipe').addEventListener('click', () => {
  const r = recipeById(state.recipeId);
  $('#recipeDialog').close();
  openRecipeEdit(r);
});

/* Gekookt → afboeken */
let cookRecipeId = null;
function openCook(r, persons = personsFor(r)) {
  if (!r) return;
  cookRecipeId = r.id;
  $('#cookTitle').textContent = `Gekookt: ${r.name}`;
  const factor = persons / (Number(r.servings) || 1);
  const rows = new Map(); // item-id → {item, amount}
  (r.ingredients || []).forEach((ing) => {
    const m = findMatches(ing.name, state.items).find((it) => it.qty > 0);
    if (!m) return;
    const cur = rows.get(m.id) || { item: m, amount: 0 };
    cur.amount = Math.min(m.qty, round(cur.amount + cookAmount(ing, m, factor)));
    rows.set(m.id, cur);
  });
  $('#cookList').innerHTML = [...rows.values()].map(({ item, amount }) => `
    <li class="item cook-row">
      <div class="item-main">
        <div class="item-name">${esc(item.name)}</div>
        <div class="item-meta">${SPACE[spaceOf(item)].icon} ${esc(fmtQty(item.qty, item.unit))} in huis</div>
      </div>
      <div class="stepper small">
        <button type="button" data-cstep="-1">−</button>
        <input type="number" inputmode="decimal" min="0" max="${item.qty}" step="any" value="${amount}" data-cook="${item.id}" aria-label="${esc(item.name)} afboeken">
        <button type="button" data-cstep="1">+</button>
      </div>
      <small class="unit">${esc(item.unit)}</small>
    </li>`).join('');
  $('#cookEmpty').hidden = rows.size > 0;
  $('#cookDialog').showModal();
}
$('#cookList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cstep]');
  if (!b) return;
  const inp = b.parentElement.querySelector('input');
  const item = byId(inp.dataset.cook);
  inp.value = Math.min(item.qty, Math.max(0, round((Number(inp.value) || 0) + stepFor(item.unit) * Number(b.dataset.cstep))));
});
$('#cookForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = recipeById(cookRecipeId);
  $('#cookDialog').close();
  const undos = [];
  for (const inp of $$('#cookList input[data-cook]')) {
    const item = byId(inp.dataset.cook);
    const amt = Math.min(item?.qty || 0, Number(inp.value) || 0);
    if (!item || amt <= 0) continue;
    const { id, ...before } = item;
    const next = round(item.qty - amt);
    if (next > 0 || Number(item.min) > 0) await store.updateItem(id, { qty: next, updatedBy: me(), updatedAt: Date.now() });
    else await store.deleteItem(id);
    const logId = await store.addLog({ ...logBase(item), type: 'out', reason: 'used', qty: amt, by: me(), at: Date.now(), note: r ? `voor ${r.name}` : '' });
    undos.push(() => { store.setItem(id, before); store.deleteLog(logId); });
  }
  if (r) {
    const before = { lastCooked: r.lastCooked || 0, planned: r.planned || 0 };
    await store.updateItem(r.id, { lastCooked: Date.now(), planned: 0 });
    undos.push(() => store.updateItem(r.id, before));
  }
  toast(`Eet smakelijk! ${undos.length - (r ? 1 : 0)} product${undos.length - (r ? 1 : 0) === 1 ? '' : 'en'} afgeboekt`, [undoAction(() => undos.forEach((u) => u()))]);
});

/* Recept bewerken */
const recipeForm = $('#recipeForm');
function openRecipeEdit(r = null) {
  state.editingRecipeId = r?.id || null;
  $('#recipeEditTitle').textContent = r ? 'Recept bewerken' : 'Nieuw recept';
  recipeForm.name.value = r?.name || '';
  recipeForm.servings.value = r?.servings || 2;
  recipeForm.ingredients.value = (r?.ingredients || []).map(ingredientToText).join('\n');
  recipeForm.note.value = r?.note || '';
  $('#deleteRecipe').hidden = !r;
  renderPreview();
  $('#recipeEditDialog').showModal();
  if (!r) setTimeout(() => recipeForm.name.focus(), 50);
}
function renderPreview() {
  const ings = parseIngredients(recipeForm.ingredients.value);
  $('#ingPreview').innerHTML = ings.length
    ? `<p class="muted small">Herkend (${ings.length}):</p><div class="chips wrap">${ings.map((i) => `<span class="chip">${esc(ingredientToText(i))}</span>`).join('')}</div>`
    : '';
}
recipeForm.ingredients.addEventListener('input', renderPreview);
recipeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = {
    kind: 'recipe',
    name: recipeForm.name.value.trim(),
    servings: Math.max(1, Number(recipeForm.servings.value) || 2),
    ingredients: parseIngredients(recipeForm.ingredients.value).map(({ qty, unit, name }) => ({ qty: round(qty), unit, name })),
    note: recipeForm.note.value.trim(),
  };
  if (!data.name) return;
  stopDictation();
  $('#recipeEditDialog').close();
  if (state.editingRecipeId) {
    await store.updateItem(state.editingRecipeId, { ...data, updatedBy: me(), updatedAt: Date.now() });
    toast('Recept opgeslagen');
    openRecipe(recipeById(state.editingRecipeId));
  } else {
    const id = await store.addItem({ ...data, planned: 0, lastCooked: 0, addedBy: me(), createdAt: Date.now() });
    toast(`${data.name} toegevoegd`);
    setTimeout(() => openRecipe(recipeById(id)), 100);
  }
});
$('#deleteRecipe').addEventListener('click', async () => {
  const r = recipeById(state.editingRecipeId);
  if (!r || !confirm(`Recept "${r.name}" verwijderen?`)) return;
  $('#recipeEditDialog').close();
  const { id, ...data } = r;
  await store.deleteItem(id);
  toast('Recept verwijderd', [undoAction(() => store.setItem(id, data))]);
});

// Inspreken in de app zelf (Chrome/Android, Safari); anders via de microfoon op het toetsenbord
const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
let recog = null;
if (Speech) $('#dictateBtn').hidden = false;
function stopDictation() { try { recog?.stop(); } catch {} }
$('#dictateBtn').addEventListener('click', () => {
  if (recog) return stopDictation();
  recog = new Speech();
  recog.lang = 'nl-NL';
  recog.continuous = true;
  recog.interimResults = false;
  recog.onresult = (ev) => {
    for (let k = ev.resultIndex; k < ev.results.length; k++) {
      if (!ev.results[k].isFinal) continue;
      const t = ev.results[k][0].transcript.trim();
      const ta = recipeForm.ingredients;
      ta.value = `${ta.value.trim()}${ta.value.trim() ? '\n' : ''}${t}`;
      renderPreview();
    }
  };
  recog.onend = () => { recog = null; $('#dictateBtn').textContent = '🎤 Inspreken'; $('#dictateBtn').classList.remove('recording'); };
  recog.onerror = (ev) => { if (ev.error === 'not-allowed') toast('Geen toegang tot de microfoon'); };
  recog.start();
  $('#dictateBtn').textContent = '⏹️ Stop inspreken';
  $('#dictateBtn').classList.add('recording');
});
$('#recipeEditDialog').addEventListener('close', stopDictation);

/* ---------------- Steppers & dialogen ---------------- */
document.addEventListener('click', (e) => {
  const step = e.target.closest('[data-step]');
  if (step) {
    const input = step.parentElement.querySelector('input');
    const form = step.closest('form');
    const unit = form === itemForm ? itemForm.unit.value : byId(state.takingId)?.unit;
    let v = round((Number(input.value) || 0) + stepFor(unit) * Number(step.dataset.step));
    v = Math.max(v, 0);
    if (input.max) v = Math.min(v, Number(input.max));
    input.value = v;
    return;
  }
  if (e.target.closest('[data-close]')) { e.target.closest('dialog').close(); return; }
  const f = e.target.closest('[data-filter]');
  if (f) { state.filter = f.dataset.filter; renderStock(); return; }
  const g = e.target.closest('[data-goto]');
  if (g) showView(g.dataset.goto);
});
$$('dialog.sheet').forEach((d) => d.addEventListener('click', (e) => {
  if (e.target === d && d.id !== 'welcomeDialog') d.close();
}));

/* ---------------- Lijst-interactie ---------------- */
$('#stockList').addEventListener('click', (e) => {
  const dec = e.target.closest('[data-dec]');
  if (dec) return decrement(byId(dec.dataset.dec));
  const inc = e.target.closest('[data-inc]');
  if (inc) { const i = byId(inc.dataset.inc); return changeQty(i, stepFor(i.unit)); }
  const edit = e.target.closest('[data-edit]');
  if (edit) openItem(byId(edit.dataset.edit));
});
$('#shopList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-bought]');
  if (b) return markBought(byId(b.dataset.bought));
  const s = e.target.closest('[data-skip]');
  if (s) return skipItem(byId(s.dataset.skip));
  const edit = e.target.closest('[data-edit]');
  if (edit) openItem(byId(edit.dataset.edit));
});
$('#storeChips').addEventListener('click', (e) => {
  const c = e.target.closest('[data-store]');
  if (c) { state.storeFilter = c.dataset.store; renderShop(); }
});
$('#logList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-readd]');
  if (!b) return;
  const l = state.log.find((x) => x.id === b.dataset.readd);
  const existing = state.items.find((i) => sameName(i.name, l.name));
  openItem(null, { name: l.name, qty: l.qty, unit: l.unit, category: l.category || existing?.category, space: l.space || existing?.space,
    location: existing?.location, store: existing?.store, min: existing?.min, barcode: l.barcode || existing?.barcode });
});
$('#spaces').addEventListener('click', (e) => {
  const b = e.target.closest('[data-space]');
  if (!b) return;
  state.space = b.dataset.space; state.filter = 'all';
  ls.set('vv:space', state.space);
  renderStock();
});
$('#search').addEventListener('input', (e) => { state.search = e.target.value; renderStock(); });
$('#sort').value = state.sort;
$('#sort').addEventListener('change', (e) => { state.sort = e.target.value; ls.set('vv:sort', state.sort); renderStock(); });
$('#fab').addEventListener('click', () => openItem());

/* ---------------- Tabs ---------------- */
function showView(name) {
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  $('#fab').hidden = name !== 'stock';
  $('#appTitle').textContent = { shop: '🛒 Boodschappen', recipes: '🍳 Recepten', log: '📜 Geschiedenis', settings: '⚙️ Instellingen' }[name] || '';
  if (name === 'stock') renderSpaces();
  window.scrollTo(0, 0);
}
$$('.tabbar button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

/* ---------------- Instellingen ---------------- */
function renderSettings(hid) {
  $('#myName').value = ls.get('vv:name', '');
  $('#myName').addEventListener('change', (e) => { ls.set('vv:name', e.target.value.trim()); toast('Naam opgeslagen'); });

  const link = `${location.origin}${location.pathname}#h=${hid}`;
  const block = $('#shareBlock');
  if (store.mode === 'cloud') {
    block.innerHTML = `
      <p class="small">Stuur deze link naar je partner. Open hem op de telefoon van je partner en jullie delen dezelfde voorraad – wijzigingen zie je direct.</p>
      <div class="code">${esc(link)}</div>
      <button id="shareLink" class="btn primary block">📤 Deel link</button>
      <button id="joinCode" class="btn secondary block">🔗 Koppel met andere link/code</button>
      <p class="muted small">Houd de link privé: iedereen met de link kan de voorraad zien en aanpassen.</p>`;
    $('#shareLink').onclick = async () => {
      const data = { title: 'Onze voorraad', text: 'Hier is de link naar onze voorraad:', url: link };
      if (navigator.share) { try { await navigator.share(data); } catch {} }
      else { await navigator.clipboard?.writeText(link); toast('Link gekopieerd'); }
    };
    $('#joinCode').onclick = () => {
      const input = prompt('Plak de link of code van je partner:');
      const m = input?.match(/([a-z0-9]{16,})\s*$/i);
      if (!m) return;
      if (state.items.length && !confirm('Je huidige voorraad op dit apparaat wordt niet meegenomen. Doorgaan?')) return;
      ls.set('vv:household', m[1].toLowerCase());
      location.reload();
    };
  } else {
    block.innerHTML = `
      <p class="small">⚠️ De app draait nu in <b>lokale modus</b>: gegevens staan alleen op dit apparaat.</p>
      <p class="small muted">Om samen te synchroniseren moet een Firebase-project gekoppeld zijn in <code>config.js</code> (zie README).</p>`;
  }

  const durations = ls.get('vv:durations', {});
  $('#durations').innerHTML = FREEZER_CATS.map((id) => CAT[id]).map((c) => `
    <li><span>${c.icon} ${esc(c.label)}</span>
      <label><input type="number" min="1" max="36" inputmode="numeric" data-dur="${c.id}" value="${durations[c.id] ?? c.months}"> mnd</label>
    </li>`).join('');
  $('#durations').addEventListener('change', (e) => {
    const id = e.target.dataset.dur; if (!id) return;
    const d = ls.get('vv:durations', {});
    d[id] = Math.max(1, Number(e.target.value) || CAT[id].months);
    ls.set('vv:durations', d);
  });

  $('#exportCsv').onclick = () => {
    const rows = [['Product', 'Aantal', 'Eenheid', 'Locatie', 'Categorie', 'Plek', 'Toegevoegd', 'THT', 'Minimum', 'Winkel', 'Barcode', 'Notitie', 'Toegevoegd door']]
      .concat(state.items.filter(inStockView).map((i) => [i.name, i.qty, i.unit, SPACE[spaceOf(i)].label, CAT[i.category]?.label || '', i.location,
        i.frozenAt, i.bestBefore, i.min || '', i.store, i.barcode, i.note, i.addedBy]));
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `voorraad-${today()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
}

/* ---------------- Sync-status ---------------- */
function setStatus(s) {
  const el = $('#syncStatus');
  const map = { local: '📱 lokaal', synced: '☁️ gesynchroniseerd', syncing: '🔄 synchroniseren…', offline: '📴 offline', error: '⚠️ sync-fout' };
  el.textContent = map[s] || '';
  el.classList.toggle('offline', s === 'offline' || s === 'error');
}

/* ---------------- Start ---------------- */
async function init() {
  fillSelects();
  const hid = resolveHousehold();
  store = await createStore(firebaseConfig, hid, setStatus);
  store.onItems((docs) => {
    state.items = docs.filter((d) => d.kind !== 'recipe');
    state.recipes = docs.filter((d) => d.kind === 'recipe');
    renderStock(); renderShop(); renderRecipes();
    if ($('#recipeDialog').open) renderRecipeDetail();
  });
  store.onLog((log) => { state.log = log; renderLog(); renderDatalists(); renderStock(); renderShop(); renderRecipes(); });
  renderSettings(hid);

  if (!ls.get('vv:name')) {
    $('#welcomeDialog').showModal();
    $('#welcomeForm').addEventListener('submit', (e) => {
      const n = e.target.name.value.trim();
      if (!n) { e.preventDefault(); return; }
      ls.set('vv:name', n);
      $('#myName').value = n;
    });
    $('#welcomeDialog').addEventListener('cancel', (e) => e.preventDefault());
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  setInterval(() => { renderStock(); renderShop(); }, 60 * 60 * 1000);
}
init();
