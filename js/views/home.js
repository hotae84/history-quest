import { h } from '../dom.js';
import { levelInfo, displayStreak, recommend } from '../game.js';
import { todayStr, daysBetween } from '../util.js';
import { WORLD_EMOJI } from './common.js';

function banner(text, action, onclick) {
  return h('div', { class: 'banner' }, h('p', {}, text), h('button', { class: 'btn small', onclick }, action));
}

function banners(ctx, today) {
  const { data, swWaiting, bossNudge, readOnly } = ctx.state;
  const out = [];
  if (readOnly) out.push(banner('읽기 전용 상태예요. 설정에서 백업해 주세요.', '설정', () => ctx.go('#/settings')));
  if (swWaiting && !data.activeRun) out.push(banner('새 버전이 있어요', '업데이트', () => ctx.applyUpdate()));
  const progress = data.xp > 0 || Object.keys(data.stars).length > 0;
  if (!ctx.isStandalone() && progress) {
    out.push(banner('홈 화면 앱으로 옮기려면: ① 여기서 백업 복사 → ② 홈 화면 앱의 설정에서 복원', '백업하러 가기', () => ctx.go('#/settings')));
  }
  const needBackup = bossNudge ||
    (data.lastBackupDate === null && data.xp >= 300) ||
    (data.lastBackupDate !== null && daysBetween(data.lastBackupDate, today) >= 7);
  if (needBackup) out.push(banner('기록을 백업해 두면 안전해요', '백업하기', () => ctx.go('#/settings')));
  return out;
}

function recommendCard(ctx, today) {
  const { data, index } = ctx.state;
  const r = recommend(data, index, today);
  if (!r) return null;
  let cls = 'rec';
  let title;
  let sub;
  let action;
  let onclick;
  if (r.kind === 'review') {
    [title, sub, action, onclick] = [`오답 복습 ${r.count}문제`, '틀렸던 문제를 오늘 다시 맞혀 기억을 굳혀요', '복습 시작', () => ctx.startReview()];
  } else if (r.kind === 'resume') {
    [title, sub, action, onclick] = ['이어서 하기', '풀던 문제가 기다리고 있어요', '계속하기', () => ctx.go('#/play')];
  } else {
    const st = index.stages.get(r.stageId);
    cls += ` w${st.world}`;
    title = st.title;
    sub = `${WORLD_EMOJI[st.world]} 월드 ${st.world} · ${st.kind === 'boss' ? '👑 보스' : '스테이지'}`;
    action = '도전하기';
    onclick = () => (st.kind === 'boss' ? ctx.startBoss(st.id) : ctx.startStage(st.id));
  }
  return h('section', { class: `card ${cls}` },
    h('div', { class: 'rec-label' }, '오늘의 추천'),
    h('div', { class: 'rec-title' }, title),
    h('p', { class: 'sub' }, sub),
    h('button', { class: 'btn primary', onclick }, action));
}

export function renderHome(ctx) {
  const { data, index } = ctx.state;
  const today = todayStr();
  const lv = levelInfo(data.xp);
  const fill = h('div', { class: 'xp-fill' });
  fill.style.width = `${Math.round((lv.into / lv.need) * 100)}%`;
  const rec = recommend(data, index, today);

  return h('div', { class: 'page home' },
    h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, '⏳'), '역사 퀘스트'),
      h('button', { class: 'icon-btn', 'aria-label': '설정', onclick: () => ctx.go('#/settings') }, '⚙️')),
    banners(ctx, today),
    h('section', { class: 'card hero' },
      h('div', { class: 'hero-top' }, h('span', { class: 'hero-name' }, data.nickname), h('span', { class: 'level-badge' }, `Lv.${lv.level}`)),
      h('div', { class: 'xp-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(lv.need), 'aria-valuenow': String(lv.into) }, fill),
      h('div', { class: 'sub' }, `다음 레벨까지 ${lv.need - lv.into} XP`),
      h('div', { class: 'stats' },
        h('span', { class: 'chip' }, `🔥 ${displayStreak(data.streak, today)}일 연속`),
        h('span', { class: 'chip' }, `🪙 ${data.coins}`),
        h('span', { class: 'chip' }, `📕 오답 ${Object.keys(data.wrong).length}`))),
    recommendCard(ctx, today),
    data.activeRun && rec?.kind !== 'resume'
      ? h('div', { class: 'banner' }, h('p', {}, '진행 중인 도전이 있어요'), h('button', { class: 'btn small', onclick: () => ctx.go('#/play') }, '이어서 하기'))
      : null,
    h('h2', { class: 'section-title' }, '월드'),
    h('div', { class: 'worlds' }, index.worlds.map((w) => {
      const got = w.stages.reduce((a, s) => a + (data.stars[s.id] || 0), 0);
      return h('button', { class: `world-card w${w.world}`, onclick: () => ctx.go(`#/world/${w.world}`) },
        h('span', { class: 'world-emoji', 'aria-hidden': 'true' }, WORLD_EMOJI[w.world]),
        h('span', { class: 'world-body' }, h('span', { class: 'world-unit' }, w.unit), h('span', { class: 'world-title' }, w.title)),
        h('span', { class: 'world-stars' }, `★ ${got}/${w.stages.length * 3}`));
    })),
    h('nav', { class: 'nav' },
      h('button', { class: 'btn', onclick: () => ctx.go('#/wrong') }, '📕 오답 노트'),
      h('button', { class: 'btn', onclick: () => ctx.go('#/cards') }, '🃏 도감')));
}
