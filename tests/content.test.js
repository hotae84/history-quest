import { test, eq, ok } from './harness.js';
import { buildIndex, checkQuestion, strictErrors, mixSummary } from '../js/content.js';
import { fixtureJson } from './fixture.js';

// 한 개념에 4문제를 몰아 넣은 픽스처
function fixtureIndexWithConcepts() {
  const { content, worlds } = fixtureJson();
  worlds[0].stages[0].questions.forEach((q, i) => { q.concept = i < 4 ? 'big' : `c-${i}`; });
  return buildIndex(content, worlds).index;
}

const base = { id: 'q0001', concept: 'c', type: 'mcq', q: '문', explain: '해', ref: '122', choices: ['a', 'b', 'c', 'd', 'e'], answer: 0 };

test('픽스처 콘텐츠는 오류 없음, 스테이지·보스 출제 가능', () => {
  const { content, worlds } = fixtureJson();
  const { index, errors } = buildIndex(content, worlds);
  eq(errors, []);
  ok(index.stages.get('w1s1').playable);
  ok(index.stages.get('w1boss').playable);
  eq(index.questions.get('q0009').stageId, 'w1s2');
});
test('문제 형식 오류를 잡아냄', () => {
  eq(checkQuestion(base), []);
  eq(checkQuestion({ ...base, choices: ['a', 'b', 'c', 'd'], answer: 3 }), [], 'mcq 보기 4개는 허용');
  ok(checkQuestion({ ...base, choices: ['a', 'b', 'c'] }).length > 0, 'mcq 보기 3개');
  eq(checkQuestion({ ...base, ref: '122-123' }), [], 'ref 범위 허용');
  eq(checkQuestion({ ...base, ref: '167,174' }), [], 'ref 여러 쪽 허용');
  ok(checkQuestion({ ...base, ref: '167,' }).length > 0, 'ref 끝 쉼표');
  ok(checkQuestion({ ...base, explain: '②는 콜럼버스이다.' }).length > 0, '섞이는 보기의 번호를 해설에 쓰면 오류');
  eq(checkQuestion({ ...base, fixedOrder: true, explain: '①이 정답이다.' }), [], '고정 순서면 번호 허용');
  for (const bad of [undefined, 122, '', '122쪽', '12-']) ok(checkQuestion({ ...base, ref: bad }).length > 0, `ref ${bad}`);
  eq(checkQuestion({ ...base, passage: '자료 내용\n둘째 줄', passageLabel: '자료', fixedOrder: true }), [], 'passage·fixedOrder 허용');
  ok(checkQuestion({ ...base, passage: 'x'.repeat(601) }).length > 0, 'passage 600자 초과');
  ok(checkQuestion({ ...base, passage: '내용', passageLabel: '그림' }).length > 0, 'passageLabel 값');
  ok(checkQuestion({ ...base, passageLabel: '자료' }).length > 0, 'passage 없이 label');
  ok(checkQuestion({ id: 'q0005', concept: 'c', type: 'ox', q: '문', explain: '해', ref: '122', answer: true, passage: '자료' }).length > 0, 'mcq 외 passage');
  ok(checkQuestion({ ...base, answer: 5 }).length > 0, 'answer 범위');
  ok(checkQuestion({ ...base, concept: '' }).length > 0, 'concept 없음');
  ok(checkQuestion({ ...base, choices: ['a', 'a', 'b', 'c', 'd'] }).length > 0, '보기 중복');
  ok(checkQuestion({ ...base, id: 'x1' }).length > 0, 'id 형식');
  ok(checkQuestion({ ...base, type: 'ox', answer: 'yes' }).length > 0, 'ox 답');
  ok(checkQuestion({ id: 'q0002', concept: 'c', type: 'order', q: '문', explain: '해', ref: '122', items: ['a', 'b'] }).length > 0, 'order 2개');
  ok(checkQuestion({ id: 'q0003', concept: 'c', type: 'match', q: '문', explain: '해', ref: '122', pairs: [['a', '1']] }).length > 0, 'match 1쌍');
  ok(checkQuestion({ id: 'q0004', concept: 'c', type: 'map', q: '문', explain: '해' }).length > 0, '모르는 유형');
});
test('문제 id 중복을 잡아냄', () => {
  const { content, worlds } = fixtureJson();
  worlds[0].stages[1].questions[0].id = 'q0001';
  ok(buildIndex(content, worlds).errors.some((e) => e.includes('중복')));
});
test('월드 번호 불일치를 잡아냄', () => {
  const { content, worlds } = fixtureJson();
  worlds[0].world = 2;
  ok(buildIndex(content, worlds).errors.length > 0);
});
test('문제가 적은 스테이지는 출제 불가(준비 중)', () => {
  const { content, worlds } = fixtureJson({ perStage: 2 });
  const { index, errors } = buildIndex(content, worlds);
  eq(errors, []);
  ok(!index.stages.get('w1s1').playable);
  ok(!index.stages.get('w1boss').playable);
});
test('보스 — 한 스테이지의 3문제가 모두 같은 개념이면 출제 불가', () => {
  const { content, worlds } = fixtureJson();
  const s1 = worlds[0].stages[0];
  s1.questions = s1.questions.slice(0, 3).map((q) => ({ ...q, concept: 'same' }));
  const { index, errors } = buildIndex(content, worlds);
  eq(errors, []);
  ok(!index.stages.get('w1boss').playable);
});
test('엄격 검사 — 수량 기준', () => {
  const { content, worlds } = fixtureJson();
  const { index } = buildIndex(content, worlds);
  ok(strictErrors(index).some((e) => e.includes('전체 문제 수')));
  eq(strictErrors(index, { total: 24, worlds: 1, mix: false }), []);
  ok(strictErrors(fixtureIndexWithConcepts(), { total: 24, worlds: 1, mix: false }).some((e) => e.includes('2~3문제')));
});

test('유형 비율 검사 — 선다 70·순서 12·기타 18, 세부 ±3, 부정형 ≤23', () => {
  const qs = [];
  let k = 1;
  const add = (type, extra, count) => { for (let i = 0; i < count; i++) qs.push({ id: 'q' + String(k++).padStart(4, '0'), type, ...extra }); };
  add('mcq', { passage: '자료', passageLabel: '자료', q: '옳은 것은?' }, 38);
  add('mcq', { passage: 'ㄱ.\nㄴ.', passageLabel: '보기', q: '고른 것은?' }, 16);
  add('mcq', { q: '옳지 않은 것은?' }, 16);
  add('order', {}, 12);
  add('ox', {}, 18);
  const index = { worlds: [], questions: new Map(qs.map((q) => [q.id, q])) };
  eq(mixSummary(index), { mcq: 70, source: 38, combo: 16, sentence: 16, negative: 16, order: 12, other: 18 });
  const mixOnly = (ix) => strictErrors(ix, { worlds: 0 }).filter((e) => !e.includes('월드'));
  eq(mixOnly(index), []);
  // 자료형 5개를 문장형으로 바꾸면 세부 기준(±3) 위반
  for (const q of qs.slice(0, 5)) { delete q.passage; delete q.passageLabel; }
  ok(mixOnly(index).some((e) => e.includes('자료 제시형')), '자료형 부족');
  // 부정형 24개면 위반
  qs.filter((q) => q.type === 'mcq').slice(0, 24).forEach((q) => { q.q = '옳지 않은 것은?'; });
  ok(mixOnly(index).some((e) => e.includes('부정형')), '부정형 초과');
});
