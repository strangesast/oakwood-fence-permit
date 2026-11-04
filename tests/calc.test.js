import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate, defaults as d } from '../src/calc.js';

const group = (groups, length) => groups.find((g) => g.length === length)?.qty || 0;

const assertSameBom = (a, b) => {
  for (const key of [
    'posts',
    'bays',
    'pickets',
    'postGroups',
    'railGroups',
    'bags',
    'picketScrews',
    'railScrews',
  ]) {
    assert.deepEqual(a[key], b[key], key);
  }
};

test('default configuration and split boundary equivalences', () => {
  const r = calculate(d);
  assert.equal(r.posts, 18);
  assert.equal(r.bays, 17);
  assert.equal(r.bags, 81);
  assert.equal(r.pickets[0].buy, 296);
  assert.equal(r.railGroups[0].qty, 51);

  assertSameBom(calculate({ ...d, em: 'split', et: d.east }), r);
  assertSameBom(calculate({ ...d, nm: 'split', nt: d.north }), r);
  assertSameBom(calculate({ ...d, em: 'split', nm: 'split', et: d.east, nt: d.north }), r);

  assertSameBom(calculate({ ...d, em: 'split', et: 0 }), calculate({ ...d, em: '4' }));
  assertSameBom(calculate({ ...d, nm: 'split', nt: 0 }), calculate({ ...d, nm: '4' }));
  assertSameBom(
    calculate({ ...d, em: 'split', nm: 'split', et: 0, nt: 0 }),
    calculate({ ...d, em: '4', nm: '4' })
  );
});

test('all-4, split transitions, shared corner posts, fractional bays, and zero runs', () => {
  let r = calculate({ ...d, em: '4', nm: '4' });
  assert.equal(group(r.postGroups, 8), 18);
  assert.equal(group(r.pickets, 4), 269);
  assert.equal(group(r.railGroups, 8), 34);
  assert.equal(r.cornerHeight, 4);

  r = calculate({ ...d, em: 'split', et: 40 });
  assert.equal(r.posts, 18);
  assert.equal(group(r.postGroups, 10), 12);
  assert.equal(group(r.postGroups, 8), 6);
  assert.equal(group(r.pickets, 6), 179);
  assert.equal(group(r.pickets, 4), 91);
  assert.equal(group(r.railGroups, 8), 45);
  assert.equal(r.runs[0].posts.filter((p) => p.isTransition).length, 1);
  assert.equal(r.runs[0].posts.find((p) => p.isTransition).distance, 40);
  assert.equal(r.runs[0].posts.find((p) => p.isTransition).height, 6);

  r = calculate({ ...d, em: 'split', et: 40.75 });
  assert.equal(r.posts, 19);
  assert.equal(r.bays, 18);
  assert.equal(r.bags, 86);

  r = calculate({ ...d, east: 0, north: 0, em: 'split', nm: 'split' });
  assert.equal(r.posts, 0);
  assert.equal(r.bags, 0);
  assert.equal(r.pickets.length, 0);

  r = calculate({ ...d, north: 0, em: 'split', et: 40 });
  assert.equal(r.posts, 12);
  assert.equal(group(r.postGroups, 10), 6);
  assert.equal(group(r.postGroups, 8), 6);

  r = calculate({ ...d, em: '4', nm: '6' });
  assert.equal(group(r.postGroups, 10), 7);
  assert.equal(group(r.postGroups, 8), 11);
  assert.equal(r.cornerHeight, 6);
});

test('288 mixed boundary configurations maintain invariants', () => {
  let count = 0;
  for (const e of [0, 0.5, 7.99, 8, 8.01, 40.75, 81.5, 101.5]) {
    for (const n of [0, 5, 41.5, 61.5]) {
      for (const em of ['4', '6', 'split']) {
        for (const nm of ['4', '6', 'split']) {
          count++;
          const v = { ...d, east: e, north: n, em, nm, et: e / 2, nt: n / 2 };
          const r = calculate(v);
          assert.equal(r.errors.length, 0);
          assert.equal(
            r.posts,
            r.runs.reduce((a, x) => a + x.posts.length, 0) + (r.runs.length ? 1 : 0)
          );
          assert.equal(
            r.posts,
            r.postGroups.reduce((a, g) => a + g.qty, 0)
          );
          assert.equal(
            r.pickets.reduce((a, g) => a + g.qty, 0),
            r.runs.reduce((a, x) => a + x.pickets, 0)
          );
          for (const run of r.runs) {
            assert(Math.abs(run.segments.reduce((a, s) => a + s.length, 0) - run.length) < 1e-8);
            for (const s of run.segments) {
              assert(s.bayLength <= v.spacing + 1e-8);
              assert(s.railStock >= s.bayLength);
              assert.equal(s.rails, s.height === 6 ? v.rails6 : v.rails4);
            }
            const distances = run.posts.map((p) => p.distance.toFixed(9));
            assert.equal(new Set(distances).size, distances.length);
          }
        }
      }
    }
  }
  assert.equal(count, 288);
});

test('validation rejects invalid construction and boundary inputs', () => {
  assert(calculate({ ...d, depth: 6 }).errors.length > 0);
  assert(calculate({ ...d, spacing: 0 }).errors.length > 0);
  assert(calculate({ ...d, spacing: 0.25 }).errors.length > 0);
  assert(calculate({ ...d, east: 102 }).errors.length > 0);
  assert(calculate({ ...d, north: 62 }).errors.length > 0);
  assert(calculate({ ...d, east: -1 }).errors.length > 0);
  assert(calculate({ ...d, waste: 105 }).errors.length > 0);
  assert(calculate({ ...d, diameter: 4, post: 3.5 }).errors.length > 0);
  assert(calculate({ ...d, rails6: 2.5 }).errors.length > 0);
  assert(calculate({ ...d, em: 'invalid' }).errors.length > 0);
  assert(calculate({ ...d, east: Number.NaN }).errors.length > 0);
});
