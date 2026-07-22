// 범용 보고서 생성기 — 태그 역할(role) + 시계열 데이터 → 표준 report 구조
// 온실이든 집진기·펌프든 동일 파이프라인. 대시보드/엑셀/AI 프롬프트가 이 구조를 소비.
import { detectSpikes, genDemoDayData, usageSummary } from './analysisReport'
import { classifyTags, findSetpointFor, roleFmt, fmtDecimals, SERIES_PALETTE, EQUIP_PALETTE } from '../data/tagRoles'

/* report = {
 *   title, subtitle, start, end,
 *   series: [{ id, name, unit, color, role, data:[{t,v}], min, max, fmt, decimals, sv, spikes:[] }],
 *   events: [{ ts, name, on, color }],
 *   usage: null | { unit, dayAvg, nightAvg, peak:{t,v}, kwh },
 *   aiText, streaming
 * } */

// 시계열 급변 탐지 파라미터 자동 산정
function spikesFor(s) {
  const N = s.data.length
  if (N < 6) return []
  const win = Math.max(3, Math.round(N / 96)) // ~15분 (1440 샘플 기준)
  const range = (s.max - s.min) || Math.max(1, ...s.data.map(p => p.v)) - Math.min(...s.data.map(p => p.v))
  const minAbs = Math.max(s.decimals > 0 ? 0.5 : 1, range * 0.1)
  return detectSpikes(s.data, s._events || [], { win, top: 3, minAbs, label: s.name, unit: s.unit })
}

// 핵심: 분류된 시리즈/이벤트 → report 조립 (급변·사용량 계산)
export function assembleReport({ title, subtitle, pv = [], power = [], env = [], events = [] }) {
  const all = [...pv, ...power, ...env].filter(s => s.data && s.data.length)
  const start = Math.min(...all.map(s => s.data[0].t))
  const end = Math.max(...all.map(s => s.data[s.data.length - 1].t))
  // 색상 자동배정
  let ci = 0
  for (const s of [...pv, ...power]) if (!s.color) s.color = SERIES_PALETTE[ci++ % SERIES_PALETTE.length]
  for (const s of env) if (!s.color) s.color = '#fbbf24'
  // 장비 색상 (이름별 고정)
  const eqColor = {}; let ei = 0
  for (const e of events) if (!eqColor[e.name]) eqColor[e.name] = EQUIP_PALETTE[ei++ % EQUIP_PALETTE.length]
  const evts = events.map(e => ({ ...e, color: e.color || eqColor[e.name] })).sort((a, b) => a.ts - b.ts)
  const spikeEvents = evts.map(e => ({ ts: e.ts, message: `${e.name} ${e.on ? 'ON' : 'OFF'}` }))
  // pv 급변
  for (const s of pv) { s._events = spikeEvents; s.spikes = spikesFor(s); delete s._events }
  // 사용량 (첫 전력 시리즈)
  let usage = null
  const pw = power[0]
  if (pw) {
    const u = usageSummary(pw.data, env[0]?.data || [])
    usage = { unit: pw.unit || 'kW', dayAvg: u.dayAvg, nightAvg: u.nightAvg, peak: u.peak, kwh: u.kwh }
  }
  return { title, subtitle, start, end, series: [...pv, ...power], env, events: evts, usage, aiText: '', streaming: false }
}

// 로거/태그로부터 시리즈 구성 → assembleReport
export function buildReportFromLogger(logger, tags, { title = '실시간 운전 분석', rangeMs } = {}) {
  const snap = logger.getData({ rangeMs })
  const { pv, power, env, equipment, setpoint } = classifyTags(tags)
  const mk = (t, role) => {
    const data = snap.series[t.id] || []
    return { id: t.id, name: t.desc || t.id, unit: t.unit || '', role, data, min: t.min ?? 0, max: t.max ?? 100, fmt: roleFmt(t), decimals: fmtDecimals(t), sv: findSetpointFor(t, setpoint)?.id || null }
  }
  const pvS = pv.map(t => mk(t, 'pv')).filter(s => s.data.length)
  const pwS = power.map(t => mk(t, 'power')).filter(s => s.data.length)
  const enS = env.map(t => mk(t, 'env')).filter(s => s.data.length)
  const eqName = {}; for (const t of equipment) eqName[t.id] = t.desc || t.id
  const events = (snap.events || []).map(e => ({ ts: e.t, name: eqName[e.tagId] || e.tagId, on: !!e.v }))
  return assembleReport({ title, subtitle: `실시간 기록 · 변수 ${pvS.length + pwS.length}개`, pv: pvS, power: pwS, env: enS, events })
}

// 데모(온실) — 합성 하루 데이터를 동일한 범용 구조로 (파이프라인 검증)
export function buildDemoReport(nowMs) {
  const d = genDemoDayData(nowMs)
  const S = (id, name, unit, role, data, min, max, dec) => ({ id, name, unit, role, data, min, max, fmt: dec ? '0.' + '0'.repeat(dec) : '0', decimals: dec, sv: null })
  const pv = [
    S('TEMP', '온도', '°C', 'pv', d.temp, 0, 40, 1),
    S('HUM', '습도', '%', 'pv', d.hum, 0, 100, 0),
  ]
  const power = [S('PWR', '전력', 'kW', 'power', d.power, 0, Math.max(1, ...d.power.map(p => p.v)), 1)]
  const env = [S('LUX', '일조량', 'klux', 'env', d.lux, 0, 100, 0)]
  const events = d.equipEvents.map(e => ({ ts: e.ts, name: e.equip, on: e.on }))
  const rep = assembleReport({ title: '스마트 온실 · 어제', subtitle: '온·습도 / 에너지 분석 (1분 간격)', pv, power, env, events })
  return rep
}

// AI 프롬프트 (범용) — report 근거로 한국어 보고서 요청
export function reportPrompt(report) {
  const hm = t => new Date(t).toLocaleTimeString('ko', { hour: '2-digit', minute: '2-digit', hour12: false })
  const spikeCtx = report.series.flatMap(s => (s.spikes || []).map(sp =>
    `- ${sp.hm0}~${sp.hm1} ${s.name} ${sp.d > 0 ? '상승' : '하락'} ${Math.abs(sp.d).toFixed(1)}${s.unit} (근처: ${sp.cause})`)).join('\n') || '- 뚜렷한 급변 없음'
  const eqCtx = report.events.map(e => `- ${hm(e.ts)} ${e.name} ${e.on ? 'ON' : 'OFF'}`).join('\n') || '- 이벤트 없음'
  const u = report.usage
  const useCtx = u ? `- 주간(06-18) 평균 ${u.dayAvg.toFixed(1)}${u.unit}, 야간 ${u.nightAvg.toFixed(1)}${u.unit}\n- 최대 ${u.peak.v.toFixed(1)}${u.unit}(${hm(u.peak.t)}), 추정 ${u.kwh.toFixed(0)}kWh` : '- 전력 데이터 없음'
  const vars = report.series.map(s => `${s.name}(${s.unit})`).join(', ')
  return `당신은 산업 설비 데이터 분석가입니다. 아래는 "${report.title}"의 운전 기록입니다. 측정 변수: ${vars}. 근거로만 한국어 보고서를 작성하고, 없는 내용은 지어내지 마세요.
① 운전 흐름: 어떤 장비가 언제 왜 가동/정지했는지.
② 급변 구간 원인: 급변과 근처 장비 이벤트를 연결해 설명.
③ 사용량 판단: 왜 시간대별로 사용량이 늘고 줄었는지 (원인→결과).
④ 절감/개선 방안 2가지 구체적으로.
간결하게 6~8문장.

[장비 이벤트]\n${eqCtx}\n\n[급변 구간]\n${spikeCtx}\n\n[사용량/에너지]\n${useCtx}`
}
