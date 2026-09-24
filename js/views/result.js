import { h } from '../dom.js';
import { answerText, starsText, topbar, refText } from './common.js';

export function renderResult(ctx) {
  const s = ctx.state.summary;
  const { index } = ctx.state;
  const st = s.stageId ? index.stages.get(s.stageId) : null;
  return h('div', { class: 'page result' },
    topbar(ctx, '결과'),
    h('section', { class: 'card result-card' },
      s.stars === null
        ? h('div', { class: 'result-title' }, s.mode === 'review' ? '📕 복습 완료!' : '🔁 다시 풀기 완료!')
        : h('div', { class: 'big-stars', 'aria-label': `별 ${s.stars}개` }, starsText(s.stars)),
      h('p', { class: 'result-score' }, `${s.total}문제 중 ${s.correct}개 정답`),
      h('div', { class: 'reward-row' },
        h('span', { class: 'chip' }, `+${s.xp} XP`),
        h('span', { class: 'chip' }, `+${s.coins} 🪙`),
        s.graduated.length ? h('span', { class: 'chip ok' }, `🎓 오답 졸업 ${s.graduated.length}`) : null),
      s.levelUp ? h('p', { class: 'levelup' }, `🎉 레벨 업! Lv.${s.newLevel}`) : null,
      s.newCard ? h('p', { class: 'newcard' }, `🃏 새 도감 카드: ${s.newCard}`) : null,
      s.bossFirstClear ? h('p', { class: 'boss-clear' }, '👑 보스를 처음 물리쳤어요! 설정에서 기록을 백업해 두세요.') : null),
    s.wrongIds.length
      ? h('section', { class: 'card' },
          h('h2', {}, '틀린 문제'),
          h('ul', { class: 'wrong-list' }, s.wrongIds.map((id) => {
            const q = index.questions.get(id);
            return h('li', {},
              h('p', { class: 'wl-q' }, q.q),
              h('p', { class: 'wl-a' }, `정답: ${answerText(q)}`),
              h('p', { class: 'wl-e' }, q.explain),
              h('p', { class: 'wl-ref' }, refText(q.ref)));
          })))
      : null,
    h('div', { class: 'actions' },
      s.wrongIds.length ? h('button', { class: 'btn primary', onclick: () => ctx.startRetry() }, `틀린 문제만 다시 (${s.wrongIds.length})`) : null,
      st ? h('button', { class: 'btn', onclick: () => ctx.go(`#/world/${st.world}`) }, '월드 맵') : null,
      h('button', { class: 'btn ghost', onclick: () => ctx.go('#/home') }, '홈으로')));
}
