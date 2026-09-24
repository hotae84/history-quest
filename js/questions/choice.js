import { h } from '../dom.js';
import { hiddenChoices } from '../game.js';

const MCQ_NO = ['①', '②', '③', '④', '⑤'];

export function renderChoice(q, rec, { onConfirm }) {
  const hidden = rec.hint ? hiddenChoices(q, rec) : [];
  const done = rec.answer !== null;
  return h('div', { class: `choices ${q.type}` }, rec.order.map((orig, i) => {
    const cls = ['choice'];
    if (hidden.includes(orig)) cls.push('removed');
    if (done && orig === q.answer) cls.push('correct');
    if (done && orig === rec.answer && orig !== q.answer) cls.push('wrong');
    return h('button', { class: cls.join(' '), disabled: done || hidden.includes(orig), onclick: () => onConfirm(orig) },
      h('span', { class: 'choice-no', 'aria-hidden': 'true' }, q.type === 'mcq' ? MCQ_NO[i] : String.fromCharCode(65 + i)),
      h('span', { class: 'choice-text' }, q.choices[orig]));
  }));
}
