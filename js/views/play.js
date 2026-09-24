import { h } from '../dom.js';
import { HINT_COST } from '../game.js';
import { answerText, stageLabel, refText } from './common.js';
import { renderChoice } from '../questions/choice.js';
import { renderOx } from '../questions/ox.js';
import { renderOrder } from '../questions/order.js';
import { renderMatch } from '../questions/match.js';

const RENDER = { mcq: renderChoice, blank: renderChoice, ox: renderOx, order: renderOrder, match: renderMatch };
const MODE_LABEL = { stage: '스테이지', boss: '👑 보스전', retry: '틀린 문제 다시', review: '📕 오답 복습' };

// 질문 속 부정 표현을 굵게 강조한다. 문자열을 조각내 정적 <strong>과 텍스트 노드로만 조립한다(설계 §6.8).
const NEG = /(옳지 않은|아닌|틀린)/;
function questionText(text) {
  return text.split(NEG).map((part) => (NEG.test(part) ? h('strong', { class: 'neg' }, part) : part));
}

function passageBox(q) {
  if (!q.passage) return null;
  const label = q.passageLabel === '보기' ? '〈보기〉' : '📜 자료';
  return h('figure', { class: `passage ${q.passageLabel === '보기' ? 'boxed' : 'source'}` },
    h('figcaption', {}, label),
    h('div', { class: 'passage-body' }, q.passage));
}

const cellState = (r) => (r.answer === null ? 'todo' : r.correct ? 'ok' : 'no');
const cellMark = (r) => ({ todo: '', ok: '✓', no: '✗' })[cellState(r)] + (r.flag ? '★' : '');
const cellName = (r) => ({ todo: '안 풂', ok: '정답', no: '오답' })[cellState(r)] + (r.flag ? ', 다시 볼 문제' : '');

export function renderPlay(ctx) {
  const { data, index } = ctx.state;
  const run = data.activeRun;
  const n = run.questions.length;
  const qi = Math.min(Math.max(ctx.state.qi, 0), n - 1);
  const rec = run.questions[qi];
  const q = index.questions.get(rec.id);
  const answered = run.questions.filter((r) => r.answer !== null).length;
  const allDone = answered === n;

  const body = RENDER[q.type](q, rec, {
    draft: ctx.state.drafts[rec.id],
    setDraft: (d) => { ctx.state.drafts[rec.id] = d; },
    onConfirm: (ans) => ctx.confirm(qi, ans),
  });

  const feedback = rec.answer === null ? null : h('div', { class: `feedback ${rec.correct ? 'ok' : 'no'}` },
    h('strong', {}, rec.correct ? '⭕ 정답!' : '❌ 아쉬워요'),
    rec.correct ? null : h('p', { class: 'feedback-answer' }, `정답: ${answerText(q)}`),
    h('p', { class: 'feedback-explain' }, q.explain),
    h('p', { class: 'feedback-ref' }, refText(q.ref)));

  const hintBtn = q.type === 'mcq' && rec.answer === null && !rec.hint
    ? h('button', { class: 'btn ghost small', disabled: data.coins < HINT_COST, onclick: () => ctx.hint(qi) }, `💡 힌트 (🪙${HINT_COST})`)
    : null;

  const panel = h('aside', { class: `panel ${ctx.state.sheetOpen ? 'open' : ''}`, 'aria-label': '답안 현황' },
    h('div', { class: 'panel-title' }, '답안 현황'),
    h('div', { class: 'grid' }, run.questions.map((r, i) =>
      h('button', {
        class: `cell ${cellState(r)} ${i === qi ? 'current' : ''} ${r.flag ? 'flagged' : ''}`,
        'aria-label': `${i + 1}번, ${cellName(r)}`,
        onclick: () => { ctx.state.sheetOpen = false; ctx.setQi(i); },
      }, h('span', {}, String(i + 1)), h('span', { class: 'cell-mark', 'aria-hidden': 'true' }, cellMark(r))))),
    h('p', { class: 'panel-count' }, `푼 문제 ${answered} / ${n}`),
    h('p', { class: 'legend' }, '✓ 정답 · ✗ 오답 · ★ 다시 볼 문제'));

  return h('div', { class: 'page play' },
    h('header', { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': '홈으로(진행은 저장돼요)', onclick: () => ctx.go('#/home') }, '✕'),
      h('h1', { class: 'topbar-title' }, `${MODE_LABEL[run.mode]} · ${run.stageId ? stageLabel(index, run.stageId) : '여러 스테이지'}`),
      h('button', { class: `icon-btn flag ${rec.flag ? 'on' : ''}`, 'aria-label': '다시 볼 문제 표시', 'aria-pressed': rec.flag ? 'true' : 'false', onclick: () => ctx.flag(qi) }, rec.flag ? '★' : '☆')),
    h('div', { class: 'play-layout' },
      h('main', { class: 'q-area' },
        allDone ? h('div', { class: 'done-callout' }, '모든 문제를 풀었어요! 제출해서 결과를 확인하세요.') : null,
        h('div', { class: 'q-head' }, h('span', { class: 'q-num' }, `${qi + 1} / ${n}`), hintBtn),
        passageBox(q),
        h('p', { class: 'q-text' }, questionText(q.q)),
        body,
        feedback),
      panel),
    h('footer', { class: 'play-foot' },
      h('button', { class: 'btn ghost', disabled: qi === 0, onclick: () => ctx.setQi(qi - 1) }, '← 이전'),
      h('button', { class: 'btn ghost sheet-toggle', 'aria-expanded': ctx.state.sheetOpen ? 'true' : 'false', onclick: () => { ctx.state.sheetOpen = !ctx.state.sheetOpen; ctx.render(); } }, `번호판 ${answered}/${n}`),
      qi < n - 1 ? h('button', { class: 'btn', onclick: () => ctx.setQi(qi + 1) }, rec.answer === null ? '건너뛰기 →' : '다음 →') : null,
      h('button', { class: `btn ${allDone ? 'primary' : 'warn'}`, onclick: () => ctx.submitWithConfirm() }, '제출')));
}
