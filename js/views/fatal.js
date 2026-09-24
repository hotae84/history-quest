import { h } from '../dom.js';

function wrap(title, ...children) {
  return h('div', { class: 'page fatal' }, h('section', { class: 'card' }, h('h1', {}, title), ...children));
}

export function renderFatal(ctx) {
  const f = ctx.state.fatal;
  switch (f.kind) {
    case 'future':
      return wrap('앱을 업데이트해 주세요',
        h('p', {}, '이 기기의 기록이 더 새로운 버전의 앱에서 저장됐어요. 기록은 그대로 두었어요.'),
        h('button', { class: 'btn primary', onclick: () => ctx.updateFromFuture() }, '업데이트 확인'));
    case 'corrupt': {
      const ta = h('textarea', { rows: '5', readonly: true, 'aria-label': '읽지 못한 원본' });
      ta.value = f.raw;
      const copy = () => {
        ta.focus();
        ta.select();
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(f.raw).then(() => ctx.toast('원본을 복사했어요'), () => ctx.toast('텍스트를 길게 눌러 복사해 주세요'));
      };
      return wrap('기록을 읽지 못했어요',
        h('p', {}, `이유: ${f.reason}`),
        h('p', { class: 'sub' }, f.kept
          ? '원본은 따로 보관해 두었어요. 원본을 복사해 두거나 새로 시작할 수 있어요.'
          : '원본을 따로 보관하지 못했어요. 원본을 지키기 위해 새로 시작할 수 없어요. 먼저 원본을 복사해 주세요.'),
        ta,
        h('button', { class: 'btn', onclick: copy }, '원본 내보내기(복사)'),
        f.kept ? h('button', { class: 'btn danger', onclick: () => ctx.startFresh() }, '새로 시작') : null);
    }
    case 'loadfail':
      return wrap('문제를 불러오지 못했어요',
        h('p', { class: 'sub' }, '인터넷 연결을 확인한 뒤 다시 시도해 주세요. 기록은 그대로예요.'),
        h('details', {}, h('summary', {}, '자세히'), h('pre', { class: 'detail' }, f.detail)),
        h('button', { class: 'btn primary', onclick: () => location.reload() }, '다시 시도'));
    case 'conflict':
      return wrap('다른 탭에서 기록이 바뀌었어요',
        h('p', { class: 'sub' }, '기록이 섞이지 않도록 이 탭은 멈췄어요. 새로고침하면 최신 기록으로 이어서 할 수 있어요.'),
        h('button', { class: 'btn primary', onclick: () => location.reload() }, '새로고침'));
    default:
      return wrap('이 브라우저에서는 기록을 저장할 수 없어요',
        h('p', { class: 'sub' }, '개인 정보 보호 브라우징을 끄고 다시 열어 주세요.'));
  }
}
