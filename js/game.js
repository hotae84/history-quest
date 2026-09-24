import { shuffle, range, addDays, daysBetween, isPermutation } from './util.js';
import { optionCount, STAGE_PICK, BOSS_PICK, BOSS_MIN_PER_STAGE } from './content.js';

export const HINT_COST = 20;
export const REVIEW_MAX = 10;
export const GRADUATE_STREAK = 2;
export const MAX_NUM = 1_000_000;
export const MAX_STREAK = 100_000;
const XP = { stage: 10, boss: 10, retry: 5, review: 8 };
const FIRST_BONUS = 5;

export function starsFor(correct, total) {
  if (total <= 0) return 0;
  if (correct >= total) return 3;
  if (correct * 10 >= total * 8) return 2;
  if (correct * 10 >= total * 6) return 1;
  return 0;
}

export function levelInfo(xp) {
  let level = 1;
  let rest = xp;
  while (rest >= 100 * level) {
    rest -= 100 * level;
    level++;
  }
  return { level, into: rest, need: 100 * level };
}

export function nextStreak(streak, date) {
  if (streak.lastDate === date) return { ...streak };
  if (streak.lastDate && addDays(streak.lastDate, 1) === date) return { count: Math.min(MAX_STREAK, streak.count + 1), lastDate: date };
  return { count: 1, lastDate: date };
}

export function displayStreak(streak, today) {
  if (!streak.lastDate) return 0;
  const gap = daysBetween(streak.lastDate, today);
  return gap === 0 || gap === 1 ? streak.count : 0;
}

// ---- 채점 ----
export function isValidAnswer(q, a) {
  if (a === null) return true;
  switch (q.type) {
    case 'mcq':
    case 'blank': return Number.isInteger(a) && a >= 0 && a < q.choices.length;
    case 'ox': return typeof a === 'boolean';
    case 'order': return isPermutation(a, q.items.length);
    case 'match': return isPermutation(a, q.pairs.length);
    default: return false;
  }
}

// order: 고른 순서대로 나열한 원래 항목 인덱스, match: 왼쪽 i에 연결한 오른쪽 원래 인덱스
export function grade(q, a) {
  switch (q.type) {
    case 'mcq':
    case 'blank':
    case 'ox': return a === q.answer;
    case 'order':
    case 'match': return Array.isArray(a) && a.every((v, i) => v === i);
    default: return false;
  }
}

// 힌트로 지우는 보기 수: 5지 2개, 4지 1개(설계 v7 §5.5)
export function hideCount(q) {
  return q.choices.length >= 5 ? 2 : 1;
}

// 힌트로 지운 보기(원래 인덱스). useHint가 무작위로 골라 회차 기록에 저장한다.
export function hiddenChoices(q, rec) {
  return rec.hint && Array.isArray(rec.hidden) ? rec.hidden : [];
}

// ---- 회차 ----
function displayOrder(q, rng) {
  if (q.type === 'ox') return [0, 1];
  const n = optionCount(q);
  if (q.fixedOrder) return range(n); // 〈보기〉 조합형 등 순서가 의미를 갖는 문항
  let o = shuffle(range(n), rng);
  if (q.type === 'order') {
    for (let t = 0; t < 20 && o.every((v, i) => v === i); t++) o = shuffle(range(n), rng);
  }
  return o;
}

export function newRun({ mode, stageId, questionIds, index, rng = Math.random, now = Date.now() }) {
  return {
    runId: `r-${now}`,
    mode,
    stageId: stageId ?? null,
    contentVersion: index.contentVersion,
    questions: questionIds.map((id) => ({
      id, order: displayOrder(index.questions.get(id), rng), answer: null, correct: null, hint: false, flag: false,
    })),
  };
}

export function confirmAnswer(run, qi, answer, index) {
  const rec = run?.questions[qi];
  if (!rec || rec.answer !== null || answer === null) return run;
  const q = index.questions.get(rec.id);
  if (!isValidAnswer(q, answer)) return run;
  if (rec.hint && hiddenChoices(q, rec).includes(answer)) return run;
  const questions = run.questions.slice();
  questions[qi] = { ...rec, answer, correct: grade(q, answer) };
  return { ...run, questions };
}

export function useHint(data, qi, index, rng = Math.random) {
  const run = data.activeRun;
  const rec = run?.questions[qi];
  if (!rec) return data;
  const q = index.questions.get(rec.id);
  if (q.type !== 'mcq' || rec.answer !== null || rec.hint || data.coins < HINT_COST) return data;
  const wrongs = range(q.choices.length).filter((i) => i !== q.answer);
  const hidden = shuffle(wrongs, rng).slice(0, hideCount(q)).sort((a, b) => a - b);
  const questions = run.questions.slice();
  questions[qi] = { ...rec, hint: true, hidden };
  return { ...data, coins: data.coins - HINT_COST, activeRun: { ...run, questions } };
}

export function toggleFlag(run, qi) {
  const questions = run.questions.slice();
  questions[qi] = { ...questions[qi], flag: !questions[qi].flag };
  return { ...run, questions };
}

export function abandonRun(data) {
  return { ...data, activeRun: null };
}

// ---- 출제 ----
const conceptKey = (qmap, id) => {
  const q = qmap.get(id);
  return `${q.stageId}|${q.concept}`;
};
function withinConceptCap(ids, qmap) {
  const cnt = {};
  for (const id of ids) {
    const k = conceptKey(qmap, id);
    cnt[k] = (cnt[k] || 0) + 1;
    if (cnt[k] > 2) return false;
  }
  return true;
}
function arrange(ids, qmap, rng) {
  for (let t = 0; t < 100; t++) {
    const s = shuffle(ids, rng);
    let okOrder = true;
    for (let i = 1; i < s.length && okOrder; i++) okOrder = conceptKey(qmap, s[i]) !== conceptKey(qmap, s[i - 1]);
    if (okOrder) return s;
  }
  return null;
}

// 개념별로 묶어 돌아가며 하나씩 꺼낸다(개념당 최대 2, 같은 개념이 연달아 나오지 않음)
function roundRobin(ids, qmap, n) {
  const groups = new Map();
  for (const id of ids) {
    const k = conceptKey(qmap, id);
    if (!groups.has(k)) groups.set(k, []);
    if (groups.get(k).length < 2) groups.get(k).push(id);
  }
  const lists = [...groups.values()].sort((a, b) => b.length - a.length);
  const out = [];
  for (let round = 0; round < 2 && out.length < n; round++) {
    for (const l of lists) if (l[round] !== undefined && out.length < n) out.push(l[round]);
  }
  return out;
}
const noAdjacent = (ids, qmap) => ids.every((id, i) => i === 0 || conceptKey(qmap, id) !== conceptKey(qmap, ids[i - 1]));

export function pickStage(bankIds, qmap, rng = Math.random) {
  for (let t = 0; t < 200; t++) {
    const pick = shuffle(bankIds, rng).slice(0, STAGE_PICK);
    if (!withinConceptCap(pick, qmap)) continue;
    const a = arrange(pick, qmap, rng);
    if (a) return a;
  }
  // 무작위 시도가 모두 실패하면 결정적으로 만든다
  const fallback = roundRobin(shuffle(bankIds, rng), qmap, STAGE_PICK);
  return fallback.length === STAGE_PICK && noAdjacent(fallback, qmap) ? fallback : null;
}

export function pickBoss(normalStages, qmap, rng = Math.random) {
  for (let t = 0; t < 300; t++) {
    const chosen = normalStages.flatMap((st) => shuffle(st.questionIds, rng).slice(0, BOSS_MIN_PER_STAGE));
    const rest = shuffle(normalStages.flatMap((st) => st.questionIds).filter((id) => !chosen.includes(id)), rng);
    const all = chosen.concat(rest.slice(0, BOSS_PICK - chosen.length));
    if (all.length !== BOSS_PICK || !withinConceptCap(all, qmap)) continue;
    const a = arrange(all, qmap, rng);
    if (a) return a;
  }
  // 결정적 대체: 스테이지마다 개념을 돌아가며 3문제, 남는 칸은 여유 있는 스테이지에서 채운 뒤 스테이지를 번갈아 배치
  const perStage = normalStages.map((st) => roundRobin(st.questionIds, qmap, st.questionIds.length));
  const take = perStage.map((l) => Math.min(BOSS_MIN_PER_STAGE, l.length));
  let left = BOSS_PICK - take.reduce((a, v) => a + v, 0);
  for (let i = 0; left > 0 && i < perStage.length * BOSS_PICK; i++) {
    const s = i % perStage.length;
    if (take[s] < perStage[s].length) { take[s]++; left--; }
  }
  const lanes = perStage.map((l, s) => l.slice(0, take[s]));
  const out = [];
  while (lanes.some((l) => l.length)) {
    const order = lanes.map((l, s) => s).filter((s) => lanes[s].length).sort((a, b) => lanes[b].length - lanes[a].length);
    for (const s of order) {
      const cand = lanes[s][0];
      if (!out.length || conceptKey(qmap, out[out.length - 1]) !== conceptKey(qmap, cand)) { out.push(lanes[s].shift()); break; }
      if (s === order[order.length - 1]) out.push(lanes[s].shift());
    }
  }
  return out.length === BOSS_PICK && withinConceptCap(out, qmap) && noAdjacent(out, qmap) ? out : null;
}

export function dueReviewIds(data, index, today) {
  const tried = data.triedToday.date === today ? new Set(data.triedToday.ids) : new Set();
  return Object.keys(data.wrong).filter((id) => index.questions.has(id) && !tried.has(id));
}

export function pickReview(data, index, today, rng = Math.random) {
  const due = dueReviewIds(data, index, today);
  const dueSet = new Set(due);
  const rest = Object.keys(data.wrong).filter((id) => index.questions.has(id) && !dueSet.has(id));
  return shuffle(due, rng).concat(shuffle(rest, rng)).slice(0, REVIEW_MAX);
}

// ---- 해금·추천·도감 ----
export function stageStatus(index, stars, stageId) {
  const st = index.stages.get(stageId);
  if (!st) return 'locked';
  if (!st.playable) return 'soon';
  if (st.kind === 'boss') return st.worldNormals.every((id) => (stars[id] || 0) >= 1) ? 'open' : 'locked';
  const pos = st.worldNormals.indexOf(st.id);
  if (pos === 0) return 'open';
  return (stars[st.worldNormals[pos - 1]] || 0) >= 1 ? 'open' : 'locked';
}

export function recommend(data, index, today) {
  const due = dueReviewIds(data, index, today).length;
  if (due > 0) return { kind: 'review', count: Math.min(due, REVIEW_MAX) };
  if (data.activeRun) return { kind: 'resume' };
  const all = index.worlds.map((w) => w.world);
  const order = data.lastWorld ? [data.lastWorld, ...all.filter((n) => n !== data.lastWorld)] : all;
  for (const n of order) {
    const w = index.worlds.find((x) => x.world === n);
    if (!w) continue;
    const open = w.stages.filter((s) => stageStatus(index, data.stars, s.id) === 'open');
    if (!open.length) continue;
    let best = open[0];
    for (const s of open) if ((data.stars[s.id] || 0) < (data.stars[best.id] || 0)) best = s;
    return { kind: 'stage', stageId: best.id };
  }
  return null;
}

export function cardsUnlocked(index, stars) {
  return new Set([...index.stages.values()].filter((s) => s.card && (stars[s.id] || 0) >= 1).map((s) => s.id));
}

// ---- 정산 (설계 §5.3·§5.4·§5.8·§5.9) ----
export function settle(data, runId, index, date) {
  const run = data.activeRun;
  if (!run || run.runId !== runId) return null;
  const recs = run.questions;
  const total = recs.length;
  const correct = recs.filter((r) => r.correct === true).length;
  const scored = run.mode === 'stage' || run.mode === 'boss';

  const seenBefore = new Set(data.seen);
  let xp = 0;
  for (const r of recs) {
    if (r.correct !== true) continue;
    xp += XP[run.mode];
    if (scored && !r.hint && !seenBefore.has(r.id)) xp += FIRST_BONUS;
  }
  const seen = [...new Set([...data.seen, ...recs.map((r) => r.id)])];

  let coins = 0;
  let stars = data.stars;
  let gotStars = null;
  let bossFirstClear = false;
  let newCard = null;
  if (scored) {
    gotStars = starsFor(correct, total);
    const old = data.stars[run.stageId] || 0;
    const [base, up] = run.mode === 'stage' ? [5, 10] : [10, 20];
    coins += gotStars * base + Math.max(0, gotStars - old) * up;
    if (gotStars > old) stars = { ...data.stars, [run.stageId]: gotStars };
    if (old === 0 && gotStars > 0) {
      if (run.mode === 'boss') bossFirstClear = true;
      else newCard = index.stages.get(run.stageId)?.card?.name ?? null;
    }
  }

  let wrong = data.wrong;
  let triedToday = data.triedToday;
  const graduated = [];
  if (run.mode !== 'retry') {
    wrong = { ...data.wrong };
    const ids = data.triedToday.date === date ? data.triedToday.ids.slice() : [];
    const tried = new Set(ids);
    for (const r of recs) {
      if (r.hint || tried.has(r.id)) continue; // 힌트 사용·오늘 이미 반영한 문제는 무시
      tried.add(r.id);
      ids.push(r.id);
      if (r.correct === true) {
        if (wrong[r.id]) {
          const s = wrong[r.id].streak + 1;
          if (s >= GRADUATE_STREAK) { delete wrong[r.id]; graduated.push(r.id); }
          else wrong[r.id] = { streak: s };
        }
      } else {
        wrong[r.id] = { streak: 0 }; // 미응답도 오답
      }
    }
    triedToday = { date, ids };
    if (run.mode === 'review') coins += graduated.length * 5;
  }

  const streak = run.mode === 'retry' ? data.streak : nextStreak(data.streak, date);
  const lastWorld = scored ? (index.stages.get(run.stageId)?.world ?? data.lastWorld) : data.lastWorld;
  const next = {
    ...data,
    xp: Math.min(MAX_NUM, data.xp + xp),
    coins: Math.min(MAX_NUM, data.coins + coins),
    stars, seen, wrong, triedToday, streak, lastWorld,
    activeRun: null,
  };
  const before = levelInfo(data.xp).level;
  const after = levelInfo(next.xp).level;
  return {
    data: next,
    summary: {
      mode: run.mode, stageId: run.stageId, total, correct, stars: gotStars, xp, coins,
      wrongIds: recs.filter((r) => r.correct !== true).map((r) => r.id),
      graduated, bossFirstClear, newCard, levelUp: after > before, newLevel: after,
    },
  };
}
