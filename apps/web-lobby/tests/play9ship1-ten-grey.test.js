import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { cardFaceHtml } from '../src/features/table/doudizhu-table-view.js';
import { RANK_LABEL } from '../src/jj/card.js';
import { evaluatePlaySelection, shouldDisablePlayButton } from '../src/net/ddz-play-validate.js';
import { parseHand, canBeat } from '../src/jj/rules.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(root, '../index.html'), 'utf8');
const jjCss = readFileSync(path.join(root, '../src/jj-table.css'), 'utf8');
const tpCss = readFileSync(path.join(root, '../src/table-play.css'), 'utf8');
const appSrc = readFileSync(path.join(root, '../src/app.js'), 'utf8');
const orientSrc = readFileSync(path.join(root, '../src/net/table-orient.js'), 'utf8');
const viewSrc = readFileSync(path.join(root, '../src/features/table/doudizhu-table-view.js'), 'utf8');

test('play9ship1 cache bust on CSS + app.js', () => {
  assert.match(html, /app\.js\?v=play9ship1/);
  assert.match(html, /jj-table\.css\?v=play9ship1/);
  assert.match(html, /table-play\.css\?v=play9ship1/);
  assert.match(html, /hand-fit\.css\?v=play9ship1/);
  assert.doesNotMatch(html, /\?v=play9fix1/);
  assert.match(appSrc, /\?v=play9ship1/);
});

test('RANK_LABEL[10] stays "10" and cardFaceHtml marks pc-rank--ten', () => {
  assert.equal(RANK_LABEL[10], '10');
  const html10 = cardFaceHtml({ rank: 10, suit: 2 });
  assert.match(html10, /pc-rank--ten/);
  assert.match(html10, />10</);
  assert.doesNotMatch(html10, />1</);
  const html9 = cardFaceHtml({ rank: 9, suit: 0 });
  assert.doesNotMatch(html9, /pc-rank--ten/);
  assert.match(html9, />9</);
});

test('CSS compresses ten rank + greys disabled playButton', () => {
  assert.match(jjCss, /pc-rank--ten/);
  assert.match(jjCss, /scaleX\(0\.88\)/);
  assert.match(jjCss, /letter-spacing:\s*-0\.08em/);
  assert.match(jjCss, /#playButton:disabled/);
  assert.match(jjCss, /aria-disabled="true"/);
  assert.match(jjCss, /grayscale/);
  assert.match(tpCss, /pc-rank--ten/);
  assert.match(tpCss, /#playButton:disabled/);
  assert.match(tpCss, /box-shadow:\s*none/);
});

test('app syncs play button after render + clears pulse on illegal', () => {
  assert.match(appSrc, /play9ship1: re-sync after action-bar/);
  assert.match(appSrc, /if \(game\.phase === 'play'\)[\s\S]*syncPlayButtonFromSelection/);
  assert.match(appSrc, /classList\.remove\('pulse-hint'\)/);
  assert.match(appSrc, /is-ten/);
  assert.match(viewSrc, /pc-rank--ten/);
});

test('illegal/empty selection must disable play button helper', () => {
  const c = (id, rank, suit = 0) => ({ id, rank, suit });
  const illegal = evaluatePlaySelection({
    selectedCards: [c('a', 14), c('t', 10)],
    lastPlay: null,
    parseHand,
    canBeat,
  });
  assert.equal(illegal.allowPlay, false);
  assert.equal(shouldDisablePlayButton(illegal), true);
});

test('regression guard: no rotate90 on tableView / upright transform none', () => {
  assert.doesNotMatch(orientSrc, /setProperty\([^)]*rotate\(/);
  assert.match(orientSrc, /transform", "none"/);
  assert.match(orientSrc, /table-stage-upright/);
  assert.match(appSrc, /z-index', '220'/);
  assert.match(appSrc, /shouldIgnoreMouseAfterTouch/);
  assert.match(orientSrc, /1500/);
});
