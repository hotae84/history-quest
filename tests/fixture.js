import { buildIndex } from '../js/content.js';

const TYPES = ['mcq', 'ox', 'blank', 'order', 'match'];

function makeQ(num, concept, type) {
  const id = 'q' + String(num).padStart(4, '0');
  const base = { id, concept, type, q: `문제 ${id}`, explain: `해설 ${id}`, ref: '122' };
  switch (type) {
    case 'mcq': return { ...base, choices: ['가', '나', '다', '라', '마'], answer: 1 };
    case 'blank': return { ...base, choices: ['갑', '을', '병', '정'], answer: 2 };
    case 'ox': return { ...base, answer: true };
    case 'order': return { ...base, items: ['A', 'B', 'C', 'D'] };
    default: return { ...base, pairs: [['a', '1'], ['b', '2'], ['c', '3']] };
  }
}

// 월드 1개, 일반 스테이지 3개(각 perStage문제, 개념은 2문제씩 묶음) + 보스
export function fixtureJson({ contentVersion = 1, perStage = 8 } = {}) {
  let num = 1;
  const stages = [];
  for (let s = 1; s <= 3; s++) {
    const questions = [];
    for (let i = 0; i < perStage; i++) {
      questions.push(makeQ(num++, `c${s}-${Math.floor(i / 2)}`, TYPES[i % 5]));
    }
    stages.push({ id: `w1s${s}`, kind: 'normal', title: `스테이지 ${s}`, card: { name: `카드${s}`, desc: '설명' }, questions });
  }
  stages.push({ id: 'w1boss', kind: 'boss', title: '보스' });
  return {
    content: { contentVersion, worlds: [1] },
    worlds: [{ world: 1, title: '월드', unit: 'Ⅳ-3', stages }],
  };
}

export function fixtureIndex(opts) {
  const { content, worlds } = fixtureJson(opts);
  const { index, errors } = buildIndex(content, worlds);
  if (errors.length) throw new Error(errors.join('\n'));
  return index;
}

export function correctAnswer(q) {
  switch (q.type) {
    case 'order': return q.items.map((_, i) => i);
    case 'match': return q.pairs.map((_, i) => i);
    default: return q.answer;
  }
}

export function wrongAnswer(q) {
  switch (q.type) {
    case 'mcq':
    case 'blank': return (q.answer + 1) % q.choices.length;
    case 'ox': return !q.answer;
    default: {
      const a = correctAnswer(q);
      [a[0], a[1]] = [a[1], a[0]];
      return a;
    }
  }
}

// localStorage 대용. failAll / failKeys로 쓰기 실패를 주입하고 writes로 쓰기 횟수를 센다.
export class MemoryStorage {
  constructor(init = {}) {
    this.m = new Map(Object.entries(init));
    this.writes = 0;
    this.failAll = false;
    this.failKeys = new Set();
  }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) {
    if (this.failAll || this.failKeys.has(k)) throw new Error('QuotaExceededError');
    this.writes++;
    this.m.set(k, String(v));
  }
  removeItem(k) { this.writes++; this.m.delete(k); }
  key(i) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}
