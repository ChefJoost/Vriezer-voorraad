// Draai met: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usageStats, predictRunOut, suggestBuy, pickCounts, monthStats, recipeScore, DAY } from '../insights.js';
import { parseIngredients, ingredientToText, checkIngredient } from '../recipes.js';

const NOW = Date.UTC(2026, 10, 9, 12);
const ev = (daysAgo, type, qty, extra = {}) => ({ name: 'Pindakaas', unit: 'potten', type, qty, at: NOW - daysAgo * DAY, ...extra });

test('verbruik: 1 pot per week over 4 weken → ~1/week, voorspelling klopt', () => {
  const log = [ev(28, 'in', 4), ev(21, 'out', 1), ev(14, 'out', 1), ev(7, 'out', 1), ev(0.5, 'out', 1)];
  const s = usageStats(log, { name: 'Pindakaas', unit: 'potten', qty: 1 }, NOW);
  assert.ok(Math.abs(s.perWeek - 1) < 0.01, `perWeek=${s.perWeek}`);
  assert.equal(predictRunOut({ qty: 1 }, s), 7);
  assert.equal(suggestBuy({ unit: 'potten' }, s), 1);
});

test('verbruik: te weinig gegevens → geen voorspelling', () => {
  assert.equal(usageStats([ev(3, 'in', 2), ev(1, 'out', 1)], { name: 'Pindakaas', unit: 'potten', qty: 1 }, NOW), null);
  assert.equal(usageStats([ev(3, 'out', 1), ev(1, 'out', 1)], { name: 'Pindakaas', unit: 'potten', qty: 1 }, NOW), null, '< 7 dagen');
});

test('verbruik: weggegooid telt niet als verbruik, andere eenheid ook niet', () => {
  const log = [ev(20, 'in', 4), ev(15, 'out', 1), ev(10, 'out', 1, { reason: 'trashed' }), ev(5, 'out', 500, { unit: 'gram' }), ev(2, 'out', 1)];
  const s = usageStats(log, { name: 'pindakaas', unit: 'potten', qty: 1 }, NOW);
  assert.ok(Math.abs(s.perDay - 2 / 20) < 1e-9);
});

test('voorspelling: genoeg voorraad → niet op de lijst', () => {
  assert.equal(predictRunOut({ qty: 10 }, { daysLeft: 70 }), null);
  assert.equal(predictRunOut({ qty: 0 }, { daysLeft: 0 }), null);
});

test('natellen: lang niet geteld en veel mutaties eerst; recent geteld overslaan', () => {
  const items = [
    { id: 'a', name: 'Rijst', qty: 2, createdAt: NOW - 30 * DAY },
    { id: 'b', name: 'Kipfilet', qty: 4, createdAt: NOW - 30 * DAY },
    { id: 'c', name: 'Melk', qty: 1, checkedAt: NOW - 2 * DAY },
    { id: 'd', name: 'Op', qty: 0, createdAt: NOW - 30 * DAY },
  ];
  const log = [1, 2, 3].map((d) => ({ itemId: 'b', name: 'Kipfilet', type: 'out', qty: 1, at: NOW - d * DAY }));
  const picked = pickCounts(items, log, NOW, 3).map((i) => i.id);
  assert.deepEqual(picked, ['b', 'a']);
});

test('meetlat: nauwkeurigheid en verspilling', () => {
  const log = [
    { type: 'count', match: true, at: NOW - DAY }, { type: 'count', match: true, at: NOW - DAY },
    { type: 'count', match: false, at: NOW - DAY }, { type: 'count', match: false, at: NOW - 40 * DAY },
    { type: 'out', reason: 'trashed', name: 'Sla', at: NOW - 3 * DAY },
    { type: 'out', reason: 'used', name: 'Rijst', at: NOW - 3 * DAY },
  ];
  const m = monthStats(log, NOW);
  assert.equal(m.counts, 3);
  assert.ok(Math.abs(m.accuracy - 2 / 3) < 1e-9);
  assert.equal(m.trashed, 1);
  assert.deepEqual(m.trashedNames, ['Sla']);
});

test('wat eten we: recept met bijna-verlopen ingrediënt scoort hoger', () => {
  const items = [
    { name: 'Kookroom', qty: 0.25, unit: 'liter', bestBefore: 'soon' },
    { name: 'Pasta', qty: 1, unit: 'pakken' },
    { name: 'Rijst', qty: 1, unit: 'pakken' },
    { name: 'Kipfilet', qty: 2, unit: 'stuks' },
  ];
  const daysLeft = (i) => (i.bestBefore === 'soon' ? 2 : null);
  const rows = (txt) => parseIngredients(txt).map((ing) => checkIngredient(ing, items, 1));
  const a = recipeScore(rows('1 pak pasta, 250 ml kookroom, 2 kipfilet'), daysLeft);
  const b = recipeScore(rows('1 pak rijst, 2 kipfilet'), daysLeft);
  assert.ok(a.score > b.score, `${a.score} > ${b.score}`);
  assert.equal(a.usesSoon[0].item.name, 'Kookroom');
});

test('ingrediënten: ingesproken tekst zonder komma\'s', () => {
  const r = parseIngredients('200 gram kipfilet 1 ui twee teentjes knoflook 1 blik tomatenblokjes 400 gram een snufje zout').map(ingredientToText);
  assert.deepEqual(r, ['200 g kipfilet', '1 ui', '2 teentjes knoflook', '1 blik tomatenblokjes', '1 snuf zout']);
  assert.deepEqual(parseIngredients('kipfilet 300 gram, 1,5 kg aardappelen').map(ingredientToText), ['300 g kipfilet', '1,5 kg aardappelen']);
});
