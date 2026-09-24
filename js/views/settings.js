import { h } from '../dom.js';
import { topbar } from './common.js';

function section(title, ...children) {
  return h('section', { class: 'card' }, h('h2', {}, title), ...children);
}

function copyText(ta, ctx) {
  const done = () => ctx.toast('복사했어요 — 메모 앱 등에 붙여넣어 보관하세요');
  const fallback = () => { ta.focus(); ta.select(); ctx.toast('텍스트를 길게 눌러 복사해 주세요'); };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(ta.value).then(done, fallback);
  else fallback();
}

function restoreArea(ctx) {
  const r = ctx.state.restore;
  const close = h('button', { class: 'btn ghost', onclick: () => ctx.cancelRestore() }, '닫기');
  if (!r) {
    const box = h('textarea', { rows: '4', placeholder: '백업 텍스트를 붙여넣으세요', 'aria-label': '복원할 백업' });
    return [box, h('button', { class: 'btn', onclick: () => ctx.prepareRestore(box.value) }, '확인')];
  }
  if (r.status === 'future') return [h('p', { class: 'error' }, '더 새로운 버전의 앱에서 만든 백업이에요. 앱을 업데이트해 주세요.'), close];
  if (r.status !== 'ok') return [h('p', { class: 'error' }, `복원할 수 없어요: ${r.reason}`), close];
  const p = r.preview;
  return [
    h('div', { class: 'preview' },
      h('p', {}, `닉네임: ${p.nickname}`), h('p', {}, `XP: ${p.xp}`), h('p', {}, `별: ${p.stars}개`), h('p', {}, `오답 노트: ${p.wrong}문제`)),
    r.runDropped ? h('p', { class: 'sub' }, '이 백업의 진행 중이던 도전은 이어서 할 수 없어 빼고 복원해요.') : null,
    h('p', { class: 'sub' }, '복원하면 지금 기록이 이 백업으로 바뀌어요.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: () => ctx.commitRestore() }, '복원'),
      h('button', { class: 'btn ghost', onclick: () => ctx.cancelRestore() }, '취소')),
  ];
}

export function renderSettings(ctx) {
  const { data, backupText } = ctx.state;
  const nick = h('input', { type: 'text', maxlength: '12', value: data.nickname, 'aria-label': '닉네임', autocomplete: 'off' });
  const status = h('p', { class: 'sub' }, '오프라인 상태 확인 중…');
  ctx.swStatus().then((s) => {
    status.textContent = s
      ? `앱 버전 ${s.version} · ${s.ready ? '오프라인 준비 완료 ✅' : '오프라인 준비 중…'}`
      : '오프라인 기능 준비 전이에요(한 번 더 열면 준비돼요)';
  });
  let backupBlock = null;
  if (backupText) {
    const ta = h('textarea', { rows: '4', readonly: true, 'aria-label': '백업 텍스트' });
    ta.value = backupText;
    backupBlock = h('div', { class: 'backup' }, ta, h('button', { class: 'btn', onclick: () => copyText(ta, ctx) }, '복사'));
  }
  return h('div', { class: 'page settings' },
    topbar(ctx, '⚙️ 설정'),
    section('닉네임', h('div', { class: 'row' }, nick, h('button', { class: 'btn', onclick: () => ctx.saveNickname(nick.value) }, '저장'))),
    section('효과음', h('label', { class: 'switch' },
      h('input', { type: 'checkbox', checked: data.settings.sound, onchange: () => ctx.toggleSound() }), '정답·오답 소리')),
    section('백업',
      h('p', { class: 'sub' }, data.lastBackupDate ? `마지막 백업: ${data.lastBackupDate}` : '아직 백업하지 않았어요'),
      h('button', { class: 'btn primary', onclick: () => ctx.makeBackup() }, '백업 만들기'),
      backupBlock),
    section('복원', restoreArea(ctx)),
    section('앱 정보', status, h('p', { class: 'sub' }, '이 앱은 기록을 이 기기 안에만 저장하고 어디로도 보내지 않아요.')),
    section('초기화', h('button', { class: 'btn danger', onclick: () => ctx.resetAll() }, '모든 기록 지우기')));
}
