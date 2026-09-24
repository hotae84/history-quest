import { h } from '../dom.js';

export function renderOrder(q, rec, { onConfirm, draft, setDraft }) {
  const n = q.items.length;
  if (rec.answer !== null) {
    return h('div', { class: 'order done' },
      h('ol', { class: 'slots' }, rec.answer.map((orig, pos) =>
        h('li', { class: `slot filled ${orig === pos ? 'correct' : 'wrong'}` },
          h('span', { class: 'slot-no' }, String(pos + 1)), h('span', {}, q.items[orig])))),
      rec.correct ? null : h('p', { class: 'order-correct' }, `올바른 순서: ${q.items.join(' → ')}`));
  }
  const picked = Array.isArray(draft) ? draft.slice() : [];
  const root = h('div', { class: 'order' });
  const draw = () => {
    root.replaceChildren(
      h('p', { class: 'hint-text' }, '먼저 일어난 일부터 차례로 누르세요. 채운 칸을 누르면 되돌려요.'),
      h('ol', { class: 'slots' }, Array.from({ length: n }, (_, pos) => {
        const orig = picked[pos];
        if (orig === undefined) return h('li', { class: 'slot empty' }, h('span', { class: 'slot-no' }, String(pos + 1)));
        return h('li', { class: 'slot filled' },
          h('button', { class: 'slot-btn', onclick: () => { picked.splice(pos, 1); setDraft(picked.slice()); draw(); } },
            h('span', { class: 'slot-no' }, String(pos + 1)), h('span', {}, q.items[orig])));
      })),
      h('div', { class: 'pool' }, rec.order.filter((o) => !picked.includes(o)).map((o) =>
        h('button', { class: 'card-chip', onclick: () => { picked.push(o); setDraft(picked.slice()); draw(); } }, q.items[o]))),
      h('button', { class: 'btn primary confirm', disabled: picked.length !== n, onclick: () => onConfirm(picked.slice()) }, '확인'));
  };
  draw();
  return root;
}
