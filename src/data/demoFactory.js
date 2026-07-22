// 스마트팩토리 라인 종합 대시보드 데모 — 태그 + 화면 요소 생성 (능동감시 쇼케이스)
import { makeTag } from './tags'

const V = '__virtual__'
const G = '#22c55e', Y = '#eab308', R = '#ef4444', CY = '#38bdf8', PU = '#a78bfa'

let _n = 0
const eid = () => 'd' + (++_n)

export function makeFactoryDemo() {
  _n = 0
  // ── 태그 (일부는 임계 근처로 세팅 → RUN 시 능동감시가 바로 잡음) ──
  const tags = [
    makeTag({ id: 'TAG_PROD',  desc: '생산량',     unit: 'ea/h', type: 'WORD',  min: 0, max: 1200, value: 940, device: V, utility: '라인' }),
    makeTag({ id: 'TAG_PRESS', desc: '라인압력',   unit: 'bar',  type: 'FLOAT', min: 0, max: 10,   value: 6.4, decimals: 1, device: V, utility: '라인' }),
    makeTag({ id: 'TAG_TEMP',  desc: '챔버온도',   unit: '°C',   type: 'FLOAT', min: 0, max: 200,  value: 172, decimals: 1, device: V, utility: '라인' }), // 86% → 주의
    makeTag({ id: 'TAG_POWER', desc: '전력',       unit: 'kW',   type: 'FLOAT', min: 0, max: 100,  value: 64,  decimals: 1, device: V, utility: '유틸' }),
    makeTag({ id: 'TAG_M1_ST', desc: '1번모터 상태', type: 'WORD', min: 0, max: 3, value: 1, device: V, utility: '모터' }),
    makeTag({ id: 'TAG_M2_ST', desc: '2번모터 상태', type: 'WORD', min: 0, max: 3, value: 1, device: V, utility: '모터' }),
    makeTag({ id: 'TAG_M3_ST', desc: '3번모터 상태', type: 'WORD', min: 0, max: 3, value: 1, device: V, utility: '모터' }),
    makeTag({ id: 'TAG_M1_CUR', desc: '1번모터 전류', unit: 'A', type: 'FLOAT', min: 0, max: 50, value: 31, decimals: 1, device: V, utility: '모터' }),
    makeTag({ id: 'TAG_M2_CUR', desc: '2번모터 전류', unit: 'A', type: 'FLOAT', min: 0, max: 50, value: 48, decimals: 1, device: V, utility: '모터' }), // 96% → 경보(깜빡)
    makeTag({ id: 'TAG_M3_CUR', desc: '3번모터 전류', unit: 'A', type: 'FLOAT', min: 0, max: 50, value: 28, decimals: 1, device: V, utility: '모터' }),
    makeTag({ id: 'TAG_CONV_ST',  desc: '컨베이어 상태', type: 'WORD', min: 0, max: 3, value: 1, device: V, utility: '컨베이어' }),
    makeTag({ id: 'TAG_CONV_SPD', desc: '컨베이어 속도', unit: 'm/min', type: 'FLOAT', min: 0, max: 60, value: 42, decimals: 1, device: V, utility: '컨베이어' }),
    makeTag({ id: 'TAG_TANK1', desc: '탱크1 레벨', unit: '%', type: 'FLOAT', min: 0, max: 100, value: 58, decimals: 1, device: V, utility: '탱크' }),
    makeTag({ id: 'TAG_TANK2', desc: '탱크2 레벨', unit: '%', type: 'FLOAT', min: 0, max: 100, value: 88, decimals: 1, device: V, utility: '탱크' }), // 88% → 주의
    makeTag({ id: 'TAG_ALM', desc: '라인 경보', type: 'BIT', value: 0, device: V, utility: '알람' }),
  ]

  const el = []
  const push = o => { el.push({ id: eid(), ...o }); return el[el.length - 1] }
  const text = (x, y, label, fontSize = 12, color = '#94a3b8', bold = false, opt = {}) => push({ type: 'text', x, y, label, fontSize, color, bold, align: opt.align, hw: opt.hw ?? 60, hh: 10, variant: 'default' })
  // 왼쪽정렬 텍스트: 왼쪽끝 P에서 시작하도록 x·hw 계산 (여러 줄 왼쪽 맞춤). CanvasText: 좌측끝 = x - hw + 2
  const left = (P, y, label, fontSize, color, bold, hw = 100) => text(P + hw - 2, y, label, fontSize, color, bold, { align: 'left', hw })
  const gauge = (x, y, label, tagId, variant, gaugeMin, gaugeMax, opt = {}) => push({ type: 'gauge', x, y, label, tagId, hw: 48, hh: 48, variant, gaugeMin, gaugeMax, gaugeColor: opt.color || CY, animStops: opt.stops })
  const numeric = (x, y, label, tagId, decimals = 1) => push({ type: 'numeric', x, y, label, tagId, hw: 46, hh: 18, decimals, valueFontSize: 16, labelFontSize: 8, variant: 'lcd' })
  const wlamp = (x, y, tagId, states) => push({ type: 'wordlamp', x, y, tagId, hw: 58, hh: 20, variant: 'fill', states, offColor: '#374151' })
  const trend = (x, y, label, tagId, trendMin, trendMax, stops) => push({ type: 'bar', x, y, label, tagId, hw: 195, hh: 74, variant: 'area', trendMin, trendMax, gaugeColor: CY, animStops: stops, trendSampleMs: 1000, trendPoints: 80 })
  const linear = (x, y, label, tagId, stops) => push({ type: 'gauge', x, y, label, tagId, hw: 90, hh: 22, variant: 'linear', gaugeMin: 0, gaugeMax: 100, gaugeColor: CY, animStops: stops })

  const MST = [{ value: 0, label: '정지', color: '#64748b' }, { value: 1, label: '운전중', color: G }, { value: 2, label: '경보', color: R }, { value: 3, label: '점검', color: Y }]
  const CST = [{ value: 0, label: '정지', color: '#64748b' }, { value: 1, label: '운전중', color: G }, { value: 2, label: '막힘', color: R }]
  const ALM = [{ value: 0, label: '정상', color: G }, { value: 1, label: '● 경보', color: R }]
  const tempStops = [{ upTo: 150, color: G }, { upTo: 180, color: Y }, { upTo: null, color: R }]
  const pressStops = [{ upTo: 7, color: G }, { upTo: 9, color: Y }, { upTo: null, color: R }]
  const curStops = [{ upTo: 35, color: G }, { upTo: 43, color: Y }, { upTo: null, color: R }]
  const tankStops = [{ upTo: 70, color: G }, { upTo: 85, color: Y }, { upTo: null, color: R }]

  // ── 타이틀 · 알람 ──
  left(40, 24, 'SMART FACTORY · LINE 1', 22, '#00e5ff', true, 170)
  left(40, 50, 'AI LIVE MONITORING  —  능동 감시 ON 시 이상을 자동 진단', 11, '#64748b', false, 170)
  text(1120, 22, '라인 상태', 10, '#94a3b8')
  wlamp(1120, 40, 'TAG_ALM', ALM)

  // ── KPI 게이지 ──
  gauge(150, 150, '생산량', 'TAG_PROD', 'ring', 0, 1200, { color: CY })
  gauge(370, 150, '라인압력', 'TAG_PRESS', 'arc', 0, 10, { stops: pressStops })
  gauge(590, 150, '챔버온도', 'TAG_TEMP', 'dial', 0, 200, { stops: tempStops })
  gauge(810, 150, '전력', 'TAG_POWER', 'semi', 0, 100, { color: PU })

  // 탱크 (우측)
  text(1120, 110, '탱크 레벨', 10, '#94a3b8')
  linear(1120, 132, '탱크1', 'TAG_TANK1', tankStops)
  linear(1120, 176, '탱크2', 'TAG_TANK2', tankStops)

  // ── 모터 3대 ──
  push({ type: 'groupbox', x: 30, y: 250, width: 590, height: 170, hw: 295, hh: 85, label: 'MOTORS', borderColor: '#00e5ff', titleColor: '#00e5ff', bgColor: 'rgba(0,229,255,0.03)', variant: 'default', boxStyle: 'round' })
  const mx = [130, 320, 510]
  const mNo = [['1번 모터', 'TAG_M1_ST', 'TAG_M1_CUR'], ['2번 모터', 'TAG_M2_ST', 'TAG_M2_CUR'], ['3번 모터', 'TAG_M3_ST', 'TAG_M3_CUR']]
  mNo.forEach(([nm, st, cur], i) => {
    text(mx[i], 278, nm, 11, '#cbd5e1', true)
    wlamp(mx[i], 312, st, MST)
    numeric(mx[i], 368, '전류(A)', cur)
  })

  // ── 컨베이어 ──
  push({ type: 'groupbox', x: 640, y: 250, width: 280, height: 170, hw: 140, hh: 85, label: 'CONVEYOR', borderColor: '#00e5ff', titleColor: '#00e5ff', bgColor: 'rgba(0,229,255,0.03)', variant: 'default', boxStyle: 'round' })
  text(760, 288, '컨베이어 상태', 11, '#cbd5e1', true)
  wlamp(760, 318, 'TAG_CONV_ST', CST)
  numeric(760, 362, '속도(m/min)', 'TAG_CONV_SPD')
  // 흐름 화살표(장식)
  push({ type: 'shape', shape: 'arrow_r', x: 850, y: 318, hw: 22, hh: 12, fillColor: '#0e7490', strokeColor: '#22d3ee', strokeWidth: 1.5, opacity: 1, variant: 'default', animType: 'blink', animBlinkSec: 1, tagId: 'TAG_CONV_ST' })

  // ── AI 안내 배너 ──
  push({ type: 'groupbox', x: 940, y: 250, width: 300, height: 170, hw: 150, hh: 85, label: 'AI 능동 감시', borderColor: '#22c55e', titleColor: '#4ade80', bgColor: 'rgba(34,197,94,0.04)', variant: 'default', boxStyle: 'round' })
  left(958, 292, '좌측 AI 패널에서', 11, '#86efac', false, 120)
  left(958, 310, '"능동 감시 ON" 을 켜세요', 11, '#86efac', true, 120)
  left(958, 338, 'AI가 15초마다 스스로 이상을', 10, '#64748b', false, 120)
  left(958, 356, '감지하고 진단합니다.', 10, '#64748b', false, 120)
  left(958, 384, '지금 온도·2번모터전류·탱크2', 10, '#fbbf24', false, 120)
  left(958, 402, '가 임계 근처 → 곧 경보', 10, '#fbbf24', false, 120)

  // ── 트렌드 ──
  left(40, 452, '실시간 트렌드', 12, '#94a3b8', true, 70)
  trend(225, 552, '챔버온도', 'TAG_TEMP', 0, 200, tempStops)
  trend(630, 552, '전력', 'TAG_POWER', 0, 100, [{ upTo: 70, color: G }, { upTo: 90, color: Y }, { upTo: null, color: R }])
  trend(1035, 552, '생산량', 'TAG_PROD', 0, 1200, [{ upTo: null, color: CY }])

  return { name: 'SMART FACTORY — LINE 1', tags, elements: el }
}
