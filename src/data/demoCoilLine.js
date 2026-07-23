// 권취/권출 라인 데모 — 설비 미믹(도형) + 소재 흐름 순서대로 인디케이터
//   · 언코일러 코일 → 로드셀/가이드롤러 → 리코일러 코일을 도형으로 그림
//   · 흐름(좌→우) 위에 장력(로드셀) → 라인속도 → 토크 인디케이터를 순서대로 배치
//   · 리코일러/언코일러 템플릿과 동일 도메인 (로드셀 장력 · 토크/테이퍼)
import { makeTag } from './tags'

const V = '__virtual__'
const G = '#22c55e', Y = '#eab308', R = '#ef4444', CY = '#38bdf8', PU = '#a78bfa'
const MX = 40

// ── 미믹 좌표 ──
const WEB_Y = 256                 // 소재(웹) 라인 높이
const COIL_Y = 330                // 코일 중심 높이
const UNC_X = 200, REC_X = 1080   // 언코일러 · 리코일러 코일 중심 x
const LC_X = 400, MID_X = 640, TQ_X = 880  // 로드셀 · 중앙롤러 · 토크픽업(리코일러측)
const GY = 140                    // 상단 인디케이터(게이지) 중심 y

let _n = 0
const eid = () => 'c' + (++_n)

export function makeCoilLineDemo() {
  _n = 0
  const tags = [
    // ① 언코일러 (권출) — 로드셀 폐루프 장력
    makeTag({ id: 'U_DIA',    desc: '언코일러 직경',     unit: 'mm', type: 'WORD',  min: 0, max: 1200, value: 860, device: V, utility: '언코일러' }),
    makeTag({ id: 'U_TEN_SP', desc: '목표 장력',         unit: 'N',  type: 'WORD',  min: 0, max: 500,  value: 120, device: V, utility: '언코일러' }),
    makeTag({ id: 'U_TEN',    desc: '실제 장력(로드셀)', unit: 'N',  type: 'FLOAT', min: 0, max: 500,  value: 118, decimals: 0, device: V, utility: '언코일러' }),
    makeTag({ id: 'U_ST',     desc: '언코일러 상태',     type: 'WORD', min: 0, max: 3, value: 1, device: V, utility: '언코일러' }),
    // ② 라인
    makeTag({ id: 'LINE_SPD', desc: '라인 속도',         unit: 'm/min', type: 'FLOAT', min: 0, max: 300,   value: 185, decimals: 0, device: V, utility: '라인' }),
    makeTag({ id: 'LINE_LEN', desc: '권취 길이',         unit: 'm',     type: 'DWORD', min: 0, max: 99999, value: 3420, device: V, utility: '라인' }),
    makeTag({ id: 'LINE_OEE', desc: '가동률',            unit: '%',     type: 'FLOAT', min: 0, max: 100,   value: 92, decimals: 0, device: V, utility: '라인' }),
    makeTag({ id: 'LINE_ST',  desc: '라인 상태',         type: 'WORD', min: 0, max: 3, value: 1, device: V, utility: '라인' }),
    // ③ 리코일러 (권취) — 토크/테이퍼
    makeTag({ id: 'R_DIA',    desc: '리코일러 직경',     unit: 'mm', type: 'WORD',  min: 0, max: 1200, value: 430, device: V, utility: '리코일러' }),
    makeTag({ id: 'R_TQ_SP',  desc: '목표 토크',         unit: 'Nm', type: 'FLOAT', min: 0, max: 50,   value: 18.5, decimals: 1, device: V, utility: '리코일러' }),
    makeTag({ id: 'R_TQ',     desc: '실제 토크',         unit: 'Nm', type: 'FLOAT', min: 0, max: 50,   value: 26.5, decimals: 1, device: V, utility: '리코일러' }),
    makeTag({ id: 'R_TAPER',  desc: '테이퍼',            unit: '%',  type: 'WORD',  min: 0, max: 100,  value: 25, device: V, utility: '리코일러' }),
    makeTag({ id: 'R_ST',     desc: '리코일러 상태',     type: 'WORD', min: 0, max: 3, value: 1, device: V, utility: '리코일러' }),
  ]

  // ── 헬퍼 ──
  const el = []
  const push = o => { el.push({ id: eid(), ...o }); return el[el.length - 1] }
  const text = (x, y, label, fs = 12, color = '#94a3b8', bold = false, opt = {}) =>
    push({ type: 'text', x, y, label, fontSize: fs, color, bold, align: opt.align, hw: opt.hw ?? 60, hh: 10, variant: 'default' })
  const left = (P, y, label, fs, color, bold, hw = 120) => text(P + hw - 2, y, label, fs, color, bold, { align: 'left', hw })
  const ell = (x, y, r, fill, stroke, sw = 2) => push({ type: 'shape', shape: 'ellipse', x, y, hw: r, hh: r, fillColor: fill, strokeColor: stroke, strokeWidth: sw, opacity: 1, variant: 'default' })
  const rrect = (x, y, hw, hh, fill, stroke, sw = 1.5) => push({ type: 'shape', shape: 'rect', x, y, hw, hh, fillColor: fill, strokeColor: stroke, strokeWidth: sw, opacity: 1, variant: 'default' })
  const vline = (x, y0, y1, color = '#334155') => rrect(x, (y0 + y1) / 2, 1.5, (y1 - y0) / 2, color, color, 0)
  const arrowR = (x, y) => push({ type: 'shape', shape: 'arrow_r', x, y, hw: 15, hh: 8, fillColor: '#0e7490', strokeColor: '#22d3ee', strokeWidth: 1.5, opacity: 1, variant: 'default', animType: 'blink', animBlinkSec: 1.2, tagId: 'LINE_ST' })
  // 코일 회전 스포크 — 라인속도에 비례해 회전(속도 0이면 정지). slow/fast = 1회전 소요 초(최저속/최고속)
  const spoke = (x, y, r, color, slow, fast) => push({
    type: 'shape', shape: 'star5', x, y, hw: r, hh: r,
    fillColor: '#5b7091', strokeColor: color, strokeWidth: 2, opacity: 0.95, variant: 'default',
    animType: 'rotate', tagId: 'LINE_SPD', animMinVal: 0, animMaxVal: 300, animMinSpeed: slow, animMaxSpeed: fast,
  })
  const gauge = (x, y, label, tagId, variant, gMin, gMax, opt = {}) =>
    push({ type: 'gauge', x, y, label, tagId, hw: 48, hh: 48, variant, gaugeMin: gMin, gaugeMax: gMax, gaugeColor: opt.color || CY, animStops: opt.stops })
  const numeric = (x, y, label, tagId, decimals = 0) =>
    push({ type: 'numeric', x, y, label, tagId, hw: 46, hh: 18, decimals, valueFontSize: 15, labelFontSize: 8, variant: 'lcd' })
  const wlamp = (x, y, tagId, states, hw = 48) => push({ type: 'wordlamp', x, y, tagId, hw, hh: 18, variant: 'fill', states, offColor: '#374151' })

  const ST  = [{ value: 0, label: '정지', color: '#64748b' }, { value: 1, label: '운전중', color: G }, { value: 2, label: '경보', color: R }, { value: 3, label: '점검', color: Y }]
  const LST = [{ value: 0, label: '정지', color: '#64748b' }, { value: 1, label: '가동중', color: G }, { value: 2, label: '감속', color: Y }, { value: 3, label: '경보', color: R }]
  const tenStops = [{ upTo: 60, color: R }, { upTo: 80, color: Y }, { upTo: 250, color: G }, { upTo: 320, color: Y }, { upTo: null, color: R }]
  const spdStops = [{ upTo: 250, color: G }, { upTo: 280, color: Y }, { upTo: null, color: R }]
  const tqStops  = [{ upTo: 22, color: G }, { upTo: 30, color: Y }, { upTo: null, color: R }]

  // ── 타이틀 ──
  left(MX, 30, 'COIL LINE · 권취/권출 라인', 22, '#e2e8f0', true, 280)
  left(MX, 54, '설비 미믹 · 소재 흐름 순서대로 인디케이터', 11, '#64748b', false, 300)
  text(1180, 26, '라인 상태', 10, '#94a3b8')
  wlamp(1180, 48, 'LINE_ST', LST, 60)

  // ── 미믹: 소재(웹) 라인 + 흐름 화살표 ──
  rrect(MID_X, WEB_Y, (REC_X - UNC_X) / 2, 3, '#3f4a5c', '#5b6b82', 1)   // 웹 스트립 (언코일러~리코일러)
  arrowR(300, WEB_Y); arrowR(700, WEB_Y); arrowR(980, WEB_Y)

  // ── 미믹: 언코일러 코일 (권출) ──
  ell(UNC_X, COIL_Y, 74, '#3a4658', CY, 3)      // 코일 외곽
  spoke(UNC_X, COIL_Y, 52, CY, 8, 1.2)          // 회전(직경 큼 → 느리게)
  ell(UNC_X, COIL_Y, 24, '#0f172a', '#475569', 2) // 코어
  rrect(UNC_X, COIL_Y + 92, 58, 9, '#0f172a', '#475569', 1.5)  // 받침대

  // ── 미믹: 리코일러 코일 (권취, 더 감김) ──
  ell(REC_X, COIL_Y, 88, '#33445a', G, 3)
  spoke(REC_X, COIL_Y, 62, G, 4, 0.6)           // 회전(직경 작음 → 약 2배 빠르게)
  ell(REC_X, COIL_Y, 24, '#0f172a', '#475569', 2)
  rrect(REC_X, COIL_Y + 104, 66, 9, '#0f172a', '#475569', 1.5)

  // ── 미믹: 롤러 (로드셀=강조, 가이드) ──
  ell(520, WEB_Y, 9, '#1e293b', '#64748b', 2)
  ell(760, WEB_Y, 9, '#1e293b', '#64748b', 2)
  ell(MID_X, WEB_Y, 12, '#1e293b', '#64748b', 2)
  ell(TQ_X, WEB_Y, 12, '#1e293b', '#64748b', 2)
  ell(LC_X, WEB_Y, 15, '#1e293b', Y, 2.5)         // 로드셀 (노랑 강조)
  text(LC_X, WEB_Y - 26, '로드셀', 8, Y)

  // ── 인디케이터 (순서대로: 장력 → 속도 → 토크) + 설비 연결선 ──
  vline(LC_X, GY + 52, WEB_Y - 16); vline(MID_X, GY + 52, WEB_Y - 16); vline(TQ_X, GY + 52, WEB_Y - 16)
  gauge(LC_X,  GY, '장력(로드셀)', 'U_TEN',    'arc',  0, 500, { stops: tenStops })
  gauge(MID_X, GY, '라인속도',     'LINE_SPD', 'dial', 0, 300, { stops: spdStops })
  gauge(TQ_X,  GY, '토크',         'R_TQ',     'arc',  0, 50,  { stops: tqStops })

  // ── 설비 명칭 + 물리값(직경) + 상태 ──
  text(UNC_X, 448, '① 언코일러 · 권출', 11, CY, true, 90)
  numeric(UNC_X - 52, 480, '직경 mm', 'U_DIA', 0)
  wlamp(UNC_X + 52, 478, 'U_ST', ST, 46)

  text(MID_X, 448, '② 라인', 11, PU, true, 60)
  numeric(MID_X - 78, 480, '권취길이 m', 'LINE_LEN', 0)
  numeric(MID_X + 78, 480, '가동률 %', 'LINE_OEE', 0)

  text(REC_X, 448, '③ 리코일러 · 권취', 11, G, true, 90)
  numeric(REC_X - 52, 480, '직경 mm', 'R_DIA', 0)
  wlamp(REC_X + 52, 478, 'R_ST', ST, 46)

  // ── 하단: 제어 설정값 패널(템플릿) + 실시간 트렌드 ──
  push({ type: 'groupbox', x: 40, y: 520, width: 330, height: 120, hw: 165, hh: 60, label: '제어 설정값 (템플릿)', borderColor: '#475569', titleColor: '#94a3b8', bgColor: 'rgba(148,163,184,0.04)', variant: 'default', boxStyle: 'sharp' })
  numeric(105, 592, '목표장력 N', 'U_TEN_SP', 0)
  numeric(205, 592, '목표토크 Nm', 'R_TQ_SP', 1)
  numeric(305, 592, '테이퍼 %', 'R_TAPER', 0)

  left(410, 528, '실시간 트렌드', 11, '#94a3b8', true, 90)
  const trend = (tx, label, tagId, tMin, tMax, stops) => push({ type: 'bar', x: tx, y: 588, label, tagId, hw: 128, hh: 54, variant: 'area', trendMin: tMin, trendMax: tMax, gaugeColor: CY, animStops: stops, trendSampleMs: 1000, trendPoints: 80 })
  trend(542, '장력(로드셀)', 'U_TEN', 0, 500, tenStops)
  trend(822, '라인속도', 'LINE_SPD', 0, 300, spdStops)
  trend(1102, '토크', 'R_TQ', 0, 50, tqStops)

  // ── AI 안내 ──
  left(MX, 672, '💡 AI 능동 감시 ON → 장력·토크 이상 자동 진단 (지금 리코일러 토크 주의대)', 10, '#64748b', false, 200)

  return { name: 'COIL LINE — 권취/권출 (미믹)', tags, elements: el, bgColor: '#0a0f18' }
}
