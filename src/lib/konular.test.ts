// node --test src/lib/konular.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { konulariCoz, konuSirasi } from './konular.ts';

test('konu satirlari agirlikla cozulur', () => {
  const k = konulariCoz('Matematik x2\nTürkçe\n  Tarih × 3  \n\nCoğrafya*2');
  assert.deepEqual(k, [
    { ad: 'Matematik', agirlik: 2 },
    { ad: 'Türkçe', agirlik: 1 },
    { ad: 'Tarih', agirlik: 3 },
    { ad: 'Coğrafya', agirlik: 2 },
  ]);
});

test('bos satirlar atlanir', () => {
  assert.deepEqual(konulariCoz('\n\n  \n'), []);
});

test('esit agirlikta sira donusumlu', () => {
  const s = konuSirasi([
    { ad: 'A', agirlik: 1 },
    { ad: 'B', agirlik: 1 },
  ]);
  assert.equal(s.length, 2);
  assert.deepEqual([...new Set(s)].sort(), ['A', 'B']);
});

test('agirlikli konu daha sik gelir ama yigilmaz', () => {
  const s = konuSirasi([
    { ad: 'A', agirlik: 2 },
    { ad: 'B', agirlik: 1 },
  ]);
  assert.equal(s.length, 3);
  assert.equal(s.filter((x) => x === 'A').length, 2);
  assert.equal(s.filter((x) => x === 'B').length, 1);
  // Ayni konu ust uste iki kez gelmemeli
  assert.notEqual(s[0], s[1], `yigilma var: ${s.join(',')}`);
});
