import { h } from '../dom.js';

export function renderWelcome(ctx) {
  return h('div', { class: 'page welcome' },
    h('div', { class: 'welcome-hero' },
      h('div', { class: 'brand-mark big', 'aria-hidden': 'true' }, '⏳'),
      h('h1', {}, '역사 퀘스트'),
      h('p', {}, '1500년대부터 1900년대 초까지, 시간여행을 떠나 볼까요?')),
    h('section', { class: 'card' },
      h('h2', {}, '먼저 홈 화면에 추가해 주세요'),
      h('ol', { class: 'steps' },
        h('li', {}, '주소창 옆 공유 버튼(□↑)을 눌러요'),
        h('li', {}, '“홈 화면에 추가”를 눌러요'),
        h('li', {}, '홈 화면에 생긴 “역사 퀘스트” 아이콘으로 시작해요')),
      h('p', { class: 'sub' }, '홈 화면 앱은 Safari와 기록을 따로 저장해요. 그래서 처음부터 홈 화면 앱에서 시작하는 게 좋아요.')),
    h('button', { class: 'btn ghost block', onclick: () => ctx.skipWelcome() }, '그래도 Safari에서 하기'));
}
