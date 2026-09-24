let ac = null;

export function beep(ok) {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator();
    const g = ac.createGain();
    const t = ac.currentTime;
    o.type = 'sine';
    o.frequency.value = ok ? 880 : 220;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (ok ? 0.25 : 0.4));
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + 0.45);
  } catch {
    // 소리 재생 실패는 게임 진행과 무관하므로 무시
  }
}
