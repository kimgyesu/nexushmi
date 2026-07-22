// 경고음 (Web Audio API — 설치 불필요)
export function playBeep({ freq = 520, duration = 0.12, volume = 0.35 } = {}) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(volume, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + duration)
    // 짧은 딜레이 후 두번째 음 (더블 비프)
    const osc2  = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.type = 'sine'
    osc2.frequency.value = freq * 0.75
    gain2.gain.setValueAtTime(volume * 0.7, ctx.currentTime + duration * 0.8)
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration * 1.8)
    osc2.start(ctx.currentTime + duration * 0.8)
    osc2.stop(ctx.currentTime + duration * 1.9)
  } catch {}
}
