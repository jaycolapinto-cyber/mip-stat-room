// The power-ranking arithmetic, checked by hand on games small enough to do on paper.
import { replayElo, playOrder, parseSeasonStart, computePower } from './power.mjs';

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { cond ? pass++ : (fail++, console.log('  FAIL:', name, extra)); };
const near = (x, y) => Math.abs(x - y) < 1e-9;

// Equal teams, 11-9: expected 0.5, margin 2 -> x(1 + 2/11); winners +24*0.5*13/11 each.
{
  const r = replayElo([{ date: '2026-01-01', a: ['p', 'q'], b: ['r', 's'], sa: 11, sb: 9 }]);
  const d = 24 * 0.5 * (1 + 2 / 11);
  t('equal teams: winners gain K/2 x margin', near(r.get('p'), 1500 + d) && near(r.get('q'), 1500 + d), String(r.get('p')));
  t('equal teams: losers lose the same', near(r.get('r'), 1500 - d) && near(r.get('s'), 1500 - d));
}
// A blowout is capped at x1.5: 11-0 would be x2 uncapped.
{
  const r = replayElo([{ date: '2026-01-01', a: ['p', 'q'], b: ['r', 's'], sa: 0, sb: 11 }]);
  t('blowout multiplier caps at 1.5', near(r.get('r'), 1500 + 24 * 0.5 * 1.5));
}
// Team rating is the AVERAGE: (1600+1400)/2 = 1500 against 1500 is an even game.
{
  const games = [
    { date: '2026-01-01', a: ['hi', 'x1'], b: ['x2', 'x3'], sa: 11, sb: 0 },
  ];
  const r = replayElo(games);
  t('ratings move both partners by the same amount', near(r.get('hi') - 1500, r.get('x1') - 1500));
  const total = [...r.values()].reduce((s, v) => s + v, 0);
  t('zero-sum: total rating is unchanged', near(total, 4 * 1500));
}
// Replay order: by date, then by the Scoreholio clock.
{
  const o = playOrder([
    { id: 'c', date: '2026-01-02', ts: 1 }, { id: 'b', date: '2026-01-01', ts: 9 }, { id: 'a', date: '2026-01-01', ts: 3 },
  ]);
  t('games replay by date, then clock', o.map((m) => m.id).join('') === 'abc', o.map((m) => m.id).join(''));
}
t('season start reads Dave\'s grid header', parseSeasonStart('MIP Updated Head-to-Head Grid — Start Date: 9/7/26') === '2026-09-07');

// Ranking: 20+ games this season and one in the last 30 days; arrows from a replay 7 days earlier.
{
  const games = [];
  const day = (n) => new Date(Date.UTC(2026, 8, 7 + n)).toISOString().slice(0, 10);
  for (let i = 0; i < 24; i++) games.push({ date: day(i), ts: i, a: ['ace', 'bo'], b: ['cy', 'di'], sa: 11, sb: 5 });
  games.push({ date: day(24), ts: 99, a: ['cy', 'di'], b: ['ace', 'bo'], sa: 11, sb: 2 });
  const players = ['ace', 'bo', 'cy', 'di'].map((id) => ({ id, leagues: [] }));
  const r = computePower({ matches: games, players, leagues: [], gridStart: 'Start Date: 9/7/26' });
  const p = (id) => r.players.get(id).power;
  t('everyone with 20+ season games and a recent game is ranked', r.power.rankedCount === 4, String(r.power.rankedCount));
  t('the winners rank first', [p('ace').rank, p('bo').rank].sort().join() === '1,2');
  t('this week counts only the last 7 days', p('cy').weekRecord.w === 1 && p('cy').weekRecord.l === 6, JSON.stringify(p('cy').weekRecord));
  t('as of = newest game date', r.power.asOf === day(24));
}

console.log(`${pass} passed, ${fail} failed   (power rankings)`);
process.exit(fail ? 1 : 0);
