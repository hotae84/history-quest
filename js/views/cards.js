import { h } from '../dom.js';
import { cardsUnlocked } from '../game.js';
import { topbar } from './common.js';

export function renderCards(ctx) {
  const { data, index } = ctx.state;
  const unlocked = cardsUnlocked(index, data.stars);
  const all = [...index.stages.values()].filter((s) => s.kind === 'normal' && s.card);
  return h('div', { class: 'page cards' },
    topbar(ctx, '🃏 도감'),
    h('p', { class: 'sub' }, `모은 카드 ${unlocked.size} / ${all.length}`),
    h('div', { class: 'card-grid' }, all.map((s) => (unlocked.has(s.id)
      ? h('div', { class: `card dex w${s.world}` },
          h('div', { class: 'dex-name' }, s.card.name),
          h('p', { class: 'sub' }, s.card.desc),
          h('div', { class: 'dex-meta' }, s.title))
      : h('div', { class: `card dex locked w${s.world}` },
          h('div', { class: 'dex-name' }, '???'),
          h('p', { class: 'sub' }, `「${s.title}」에서 ⭐1을 받으면 공개`))))));
}
