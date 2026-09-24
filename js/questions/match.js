import { h } from '../dom.js';

export function renderMatch(q, rec, { onConfirm, draft, setDraft }) {
  const n = q.pairs.length;
  if (rec.answer !== null) {
    return h('div', { class: 'match done' },
      h('ul', { class: 'match-result' }, q.pairs.map((p, i) => {
        const good = rec.answer[i] === i;
        return h('li', { class: good ? 'correct' : 'wrong' },
          h('span', {}, p[0]), h('span', { class: 'arrow' }, good ? '✓' : '✗'), h('span', {}, q.pairs[rec.answer[i]][1]),
          good ? null : h('span', { class: 'fix' }, `→ 정답: ${p[1]}`));
      })));
  }
  const map = Array.isArray(draft?.map) ? draft.map.slice() : Array(n).fill(null);
  let sel = Number.isInteger(draft?.sel) ? draft.sel : null;
  const root = h('div', { class: 'match' });
  const save = () => setDraft({ map: map.slice(), sel });
  const draw = () => {
    root.replaceChildren(
      h('p', { class: 'hint-text' }, '왼쪽을 누른 뒤 짝이 되는 오른쪽을 누르세요. 연결된 것을 다시 누르면 풀려요.'),
      h('div', { class: 'match-cols' },
        h('div', { class: 'col' }, q.pairs.map((p, i) =>
          h('button', {
            class: `m-item left ${sel === i ? 'sel' : ''} ${map[i] !== null ? 'paired' : ''}`,
            onclick: () => {
              if (map[i] !== null) { map[i] = null; sel = null; } else sel = sel === i ? null : i;
              save(); draw();
            },
          }, map[i] !== null ? h('span', { class: 'badge' }, String(i + 1)) : null, p[0]))),
        h('div', { class: 'col' }, rec.order.map((r) => {
          const owner = map.indexOf(r);
          return h('button', {
            class: `m-item right ${owner >= 0 ? 'paired' : ''}`,
            disabled: sel === null && owner < 0,
            onclick: () => {
              if (sel === null) { if (owner >= 0) { map[owner] = null; save(); draw(); } return; }
              if (owner >= 0) map[owner] = null;
              map[sel] = r;
              sel = null;
              save(); draw();
            },
          }, owner >= 0 ? h('span', { class: 'badge' }, String(owner + 1)) : null, q.pairs[r][1]);
        }))),
      h('button', { class: 'btn primary confirm', disabled: map.some((v) => v === null), onclick: () => onConfirm(map.slice()) }, '확인'));
  };
  draw();
  return root;
}
