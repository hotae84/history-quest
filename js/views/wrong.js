import { h } from '../dom.js';
import { dueReviewIds, REVIEW_MAX } from '../game.js';
import { todayStr } from '../util.js';
import { topbar, WORLD_EMOJI } from './common.js';

export function renderWrong(ctx) {
  const { data, index } = ctx.state;
  const due = new Set(dueReviewIds(data, index, todayStr()));
  const ids = Object.keys(data.wrong).filter((id) => index.questions.has(id));
  return h('div', { class: 'page wrong' },
    topbar(ctx, '📕 오답 노트'),
    h('p', { class: 'sub' }, '서로 다른 날, 그날 처음 푼 결과로 2번 연속 맞히면 졸업해요.'),
    due.size
      ? h('button', { class: 'btn primary block', onclick: () => ctx.startReview() }, `오늘 복습 시작 (${Math.min(due.size, REVIEW_MAX)}문제)`)
      : h('p', { class: 'empty' }, ids.length ? '오늘 복습은 끝! 내일 다시 만나요.' : '틀린 문제가 없어요 👍'),
    h('ul', { class: 'wrong-list' }, ids.map((id) => {
      const q = index.questions.get(id);
      const st = index.stages.get(q.stageId);
      const k = data.wrong[id].streak;
      return h('li', { class: 'card' },
        h('div', { class: 'wl-meta' }, `${WORLD_EMOJI[st.world]} ${st.title}`, due.has(id) ? h('span', { class: 'tag' }, '오늘 복습') : null),
        h('p', { class: 'wl-q' }, q.q),
        h('div', { class: 'dots', 'aria-label': `연속 정답 ${k}/2` }, k >= 1 ? '●' : '○', '○'));
    })));
}
