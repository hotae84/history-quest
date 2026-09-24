let reg = null;
let updateRequested = false;

export async function setupSW(ctx) {
  if (!('serviceWorker' in navigator)) return;
  try {
    reg = await navigator.serviceWorker.register('sw.js');
  } catch {
    return;
  }
  const check = () => {
    if (reg.waiting && navigator.serviceWorker.controller) {
      ctx.state.swWaiting = true;
      ctx.render();
    }
  };
  check();
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') check(); });
  });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // 최초 설치로 제어권을 얻을 때는 새로고침하지 않는다(풀이 도중 화면 유지)
    if (updateRequested && !reloading) { reloading = true; location.reload(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reg.update().catch(() => {});
  });
}

export async function checkForUpdate() {
  if (!reg) return false;
  await reg.update().catch(() => {});
  return !!reg.waiting;
}

// 대기 중인 서비스 워커에게 이 앱의 창 개수를 묻는다. 답이 없으면 안전하게 "열려 있음"으로 본다.
function windowCount(worker) {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    const timer = setTimeout(() => resolve(Infinity), 2000);
    ch.port1.onmessage = (e) => { clearTimeout(timer); resolve(Number(e.data?.windows) || Infinity); };
    worker.postMessage({ type: 'COUNT_WINDOWS' }, [ch.port2]);
  });
}

// 설계 §9 — 다른 탭이 있으면 보류, 저장 실패면 중단
export async function applyUpdate(ctx, { skipSave = false } = {}) {
  if (!reg?.waiting) return;
  if ((await windowCount(reg.waiting)) > 1) { ctx.toast('다른 탭을 닫은 뒤 다시 눌러 주세요'); return; }
  if (!skipSave) {
    // 읽기 전용이면 메모리의 진행을 저장할 수 없으므로 업데이트하지 않는다
    if (ctx.state.readOnly) { ctx.toast('읽기 전용 상태라 업데이트할 수 없어요 — 설정에서 백업해 주세요'); return; }
    if (ctx.state.data && !ctx.persistNow()) { ctx.toast('저장하지 못해 업데이트를 멈췄어요'); return; }
  }
  updateRequested = true;
  const ch = new MessageChannel();
  ch.port1.onmessage = (e) => {
    if (!e.data?.ok) { updateRequested = false; ctx.toast('다른 탭을 닫은 뒤 다시 눌러 주세요'); }
  };
  reg.waiting.postMessage({ type: 'SKIP_WAITING' }, [ch.port2]);
}

export function swStatus() {
  return new Promise((resolve) => {
    const c = navigator.serviceWorker?.controller;
    if (!c) { resolve(null); return; }
    const ch = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 1500);
    ch.port1.onmessage = (e) => { clearTimeout(timer); resolve(e.data); };
    c.postMessage({ type: 'STATUS' }, [ch.port2]);
  });
}
