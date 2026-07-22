// AI 분석 리포트 — 시연용 하루치 1분 데이터 생성 + 급변 구간 탐지 + 원인 매칭
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
// 결정적 의사난수 (재현성 위해 Math.random 대신)
const pseudo = n => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x) }

const hm = ts => new Date(ts).toLocaleTimeString('ko', { hour: '2-digit', minute: '2-digit', hour12: false })

// 봄철 가상 하루 — 일조량이 온도를 밀어올리고, 자동 컨트롤러가 각 장비를 기동/정지.
// 반환에 equipEvents(장비 ON/OFF 이력) 포함. 13:20~13:45 냉동기 일시정지(고장) 시나리오로 급변 발생.
const EQ_KO = { fan: '냉각휀', chill: '냉동기', heat: '히터', mist: '물분사' }
export function genDemoDayData(nowMs) {
  const day = new Date(nowMs - 24 * 3600000); day.setHours(0, 0, 0, 0)
  const start = day.getTime()
  const temp = [], hum = [], lux = [], power = [], equipEvents = []
  // 봄 하루 장비 스케줄 (시간대). 자동 컨트롤러가 일조량·온도에 맞춰 가동.
  const sched = { heat: [[0, 6.5], [19.5, 24]], mist: [[9.0, 9.6], [15.0, 15.4]], fan: [[10.3, 18.2]], chill: [[12.3, 16.5]] }
  const inS = (k, h) => sched[k].some(([a, b]) => h >= a && h < b)
  const prev = { fan: 0, chill: 0, heat: 0, mist: 0 }
  for (let m = 0; m < 1440; m++) {
    const t = start + m * 60000, hour = m / 60
    const sun = Math.max(0, Math.sin((hour - 6) / 12 * Math.PI)) // 06~18시 일조
    const chillFault = hour >= 13.33 && hour <= 13.75 // 냉동기 일시정지(고장) → 과열 급변
    const on = { heat: inS('heat', hour) ? 1 : 0, mist: inS('mist', hour) ? 1 : 0, fan: inS('fan', hour) ? 1 : 0, chill: (inS('chill', hour) && !chillFault) ? 1 : 0 }
    for (const k of ['heat', 'fan', 'chill', 'mist']) if (on[k] !== prev[k]) { equipEvents.push({ ts: t, equip: EQ_KO[k], key: k, on: on[k] }); prev[k] = on[k] }
    const ambient = 8 + sun * 18 // 봄: 밤 ~8°C, 낮 ~26°C (일조량 따라)
    const tv = clamp(ambient + on.heat * 6 - on.fan * 2.6 - on.chill * 4.6 + (pseudo(m) * 0.5 - 0.25), 0, 40)
    const hv = clamp(60 - sun * 6 + on.mist * 10 - on.fan * 3 + (pseudo(m + 9) * 1.4 - 0.7), 0, 100)
    const pw = 5 + on.fan * 2.2 + on.chill * 5.5 + on.heat * 4.0 + sun * 1.2 + (pseudo(m + 3) * 0.6 - 0.3)
    temp.push({ t, v: Math.round(tv * 10) / 10 })
    hum.push({ t, v: Math.round(hv) })
    lux.push({ t, v: Math.round(clamp(sun * 80, 0, 100) * 10) / 10 })
    power.push({ t, v: Math.round(clamp(pw, 0, 60) * 10) / 10 })
  }
  const events = equipEvents.map(e => ({ ts: e.ts, message: `${e.equip} ${e.on ? 'ON' : 'OFF'}` }))
  return { start, temp, hum, lux, power, equipEvents, events }
}

// 주간/야간·피크·총량 요약 (사용량 판단용)
export function usageSummary(power, lux) {
  const isDay = t => { const h = new Date(t).getHours(); return h >= 6 && h < 18 }
  const avg = a => a.length ? a.reduce((s, p) => s + p.v, 0) / a.length : 0
  const dayP = power.filter(p => isDay(p.t)), nightP = power.filter(p => !isDay(p.t))
  const peak = power.reduce((m, p) => (p.v > m.v ? p : m), power[0] || { v: 0 })
  const luxPeak = (lux || []).reduce((m, p) => (p.v > m.v ? p : m), (lux && lux[0]) || { v: 0 })
  return {
    dayAvg: avg(dayP), nightAvg: avg(nightP), peak,
    kwh: avg(power) * 24, luxPeak,
  }
}

// 급변 구간 탐지: win분 동안 변화가 큰 상위 구간 (겹침 제거) + 근처 이벤트 매칭
export function detectSpikes(series, events, { win = 10, top = 3, minAbs = 3, label = '값', unit = '' } = {}) {
  const deltas = []
  for (let i = win; i < series.length; i++) deltas.push({ i, t0: series[i - win].t, t: series[i].t, from: series[i - win].v, to: series[i].v, d: series[i].v - series[i - win].v })
  const picked = []
  for (const s of deltas.slice().sort((a, b) => Math.abs(b.d) - Math.abs(a.d))) {
    if (Math.abs(s.d) < minAbs) break
    if (picked.some(p => Math.abs(p.i - s.i) < win * 2)) continue
    picked.push(s); if (picked.length >= top) break
  }
  return picked.sort((a, b) => a.t - b.t).map(s => {
    // 원인은 급변 시작(onset) 근처의 조작 이벤트로 매칭 (증상=경보보다 원인 우선)
    const ev = (events || []).map(e => ({ e, gap: Math.abs(e.ts - s.t0) })).sort((a, b) => a.gap - b.gap)[0]
    const cause = ev && ev.gap <= 20 * 60000 ? `${hm(ev.e.ts)} "${ev.e.message}"` : '상관 이벤트 없음'
    return { ...s, label, unit, cause, hm0: hm(s.t0), hm1: hm(s.t) }
  })
}

export const fmtHM = hm
