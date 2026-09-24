import { test, eq, ok } from './harness.js';
import * as G from '../js/game.js';
import { newData, decode, normalizeWithContent, Store } from '../js/store.js';
import { buildIndex } from '../js/content.js';
import { makeRng } from '../js/util.js';
import { fixtureIndex, fixtureJson, correctAnswer, wrongAnswer, MemoryStorage } from './fixture.js';

const idx = fixtureIndex();
const D1 = '2026-09-24', D2 = '2026-09-25', D3 = '2026-09-26';
const S1 = idx.stages.get('w1s1').questionIds.slice(0, 6); // q0001~q0006
const Q = 'q0001'; // mcq
const ALL_OK = Array(6).fill('ok');
const FIRST_NO = ['no', 'ok', 'ok', 'ok', 'ok', 'ok'];

function start(data, mode, stageId, ids, seed = 1) {
  return { ...data, activeRun: G.newRun({ mode, stageId, questionIds: ids, index: idx, rng: makeRng(seed), now: 1000 + seed }) };
}
function answer(data, results) {
  let run = data.activeRun;
  results.forEach((r, i) => {
    if (r === null) return;
    const q = idx.questions.get(run.questions[i].id);
    run = G.confirmAnswer(run, i, r === 'ok' ? correctAnswer(q) : wrongAnswer(q), idx);
  });
  return { ...data, activeRun: run };
}
function playAndSettle(data, mode, stageId, ids, results, date, seed = 1) {
  const d = answer(start(data, mode, stageId, ids, seed), results);
  return G.settle(d, d.activeRun.runId, idx, date);
}
function checkConcepts(ids) {
  const key = (id) => { const q = idx.questions.get(id); return q.stageId + '|' + q.concept; };
  const cnt = {};
  ids.forEach((id, i) => {
    const k = key(id);
    cnt[k] = (cnt[k] || 0) + 1;
    ok(cnt[k] <= 2, '같은 개념 최대 2문제');
    if (i > 0) ok(key(ids[i - 1]) !== k, '같은 개념 연속 금지');
  });
}

test('별점 경계 — 6문제', () => { eq([3, 4, 5, 6].map((c) => G.starsFor(c, 6)), [0, 1, 2, 3]); });
test('별점 경계 — 10문제', () => { eq([5, 6, 7, 8, 9, 10].map((c) => G.starsFor(c, 10)), [0, 1, 1, 2, 2, 3]); });
test('레벨 계산', () => {
  eq(G.levelInfo(0), { level: 1, into: 0, need: 100 });
  eq(G.levelInfo(100), { level: 2, into: 0, need: 200 });
  eq(G.levelInfo(299), { level: 2, into: 199, need: 200 });
  eq(G.levelInfo(300), { level: 3, into: 0, need: 300 });
});
test('연속 학습일 — 오늘/어제/그저께/없음', () => {
  eq(G.nextStreak({ count: 3, lastDate: D2 }, D2), { count: 3, lastDate: D2 });
  eq(G.nextStreak({ count: 3, lastDate: D1 }, D2), { count: 4, lastDate: D2 });
  eq(G.nextStreak({ count: 3, lastDate: D1 }, D3), { count: 1, lastDate: D3 });
  eq(G.nextStreak({ count: 0, lastDate: null }, D1), { count: 1, lastDate: D1 });
  eq(G.displayStreak({ count: 3, lastDate: D1 }, D3), 0);
  eq(G.displayStreak({ count: 3, lastDate: D1 }, D2), 3);
});
test('보기를 섞어도 원래 인덱스로 채점', () => {
  let seed = 1;
  let d = start(newData(), 'stage', 'w1s1', S1, seed);
  while (d.activeRun.questions[0].order.every((v, i) => v === i)) d = start(newData(), 'stage', 'w1s1', S1, ++seed);
  const q = idx.questions.get(d.activeRun.questions[0].id);
  eq(G.confirmAnswer(d.activeRun, 0, correctAnswer(q), idx).questions[0].correct, true);
  eq(G.confirmAnswer(d.activeRun, 0, wrongAnswer(q), idx).questions[0].correct, false);
});
test('확정된 답은 바꿀 수 없음', () => {
  const d = start(newData(), 'stage', 'w1s1', S1);
  const q = idx.questions.get(d.activeRun.questions[0].id);
  const r1 = G.confirmAnswer(d.activeRun, 0, correctAnswer(q), idx);
  ok(G.confirmAnswer(r1, 0, wrongAnswer(q), idx) === r1);
});
test('stage 전부 정답 — 보상', () => {
  const { data, summary } = playAndSettle(newData(), 'stage', 'w1s1', S1, ALL_OK, D1);
  eq(summary.xp, 90);
  eq(summary.coins, 45);
  eq(summary.stars, 3);
  eq(summary.newCard, '카드1');
  eq(data.xp, 90);
  eq(data.coins, 45);
  eq(data.stars, { w1s1: 3 });
  eq(data.seen.length, 6);
  eq(data.activeRun, null);
  eq(data.streak, { count: 1, lastDate: D1 });
  eq(data.lastWorld, 1);
});
test('정산은 한 번만 — 같은 요청을 다시 보내면 null', () => {
  const d = answer(start(newData(), 'stage', 'w1s1', S1), ALL_OK);
  const first = G.settle(d, d.activeRun.runId, idx, D1);
  eq(G.settle(first.data, d.activeRun.runId, idx, D1), null);
  eq(G.settle(d, 'r-other', idx, D1), null);
});
test('다시 풀면 첫 만남 보너스·별 갱신 보상 없음', () => {
  const a = playAndSettle(newData(), 'stage', 'w1s1', S1, ALL_OK, D1);
  const b = playAndSettle(a.data, 'stage', 'w1s1', S1, ALL_OK, D1, 2);
  eq(b.summary.xp, 60);
  eq(b.summary.coins, 15);
});
test('재개 후 정산 = 중단 없이 정산 (같은 초기 상태·답안·날짜)', () => {
  const results = ['ok', 'no', 'ok', null, 'ok', 'no'];
  const base = start(newData(), 'stage', 'w1s1', S1, 3);
  const straight = G.settle(answer(base, results), base.activeRun.runId, idx, D1);
  const half = answer(base, results.slice(0, 3));
  const reloaded = normalizeWithContent(decode(JSON.stringify(half)).data, idx).data;
  const resumed = answer(reloaded, [null, null, null, ...results.slice(3)]);
  eq(G.settle(resumed, base.activeRun.runId, idx, D1), straight);
});
test('자정을 넘겨 정산하면 실제 정산일에 귀속', () => {
  const r = playAndSettle(newData(), 'stage', 'w1s1', S1, FIRST_NO, D2);
  eq(r.data.triedToday.date, D2);
  eq(r.data.streak.lastDate, D2);
});
test('포기 — 힌트 코인만 빠지고 나머지 불변', () => {
  let d = start({ ...newData(), coins: 50 }, 'stage', 'w1s1', S1);
  const i = d.activeRun.questions.findIndex((r) => idx.questions.get(r.id).type === 'mcq');
  d = G.useHint(d, i, idx);
  const quit = G.abandonRun(d);
  eq([quit.coins, quit.xp, quit.stars, quit.seen, quit.wrong, quit.activeRun], [30, 0, {}, [], {}, null]);
});
test('오답 노트 — 오답 → 다음날 정답(1) → 같은 날 오답 무시 → 그다음날 정답 졸업', () => {
  let d = playAndSettle(newData(), 'stage', 'w1s1', S1, FIRST_NO, D1).data;
  eq(d.wrong[Q], { streak: 0 });
  d = playAndSettle(d, 'review', null, [Q], ['ok'], D2).data;
  eq(d.wrong[Q], { streak: 1 });
  d = playAndSettle(d, 'review', null, [Q], ['no'], D2, 2).data;
  eq(d.wrong[Q], { streak: 1 });
  const last = playAndSettle(d, 'review', null, [Q], ['ok'], D3, 3);
  eq(last.data.wrong[Q], undefined);
  eq(last.summary.graduated, [Q]);
  eq(last.summary.coins, 5);
});
test('정답 후 다음 날 오답이면 0 — review 오답도 0', () => {
  let d = playAndSettle(newData(), 'stage', 'w1s1', S1, FIRST_NO, D1).data;
  d = playAndSettle(d, 'review', null, [Q], ['ok'], D2).data;
  d = playAndSettle(d, 'review', null, [Q], ['no'], D3).data;
  eq(d.wrong[Q], { streak: 0 });
});
test('힌트를 쓴 정답은 오답 노트에 반영하지 않음', () => {
  let d = playAndSettle({ ...newData(), coins: 100 }, 'stage', 'w1s1', S1, FIRST_NO, D1).data;
  d = G.useHint(start(d, 'review', null, [Q]), 0, idx);
  d = { ...d, activeRun: G.confirmAnswer(d.activeRun, 0, idx.questions.get(Q).answer, idx) };
  const r = G.settle(d, d.activeRun.runId, idx, D2);
  eq(r.data.wrong[Q], { streak: 0 });
  ok(!r.data.triedToday.ids.includes(Q), '오늘 첫 시도로 치지 않음');
  eq(r.summary.xp, 8);
});
test('힌트를 쓴 정답은 첫 만남 보너스 없음', () => {
  let d = start({ ...newData(), coins: 20 }, 'stage', 'w1s1', S1);
  const i = d.activeRun.questions.findIndex((r) => r.id === Q);
  d = G.useHint(d, i, idx);
  d = answer(d, ALL_OK);
  eq(G.settle(d, d.activeRun.runId, idx, D1).summary.xp, 85);
});
test('노트 밖 문제를 오늘 처음 맞힌 뒤 같은 날 틀려도 무시', () => {
  let d = playAndSettle(newData(), 'stage', 'w1s1', S1, ALL_OK, D1).data;
  d = playAndSettle(d, 'stage', 'w1s1', S1, ['no', 'no', 'ok', 'ok', 'ok', 'ok'], D1, 2).data;
  eq(d.wrong, {});
});
test('오늘 졸업한 문제를 같은 날 틀려도 무시', () => {
  let d = playAndSettle(newData(), 'stage', 'w1s1', S1, FIRST_NO, D1).data;
  d = playAndSettle(d, 'review', null, [Q], ['ok'], D2).data;
  d = playAndSettle(d, 'review', null, [Q], ['ok'], D3).data;
  d = playAndSettle(d, 'stage', 'w1s1', S1, FIRST_NO, D3, 4).data;
  eq(d.wrong[Q], undefined);
});
test('retry는 별점·오답 노트·연속 학습일을 바꾸지 않음', () => {
  const a = playAndSettle(newData(), 'stage', 'w1s1', S1, ['no', 'no', 'ok', 'ok', 'ok', 'ok'], D1);
  const r = playAndSettle(a.data, 'retry', 'w1s1', a.summary.wrongIds, ['ok', 'ok'], D2);
  eq([r.data.stars, r.data.wrong, r.data.streak, r.data.triedToday], [a.data.stars, a.data.wrong, a.data.streak, a.data.triedToday]);
  eq([r.summary.xp, r.summary.coins, r.summary.stars], [10, 0, null]);
});
test('힌트 — 코인 부족·중복·확정 후·mcq 외 사용 불가, 오답 보기 2개 제거', () => {
  let d = start({ ...newData(), coins: 19 }, 'stage', 'w1s1', S1);
  const i = d.activeRun.questions.findIndex((r) => idx.questions.get(r.id).type === 'mcq');
  const j = d.activeRun.questions.findIndex((r) => idx.questions.get(r.id).type !== 'mcq');
  ok(G.useHint(d, i, idx) === d, '코인 부족');
  d = { ...d, coins: 50 };
  ok(G.useHint(d, j, idx) === d, 'mcq만');
  const h1 = G.useHint(d, i, idx);
  eq([h1.coins, h1.activeRun.questions[i].hint], [30, true]);
  ok(G.useHint(h1, i, idx) === h1, '중복');
  const q = idx.questions.get(h1.activeRun.questions[i].id);
  const hidden = G.hiddenChoices(q, h1.activeRun.questions[i]);
  eq(hidden.length, 2);
  ok(!hidden.includes(q.answer), '정답은 지우지 않음');
  ok(G.confirmAnswer(h1.activeRun, i, hidden[0], idx) === h1.activeRun, '지운 보기는 고를 수 없음');
  const answered = { ...h1, activeRun: G.confirmAnswer(h1.activeRun, i, q.answer, idx) };
  ok(G.useHint(answered, i, idx) === answered, '확정 후 불가');
});
test('stage 출제 — 6문제·중복 없음·개념 최대 2·연속 없음', () => {
  for (let s = 1; s <= 200; s++) {
    const ids = G.pickStage(idx.stages.get('w1s1').questionIds, idx.questions, makeRng(s));
    eq([ids.length, new Set(ids).size], [6, 6]);
    checkConcepts(ids);
  }
});
test('보스 출제 — 10문제·중복 없음·스테이지마다 3개 이상', () => {
  const normals = ['w1s1', 'w1s2', 'w1s3'].map((id) => idx.stages.get(id));
  for (let s = 1; s <= 200; s++) {
    const ids = G.pickBoss(normals, idx.questions, makeRng(s));
    eq([ids.length, new Set(ids).size], [10, 10]);
    for (const st of normals) ok(ids.filter((id) => idx.questions.get(id).stageId === st.id).length >= 3, st.id);
    checkConcepts(ids);
  }
});
test('연표 순서 문제는 정답 순서 그대로 제시하지 않음', () => {
  const oid = [...idx.questions.values()].find((q) => q.type === 'order').id;
  for (let s = 1; s <= 100; s++) {
    const run = G.newRun({ mode: 'retry', stageId: null, questionIds: [oid], index: idx, rng: makeRng(s) });
    ok(run.questions[0].order.some((v, i) => v !== i));
  }
});
test('해금 — 첫 스테이지 열림, 다음은 이전 ⭐1, 보스는 전부 ⭐1', () => {
  eq(G.stageStatus(idx, {}, 'w1s1'), 'open');
  eq(G.stageStatus(idx, {}, 'w1s2'), 'locked');
  eq(G.stageStatus(idx, { w1s1: 1 }, 'w1s2'), 'open');
  eq(G.stageStatus(idx, { w1s1: 1, w1s2: 1 }, 'w1boss'), 'locked');
  eq(G.stageStatus(idx, { w1s1: 1, w1s2: 2, w1s3: 1 }, 'w1boss'), 'open');
  const small = fixtureIndex({ perStage: 2 });
  eq([G.stageStatus(small, {}, 'w1s1'), G.stageStatus(small, {}, 'w1boss')], ['soon', 'soon']);
});
test('오늘의 추천 — 오답 복습 > 이어서 하기 > 별이 가장 적은 열린 스테이지', () => {
  const base = playAndSettle(newData(), 'stage', 'w1s1', S1, FIRST_NO, D1).data; // w1s1 ⭐2
  eq(G.recommend(base, idx, D2), { kind: 'review', count: 1 });
  eq(G.recommend(base, idx, D1), { kind: 'stage', stageId: 'w1s2' });
  eq(G.recommend(start(base, 'stage', 'w1s1', S1), idx, D1), { kind: 'resume' });
  eq(G.pickReview(base, idx, D2, makeRng(1)), [Q]);
});

// ---- 엔진 리뷰 v1 반영 ----
test('연속 학습일은 상한을 넘지 않음', () => {
  eq(G.nextStreak({ count: G.MAX_STREAK, lastDate: D1 }, D2).count, G.MAX_STREAK);
});
test('자정을 넘긴 재개 — D1에 시작한 회차를 D2에 정산하면 D2의 첫 시도로 반영', () => {
  let d = playAndSettle(newData(), 'stage', 'w1s1', S1, ALL_OK, D1).data; // D1: Q 정답(노트 밖)
  const base = answer(start(d, 'stage', 'w1s1', S1, 5), ['no', 'ok', 'ok']); // D1 같은 날 Q 오답 → D1이었다면 무시
  const reloaded = normalizeWithContent(decode(JSON.stringify(base)).data, idx).data;
  const done = answer(reloaded, [null, null, null, 'ok', 'ok', 'ok']);
  const r = G.settle(done, done.activeRun.runId, idx, D2);
  eq([r.data.triedToday.date, r.data.streak, r.data.wrong[Q]], [D2, { count: 2, lastDate: D2 }, { streak: 0 }]);
});
test('정산 → 저장 실패 → 같은 정산 요청 → 재저장해도 보상은 한 번', () => {
  const mem = new MemoryStorage();
  const store = new Store(mem);
  let memory = answer(start(store.load().data, 'stage', 'w1s1', S1), ALL_OK);
  const runId = memory.activeRun.runId;
  memory = store.save(memory).data;
  const settled = G.settle(memory, runId, idx, D1);
  memory = settled.data;
  mem.failAll = true;
  eq(store.save(memory).ok, false);
  eq(G.settle(memory, runId, idx, D1), null);
  mem.failAll = false;
  memory = store.save(memory).data;
  eq(JSON.parse(mem.getItem('hq.data')).xp, 90);
});
function indexWithConcepts(concepts) {
  const { content, worlds } = fixtureJson({ perStage: concepts.length });
  worlds[0].stages[0].questions.forEach((q, i) => { q.concept = concepts[i]; });
  const { index, errors } = buildIndex(content, worlds);
  if (errors.length) throw new Error(errors.join('\n'));
  return index;
}
test('개념 분포 3·2·2·2 은행에서도 같은 개념 최대 2·연속 없음', () => {
  const ix = indexWithConcepts(['a', 'a', 'a', 'b', 'b', 'c', 'c', 'd', 'd']);
  const key = (id) => ix.questions.get(id).concept;
  for (let s = 1; s <= 500; s++) {
    const ids = G.pickStage(ix.stages.get('w1s1').questionIds, ix.questions, makeRng(s));
    const cnt = {};
    ids.forEach((id, i) => { cnt[key(id)] = (cnt[key(id)] || 0) + 1; ok(cnt[key(id)] <= 2, `seed ${s}`); if (i) ok(key(ids[i - 1]) !== key(id), `seed ${s} 연속`); });
  }
});
test('무작위 시도가 모두 실패해도 결정적 대체 경로로 출제', () => {
  const stuck = () => 0.999999;
  const st = G.pickStage(idx.stages.get('w1s1').questionIds, idx.questions, stuck);
  ok(st && st.length === 6, 'stage');
  checkConcepts(st);
  const normals = ['w1s1', 'w1s2', 'w1s3'].map((id) => idx.stages.get(id));
  const boss = G.pickBoss(normals, idx.questions, stuck);
  ok(boss && boss.length === 10 && new Set(boss).size === 10, 'boss');
  for (const n of normals) ok(boss.filter((id) => idx.questions.get(id).stageId === n.id).length >= 3, n.id);
  checkConcepts(boss);
});
test('보스 전부 정답 — 보상과 첫 격파', () => {
  const normals = ['w1s1', 'w1s2', 'w1s3'].map((id) => idx.stages.get(id));
  const ids = G.pickBoss(normals, idx.questions, makeRng(9));
  const r = playAndSettle(newData(), 'boss', 'w1boss', ids, Array(10).fill('ok'), D1);
  eq([r.summary.xp, r.summary.coins, r.summary.stars, r.summary.bossFirstClear], [150, 90, 3, true]);
});

// ---- 설계 v7: 4지·힌트 무작위·고정 순서 ----
function v7Index() {
  const { content, worlds } = fixtureJson();
  const qs = worlds[0].stages[0].questions;
  qs[0] = { ...qs[0], choices: ['가', '나', '다', '라'], answer: 2 };                     // q0001: 4지
  qs[5] = { ...qs[5], choices: ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄷ, ㄹ'], answer: 0, fixedOrder: true, passage: 'ㄱ.\nㄴ.\nㄷ.\nㄹ.', passageLabel: '보기' }; // q0006
  const { index, errors } = buildIndex(content, worlds);
  if (errors.length) throw new Error(errors.join('\n'));
  return index;
}
test('힌트 — 4지는 1개, 5지는 2개를 무작위로 지우고 기록에 저장', () => {
  const ix = v7Index();
  const seen4 = new Set();
  for (let s = 1; s <= 60; s++) {
    let d = { ...newData(), coins: 100, activeRun: G.newRun({ mode: 'retry', stageId: null, questionIds: ['q0001', 'q0009'], index: ix, rng: makeRng(s), now: s }) };
    d = G.useHint(d, 0, ix, makeRng(s + 1000));
    d = G.useHint(d, 1, ix, makeRng(s + 2000));
    const [r4, r5] = d.activeRun.questions;
    eq([r4.hidden.length, r5.hidden.length], [1, 2]);
    ok(!r4.hidden.includes(2) && !r5.hidden.includes(ix.questions.get('q0009').answer), '정답은 지우지 않음');
    seen4.add(r4.hidden[0]);
    const again = normalizeWithContent(decode(JSON.stringify(d)).data, ix).data;
    eq(again.activeRun.questions[0].hidden, r4.hidden, '재개해도 같은 보기');
  }
  eq(seen4.size, 3, '4지에서 지우는 보기가 한 위치로 고정되지 않음');
});
test('고정 순서 문항은 항상 원래 순서로 표시, 재개 시 순서가 바뀌었으면 회차 폐기', () => {
  const ix = v7Index();
  for (let s = 1; s <= 30; s++) {
    const run = G.newRun({ mode: 'retry', stageId: null, questionIds: ['q0006'], index: ix, rng: makeRng(s), now: s });
    eq(run.questions[0].order, [0, 1, 2, 3]);
  }
  const d = { ...newData(), activeRun: G.newRun({ mode: 'retry', stageId: null, questionIds: ['q0006'], index: ix, rng: makeRng(1), now: 1 }) };
  d.activeRun.questions[0].order = [2, 0, 3, 1];
  eq(normalizeWithContent(decode(JSON.stringify(d)).data, ix).data.activeRun, null);
});
test('힌트 기록 조작(정답을 지움·개수 틀림·힌트 없이 hidden) → 회차 폐기 또는 무시', () => {
  const ix = v7Index();
  const base = () => { let d = { ...newData(), coins: 100, activeRun: G.newRun({ mode: 'retry', stageId: null, questionIds: ['q0001'], index: ix, rng: makeRng(3), now: 3 }) }; return G.useHint(d, 0, ix, makeRng(4)); };
  const tamper = (fn) => { const d = JSON.parse(JSON.stringify(base())); fn(d.activeRun.questions[0]); return normalizeWithContent(decode(JSON.stringify(d)).data, ix).data.activeRun; };
  eq(tamper((r) => { r.hidden = [2]; }), null, '정답을 지움');
  eq(tamper((r) => { r.hidden = [0, 1]; }), null, '4지에서 2개');
  eq(tamper((r) => { delete r.hidden; }), null, '힌트인데 hidden 없음');
  const noHint = tamper((r) => { r.hint = false; r.hidden = [0]; });
  ok(noHint && noHint.questions[0].hidden === undefined, '힌트가 아니면 hidden은 버림');
});
