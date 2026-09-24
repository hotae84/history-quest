import { h } from '../dom.js';

export const WORLD_EMOJI = { 1: '🕌', 2: '🗽', 3: '🏭', 4: '🏯' };

export function starsText(n) {
  return '★'.repeat(n) + '☆'.repeat(3 - n);
}

export function topbar(ctx, title, backHash = '#/home') {
  return h('header', { class: 'topbar' },
    h('button', { class: 'icon-btn', 'aria-label': '뒤로', onclick: () => ctx.go(backHash) }, '←'),
    h('h1', { class: 'topbar-title' }, title),
    h('span', { class: 'topbar-spacer', 'aria-hidden': 'true' }));
}

export function answerText(q) {
  switch (q.type) {
    case 'mcq':
    case 'blank': return q.choices[q.answer];
    case 'ox': return q.answer ? 'O' : 'X';
    case 'order': return q.items.join(' → ');
    case 'match': return q.pairs.map((p) => `${p[0]} – ${p[1]}`).join(', ');
    default: return '';
  }
}

// 교과서 쪽 표시: "122-123" → "122~123", "167,174" → "167, 174"
export function refText(ref) {
  return `📖 교과서 ${ref.replace(/-/g, '~').replace(/,/g, ', ')}쪽`;
}

export function stageLabel(index, stageId) {
  return index.stages.get(stageId)?.title ?? '여러 스테이지';
}
