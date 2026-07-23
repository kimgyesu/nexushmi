// 스마트팩토리 라인 데모 — 설비 미믹(도형) + 흐름 순서대로 인디케이터
//   · 원료탱크 → 가열챔버 → 컨베이어(모터3) → 출고 를 도형으로 그림
//   · 상단에 온도·압력·속도·전력 KPI, 설비에 레벨·전류·상태·생산량 인디케이터
//   · 일부 값은 임계 근처(온도·2번모터전류·탱크2) → RUN + 능동감시가 바로 잡음
import { makeTag } from './tags'

const V = '__virtual__'
const G = '#22c55e', Y = '#eab308', R = '#ef4444', CY = '#38bdf8', PU = '#a78bfa', OR = '#f59e0b'

let _n = 0
const eid = () => 'd' + (++_n)

export function makeFactoryDemo() {
  _n = 0
  const tags = [
    makeTag({ id: 'TAG_PROD',  desc: '생산량',      unit: 'ea/h', type: 'WORD',  min: 0, max: 1200, value: 940, device: V, utility: '라인' }),
    makeTag({ id: 'TAG_PRESS', desc: '라인압력',    unit: 'bar',  type: 'FLOAT', min: 0, max: 10,   value: 6.4, decimals: 1, device: V, utility: '라인' }),
    makeTag({ id: 'TAG_TEMP',  desc: '챔버온도',    unit: '°C',   type: 'FLOAT', min: 0, max: 200,  value: 172, decimals: 1, device: V, utility: '라인' }), // 86% → 주의
    makeTag({ id: 'TAG_POWER', desc: '전력',        unit: 'kW',   type: 'FLOAT', min: 0, max: 100,  value: 64,  decimals: 1, device: V, utility: '유틸' }),
    makeTag({ id: 'TAG_M1_ST', desc: '1번모터 상태', type: 'WORD', min: 0, max: 3, value: 1, device: V, utility: '모터' }),
    makeTag({ id: 'TAG_M2_ST', desc: '2번모터 상태', type: 'WORD', min: 0, max: 3, value: 1, device: V, utility: '모터' }),
    makeTag({ id: 'TAG_M3_ST', desc: '3번모터 상태', type: 'WORD', min: 0, max: 3, value: 1, device: V, utility: '모터' }),
    makeTag({ id: 'TAG_M1_CUR', desc: '1번모터 전류', unit: 'A', type: 'FLOAT', min: 0, max: 50, value: 31, decimals: 1, device: V, utility: '모터' }),
    makeTag({ id: 'TAG_M2_CUR', desc: '2번모터 전류', unit: 'A', type: 'FLOAT', min: 0, max: 50, value: 48, decimals: 1, device: V, utility: '모터' }), // 96% → 경보
    makeTag({ id: 'TAG_M3_CUR', desc: '3번모터 전류', unit: 'A', type: 'FLOAT', min: 0, max: 50, value: 28, decimals: 1, device: V, utility: '모터' }),
    makeTag({ id: 'TAG_CONV_ST',  desc: '컨베이어 상태', type: 'WORD', min: 0, max: 3, value: 1, device: V, utility: '컨베이어' }),
    makeTag({ id: 'TAG_CONV_SPD', desc: '컨베이어 속도', unit: 'm/min', type: 'FLOAT', min: 0, max: 60, value: 42, decimals: 1, device: V, utility: '컨베이어' }),
    makeTag({ id: 'TAG_TANK1', desc: '탱크1 레벨', unit: '%', type: 'FLOAT', min: 0, max: 100, value: 58, decimals: 0, device: V, utility: '탱크' }),
    makeTag({ id: 'TAG_TANK2', desc: '탱크2 레벨', unit: '%', type: 'FLOAT', min: 0, max: 100, value: 88, decimals: 0, device: V, utility: '탱크' }), // 88% → 주의
    makeTag({ id: 'TAG_ALM', desc: '라인 경보', type: 'BIT', value: 0, device: V, utility: '알람' }),
  ]

  // ── 헬퍼 ──
  const el = []
  const push = o => { el.push({ id: eid(), ...o }); return el[el.length - 1] }
  const text = (x, y, label, fs = 12, color = '#94a3b8', bold = false, opt = {}) =>
    push({ type: 'text', x, y, label, fontSize: fs, color, bold, align: opt.align, hw: opt.hw ?? 60, hh: 10, variant: 'default' })
  const left = (P, y, label, fs, color, bold, hw = 120) => text(P + hw - 2, y, label, fs, color, bold, { align: 'left', hw })
  const ell = (x, y, r, fill, stroke, sw = 2, opacity = 1) => push({ type: 'shape', shape: 'ellipse', x, y, hw: r, hh: r, fillColor: fill, strokeColor: stroke, strokeWidth: sw, opacity, variant: 'default' })
  const rrect = (x, y, hw, hh, fill, stroke, sw = 1.5, opacity = 1) => push({ type: 'shape', shape: 'rect', x, y, hw, hh, fillColor: fill, strokeColor: stroke, strokeWidth: sw, opacity, variant: 'default' })
  const oval = (x, y, rx, ry, fill, stroke, sw = 1.5) => push({ type: 'shape', shape: 'ellipse', x, y, hw: rx, hh: ry, fillColor: fill, strokeColor: stroke, strokeWidth: sw, opacity: 1, variant: 'default' })
  const vline = (x, y0, y1, color = '#334155') => rrect(x, (y0 + y1) / 2, 1.5, (y1 - y0) / 2, color, color, 0)
  const arrowR = (x, y) => push({ type: 'shape', shape: 'arrow_r', x, y, hw: 14, hh: 8, fillColor: '#0e7490', strokeColor: '#22d3ee', strokeWidth: 1.5, opacity: 1, variant: 'default', animType: 'blink', animBlinkSec: 1.2, tagId: 'TAG_CONV_ST' })
  const gauge = (x, y, label, tagId, variant, gMin, gMax, opt = {}) =>
    push({ type: 'gauge', x, y, label, tagId, hw: 48, hh: 48, variant, gaugeMin: gMin, gaugeMax: gMax, gaugeColor: opt.color || CY, animStops: opt.stops })
  const numeric = (x, y, label, tagId, decimals = 0) =>
    push({ type: 'numeric', x, y, label, tagId, hw: 44, hh: 17, decimals, valueFontSize: 14, labelFontSize: 8, variant: 'lcd' })
  const bignum = (x, y, label, tagId, decimals = 0) =>
    push({ type: 'numeric', x, y, label, tagId, hw: 58, hh: 24, decimals, valueFontSize: 24, labelFontSize: 9, variant: 'lcd' })
  const wlamp = (x, y, tagId, states, hw = 48) => push({ type: 'wordlamp', x, y, tagId, hw, hh: 17, variant: 'fill', states, offColor: '#374151' })

  const MST = [{ value: 0, label: '정지', color: '#64748b' }, { value: 1, label: '운전중', color: G }, { value: 2, label: '경보', color: R }, { value: 3, label: '점검', color: Y }]
  const ALM = [{ value: 0, label: '정상', color: G }, { value: 1, label: '● 경보', color: R }]
  const tempStops = [{ upTo: 150, color: G }, { upTo: 180, color: Y }, { upTo: null, color: R }]
  const pressStops = [{ upTo: 7, color: G }, { upTo: 9, color: Y }, { upTo: null, color: R }]
  const convStops = [{ upTo: 50, color: G }, { upTo: 56, color: Y }, { upTo: null, color: R }]

  // ── 타이틀 ──
  left(40, 30, 'SMART FACTORY · LINE 1', 22, '#e2e8f0', true, 300)
  left(40, 54, '설비 미믹 · 원료탱크 → 가열챔버 → 컨베이어 → 출고', 11, '#64748b', false, 340)
  text(1180, 26, '라인 경보', 10, '#94a3b8')
  wlamp(1180, 48, 'TAG_ALM', ALM, 64)

  // ── 상단 KPI (온도·압력·속도·전력) ──
  gauge(300, 128, '챔버온도', 'TAG_TEMP', 'arc', 0, 200, { stops: tempStops })
  gauge(500, 128, '라인압력', 'TAG_PRESS', 'arc', 0, 10, { stops: pressStops })
  gauge(760, 128, '컨베이어속도', 'TAG_CONV_SPD', 'dial', 0, 60, { stops: convStops })
  gauge(1010, 128, '전력', 'TAG_POWER', 'semi', 0, 100, { color: PU })

  // ── 원료 탱크 2기 (좌) ──
  text(110, 206, '탱크1', 9, '#94a3b8'); text(198, 206, '탱크2', 9, '#94a3b8')
  rrect(110, 300, 32, 72, '#16202e', CY, 2)
  rrect(198, 300, 32, 72, '#16202e', CY, 2)
  oval(110, 228, 32, 7, '#1e2c3e', CY, 2); oval(198, 228, 32, 7, '#1e2c3e', CY, 2)   // 원통 상단 캡
  numeric(110, 392, '탱크1 %', 'TAG_TANK1', 0)
  numeric(198, 392, '탱크2 %', 'TAG_TANK2', 0)
  // 탱크 → 챔버 배관
  rrect(285, 320, 55, 5, '#3f4a5c', '#5b6b82', 1)

  // ── 가열 챔버 (중앙좌) ──
  text(420, 206, '가열 챔버', 9, OR)
  ell(420, 320, 44, '#3a1e0e', '#b45309', 0, 0.55)            // 히터 글로우
  rrect(420, 300, 64, 84, '#241812', OR, 2.5)                 // 챔버 벽
  ell(420, 300, 20, '#0f172a', '#78350f', 2)                  // 내부
  // 챔버 → 컨베이어 배관
  rrect(522, 320, 38, 5, '#3f4a5c', '#5b6b82', 1)

  // ── 컨베이어 + 모터 3대 (중앙우) ──
  ell(560, 300, 16, '#1e293b', '#64748b', 2)                  // 좌 롤러
  ell(900, 300, 16, '#1e293b', '#64748b', 2)                  // 우 롤러
  rrect(730, 300, 170, 11, '#334155', '#64748b', 1.5)         // 벨트
  ;[620, 700, 790, 860].forEach(x => rrect(x, 279, 13, 9, '#475569', '#94a3b8', 1))  // 이송물
  arrowR(660, 300); arrowR(830, 300)
  // 모터 3대
  const mx = [640, 730, 820]
  const mSt = ['TAG_M1_ST', 'TAG_M2_ST', 'TAG_M3_ST']
  const mCur = ['TAG_M1_CUR', 'TAG_M2_CUR', 'TAG_M3_CUR']
  mx.forEach((x, i) => {
    vline(x, 311, 344)                                        // 축
    ell(x, 364, 19, '#14532d', G, 2.5)                        // 모터
    text(x, 364, `M${i + 1}`, 9, '#e2e8f0', true)
    numeric(x, 406, `M${i + 1} 전류(A)`, mCur[i], 0)
    wlamp(x, 438, mSt[i], MST, 50)
  })

  // ── 출고 (우) ──
  text(1095, 206, '출고', 9, G)
  rrect(1095, 288, 26, 34, '#1e293b', '#64748b', 1.5)         // 슈트
  rrect(1095, 338, 46, 26, '#0f172a', '#475569', 1.5)         // 배출함
  rrect(985, 300, 95, 5, '#3f4a5c', '#5b6b82', 1)             // 컨베이어 → 출고
  bignum(1095, 150, '생산량 ea/h', 'TAG_PROD', 0)

  // ── 하단 트렌드 ──
  left(40, 486, '실시간 트렌드', 12, '#94a3b8', true, 90)
  const trend = (x, label, tagId, tMin, tMax, stops) =>
    push({ type: 'bar', x, y: 578, label, tagId, hw: 180, hh: 62, variant: 'area', trendMin: tMin, trendMax: tMax, gaugeColor: CY, animStops: stops, trendSampleMs: 1000, trendPoints: 80 })
  trend(250, '챔버온도', 'TAG_TEMP', 0, 200, tempStops)
  trend(640, '전력', 'TAG_POWER', 0, 100, [{ upTo: 70, color: G }, { upTo: 90, color: Y }, { upTo: null, color: R }])
  trend(1030, '생산량', 'TAG_PROD', 0, 1200, [{ upTo: null, color: CY }])

  // ── AI 안내 ──
  left(40, 668, '💡 AI 능동 감시 ON → 온도·2번모터 전류·탱크2 가 임계 근처 → 곧 경보', 10, '#64748b', false, 220)

  return { name: 'SMART FACTORY — LINE 1 (미믹)', tags, elements: el }
}
