// ════════════════════════════════════════════════════════════
//  표준 부품 라이브러리 (내장) — 프로젝트마다 재사용되는 SCADA 도식 부품
//  · 미묘한 그라데이션으로 "살아있는" 느낌
//  · 동작 레이어: rotate-*(회전) / fill-*(레벨) / toggle-*(ON/OFF)
//  · 회전체는 그룹 안에 "중심 잡는 투명 원"을 넣어 축(중심)에서 정확히 회전
//  id는 std_* 로 시작 → 앱에서 내장 심볼로 인식(사용자 심볼과 구분)
// ════════════════════════════════════════════════════════════
import { makeSvgSymbol } from './symbols'

// ── 그라데이션 헬퍼 ──
const cyl = (id, a, b, c) =>       // 원통형 세로 광택
  `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${a}"/><stop offset=".42" stop-color="${b}"/><stop offset=".6" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`
const rad = (id, a, b) =>          // 금속 구면
  `<radialGradient id="${id}" cx=".38" cy=".33" r=".72"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>`

const S1 = '#c3ccd8', S2 = '#8593a3', S3 = '#4d5a6b', S4 = '#2b3543', E = '#1b2634'
const LIQ = '#37b6e0', LIQ2 = '#1c6f9c', GRN = '#41d888', RED = '#ff5c5c', AC = '#37d3de'
// 회전 그룹의 bbox 중심을 축에 고정하는 투명 원 (흔들림 방지)
const hub = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#00000000"/>`

const DEFS = (s) => `<defs>${s}</defs>`

// ── 부품 정의 ──
const RAW = [
  // 수직 탱크 — fill-level
  { id: 'std_tank', name: '탱크', w: 72, h: 84, layers: [{ id: 'fill-level', animType: 'fill' }],
    svg: `${DEFS(cyl('tkb', S3, S1, S4) + cyl('tkl', LIQ2, LIQ, LIQ2))}
      <rect x="18" y="14" width="44" height="56" rx="4" fill="url(#tkb)" stroke="${E}" stroke-width="1.5"/>
      <g id="fill-level"><rect x="21" y="17" width="38" height="50" rx="2" fill="url(#tkl)"/></g>
      <ellipse cx="40" cy="14" rx="22" ry="5" fill="url(#tkb)" stroke="${E}" stroke-width="1.2"/>
      <ellipse cx="40" cy="70" rx="22" ry="4" fill="${S4}" stroke="${E}" stroke-width="1"/>` },

  // 반응기/용기 (돔) — fill-level
  { id: 'std_vessel', name: '용기/반응기', w: 68, h: 80, layers: [{ id: 'fill-level', animType: 'fill' }],
    svg: `${DEFS(cyl('vsb', S3, S1, S4) + cyl('vsl', '#1c6440', GRN, '#1c6440'))}
      <path d="M22 22 a18 12 0 0 1 36 0 v34 a18 12 0 0 1 -36 0 z" fill="url(#vsb)" stroke="${E}" stroke-width="1.5"/>
      <g id="fill-level"><rect x="23" y="24" width="34" height="42" fill="url(#vsl)"/></g>
      <path d="M22 22 a18 12 0 0 1 36 0 v34 a18 12 0 0 1 -36 0 z" fill="none" stroke="${E}" stroke-width="1.5"/>
      <ellipse cx="40" cy="22" rx="18" ry="12" fill="none" stroke="${E}" stroke-width="1" opacity=".5"/>` },

  // 사일로/호퍼 — fill-level
  { id: 'std_silo', name: '사일로', w: 60, h: 84, layers: [{ id: 'fill-level', animType: 'fill' }],
    svg: `${DEFS(cyl('sib', S3, S1, S4) + cyl('sil', '#7a5a1c', '#e0a83a', '#7a5a1c'))}
      <path d="M22 12 h36 v40 l-18 18 l-18 -18 z" fill="url(#sib)" stroke="${E}" stroke-width="1.5"/>
      <g id="fill-level"><path d="M23 20 h34 v32 l-17 16 l-17 -16 z" fill="url(#sil)"/></g>
      <path d="M22 12 h36 v40 l-18 18 l-18 -18 z" fill="none" stroke="${E}" stroke-width="1.5"/>` },

  // 원심 펌프 — rotate-imp (중심 고정)
  { id: 'std_pump', name: '펌프', w: 76, h: 68, layers: [{ id: 'rotate-imp', animType: 'rotate' }],
    svg: `${DEFS(rad('pmc', S1, S3))}
      <rect x="14" y="54" width="52" height="9" rx="2" fill="${S3}" stroke="${E}"/>
      <rect x="54" y="30" width="12" height="12" fill="${S3}" stroke="${E}"/>
      <circle cx="38" cy="36" r="22" fill="url(#pmc)" stroke="${E}" stroke-width="1.6"/>
      <g id="rotate-imp">${hub(38, 36, 19)}<path d="M38 36 L38 17 M38 36 L54 46 M38 36 L22 46" stroke="${S4}" stroke-width="4.2" stroke-linecap="round"/></g>
      <circle cx="38" cy="36" r="4.5" fill="${S1}" stroke="${E}"/>` },

  // 모터 — rotate-fan (샤프트 팬)
  { id: 'std_motor', name: '모터', w: 74, h: 60, layers: [{ id: 'rotate-fan', animType: 'rotate' }],
    svg: `${DEFS(cyl('mtb', S4, S2, S4) + rad('mtf', S1, S3))}
      <rect x="16" y="50" width="46" height="8" rx="2" fill="${S3}" stroke="${E}"/>
      <rect x="20" y="18" width="38" height="30" rx="5" fill="url(#mtb)" stroke="${E}" stroke-width="1.5"/>
      <g stroke="${S4}" stroke-width="1"><line x1="26" y1="22" x2="26" y2="44"/><line x1="33" y1="22" x2="33" y2="44"/><line x1="40" y1="22" x2="40" y2="44"/></g>
      <circle cx="60" cy="33" r="9" fill="url(#mtf)" stroke="${E}" stroke-width="1.4"/>
      <g id="rotate-fan">${hub(60, 33, 8)}<path d="M60 33 L60 25 M60 33 L66 37 M60 33 L54 37" stroke="${AC}" stroke-width="2.4" stroke-linecap="round"/></g>` },

  // 원심 팬/블로워 — rotate-blade
  { id: 'std_blower', name: '팬/블로워', w: 74, h: 74, layers: [{ id: 'rotate-blade', animType: 'rotate' }],
    svg: `${DEFS(rad('bfc', S1, S3))}
      <circle cx="38" cy="38" r="27" fill="#101b27" stroke="${S3}" stroke-width="2.5"/>
      <circle cx="38" cy="38" r="27" fill="none" stroke="url(#bfc)" stroke-width="2"/>
      <rect x="60" y="30" width="12" height="16" fill="${S3}" stroke="${E}"/>
      <g id="rotate-blade" fill="${S2}">${hub(38, 38, 24)}
        <path d="M38 38 q7 -19 -3 -21 q10 6 3 21"/><path d="M38 38 q19 7 21 -3 q-6 10 -21 3"/><path d="M38 38 q-7 19 3 21 q-10 -6 -3 -21"/><path d="M38 38 q-19 -7 -21 3 q6 -10 21 -3"/></g>
      <circle cx="38" cy="38" r="5" fill="${S1}" stroke="${E}"/>` },

  // 교반기 (탱크+회전 날개) — rotate-blade
  { id: 'std_agitator', name: '교반기', w: 64, h: 80, layers: [{ id: 'rotate-blade', animType: 'rotate' }],
    svg: `${DEFS(cyl('agb', S3, S1, S4))}
      <rect x="16" y="20" width="44" height="52" rx="4" fill="url(#agb)" stroke="${E}" stroke-width="1.5"/>
      <ellipse cx="38" cy="20" rx="22" ry="5" fill="${S1}" stroke="${E}"/>
      <rect x="36" y="12" width="4" height="42" fill="${S3}"/>
      <g id="rotate-blade">${hub(38, 56, 15)}<path d="M22 56 h32 M38 56 l-6 6 M38 56 l6 6" stroke="${S4}" stroke-width="3.4" stroke-linecap="round"/></g>` },

  // 컨베이어 — rotate-r1 / rotate-r2 (양 롤러 중심 고정)
  { id: 'std_conveyor', name: '컨베이어', w: 84, h: 52, layers: [{ id: 'rotate-r1', animType: 'rotate' }, { id: 'rotate-r2', animType: 'rotate' }],
    svg: `${DEFS(rad('cvr', S1, S3))}
      <line x1="20" y1="20" x2="64" y2="20" stroke="${S2}" stroke-width="3"/>
      <line x1="64" y1="40" x2="20" y2="40" stroke="${S2}" stroke-width="3"/>
      <circle cx="20" cy="30" r="12" fill="url(#cvr)" stroke="${E}" stroke-width="1.4"/>
      <circle cx="64" cy="30" r="12" fill="url(#cvr)" stroke="${E}" stroke-width="1.4"/>
      <g id="rotate-r1">${hub(20, 30, 10)}<path d="M20 20 v20 M10 30 h20" stroke="${S4}" stroke-width="2.4"/></g>
      <g id="rotate-r2">${hub(64, 30, 10)}<path d="M64 20 v20 M54 30 h20" stroke="${S4}" stroke-width="2.4"/></g>` },

  // 밸브 — toggle-open (열림=초록 오버레이)
  { id: 'std_valve', name: '밸브', w: 80, h: 48, layers: [{ id: 'toggle-open', animType: 'toggle' }],
    svg: `${DEFS(rad('vlr', RED, '#7a1d1d') + rad('vlg', GRN, '#186b3d'))}
      <line x1="8" y1="24" x2="28" y2="24" stroke="${S3}" stroke-width="5"/><line x1="52" y1="24" x2="72" y2="24" stroke="${S3}" stroke-width="5"/>
      <path d="M28 12 L40 24 L28 36 Z M52 12 L40 24 L52 36 Z" fill="url(#vlr)" stroke="${E}" stroke-width="1.4"/>
      <g id="toggle-open"><path d="M28 12 L40 24 L28 36 Z M52 12 L40 24 L52 36 Z" fill="url(#vlg)" stroke="${E}" stroke-width="1.4"/></g>
      <rect x="37" y="4" width="6" height="9" fill="${S3}"/><rect x="31" y="1" width="18" height="5" rx="2" fill="${S2}"/>` },

  // 열교환기 (shell & tube) — 정적
  { id: 'std_hx', name: '열교환기', w: 76, h: 44, layers: [],
    svg: `${DEFS(cyl('hxb', S4, S2, S4))}
      <rect x="12" y="14" width="56" height="24" rx="12" fill="url(#hxb)" stroke="${E}" stroke-width="1.5"/>
      <g stroke="#0d1621" stroke-width="1.4" opacity=".5"><line x1="18" y1="20" x2="62" y2="20"/><line x1="18" y1="26" x2="62" y2="26"/><line x1="18" y1="32" x2="62" y2="32"/></g>
      <path d="M12 10 h10 M68 42 h-10" stroke="${S3}" stroke-width="4"/>` },

  // 사이클론 — 정적
  { id: 'std_cyclone', name: '사이클론', w: 56, h: 82, layers: [],
    svg: `${DEFS(cyl('cyb', S3, S1, S4))}
      <rect x="16" y="12" width="24" height="4" fill="${S3}"/>
      <path d="M14 16 h28 v20 l-14 34 l-14 -34 z" fill="url(#cyb)" stroke="${E}" stroke-width="1.5"/>
      <rect x="24" y="8" width="8" height="8" fill="${S3}" stroke="${E}"/>` },

  // 스크러버/흡수탑 — fill-level
  { id: 'std_scrubber', name: '스크러버', w: 52, h: 84, layers: [{ id: 'fill-level', animType: 'fill' }],
    svg: `${DEFS(cyl('scb', S3, S1, S4) + cyl('scl', LIQ2, LIQ, LIQ2))}
      <rect x="18" y="10" width="30" height="64" rx="14" fill="url(#scb)" stroke="${E}" stroke-width="1.5"/>
      <g id="fill-level"><rect x="20" y="12" width="26" height="60" rx="12" fill="url(#scl)" opacity=".55"/></g>
      <rect x="18" y="10" width="30" height="64" rx="14" fill="none" stroke="${E}" stroke-width="1.5"/>
      <g stroke="${S4}" stroke-width="1" opacity=".6"><line x1="22" y1="26" x2="44" y2="26"/><line x1="22" y1="40" x2="44" y2="40"/><line x1="22" y1="54" x2="44" y2="54"/></g>` },
]

export const STD_SYMBOLS = RAW.map(r =>
  makeSvgSymbol({
    id: r.id, name: r.name, w: r.w, h: r.h, layers: r.layers,
    svgContent: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">${r.svg}</svg>`,
  })
)
