import { test, eq, ok } from './harness.js';
import { Store, decode, newData, normalizeWithContent, KEY, PREV_KEY, BROKEN_PREFIX, MAX_RESTORE_BYTES, MAX_REV_VALUE } from '../js/store.js';
import * as G from '../js/game.js';
import { makeRng } from '../js/util.js';
import { fixtureIndex, wrongAnswer, MemoryStorage } from './fixture.js';

const idx = fixtureIndex();
const good = () => ({ ...newData(), rev: 5, xp: 120, stars: { w1s1: 2 }, seen: ['q0001'], wrong: { q0002: { streak: 1 } } });
// 가짜 v2: v1에서 triedToday가 없던 시절을 흉내
const v2opts = {
  current: 2,
  migrations: {
    1: (o) => {
      if (typeof o.xp !== 'number') throw new Error('v1 형식 아님');
      return { ...o, schema: 2, triedToday: o.triedToday ?? { date: null, ids: [] } };
    },
  },
};
const oldBackup = (extra = {}) => { const v1 = { ...good(), ...extra }; delete v1.triedToday; return v1; };
const clone = (o) => JSON.parse(JSON.stringify(o));
function withRun(mutate) {
  const d = { ...good(), activeRun: G.newRun({ mode: 'stage', stageId: 'w1s1', questionIds: idx.stages.get('w1s1').questionIds.slice(0, 6), index: idx, rng: makeRng(1), now: 1 }) };
  return mutate(clone(d));
}
const idxOf = (d, pred) => d.activeRun.questions.findIndex((r) => pred(idx.questions.get(r.id)));

test('새 데이터는 검증을 통과', () => { eq(decode(JSON.stringify(newData())).status, 'ok'); });
test('손상 — JSON 아님 / 버전 없음 / 버전 0', () => {
  eq(decode('abc').status, 'corrupt');
  eq(decode('{"xp":1}').status, 'corrupt');
  eq(decode(JSON.stringify({ ...newData(), schema: 0 })).status, 'corrupt');
});
test('구조 검증 실패 — 음수·별 5·빈 닉네임·목록 초과·소수·날짜 형식', () => {
  const bads = [
    { xp: -1 }, { stars: { w1s1: 5 } }, { nickname: '  ' }, { nickname: 'ㄱ'.repeat(13) },
    { seen: Array.from({ length: 5001 }, (_, i) => 'q' + i) }, { coins: 1.5 },
    { streak: { count: 1, lastDate: '2026/09/24' } }, { wrong: { q0001: { streak: 7 } } },
  ];
  for (const bad of bads) eq(decode(JSON.stringify({ ...newData(), ...bad })).status, 'corrupt', JSON.stringify(bad).slice(0, 50));
});
test('미래 스키마는 구조가 달라도 future', () => { eq(decode(JSON.stringify({ schema: 9, whatever: [1, 2] })).status, 'future'); });
test('구버전(필드 적음) → 변환 성공', () => {
  const r = decode(JSON.stringify(oldBackup()), v2opts);
  eq([r.status, r.migrated, r.data.schema], ['ok', true, 2]);
  eq(r.data.triedToday, { date: null, ids: [] });
});
test('구버전 변환 실패 → corrupt', () => { eq(decode(JSON.stringify({ schema: 1, foo: 1 }), v2opts).status, 'corrupt'); });
test('activeRun만 잘못되면 회차만 버리고 누적 기록 유지', () => {
  const d = { ...good(), activeRun: { runId: 'r-1', mode: 'stage', stageId: 'w1s1', contentVersion: 1,
    questions: Array.from({ length: 21 }, (_, i) => ({ id: 'q' + String(i + 1).padStart(4, '0'), order: [0], answer: null, correct: null, hint: false, flag: false })) } };
  const r = decode(JSON.stringify(d));
  eq([r.status, r.runDropped, r.data.activeRun, r.data.xp], ['ok', true, null, 120]);
});
test('activeRun 검증 — 순열 아님·중복·답 형식·버전·문제 수·모드·힌트 → 회차 폐기', () => {
  const cases = [
    (d) => { d.activeRun.questions[0].order = [0, 0, 1, 2, 3]; return d; },
    (d) => { d.activeRun.questions[1].id = d.activeRun.questions[0].id; return d; },
    (d) => { d.activeRun.questions[idxOf(d, (q) => q.type === 'mcq')].answer = true; return d; },
    (d) => { d.activeRun.questions[idxOf(d, (q) => q.type === 'ox')].answer = 1; return d; },
    (d) => { d.activeRun.contentVersion = 99; return d; },
    (d) => { d.activeRun.questions.pop(); return d; },
    (d) => { d.activeRun.mode = 'review'; return d; },
    (d) => { d.activeRun.questions[idxOf(d, (q) => q.type !== 'mcq')].hint = true; return d; },
  ];
  cases.forEach((m, n) => {
    const out = normalizeWithContent(decode(JSON.stringify(withRun(m))).data, idx);
    eq([out.data.activeRun, out.runDropped, out.data.xp], [null, true, 120], `case ${n}`);
  });
});
test('조작된 correct는 답에서 다시 계산', () => {
  const d = withRun((d) => { const q = idx.questions.get(d.activeRun.questions[0].id); d.activeRun.questions[0].answer = wrongAnswer(q); d.activeRun.questions[0].correct = true; return d; });
  eq(normalizeWithContent(decode(JSON.stringify(d)).data, idx).data.activeRun.questions[0].correct, false);
});
test('retry·review 회차는 재개 가능', () => {
  for (const [mode, stageId] of [['retry', 'w1s1'], ['retry', null], ['review', null]]) {
    const d = { ...good(), activeRun: G.newRun({ mode, stageId, questionIds: ['q0001', 'q0010'], index: idx, rng: makeRng(2), now: 2 }) };
    const out = normalizeWithContent(decode(JSON.stringify(d)).data, idx);
    ok(out.data.activeRun, `${mode}/${stageId}`);
    eq(out.runDropped, false);
  }
});
test('문제 은행이 줄어도 손상 아님 — 없는 id만 제거', () => {
  const d = { ...good(), stars: { w1s1: 2, w9s1: 3 }, seen: ['q0001', 'q9999'], wrong: { q0002: { streak: 1 }, q9998: { streak: 0 } }, triedToday: { date: '2026-09-24', ids: ['q0001', 'q9999'] } };
  const r = decode(JSON.stringify(d));
  eq(r.status, 'ok');
  const out = normalizeWithContent(r.data, idx).data;
  eq([out.stars, out.seen, out.wrong, out.triedToday.ids], [{ w1s1: 2 }, ['q0001'], { q0002: { streak: 1 } }, ['q0001']]);
});
test('스테이지 id 변경(renamed)은 별 기록을 옮김', () => {
  eq(normalizeWithContent({ ...good(), stars: { old1: 3 } }, { ...idx, renamed: { old1: 'w1s1' } }).data.stars, { w1s1: 3 });
});

test('불러오기 — 없으면 새로 시작', () => { eq(new Store(new MemoryStorage()).load().status, 'new'); });
test('불러오기 — 콘텐츠와 무관하게 기록을 지우지 않음', () => {
  const s = new Store(new MemoryStorage({ [KEY]: JSON.stringify({ ...good(), seen: ['q9999'] }) }));
  eq(s.load().data.seen, ['q9999']);
});
test('불러오기 — 손상이면 원본 보관, hq.data 그대로', () => {
  const mem = new MemoryStorage({ [KEY]: '{broken' });
  const r = new Store(mem, { now: () => 1000 }).load();
  eq([r.status, r.kept, mem.getItem(KEY), mem.getItem(BROKEN_PREFIX + 1000)], ['corrupt', true, '{broken', '{broken']);
});
test('손상 원본은 최대 3개, 최신 것을 남김', () => {
  const mem = new MemoryStorage({ [KEY]: '{x' });
  let t = 1000;
  const s = new Store(mem, { now: () => t++ });
  for (let i = 0; i < 5; i++) s.load();
  const keys = [...mem.m.keys()].filter((k) => k.startsWith(BROKEN_PREFIX));
  eq(keys.length, 3);
  ok(keys.includes(BROKEN_PREFIX + 1004));
});
test('손상 원본 보관 실패 → kept=false, hq.data 그대로', () => {
  const mem = new MemoryStorage({ [KEY]: '{x' });
  mem.failAll = true;
  const r = new Store(mem).load();
  eq([r.kept, mem.getItem(KEY)], [false, '{x']);
});
test('불러오기 — 미래 스키마는 원본 불변·쓰기 0', () => {
  const raw = JSON.stringify({ schema: 9, a: 1 });
  const mem = new MemoryStorage({ [KEY]: raw });
  eq(new Store(mem).load().status, 'future');
  eq([mem.getItem(KEY), mem.writes], [raw, 0]);
});
test('불러오기 — 구버전은 hq.prev 저장 후 교체', () => {
  const raw = JSON.stringify(oldBackup());
  const mem = new MemoryStorage({ [KEY]: raw });
  const r = new Store(mem, v2opts).load();
  eq([r.status, mem.getItem(PREV_KEY), JSON.parse(mem.getItem(KEY)).schema, r.data.rev, !!r.readOnly], ['ok', raw, 2, 6, false]);
});
test('불러오기 — hq.prev 저장 실패면 hq.data 불변·읽기 전용', () => {
  const raw = JSON.stringify(oldBackup());
  const mem = new MemoryStorage({ [KEY]: raw });
  mem.failKeys.add(PREV_KEY);
  const r = new Store(mem, v2opts).load();
  eq([r.status, r.readOnly, mem.getItem(KEY)], ['ok', true, raw]);
});
test('저장 — rev 증가', () => {
  const mem = new MemoryStorage();
  const s = new Store(mem);
  const r = s.save({ ...s.load().data, xp: 10 });
  eq([r.ok, r.data.rev, JSON.parse(mem.getItem(KEY)).xp], [true, 1, 10]);
});
test('저장 실패(용량) → 실패 반환, 다음 저장 때 반영', () => {
  const mem = new MemoryStorage();
  const s = new Store(mem);
  const d = s.load().data;
  mem.failAll = true;
  eq(s.save({ ...d, xp: 10 }), { ok: false, reason: 'quota' });
  mem.failAll = false;
  eq(s.save({ ...d, xp: 10 }).ok, true);
  eq(JSON.parse(mem.getItem(KEY)).xp, 10);
});
test('여러 탭 — A 복원 후 B의 오래된 저장은 거부', () => {
  const mem = new MemoryStorage({ [KEY]: JSON.stringify(good()) });
  const A = new Store(mem);
  const B = new Store(mem);
  const a = A.load().data;
  const b = B.load().data;
  const prep = A.prepareRestore(JSON.stringify({ ...good(), xp: 999 }), idx);
  eq(A.commitRestore(a, prep.candidate).ok, true);
  eq(B.save({ ...b, xp: 1 }), { ok: false, reason: 'conflict' });
  eq(JSON.parse(mem.getItem(KEY)).xp, 999);
});
test('복원 — 잘못된 입력 거부', () => {
  const s = new Store(new MemoryStorage());
  for (const t of [JSON.stringify({ ...good(), xp: -5 }), JSON.stringify({ ...good(), stars: { w1s1: 9 } }), 'hello', '', 'x'.repeat(MAX_RESTORE_BYTES + 1)]) {
    eq(s.prepareRestore(t, idx).status, 'corrupt', t.slice(0, 20));
  }
  eq(s.prepareRestore(JSON.stringify({ schema: 7 }), idx).status, 'future');
});
test('복원 — 구버전 백업은 미리보기까지 쓰기 0회, 취소하면 불변', () => {
  const raw = JSON.stringify(good());
  const mem = new MemoryStorage({ [KEY]: raw });
  const s = new Store(mem, v2opts);
  const p = s.prepareRestore(JSON.stringify(oldBackup({ xp: 7 })), idx);
  eq([p.status, p.preview.xp, mem.writes, mem.getItem(KEY)], ['ok', 7, 0, raw]);
});
test('복원 — 확인하면 hq.prev에 현재 기록, hq.data에 후보', () => {
  const raw = JSON.stringify(good());
  const mem = new MemoryStorage({ [KEY]: raw });
  const s = new Store(mem);
  const cur = s.load().data;
  const r = s.commitRestore(cur, s.prepareRestore(JSON.stringify({ ...good(), xp: 777 }), idx).candidate);
  eq([r.ok, r.data.rev, JSON.parse(mem.getItem(PREV_KEY)).xp, JSON.parse(mem.getItem(KEY)).xp], [true, 6, 120, 777]);
});
test('복원 — 저장 실패 뒤 메모리에서 진행한 기록이 hq.prev에 남음', () => {
  const mem = new MemoryStorage({ [KEY]: JSON.stringify(good()) });
  const s = new Store(mem);
  const cur = s.load().data;
  mem.failAll = true;
  eq(s.save({ ...cur, xp: 150 }).ok, false);
  mem.failAll = false;
  const memory = { ...cur, xp: 150 }; // 저장은 실패했지만 앱 메모리에는 남아 있는 상태
  const r = s.commitRestore(memory, s.prepareRestore(JSON.stringify({ ...good(), xp: 777 }), idx).candidate);
  eq([r.ok, JSON.parse(mem.getItem(PREV_KEY)).xp], [true, 150]);
});
test('복원 — hq.prev 저장 후 hq.data 실패하면 기존 hq.data 유지', () => {
  const raw = JSON.stringify(good());
  const mem = new MemoryStorage({ [KEY]: raw });
  const s = new Store(mem);
  const cur = s.load().data;
  const p = s.prepareRestore(JSON.stringify({ ...good(), xp: 777 }), idx);
  mem.failKeys.add(KEY);
  eq(s.commitRestore(cur, p.candidate), { ok: false, reason: 'quota' });
  eq([mem.getItem(KEY), cur.xp], [raw, 120]);
});
test('복원 — hq.prev 저장 실패면 중단', () => {
  const raw = JSON.stringify(good());
  const mem = new MemoryStorage({ [KEY]: raw });
  const s = new Store(mem);
  const cur = s.load().data;
  const p = s.prepareRestore(JSON.stringify({ ...good(), xp: 777 }), idx);
  mem.failKeys.add(PREV_KEY);
  eq(s.commitRestore(cur, p.candidate), { ok: false, reason: 'prev-failed' });
  eq(mem.getItem(KEY), raw);
});
test('손상 후 새로 시작(overwrite)은 rev를 이어서 씀', () => {
  const mem = new MemoryStorage({ [KEY]: '{broken' });
  const s = new Store(mem);
  const r = s.overwrite(newData());
  eq([r.ok, r.data.rev], [true, 1]);
  eq(s.save(r.data).ok, true);
});

// ---- 엔진 리뷰 v1 반영 ----
test('상한 경계 — 검증 통과 → 정산·저장 → 다시 불러와도 통과', () => {
  const mem = new MemoryStorage();
  const s = new Store(mem);
  const cur = s.load().data;
  const edge = { ...good(), xp: 999_990, coins: 999_990, streak: { count: G.MAX_STREAK, lastDate: '2026-09-24' } };
  let d = s.commitRestore(cur, s.prepareRestore(JSON.stringify(edge), idx).candidate).data;
  d = { ...d, activeRun: G.newRun({ mode: 'stage', stageId: 'w1s1', questionIds: idx.stages.get('w1s1').questionIds.slice(0, 6), index: idx, rng: makeRng(1), now: 1 }) };
  d.activeRun.questions.forEach((r, i) => { const q = idx.questions.get(r.id); d = { ...d, activeRun: G.confirmAnswer(d.activeRun, i, q.type === 'order' ? q.items.map((_, k) => k) : q.type === 'match' ? q.pairs.map((_, k) => k) : q.answer, idx) }; });
  d = G.settle(d, d.activeRun.runId, idx, '2026-09-25').data;
  eq(s.save(d).ok, true);
  const again = s.load();
  eq(again.status, 'ok');
  eq([again.data.xp, again.data.coins, again.data.streak.count], [1_000_000, 1_000_000, G.MAX_STREAK]);
});
test('저장 번호가 상한에 닿으면 새 세대로 넘어가 계속 저장·읽기 가능', () => {
  const mem = new MemoryStorage({ [KEY]: JSON.stringify({ ...good(), rev: MAX_REV_VALUE - 1 }) });
  const s = new Store(mem);
  const d = s.load().data;
  const r1 = s.save(d);
  eq([r1.ok, r1.data.rev], [true, 1]);
  ok(r1.data.gen !== d.gen, '새 세대');
  eq(s.load().status, 'ok');
  eq(s.save(r1.data).ok, true);
  eq(s.save(d), { ok: false, reason: 'conflict' }); // 옛 세대를 든 쪽은 거부
});
test('초기화 뒤 번호가 같아도 옛 세대를 든 탭의 저장·복원은 거부', () => {
  for (const bad of [-3, 0.5, 1e100, '1', MAX_REV_VALUE]) {
    const mem = new MemoryStorage({ [KEY]: JSON.stringify({ ...good(), rev: 0 }) });
    const A = new Store(mem);
    const B = new Store(mem);
    const b = B.save(B.load().data).data; // B: rev 1
    // 저장소 번호가 비정상이 된 뒤 A가 초기화 → 새 세대 rev 1
    mem.m.set(KEY, JSON.stringify({ ...JSON.parse(mem.getItem(KEY)), rev: bad }));
    const a = A.overwrite(newData()).data;
    eq(a.rev, 1);
    eq(B.save({ ...b, xp: 130 }), { ok: false, reason: 'conflict' }, `save rev=${bad}`);
    const prep = B.prepareRestore(JSON.stringify({ ...good(), xp: 777 }), idx);
    eq(B.commitRestore(b, prep.candidate).ok, false, `restore rev=${bad}`);
    eq(JSON.parse(mem.getItem(KEY)).xp, 0);
  }
});
test('세대 정보가 없거나 잘못된 기록은 손상으로 판정', () => {
  const noGen = { ...good() }; delete noGen.gen;
  eq(decode(JSON.stringify(noGen)).status, 'corrupt');
  eq(decode(JSON.stringify({ ...good(), gen: '' })).status, 'corrupt');
});
test('__proto__ 키는 프로토타입을 바꾸지 않음', () => {
  const text = JSON.stringify(good()).replace('"wrong":{', '"wrong":{"__proto__":{"streak":1},').replace('"stars":{', '"stars":{"__proto__":2,');
  const r = decode(text);
  eq(r.status, 'ok');
  eq([Object.getPrototypeOf(r.data.wrong), Object.getPrototypeOf(r.data.stars), ({}).streak], [null, null, undefined]);
  const out = normalizeWithContent(r.data, idx).data;
  ok(!Object.prototype.hasOwnProperty.call(out.wrong, '__proto__'), '콘텐츠에 없는 키는 정리됨');
});
test('복원 — 진행 중 회차를 버리면 runDropped로 알림', () => {
  const s = new Store(new MemoryStorage());
  const bad = withRun((d) => { d.activeRun.questions[0].order = [9]; return d; });
  eq(s.prepareRestore(JSON.stringify(bad), idx).runDropped, true);
  const other = withRun((d) => { d.activeRun.contentVersion = 99; return d; });
  eq(s.prepareRestore(JSON.stringify(other), idx).runDropped, true);
  eq(s.prepareRestore(JSON.stringify(good()), idx).runDropped, false);
});

test('초기화(overwrite)한 기록은 저장 번호가 어떤 값이었든 다시 읽힘', () => {
  for (const rev of [MAX_REV_VALUE - 1, MAX_REV_VALUE, Number.MAX_SAFE_INTEGER, 1e100, -3]) {
    const mem = new MemoryStorage({ [KEY]: JSON.stringify({ ...good(), rev }) });
    const s = new Store(mem);
    const r = s.overwrite(newData());
    eq(r.ok, true, `rev ${rev}`);
    const again = s.load();
    eq(again.status, 'ok', `rev ${rev} 다시 읽기`);
    eq(s.save(again.data).ok, true, `rev ${rev} 이어서 저장`);
  }
});
