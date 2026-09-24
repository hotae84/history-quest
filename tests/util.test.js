import { test, eq, ok } from './harness.js';
import { todayStr, addDays, daysBetween, makeRng, shuffle, isPermutation } from '../js/util.js';

test('todayStr — 로컬 날짜 형식', () => {
  eq(todayStr(new Date(2026, 8, 4)), '2026-09-04');
});
test('addDays — 달·해 경계', () => {
  eq(addDays('2026-09-30', 1), '2026-10-01');
  eq(addDays('2026-12-31', 1), '2027-01-01');
  eq(addDays('2026-03-01', -1), '2026-02-28');
});
test('daysBetween', () => {
  eq(daysBetween('2026-09-24', '2026-09-27'), 3);
  eq(daysBetween('2026-09-27', '2026-09-24'), -3);
});
test('같은 시드면 같은 섞기 결과, 원본 불변', () => {
  const src = [1, 2, 3, 4, 5, 6];
  eq(shuffle(src, makeRng(3)), shuffle(src, makeRng(3)));
  eq(src, [1, 2, 3, 4, 5, 6]);
});
test('isPermutation', () => {
  ok(isPermutation([2, 0, 1], 3));
  ok(!isPermutation([0, 0, 1], 3));
  ok(!isPermutation([0, 1], 3));
  ok(!isPermutation([0, 1, 3], 3));
  ok(!isPermutation('012', 3));
});
