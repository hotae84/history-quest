import { h } from '../dom.js';

export function renderOx(q, rec, { onConfirm }) {
  const done = rec.answer !== null;
  const btn = (val, label) => {
    const cls = ['ox-btn', val ? 'o' : 'x'];
    if (done && val === q.answer) cls.push('correct');
    if (done && val === rec.answer && val !== q.answer) cls.push('wrong');
    return h('button', { class: cls.join(' '), disabled: done, 'aria-label': val ? '맞다(O)' : '틀리다(X)', onclick: () => onConfirm(val) }, label);
  };
  return h('div', { class: 'ox' }, btn(true, 'O'), btn(false, 'X'));
}
