import { firebaseConfig } from './config.js';
import { createStore, newId } from './store.js';

/* ---------------- Constanten ---------------- */
// Standaard bewaartijden in de vriezer (maanden), globaal gebaseerd op
// richtlijnen van o.a. het Voedingscentrum. Aanpasbaar in Instellingen.
const CATEGORIES = [
  { id: 'vlees',     label: 'Vlees',          icon: '🥩', months: 6 },
  { id: 'gehakt',    label: 'Gehakt & worst', icon: '🍖', months: 3 },
  { id: 'gevogelte', label: 'Kip & gevogelte',icon: '🍗', months: 6 },
  { id: 'vis',       label: 'Vis',            icon: '🐟', months: 3 },
  { id: 'groente',   label: 'Groente',        icon: '🥦', months: 9 },
  { id: 'fruit',     label: 'Fruit',          icon: '🍓', months: 9 },
  { id: 'brood',     label: 'Brood & gebak',  icon: '🍞', months: 3 },
  { id: 'maaltijd',  label: 'Maaltijd/restje',icon: '🍲', months: 3 },
  { id: 'soep',      label: 'Soep & saus',    icon: '🥣', months: 4 },
  { id: 'zuivel',    label: 'Zuivel & kaas',  icon: '🧀', months: 3 },
  { id: 'ijs',       label: 'IJs & dessert',  icon: '🍨', months: 4 },
  { id: 'overig',    label: 'Overig',         icon: '📦', months: 6 },
];
const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
const UNITS = ['stuks', 'porties', 'zakjes', 'bakjes', 'gram', 'kg', 'liter'];
const WARN_DAYS = 14;

/* ---------------- Helpers ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

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
const SINGULAR = { stuks: 'stuk', porties: 'portie', zakjes: 'zakje', bakjes: 'bakje' };
const fmtQty = (q, u) => `${Number(q).toLocaleString('nl-NL', { maximumFractionDigits: 2 })} ${Number(q) === 1 ? SINGULAR[u] || u : u}`;
const stepFor = (unit) => (unit === 'gram' ? 100 : unit === 'kg' || unit === 'liter' ? 0.5 : 1);
const durationFor = (cat) => ls.get('vv:durations', {})[cat] ?? CAT[cat]?.months ?? 6;

function expiryState(item) {
  if (!item.bestBefore) return { cls: '', label: '', days: Infinity };
  const days = daysUntil(item.bestBefore);
  if (days < 0) return { cls: 'bad', label: days === -1 ? 'gisteren over datum' : `${-days} dgn over datum`, days };
  if (days === 0) return { cls: 'bad', label: 'vandaag', days };
  if (days <= WARN_DAYS) return { cls: 'warn', label: `nog ${days} dg${days === 1 ? '' : 'n'}`, days };
  return { cls: '', label: `tot ${fmtDate(item.bestBefore)}`, days };
}

let toastTimer;
function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { el.classList.remove('show'); action.run(); };
    el.append(b);
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 6000 : 2500);
}

/* ---------------- Huishouden (gedeelde code) ---------------- */
function resolveHousehold() {
  const m = location.hash.match(/h=([a-z0-9]{16,})/i);
  if (m) {
    ls.set('vv:household', m[1].toLowerCase());
    history.replaceState(null, '', location.pathname + location.search);
    setTimeout(() => toast('Gekoppeld aan gedeelde vriezer ✔️'), 300);
  }
  let hid = ls.get('vv:household');
  if (!hid) { hid = newId(20); ls.set('vv:household', hid); }
  return hid;
}

/* ---------------- State ---------------- */
const state = {
  items: [],
  log: [],
  filter: 'all',
  search: '',
  sort: ls.get('vv:sort', 'tht'),
  editingId: null,
  takingId: null,
};
let store;
const me = () => ls.get('vv:name', '') || 'Iemand';

/* ---------------- Render: voorraad ---------------- */
function renderChips() {
  const counts = {};
  state.items.forEach((i) => { counts[i.category] = (counts[i.category] || 0) + 1; });
  const chips = [{ id: 'all', label: 'Alles', icon: '', n: state.items.length }]
    .concat(CATEGORIES.filter((c) => counts[c.id]).map((c) => ({ ...c, n: counts[c.id] })));
  if (state.filter !== 'all' && state.filter !== 'soon' && !counts[state.filter]) state.filter = 'all';
  $('#chips').innerHTML = chips.map((c) =>
    `<button class="chip ${state.filter === c.id ? 'active' : ''}" data-filter="${c.id}">${c.icon} ${esc(c.label)}<span class="count">${c.n}</span></button>`
  ).join('');
}

function renderSummary() {
  let soon = 0, over = 0;
  state.items.forEach((i) => { const e = expiryState(i); if (e.cls === 'bad') over++; else if (e.cls === 'warn') soon++; });
  const parts = [`<span class="pill">${state.items.length} product${state.items.length === 1 ? '' : 'en'}</span>`];
  if (over) parts.push(`<button class="pill bad" data-filter="soon">⚠️ ${over} over datum</button>`);
  if (soon) parts.push(`<button class="pill warn" data-filter="soon">⏰ ${soon} binnen ${WARN_DAYS} dagen</button>`);
  if (state.filter === 'soon') parts.push(`<button class="pill" data-filter="all">✕ filter wissen</button>`);
  $('#summary').innerHTML = parts.join('');
}

function filteredItems() {
  const q = state.search.trim().toLowerCase();
  let list = state.items.filter((i) => {
    if (state.filter === 'soon' && expiryState(i).days > WARN_DAYS) return false;
    if (state.filter !== 'all' && state.filter !== 'soon' && i.category !== state.filter) return false;
    if (q && !`${i.name} ${i.note || ''} ${i.location || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const byName = (a, b) => a.name.localeCompare(b.name, 'nl');
  const byTht = (a, b) => (a.bestBefore || '9999').localeCompare(b.bestBefore || '9999') || byName(a, b);
  const sorters = {
    tht: byTht,
    name: byName,
    recent: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    location: (a, b) => (a.location || '~').localeCompare(b.location || '~', 'nl', { numeric: true }) || byTht(a, b),
  };
  return list.sort(sorters[state.sort] || byTht);
}

function itemHTML(i) {
  const c = CAT[i.category] || CAT.overig;
  const e = expiryState(i);
  const meta = [fmtQty(i.qty, i.unit), i.location, `in ${fmtDate(i.frozenAt)}`].filter(Boolean).map(esc).join(' · ');
  return `<li class="item ${e.cls}">
    <div class="item-icon" aria-hidden="true">${c.icon}</div>
    <button class="item-main" data-edit="${i.id}">
      <div class="item-name">${esc(i.name)}</div>
      <div class="item-meta">${meta}</div>
      ${i.note ? `<div class="item-note">${esc(i.note)}</div>` : ''}
      ${e.label ? `<span class="badge ${e.cls}">${esc(e.label)}</span>` : ''}
    </button>
    <button class="take-btn" data-take="${i.id}" aria-label="${esc(i.name)} eruit halen">Eruit</button>
  </li>`;
}

function renderStock() {
  renderChips();
  renderSummary();
  const list = filteredItems();
  let html = '';
  if (state.sort === 'location') {
    let cur;
    list.forEach((i) => {
      const loc = i.location || 'Geen plek';
      if (loc !== cur) { cur = loc; html += `<li class="group-title">${esc(loc)}</li>`; }
      html += itemHTML(i);
    });
  } else {
    html = list.map(itemHTML).join('');
  }
  $('#stockList').innerHTML = html;
  $('#emptyStock').hidden = state.items.length > 0;
  if (state.items.length && !list.length) {
    $('#stockList').innerHTML = `<li class="empty"><p class="muted">Niets gevonden.</p></li>`;
  }
  renderDatalists();
}

function renderDatalists() {
  const names = new Map();
  [...state.log].reverse().forEach((l) => names.set(l.name.toLowerCase(), l.name));
  state.items.forEach((i) => names.set(i.name.toLowerCase(), i.name));
  $('#nameList').innerHTML = [...names.values()].sort((a, b) => a.localeCompare(b, 'nl')).map((n) => `<option value="${esc(n)}">`).join('');
  const locs = new Set(['Lade 1', 'Lade 2', 'Lade 3']);
  state.items.forEach((i) => i.location && locs.add(i.location));
  $('#locationList').innerHTML = [...locs].sort((a, b) => a.localeCompare(b, 'nl', { numeric: true })).map((n) => `<option value="${esc(n)}">`).join('');
}

/* ---------------- Render: geschiedenis ---------------- */
function renderLog() {
  const ul = $('#logList');
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
    const icon = l.type === 'in' ? '⬇️' : l.reason === 'trashed' ? '🗑️' : '⬆️';
    const verb = l.type === 'in' ? 'legde in de vriezer' : l.reason === 'trashed' ? 'gooide weg' : 'haalde eruit';
    const time = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
    html += `<li class="item">
      <div class="item-icon">${icon}</div>
      <div class="item-main">
        <div class="item-name">${esc(l.name)} <span class="muted">· ${esc(fmtQty(l.qty, l.unit))}</span></div>
        <div class="when">${esc(l.by)} ${verb} · ${time}</div>
      </div>
      <button class="readd" data-readd="${l.id}" aria-label="Opnieuw toevoegen" title="Opnieuw toevoegen">＋</button>
    </li>`;
  });
  ul.innerHTML = html;
}

/* ---------------- Toevoegen / bewerken ---------------- */
const itemForm = $('#itemForm');
let thtTouched = false;

function fillSelects() {
  itemForm.category.innerHTML = CATEGORIES.map((c) => `<option value="${c.id}">${c.icon} ${esc(c.label)}</option>`).join('');
  itemForm.unit.innerHTML = UNITS.map((u) => `<option>${u}</option>`).join('');
}

function suggestTht() {
  const months = durationFor(itemForm.category.value);
  $('#thtHint').textContent = `(± ${months} mnd)`;
  if (!thtTouched && itemForm.frozenAt.value) itemForm.bestBefore.value = addMonths(itemForm.frozenAt.value, months);
}

function openItem(item = null, prefill = null) {
  state.editingId = item?.id || null;
  const d = item || prefill || {};
  $('#itemTitle').textContent = item ? 'Bewerken' : 'Toevoegen';
  itemForm.name.value = d.name || '';
  itemForm.qty.value = d.qty ?? 1;
  itemForm.unit.value = d.unit || 'stuks';
  itemForm.category.value = d.category || (state.filter in CAT ? state.filter : 'overig');
  itemForm.location.value = d.location || '';
  itemForm.frozenAt.value = item ? item.frozenAt : today();
  itemForm.bestBefore.value = item ? item.bestBefore || '' : '';
  itemForm.note.value = d.note || '';
  thtTouched = !!item;
  suggestTht();
  $('#deleteItem').hidden = !item;
  $('#itemDialog').showModal();
  if (!item && !prefill) setTimeout(() => itemForm.name.focus(), 50);
}

// Bekend product gekozen → categorie/eenheid/plek overnemen
itemForm.name.addEventListener('change', () => {
  if (state.editingId) return;
  const n = itemForm.name.value.trim().toLowerCase();
  const prev = state.items.find((i) => i.name.toLowerCase() === n)
    || state.log.find((l) => l.name.toLowerCase() === n && l.category);
  if (prev) {
    itemForm.category.value = prev.category || itemForm.category.value;
    itemForm.unit.value = prev.unit || itemForm.unit.value;
    if (prev.location && !itemForm.location.value) itemForm.location.value = prev.location;
    suggestTht();
  }
});
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
    qty: Number(itemForm.qty.value) || 0,
    unit: itemForm.unit.value,
    category: itemForm.category.value,
    location: itemForm.location.value.trim(),
    frozenAt: itemForm.frozenAt.value,
    bestBefore: itemForm.bestBefore.value || '',
    note: itemForm.note.value.trim(),
  };
  if (!data.name || data.qty <= 0) return;
  $('#itemDialog').close();
  if (state.editingId) {
    await store.updateItem(state.editingId, { ...data, updatedBy: me(), updatedAt: Date.now() });
    toast('Opgeslagen');
  } else {
    const id = await store.addItem({ ...data, addedBy: me(), createdAt: Date.now() });
    await store.addLog({ type: 'in', itemId: id, name: data.name, qty: data.qty, unit: data.unit, category: data.category, by: me(), at: Date.now() });
    toast(`${data.name} toegevoegd`);
  }
});

$('#deleteItem').addEventListener('click', async () => {
  const item = state.items.find((i) => i.id === state.editingId);
  if (!item || !confirm(`"${item.name}" verwijderen zonder het als uitname te registreren?\n\n(Tip: gebruik "Eruit" als je het hebt opgegeten of weggegooid.)`)) return;
  $('#itemDialog').close();
  const { id, ...data } = item;
  await store.deleteItem(id);
  toast('Verwijderd', { label: 'Ongedaan maken', run: () => store.setItem(id, data) });
});

/* ---------------- Uit de vriezer ---------------- */
const takeForm = $('#takeForm');
function openTake(item) {
  state.takingId = item.id;
  $('#takeTitle').textContent = `${item.name} eruit`;
  $('#takeInfo').textContent = `Er ligt nu ${fmtQty(item.qty, item.unit)}${item.location ? ` in ${item.location}` : ''}.`;
  const step = stepFor(item.unit);
  takeForm.qty.max = item.qty;
  takeForm.qty.step = 'any';
  takeForm.qty.value = item.qty <= step ? item.qty : step;
  takeForm.reason.value = 'used';
  $('#takeDialog').showModal();
}

async function takeOut(qty) {
  const item = state.items.find((i) => i.id === state.takingId);
  if (!item) return;
  qty = Math.min(Math.max(Number(qty) || 0, 0), item.qty);
  if (qty <= 0) return;
  $('#takeDialog').close();
  const reason = takeForm.reason.value;
  const { id, ...before } = item;
  const rest = Math.round((item.qty - qty) * 1000) / 1000;
  if (rest > 0) await store.updateItem(id, { qty: rest, updatedBy: me(), updatedAt: Date.now() });
  else await store.deleteItem(id);
  const logId = await store.addLog({ type: 'out', reason, itemId: id, name: item.name, qty, unit: item.unit, category: item.category, by: me(), at: Date.now() });
  toast(rest > 0 ? `${fmtQty(qty, item.unit)} ${item.name} eruit · nog ${fmtQty(rest, item.unit)}` : `${item.name} is op`, {
    label: 'Ongedaan maken',
    run: async () => { await store.setItem(id, before); await store.deleteLog(logId); },
  });
}
takeForm.addEventListener('submit', (e) => { e.preventDefault(); takeOut(takeForm.qty.value); });
$('#takeAll').addEventListener('click', () => {
  const item = state.items.find((i) => i.id === state.takingId);
  if (item) takeOut(item.qty);
});

/* ---------------- Steppers & dialogen ---------------- */
document.addEventListener('click', (e) => {
  const step = e.target.closest('[data-step]');
  if (step) {
    const input = step.parentElement.querySelector('input');
    const form = step.closest('form');
    const unit = form === itemForm ? itemForm.unit.value : state.items.find((i) => i.id === state.takingId)?.unit;
    const s = stepFor(unit) * Number(step.dataset.step);
    let v = Math.round(((Number(input.value) || 0) + s) * 1000) / 1000;
    v = Math.max(v, 0);
    if (input.max) v = Math.min(v, Number(input.max));
    input.value = v;
    return;
  }
  if (e.target.closest('[data-close]')) e.target.closest('dialog').close();
});
// Tik op achtergrond sluit sheet
$$('dialog.sheet').forEach((d) => d.addEventListener('click', (e) => {
  if (e.target === d && d.id !== 'welcomeDialog') d.close();
}));

/* ---------------- Lijst-interactie ---------------- */
$('#stockList').addEventListener('click', (e) => {
  const take = e.target.closest('[data-take]');
  if (take) return openTake(state.items.find((i) => i.id === take.dataset.take));
  const edit = e.target.closest('[data-edit]');
  if (edit) openItem(state.items.find((i) => i.id === edit.dataset.edit));
});
$('#logList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-readd]');
  if (!b) return;
  const l = state.log.find((x) => x.id === b.dataset.readd);
  const existing = state.items.find((i) => i.name.toLowerCase() === l.name.toLowerCase());
  openItem(null, { name: l.name, qty: l.qty, unit: l.unit, category: l.category || existing?.category, location: existing?.location });
});
document.addEventListener('click', (e) => {
  const f = e.target.closest('[data-filter]');
  if (!f) return;
  state.filter = f.dataset.filter;
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
  $('#fab').hidden = name === 'settings';
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
      <p class="small">Stuur deze link naar je partner. Open hem op de telefoon van je partner en jullie delen dezelfde vriezer – wijzigingen zie je direct.</p>
      <div class="code">${esc(link)}</div>
      <button id="shareLink" class="btn primary block">📤 Deel link</button>
      <button id="joinCode" class="btn secondary block">🔗 Koppel met andere link/code</button>
      <p class="muted small">Houd de link privé: iedereen met de link kan de voorraad zien en aanpassen.</p>`;
    $('#shareLink').onclick = async () => {
      const data = { title: 'Onze vriezer', text: 'Hier is de link naar onze vriezer-voorraad:', url: link };
      if (navigator.share) { try { await navigator.share(data); } catch {} }
      else { await navigator.clipboard?.writeText(link); toast('Link gekopieerd'); }
    };
    $('#joinCode').onclick = () => {
      const input = prompt('Plak de link of code van je partner:');
      const m = input?.match(/([a-z0-9]{16,})\s*$/i);
      if (!m) return;
      if (state.items.length && !confirm('Je huidige (eigen) voorraad op dit apparaat wordt niet meegenomen. Doorgaan?')) return;
      ls.set('vv:household', m[1].toLowerCase());
      location.reload();
    };
  } else {
    block.innerHTML = `
      <p class="small">⚠️ De app draait nu in <b>lokale modus</b>: gegevens staan alleen op dit apparaat.</p>
      <p class="small muted">Om samen te synchroniseren moet eenmalig een (gratis) Firebase-project gekoppeld worden in <code>config.js</code>. Zie de README voor de stappen (± 10 minuten).</p>`;
  }

  const durations = ls.get('vv:durations', {});
  $('#durations').innerHTML = CATEGORIES.map((c) => `
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
    const rows = [['Product', 'Aantal', 'Eenheid', 'Categorie', 'Plek', 'In vriezer', 'THT', 'Notitie', 'Toegevoegd door']]
      .concat(filteredItems().map((i) => [i.name, i.qty, i.unit, CAT[i.category]?.label || '', i.location, i.frozenAt, i.bestBefore, i.note, i.addedBy]));
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `vriezer-${today()}.csv`;
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
  store.onItems((items) => { state.items = items; renderStock(); });
  store.onLog((log) => { state.log = log; renderLog(); renderDatalists(); });
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
  // Datumbadges actueel houden als de app lang open staat
  setInterval(renderStock, 60 * 60 * 1000);
}
init();
