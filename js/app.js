import { Store, newData, normalizeWithContent, KEY } from './store.js';
import { loadContent } from './loader.js';
import { todayStr } from './util.js';
import * as G from './game.js';
import { mount } from './dom.js';
import { beep } from './sound.js';
import { setupSW, applyUpdate, checkForUpdate, swStatus } from './sw-client.js';
import { renderHome } from './views/home.js';
import { renderWorld } from './views/world.js';
import { renderPlay } from './views/play.js';
import { renderResult } from './views/result.js';
import { renderWrong } from './views/wrong.js';
import { renderCards } from './views/cards.js';
import { renderSettings } from './views/settings.js';
import { renderWelcome } from './views/welcome.js';
import { renderFatal } from './views/fatal.js';

const WELCOME_KEY = 'hq.welcome';
const root = document.getElementById('app');
const state = {
  data: null, index: null, readOnly: false, summary: null, qi: 0, drafts: {}, sheetOpen: false,
  fatal: null, swWaiting: false, bossNudge: false, restore: null, backupText: null,
};
let store = null;
let lastRoute = '';

const ctx = {
  state, go, render, toast, isStandalone,
  startStage, startBoss, startReview, startRetry,
  confirm: confirmAnswer, hint, flag, setQi, submitWithConfirm,
  saveNickname, toggleSound, makeBackup, prepareRestore, commitRestore, cancelRestore, resetAll, skipWelcome,
  startFresh, updateFromFuture, applyUpdate: () => applyUpdate(ctx), swStatus, persistNow: persist,
};

// ---- 표시 ----
function isStandalone() {
  return navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function render() {
  if (state.fatal) { mount(root, renderFatal(ctx)); return; }
  if (!state.data) return;
  const route = location.hash.replace(/^#\/?/, '') || 'home';
  const [name, arg] = route.split('/');
  let view = null;
  switch (name) {
    case 'welcome': view = renderWelcome(ctx); break;
    case 'world': view = renderWorld(ctx, Number(arg)); break;
    case 'play': view = state.data.activeRun ? renderPlay(ctx) : null; break;
    case 'result': view = state.summary ? renderResult(ctx) : null; break;
    case 'wrong': view = renderWrong(ctx); break;
    case 'cards': view = renderCards(ctx); break;
    case 'settings': view = renderSettings(ctx); break;
    default: view = renderHome(ctx);
  }
  if (!view) { location.replace('#/home'); return; }
  mount(root, view);
  if (route !== lastRoute) { window.scrollTo(0, 0); lastRoute = route; }
}

// ---- 저장 ----
function persist() {
  if (state.readOnly) return false;
  const r = store.save(state.data);
  if (r.ok) { state.data = r.data; return true; }
  if (r.reason === 'conflict') { enterConflict(); return false; }
  toast('저장하지 못했어요 — 설정에서 백업을 권장해요');
  return false;
}

function commit(fn) {
  const next = fn(state.data);
  if (!next || next === state.data) return false;
  state.data = next;
  state.backupText = null; // 기록이 바뀌면 이전 백업 텍스트는 낡은 것이므로 숨긴다
  let saved = false;
  if (state.readOnly) toast('읽기 전용 상태라 저장되지 않아요');
  else saved = persist();
  render();
  return saved; // 메모리 변경이 아니라 "저장까지 성공했는지"를 돌려준다
}

function enterConflict() {
  state.readOnly = true;
  state.fatal = { kind: 'conflict' };
  render();
}

// ---- 회차 ----
function beginRun(run) {
  if (state.data.activeRun && !window.confirm('진행 중인 도전을 포기할까요?')) return;
  state.qi = 0;
  state.drafts = {};
  state.sheetOpen = false;
  state.summary = null;
  commit((d) => ({ ...G.abandonRun(d), activeRun: run }));
  go('#/play');
}

function startStage(stageId) {
  const st = state.index.stages.get(stageId);
  const ids = st && G.pickStage(st.questionIds, state.index.questions);
  if (!ids) { toast('문제를 준비하지 못했어요'); return; }
  beginRun(G.newRun({ mode: 'stage', stageId, questionIds: ids, index: state.index }));
}

function startBoss(stageId) {
  const st = state.index.stages.get(stageId);
  const ids = st && G.pickBoss(st.worldNormals.map((id) => state.index.stages.get(id)), state.index.questions);
  if (!ids) { toast('보스 문제를 준비하지 못했어요'); return; }
  beginRun(G.newRun({ mode: 'boss', stageId, questionIds: ids, index: state.index }));
}

function startReview() {
  const ids = G.pickReview(state.data, state.index, todayStr());
  if (!ids.length) { toast('복습할 문제가 없어요'); return; }
  beginRun(G.newRun({ mode: 'review', stageId: null, questionIds: ids, index: state.index }));
}

function startRetry() {
  const s = state.summary;
  if (!s || !s.wrongIds.length) return;
  beginRun(G.newRun({ mode: 'retry', stageId: s.stageId, questionIds: s.wrongIds, index: state.index }));
}

function confirmAnswer(qi, answer) {
  const before = state.data.activeRun;
  const run = G.confirmAnswer(before, qi, answer, state.index);
  if (run === before) return;
  delete state.drafts[before.questions[qi].id];
  if (state.data.settings.sound) beep(run.questions[qi].correct);
  commit((d) => ({ ...d, activeRun: run }));
}

function hint(qi) {
  commit((d) => G.useHint(d, qi, state.index));
}

function flag(qi) {
  commit((d) => ({ ...d, activeRun: G.toggleFlag(d.activeRun, qi) }));
}

function setQi(i) {
  state.qi = i;
  render();
  document.querySelector('.q-area')?.scrollIntoView({ block: 'start' });
}

function submitWithConfirm() {
  const run = state.data.activeRun;
  if (!run) return;
  const left = run.questions.filter((r) => r.answer === null).length;
  if (left > 0 && !window.confirm(`아직 안 푼 문제가 ${left}개 있어요. 제출하면 틀린 것으로 처리돼요. 제출할까요?`)) return;
  settleNow();
}

function settleNow() {
  const run = state.data.activeRun;
  if (!run) return;
  const res = G.settle(state.data, run.runId, state.index, todayStr());
  if (!res) return;
  state.summary = res.summary;
  if (res.summary.bossFirstClear) state.bossNudge = true;
  state.data = res.data; // 메모리에서 activeRun을 먼저 비운다(중복 정산 방지)
  state.backupText = null;
  if (!state.readOnly) persist();
  go('#/result');
}

// ---- 설정 ----
function saveNickname(text) {
  const t = String(text).trim();
  const len = [...t].length;
  if (len < 1 || len > 12) { toast('닉네임은 1~12자로 적어 주세요'); return; }
  if (commit((d) => ({ ...d, nickname: t }))) toast('저장했어요');
}

function toggleSound() {
  commit((d) => ({ ...d, settings: { ...d.settings, sound: !d.settings.sound } }));
}

function makeBackup() {
  const today = todayStr();
  if (state.data.lastBackupDate !== today) commit((d) => ({ ...d, lastBackupDate: today }));
  state.backupText = store.exportBackup(state.data);
  state.bossNudge = false;
  render();
}

function prepareRestore(text) {
  state.restore = store.prepareRestore(text, state.index);
  render();
}

function commitRestore() {
  const cand = state.restore?.candidate;
  if (!cand) return;
  const r = store.commitRestore(state.data, cand);
  state.restore = null;
  if (r.ok) {
    state.data = r.data;
    state.summary = null;
    state.backupText = null;
    state.readOnly = false;
    state.drafts = {};
    state.qi = 0;
    state.sheetOpen = false;
    toast('복원했어요');
  } else if (r.reason === 'conflict') {
    enterConflict();
    return;
  } else {
    toast('복원하지 못했어요 — 기존 기록은 그대로예요');
  }
  render();
}

function cancelRestore() {
  state.restore = null;
  render();
}

function resetAll() {
  if (!window.confirm('모든 기록을 지울까요? 되돌릴 수 없어요.')) return;
  if (!window.confirm('정말 지울까요? 백업을 먼저 해 두는 게 좋아요.')) return;
  if (state.readOnly) { toast('읽기 전용 상태에서는 지울 수 없어요'); return; }
  if (!store.isCurrent(state.data)) { enterConflict(); return; }
  const r = store.overwrite(newData());
  if (!r.ok) { toast('지우지 못했어요'); return; }
  state.data = r.data;
  state.summary = null;
  state.backupText = null;
  state.readOnly = false;
  go('#/home');
}

function skipWelcome() {
  try { localStorage.setItem(WELCOME_KEY, '1'); } catch { /* 안내만 다시 보일 뿐 */ }
  go('#/home');
}

// ---- 오류 화면 동작 ----
function startFresh() {
  if (!window.confirm('새로 시작할까요? 읽지 못한 원본은 따로 보관되어 있어요.')) return;
  // 확인창을 보는 사이 다른 탭이 기록을 바꿨다면 덮어쓰지 않는다
  if (state.fatal?.kind !== 'corrupt' || localStorage.getItem(KEY) !== state.fatal.raw) { enterConflict(); return; }
  const r = store.overwrite(newData());
  if (r.ok) location.reload();
  else toast('저장소에 쓸 수 없어요');
}

async function updateFromFuture() {
  if (await checkForUpdate()) await applyUpdate(ctx, { skipSave: true });
  else toast('아직 새 버전을 받지 못했어요. 인터넷 연결 후 다시 눌러 주세요.');
}

// ---- 부팅 ----
function watchOtherTabs() {
  window.addEventListener('storage', (e) => { if (e.key === KEY || e.key === null) enterConflict(); });
  // 쓰기 권한은 가장 나중에 연 탭 하나만 갖는다(설계 §6.7 보강)
  if (typeof BroadcastChannel !== 'undefined') {
    const writer = new BroadcastChannel('hq-writer');
    writer.onmessage = (e) => { if (e.data === 'claim') enterConflict(); };
    writer.postMessage('claim');
  }
}

function welcomeSeen() {
  try { return localStorage.getItem(WELCOME_KEY) === '1'; } catch { return true; }
}

async function boot() {
  try {
    store = new Store(window.localStorage);
    window.localStorage.getItem(KEY);
  } catch {
    state.fatal = { kind: 'nostorage' };
    render();
    return;
  }
  watchOtherTabs(); // 오류 화면에 머무는 동안에도 다른 탭의 변경을 감지한다
  const loaded = store.load();
  if (loaded.status === 'future') { state.fatal = { kind: 'future' }; setupSW(ctx); render(); return; }
  if (loaded.status === 'corrupt') { state.fatal = { kind: 'corrupt', raw: loaded.raw, kept: loaded.kept, reason: loaded.reason }; render(); return; }
  try {
    state.index = await loadContent();
  } catch (e) {
    state.fatal = { kind: 'loadfail', detail: String(e?.message || e) };
    setupSW(ctx);
    render();
    return;
  }
  const n = normalizeWithContent(loaded.data, state.index);
  state.data = n.data;
  state.readOnly = !!loaded.readOnly;
  if (loaded.readOnly) toast('기록을 옮기지 못해 읽기 전용으로 열었어요 — 설정에서 백업해 주세요');
  if (loaded.runDropped || n.runDropped) toast('진행 중이던 도전을 불러오지 못했어요');

  window.addEventListener('hashchange', render);
  setupSW(ctx);
  if (isStandalone() && navigator.storage?.persist) navigator.storage.persist().catch(() => {});

  if (loaded.status === 'new' && !isStandalone() && !welcomeSeen()) location.hash = '#/welcome';
  else if (state.data.activeRun) {
    const first = state.data.activeRun.questions.findIndex((r) => r.answer === null);
    if (first === -1) { settleNow(); return; } // 정산 저장 전에 닫혔던 회차는 바로 정산(설계 §5.9)
    state.qi = first;
    location.hash = '#/play';
  }
  render();
}

boot();
