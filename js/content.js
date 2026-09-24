export const TYPES = ['mcq', 'ox', 'blank', 'order', 'match'];
export const STAGE_PICK = 6;
export const BOSS_PICK = 10;
export const BOSS_MIN_PER_STAGE = 3;

const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;
const strList = (a) => Array.isArray(a) && a.every(nonEmpty);
const unique = (a) => new Set(a).size === a.length;

export function checkQuestion(q) {
  if (!q || typeof q !== 'object') return ['문제 형식 오류'];
  const w = typeof q.id === 'string' ? q.id : '(id 없음)';
  const e = [];
  if (typeof q.id !== 'string' || !/^q\d{4}$/.test(q.id)) e.push(`${w}: id는 q0000 형식`);
  if (!nonEmpty(q.concept)) e.push(`${w}: concept 필요`);
  if (!TYPES.includes(q.type)) e.push(`${w}: 알 수 없는 type`);
  if (!nonEmpty(q.q)) e.push(`${w}: q 필요`);
  if (!nonEmpty(q.explain)) e.push(`${w}: explain 필요`);
  if (typeof q.ref !== 'string' || !/^\d{1,3}(-\d{1,3})?(,\d{1,3}(-\d{1,3})?)*$/.test(q.ref)) e.push(`${w}: ref(교과서 쪽, 예: "122", "122-123", "167,174") 필요`);
  switch (q.type) {
    case 'mcq':
    case 'blank': {
      const [lo, hi] = q.type === 'mcq' ? [4, 5] : [3, 5];
      if (!strList(q.choices) || q.choices.length < lo || q.choices.length > hi) e.push(`${w}: 보기 ${lo === hi ? lo : `${lo}~${hi}`}개`);
      else if (!unique(q.choices)) e.push(`${w}: 보기 중복`);
      else if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.choices.length) e.push(`${w}: answer 범위`);
      break;
    }
    case 'ox':
      if (typeof q.answer !== 'boolean') e.push(`${w}: ox answer는 true/false`);
      break;
    case 'order':
      if (!strList(q.items) || q.items.length < 3 || q.items.length > 5 || !unique(q.items)) e.push(`${w}: order 항목 3~5개(중복 없음)`);
      break;
    case 'match':
      if (!Array.isArray(q.pairs) || q.pairs.length < 2 || q.pairs.length > 5 ||
          !q.pairs.every((p) => Array.isArray(p) && p.length === 2 && strList(p)) ||
          !unique(q.pairs.map((p) => p[0])) || !unique(q.pairs.map((p) => p[1]))) e.push(`${w}: match 쌍 2~5개(중복 없음)`);
      break;
  }
  // 보기를 섞는 문항의 해설은 보기 번호(①~⑤)로 가리키면 화면 번호와 어긋난다
  if (typeof q.explain === 'string' && /[①②③④⑤]/.test(q.explain) && !((q.type === 'mcq' && q.fixedOrder) || q.type === 'ox')) e.push(`${w}: 해설에 보기 번호(①~⑤)를 쓰지 말 것 — 보기가 섞여 번호가 달라짐`);
  // 선다형 전용 필드(설계 v7 §4·§7.1)
  if (q.type === 'mcq') {
    if (q.passage !== undefined && (!nonEmpty(q.passage) || q.passage.length > 600)) e.push(`${w}: passage는 1~600자`);
    if (q.passageLabel !== undefined && !['자료', '보기'].includes(q.passageLabel)) e.push(`${w}: passageLabel은 자료/보기`);
    if (q.passageLabel !== undefined && q.passage === undefined) e.push(`${w}: passageLabel만 있고 passage 없음`);
    if (q.fixedOrder !== undefined && typeof q.fixedOrder !== 'boolean') e.push(`${w}: fixedOrder는 true/false`);
  } else if (q.passage !== undefined || q.passageLabel !== undefined || q.fixedOrder !== undefined) {
    e.push(`${w}: passage·passageLabel·fixedOrder는 mcq 전용`);
  }
  return e;
}

// 문항의 세부 유형(검사 도구 집계용)
export const NEGATIVE_RE = /옳지 않은|아닌|틀린/;
export function mcqKind(q) {
  if (q.type !== 'mcq') return null;
  if (q.passage === undefined) return 'sentence';
  return q.passageLabel === '보기' ? 'combo' : 'source';
}

export function optionCount(q) {
  switch (q.type) {
    case 'mcq':
    case 'blank': return q.choices.length;
    case 'ox': return 2;
    case 'order': return q.items.length;
    case 'match': return q.pairs.length;
    default: return 0;
  }
}

// 개념당 최대 2문제까지 뽑을 수 있을 때 한 스테이지에서 뽑을 수 있는 최대 문제 수
export function conceptCapacity(stage, questions) {
  const cnt = {};
  for (const id of stage.questionIds) {
    const c = questions.get(id).concept;
    cnt[c] = (cnt[c] || 0) + 1;
  }
  return Object.values(cnt).reduce((a, v) => a + Math.min(v, 2), 0);
}

export function buildIndex(content, worldJsons) {
  const errors = [];
  if (!content || !Number.isInteger(content.contentVersion) || content.contentVersion < 1) errors.push('content.json: contentVersion 오류');
  if (!Array.isArray(content?.worlds) || content.worlds.length === 0) errors.push('content.json: worlds 오류');
  const renamed = content && content.renamed && typeof content.renamed === 'object' ? content.renamed : {};
  const worlds = [];
  const stages = new Map();
  const questions = new Map();

  (content?.worlds || []).forEach((n, wi) => {
    const wj = worldJsons[wi];
    if (!wj || wj.world !== n) { errors.push(`world-${n}.json: world 번호 불일치`); return; }
    if (!nonEmpty(wj.title) || !nonEmpty(wj.unit)) errors.push(`world-${n}.json: title/unit 필요`);
    if (!Array.isArray(wj.stages)) { errors.push(`world-${n}.json: stages 필요`); return; }
    const normalIds = wj.stages.filter((s) => s && s.kind === 'normal').map((s) => s.id);
    const worldStages = [];
    for (const s of wj.stages) {
      if (!s || typeof s.id !== 'string' || !/^w\d+(s\d+|boss)$/.test(s.id)) { errors.push(`world-${n}.json: stage id 오류`); continue; }
      if (stages.has(s.id)) errors.push(`${s.id}: stage id 중복`);
      if (s.kind !== 'normal' && s.kind !== 'boss') errors.push(`${s.id}: kind 오류`);
      if (!nonEmpty(s.title)) errors.push(`${s.id}: title 필요`);
      if (s.kind === 'boss' && s.questions !== undefined) errors.push(`${s.id}: 보스는 questions를 갖지 않음`);
      if (s.kind === 'normal' && !Array.isArray(s.questions)) errors.push(`${s.id}: questions 필요`);
      const questionIds = [];
      for (const q of s.kind === 'normal' && Array.isArray(s.questions) ? s.questions : []) {
        errors.push(...checkQuestion(q));
        if (q && typeof q.id === 'string') {
          if (questions.has(q.id)) errors.push(`${q.id}: 문제 id 중복`);
          questions.set(q.id, { ...q, stageId: s.id, world: n });
          questionIds.push(q.id);
        }
      }
      const card = s.card && nonEmpty(s.card.name) ? { name: s.card.name, desc: String(s.card.desc || '') } : null;
      const st = { id: s.id, kind: s.kind, title: s.title, card, world: n, questionIds, playable: false, worldNormals: normalIds };
      stages.set(s.id, st);
      worldStages.push(st);
    }
    worlds.push({ world: n, title: wj.title, unit: wj.unit, stages: worldStages });
  });

  if (errors.length === 0) {
    for (const st of stages.values()) {
      if (st.kind === 'normal') {
        st.playable = st.questionIds.length >= STAGE_PICK && conceptCapacity(st, questions) >= STAGE_PICK;
      } else {
        const ns = st.worldNormals.map((id) => stages.get(id));
        // 스테이지마다 개념 제한(최대 2)을 지키며 3문제 이상 뽑을 수 있어야 한다
        st.playable = ns.length > 0 &&
          ns.every((x) => conceptCapacity(x, questions) >= BOSS_MIN_PER_STAGE) &&
          ns.reduce((a, x) => a + conceptCapacity(x, questions), 0) >= BOSS_PICK;
      }
    }
  }
  return { index: { contentVersion: content?.contentVersion, renamed, worlds, stages, questions }, errors };
}

// 배포용 전체 데이터 기준(설계 §2·§13.1). 시범 데이터에는 쓰지 않는다.
export function strictErrors(index, { total = 100, worlds = 4, mix = true } = {}) {
  const e = [];
  if (mix) e.push(...mixErrors(index, total));
  return e.concat(structureErrors(index, { total, worlds }));
}

function mixErrors(index, total) {
  const e = [];
  // 유형 비율(설계 v7 §2): 선다 70·순서 12·기타 18은 정확히, 선다 세부는 목표 ±3, 부정형 ≤ 23
  const all = [...index.questions.values()];
  const n = (pred) => all.filter(pred).length;
  const scale = total / 100;
  const expect = (label, got, want, tol = 0) => {
    const w = Math.round(want * scale);
    if (Math.abs(got - w) > tol) e.push(`${label} ${got}개 (기준 ${w}${tol ? `±${tol}` : ''})`);
  };
  expect('선다형', n((q) => q.type === 'mcq'), 70);
  expect('연표 순서', n((q) => q.type === 'order'), 12);
  expect('O/X·빈칸·짝', n((q) => ['ox', 'blank', 'match'].includes(q.type)), 18);
  expect('자료 제시형', n((q) => mcqKind(q) === 'source'), 38, 3);
  expect('〈보기〉 조합형', n((q) => mcqKind(q) === 'combo'), 16, 3);
  expect('문장형 선다', n((q) => mcqKind(q) === 'sentence'), 16, 3);
  const neg = n((q) => q.type === 'mcq' && NEGATIVE_RE.test(q.q));
  if (neg > Math.round(23 * scale)) e.push(`부정형 선다 ${neg}개 (최대 ${Math.round(23 * scale)})`);
  return e;
}

// 유형 수량 집계(검사 도구가 항상 출력)
export function mixSummary(index) {
  const all = [...index.questions.values()];
  const n = (pred) => all.filter(pred).length;
  return {
    mcq: n((q) => q.type === 'mcq'), source: n((q) => mcqKind(q) === 'source'), combo: n((q) => mcqKind(q) === 'combo'),
    sentence: n((q) => mcqKind(q) === 'sentence'), negative: n((q) => q.type === 'mcq' && NEGATIVE_RE.test(q.q)),
    order: n((q) => q.type === 'order'), other: n((q) => ['ox', 'blank', 'match'].includes(q.type)),
  };
}

function structureErrors(index, { total, worlds }) {
  const e = [];
  if (index.worlds.length !== worlds) e.push(`월드 수 ${index.worlds.length} (기준 ${worlds})`);
  if (index.questions.size !== total) e.push(`전체 문제 수 ${index.questions.size} (기준 ${total})`);
  for (const w of index.worlds) {
    const normals = w.stages.filter((s) => s.kind === 'normal');
    const bosses = w.stages.filter((s) => s.kind === 'boss');
    if (normals.length !== 3) e.push(`월드 ${w.world}: 일반 스테이지는 3개`);
    const worldTotal = normals.reduce((a, s) => a + s.questionIds.length, 0);
    if (worldTotal !== total / worlds) e.push(`월드 ${w.world}: 문제 ${worldTotal}개 (기준 ${total / worlds})`);
    if (bosses.length !== 1 || w.stages[w.stages.length - 1]?.kind !== 'boss') e.push(`월드 ${w.world}: 보스 1개가 마지막에 있어야 함`);
    for (const s of normals) {
      if (s.questionIds.length < 8 || s.questionIds.length > 9) e.push(`${s.id}: 문제 8~9개 (현재 ${s.questionIds.length})`);
      const perConcept = {};
      for (const id of s.questionIds) { const c = index.questions.get(id).concept; perConcept[c] = (perConcept[c] || 0) + 1; }
      const concepts = Object.keys(perConcept);
      if (concepts.length !== 4) e.push(`${s.id}: 개념은 4개 (현재 ${concepts.length})`);
      for (const [c, n] of Object.entries(perConcept)) if (n < 2 || n > 3) e.push(`${s.id}: 개념 「${c}」은 2~3문제 (현재 ${n})`);
      if (!s.card) e.push(`${s.id}: 도감 card 필요`);
      if (!s.playable) e.push(`${s.id}: 출제 불가`);
    }
    for (const b of bosses) if (!b.playable) e.push(`${b.id}: 보스 출제 불가`);
  }
  return e;
}
