// 스마트 온실(하우스) 데모 — CCTV 이미지 배경 + 조작 스위치 + 물리 시뮬레이션 (스마트팩토리 2)
import { makeTag } from './tags'

const V = '__virtual__'
const G = '#22c55e', Y = '#eab308', R = '#ef4444', CY = '#38bdf8'
const TEMP_HINT = '냉각휀·냉동기 ON, 히터 OFF'
const HUM_HINT = '물분사 OFF, 환기(냉각휀 ON)'

let _n = 0
const eid = () => 'g' + (++_n)

export function makeGreenhouseDemo() {
  _n = 0
  const zoneTags = []
  const zt = (n, crop, t0, h0) => {
    zoneTags.push(makeTag({ id: `TAG_Z${n}_T`, desc: `존${n} 온도`, unit: '°C', type: 'FLOAT', min: 0, max: 40, value: t0, decimals: 1, device: V, utility: `존${n}`, alarmHint: TEMP_HINT }))
    zoneTags.push(makeTag({ id: `TAG_Z${n}_H`, desc: `존${n} 습도`, unit: '%', type: 'FLOAT', min: 0, max: 100, value: h0, decimals: 0, device: V, utility: `존${n}`, alarmHint: HUM_HINT }))
  }
  zt(1, '토마토 A', 25, 64); zt(2, '토마토 B', 26, 61); zt(3, '파프리카 A', 25, 66); zt(4, '파프리카 B', 24, 62)

  const tags = [
    ...zoneTags,
    makeTag({ id: 'TAG_LUX', desc: '일광량', unit: 'klux', type: 'FLOAT', min: 0, max: 100, value: 72, decimals: 1, device: V, utility: '환경' }),
    // 가상 시계 (시/분) — auto 시뮬레이션이 갱신
    makeTag({ id: 'TAG_VH', desc: '시', type: 'FLOAT', min: 0, max: 23, value: 6, decimals: 0, device: V, utility: '시계' }),
    makeTag({ id: 'TAG_VM', desc: '분', type: 'FLOAT', min: 0, max: 59, value: 0, decimals: 0, device: V, utility: '시계' }),
    // 설정값(SV) — 운전자가 클릭해서 목표 온·습도를 입력, 이 값 기준으로 장비 자동 제어
    makeTag({ id: 'TAG_SET_TEMP', desc: '설정 온도', unit: '°C', type: 'FLOAT', min: 15, max: 32, value: 23, decimals: 0, device: V, utility: '설정' }),
    makeTag({ id: 'TAG_SET_HUM',  desc: '설정 습도', unit: '%',  type: 'FLOAT', min: 40, max: 85, value: 62, decimals: 0, device: V, utility: '설정' }),
    makeTag({ id: 'TAG_FAN_SW',  desc: '냉각휀', type: 'BIT', value: 0, device: V, utility: '설비' }),
    makeTag({ id: 'TAG_CHILL_SW', desc: '냉동기', type: 'BIT', value: 0, device: V, utility: '설비' }),
    makeTag({ id: 'TAG_HEAT_SW', desc: '히터',   type: 'BIT', value: 0, device: V, utility: '설비' }),
    makeTag({ id: 'TAG_MIST_SW', desc: '물분사', type: 'BIT', value: 0, device: V, utility: '설비' }),
  ]

  const el = []
  const push = o => { el.push({ id: eid(), ...o }); return el[el.length - 1] }
  const text = (x, y, label, fs, color, bold = false, align, hw = 60) => push({ type: 'text', x, y, label, fontSize: fs, color, bold, align, hw, hh: 10, variant: 'default' })
  const left = (P, y, label, fs, color, bold, hw = 90) => text(P + hw - 2, y, label, fs, color, bold, 'left', hw)
  const box = (x, y, w, h, label, bg = 'rgba(2,10,14,0.86)', border = '#22d3ee', tc = '#a5f3fc') => push({ type: 'groupbox', x, y, width: w, height: h, hw: w / 2, hh: h / 2, label, borderColor: border, titleColor: tc, bgColor: bg, variant: 'default', boxStyle: 'round' })
  const val = (x, y, tagId, decimals) => push({ type: 'numeric', x, y, label: '', tagId, hw: 54, hh: 18, decimals, valueFontSize: 26, digitColor: '#f0fdff', variant: 'lcd', showBox: false })
  // 설정값 입력 필드 (클릭하면 입력창) — 노란 LCD, 박스 표시
  const spval = (x, y, tagId) => push({ type: 'numeric', x, y, label: '', tagId, hw: 34, hh: 15, decimals: 0, valueFontSize: 22, digitColor: '#fde047', variant: 'panel', showBox: true })
  const sw = (x, y, tagId) => push({ type: 'switch', x, y, label: '', tagId, hw: 30, hh: 16, behavior: 'toggle', variant: 'toggle' })
  const lamp = (x, y, tagId) => push({ type: 'lamp', x, y, label: '', tagId, hw: 12, hh: 12, variant: 'round' })
  const gauge = (x, y, tagId, gmax, color) => push({ type: 'gauge', x, y, label: '', tagId, hw: 38, hh: 38, variant: 'arc', gaugeMin: 0, gaugeMax: gmax, gaugeColor: color })
  // 시계 숫자 (2자리 0채움) — 가상 시각 표시
  const clk = (x, y, tagId) => push({ type: 'numeric', x, y, label: '', tagId, hw: 16, hh: 12, decimals: 0, digits: 2, valueFontSize: 19, digitColor: '#67e8f9', variant: 'lcd', showBox: false })

  // 구획 카드 — 진한 패널 + 온도/습도(라벨 좌 · 값 우, 겹침 없음)
  const zone = (x, y, title, n) => {
    box(x, y, 210, 130, title)
    left(x + 16, y + 58, '온도', 13, '#7dd3fc', true, 28)
    val(x + 150, y + 58, `TAG_Z${n}_T`, 1)
    left(x + 16, y + 102, '습도', 13, '#7dd3fc', true, 28)
    val(x + 150, y + 102, `TAG_Z${n}_H`, 0)
  }

  // ── 상단 바 ──
  box(0, 0, 1280, 46, '', 'rgba(3,12,8,0.86)', '#166534', '#4ade80')
  left(24, 22, '🌱 SMART GREENHOUSE · 스마트 온실', 20, '#86efac', true, 210)
  // 날짜·가상 시각 (기상청 2024. 5. 5 어린이날 반영)
  left(672, 22, '📅 2024. 05. 05 (일)', 13, '#fde68a', true, 160)
  clk(892, 23, 'TAG_VH'); text(917, 23, ':', 16, '#cbd5e1', true, 6); clk(942, 23, 'TAG_VM')
  // 일광량
  left(1040, 22, '일광량', 11, '#a7f3d0', false, 44)
  val(1170, 24, 'TAG_LUX', 1)

  // ── 4구획 ──
  zone(24, 120, '존1 · 토마토 A', 1)
  zone(24, 300, '존2 · 토마토 B', 2)
  zone(1046, 120, '존4 · 파프리카 B', 4)
  zone(1046, 300, '존3 · 파프리카 A', 3)

  // ── 환경 제어 — 목표값 설정 + 자동/수동 조작 ──
  box(470, 452, 340, 262, '환경 제어  ·  목표값 클릭 입력 → 자동 제어')
  // 설정값 (클릭해서 입력)
  left(494, 484, '목표 온도', 13, '#7dd3fc', true, 72)
  spval(672, 484, 'TAG_SET_TEMP'); left(716, 484, '°C', 12, '#94a3b8', false, 18)
  left(494, 512, '목표 습도', 13, '#7dd3fc', true, 72)
  spval(672, 512, 'TAG_SET_HUM'); left(716, 512, '%', 12, '#94a3b8', false, 18)
  // 구분선
  push({ type: 'shape', shape: 'line', x: 640, y: 532, hw: 150, hh: 1, strokeColor: '#1e3a5f', strokeWidth: 1 })
  // 장비 (자동 제어 + 수동 클릭 ON/OFF)
  const rows = [['냉각휀', 'TAG_FAN_SW'], ['냉동기', 'TAG_CHILL_SW'], ['히터', 'TAG_HEAT_SW'], ['물 분사', 'TAG_MIST_SW']]
  rows.forEach(([nm, id], i) => {
    const ry = 552 + i * 39
    left(494, ry, nm, 13, '#e2e8f0', true, 60)
    sw(660, ry, id)
    lamp(740, ry, id)
  })

  // ── AI 안내 (좌하단) — 인터랙티브 시나리오 ──
  box(24, 610, 320, 110, '', 'rgba(3,12,8,0.86)', '#166534', '#4ade80')
  left(44, 636, 'AI 능동 감시 시연', 12, '#86efac', true, 140)
  left(44, 660, '① 좌측 "능동 감시 ON"', 10, '#a7f3d0', false, 140)
  left(44, 680, '② 히터를 켜보세요 →', 10, '#fcd34d', false, 140)
  left(44, 698, '온도 상승 → 경보 → AI가 조치 안내', 10, '#fcd34d', false, 140)

  const sim = {
    // 자동 하루 주기 — 켜두면 스스로 일조량이 순환하고 장비가 자동 기동/정지
    // 기상청 2024. 5. 5(어린이날, 서울) 반영: 최저 11°C / 최고 23°C, 일출 05:36 · 일몰 19:11
    auto: {
      daySeconds: 2400,         // 가상 하루 = 2400초 (40분) — 천천히, 무한 반복
      startHour: 6,             // 06:00(일출 무렵)부터 시작
      luxTag: 'TAG_LUX', hourTag: 'TAG_VH', minTag: 'TAG_VM',
      sunrise: 5.6, sunset: 19.2, luxPeak: 96, // 5/5 일출·일몰, 맑은날 정오 일사 ~96klux
      ambientNight: 11, ambientDay: 23, // 기상청 5/5: 최저 11°C ~ 최고 23°C
      refTemp: 'TAG_Z2_T', refHum: 'TAG_Z1_H',
      tempTags: ['TAG_Z1_T', 'TAG_Z2_T', 'TAG_Z3_T', 'TAG_Z4_T'],
      humTags: ['TAG_Z1_H', 'TAG_Z2_H', 'TAG_Z3_H', 'TAG_Z4_H'],
      // 설정값(set) 기준 히스테리시스. on/off = 설정값 대비 오프셋(°C, %)
      control: [
        { ctrl: 'TAG_FAN_SW',   type: 'cool', set: 'TAG_SET_TEMP', on: 1,  off: -0.3 }, // 냉각휀: 목표+1↑ ON
        { ctrl: 'TAG_CHILL_SW', type: 'cool', set: 'TAG_SET_TEMP', on: 3,  off: 1 },    // 냉동기: 목표+3↑ ON
        { ctrl: 'TAG_HEAT_SW',  type: 'heat', set: 'TAG_SET_TEMP', on: -2, off: -0.3 }, // 히터: 목표-2↓ ON
        { ctrl: 'TAG_MIST_SW',  type: 'hum',  set: 'TAG_SET_HUM',  on: -5, off: 2 },    // 물분사: 목표-5↓ ON
      ],
    },
  }

  return { name: 'SMART GREENHOUSE — 스마트 온실', tags, elements: el, bgImage: '/greenhouse.jpg', bgColor: '#0a1a12', sim }
}
