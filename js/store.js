import { isValidAnswer, grade, hideCount, GRADUATE_STREAK, MAX_NUM, MAX_STREAK } from './game.js';
import { optionCount } from './content.js';
import { isPermutation } from './util.js';

export const CURRENT_SCHEMA = 1;
export const KEY = 'hq.data';
export const PREV_KEY = 'hq.prev';
export const BROKEN_PREFIX = 'hq.broken.';
export const MAX_BROKEN = 3;
export const MAX_RESTORE_BYTES = 200 * 1024;
export const MAX_REV_VALUE = Number.MAX_SAFE_INTEGER - 1;
const MAX_LIST = 5000;
const MAX_ID = 32;
const MAX_RUN_Q = 20;
// 저장할 때마다 1씩 오르므로, 안전하게 더할 수 있는 범위 안에서만 허용한다
const MAX_REV = MAX_REV_VALUE;

// 기록 세대 식별자. 초기화·번호 순환 때 새로 발급해, 번호가 같아도 다른 세대면 충돌로 본다.
export function newGen() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// 다음 저장 번호. 상한에 닿으면 새 세대의 1번으로 넘어간다(항상 다시 읽히고 이어서 저장 가능).
function bump(stamp) {
  return stamp.rev + 1 < MAX_REV ? { gen: stamp.gen, rev: stamp.rev + 1 } : { gen: newGen(), rev: 1 };
}
const MODES = ['stage', 'boss', 'retry', 'review'];
const RUN_SIZE = { stage: [6, 6], boss: [10, 10], retry: [1, 10], review: [1, 10] };

// 스키마를 올릴 때: MIGRATIONS[n] = (vN) => { vN 형식을 검사하고 schema n+1 객체를 돌려준다 }
export const MIGRATIONS = {};

export function newData() {
  return {
    schema: CURRENT_SCHEMA, gen: newGen(), rev: 0, nickname: '탐험가', xp: 0, coins: 0,
    streak: { count: 0, lastDate: null }, stars: {}, lastWorld: null, seen: [], wrong: {},
    triedToday: { date: null, ids: [] }, lastBackupDate: null, settings: { sound: true }, activeRun: null,
  };
}

class Corrupt extends Error {}
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function int(v, max, what) {
  if (!Number.isInteger(v) || v < 0 || v > max) throw new Corrupt(`${what} 값이 올바르지 않아요`);
  return v;
}
function dateOrNull(v, what) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string' || !DATE_RE.test(v)) throw new Corrupt(`${what} 날짜가 올바르지 않아요`);
  return v;
}
function idStr(v) {
  if (typeof v !== 'string' || v.length === 0 || v.length > MAX_ID) throw new Corrupt('id가 올바르지 않아요');
  return v;
}
function idList(v, what) {
  if (!Array.isArray(v) || v.length > MAX_LIST) throw new Corrupt(`${what} 목록이 올바르지 않아요`);
  return [...new Set(v.map(idStr))];
}
function obj(v, what) {
  if (!isObj(v)) throw new Corrupt(`${what} 형식이 올바르지 않아요`);
  return v;
}
function genStr(v) {
  if (typeof v !== 'string' || v.length < 1 || v.length > 64) throw new Corrupt('기록 세대 정보가 올바르지 않아요');
  return v;
}
function nickname(v) {
  if (typeof v !== 'string') throw new Corrupt('닉네임이 올바르지 않아요');
  const t = v.trim();
  const len = [...t].length;
  if (len < 1 || len > 12) throw new Corrupt('닉네임은 1~12자여야 해요');
  return t;
}

function shapeRun(r) {
  if (!isObj(r) || typeof r.runId !== 'string' || r.runId.length > 40 || !MODES.includes(r.mode)) throw new Corrupt('run');
  if (!Array.isArray(r.questions) || r.questions.length < 1 || r.questions.length > MAX_RUN_Q) throw new Corrupt('run');
  return {
    runId: r.runId,
    mode: r.mode,
    stageId: r.stageId === null ? null : idStr(r.stageId),
    contentVersion: int(r.contentVersion, MAX_NUM, '콘텐츠 버전'),
    questions: r.questions.map((q) => {
      if (!isObj(q) || !Array.isArray(q.order) || q.order.length > 10) throw new Corrupt('run');
      const a = q.answer;
      const shapeOk = a === null || typeof a === 'boolean' || Number.isInteger(a) ||
        (Array.isArray(a) && a.length <= 10 && a.every(Number.isInteger));
      if (!shapeOk) throw new Corrupt('run');
      if (q.hidden !== undefined && !(Array.isArray(q.hidden) && q.hidden.length <= 4 && q.hidden.every(Number.isInteger))) throw new Corrupt('run');
      const rec = { id: idStr(q.id), order: q.order.slice(), answer: Array.isArray(a) ? a.slice() : a, correct: null, hint: q.hint === true, flag: q.flag === true };
      if (rec.hint && q.hidden !== undefined) rec.hidden = q.hidden.slice();
      return rec;
    }),
  };
}

// 설계 §6.2 4단계. 누적 기록이 잘못되면 throw, activeRun만 잘못되면 runDropped.
export function validateShape(o, current = CURRENT_SCHEMA) {
  obj(o, '기록');
  const starsIn = obj(o.stars, '별 기록');
  const wrongIn = obj(o.wrong, '오답 노트');
  if (Object.keys(starsIn).length > MAX_LIST || Object.keys(wrongIn).length > MAX_LIST) throw new Corrupt('기록이 너무 많아요');
  // 동적 키 사전은 프로토타입 없는 객체로 만든다(__proto__ 같은 키가 들어와도 안전)
  const stars = Object.create(null);
  for (const [k, v] of Object.entries(starsIn)) stars[idStr(k)] = int(v, 3, '별');
  const wrong = Object.create(null);
  for (const [k, v] of Object.entries(wrongIn)) wrong[idStr(k)] = { streak: int(obj(v, '오답 노트').streak, GRADUATE_STREAK - 1, '연속 정답') };
  const streak = obj(o.streak, '연속 학습일');
  const tried = obj(o.triedToday, '오늘 기록');
  const settings = obj(o.settings, '설정');
  const lastWorld = o.lastWorld ?? null;
  if (lastWorld !== null) int(lastWorld, 99, '최근 월드');

  const data = {
    schema: current,
    gen: genStr(o.gen),
    rev: int(o.rev, MAX_REV, '저장 번호'),
    nickname: nickname(o.nickname),
    xp: int(o.xp, MAX_NUM, 'XP'),
    coins: int(o.coins, MAX_NUM, '코인'),
    streak: { count: int(streak.count, MAX_STREAK, '연속 학습일'), lastDate: dateOrNull(streak.lastDate, '연속 학습일') },
    stars,
    lastWorld,
    seen: idList(o.seen, '푼 문제'),
    wrong,
    triedToday: { date: dateOrNull(tried.date, '오늘 기록'), ids: idList(tried.ids, '오늘 푼 문제') },
    lastBackupDate: dateOrNull(o.lastBackupDate, '백업'),
    settings: { sound: settings.sound !== false },
    activeRun: null,
  };
  let runDropped = false;
  if (o.activeRun !== null && o.activeRun !== undefined) {
    try { data.activeRun = shapeRun(o.activeRun); } catch { runDropped = true; }
  }
  return { data, runDropped };
}

// 설계 §6.2 1~4단계. 저장 부작용 없음.
export function decode(text, { current = CURRENT_SCHEMA, migrations = MIGRATIONS } = {}) {
  let o;
  try { o = JSON.parse(text); } catch { return { status: 'corrupt', reason: 'JSON 형식이 아니에요' }; }
  if (!isObj(o) || !Number.isInteger(o.schema) || o.schema < 1) return { status: 'corrupt', reason: '버전 정보가 없어요' };
  if (o.schema > current) return { status: 'future' };
  try {
    let migrated = false;
    while (o.schema < current) {
      const step = migrations[o.schema];
      if (!step) throw new Corrupt('지원하지 않는 옛 버전이에요');
      const next = step(o);
      if (!isObj(next) || next.schema !== o.schema + 1) throw new Corrupt('옛 버전을 바꾸지 못했어요');
      o = next;
      migrated = true;
    }
    const { data, runDropped } = validateShape(o, current);
    return { status: 'ok', data, migrated, runDropped };
  } catch (e) {
    return { status: 'corrupt', reason: e instanceof Corrupt ? e.message : '기록을 해석하지 못했어요' };
  }
}

// 설계 §6.5 activeRun 검증(재개 기준). 통과하면 correct를 다시 계산한 회차, 아니면 null.
export function checkRun(run, index) {
  if (run.contentVersion !== index.contentVersion) return null;
  const [lo, hi] = RUN_SIZE[run.mode];
  if (run.questions.length < lo || run.questions.length > hi) return null;
  const stageId = run.stageId === null ? null : (index.renamed[run.stageId] || run.stageId);
  if (run.mode === 'review') {
    if (stageId !== null) return null;
  } else if (run.mode === 'retry') {
    if (stageId !== null && !index.stages.has(stageId)) return null;
  } else {
    const st = index.stages.get(stageId);
    if (!st || st.kind !== (run.mode === 'boss' ? 'boss' : 'normal')) return null;
  }
  const ids = new Set();
  const questions = [];
  for (const r of run.questions) {
    if (ids.has(r.id)) return null;
    ids.add(r.id);
    const q = index.questions.get(r.id);
    if (!q || !isPermutation(r.order, optionCount(q)) || !isValidAnswer(q, r.answer)) return null;
    if (r.hint && q.type !== 'mcq') return null;
    if (q.fixedOrder && !r.order.every((v, i) => v === i)) return null; // 고정 순서 문항(설계 v7 §4)
    if (r.hint) {
      const h = r.hidden;
      const okHidden = Array.isArray(h) && h.length === hideCount(q) && new Set(h).size === h.length &&
        h.every((i) => Number.isInteger(i) && i >= 0 && i < q.choices.length && i !== q.answer);
      if (!okHidden) return null;
      if (r.answer !== null && h.includes(r.answer)) return null;
    }
    questions.push({ ...r, correct: r.answer === null ? null : grade(q, r.answer) });
  }
  return { ...run, stageId, questions };
}

// 설계 §6.2 5단계. 콘텐츠를 모두 불러오고 검증한 뒤에만 호출한다.
export function normalizeWithContent(data, index) {
  const renamed = index.renamed || {};
  const stars = Object.create(null);
  for (const [k, v] of Object.entries(data.stars)) {
    const nk = renamed[k] || k;
    if (index.stages.has(nk)) stars[nk] = Math.max(stars[nk] || 0, v);
  }
  const has = (id) => index.questions.has(id);
  const wrong = Object.create(null);
  for (const [k, v] of Object.entries(data.wrong)) if (has(k)) wrong[k] = v;
  let activeRun = data.activeRun;
  let runDropped = false;
  if (activeRun) {
    activeRun = checkRun(activeRun, { ...index, renamed });
    runDropped = activeRun === null;
  }
  return {
    data: { ...data, stars, seen: data.seen.filter(has), wrong, triedToday: { date: data.triedToday.date, ids: data.triedToday.ids.filter(has) }, activeRun },
    runDropped,
  };
}

export class Store {
  constructor(storage, { now = () => Date.now(), current = CURRENT_SCHEMA, migrations = MIGRATIONS } = {}) {
    this.s = storage;
    this.now = now;
    this.opts = { current, migrations };
  }

  // 저장소의 (세대, 번호). 없으면 { gen: null, rev: 0 }, 읽을 수 없으면 null.
  storedStamp() {
    const raw = this.s.getItem(KEY);
    if (raw === null) return { gen: null, rev: 0 };
    try {
      const o = JSON.parse(raw);
      const okRev = Number.isSafeInteger(o?.rev) && o.rev >= 0 && o.rev <= MAX_REV;
      return okRev && typeof o.gen === 'string' ? { gen: o.gen, rev: o.rev } : null;
    } catch {
      return null;
    }
  }

  // 메모리 기록이 저장소의 최신 기록과 같은 세대·번호인가(다른 탭이 먼저 쓰지 않았는가)
  isCurrent(data) {
    const st = this.storedStamp();
    if (!st) return false;
    if (st.gen === null) return data.rev === 0; // 아직 저장한 적 없음
    return st.gen === data.gen && st.rev === data.rev;
  }

  // 설계 §6.3
  load() {
    const raw = this.s.getItem(KEY);
    if (raw === null) return { status: 'new', data: newData() };
    const r = decode(raw, this.opts);
    if (r.status === 'future') return { status: 'future' };
    if (r.status === 'corrupt') return { status: 'corrupt', raw, reason: r.reason, kept: this.keepBroken(raw) };
    if (!r.migrated) return { status: 'ok', data: r.data, runDropped: r.runDropped };
    try { this.s.setItem(PREV_KEY, raw); } catch { return { status: 'ok', data: r.data, runDropped: r.runDropped, readOnly: true }; }
    const next = { ...r.data, ...bump(r.data) };
    try { this.s.setItem(KEY, JSON.stringify(next)); } catch { return { status: 'ok', data: r.data, runDropped: r.runDropped, readOnly: true }; }
    return { status: 'ok', data: next, runDropped: r.runDropped };
  }

  keepBroken(raw) {
    try {
      this.s.setItem(BROKEN_PREFIX + this.now(), raw);
    } catch {
      return false;
    }
    const keys = [];
    for (let i = 0; i < this.s.length; i++) {
      const k = this.s.key(i);
      if (k && k.startsWith(BROKEN_PREFIX)) keys.push(k);
    }
    keys.sort();
    while (keys.length > MAX_BROKEN) this.s.removeItem(keys.shift());
    return true;
  }

  // 설계 §6.7 — 저장소의 rev가 메모리와 다르면 저장하지 않는다
  save(data) {
    if (!this.isCurrent(data)) return { ok: false, reason: 'conflict' };
    const next = { ...data, ...bump(data) };
    try { this.s.setItem(KEY, JSON.stringify(next)); } catch { return { ok: false, reason: 'quota' }; }
    return { ok: true, data: next };
  }

  // 손상 기록 뒤 "새로 시작"·"모든 기록 지우기" 전용
  overwrite(data) {
    // 새 세대로 시작한다. 이전 세대를 들고 있는 다른 탭은 번호가 같아도 충돌로 거부된다.
    const next = { ...data, gen: newGen(), rev: 1 };
    try { this.s.setItem(KEY, JSON.stringify(next)); } catch { return { ok: false, reason: 'quota' }; }
    return { ok: true, data: next };
  }

  // 설계 §6.4 — 후보만 만든다(쓰기 없음)
  prepareRestore(text, index) {
    if (typeof text !== 'string' || !text.trim()) return { status: 'corrupt', reason: '붙여넣은 내용이 없어요' };
    if (new TextEncoder().encode(text).length > MAX_RESTORE_BYTES) return { status: 'corrupt', reason: '백업이 너무 커요' };
    const r = decode(text.trim(), this.opts);
    if (r.status !== 'ok') return r;
    const { data, runDropped } = normalizeWithContent(r.data, index);
    return {
      status: 'ok',
      runDropped: r.runDropped || runDropped, // 진행 중이던 회차는 복원하지 않았음을 화면에 알리기 위해
      candidate: data,
      preview: { nickname: data.nickname, xp: data.xp, stars: Object.values(data.stars).reduce((a, v) => a + v, 0), wrong: Object.keys(data.wrong).length },
    };
  }

  commitRestore(current, candidate) {
    if (!this.isCurrent(current)) return { ok: false, reason: 'conflict' };
    // 메모리의 최신 상태를 보관한다(저장 실패 뒤 진행한 기록까지 남기기 위해)
    try { this.s.setItem(PREV_KEY, JSON.stringify(current)); } catch { return { ok: false, reason: 'prev-failed' }; }
    const next = { ...candidate, ...bump(current) }; // 현재 기록의 세대를 이어 간다
    try { this.s.setItem(KEY, JSON.stringify(next)); } catch { return { ok: false, reason: 'quota' }; }
    return { ok: true, data: next };
  }

  exportBackup(data) {
    return JSON.stringify(data);
  }
}
