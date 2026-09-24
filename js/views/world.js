import { h } from '../dom.js';
import { stageStatus } from '../game.js';
import { WORLD_EMOJI, starsText, topbar } from './common.js';

export function renderWorld(ctx, worldNo) {
  const { data, index } = ctx.state;
  const w = index.worlds.find((x) => x.world === worldNo);
  if (!w) return null;
  let normalNo = 0;
  return h('div', { class: `page world w${worldNo}` },
    topbar(ctx, `${WORLD_EMOJI[worldNo]} ${w.title}`),
    h('p', { class: 'sub' }, `${w.unit} · 연표를 따라 스테이지를 깨 보세요`),
    h('ol', { class: 'path' }, w.stages.map((st) => {
      const status = stageStatus(index, data.stars, st.id);
      const s = data.stars[st.id] || 0;
      const label = st.kind === 'boss' ? '👑 보스' : `스테이지 ${++normalNo}`;
      const right = status === 'locked' ? '🔒' : status === 'soon' ? '준비 중' : starsText(s);
      return h('li', { class: `path-node ${status} ${st.kind}` },
        h('button', {
          class: 'node-btn',
          disabled: status !== 'open',
          onclick: () => (st.kind === 'boss' ? ctx.startBoss(st.id) : ctx.startStage(st.id)),
        },
        h('span', { class: 'node-label' }, label),
        h('span', { class: 'node-title' }, st.title),
        h('span', { class: 'node-stars', 'aria-label': status === 'open' ? `별 ${s}개` : right }, right)));
    })));
}
