import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HINDI_KEYS, KEYS, t } from '../js/lib/strings.js';
import { buildRoute, routeProgress } from '../js/lib/route.js';
import { streakNote } from '../js/components/rail.js';
import { matchLabel } from '../js/lib/match-label.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const pageKeys = [...html.matchAll(/data-i18n(?:-placeholder|-label)?="([^"]+)"/g)].map((m) => m[1]);

test('every label in index.html has English and Hindi text', () => {
  assert.ok(pageKeys.length > 100, `only ${pageKeys.length} labels are translated`);
  assert.deepEqual(pageKeys.filter((key) => !KEYS.includes(key)), []);
  assert.deepEqual(pageKeys.filter((key) => !HINDI_KEYS.includes(key)), []);
});

test('Hindi sentences end with "।", never "."', () => {
  const dotted = HINDI_KEYS.filter((key) => /[^.]\.$/.test(t(key, 'hindi').trim()));
  assert.deepEqual(dotted, []);
  assert.equal(t('punct.stop', 'hindi'), '।');
  assert.equal(t('punct.stop', 'english'), '.');
});

test('Today\'s route, the streak card and Ask labels speak Hindi', () => {
  const steps = buildRoute({ mastery: [{ topic_id: 1, topic_name: 'Precision', mastery_score: 20 }], cardsDue: 2, language: 'hindi' });
  assert.equal(steps[0].title, 'झटपट याद');
  assert.equal(steps[1].sub, 'Precision, आवाज़ सत्र में');
  assert.equal(steps[1].topic, 'Precision');
  assert.equal(routeProgress({ recall: true }, 'hindi').label, '3 में से 1 कदम पूरे');
  assert.equal(streakNote(4, 'hindi'), 'लगातार 4 दिन। इसे जारी रखें।');
  assert.equal(matchLabel('general', 'hindi').text, 'सामान्य जवाब: आपके नोट्स से नहीं');
  assert.equal(buildRoute({ cardsDue: 1 })[2].sub, '1 card due today');   // English stays as it was
});
