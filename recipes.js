// Recepten: ingrediënten uit (ingesproken) tekst halen en vergelijken met de voorraad.
// Pure functies, zonder DOM, zodat ze los te testen zijn.

const NUMBER_WORDS = {
  een: 1, 'één': 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9, tien: 10,
  elf: 11, twaalf: 12, vijftien: 15, twintig: 20, half: 0.5, halve: 0.5, anderhalf: 1.5, anderhalve: 1.5, kwart: 0.25,
};

// Eenheden: canonieke id → schrijfwijzen
const UNIT_ALIASES = {
  gram: ['g', 'gr', 'gram', 'grams', 'grammen'],
  kg: ['kg', 'kilo', 'kilogram', "kilo's"],
  ml: ['ml', 'milliliter', 'mililiter', 'cc'],
  dl: ['dl', 'deciliter'],
  liter: ['l', 'liter', 'liters', 'ltr'],
  el: ['el', 'eetlepel', 'eetlepels', 'eetl', 'eetlepeltje', 'eetlepeltjes'],
  tl: ['tl', 'theelepel', 'theelepels', 'theel', 'theelepeltje', 'theelepeltjes'],
  snuf: ['snuf', 'snufje', 'snufjes', 'mespunt', 'mespuntje', 'beetje', 'klein beetje'],
  scheut: ['scheut', 'scheutje', 'scheutjes', 'flinke scheut'],
  teentjes: ['teen', 'teentje', 'teentjes', 'tenen'],
  blikken: ['blik', 'blikken', 'blikje', 'blikjes'],
  pakken: ['pak', 'pakken', 'pakje', 'pakjes'],
  potten: ['pot', 'potten', 'potje', 'potjes'],
  zakjes: ['zak', 'zakken', 'zakje', 'zakjes'],
  bakjes: ['bak', 'bakje', 'bakjes'],
  flessen: ['fles', 'flessen', 'flesje', 'flesjes'],
  plakken: ['plak', 'plakken', 'plakje', 'plakjes'],
  bos: ['bos', 'bosje', 'bosjes'],
  takjes: ['takje', 'takjes', 'tak', 'takken'],
  stuks: ['stuk', 'stuks', 'stukje', 'stukjes', 'st'],
  porties: ['portie', 'porties'],
  handje: ['hand', 'handje', 'handjes', 'handvol'],
};
const UNIT_LOOKUP = {};
for (const [id, words] of Object.entries(UNIT_ALIASES)) words.forEach((w) => { UNIT_LOOKUP[w] = id; });

// Kleine hoeveelheden (kruiden, olie): niet automatisch op de lijst
export const SMALL_UNITS = ['el', 'tl', 'snuf', 'scheut', 'takjes', 'handje'];
// Omrekenbare families
const FAMILY = {
  gram: ['mass', 1], kg: ['mass', 1000],
  ml: ['vol', 1], dl: ['vol', 100], liter: ['vol', 1000],
};
// Recept-eenheid → eenheid voor de voorraad / boodschappenlijst
const STOCK_UNIT = {
  gram: 'gram', kg: 'kg', ml: 'liter', dl: 'liter', liter: 'liter', blikken: 'blikken', pakken: 'pakken',
  potten: 'potten', zakjes: 'zakjes', bakjes: 'bakjes', flessen: 'flessen', stuks: 'stuks', porties: 'porties',
};

export const UNIT_LABEL = { gram: 'g', kg: 'kg', ml: 'ml', dl: 'dl', liter: 'l', el: 'el', tl: 'tl' };
const UNIT_SINGULAR = { blikken: 'blik', pakken: 'pak', potten: 'pot', zakjes: 'zakje', bakjes: 'bakje', flessen: 'fles',
  plakken: 'plak', teentjes: 'teentje', takjes: 'takje', porties: 'portie' };

const SKIP_WORDS = new Set(['ca', 'ca.', 'circa', 'ongeveer', 'plm', 'zo’n', "zo'n", 'van', 'de', 'het']);

const isNumTok = (t) => /^\d+(?:[.,]\d+)?$/.test(t) || /^\d+\/\d+$/.test(t) || /^\d+(?:[.,]\d+)?-\d+(?:[.,]\d+)?$/.test(t);
function numOf(t) {
  if (t in NUMBER_WORDS) return NUMBER_WORDS[t];
  if (/^\d+\/\d+$/.test(t)) { const [a, b] = t.split('/').map(Number); return b ? a / b : a; }
  const first = t.split('-')[0];
  return Number(first.replace(',', '.'));
}

function tokenize(text) {
  return text
    .replace(/½/g, ' 1/2 ').replace(/¼/g, ' 1/4 ').replace(/¾/g, ' 3/4 ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/(\d)([a-zA-Z])/g, '$1 $2') // 200g → 200 g
    .replace(/[•*·–—]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^[.:]+|[.:]+$/g, ''))
    .filter(Boolean);
}

// Splits een stuk ingesproken tekst zonder komma's: "200 gram kip 1 ui 2 teentjes knoflook"
function splitDictation(tokens) {
  const segs = [];
  let cur = [], hasName = false, hasNum = false, startsWithNum = false;
  tokens.forEach((t, idx) => {
    const isNum = isNumTok(t) || (t in NUMBER_WORDS && idx < tokens.length - 1);
    const fraction = /^\d+\/\d+$/.test(t) && cur.length === 1 && hasNum;
    // nieuw ingrediënt bij een getal, tenzij de hoeveelheid achteraan staat ("kipfilet 300 gram")
    // ook een eenheid direct na een naam begint een nieuw ingrediënt: "… kookroom snufje zout"
    const unitAfterName = !isNum && t in UNIT_LOOKUP && hasName && startsWithNum && !isNumTok(cur[cur.length - 1]);
    if (unitAfterName || (isNum && !fraction && cur.length && ((hasName && startsWithNum) || (hasNum && !hasName)))) {
      segs.push(cur); cur = []; hasName = false; hasNum = false;
    }
    if (!cur.length) startsWithNum = isNum;
    cur.push(t);
    if (isNum) hasNum = true;
    else if (!(t in UNIT_LOOKUP)) hasName = true;
  });
  if (cur.length) segs.push(cur);
  // segment zonder naam (bijv. "400 gram" na "1 blik tomaten") → bij vorige voegen
  const out = [];
  segs.forEach((s) => {
    const named = s.some((t) => !isNumTok(t) && !(t in NUMBER_WORDS) && !(t in UNIT_LOOKUP));
    if (!named && out.length) return;
    out.push(s);
  });
  return out;
}

function parseSegment(tokens, raw) {
  let toks = tokens.filter((t) => !SKIP_WORDS.has(t));
  let qty = null, unit = null;
  // hoeveelheid vooraan
  if (toks.length && (isNumTok(toks[0]) || toks[0] in NUMBER_WORDS)) {
    qty = numOf(toks.shift());
    // "1 1/2"
    if (toks.length && /^\d+\/\d+$/.test(toks[0])) qty += numOf(toks.shift());
  }
  // eenheid (ook twee woorden, bijv. "klein beetje")
  if (toks.length > 1 && UNIT_LOOKUP[`${toks[0]} ${toks[1]}`]) { unit = UNIT_LOOKUP[`${toks[0]} ${toks[1]}`]; toks.splice(0, 2); }
  else if (toks.length > 1 && UNIT_LOOKUP[toks[0]]) { unit = UNIT_LOOKUP[toks.shift()]; }
  // hoeveelheid achteraan: "kipfilet 200 gram"
  if (qty === null && toks.length >= 2) {
    const n = toks.length;
    if (UNIT_LOOKUP[toks[n - 1]] && (isNumTok(toks[n - 2]) || toks[n - 2] in NUMBER_WORDS)) {
      unit = UNIT_LOOKUP[toks[n - 1]]; qty = numOf(toks[n - 2]); toks = toks.slice(0, n - 2);
    } else if (isNumTok(toks[n - 1])) { qty = numOf(toks[n - 1]); toks = toks.slice(0, n - 1); }
  }
  let name = toks.join(' ').replace(/^(van|met)\s+/, '').replace(/[,.;:]+$/, '').trim();
  if (/naar smaak|optioneel/.test(name)) { name = name.replace(/\s*(naar smaak|optioneel)\s*/g, ' ').trim(); unit = unit || 'snuf'; }
  if (!name) return null;
  return { qty: qty ?? 1, unit: unit || 'stuks', name, raw: raw.trim() };
}

export function parseIngredients(text) {
  const parts = String(text || '')
    .split(/\n|;|,(?!\d)|(?<!\d),|\s+en\s+(?=\d)/)
    .map((s) => s.trim())
    .filter(Boolean);
  const result = [];
  parts.forEach((part) => {
    const tokens = tokenize(part);
    splitDictation(tokens).forEach((seg) => {
      const ing = parseSegment(seg, seg.join(' '));
      if (ing) result.push(ing);
    });
  });
  return result;
}

export function ingredientToText(i) {
  const q = Number(i.qty);
  const qs = Number.isInteger(q) ? String(q) : String(Math.round(q * 100) / 100).replace('.', ',');
  const u = UNIT_LABEL[i.unit] || (q <= 1 && UNIT_SINGULAR[i.unit]) || i.unit;
  const unit = i.unit === 'stuks' ? '' : ` ${u}`;
  return `${qs}${unit} ${i.name}`;
}

/* ---------------- Matchen met de voorraad ---------------- */
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const stem = (w) => w.replace(/(tjes|jes|je|en|s|e)$/, '') || w;
const stems = (s) => norm(s).split(' ').filter((w) => w.length > 1).map(stem);

function nameScore(ingName, itemName) {
  const a = stems(ingName), b = stems(itemName);
  if (!a.length || !b.length) return 0;
  if (a.join(' ') === b.join(' ')) return 3;
  const contains = (x, y) => y.every((w) => x.some((v) => v === w || (w.length >= 4 && v.endsWith(w))));
  if (contains(a, b)) return 2; // "geraspte kaas" bevat "kaas"; "olijfolie" eindigt op "olie"
  if (contains(b, a)) return 1; // item "kipfilet blokjes" bevat "kipfilet"
  return 0;
}

export function findMatches(ingName, items) {
  let best = 0; const out = [];
  items.forEach((it) => {
    const s = nameScore(ingName, it.name);
    if (!s) return;
    if (s > best) { best = s; out.length = 0; }
    if (s === best) out.push(it);
  });
  return out;
}

export function convert(qty, from, to) {
  if (from === to) return qty;
  const a = FAMILY[from], b = FAMILY[to];
  if (a && b && a[0] === b[0]) return (qty * a[1]) / b[1];
  return null;
}

// Status van één ingrediënt t.o.v. de voorraad (factor = personen / recept-personen)
export function checkIngredient(ing, items, factor = 1) {
  const need = ing.qty * factor;
  const small = SMALL_UNITS.includes(ing.unit) || ing.unit === 'snuf' || ing.unit === 'scheut';
  const matches = findMatches(ing.name, items).filter((it) => it.qty > 0);
  const allMatches = findMatches(ing.name, items);
  if (!matches.length) {
    return { status: small ? 'basic' : 'missing', need, missing: need, matches: allMatches };
  }
  let have = 0, comparable = false;
  matches.forEach((m) => { const c = convert(m.qty, m.unit, ing.unit); if (c !== null) { have += c; comparable = true; } });
  if (!comparable || small) return { status: 'ok', need, missing: 0, matches, approx: !comparable };
  if (have + 1e-9 >= need) return { status: 'ok', need, missing: 0, matches, have };
  return { status: 'short', need, missing: need - have, matches, have };
}

// Wat moet er op de boodschappenlijst voor een ontbrekend ingrediënt?
export function toShopping(ing, missing, existing) {
  if (existing) {
    const c = convert(missing, ing.unit, existing.unit);
    if (c !== null) return { unit: existing.unit, qty: roundUp(c, existing.unit) };
    return { unit: existing.unit, qty: 1 };
  }
  const unit = STOCK_UNIT[ing.unit];
  if (!unit) return { unit: 'stuks', qty: 1 }; // teentjes, el, bos… → 1 stuk kopen
  const c = convert(missing, ing.unit, unit) ?? missing;
  return { unit, qty: roundUp(c, unit) };
}
function roundUp(q, unit) {
  if (unit === 'gram') return Math.ceil(q / 50) * 50;
  if (unit === 'kg' || unit === 'liter') return Math.ceil(q * 10) / 10;
  return Math.max(1, Math.ceil(q - 1e-9));
}

// Hoeveel van een voorraad-item af te boeken na het koken (in de eenheid van het item)
export function cookAmount(ing, item, factor = 1) {
  if (SMALL_UNITS.includes(ing.unit)) return 0;
  const c = convert(ing.qty * factor, ing.unit, item.unit);
  if (c === null) return ing.unit === 'stuks' && ['stuks', 'porties'].includes(item.unit) ? Math.min(item.qty, Math.ceil(ing.qty * factor)) : 0;
  return Math.min(item.qty, Math.round(c * 1000) / 1000);
}
