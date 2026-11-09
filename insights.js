// Inzichten uit de geschiedenis: verbruik voorspellen, natellen (cycle counting)
// en wat er wordt weggegooid. Pure functies, los te testen met node.

export const DAY = 86400000;
const key = (s) => String(s || '').trim().toLowerCase();

// Vraagplanning: gemiddeld verbruik per dag uit de geschiedenis (max. 60 dagen terug).
// Pas een voorspelling als er minstens 2 keer iets is gebruikt over minstens 7 dagen.
export function usageStats(log, item, now = Date.now()) {
  const k = key(item.name);
  const events = log.filter((l) => key(l.name) === k && l.unit === item.unit && (l.type === 'in' || l.type === 'out'));
  const used = events.filter((l) => l.type === 'out' && l.reason !== 'trashed');
  if (used.length < 2) return null;
  const first = Math.min(...events.map((e) => e.at));
  const start = Math.max(first, now - 60 * DAY);
  const days = (now - start) / DAY;
  if (days < 7) return null;
  const total = used.filter((u) => u.at >= start).reduce((s, u) => s + (Number(u.qty) || 0), 0);
  if (total <= 0) return null;
  const perDay = total / days;
  return { perDay, perWeek: perDay * 7, daysLeft: item.qty / perDay, uses: used.length };
}

// Raakt dit product binnen `horizon` dagen op (en staat het nog niet op de lijst)?
export function predictRunOut(item, stats, horizon = 7) {
  if (!stats || !(item.qty > 0)) return null;
  const days = Math.max(0, Math.round(stats.daysLeft));
  return days > horizon ? null : days;
}

// Hoeveel kopen om weer een week vooruit te kunnen?
export function suggestBuy(item, stats) {
  const week = stats.perWeek;
  if (item.unit === 'gram') return Math.max(100, Math.ceil(week / 100) * 100);
  if (item.unit === 'kg' || item.unit === 'liter') return Math.max(0.5, Math.ceil(week * 2) / 2);
  return Math.max(1, Math.ceil(week));
}

// Cycle counting: kies dagelijks een paar producten om na te tellen.
// Voorrang: lang niet geteld en veel mutaties sinds de laatste telling.
export function pickCounts(items, log, now = Date.now(), n = 3, minGapDays = 14) {
  return items
    .filter((i) => i.qty > 0 && (!i.checkedAt || now - i.checkedAt > minGapDays * DAY))
    .map((i) => {
      const since = i.checkedAt || i.createdAt || 0;
      const moves = log.filter((l) => (l.itemId === i.id || key(l.name) === key(i.name)) && l.at > since && l.type !== 'count').length;
      const ageWeeks = (now - since) / (7 * DAY);
      return { item: i, score: moves * 2 + Math.min(ageWeeks, 8) };
    })
    .sort((a, b) => b.score - a.score || key(a.item.name).localeCompare(key(b.item.name)))
    .slice(0, n)
    .map((x) => x.item);
}

// Meetlat: nauwkeurigheid van de voorraad en verspilling over een periode
export function monthStats(log, now = Date.now(), days = 30) {
  const from = now - days * DAY;
  const recent = log.filter((l) => l.at >= from);
  const counts = recent.filter((l) => l.type === 'count');
  const ok = counts.filter((c) => c.match).length;
  const trashed = recent.filter((l) => l.type === 'out' && l.reason === 'trashed');
  const usedMap = new Map();
  recent.filter((l) => l.type === 'out' && l.reason !== 'trashed').forEach((l) => {
    const k = key(l.name);
    const cur = usedMap.get(k) || { name: l.name, n: 0 };
    cur.n += 1; usedMap.set(k, cur);
  });
  return {
    counts: counts.length,
    accuracy: counts.length ? ok / counts.length : null,
    trashed: trashed.length,
    trashedNames: [...new Set(trashed.map((t) => t.name))],
    topUsed: [...usedMap.values()].sort((a, b) => b.n - a.n).slice(0, 3),
  };
}

// "Wat eten we?": recepten die opmaken wat het eerst over datum gaat (FEFO)
// rows = uitkomst van checkIngredient per ingrediënt; daysLeftOf(item) → dagen tot THT of null
export function recipeScore(rows, daysLeftOf, soonDays = 14) {
  const relevant = rows.filter((r) => r.status !== 'basic');
  if (!relevant.length) return null;
  const okRows = relevant.filter((r) => r.status === 'ok');
  const coverage = okRows.length / relevant.length;
  const usesSoon = [];
  okRows.concat(relevant.filter((r) => r.status === 'short')).forEach((r) => {
    r.matches.forEach((m) => {
      const d = daysLeftOf(m);
      if (d !== null && d <= soonDays) usesSoon.push({ item: m, days: d });
    });
  });
  const urgency = usesSoon.reduce((s, u) => s + (soonDays + 1 - Math.max(u.days, 0)), 0);
  const missing = relevant.length - okRows.length;
  return { score: urgency * 2 + coverage * 10 - missing * 3, coverage, missing, usesSoon };
}
