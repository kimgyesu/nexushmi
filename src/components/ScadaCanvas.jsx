import { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react'
import { Maximize2, Grid3X3, ZoomIn, ZoomOut, RotateCcw, Trash2, X as XIcon, GripHorizontal, Pencil, Share2, Undo2, Redo2, Palette,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal, AlignHorizontalSpaceAround, AlignVerticalSpaceAround } from 'lucide-react'
import { formatTagValue } from '../data/tags'
import { isSvgSymbol } from '../data/symbols'
import { computeLayerStyle } from '../utils/svgNaming'
import { scanAlarms } from '../utils/alarms'


/* 배치 경계: 해상도 기반 (동적) */
function makeClamp(canvasW, canvasH) {
  return {
    clampX: v => Math.max(0, Math.min(canvasW, v)),
    clampY: v => Math.max(0, Math.min(canvasH, v)),
  }
}

/* 요소별 실효 tagId: 바인딩이 있으면 사용, 없으면 기본값 */
export function resolveTag(el, bindings, tags) {
  const tagId = bindings[el.id] ?? el.tagId
  return tags.find(t => t.id === tagId) ?? null
}

/* 태그 알람 레벨 — 아날로그 상한 근접/알람성 BIT ON. 표시기 깜빡임 판정용 */
export function tagAlarmLevel(tag) {
  if (!tag) return 'none'
  if (tag.type === 'BIT') {
    const isAlarm = /알람|경보|고장|이상|비상|trip|fault|alarm|error/i.test(`${tag.id} ${tag.desc || ''}`)
    return (isAlarm && Number(tag.value) === 1) ? '경보' : 'none'
  }
  const v = Number(tag.value) || 0, max = Number(tag.max)
  if (Number.isFinite(max) && max > 0) {
    const r = v / max
    if (r >= 0.95) return '경보'
    if (r >= 0.85) return '주의'
  }
  return 'none'
}

/* 값 → 구간색: animStops [{upTo,color}] 오름차순, 마지막 upTo=null(그이상). 값 ≤ upTo 첫 매칭 */
function pickStopColor(stops, val, fallback) {
  if (!Array.isArray(stops) || !stops.length) return fallback
  for (const s of stops) { if (s.upTo == null || val <= s.upTo) return s.color }
  return stops[stops.length - 1].color
}

/* 라벨 텍스트 공통 스타일 — el.label* 오버라이드를 기본값 위에 적용(미지정이면 기존 기본값 유지) */
function lblProps(el, def = {}) {
  return {
    fontSize: el.labelFontSize || def.fontSize || 7,
    fontFamily: el.labelFontFamily || def.fontFamily || 'monospace',
    fontWeight: el.labelBold ? 'bold' : (def.fontWeight || 'normal'),
    fontStyle: el.labelItalic ? 'italic' : 'normal',
    textDecoration: el.labelUnderline ? 'underline' : 'none',
    fill: el.labelColor || def.fill || '#94a3b8',
  }
}

/* 태그의 표시 수치값 (WORD는 decimals 반영한 엔지니어링 값) */
function tagNum(tag) {
  if (!tag) return 0
  const raw = Number(tag.value) || 0
  if (tag.type === 'BIT') return raw ? 1 : 0
  if (tag.type === 'FLOAT') return raw
  const d = Math.max(0, Math.min(6, Number(tag.decimals) || 0))
  return raw / Math.pow(10, d)
}

/* 게이지 아크 path — 중심(0,0), 반지름 R, 시작각 A0(deg), 총 스윕 SW(deg), t0~t1(0~1) */
function gaugeArcD(R, A0, SW, t0, t1) {
  const a0 = (A0 + t0 * SW) * Math.PI / 180, a1 = (A0 + t1 * SW) * Math.PI / 180
  const x0 = R * Math.cos(a0), y0 = R * Math.sin(a0)
  const x1 = R * Math.cos(a1), y1 = R * Math.sin(a1)
  const large = Math.abs((t1 - t0) * SW) > 180 ? 1 : 0
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`
}
// 변형별 아크 기하 (원형 계열)
const GAUGE_ARC = {
  arc:  { A0: 135, SW: 270 },  // 원형(270° 열린 게이지)
  semi: { A0: 180, SW: 180 },  // 반원(위쪽 180°)
  dial: { A0: 135, SW: 270 },  // 다이얼(눈금+바늘)
}

/* ── 캔버스 요소 렌더러들 ── */

function CanvasSwitch({ el, tag, selected, onPointerDown, onDoubleClick }) {
  const v = el.variant || 'toggle'
  const on = Number(tag?.value) === 1
  const cursor = onDoubleClick ? (selected ? 'move' : 'grab') : 'pointer'
  return (
    <g transform={`translate(${el.x}, ${el.y})`} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} style={{ cursor }}>
      {selected && (
        <rect x="-38" y="-28" width="76" height="56" rx="5"
              fill="none" stroke="#00d4ff" strokeWidth="1.5" strokeDasharray="5 3"
              style={{ filter: 'drop-shadow(0 0 5px #00d4ff88)' }} />
      )}
      <rect x="-32" y="-20" width="64" height="40" rx="4"
            fill={selected ? '#0f2444' : '#1a202c'}
            stroke={selected ? '#00d4ff44' : on ? '#22c55e44' : '#2d3748'} strokeWidth="1" />
      {v === 'rocker' ? (
        <g>
          <rect x="-16" y="-10" width="32" height="20" rx="2" fill="#0f172a" stroke="#334155" strokeWidth="1" />
          {/* OFF 쪽 */}
          <rect x="-16" y="-10" width="16" height="20" rx="2"
            fill={on ? '#0f172a' : '#3f1d1d'} stroke={on ? '#334155' : '#7f1d1d'} strokeWidth="1" />
          <text x="-8" y="3" textAnchor="middle" fontSize="6" fontFamily="monospace" fill={on ? '#4a5568' : '#ef4444'}>OFF</text>
          {/* ON 쪽 */}
          <rect x="0" y="-10" width="16" height="20" rx="2"
            fill={on ? '#14532d' : '#0f172a'} stroke={on ? '#22c55e' : '#334155'} strokeWidth="1" />
          <text x="8" y="3" textAnchor="middle" fontSize="6" fontFamily="monospace" fill={on ? '#22c55e' : '#4a5568'}>ON</text>
        </g>
      ) : v === 'push' ? (
        <g>
          <circle cx="0" cy="-4" r="11" fill={on ? '#14532d' : '#1f2937'}
            stroke={on ? '#22c55e' : '#334155'} strokeWidth="1.5"
            style={on ? { filter: 'drop-shadow(0 0 4px #22c55e88)' } : {}} />
          <circle cx="0" cy="-4" r="7" fill={on ? '#22c55e' : '#4b5563'} />
        </g>
      ) : (
        /* 토글 슬라이더 */
        <g>
          <rect x="-16" y="-11" width="32" height="14" rx="7"
            fill={on ? '#14532d' : '#3f1d1d'} stroke={on ? '#22c55e' : '#7f1d1d'} strokeWidth="1" />
          <circle cx={on ? 7 : -7} cy="-4" r="6" fill={on ? '#22c55e' : '#9ca3af'} />
        </g>
      )}
      <text x="0" y="15" textAnchor="middle" {...lblProps(el, { fill: on ? '#22c55e' : '#94a3b8' })}>{el.label}</text>
      <rect x="-32" y="-20" width="64" height="40" fill="transparent" />
    </g>
  )
}

function CanvasLamp({ el, tag, selected, onPointerDown, onDoubleClick }) {
  const v = el.variant || 'round'
  const on = Number(tag?.value) === 1
  const lampColor = el.color || '#22c55e'
  const cursor = onDoubleClick ? (selected ? 'move' : 'grab') : 'default'
  return (
    <g transform={`translate(${el.x}, ${el.y})`} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} style={{ cursor }}>
      {selected && (
        <rect x="-38" y="-28" width="76" height="56" rx="5"
              fill="none" stroke="#00d4ff" strokeWidth="1.5" strokeDasharray="5 3"
              style={{ filter: 'drop-shadow(0 0 5px #00d4ff88)' }} />
      )}
      <rect x="-32" y="-20" width="64" height="40" rx="4"
            fill={selected ? '#0f2444' : '#1a202c'}
            stroke={selected ? '#00d4ff44' : '#2d3748'} strokeWidth="1" />
      {v === 'square' ? (
        <rect x="-9" y="-13" width="18" height="18" rx="3"
          fill={on ? lampColor : '#374151'}
          style={on ? { filter: `drop-shadow(0 0 5px ${lampColor}aa)` } : {}} />
      ) : v === 'beacon' ? (
        <g>
          <path d="M -9 3 A 9 9 0 0 1 9 3 Z"
            fill={on ? lampColor : '#374151'}
            style={on ? { filter: `drop-shadow(0 0 6px ${lampColor}cc)` } : {}} />
          <rect x="-11" y="3" width="22" height="3" rx="1" fill="#1f2937" />
        </g>
      ) : (
        <circle cx="0" cy="-4" r="8"
          fill={on ? lampColor : '#374151'}
          style={on ? { filter: `drop-shadow(0 0 6px ${lampColor}aa)` } : {}} />
      )}
      <text x="0" y="14" textAnchor="middle" {...lblProps(el, { fill: on ? lampColor : '#94a3b8' })}>{el.label}</text>
      <rect x="-32" y="-20" width="64" height="40" fill="transparent" />
    </g>
  )
}

function CanvasGauge({ el, tag, selected, onPointerDown, onDoubleClick }) {
  const v = el.variant || 'arc'
  // 값 · 퍼센트 · 구간색
  const minV = el.gaugeMin ?? tag?.min ?? 0
  const maxV = el.gaugeMax ?? tag?.max ?? 100
  const val = tag ? tagNum(tag) : minV
  const pct = maxV !== minV ? Math.max(0, Math.min(1, (val - minV) / (maxV - minV))) : 0
  const color = pickStopColor(el.animStops, val, el.gaugeColor || '#00d4ff')
  const display = tag ? formatTagValue(tag) : '--'
  const unit = tag?.unit || ''
  const cursor = onDoubleClick ? (selected ? 'move' : 'grab') : 'default'

  // ── 사각(수평 막대) 게이지 — 박스(hw,hh)를 그대로 채움 (양축 리사이즈) ──
  if (v === 'linear') {
    const W = (el.hw ?? 34) * 2, H = (el.hh ?? 34) * 2, pad = 6
    const barH = Math.max(8, Math.min(H * 0.34, 20))
    const trackW = W - pad * 2, by = -barH / 2 + 3
    return (
      <g transform={`translate(${el.x}, ${el.y})`} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} style={{ cursor }}>
        <rect x={-W/2} y={-H/2} width={W} height={H} rx={4} fill="#1a202c" stroke={selected ? '#00d4ff44' : '#2d3748'} strokeWidth="1" />
        {el.label && <text x={-W/2+pad} y={-H/2+12} {...lblProps(el, { fontSize: 9 })}>{el.label}</text>}
        <rect x={-trackW/2} y={by} width={trackW} height={barH} rx={barH/2} fill="#0f172a" stroke="#334155" strokeWidth="1" />
        <rect x={-trackW/2} y={by} width={Math.max(0, trackW*pct)} height={barH} rx={barH/2} fill={color}
          style={{ filter:`drop-shadow(0 0 4px ${color}88)`, transition:'width 0.3s ease, fill 0.3s ease' }} />
        <text x={W/2-pad} y={H/2-6} textAnchor="end" fontSize={13} fontWeight="700" fill={color} fontFamily="monospace"
          style={{ filter:`drop-shadow(0 0 3px ${color}aa)` }}>{display}{unit?` ${unit}`:''}</text>
        <text x={-W/2+pad} y={H/2-6} fontSize={8} fill="#475569" fontFamily="monospace">{minV}</text>
        <rect x={-W/2} y={-H/2} width={W} height={H} fill="transparent" />
      </g>
    )
  }

  // ── 원형 계열 (arc / semi / dial / ring) — min(hw,hh) 균등 스케일 ──
  const k = Math.max(14, Math.min(el.hw ?? 34, el.hh ?? 34)) / 34
  const R = 26, sw = 5
  const arc = GAUGE_ARC[v] || GAUGE_ARC.arc
  return (
    <g transform={`translate(${el.x}, ${el.y})`} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} style={{ cursor }}>
      <g transform={`scale(${k})`}>
        <circle cx="0" cy="0" r="32" fill="#1a202c" stroke={selected ? '#00d4ff44' : '#2d3748'} strokeWidth="1" />
        {v === 'ring' ? (() => {
          const C = 2 * Math.PI * R
          return (<g transform="rotate(-90)">
            <circle r={R} fill="none" stroke="#374151" strokeWidth={sw} />
            <circle r={R} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"
              strokeDasharray={`${(pct*C).toFixed(2)} ${C.toFixed(2)}`}
              style={{ filter:`drop-shadow(0 0 4px ${color}aa)`, transition:'stroke-dasharray 0.3s ease, stroke 0.3s ease' }} />
          </g>)
        })() : (<>
          <path d={gaugeArcD(R, arc.A0, arc.SW, 0, 1)} fill="none" stroke="#374151" strokeWidth={sw} strokeLinecap="round" />
          <path d={gaugeArcD(R, arc.A0, arc.SW, 0, pct)} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"
            style={{ filter:`drop-shadow(0 0 4px ${color}aa)`, transition:'stroke 0.3s ease' }} />
          {v === 'dial' && [0,0.25,0.5,0.75,1].map(t => {
            const a = (arc.A0 + t*arc.SW) * Math.PI/180
            return <line key={t} x1={Math.cos(a)*(R-7)} y1={Math.sin(a)*(R-7)} x2={Math.cos(a)*(R-2)} y2={Math.sin(a)*(R-2)} stroke="#475569" strokeWidth="1.5" />
          })}
          {(() => {
            const a = (arc.A0 + pct*arc.SW) * Math.PI/180
            return <line x1="0" y1="0" x2={(R-4)*Math.cos(a)} y2={(R-4)*Math.sin(a)} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          })()}
          <circle cx="0" cy="0" r="3.5" fill={color} />
        </>)}
        <text x="0" y={v==='semi'?5:(v==='ring'?2:14)} textAnchor="middle" fontSize="11" fontWeight="700" fill={color} fontFamily="monospace"
          style={{ filter:`drop-shadow(0 0 3px ${color}aa)` }}>{display}</text>
        {unit && <text x="0" y={v==='semi'?15:(v==='ring'?13:23)} textAnchor="middle" fontSize="6.5" fill="#64748b" fontFamily="monospace">{unit}</text>}
        {el.label && <text x="0" y="46" textAnchor="middle" {...lblProps(el)}>{el.label}</text>}
        <circle cx="0" cy="0" r="32" fill="transparent" />
      </g>
    </g>
  )
}

function CanvasNumeric({ el, tag, selected, onPointerDown, onDoubleClick }) {
  // 엘리먼트 레벨 decimals/digits 오버라이드 지원
  const effectiveTag = tag ? {
    ...tag,
    decimals: el.decimals != null ? el.decimals : (tag.decimals ?? 0),
    digits:   el.digits   != null ? el.digits   : (tag.digits   ?? 0),
  } : null
  const display = effectiveTag ? formatTagValue(effectiveTag) : '--'
  const v = el.variant || 'lcd'
  const panel = v === 'panel'
  const hw = el.hw || 42
  const hh = el.hh || 18
  const lfs = el.labelFontSize || 7
  // 값 글꼴: valueFontSize 우선, 없으면 fontSize(일반 글자크기)도 반영
  const vfs = el.valueFontSize || el.fontSize || 13
  const showBox   = el.showBox !== false  // 기본 true
  const bgColor   = el.bgColor   || (panel ? '#0a0a0a' : '#0f172a')
  const boxColor  = el.boxColor  || (panel ? '#52525b' : '#1e2a4a')
  const digitColor = el.digitColor || (panel ? '#fbbf24' : '#00d4ff')
  const labelColor = el.labelColor || '#64748b'
  return (
    <g transform={`translate(${el.x}, ${el.y})`} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} style={{ cursor: onDoubleClick ? (selected ? 'move' : 'grab') : 'default' }}>
      {selected && (
        <rect x={-hw - 6} y={-hh - 6} width={(hw + 6) * 2} height={(hh + 6) * 2} rx="5"
              fill="none" stroke="#00d4ff" strokeWidth="1.5" strokeDasharray="5 3"
              style={{ filter: 'drop-shadow(0 0 5px #00d4ff88)' }} />
      )}
      {showBox && (
        <rect x={-hw} y={-hh} width={hw * 2} height={hh * 2} rx={panel ? 1 : 3}
              fill={selected ? '#0c1629' : bgColor}
              stroke={selected ? '#1e40af' : boxColor} strokeWidth={panel ? 2 : 1} />
      )}
      <text x="0" y={-hh * 0.3} textAnchor="middle" {...lblProps(el, { fontSize: lfs, fill: labelColor })}>
        {el.label}
      </text>
      {(() => {
        const align = el.align || 'center'
        const unitW = tag?.unit ? String(tag.unit).length * Math.max(5, lfs - 1) * 0.62 + 3 : 0
        const vx = align === 'left' ? -hw + 5 : align === 'right' ? hw - 4 - unitW : 0
        const vanchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle'
        return (
          <text x={vx} y={hh * 0.55} textAnchor={vanchor} fontSize={vfs} fill={digitColor} fontFamily="monospace"
                style={{ filter: `drop-shadow(0 0 4px ${digitColor}aa)` }}>
            {display}
          </text>
        )
      })()}
      <text x={hw - 4} y={hh * 0.55} textAnchor="end" fontSize={Math.max(5, lfs - 1)} fill="#4a9eff" fontFamily="monospace">
        {tag?.unit}
      </text>
      <rect x={-hw} y={-hh} width={hw * 2} height={hh * 2} fill="transparent" />
    </g>
  )
}

// 트렌드 그래프 — 태그값을 시간축으로 기록하는 롤링 라인차트 (구간색 지원)
function CanvasBar({ el, tag, selected, onPointerDown, onDoubleClick }) {
  const W = (el.hw ?? 70) * 2, H = (el.hh ?? 34) * 2
  const v = el.variant || 'line'
  const maxPts = Math.max(10, Math.min(400, el.trendPoints || 60))
  const sampleMs = Math.max(200, el.trendSampleMs || 1000)
  const yMin = el.trendMin ?? tag?.min ?? 0
  const yMax = el.trendMax ?? tag?.max ?? 100
  const stops = el.animStops
  const baseColor = el.gaugeColor || '#00d4ff'
  const cursor = onDoubleClick ? (selected ? 'move' : 'grab') : 'default'

  // 롤링 버퍼 — 태그값을 sampleMs 주기로 기록 (요소별 유지)
  const valRef = useRef(0)
  valRef.current = tag ? tagNum(tag) : 0
  const bufRef = useRef([])
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      const arr = bufRef.current
      arr.push(valRef.current)
      if (arr.length > maxPts) arr.splice(0, arr.length - maxPts)
      force(n => (n + 1) & 0xffff)
    }, sampleMs)
    return () => clearInterval(id)
  }, [maxPts, sampleMs])

  const pts = bufRef.current
  const curVal = valRef.current
  const curColor = pickStopColor(stops, curVal, baseColor)
  const display = tag ? formatTagValue(tag) : '--'
  const unit = tag?.unit || ''

  const padL = 5, padR = 5, padT = el.label ? 15 : 5, padB = 5
  const plotW = W - padL - padR, plotH = H - padT - padB
  const gx = -W / 2 + padL, gy = -H / 2 + padT
  const span = (yMax - yMin) || 1
  const xAt = i => gx + (maxPts <= 1 ? 0 : (i / (maxPts - 1)) * plotW)
  const yAt = val => gy + plotH - Math.max(0, Math.min(1, (val - yMin) / span)) * plotH

  // 구간색 배경 밴드
  const bands = []
  if (Array.isArray(stops) && stops.length) {
    let lo = yMin
    for (const s of stops) {
      const hi = s.upTo == null ? yMax : Math.min(s.upTo, yMax)
      if (hi > lo) {
        const yt = yAt(hi), yb = yAt(lo)
        bands.push({ y: yt, h: yb - yt, color: s.color })
      }
      lo = s.upTo == null ? yMax : s.upTo
      if (lo >= yMax) break
    }
  }

  // 세그먼트별 라인(각 점의 값 구간색)
  const segs = []
  for (let i = 1; i < pts.length; i++) {
    segs.push(<line key={i} x1={xAt(i - 1).toFixed(1)} y1={yAt(pts[i - 1]).toFixed(1)}
      x2={xAt(i).toFixed(1)} y2={yAt(pts[i]).toFixed(1)}
      stroke={pickStopColor(stops, pts[i - 1], baseColor)} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />)
  }
  const areaD = (v === 'area' && pts.length >= 2)
    ? pts.map((p, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(p).toFixed(1)}`).join(' ')
      + ` L${xAt(pts.length - 1).toFixed(1)},${(gy + plotH).toFixed(1)} L${xAt(0).toFixed(1)},${(gy + plotH).toFixed(1)} Z`
    : ''

  return (
    <g transform={`translate(${el.x}, ${el.y})`} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} style={{ cursor }}>
      <rect x={-W/2} y={-H/2} width={W} height={H} rx={4}
            fill={selected ? '#0f2036' : '#0f172a'} stroke={selected ? '#00d4ff88' : '#2d3748'} strokeWidth="1" />
      {/* 구간색 배경 밴드 */}
      {bands.map((b, i) => (
        <rect key={i} x={gx} y={b.y} width={plotW} height={b.h} fill={b.color} opacity={0.1} />
      ))}
      {/* 기준선(중간값) */}
      <line x1={gx} y1={yAt((yMin + yMax) / 2)} x2={gx + plotW} y2={yAt((yMin + yMax) / 2)} stroke="#334155" strokeWidth="0.5" strokeDasharray="2 3" />
      {areaD && <path d={areaD} fill={curColor} fillOpacity={0.14} />}
      {segs}
      {pts.length >= 1 && <circle cx={xAt(pts.length - 1)} cy={yAt(pts[pts.length - 1])} r="2" fill={curColor}
        style={{ filter: `drop-shadow(0 0 3px ${curColor})` }} />}
      {pts.length < 2 && <text x="0" y="0" textAnchor="middle" dominantBaseline="central" fontSize="8" fill="#475569" fontFamily="monospace">기록 중…</text>}
      {el.label && <text x={-W/2 + padL} y={-H/2 + 11} {...lblProps(el, { fontSize: 9 })}>{el.label}</text>}
      <text x={W/2 - padR} y={-H/2 + 11} textAnchor="end" fontSize="9" fontWeight="700" fill={curColor} fontFamily="monospace"
        style={{ filter: `drop-shadow(0 0 3px ${curColor}aa)` }}>{display}{unit ? ` ${unit}` : ''}</text>
      <rect x={-W/2} y={-H/2} width={W} height={H} fill="transparent" />
    </g>
  )
}

function CanvasSvgSymbol({ el, tags, selected, onPointerDown, onDoubleClick, onContextMenu, sym, svgBindings, runtime }) {
  const w = el.w || 80, h = el.h || 80
  const layerBindings = svgBindings?.[el.id] || {}
  const runtimeId = useRef(`rsvg_${el.id}`).current

  // 정적 SVG (애니메이션 태그 제거)
  const staticSvg = useMemo(() => {
    if (!sym?.svgContent) return ''
    return sym.svgContent
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<animate[\s\S]*?\/>/gi, '')
      .replace(/<animate[\s\S]*?<\/animate>/gi, '')
      .replace(/<animateTransform[\s\S]*?\/>/gi, '')
      .replace(/<animateTransform[\s\S]*?<\/animateTransform>/gi, '')
      .replace(/(<svg[^>]*)\s+width="[^"]*"/, '$1')
      .replace(/(<svg[^>]*)\s+height="[^"]*"/, '$1')
      .replace(/(<svg[^>]*)\s+preserveAspectRatio="[^"]*"/, '$1')  // 기존 값 제거
      // preserveAspectRatio="none" → 박스(w×h)에 꽉 차게 = 가로/세로 독립 신축
      .replace(/<svg/, `<svg preserveAspectRatio="none" width="${w}" height="${h}"`)
  }, [sym, w, h])

  // 런타임 전용: 태그값 기반 CSS 애니메이션
  const runtimeCss = useMemo(() => {
    if (!runtime || !sym?.layers?.length) return ''
    let css = ''
    for (const layer of sym.layers) {
      const animType = layer.animType && layer.animType !== 'none' ? layer.animType
        : String(layer.id || '').match(/^(rotate|translate|fill|toggle)-/)?.[1]
      if (!animType) continue
      const bind = layerBindings[layer.id] || {}
      const bindObj = typeof bind === 'string' ? { speed: bind } : bind
      // enable 바인딩 없으면 el.tagId 사용 (심볼 메인 태그)
      const eid = CSS.escape(layer.id)
      const sel = `#${runtimeId} #${eid}`
      const kname = `rsvg_${(layer.id || '').replace(/[^a-z0-9]/gi, '_')}_${el.id}`
      // enable: 레이어 바인딩 → 심볼 메인 태그(el.tagId) 순서로 fallback
      const enableId = bindObj.enable || el.tagId
      const enableTag = (tags || []).find(t => t.id === enableId)
      const isEnabled = enableTag ? Number(enableTag.value) !== 0 : true
      // speed: 바인딩 있으면 사용, 없으면 50% 기본값 / 값이 0이면 정지
      const speedTag = (tags || []).find(t => t.id === bindObj.speed)
      const speedRaw = speedTag ? (Number(speedTag.value) || 0) : null
      const speedPct = speedTag
        ? Math.min(1, Math.max(0, speedRaw / (speedTag.max || 100)))
        : 0.5
      // 속도 태그가 있고 값이 0이면 정지
      const isMoving = isEnabled && (speedTag ? speedRaw > 0 : true)
      if (animType === 'rotate') {
        if (isMoving) {
          const dur = (1 / (Math.max(0.02, speedPct) * 2)).toFixed(2)
          const dir = bindObj.direction === 'ccw' ? 'reverse' : 'normal'
          css += `@keyframes ${kname}{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`
          css += `${sel}{transform-box:fill-box;transform-origin:center;animation:${kname} ${dur}s linear ${dir} infinite;}`
        } else {
          css += `${sel}{animation:none;transform:none;}`
        }
      } else if (animType === 'translate') {
        if (isMoving) {
          const dur = Math.max(0.3, 3 - Math.max(0.02, speedPct) * 2.5).toFixed(2)
          css += `@keyframes ${kname}{0%,100%{transform:translateX(0)}50%{transform:translateX(${Math.round(speedPct * 20)}px)}}`
          css += `${sel}{transform-box:fill-box;transform-origin:center;animation:${kname} ${dur}s ease-in-out infinite;}`
        } else {
          css += `${sel}{animation:none;transform:none;}`
        }
      } else if (animType === 'fill') {
        css += `${sel}{clip-path:inset(${Math.round((1 - speedPct) * 100)}% 0 0 0);}`
      } else if (animType === 'toggle') {
        css += `${sel}{opacity:${isEnabled ? 1 : 0.2};}`
      }
    }
    return css
  }, [runtime, sym, tags, layerBindings, runtimeId, el.id])

  const cursor = onDoubleClick ? (selected ? 'move' : 'grab') : 'pointer'
  const rot = el.imgRotation || 0
  const scaleX = el.imgFlipX ? -1 : 1
  const scaleY = el.imgFlipY ? -1 : 1
  const xform = (rot || scaleX < 0 || scaleY < 0) ? `rotate(${rot}) scale(${scaleX},${scaleY})` : undefined
  return (
    <g transform={`translate(${el.x}, ${el.y})`} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} style={{ cursor }}>
      <g transform={xform}>
        <foreignObject x={-w / 2} y={-h / 2} width={w} height={h}>
          <div xmlns="http://www.w3.org/1999/xhtml" style={{ width: w, height: h, overflow: 'hidden' }}>
            {runtimeCss && <style>{runtimeCss}</style>}
            <div id={runtimeId} style={{ width: w, height: h }}
              dangerouslySetInnerHTML={{ __html: staticSvg }} />
          </div>
        </foreignObject>
      </g>
      {el.label && (
        <text x="0" y={h / 2 + 8} textAnchor="middle" {...lblProps(el)}>{el.label}</text>
      )}
      <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="transparent"
        onContextMenu={onContextMenu ? (e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, el.id) } : undefined} />
    </g>
  )
}

function CanvasSymbol({ el, tag, tags, selected, onPointerDown, onDoubleClick, onContextMenu, symbols, svgBindings, runtime }) {
  const sym = (symbols || []).find(s => s.id === el.symbolId)
  const w = el.w || 48, h = el.h || 48

  if (isSvgSymbol(sym)) {
    return <CanvasSvgSymbol el={el} tags={tags} selected={selected} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} onContextMenu={onContextMenu} sym={sym} svgBindings={svgBindings} runtime={runtime} />
  }

  const on = Number(tag?.value) === 1
  const href = sym ? (on ? (sym.on || sym.off) : (sym.off || sym.on)) : ''
  const cursor = onDoubleClick ? (selected ? 'move' : 'grab') : 'pointer'
  const rot = el.imgRotation || 0
  const scaleX = el.imgFlipX ? -1 : 1
  const scaleY = el.imgFlipY ? -1 : 1
  const imgTransform = (rot || scaleX < 0 || scaleY < 0) ? `rotate(${rot}) scale(${scaleX},${scaleY})` : undefined
  return (
    <g transform={`translate(${el.x}, ${el.y})`} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick}
      style={{ cursor }}>
      {href
        ? <g transform={imgTransform}><image href={href} x={-w / 2} y={-h / 2} width={w} height={h} preserveAspectRatio="none" /></g>
        : <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="3" fill="#1a202c" stroke="#7f1d1d" strokeWidth="1" />}
      {el.label && (
        <text x="0" y={h / 2 + 8} textAnchor="middle" {...lblProps(el)}>{el.label}</text>
      )}
      <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="transparent" />
    </g>
  )
}

/* ── 텍스트 라벨 ── */
function CanvasText({ el, selected, onPointerDown, onDoubleClick, onClick }) {
  const fs = el.fontSize || 13
  const lines = String(el.label ?? '텍스트').split('\n')
  const lineH = fs * 1.25
  const totalH = lines.length * lineH
  const maxLen = Math.max(1, ...lines.map(l => l.length))
  // 내용 기준 최소 크기 — 수동 리사이즈(el.hw/hh)가 더 크면 그걸 사용
  const hw = Math.max(el.hw || 0, Math.max(40, maxLen * fs * 0.32))
  const hh = Math.max(el.hh || 0, Math.ceil(fs * 0.75), Math.ceil(totalH / 2))
  const color = el.color || '#e2e8f0'
  const anchor = el.align === 'left' ? 'start' : el.align === 'right' ? 'end' : 'middle'
  const ax = el.align === 'left' ? -hw + 2 : el.align === 'right' ? hw - 2 : 0
  return (
    <g transform={`translate(${el.x}, ${el.y})`} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} onClick={onClick} style={{ cursor: onDoubleClick ? (selected ? 'move' : 'grab') : 'default' }}>
      {selected && (
        <rect x={-hw} y={-hh} width={hw * 2} height={hh * 2}
          fill="none" stroke="#00d4ff" strokeWidth="1" strokeDasharray="4 3" rx="2" />
      )}
      <text x={ax} y="0" fontSize={fs} fill={color}
        fontWeight={el.bold ? 'bold' : 'normal'} fontStyle={el.italic ? 'italic' : 'normal'}
        textDecoration={el.underline ? 'underline' : 'none'}
        textAnchor={anchor} dominantBaseline="central"
        fontFamily={el.fontFamily || "'Consolas','Courier New',monospace"}>
        {lines.map((ln, i) => (
          <tspan key={i} x={ax} dy={i === 0 ? -(totalH / 2) + lineH / 2 : lineH}>{ln || ' '}</tspan>
        ))}
      </text>
      <rect x={-hw} y={-hh} width={hw * 2} height={hh * 2} fill="transparent" />
    </g>
  )
}

/* 표 칸 비율(분수) — 저장된 배열이 유효하면 사용, 아니면 균등 */
export function gridFracs(arr, n) {
  if (n <= 0) return []
  if (Array.isArray(arr) && arr.length === n) {
    const s = arr.reduce((a, b) => a + (+b || 0), 0)
    if (s > 0) return arr.map(v => (+v || 0) / s)
  }
  return Array.from({ length: n }, () => 1 / n)
}
// 분수 배열 → 누적 경계(0<..<1) 목록
function gridBounds(fr) {
  const out = []; let c = 0
  for (let i = 0; i < fr.length - 1; i++) { c += fr[i]; out.push(c) }
  return out
}

/* ── 그룹 박스 ── */
function CanvasGroupBox({ el, selected, onPointerDown, onDoubleClick, onClick }) {
  const w = el.width || 200
  const h = el.height || 120
  const bc = el.borderColor || '#00e5ff'
  // rgba() 색에서 알파 제거 — 투명도는 fillOpacity 슬라이더로만 제어
  const rawBg = el.bgColor || '#0a1628'
  const bg = rawBg.startsWith('rgba') ? rawBg.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, 'rgb($1,$2,$3)') : rawBg
  const tc = el.titleColor || '#00e5ff'
  const titleH = el.label ? 18 : 0
  // 모서리 스타일: sharp(직각) / round(둥근, 기본) / bevel(입체)
  const style = el.boxStyle || 'round'
  const rx = style === 'sharp' ? 0 : 3
  const bevel = style === 'bevel'
  const gid = `gbfill_${el.id}`
  // 내부 표: 행(가로 칸) × 열(세로 칸)
  const rows = Math.max(0, Math.min(20, Math.round(+el.gridRows || 0)))
  const cols = Math.max(0, Math.min(20, Math.round(+el.gridCols || 0)))
  const cTop = titleH, cH = h - titleH
  return (
    <g transform={`translate(${el.x}, ${el.y})`} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} onClick={onClick} style={{ cursor: onDoubleClick ? (selected ? 'move' : 'grab') : 'default' }}>
      {/* 배경 */}
      {bevel ? (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#35455e" />
              <stop offset="0.5" stopColor="#1b2637" />
              <stop offset="1" stopColor="#0e1826" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width={w} height={h} rx={rx} fill={`url(#${gid})`} stroke={bc} strokeWidth="1.5" />
          {/* 상·좌 하이라이트 / 하·우 그림자 = 돌출감 */}
          <path d={`M1.5 ${h - 2} L1.5 2 L${w - 2} 2`} fill="none" stroke="#ffffff" strokeOpacity="0.16" strokeWidth="1.3" />
          <path d={`M2 ${h - 1.5} L${w - 1.5} ${h - 1.5} L${w - 1.5} 2`} fill="none" stroke="#000000" strokeOpacity="0.45" strokeWidth="1.3" />
        </>
      ) : (
        <rect x="0" y="0" width={w} height={h} rx={rx} fill={bg} fillOpacity={el.opacity ?? 0.1} stroke={bc} strokeWidth="1.5" />
      )}
      {/* 내부 표 (행·열 격자) — 가로줄/세로줄 색 분리 (gridColor는 공통 폴백) */}
      {(rows > 1 || cols > 1) && cH > 0 && (() => {
        const hCol = el.gridColorH || el.gridColor || bc   // 가로줄(행 구분선)
        const vCol = el.gridColorV || el.gridColor || bc   // 세로줄(열 구분선)
        const hOp = (el.gridColorH || el.gridColor) ? 0.85 : 0.28
        const vOp = (el.gridColorV || el.gridColor) ? 0.85 : 0.28
        const gw = el.gridWidth || 0.8
        return (
          <g strokeWidth={gw}>
            <g stroke={hCol} strokeOpacity={hOp}>
              {gridBounds(gridFracs(el.gridRowH, rows)).map((f, i) =>
                <line key={`hr${i}`} x1="0" y1={cTop + cH * f} x2={w} y2={cTop + cH * f} />)}
            </g>
            <g stroke={vCol} strokeOpacity={vOp}>
              {gridBounds(gridFracs(el.gridColW, cols)).map((f, j) =>
                <line key={`vc${j}`} x1={w * f} y1={cTop} x2={w * f} y2={h} />)}
            </g>
          </g>
        )
      })()}
      {/* 제목 배경 바 */}
      {el.label && (
        <>
          <rect x="0" y="0" width={w} height={titleH} rx={rx} fill={bc} opacity="0.18" />
          <rect x="0" y={titleH} width={w} height="1" fill={bc} opacity="0.4" />
          <text x={w / 2} y={titleH - 4} textAnchor="middle"
            {...lblProps(el, { fontSize: 11, fill: tc, fontWeight: 'bold', fontFamily: "'Consolas','Courier New',monospace" })}>
            {el.label}
          </text>
        </>
      )}
      {/* 선택 하이라이트 */}
      {selected && (
        <rect x="-2" y="-2" width={w + 4} height={h + 4} rx="4"
          fill="none" stroke="#00d4ff" strokeWidth="1.5" strokeDasharray="6 3" />
      )}
    </g>
  )
}

/* ── 선 종류 → strokeDasharray (선 두께에 비례) ── */
export const LINE_STYLES = [
  { id: 'solid',   label: '실선 ──────' },
  { id: 'dashed',  label: '점선 ­­­- - - - -' },
  { id: 'dotted',  label: '촘촘점선 ······' },
  { id: 'center',  label: '일점쇄선 —·—·—' },
  { id: 'center2', label: '이점쇄선 —··—··' },
]
export function dashArray(style, sw = 2) {
  const w = Math.max(1, sw)
  switch (style) {
    case 'dashed':  return `${w * 3} ${w * 2}`
    case 'dotted':  return `${w * 0.1} ${w * 2}`
    case 'center':  return `${w * 6} ${w * 2} ${w * 1} ${w * 2}`
    case 'center2': return `${w * 6} ${w * 2} ${w * 1} ${w * 2} ${w * 1} ${w * 2}`
    default:        return undefined // solid
  }
}

/* ── 도형 경로 생성 (hw/hh 기준, 중심=0,0) ── */
function getShapePath(shape, hw, hh) {
  const w = hw, h = hh
  switch (shape) {
    // 선 계열 (열린 경로, 채우기 없음)
    case 'line':          return `M${-w},${-h} L${w},${h}`
    case 'line2':         return `M${-w},${h} L${w},${-h}`
    case 'hline':         return `M${-w},0 L${w},0`
    case 'vline':         return `M0,${-h} L0,${h}`
    case 'rect':          return `M${-w},${-h} h${w*2} v${h*2} h${-w*2} z`
    case 'roundrect':     return null // ellipse로 처리
    case 'ellipse':       return null // ellipse element
    case 'triangle':      return `M0,${-h} L${w},${h} L${-w},${h} z`
    case 'rtriangle':     return `M${-w},${-h} L${w},${h} L${-w},${h} z`
    case 'diamond':       return `M0,${-h} L${w},0 L0,${h} L${-w},0 z`
    case 'pentagon': {
      const a = (i) => ({ x: w*Math.sin(2*Math.PI*i/5 - Math.PI/2), y: h*Math.cos(2*Math.PI*i/5 - Math.PI/2)*-1 })
      return Array.from({length:5},(_,i)=>a(i)).map((p,i)=>`${i===0?'M':'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')+'z'
    }
    case 'hexagon': {
      const a = (i) => ({ x: w*Math.cos(Math.PI*i/3), y: h*Math.sin(Math.PI*i/3) })
      return Array.from({length:6},(_,i)=>a(i)).map((p,i)=>`${i===0?'M':'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')+'z'
    }
    case 'parallelogram': return `M${-w+h*0.4},${-h} L${w},${-h} L${w-h*0.4},${h} L${-w},${h} z`
    case 'trapezoid':     return `M${-w*0.6},${-h} L${w*0.6},${-h} L${w},${h} L${-w},${h} z`
    case 'star4': {
      const r1=w, r2=w*0.4, pts=[]
      for(let i=0;i<8;i++){const r=i%2===0?r1:r2;const a=Math.PI*i/4-Math.PI/2;pts.push(`${i===0?'M':'L'}${(r*Math.cos(a)).toFixed(1)},${(r*Math.sin(a)*h/w).toFixed(1)}`)}
      return pts.join(' ')+'z'
    }
    case 'star5': {
      const r1=w, r2=w*0.4, pts=[]
      for(let i=0;i<10;i++){const r=i%2===0?r1:r2;const a=Math.PI*2*i/10-Math.PI/2;pts.push(`${i===0?'M':'L'}${(r*Math.cos(a)).toFixed(1)},${(r*Math.sin(a)*h/w).toFixed(1)}`)}
      return pts.join(' ')+'z'
    }
    case 'arrow_r': return `M${-w},${-h*0.4} L${w*0.3},${-h*0.4} L${w*0.3},${-h} L${w},0 L${w*0.3},${h} L${w*0.3},${h*0.4} L${-w},${h*0.4} z`
    case 'arrow_l': return `M${w},${-h*0.4} L${-w*0.3},${-h*0.4} L${-w*0.3},${-h} L${-w},0 L${-w*0.3},${h} L${-w*0.3},${h*0.4} L${w},${h*0.4} z`
    case 'arrow_u': return `M${-w*0.4},${h} L${-w*0.4},${-h*0.3} L${-w},${-h*0.3} L0,${-h} L${w},${-h*0.3} L${w*0.4},${-h*0.3} L${w*0.4},${h} z`
    case 'arrow_d': return `M${-w*0.4},${-h} L${-w*0.4},${h*0.3} L${-w},${h*0.3} L0,${h} L${w},${h*0.3} L${w*0.4},${h*0.3} L${w*0.4},${-h} z`
    case 'cross':   return `M${-w*0.3},${-h} h${w*0.6} v${h-h*0.3} h${w-w*0.3} v${h*0.6} h${-(w-w*0.3)} v${h-h*0.3} h${-w*0.6} v${-(h-h*0.3)} h${-(w-w*0.3)} v${-h*0.6} h${w-w*0.3} z`
    case 'callout': return `M${-w},${-h} h${w*2} v${h*1.4} h${-w*0.8} l${-w*0.2},${h*0.6} l${-w*0.2},${-h*0.6} h${-w*0.8} z`
    default:        return `M${-w},${-h} h${w*2} v${h*2} h${-w*2} z`
  }
}

// 도형 애니메이션 계산 (태그값 기반) — lamp(색)/blink(점멸)/rotate/move
function computeShapeAnim(el, tag) {
  const anim = el.animType || 'none'
  if (anim === 'none') return null
  const val = tag ? (Number(tag.value) || 0) : 0
  const uid = `shp_${(el.id || '').replace(/[^a-z0-9]/gi, '_')}`
  if (anim === 'lamp') {
    const on = val !== 0
    return { fill: on ? (el.animOnColor || '#22c55e') : (el.animOffColor || '#374151') }
  }
  if (anim === 'blink') {
    if (val === 0) return null
    const sec = +el.animBlinkSec || 1
    return { css: `@keyframes ${uid}{0%,49%{opacity:1}50%,100%{opacity:0.12}}`,
      style: { animation: `${uid} ${sec}s steps(1,end) infinite` } }
  }
  // valbar — 값 비례로 채워지는 막대 + 구간별 색 변경 (조건부 색상 막대 그래프)
  if (anim === 'valbar') {
    const minV = el.animMinVal ?? (tag?.min ?? 0)
    const maxV = el.animMaxVal ?? (tag?.max ?? 100)
    const pct = maxV !== minV ? Math.max(0, Math.min(1, (val - minV) / (maxV - minV))) : 0
    // animStops: [{upTo, color}] 오름차순. upTo가 null/미지정이면 '그 이상(else)'.
    const stops = (Array.isArray(el.animStops) && el.animStops.length)
      ? el.animStops
      : [{ upTo: null, color: el.animOnColor || '#22c55e' }]
    let color = stops[stops.length - 1].color
    for (const s of stops) { if (s.upTo == null || val <= s.upTo) { color = s.color; break } }
    return { valbar: { pct, color, dir: el.animBarDir || 'up', val } }
  }
  // rotate / move — 아날로그 속도
  const minV = el.animMinVal ?? 0, maxV = el.animMaxVal ?? 100
  const pct = maxV !== minV ? Math.max(0, Math.min(1, (val - minV) / (maxV - minV))) : 0
  const minSpeed = el.animMinSpeed ?? 10, maxSpeed = el.animMaxSpeed ?? 0.5
  const dur = val <= minV ? 0 : (minSpeed - pct * (minSpeed - maxSpeed))
  if (dur <= 0) return null
  const base = { transformBox: 'fill-box', transformOrigin: 'center' }
  if (anim === 'rotate') {
    return { css: `@keyframes ${uid}{to{transform:rotate(360deg)}}`,
      style: { ...base, animation: `${uid} ${dur.toFixed(2)}s linear infinite` } }
  }
  if (anim === 'move_lr' || anim === 'move_rl') {
    const d = (el.hw || 60) * 0.4 * (anim === 'move_rl' ? -1 : 1)
    return { css: `@keyframes ${uid}{0%,100%{transform:translateX(${-d}px)}50%{transform:translateX(${d}px)}}`,
      style: { ...base, animation: `${uid} ${dur.toFixed(2)}s ease-in-out infinite` } }
  }
  return null
}

function CanvasShape({ el, tag, tags = [], selected, onPointerDown, onDoubleClick, onClick }) {
  const hw = el.hw || 60, hh = el.hh || 40
  const fill = el.fillColor || '#1e3a5f'
  const stroke = el.strokeColor || '#00e5ff'
  const sw = el.strokeWidth ?? 2
  const op = el.opacity ?? 1
  const shape = el.shape || 'rect'
  const isLine = shape === 'line' || shape === 'line2' || shape === 'hline' || shape === 'vline'
  const isFree = shape === 'freehand'
  // 자유곡선: 정규화된 점([-1,1])을 hw/hh로 스케일
  const freePath = isFree && Array.isArray(el.points)
    ? el.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(p[0] * hw).toFixed(1)},${(p[1] * hh).toFixed(1)}`).join(' ')
    : ''
  const path = isFree ? freePath : getShapePath(shape, hw, hh)
  const rot = el.imgRotation || 0
  const scaleX = el.imgFlipX ? -1 : 1
  const scaleY = el.imgFlipY ? -1 : 1
  const xform = (rot || scaleX < 0 || scaleY < 0) ? `rotate(${rot}) scale(${scaleX},${scaleY})` : undefined

  // 도형 애니메이션 (태그값 기반)
  const anim = computeShapeAnim(el, tag)
  const fillFinal = anim?.fill || fill
  // 값 막대(valbar) — 도형 안을 값 비례로 채우는 오버레이 계산
  const vb = anim?.valbar
  const vbId = `vb_${(el.id || '').replace(/[^a-z0-9]/gi, '_')}`
  let vbRect = null
  if (vb) {
    const fw = hw * 2, fh = hh * 2
    if (vb.dir === 'down')       vbRect = { x: -hw, y: -hh, width: fw, height: fh * vb.pct }
    else if (vb.dir === 'right') vbRect = { x: -hw, y: -hh, width: fw * vb.pct, height: fh }
    else if (vb.dir === 'left')  vbRect = { x: hw - fw * vb.pct, y: -hh, width: fw * vb.pct, height: fh }
    else                         vbRect = { x: -hw, y: hh - fh * vb.pct, width: fw, height: fh * vb.pct } // up(기본)
  }

  return (
    <g transform={`translate(${el.x},${el.y})`} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} onClick={onClick} style={{ cursor: onDoubleClick ? (selected ? 'move' : 'grab') : 'default' }}>
      {anim?.css && <style>{anim.css}</style>}
      <g transform={xform}>
        <g style={anim?.style}>
        {shape === 'ellipse' || shape === 'roundrect'
          ? <ellipse rx={hw} ry={hh} fill={fillFinal} fillOpacity={op} stroke={stroke} strokeWidth={sw}
              strokeDasharray={dashArray(el.lineStyle, sw)} />
          : <path d={path} fill={(isLine || isFree) ? 'none' : fillFinal} fillOpacity={op}
              stroke={stroke} strokeWidth={sw} strokeOpacity={(isLine || isFree) ? op : 1}
              strokeDasharray={dashArray(el.lineStyle, sw)}
              strokeLinecap={(el.lineStyle && el.lineStyle !== 'solid' && el.lineStyle !== 'dotted') ? 'butt' : 'round'}
              strokeLinejoin="round" />
        }
        {vb && vbRect && (<>
          <clipPath id={vbId}>
            {shape === 'ellipse' || shape === 'roundrect'
              ? <ellipse rx={hw} ry={hh} />
              : <path d={path} />}
          </clipPath>
          <g clipPath={`url(#${vbId})`}>
            <rect x={vbRect.x} y={vbRect.y} width={Math.max(0, vbRect.width)} height={Math.max(0, vbRect.height)}
              fill={vb.color} style={{ filter: `drop-shadow(0 0 4px ${vb.color}99)`, transition: 'x 0.3s ease, y 0.3s ease, width 0.3s ease, height 0.3s ease, fill 0.3s ease' }} />
          </g>
        </>)}
        {(isLine || isFree) && <FlowOverlay flow={computeFlow(el, tags, sw)} d={path} />}
        </g>
        {selected && (shape === 'ellipse' || shape === 'roundrect'
          ? <ellipse rx={hw+3} ry={hh+3} fill="none" stroke="#00d4ff" strokeWidth="1.5" strokeDasharray="6 3" />
          : <rect x={-hw-3} y={-hh-3} width={(hw+3)*2} height={(hh+3)*2} rx="2" fill="none" stroke="#00d4ff" strokeWidth="1.5" strokeDasharray="6 3" />
        )}
      </g>
      {vb && el.animShowVal !== false ? (
        <text textAnchor="middle" dominantBaseline="central" fontSize={Math.max(9, Math.min(hh * 0.6, 16))}
          fontWeight="700" fill="#f8fafc" stroke="#0009" strokeWidth={3} paintOrder="stroke"
          fontFamily="'Malgun Gothic','맑은 고딕',sans-serif">{Number.isFinite(vb.val) ? Math.round(vb.val * 10) / 10 : ''}</text>
      ) : el.label ? (
        <text textAnchor="middle" dominantBaseline="central" fontSize={el.fontSize||12} fill={el.textColor||'#e2e8f0'}
          fontFamily="'Malgun Gothic','맑은 고딕',sans-serif">{el.label}</text>
      ) : null}
    </g>
  )
}

/* ── 요소 경계상자 / 포트(연결점) 계산 ── */
export function elementBBox(el) {
  if (!el) return { left:0, top:0, right:0, bottom:0, cx:0, cy:0 }
  if (el.type === 'groupbox') {
    const w = el.width || 200, h = el.height || 120
    return { left: el.x, top: el.y, right: el.x + w, bottom: el.y + h, cx: el.x + w/2, cy: el.y + h/2 }
  }
  if (el.type === 'symbol') {
    const w = el.w || 48, h = el.h || 48
    return { left: el.x - w/2, top: el.y - h/2, right: el.x + w/2, bottom: el.y + h/2, cx: el.x, cy: el.y }
  }
  const hw = el.hw || 45, hh = el.hh || 22
  return { left: el.x - hw, top: el.y - hh, right: el.x + hw, bottom: el.y + hh, cx: el.x, cy: el.y }
}

export const WIRE_PORTS = ['top', 'right', 'bottom', 'left']

export function portPos(el, port) {
  const b = elementBBox(el)
  switch (port) {
    case 'top':    return { x: b.cx, y: b.top }
    case 'bottom': return { x: b.cx, y: b.bottom }
    case 'left':   return { x: b.left, y: b.cy }
    case 'right':  return { x: b.right, y: b.cy }
    default:       return { x: b.cx, y: b.cy }
  }
}

// (x,y) 근처의 포트 찾기 — 와이어 연결 대상은 심볼 위주(장식/선 제외)
export function findPortNear(x, y, elements, threshold = 14) {
  let best = null, bestD = threshold
  for (const el of elements) {
    if (el.type === 'wire' || el.type === 'shape' || el.type === 'groupbox' || el.type === 'text') continue
    for (const port of WIRE_PORTS) {
      const p = portPos(el, port)
      const d = Math.hypot(p.x - x, p.y - y)
      if (d <= bestD) { bestD = d; best = { elId: el.id, port, x: p.x, y: p.y } }
    }
  }
  return best
}

// 앵커 = 요소 내부의 상대 위치(rx,ry). 심볼을 옮기면 그 지점이 함께 따라감.
// 포트 근처면 포트로 스냅, 아니면 심볼 내부의 클릭 지점에 그대로 부착.
export function findAnchorNear(x, y, elements) {
  const port = findPortNear(x, y, elements, 10)
  if (port) {
    const el = elements.find(e => e.id === port.elId)
    const b = elementBBox(el)
    const w = (b.right - b.left) || 1, h = (b.bottom - b.top) || 1
    return { elId: port.elId, rx: (port.x - b.left) / w, ry: (port.y - b.top) / h, x: port.x, y: port.y }
  }
  for (const el of elements) {
    if (el.type === 'wire' || el.type === 'shape' || el.type === 'groupbox' || el.type === 'text') continue
    const b = elementBBox(el)
    if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) {
      const w = (b.right - b.left) || 1, h = (b.bottom - b.top) || 1
      return { elId: el.id, rx: (x - b.left) / w, ry: (y - b.top) / h, x, y }
    }
  }
  return null
}

// 앵커의 현재 월드 좌표
export function anchorPos(anchor, elements) {
  const el = elements.find(e => e.id === anchor.elId)
  if (!el) return null
  const b = elementBBox(el)
  return { x: b.left + anchor.rx * (b.right - b.left), y: b.top + anchor.ry * (b.bottom - b.top) }
}

/* ── 흐름(flow) 애니메이션 계산 ── el.flow* 속성 + 태그값 기반 ── */
export function computeFlow(el, tags, sw) {
  if (!el.flow) return null
  const enTag = el.flowEnableTag ? (tags || []).find(t => t.id === el.flowEnableTag) : null
  const isOn = enTag ? Number(enTag.value) !== 0 : true
  const spTag = el.flowSpeedTag ? (tags || []).find(t => t.id === el.flowSpeedTag) : null
  const spRaw = spTag ? (Number(spTag.value) || 0) : null
  const spPct = spTag ? Math.min(1, Math.max(0, spRaw / ((spTag.max) || 100))) : 0.5
  const moving = isOn && (spTag ? spRaw > 0 : true)
  if (!moving) return null
  const dash = Math.max(6, sw * 2.5)
  const gap = dash * 1.1
  const dur = (1.2 / Math.max(0.08, spPct)).toFixed(2)
  const dir = el.flowDir === 'reverse' ? 1 : -1
  const kname = `flow_${el.id}`
  const css = `@keyframes ${kname}{to{stroke-dashoffset:${(dir * (dash + gap)).toFixed(1)}}}`
  return { css, kname, dash, gap, dur, color: el.flowColor || '#38f5d0', sw: Math.max(1.5, sw * 0.85) }
}

// 흐름 오버레이 path 요소들 (base d 위에 겹침)
function FlowOverlay({ flow, d }) {
  if (!flow) return null
  return (<>
    <style>{flow.css}</style>
    <path d={d} fill="none" stroke={flow.color} strokeWidth={flow.sw}
      strokeDasharray={`${flow.dash} ${flow.gap}`} strokeLinecap="round"
      style={{ animation: `${flow.kname} ${flow.dur}s linear infinite`, pointerEvents: 'none' }} />
  </>)
}

/* ── 연결선(와이어) 렌더러 ── */
function CanvasWire({ el, elements = [], tags = [], selected, onPointerDown, onDoubleClick, onClick, onContextMenu }) {
  const anchors = el.anchors || []
  const pts = (el.points || []).map((p, i) => {
    const a = anchors[i]
    if (a) { const wp = anchorPos(a, elements); if (wp) return wp }
    return { x: p[0], y: p[1] }
  })
  // 구버전 호환: from/to (포트 방식)
  if (!anchors.length) {
    if (el.from && pts.length) { const fe = elements.find(e => e.id === el.from.elId); if (fe) pts[0] = portPos(fe, el.from.port) }
    if (el.to && pts.length > 1) { const te = elements.find(e => e.id === el.to.elId); if (te) pts[pts.length - 1] = portPos(te, el.to.port) }
  }
  if (pts.length < 2) return null
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const stroke = el.strokeColor || '#00e5ff'
  const sw = el.strokeWidth ?? 2
  const op = el.opacity ?? 1
  return (
    <g onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} onClick={onClick}
      onContextMenu={onContextMenu ? (e) => { e.preventDefault(); onContextMenu(e, el.id) } : undefined}
      style={{ cursor: 'pointer' }}>
      {/* 넓은 히트 영역 */}
      <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(sw + 8, 12)} strokeLinecap="round" />
      {selected && <path d={d} fill="none" stroke="#00d4ff" strokeWidth={sw + 4} strokeOpacity={0.35}
        strokeLinecap="round" strokeLinejoin="round" style={{ filter:'drop-shadow(0 0 4px #00d4ff88)' }} />}
      <path d={d} fill="none" stroke={stroke} strokeWidth={sw} strokeOpacity={op}
        strokeDasharray={dashArray(el.lineStyle, sw)}
        strokeLinecap={(el.lineStyle && el.lineStyle !== 'solid' && el.lineStyle !== 'dotted') ? 'butt' : 'round'}
        strokeLinejoin="round" />
      <FlowOverlay flow={computeFlow(el, tags, sw)} d={d} />
      {/* 선택 시에만 정점/앵커 표시 (앵커=초록, 자유점=파랑, 작게) */}
      {selected && pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2} fill={anchors[i] ? '#22c55e' : '#00d4ff'} stroke="#0a1628" strokeWidth={0.8} />
      ))}
    </g>
  )
}

// 워드(다중상태) 램프 — 태그값(정수)에 매칭되는 상태의 색·라벨 표시
function CanvasWordLamp({ el, tag, selected, onPointerDown, onDoubleClick }) {
  const W = (el.hw ?? 40) * 2, H = (el.hh ?? 24) * 2
  const v = el.variant || 'fill'
  const cursor = onDoubleClick ? (selected ? 'move' : 'grab') : 'default'
  const states = Array.isArray(el.states) ? el.states : []
  const raw = tag ? Math.round(tagNum(tag)) : (states[0]?.value ?? 0)
  const st = states.find(s => Number(s.value) === raw)
  const color = st?.color || el.offColor || '#374151'
  const text = st?.label ?? (tag ? String(raw) : (el.label || '워드램프'))
  const bits = el.showBits ? `${raw} · ${(raw < 0 ? 0 : raw).toString(2).padStart(el.bitWidth || 4, '0')}` : ''
  const fs = Math.max(8, Math.min(H * 0.42, 15))

  if (v === 'round') {
    const r = Math.min(W, H * 1.2) * 0.32
    return (
      <g transform={`translate(${el.x}, ${el.y})`} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} style={{ cursor }}>
        <rect x={-W/2} y={-H/2} width={W} height={H} rx={4} fill={selected ? '#0f2036' : '#141a26'} stroke={selected ? '#00d4ff88' : '#2d3748'} strokeWidth="1" />
        <circle cx="0" cy={-H*0.12} r={r} fill={color} stroke="#0b1220" strokeWidth="1" style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
        <text x="0" y={H*0.32} textAnchor="middle" dominantBaseline="central" {...lblProps(el, { fontSize: Math.max(7, fs*0.8), fontWeight: '700', fill: '#e2e8f0', fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif" })}>{text}</text>
        {bits && <text x="0" y={H*0.5-3} textAnchor="middle" fontSize="6.5" fill="#64748b" fontFamily="monospace">{bits}</text>}
        <rect x={-W/2} y={-H/2} width={W} height={H} fill="transparent" />
      </g>
    )
  }
  // fill / pill — 박스 전체를 상태색으로 채우고 라벨 중앙 표시
  const rx = v === 'pill' ? H/2 : 5
  return (
    <g transform={`translate(${el.x}, ${el.y})`} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} style={{ cursor }}>
      <rect x={-W/2} y={-H/2} width={W} height={H} rx={rx} fill={color}
        stroke={selected ? '#00d4ff' : '#0b1220'} strokeWidth={selected ? 1.5 : 1}
        style={{ filter: `drop-shadow(0 0 6px ${color}aa)`, transition: 'fill 0.25s ease' }} />
      <text x="0" y={bits ? -H*0.08 : 0} textAnchor="middle" dominantBaseline="central"
        stroke="#0006" strokeWidth="2.5" paintOrder="stroke"
        {...lblProps(el, { fontSize: fs, fontWeight: '700', fill: '#f8fafc', fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif" })}>{text}</text>
      {bits && <text x="0" y={H*0.3} textAnchor="middle" fontSize="7" fill="#f8fafcbb" fontFamily="monospace">{bits}</text>}
      <rect x={-W/2} y={-H/2} width={W} height={H} fill="transparent" />
    </g>
  )
}

// 주소 증가 (RecipeEditor와 동일 규칙): "D100" + 100 → "D200"
function recAddrStep(base, add) {
  const m = String(base || '').match(/^([A-Za-z%]*)(\d+)(.*)$/)
  if (!m || !add) return base || ''
  const [, pre, num, suf] = m
  return pre + (parseInt(num, 10) + add) + suf
}
const _thCss = { padding: '3px 6px', color: '#dbeafe', fontWeight: 700, border: '1px solid #1e3a5f', whiteSpace: 'nowrap', position: 'sticky', top: 0 }
const _tdCss = { padding: '2px 6px', border: '1px solid #16233a', fontFamily: 'monospace', whiteSpace: 'nowrap' }
function _fmtCell(v, c) {
  if (v === undefined || v === '') return ''
  if (c.type === 'number' && c.decimals) return (Number(v) || 0).toFixed(c.decimals)
  return String(v)
}
function _firstText(it, cols) {
  const tc = cols.find(c => c.type === 'text')
  return tc ? (it.values?.[tc.id] || '') : ''
}

// 레시피 표(뷰) — 레시피셋을 표로 표시 + 사용 레시피 드롭다운 + 적용(다운로드)
function CanvasRecipeTable({ el, recipeSets = [], tags = [], selected, runtime, onPointerDown, onDoubleClick, onWriteTag }) {
  const W = (el.hw ?? 200) * 2, H = (el.hh ?? 120) * 2
  const set = recipeSets.find(s => s.id === el.recipeSetId) || recipeSets[0] || null
  const cols = set?.columns || []
  const items = set?.items || []
  const index = Number(set?.index) || 0
  // 번호 태그: 요소 지정(selectorTagId) > 셋 주소(selectorAddr) > 셋 tagId(selectorTag)
  const selTag = el.selectorTagId ? tags.find(t => t.id === el.selectorTagId)
    : set?.selectorAddr ? tags.find(t => t.address === set.selectorAddr)
    : (set?.selectorTag ? tags.find(t => t.id === set.selectorTag) : null)
  const [localSel, setLocalSel] = useState(null)
  const rawNo = selTag ? Math.round(Number(selTag.value) || 0) : (localSel ?? items[0]?.no ?? 1)
  const activeNo = rawNo === 0 ? 1 : rawNo   // 값 0 → 1 자동 처리
  const cursor = onDoubleClick ? (selected ? 'move' : 'grab') : 'default'
  const headBg = el.headerColor || '#1e40af'

  const selectNo = no => { if (runtime && selTag && onWriteTag) onWriteTag(selTag.id, no); else setLocalSel(no) }
  const applyRecipe = () => {
    if (!runtime || !onWriteTag || !set) return
    const it = items.find(x => x.no === activeNo)
    if (!it) return
    // 선택 레시피 값을 열 기준(작업) 주소로 다운로드 + 번호 워드 기록
    for (const c of cols) {
      const t = tags.find(x => x.address && x.address === c.addr)
      const v = it.values?.[c.id]
      if (t && v !== undefined && v !== '') onWriteTag(t.id, c.type === 'text' ? v : Number(v))
    }
    if (selTag) onWriteTag(selTag.id, activeNo)
  }
  // 처음 실행 시: 번호 워드값을 읽어 해당 레시피를 작업 주소에 자동 적용 (0이면 1)
  const appliedRef = useRef(false)
  useEffect(() => {
    if (runtime && !appliedRef.current && items.length && cols.length) { appliedRef.current = true; applyRecipe() }
  }, [runtime, items.length, cols.length]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <g transform={`translate(${el.x}, ${el.y})`} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} style={{ cursor }}>
      {selected && <rect x={-W/2-3} y={-H/2-3} width={W+6} height={H+6} rx={6} fill="none" stroke="#00d4ff" strokeWidth="1.5" strokeDasharray="6 3" />}
      <foreignObject x={-W/2} y={-H/2} width={W} height={H}>
        <div xmlns="http://www.w3.org/1999/xhtml" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0b1220', border: '1px solid #1e3a5f', borderRadius: 6, overflow: 'hidden', fontFamily: "'Malgun Gothic',sans-serif", pointerEvents: runtime ? 'auto' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', background: '#0d1b2e', borderBottom: '1px solid #1e3a5f', flexShrink: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#93c5fd' }}>{set?.name || '레시피'}</span>
            <span style={{ fontSize: 10, color: '#64748b' }}>사용 레시피</span>
            <select value={activeNo ?? ''} onChange={e => selectNo(Number(e.target.value))} disabled={!runtime}
              style={{ fontSize: 11, background: '#0b1220', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 4, padding: '1px 4px' }}>
              {items.map(it => <option key={it.no} value={it.no}>{it.no}번{_firstText(it, cols) ? ` · ${_firstText(it, cols)}` : ''}</option>)}
            </select>
            {runtime && <button onClick={applyRecipe} style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#fff', background: '#16a34a', border: '1px solid #22c55e', borderRadius: 4, padding: '2px 10px', cursor: 'pointer' }}>적용</button>}
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ ..._thCss, background: headBg }}>번호</th>
                  {cols.map(c => <th key={c.id} style={{ ..._thCss, background: headBg }}>{c.title || '-'}{c.unit ? <span style={{ fontSize: 9, color: '#bfdbfe' }}> ({c.unit})</span> : null}</th>)}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const it = items.find(x => x.no === activeNo)
                  if (!it) return <tr><td colSpan={cols.length + 1} style={{ ..._tdCss, textAlign: 'center', color: '#64748b' }}>{items.length ? '레시피를 선택하세요' : '레시피 없음 — 편집기에서 추가'}</td></tr>
                  return (
                    <tr style={{ background: '#14532d' }}>
                      <td style={{ ..._tdCss, color: '#4ade80', fontWeight: 700, textAlign: 'center' }}>{it.no}</td>
                      {cols.map(c => <td key={c.id} style={{ ..._tdCss, color: '#e2e8f0', textAlign: c.type === 'number' ? 'right' : 'left' }}>{_fmtCell(it.values?.[c.id], c)}</td>)}
                    </tr>
                  )
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </foreignObject>
      {!runtime && <rect x={-W/2} y={-H/2} width={W} height={H} fill="transparent" />}
    </g>
  )
}

// 알람 목록 표 — 활성 알람을 표로 표시 (구역 필터, 발생시각 추적)
function CanvasAlarmTable({ el, tags = [], selected, onPointerDown, onDoubleClick, runtime }) {
  const W = (el.hw ?? 190) * 2, H = (el.hh ?? 95) * 2
  const area = el.alarmArea || ''
  const cursor = onDoubleClick ? (selected ? 'move' : 'grab') : 'default'
  const headBg = el.headerColor || '#7f1d1d'
  const active = useMemo(() => {
    const all = scanAlarms(tags)
    return area ? all.filter(a => a.area === area) : all
  }, [tags, area])

  // 발생시각 추적 — 활성된 순간 기록, 해제되면 제거
  const seenRef = useRef(new Map())
  const [, force] = useState(0)
  useEffect(() => {
    const now = Date.now()
    const keys = new Set(active.map(a => a.tagId + '|' + a.sev))
    let changed = false
    for (const a of active) { const k = a.tagId + '|' + a.sev; if (!seenRef.current.has(k)) { seenRef.current.set(k, now); changed = true } }
    for (const k of [...seenRef.current.keys()]) if (!keys.has(k)) { seenRef.current.delete(k); changed = true }
    if (changed) force(n => (n + 1) & 0xffff)
  }, [active])
  const hhmmss = t => new Date(t).toLocaleTimeString('ko', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const rows = active.map(a => ({ ...a, at: seenRef.current.get(a.tagId + '|' + a.sev) }))

  return (
    <g transform={`translate(${el.x}, ${el.y})`} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} style={{ cursor }}>
      {selected && <rect x={-W / 2 - 3} y={-H / 2 - 3} width={W + 6} height={H + 6} rx={6} fill="none" stroke="#00d4ff" strokeWidth="1.5" strokeDasharray="6 3" />}
      <foreignObject x={-W / 2} y={-H / 2} width={W} height={H}>
        <div xmlns="http://www.w3.org/1999/xhtml" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0b1220', border: '1px solid #3f1d2e', borderRadius: 6, overflow: 'hidden', fontFamily: "'Malgun Gothic',sans-serif", pointerEvents: runtime ? 'auto' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', background: headBg, flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#fff' }}>🚨 {el.label || '알람'}{area ? ` · ${area}` : ''}</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: rows.length ? '#fecaca' : '#bbf7d0' }}>{rows.length ? `${rows.length}건` : '정상'}</span>
          </div>
          <div style={{ display: 'flex', fontSize: 9, color: '#64748b', padding: '2px 8px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
            <span style={{ width: 56 }}>시각</span>
            <span style={{ width: 60 }}>구역</span>
            <span style={{ flex: 1 }}>내용</span>
            <span style={{ width: 32, textAlign: 'center' }}>등급</span>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {rows.length === 0
              ? <div style={{ padding: '10px', fontSize: 10, color: '#4ade80', textAlign: 'center' }}>활성 알람 없음 · 정상</div>
              : rows.map((a, i) => {
                const isAlarm = a.sev === '경보'
                return (
                  <div key={a.tagId + i} style={{ display: 'flex', alignItems: 'center', fontSize: 9.5, padding: '2px 8px', borderBottom: '1px solid #131c2b', background: isAlarm ? 'rgba(239,68,68,0.08)' : 'transparent' }}>
                    <span style={{ width: 56, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{a.at ? hhmmss(a.at) : '—'}</span>
                    <span style={{ width: 60, color: '#7dd3fc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.area || '—'}</span>
                    <span style={{ flex: 1, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.text}>{a.text}</span>
                    <span style={{ width: 32, textAlign: 'center', fontWeight: 700, color: isAlarm ? '#f87171' : '#fbbf24' }}>{a.sev}</span>
                  </div>
                )
              })}
          </div>
        </div>
      </foreignObject>
    </g>
  )
}

// ── 리렌더 최적화 (React.memo) ──
//   HMI는 수치 반응·버튼 응답이 생명 → 값 안 바뀐 요소는 다시 그리지 않는다.
//   콜백(onPointerDown 등)은 매 렌더 새로 생기지만 비교에서 무시 — 핸들러가 ref로 최신 상태를 읽으므로 안전.
const tagSig = t => t ? `${t.value}|${t.min}|${t.max}|${t.type}|${t.unit}|${t.decimals}` : '∅'
const tagValOf = (id, arr) => { if (!id || !arr) return undefined; const t = arr.find(x => x.id === id); return t ? t.value : undefined }
// 값 구동 단일태그(게이지·수치·램프·스위치·트렌드)
const eqValue = (a, b) => a.el === b.el && a.selected === b.selected && tagSig(a.tag) === tagSig(b.tag)
// 정적(텍스트·그룹박스)
const eqStatic = (a, b) => a.el === b.el && a.selected === b.selected
// 도형: 정적/애니(단일태그) + 흐름 라인(flow 태그값)
const eqShape = (a, b) => {
  if (a.el !== b.el || a.selected !== b.selected || tagSig(a.tag) !== tagSig(b.tag)) return false
  const fe = a.el.flowEnableTag, fs = a.el.flowSpeedTag
  if (fe && tagValOf(fe, a.tags) !== tagValOf(fe, b.tags)) return false
  if (fs && tagValOf(fs, a.tags) !== tagValOf(fs, b.tags)) return false
  return true
}

export const RENDERERS = {
  symbol:   CanvasSymbol,                    // 멀티태그(svgBindings)·CSS애니 — memo 제외
  switch:   memo(CanvasSwitch, eqValue),
  lamp:     memo(CanvasLamp, eqValue),
  wordlamp: memo(CanvasWordLamp, eqValue),
  gauge:    memo(CanvasGauge, eqValue),
  numeric:  memo(CanvasNumeric, eqValue),
  bar:      memo(CanvasBar, eqValue),
  text:     memo(CanvasText, eqStatic),
  groupbox: memo(CanvasGroupBox, eqStatic),
  shape:    memo(CanvasShape, eqShape),
  wire:     CanvasWire,                       // 멀티태그(flow) — memo 제외
  recipetable: CanvasRecipeTable,             // recipeSets+tags — memo 제외
  alarmtable: CanvasAlarmTable,               // 전체 태그 스캔 — memo 제외
}

/* ── 윈도우 화면 팝업 오버레이 (RENDERERS 이후 정의로 참조 가능) ── */
function WindowPopup({ screenId, allScreens, tags, bindings, svgBindings, symbols, resolution, onClose }) {
  const screen = allScreens.find(s => s.id === screenId)
  const popW = Math.min(720, Math.round(resolution.w * 0.6))
  const popH = Math.min(460, Math.round(resolution.h * 0.6))
  const [pos, setPos] = useState(null)
  const dragRef = useRef(null)

  useEffect(() => {
    setPos({ x: window.innerWidth / 2 - popW / 2, y: window.innerHeight / 2 - popH / 2 })
  }, [])

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  function onHeaderMouseDown(e) {
    if (e.target.closest('button')) return
    e.preventDefault()
    const startX = e.clientX - pos.x, startY = e.clientY - pos.y
    const onMove = ev => setPos({ x: ev.clientX - startX, y: ev.clientY - startY })
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  if (!screen || !pos) return null
  const els = screen.elements || []
  const scale = Math.min(popW / resolution.w, popH / resolution.h)
  const svgW = Math.round(resolution.w * scale)
  const svgH = Math.round(resolution.h * scale)

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      <div className="absolute inset-0 pointer-events-auto" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose} />
      <div className="absolute pointer-events-auto flex flex-col rounded-xl overflow-hidden"
        style={{ left: pos.x, top: pos.y, background: '#0d1117',
          boxShadow: '0 0 0 1px #4c1d95, 0 0 40px rgba(109,40,217,0.35), 0 25px 50px rgba(0,0,0,0.8)' }}>

        {/* 헤더 */}
        <div className="flex items-center gap-2 px-3 py-2 select-none flex-shrink-0"
          style={{ background: '#1a1030', borderBottom: '1px solid #4c1d95', cursor: 'grab' }}
          onMouseDown={onHeaderMouseDown}>
          <GripHorizontal size={13} className="text-[#6d28d9]" />
          <div className="w-5 h-5 rounded flex items-center justify-center shrink-0"
            style={{ background: '#4c1d9540', border: '1px solid #7c3aed' }}>
            <span style={{ fontSize: 9, color: '#c4b5fd', fontWeight: 'bold' }}>W</span>
          </div>
          <span className="text-[12px] font-bold text-[#e2e8f0] flex-1 truncate">{screen.name}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
            style={{ background: '#312e81', color: '#a5b4fc', border: '1px solid #4c1d95' }}>윈도우</span>
          <button onMouseDown={e => e.stopPropagation()} onClick={onClose}
            className="p-1 rounded hover:bg-[#450a0a] text-[#6b7280] hover:text-[#f87171] transition-colors ml-1">
            <XIcon size={14} />
          </button>
        </div>

        {/* SVG 캔버스 */}
        <div style={{ width: svgW, height: svgH, background: screen.bgColor || '#1a2233', overflow: 'hidden' }}>
          <svg width={svgW} height={svgH} viewBox={`0 0 ${resolution.w} ${resolution.h}`} style={{ display: 'block' }}>
            {els.map(el => {
              const Renderer = RENDERERS[el.type]
              if (!Renderer) return null
              const tagId = (bindings || {})[el.id] ?? el.tagId
              const tag = tags.find(t => t.id === tagId) ?? null
              return (
                <Renderer key={el.id} el={el} tag={tag} tags={tags} selected={false}
                  symbols={symbols} svgBindings={svgBindings || {}}
                  onPointerDown={() => {}} onDoubleClick={() => {}} onClick={() => {}} />
              )
            })}
          </svg>
        </div>

        {/* 하단 */}
        <div className="flex items-center justify-between px-3 py-1.5 flex-shrink-0"
          style={{ background: '#0a0a14', borderTop: '1px solid #1e1b4b' }}>
          <span className="text-[9px] text-[#4c1d95] font-mono">ESC 또는 배경 클릭으로 닫기</span>
          <button onClick={onClose} className="px-4 py-1 rounded text-[10px] font-bold text-white transition-colors"
            style={{ background: '#4c1d95', border: '1px solid #7c3aed' }}>닫기</button>
        </div>
      </div>
    </div>
  )
}

/* ── 메인 캔버스 컴포넌트 ── */

export default function ScadaCanvas({
  tags, selectedId, onSelect, onDeselect, bindings, svgBindings = {}, canvasElements, recipeSets = [],
  onAddElement, onMoveElement, onResizeElement, onResetLayout, symbols = [], onAddSymbol,
  onDoubleClickElement, onCopyElement, onPasteElement, onDeleteElement, onReorderElement, onGotoScreen, allScreens = [],
  resolution = { w: 1280, h: 800 },
  screenBgColor = '#1a2233',
  screenBgImage = '',
  screenBgFit = 'slice',
  screenBgDim = 0,
  selectedIds = [],           // 다중 선택된 id 배열
  onSelectMultiple,           // (ids[]) => void
  onUpdateElement,            // (id, patch) => void
  onAddFreehand,              // (partial) => void  자유곡선 요소 추가
  penMode = false,            // 선 그리기 모드 (App에서 제어)
  setPenMode,                 // (bool) => void
  onAddWire,                  // (partial) => void  연결선 추가
  wireMode = false,           // 연결선 그리기 모드
  setWireMode,                // (bool) => void
  onUndo, onRedo, canUndo = false, canRedo = false,
  onAlign, onDistribute, onGroup, onUngroup,
  onOpenStyleGallery, onAddPanel,
  pendingPlace = null,        // 빈 공간 없어 사용자가 위치 선택할 요소 큐 [{type,w,h,label,...}]
  onPlaceAt,                  // (canvasX, canvasY) => void
  onCancelPlace,              // () => void
}) {
  const placing = Array.isArray(pendingPlace) && pendingPlace.length > 0
  const placeItem = placing ? pendingPlace[0] : null
  const [placeCursor, setPlaceCursor] = useState(null)   // 배치 모드 커서 위치(SVG좌표)
  // 배치 모드 — Esc 로 취소
  useEffect(() => {
    if (!placing) return
    const fn = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancelPlace?.() } }
    window.addEventListener('keydown', fn, true)
    return () => window.removeEventListener('keydown', fn, true)
  }, [placing, onCancelPlace])
  const [zoom, setZoom] = useState(1)
  const [dragOver, setDragOver] = useState(false)
  const [dragPos, setDragPos] = useState(null)
  const [cursorPos, setCursorPos] = useState(null)
  const [popupScreenId, setPopupScreenId] = useState(null)
  const [ctxMenu, setCtxMenu] = useState(null) // { x, y, elId }
  const [inlineEdit, setInlineEdit] = useState(null) // { id, value }
  const [marquee, setMarquee] = useState(null)  // { x1,y1,x2,y2 } SVG 좌표
  const [penPreview, setPenPreview] = useState(null) // 그리는 중 미리보기 경로(d)
  const penRef = useRef(null)                   // 수집 중인 점 배열
  const onAddFreehandRef = useRef(onAddFreehand)
  onAddFreehandRef.current = onAddFreehand
  const [wireDraft, setWireDraft] = useState(null) // { pts:[{x,y}], cur:{x,y}, snap:{x,y}|null }
  const wireRef = useRef(null)                  // { points:[{x,y}], from }
  const onAddWireRef = useRef(onAddWire)
  onAddWireRef.current = onAddWire
  const marqueeRef = useRef(null)               // 드래그 중 시작점
  const clickTimerRef = useRef(null)            // 1초 타임아웃 핸들
  const pendingSelectRef = useRef(null)         // { el, startClientX, startClientY }
  const svgRef = useRef(null)
  const scrollRef = useRef(null)
  const canvasElementsRef = useRef(canvasElements)
  canvasElementsRef.current = canvasElements
  const selectedIdsRef = useRef(selectedIds)
  selectedIdsRef.current = selectedIds
  // memo로 스킵된 요소의 콜백이 최신 상태를 읽도록 — 모드/선택을 ref로도 노출
  const selectedIdRef = useRef(selectedId); selectedIdRef.current = selectedId
  const penModeRef = useRef(penMode); penModeRef.current = penMode
  const wireModeRef = useRef(wireMode); wireModeRef.current = wireMode
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const onSelectMultipleRef = useRef(onSelectMultiple)
  onSelectMultipleRef.current = onSelectMultiple
  const dragRef = useRef(null)   // { id, dx, dy }
  const resizeRef = useRef(null) // { id, handle, startX, startY, origX, origY, origW, origH, isCenter }
  const gridDragRef = useRef(null) // 표 칸 경계 드래그 { id, axis:'col'|'row', index }

  // 격자 스냅 (드래그·리사이즈 시 GRID 배수로 스냅)
  const GRID = 10
  const [snapGrid, setSnapGrid] = useState(false)
  const snapRef = useRef(snapGrid)
  snapRef.current = snapGrid
  const doSnap = (v) => snapRef.current ? Math.round(v / GRID) * GRID : v

  const canvasW = resolution.w
  const canvasH = resolution.h
  const { clampX, clampY } = makeClamp(canvasW, canvasH)

  const zoomIn  = () => setZoom(z => Math.min(4, parseFloat((z + 0.1).toFixed(1))))
  const zoomOut = () => setZoom(z => Math.max(0.2, parseFloat((z - 0.1).toFixed(1))))
  const reset   = () => setZoom(1)

  // Ctrl+휠 줌
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setZoom(z => {
        const delta = e.deltaY > 0 ? -0.1 : 0.1
        return Math.max(0.2, Math.min(4, parseFloat((z + delta).toFixed(1))))
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  /* 화면 좌표 → SVG 사용자 좌표 */
  function screenToSvg(clientX, clientY) {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = clientX; pt.y = clientY
    const p = pt.matrixTransform(ctm.inverse())
    return { x: Math.round(p.x), y: Math.round(p.y) }
  }

  /* 전역 포인터 이동/해제 */
  useEffect(() => {
    function onMove(e) {
      // 선 그리는 중 — Shift면 직선, 아니면 자유곡선
      if (penRef.current) {
        const st = penRef.current
        const p = screenToSvg(e.clientX, e.clientY)
        st.cur = p
        st.shift = e.shiftKey
        if (e.shiftKey) {
          // 직선: 시작점 → 현재점
          setPenPreview(`M${st.pts[0].x},${st.pts[0].y} L${p.x},${p.y}`)
        } else {
          const last = st.pts[st.pts.length - 1]
          if (Math.hypot(p.x - last.x, p.y - last.y) >= 2) st.pts.push(p)
          setPenPreview(st.pts.map((q, i) => `${i === 0 ? 'M' : 'L'}${q.x},${q.y}`).join(' '))
        }
        return
      }
      // 표 칸 경계 드래그 — 인접 두 칸의 비율 조정
      const gd = gridDragRef.current
      if (gd) {
        const el = canvasElementsRef.current.find(x => x.id === gd.id)
        if (!el) { gridDragRef.current = null; return }
        const p = screenToSvg(e.clientX, e.clientY)
        const w = el.width || 200, h = el.height || 120, titleH = el.label ? 18 : 0, cH = h - titleH
        const cols = Math.max(0, Math.min(20, Math.round(+el.gridCols || 0)))
        const rows = Math.max(0, Math.min(20, Math.round(+el.gridRows || 0)))
        if (gd.axis === 'col') {
          const fr = gridFracs(el.gridColW, cols); const j = gd.index
          const L = fr.slice(0, j).reduce((a, b) => a + b, 0), span = fr[j] + fr[j + 1]
          let f = (p.x - el.x) / w
          f = Math.max(L + 0.04, Math.min(L + span - 0.04, f))
          fr[j] = f - L; fr[j + 1] = span - fr[j]
          onUpdateElement?.(el.id, { gridColW: fr })
        } else {
          const fr = gridFracs(el.gridRowH, rows); const i = gd.index
          const T = fr.slice(0, i).reduce((a, b) => a + b, 0), span = fr[i] + fr[i + 1]
          let f = (p.y - el.y - titleH) / cH
          f = Math.max(T + 0.04, Math.min(T + span - 0.04, f))
          fr[i] = f - T; fr[i + 1] = span - fr[i]
          onUpdateElement?.(el.id, { gridRowH: fr })
        }
        return
      }
      const r = resizeRef.current
      if (r) {
        const p = screenToSvg(e.clientX, e.clientY)
        const dx = p.x - r.startX
        const dy = p.y - r.startY
        const MIN = 20
        let newX = r.origX, newY = r.origY
        let newW = r.origW, newH = r.origH

        if (r.isCenter) {
          if (r.handle === 'br' || r.handle === 'tr') newW = Math.max(MIN, r.origW + dx * 2)
          if (r.handle === 'bl' || r.handle === 'tl') newW = Math.max(MIN, r.origW - dx * 2)
          if (r.handle === 'br' || r.handle === 'bl') newH = Math.max(MIN, r.origH + dy * 2)
          if (r.handle === 'tr' || r.handle === 'tl') newH = Math.max(MIN, r.origH - dy * 2)
          if (r.handle === 'mr') newW = Math.max(MIN, r.origW + dx * 2)
          if (r.handle === 'ml') newW = Math.max(MIN, r.origW - dx * 2)
          if (r.handle === 'bc') newH = Math.max(MIN, r.origH + dy * 2)
          if (r.handle === 'tc') newH = Math.max(MIN, r.origH - dy * 2)
        } else {
          // groupbox: top-left origin
          if (r.handle === 'br' || r.handle === 'mr' || r.handle === 'tr') newW = Math.max(MIN, r.origW + dx)
          if (r.handle === 'bl' || r.handle === 'ml' || r.handle === 'tl') { newW = Math.max(MIN, r.origW - dx); newX = r.origX + (r.origW - newW) }
          if (r.handle === 'br' || r.handle === 'bc' || r.handle === 'bl') newH = Math.max(MIN, r.origH + dy)
          if (r.handle === 'tr' || r.handle === 'tc' || r.handle === 'tl') { newH = Math.max(MIN, r.origH - dy); newY = r.origY + (r.origH - newH) }
        }

        onResizeElement?.(r.id, { x: Math.round(doSnap(newX)), y: Math.round(doSnap(newY)), width: Math.round(doSnap(newW)), height: Math.round(doSnap(newH)) })
        return
      }

      // 마르퀴 활성 시 드래그 이동보다 우선
      if (marqueeRef.current) {
        const m = marqueeRef.current
        const dist = Math.hypot(e.clientX - m.startClientX, e.clientY - m.startClientY)
        if (!m.active && dist < 5) return
        const p = screenToSvg(e.clientX, e.clientY)
        marqueeRef.current = { ...m, x2: p.x, y2: p.y, active: true }
        setMarquee({ ...marqueeRef.current })
        return
      }

      const d = dragRef.current
      if (!d) return
      const distX = e.clientX - d.startClientX
      const distY = e.clientY - d.startClientY
      if (!d.moved && Math.hypot(distX, distY) < 5) return
      // 5px 이상 드래그 → 즉시 선택 확정 후 이동 시작
      if (!d.moved && pendingSelectRef.current) {
        clearTimeout(clickTimerRef.current)
        onSelectRef.current?.(d.id)
        onSelectMultipleRef.current?.([])
        pendingSelectRef.current = null
      }
      d.moved = true
      const p = screenToSvg(e.clientX, e.clientY)
      const nx = clampX(doSnap(p.x - d.dx))
      const ny = clampY(doSnap(p.y - d.dy))
      const moveSet = d.moveSet || [d.id]
      if (moveSet.length > 1 && d.starts) {
        // 시작점 기준 절대이동 — 증분 누적 오차(드리프트) 없음
        const totalDx = nx - d.origX, totalDy = ny - d.origY
        moveSet.forEach(sid => {
          const st = d.starts[sid]
          if (st) onMoveElement(sid, clampX(st.x + totalDx), clampY(st.y + totalDy))
        })
      } else {
        onMoveElement(d.id, nx, ny)
      }
      setDragPos({ x: nx, y: ny, screenX: e.clientX, screenY: e.clientY })
    }
    function onUp() {
      // 선 그리기 종료 — 요소 생성
      if (penRef.current) {
        const st = penRef.current
        penRef.current = null
        setPenPreview(null)
        // Shift 직선이면 시작점→끝점 2점, 아니면 수집된 자유곡선 점
        const pts = st.shift ? [st.pts[0], st.cur] : st.pts
        if (pts.length >= 2) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
          for (const q of pts) { if (q.x < minX) minX = q.x; if (q.x > maxX) maxX = q.x; if (q.y < minY) minY = q.y; if (q.y > maxY) maxY = q.y }
          const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
          const hw = Math.max(4, (maxX - minX) / 2), hh = Math.max(4, (maxY - minY) / 2)
          // 중심 기준 정규화([-1,1]) — 리사이즈/회전이 hw/hh로 처리됨
          const points = pts.map(q => [ (q.x - cx) / hw, (q.y - cy) / hh ])
          onAddFreehandRef.current?.({ x: Math.round(cx), y: Math.round(cy), hw: Math.round(hw), hh: Math.round(hh), points, strokeColor: '#00e5ff', strokeWidth: 2 })
        }
        return
      }
      clearTimeout(clickTimerRef.current)
      // 1초 이내 해제 + 드래그 없음 → 오브젝트 선택 확정 (그룹이면 그룹 전체)
      if (pendingSelectRef.current && marqueeRef.current && !marqueeRef.current.active) {
        const { el } = pendingSelectRef.current
        onSelectRef.current?.(el.id)
        if (el.groupId) {
          const members = canvasElementsRef.current.filter(e => e.groupId === el.groupId).map(e => e.id)
          onSelectMultipleRef.current?.(members)
        } else {
          onSelectMultipleRef.current?.([])
        }
      }
      pendingSelectRef.current = null
      if (gridDragRef.current) { gridDragRef.current = null; return }
      if (resizeRef.current) { resizeRef.current = null }
      if (dragRef.current) { dragRef.current = null; setDragPos(null) }
      if (marqueeRef.current) {
        const m = marqueeRef.current
        marqueeRef.current = null
        setMarquee(null)
        if (!m.active) return
        // 방향성 선택 (CAD 방식): 좌→우 드래그 = 완전포함(window) / 우→좌 = 걸치기(crossing)
        const crossing = m.x2 < m.x1
        const x1 = Math.min(m.x1, m.x2), x2 = Math.max(m.x1, m.x2)
        const y1 = Math.min(m.y1, m.y2), y2 = Math.max(m.y1, m.y2)
        if (x2 - x1 < 4 && y2 - y1 < 4) return
        const all = canvasElementsRef.current
        const inBox = (p) => p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2
        const inside = all.filter(el => {
          if (el.type === 'wire') {
            const pts = (el.points || []).map((p, i) => {
              const a = el.anchors?.[i]
              if (a) { const wp = anchorPos(a, all); if (wp) return wp }
              return { x: p[0], y: p[1] }
            })
            if (pts.length < 2) return false
            // 걸치기: 점 하나라도 안에 / 완전포함: 모든 점이 안에
            return crossing ? pts.some(inBox) : pts.every(inBox)
          }
          const b = elementBBox(el)
          return crossing
            ? (b.right >= x1 && b.left <= x2 && b.bottom >= y1 && b.top <= y2)   // 걸치기: bbox 교차
            : (b.left >= x1 && b.right <= x2 && b.top >= y1 && b.bottom <= y2)   // 완전포함: bbox가 마퀴 안
        }).map(el => el.id)
        onSelectMultipleRef.current?.(inside)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [onMoveElement, onResizeElement, clampX, clampY])

  // 키보드 방향키로 선택된 오브젝트 이동 (다중 선택 전체 이동)
  useEffect(() => {
    function onKeyDown(e) {
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].indexOf(e.key) === -1) return
      const ids = selectedIdsRef.current.length ? selectedIdsRef.current : (selectedId ? [selectedId] : [])
      if (!ids.length) return
      // 인라인 편집 중이거나 input 포커스 시 무시
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      e.preventDefault()
      const step = e.shiftKey ? 10 : 1
      let dx = 0, dy = 0
      if (e.key === 'ArrowLeft')  dx = -step
      if (e.key === 'ArrowRight') dx = step
      if (e.key === 'ArrowUp')    dy = -step
      if (e.key === 'ArrowDown')  dy = step
      ids.forEach(id => {
        const el = canvasElementsRef.current.find(m => m.id === id)
        if (el) onMoveElement(id, clampX(el.x + dx), clampY(el.y + dy))
      })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId, onMoveElement, clampX, clampY])

  // 선/연결선 그리기 모드 키 처리 — ESC: 취소·해제 / Enter: 연결선 확정
  useEffect(() => {
    if (!penMode && !wireMode) return
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        penRef.current = null; setPenPreview(null); setPenMode?.(false)
        wireRef.current = null; setWireDraft(null); setWireMode?.(false)
      } else if (e.key === 'Enter' && wireMode && wireRef.current) {
        e.preventDefault()
        finishWire()  // 현재까지 찍은 점으로 확정
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [penMode, wireMode, setPenMode, setWireMode])

  // 연결선 확정 — 점 배열 + 각 점의 앵커 배열로 저장
  function finishWire() {
    const w = wireRef.current
    wireRef.current = null
    setWireDraft(null)
    if (w && w.points.length >= 2) {
      onAddWireRef.current?.({
        points: w.points.map(p => [Math.round(p.x), Math.round(p.y)]),
        anchors: w.anchors.map(a => a ? { elId: a.elId, rx: a.rx, ry: a.ry } : null),
      })
    }
  }

  function handleElementPointerDown(e, el) {
    e.stopPropagation()
    const selectedId = selectedIdRef.current, selectedIds = selectedIdsRef.current   // memo-스킵 콜백 대비 최신값
    // 펜 모드 — 요소 위에서 시작해도 선 그리기
    if (penModeRef.current) {
      const p = screenToSvg(e.clientX, e.clientY)
      penRef.current = { pts: [p], cur: p, shift: e.shiftKey }
      setPenPreview(`M${p.x},${p.y}`)
      return
    }
    // 연결선 모드 — 요소(심볼) 위 클릭 = 그 지점에 앵커 부착
    if (wireModeRef.current) {
      const p = screenToSvg(e.clientX, e.clientY)
      const hit = findAnchorNear(p.x, p.y, canvasElementsRef.current)
      const pos = hit ? { x: hit.x, y: hit.y } : p
      const anchor = hit ? { elId: hit.elId, rx: hit.rx, ry: hit.ry } : null
      if (!wireRef.current) {
        wireRef.current = { points: [pos], anchors: [anchor] }
      } else {
        wireRef.current.points.push(pos)
        wireRef.current.anchors.push(anchor)
        if (hit) { finishWire(); return }
      }
      setWireDraft({ pts: [...wireRef.current.points], cur: pos, snap: hit ? { x: hit.x, y: hit.y } : null })
      return
    }
    clearTimeout(clickTimerRef.current)
    resizeRef.current = null
    // 시작 위치 캡처 헬퍼 (드리프트 방지 — 시작점 기준 절대이동)
    const captureStarts = (ids) => {
      const starts = {}
      ids.forEach(sid => { const m = canvasElementsRef.current.find(e => e.id === sid); if (m) starts[sid] = { x: m.x, y: m.y } })
      return starts
    }
    // Alt+클릭 — 겹친 요소를 위→아래로 파고들며 선택 (뒤에 가려진 요소 선택용)
    if (e.altKey) {
      const p = screenToSvg(e.clientX, e.clientY)
      const all = canvasElementsRef.current
      const hits = all.filter(m => {
        if (m.type === 'wire') return false
        const b = elementBBox(m)
        return p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom
      })
      if (hits.length) {
        const topFirst = [...hits].reverse()             // 배열 뒤=위 → 위부터
        const cur = topFirst.findIndex(m => m.id === selectedId)
        const next = topFirst[cur < 0 ? 0 : (cur + 1) % topFirst.length]  // 한 겹 아래로 순환
        onSelectRef.current?.(next.id)
        onSelectMultipleRef.current?.([])
        marqueeRef.current = null; pendingSelectRef.current = null; dragRef.current = null
      }
      return
    }
    // Shift+클릭 — 개별 다중 선택 토글 (이동 없이 선택 집합만 갱신)
    if (e.shiftKey) {
      const cur = selectedIds.length ? selectedIds : (selectedId ? [selectedId] : [])
      // 그룹 요소는 그룹 전체를 하나의 단위로 토글
      const unit = el.groupId
        ? canvasElementsRef.current.filter(m => m.groupId === el.groupId).map(m => m.id)
        : [el.id]
      const already = unit.every(id => cur.includes(id))
      const next = already
        ? cur.filter(id => !unit.includes(id))                    // 이미 선택됨 → 해제
        : [...cur.filter(id => !unit.includes(id)), ...unit]      // 미선택 → 추가
      onSelectMultipleRef.current?.(next)
      onSelectRef.current?.(next.length ? next[next.length - 1] : null)
      marqueeRef.current = null
      pendingSelectRef.current = null
      dragRef.current = null
      return
    }
    // 그룹 요소 → 클릭 즉시 그룹 전체 선택 + 한 번의 드래그로 이동
    if (el.groupId) {
      const members = canvasElementsRef.current.filter(e => e.groupId === el.groupId).map(e => e.id)
      onSelectRef.current?.(el.id)
      onSelectMultipleRef.current?.(members)
      marqueeRef.current = null
      pendingSelectRef.current = null
      const p = screenToSvg(e.clientX, e.clientY)
      dragRef.current = { id: el.id, dx: p.x - el.x, dy: p.y - el.y, origX: el.x, origY: el.y,
        startClientX: e.clientX, startClientY: e.clientY, moved: false, moveSet: members, starts: captureStarts(members) }
      return
    }
    const alreadySelected = selectedId === el.id || selectedIds.includes(el.id)
    if (alreadySelected) {
      // 이미 선택된 오브젝트 → 드래그로 이동
      dragRef.current = null
      marqueeRef.current = null
      pendingSelectRef.current = null
      const p = screenToSvg(e.clientX, e.clientY)
      const set = (selectedIds.length > 1 && selectedIds.includes(el.id)) ? selectedIds : [el.id]
      dragRef.current = { id: el.id, dx: p.x - el.x, dy: p.y - el.y, origX: el.x, origY: el.y,
        startClientX: e.clientX, startClientY: e.clientY, moved: false, moveSet: set, starts: captureStarts(set) }
    } else {
      // 미선택 오브젝트 → 1초 내 해제 = 선택, 드래그 = 마르퀴
      dragRef.current = null
      pendingSelectRef.current = { el }
      const p = screenToSvg(e.clientX, e.clientY)
      marqueeRef.current = { x1: p.x, y1: p.y, x2: p.x, y2: p.y, active: false,
        startClientX: e.clientX, startClientY: e.clientY }
      clickTimerRef.current = setTimeout(() => {
        pendingSelectRef.current = null
        // 드래그 중(마르퀴 active)이면 건드리지 않음
        if (marqueeRef.current && !marqueeRef.current.active) {
          marqueeRef.current = null
        }
      }, 1000)
    }
  }

  function handleElementDoubleClick(e, el) {
    e.stopPropagation()
    if (el.gotoScreen && el.gotoMode) return
    // 텍스트는 더블클릭 시 캔버스에서 바로 인라인 편집
    if (el.type === 'text') { setInlineEdit({ id: el.id, value: el.label ?? '' }); return }
    onDoubleClickElement?.(el.id)
  }

  function handleElementClick(e, el) {
    if (!el.gotoScreen || !el.gotoMode) return
    if (el.type !== 'switch' && el.type !== 'symbol') return
    e.stopPropagation()
    if (el.gotoMode === 'popup') {
      setPopupScreenId(el.gotoScreen)
    } else if (el.gotoMode === 'switch' && onGotoScreen) {
      onGotoScreen(el.gotoScreen)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const p = screenToSvg(e.clientX, e.clientY)
    const panelStyle = e.dataTransfer.getData('application/x-hmi-panel')
    if (panelStyle) { onAddPanel?.(panelStyle, p.x, p.y); return }
    const symId = e.dataTransfer.getData('application/x-hmi-symbol')
    if (symId) { onAddSymbol?.(symId, p.x, p.y); return }
    const type = e.dataTransfer.getData('application/x-hmi-type')
    if (type === 'shape') {
      const shapeId = e.dataTransfer.getData('application/x-hmi-shape') || 'rect'
      onAddElement('shape', p.x, p.y, shapeId)
    } else if (type === 'groupbox') {
      const bs = e.dataTransfer.getData('application/x-hmi-boxstyle') || 'round'
      onAddElement('groupbox', p.x, p.y, bs)
    } else if (type) {
      onAddElement(type, p.x, p.y)
    }
  }

  // 현재 활성 화면의 배경색 (canvasElements가 없을 때 대비)
  const svgW = Math.round(canvasW * zoom)
  const svgH = Math.round(canvasH * zoom)

  // 눈금자 틱 (50 단위)
  const ticksX = Array.from({ length: Math.floor(canvasW / 50) + 1 }, (_, i) => i * 50)
  const ticksY = Array.from({ length: Math.floor(canvasH / 50) + 1 }, (_, i) => i * 50)

  const selectedEl = selectedId ? canvasElements.find(e => e.id === selectedId) : null

  // 정렬 단위 수 — 같은 그룹은 하나로 계산 (그룹 1개만 선택 시 정렬 버튼 숨김)
  const alignUnitCount = (() => {
    const gids = new Set(); let solo = 0
    for (const id of selectedIds) {
      const el = canvasElements.find(e => e.id === id)
      if (!el) continue
      if (el.groupId != null) gids.add(el.groupId); else solo++
    }
    return gids.size + solo
  })()

  return (
    <div className="flex flex-col h-full" style={{ userSelect: dragRef.current ? 'none' : 'auto' }}>
      {/* 툴바 */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#171e2b] border-b border-[#2d3748] flex-shrink-0">
        <Grid3X3 size={12} className="text-[#4a9eff]" />
        <span className="text-[10px] font-bold text-[#4a9eff] tracking-widest uppercase">SCADA Canvas</span>
        <span className="text-[10px] text-[#4a5568] ml-1">— {canvasElements.length} 요소</span>

        {/* 되돌리기 / 다시하기 */}
        <div className="flex items-center gap-0.5 ml-2">
          <button onClick={onUndo} disabled={!canUndo} title="되돌리기 (Ctrl+Z)"
            className="p-1 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#2d3748] text-[#718096] hover:text-[#e2e8f0]">
            <Undo2 size={13} />
          </button>
          <button onClick={onRedo} disabled={!canRedo} title="다시하기 (Ctrl+Y)"
            className="p-1 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#2d3748] text-[#718096] hover:text-[#e2e8f0]">
            <Redo2 size={13} />
          </button>
        </div>

        {/* 정렬 / 분배 — 2개 이상 선택 시 */}
        {alignUnitCount >= 2 && (
          <div className="flex items-center gap-0.5 ml-1 pl-2 border-l border-[#2d3748]">
            {[
              { m:'left',    Icon: AlignStartVertical,    t:'왼쪽 정렬' },
              { m:'centerX', Icon: AlignCenterVertical,   t:'가로 가운데 정렬' },
              { m:'right',   Icon: AlignEndVertical,      t:'오른쪽 정렬' },
              { m:'top',     Icon: AlignStartHorizontal,  t:'위 정렬' },
              { m:'centerY', Icon: AlignCenterHorizontal, t:'세로 가운데 정렬' },
              { m:'bottom',  Icon: AlignEndHorizontal,    t:'아래 정렬' },
            ].map(({ m, Icon, t }) => (
              <button key={m} onClick={() => onAlign?.(m)} title={t}
                className="p-1 rounded hover:bg-[#2d3748] text-[#718096] hover:text-[#00d4ff] transition-colors">
                <Icon size={13} />
              </button>
            ))}
            {alignUnitCount >= 3 && (<>
              <button onClick={() => onDistribute?.('h')} title="가로 간격 균등"
                className="p-1 rounded hover:bg-[#2d3748] text-[#718096] hover:text-[#00d4ff] transition-colors">
                <AlignHorizontalSpaceAround size={13} />
              </button>
              <button onClick={() => onDistribute?.('v')} title="세로 간격 균등"
                className="p-1 rounded hover:bg-[#2d3748] text-[#718096] hover:text-[#00d4ff] transition-colors">
                <AlignVerticalSpaceAround size={13} />
              </button>
            </>)}
            <span className="text-[9px] text-[#4a5568] ml-1">{selectedIds.length}개 선택</span>
          </div>
        )}

        {/* 선택 요소 정보 */}
        {selectedEl && !dragPos && (
          <span className="ml-2 px-2 py-0.5 rounded text-[9px] font-bold bg-[#0f2444] text-[#00d4ff] border border-[#1e40af]">
            {selectedEl.id} · ({selectedEl.x}, {selectedEl.y}) ·{' '}
            {selectedEl.type === 'groupbox'
              ? `${selectedEl.width || 200}×${selectedEl.height || 120}`
              : `${(selectedEl.hw || 45) * 2}×${(selectedEl.hh || 22) * 2}`
            }
          </span>
        )}

        {/* 드래그 중 위치 실시간 표시 */}
        {dragPos && (
          <span className="ml-2 px-2 py-0.5 rounded text-[9px] font-bold bg-[#14532d] text-[#4ade80] border border-[#22c55e]"
            style={{ fontFamily:'monospace' }}>
            X: {dragPos.x}  Y: {dragPos.y}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {/* 선 그리기 토글 (그림판식) */}
          <button onClick={() => { setWireMode?.(false); setPenMode(m => !m) }} title="선 그리기 — 드래그: 자유곡선 / Shift+드래그: 직선"
            className="flex items-center gap-1 px-1.5 py-1 rounded transition-colors"
            style={penMode
              ? { background:'#2e1065', color:'#c4b5fd', border:'1px solid #7c3aed' }
              : { color:'#718096', border:'1px solid transparent' }}>
            <Pencil size={12} /><span className="text-[9px]">{penMode ? '그리는 중 (Shift=직선)' : '선 그리기'}</span>
          </button>
          {/* 연결선 토글 */}
          <button onClick={() => { setPenMode?.(false); setWireMode?.(m => !m) }} title="연결선 — 클릭으로 점 연결, 심볼 포트에 스냅. 더블클릭/우클릭/ESC로 종료"
            className="flex items-center gap-1 px-1.5 py-1 rounded transition-colors"
            style={wireMode
              ? { background:'#0c2a4a', color:'#38bdf8', border:'1px solid #1e40af' }
              : { color:'#718096', border:'1px solid transparent' }}>
            <Share2 size={12} /><span className="text-[9px]">{wireMode ? '연결 중 (클릭)' : '연결선'}</span>
          </button>
          {/* 격자 스냅 토글 */}
          <button onClick={() => setSnapGrid(s => !s)} title={`격자 스냅 ${GRID}px — 드래그·리사이즈 시 격자에 맞춤`}
            className="flex items-center gap-1 px-1.5 py-1 rounded transition-colors"
            style={snapGrid
              ? { background:'#0c3a2a', color:'#34d399', border:'1px solid #059669' }
              : { color:'#718096', border:'1px solid transparent' }}>
            <Grid3X3 size={12} /><span className="text-[9px]">{snapGrid ? `스냅 ${GRID}px` : '스냅'}</span>
          </button>
          <div className="w-px h-4 bg-[#2d3748] mx-1" />
          {/* 캔버스 해상도 표시 */}
          <span className="text-[9px] font-mono text-[#374151] mr-2">{canvasW} × {canvasH}</span>
          <button onClick={() => onOpenStyleGallery?.()} title="패널 스타일 (테마 갤러리)"
            className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-[#2e1065] text-[#718096] hover:text-[#c4b5fd] transition-colors">
            <Palette size={12} /><span className="text-[9px]">스타일</span>
          </button>
          <button onClick={onResetLayout} title="레이아웃 초기화"
            className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-[#3f1d1d] text-[#718096] hover:text-[#ef4444] transition-colors">
            <Trash2 size={12} /><span className="text-[9px]">초기화</span>
          </button>
          <div className="w-px h-4 bg-[#2d3748] mx-1" />
          <button onClick={zoomOut} className="p-1 rounded hover:bg-[#2d3748] text-[#718096] hover:text-[#e2e8f0] transition-colors"><ZoomOut size={12} /></button>
          <span className="text-[10px] text-[#4a5568] w-10 text-center font-mono">{Math.round(zoom * 100)}%</span>
          <button onClick={zoomIn} className="p-1 rounded hover:bg-[#2d3748] text-[#718096] hover:text-[#e2e8f0] transition-colors"><ZoomIn size={12} /></button>
          <button onClick={reset} className="p-1 rounded hover:bg-[#2d3748] text-[#718096] hover:text-[#e2e8f0] transition-colors" title="100% 복원"><RotateCcw size={12} /></button>
        </div>
      </div>

      {/* 스크롤 영역 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto relative"
        style={{ background: '#0d1117' }}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (!dragOver) setDragOver(true) }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false) }}
        onDrop={handleDrop}
      >
        {/* 배치 모드 배너 — 빈 공간 없어 사용자가 위치를 클릭해 배치 */}
        {placing && (
          <div className="sticky top-0 z-40 flex items-center gap-3 px-4 py-2 shadow-lg"
            style={{ background:'#14532d', borderBottom:'1px solid #22c55e' }}>
            <span className="text-[12px] font-bold text-[#4ade80]">📍 배치할 위치를 클릭하세요</span>
            <span className="text-[11px] text-[#a7f3d0]">
              «{placeItem?.label || '요소'}» · 남은 {pendingPlace.length}개 · 빨간 영역은 이미 사용 중
            </span>
            <button onClick={() => onCancelPlace?.()}
              className="ml-auto px-2.5 py-1 rounded text-[11px] font-bold text-[#fca5a5] hover:bg-[#450a0a] transition-colors"
              style={{ border:'1px solid #7f1d1d' }}>취소 (Esc)</button>
          </div>
        )}

        {/* 드래그 오버 힌트 */}
        {dragOver && (
          <div className="fixed inset-0 z-20 flex items-center justify-center pointer-events-none">
            <span className="px-3 py-1.5 rounded text-[11px] font-bold bg-[#0f2444] text-[#00d4ff] border border-[#00d4ff66]">
              여기에 놓아 배치
            </span>
          </div>
        )}

        {/* 드래그 중 위치 툴팁 (마우스 따라다님) */}
        {dragPos && (
          <div
            className="fixed z-50 pointer-events-none"
            style={{ left: dragPos.screenX + 14, top: dragPos.screenY - 28 }}
          >
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg shadow-xl"
              style={{ background:'#0d2515', border:'1px solid #22c55e', color:'#4ade80', fontFamily:'monospace', fontSize:12, fontWeight:700, whiteSpace:'nowrap' }}>
              <svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#22c55e" opacity="0.8"/></svg>
              X {dragPos.x} · Y {dragPos.y}
            </div>
          </div>
        )}

        {/* 캔버스 패딩 영역 */}
        <div style={{ padding: 40, display:'inline-block', minWidth:'100%', minHeight:'100%', boxSizing:'border-box' }}>
          {/* 캔버스 그림자 + 테두리 */}
          <div style={{
            position: 'relative',
            width: svgW,
            height: svgH,
            boxShadow: '0 0 0 1px #374151, 0 8px 40px rgba(0,0,0,0.6)',
            borderRadius: 2,
          }}>
            {/* 눈금자 — 상단 */}
            <div style={{ position:'absolute', top:-18, left:0, width:svgW, height:18, overflow:'hidden', pointerEvents:'none' }}>
              <svg width={svgW} height={18} style={{ display:'block' }}>
                {ticksX.map(t => (
                  <g key={t} transform={`translate(${Math.round(t * zoom)},0)`}>
                    <line x1="0" y1={t % 100 === 0 ? 6 : 12} x2="0" y2={18} stroke="#374151" strokeWidth="1" />
                    {t % 100 === 0 && <text x="2" y="8" fontSize="8" fill="#4a5568" fontFamily="monospace">{t}</text>}
                  </g>
                ))}
              </svg>
            </div>
            {/* 눈금자 — 좌측 */}
            <div style={{ position:'absolute', top:0, left:-26, width:26, height:svgH, overflow:'hidden', pointerEvents:'none' }}>
              <svg width={26} height={svgH} style={{ display:'block' }}>
                {ticksY.map(t => (
                  <g key={t} transform={`translate(0,${Math.round(t * zoom)})`}>
                    <line x1={t % 100 === 0 ? 6 : 14} y1="0" x2={26} y2="0" stroke="#374151" strokeWidth="1" />
                    {t % 100 === 0 && <text x="0" y="-2" fontSize="7" fill="#4a5568" fontFamily="monospace" transform={`rotate(-90,0,0)`} textAnchor="end">{t}</text>}
                  </g>
                ))}
              </svg>
            </div>

            {/* 메인 SVG */}
            <svg
              ref={svgRef}
              data-hmi-canvas
              width={svgW}
              height={svgH}
              viewBox={`0 0 ${canvasW} ${canvasH}`}
              style={{ display:'block', background: screenBgColor, cursor: (penMode || wireMode) ? 'crosshair' : 'default' }}
              className={`scada-grid${(penMode || wireMode) ? ' drawing-mode' : ''}`}
              onContextMenu={e => {
                e.preventDefault()
                // 펜 모드 — 우클릭으로 모드 해제 (그리는 중이면 취소)
                if (penMode) { penRef.current = null; setPenPreview(null); setPenMode?.(false); return }
                // 연결선 모드 — 우클릭: 그리는 중이면 확정 후 모드 해제, 아니어도 해제
                if (wireMode) {
                  if (wireRef.current) finishWire()
                  setWireMode?.(false)
                  return
                }
                if (ctxMenu) { setCtxMenu(null); return }
                setCtxMenu({ x: e.clientX, y: e.clientY, elId: null })
              }}
              onDoubleClick={e => {
                // 연결선 모드 — 더블클릭으로 종료(포트 없이)
                if (wireMode && wireRef.current) {
                  e.preventDefault()
                  wireRef.current.points.pop() // 더블클릭으로 중복 추가된 마지막 정점 제거
                  wireRef.current.anchors.pop()
                  finishWire()
                }
              }}
              onPointerMove={placing ? (e => setPlaceCursor(screenToSvg(e.clientX, e.clientY))) : undefined}
              onPointerLeave={placing ? (() => setPlaceCursor(null)) : undefined}
              onPointerDown={e => {
                const t = e.target
                // 배치 모드 — 클릭 위치에 보류 요소를 배치 (다른 모든 처리보다 우선)
                if (placing) {
                  e.preventDefault(); e.stopPropagation()
                  const p = screenToSvg(e.clientX, e.clientY)
                  onPlaceAt?.(p.x, p.y)
                  return
                }
                if (ctxMenu) { setCtxMenu(null); return }
                // 선 그리기 시작
                if (penMode) {
                  const p = screenToSvg(e.clientX, e.clientY)
                  penRef.current = { pts: [p], cur: p, shift: e.shiftKey }
                  setPenPreview(`M${p.x},${p.y}`)
                  return
                }
                // 연결선 모드 — 클릭으로 정점 추가 / 심볼에 앵커
                if (wireMode) {
                  const p = screenToSvg(e.clientX, e.clientY)
                  const hit = findAnchorNear(p.x, p.y, canvasElementsRef.current)
                  const pos = hit ? { x: hit.x, y: hit.y } : p
                  const anchor = hit ? { elId: hit.elId, rx: hit.rx, ry: hit.ry } : null
                  if (!wireRef.current) {
                    wireRef.current = { points: [pos], anchors: [anchor] }
                  } else {
                    wireRef.current.points.push(pos)
                    wireRef.current.anchors.push(anchor)
                    if (hit) { finishWire(); return }
                  }
                  setWireDraft({ pts: [...wireRef.current.points], cur: pos, snap: hit ? { x: hit.x, y: hit.y } : null })
                  return
                }
                if (t === svgRef.current || t.tagName === 'svg' || t.dataset.bg) {
                  // 빈 캔버스 클릭 — 기존 drag/pending 상태 초기화 후 마르퀴 시작
                  clearTimeout(clickTimerRef.current)
                  dragRef.current = null
                  pendingSelectRef.current = null
                  resizeRef.current = null
                  onDeselect()
                  onSelectMultipleRef.current?.([])
                  const p = screenToSvg(e.clientX, e.clientY)
                  marqueeRef.current = { x1: p.x, y1: p.y, x2: p.x, y2: p.y, active: false,
                    startClientX: e.clientX, startClientY: e.clientY }
                }
              }}
              onMouseMove={e => {
                if (dragRef.current) return
                const sp = screenToSvg(e.clientX, e.clientY)
                setCursorPos(sp)
                // 연결선 그리는 중 — 커서까지 미리보기 + 포트 스냅 표시
                if (wireMode && wireRef.current) {
                  const hit = findAnchorNear(sp.x, sp.y, canvasElementsRef.current)
                  setWireDraft({ pts: [...wireRef.current.points], cur: hit ? { x: hit.x, y: hit.y } : sp, snap: hit ? { x: hit.x, y: hit.y } : null })
                }
              }}
              onMouseLeave={() => setCursorPos(null)}
            >
              {/* 격자 패턴 */}
              <defs>
                <pattern id="grid-minor" width="10" height="10" patternUnits="userSpaceOnUse">
                  <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#1e2736" strokeWidth="0.5"/>
                </pattern>
                <pattern id="grid-major" width="100" height="100" patternUnits="userSpaceOnUse">
                  <rect width="100" height="100" fill="url(#grid-minor)"/>
                  <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#252f3f" strokeWidth="1"/>
                </pattern>
              </defs>
              {screenBgImage
                ? <><image href={screenBgImage} x="0" y="0" width={canvasW} height={canvasH} data-bg="1"
                    preserveAspectRatio={screenBgFit === 'stretch' ? 'none' : screenBgFit === 'meet' ? 'xMidYMid meet' : 'xMidYMid slice'} />
                    {screenBgDim > 0 && <rect x="0" y="0" width={canvasW} height={canvasH} fill="#000" opacity={screenBgDim / 100} />}</>
                : <rect width={canvasW} height={canvasH} fill="url(#grid-major)" data-bg="1" />}
              <style>{`@keyframes nxAlarmBlink{0%,49%{opacity:1}50%,100%{opacity:0.08}}`}</style>

              {/* 캔버스 테두리 강조 */}
              <rect x="0" y="0" width={canvasW} height={canvasH} fill="none" stroke="#374151" strokeWidth="1" />

              {/* HMI 요소 */}
              {canvasElements.map(el => {
                const Renderer = RENDERERS[el.type]
                if (!Renderer) return null
                const tag = resolveTag(el, bindings, tags)
                const selected = selectedId === el.id
                const alarm = tagAlarmLevel(tag)
                return (
                  <g key={el.id}
                    onContextMenu={e => { e.preventDefault(); e.stopPropagation(); if (penMode) { penRef.current = null; setPenPreview(null); setPenMode?.(false); return } if (wireMode) { if (wireRef.current) finishWire(); setWireMode?.(false); return } onSelect(el.id); setCtxMenu({ x: e.clientX, y: e.clientY, elId: el.id }) }}>
                    {alarm === '경보' && (() => { const b = elementBBox(el); return (
                      <rect x={b.left - 5} y={b.top - 5} width={(b.right - b.left) + 10} height={(b.bottom - b.top) + 10} rx={6}
                        fill="none" stroke="#ef4444" strokeWidth={2.5} pointerEvents="none"
                        style={{ animation: 'nxAlarmBlink 0.7s steps(1,end) infinite', filter: 'drop-shadow(0 0 5px #ef4444)' }} />
                    )})()}
                    <Renderer
                      el={el}
                      tag={tag}
                      tags={tags}
                      elements={canvasElements}
                      recipeSets={recipeSets}
                      selected={selected}
                      symbols={symbols}
                      svgBindings={svgBindings}
                      onPointerDown={e => handleElementPointerDown(e, el)}
                      onDoubleClick={e => handleElementDoubleClick(e, el)}
                      onClick={e => handleElementClick(e, el)}
                      onContextMenu={(e, elId) => { e.preventDefault(); e.stopPropagation(); if (penMode) { penRef.current = null; setPenPreview(null); setPenMode?.(false); return } if (wireMode) { if (wireRef.current) finishWire(); setWireMode?.(false); return } onSelect(elId); setCtxMenu({ x: e.clientX, y: e.clientY, elId }) }}
                    />
                  </g>
                )
              })}

              {/* 리사이즈 핸들 — 선택된 요소에만 표시 (와이어/자유곡선 제외) */}
              {selectedEl && selectedEl.type !== 'wire' && (() => {
                const el = selectedEl
                const isGroupBox = el.type === 'groupbox'
                const isSymbol = el.type === 'symbol'
                const w = isGroupBox ? (el.width || 200) : isSymbol ? (el.w || 48) : (el.hw || 45) * 2
                const h = isGroupBox ? (el.height || 120) : isSymbol ? (el.h || 48) : (el.hh || 22) * 2
                const ox = isGroupBox ? el.x : el.x - w / 2
                const oy = isGroupBox ? el.y : el.y - h / 2
                const origH = h

                // 도형/심볼 회전·반전에 맞춰 선택 박스도 함께 변환
                const rot = el.imgRotation || 0
                const sx = el.imgFlipX ? -1 : 1
                const sy = el.imgFlipY ? -1 : 1
                const cx = el.x, cy = el.y
                const selXform = (!isGroupBox && (rot || sx < 0 || sy < 0))
                  ? `translate(${cx} ${cy}) rotate(${rot}) scale(${sx} ${sy}) translate(${-cx} ${-cy})`
                  : undefined

                const handles = [
                  { id: 'tl', x: ox,       y: oy,       cursor: 'nw-resize' },
                  { id: 'tc', x: ox + w/2, y: oy,       cursor: 'n-resize'  },
                  { id: 'tr', x: ox + w,   y: oy,       cursor: 'ne-resize' },
                  { id: 'ml', x: ox,       y: oy + h/2, cursor: 'w-resize'  },
                  { id: 'mr', x: ox + w,   y: oy + h/2, cursor: 'e-resize'  },
                  { id: 'bl', x: ox,       y: oy + h,   cursor: 'sw-resize' },
                  { id: 'bc', x: ox + w/2, y: oy + h,   cursor: 's-resize'  },
                  { id: 'br', x: ox + w,   y: oy + h,   cursor: 'se-resize' },
                ]

                return (
                  <g transform={selXform}>
                    <rect x={ox} y={oy} width={w} height={h} rx={2}
                      fill="none" stroke="#00d4ff" strokeWidth={1} strokeDasharray="5 3"
                      style={{ pointerEvents:'none', opacity:0.5 }} />
                    {handles.map(hnd => (
                      <rect key={hnd.id}
                        x={hnd.x - 4} y={hnd.y - 4} width={8} height={8}
                        fill="#00d4ff" stroke="#0a1628" strokeWidth={1} rx={1}
                        style={{ cursor: hnd.cursor }}
                        onPointerDown={e2 => {
                          e2.stopPropagation()
                          dragRef.current = null
                          const startSvg = screenToSvg(e2.clientX, e2.clientY)
                          resizeRef.current = {
                            id: el.id,
                            handle: hnd.id,
                            startX: startSvg.x,
                            startY: startSvg.y,
                            origX: el.x,
                            origY: el.y,
                            origW: w,
                            origH: origH,
                            isCenter: !isGroupBox,
                          }
                        }}
                      />
                    ))}
                  </g>
                )
              })()}

              {/* 표 칸 경계 드래그 핸들 — 선택된 그룹박스에 표가 있을 때 */}
              {selectedEl && selectedEl.type === 'groupbox' && (() => {
                const el = selectedEl
                const w = el.width || 200, h = el.height || 120, titleH = el.label ? 18 : 0, cH = h - titleH
                const cols = Math.max(0, Math.min(20, Math.round(+el.gridCols || 0)))
                const rows = Math.max(0, Math.min(20, Math.round(+el.gridRows || 0)))
                if (cH <= 0 || (cols < 2 && rows < 2)) return null
                const startDrag = (axis, index) => (e2) => {
                  e2.stopPropagation()
                  dragRef.current = null; resizeRef.current = null
                  gridDragRef.current = { id: el.id, axis, index }
                }
                return (
                  <g>
                    {gridBounds(gridFracs(el.gridColW, cols)).map((f, j) => (
                      <rect key={`gvh${j}`} x={el.x + w * f - 3} y={el.y + titleH} width={6} height={cH}
                        fill="#00d4ff" fillOpacity={0.01} style={{ cursor: 'col-resize', pointerEvents: 'all' }}
                        onPointerDown={startDrag('col', j)} />
                    ))}
                    {gridBounds(gridFracs(el.gridRowH, rows)).map((f, i) => (
                      <rect key={`grh${i}`} x={el.x} y={el.y + titleH + cH * f - 3} width={w} height={6}
                        fill="#00d4ff" fillOpacity={0.01} style={{ cursor: 'row-resize', pointerEvents: 'all' }}
                        onPointerDown={startDrag('row', i)} />
                    ))}
                  </g>
                )
              })()}

              {/* 다중 선택 하이라이트 */}
              {selectedIds.filter(id => id !== selectedId).map(id => {
                const el = canvasElements.find(e => e.id === id)
                if (!el) return null
                const isGroupBox = el.type === 'groupbox'
                const isSymbol = el.type === 'symbol'
                const w = isGroupBox ? (el.width || 200) : isSymbol ? (el.w || 48) : (el.hw || 45) * 2
                const h = isGroupBox ? (el.height || 120) : isSymbol ? (el.h || 48) : (el.hh || 22) * 2
                const ox = isGroupBox ? el.x : el.x - w / 2
                const oy = isGroupBox ? el.y : el.y - h / 2
                return <rect key={id} x={ox-2} y={oy-2} width={w+4} height={h+4} rx={3}
                  fill="none" stroke="#00d4ff" strokeWidth={1.5} strokeDasharray="5 3"
                  style={{ pointerEvents:'none', filter:'drop-shadow(0 0 4px #00d4ff88)' }} />
              })}

              {/* 마르퀴 선택 사각형 */}
              {marquee && (() => {
                const x = Math.min(marquee.x1, marquee.x2)
                const y = Math.min(marquee.y1, marquee.y2)
                const w = Math.abs(marquee.x2 - marquee.x1)
                const h = Math.abs(marquee.y2 - marquee.y1)
                // 좌→우 = 완전포함(파랑 실선) / 우→좌 = 걸치기(초록 점선)
                const crossing = marquee.x2 < marquee.x1
                const stroke = crossing ? '#22c55e' : '#3b82f6'
                return <rect x={x} y={y} width={w} height={h}
                  fill={crossing ? 'rgba(34,197,94,0.07)' : 'rgba(59,130,246,0.07)'}
                  stroke={stroke} strokeWidth={1} strokeDasharray={crossing ? '5 3' : undefined}
                  style={{ pointerEvents:'none' }} />
              })()}

              {/* 자유곡선 그리는 중 미리보기 */}
              {penPreview && (
                <path d={penPreview} fill="none" stroke="#00e5ff" strokeWidth={2}
                  strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents:'none' }} />
              )}

              {/* 연결선 모드 — 심볼 포트 힌트 표시 */}
              {wireMode && canvasElements.map(el => {
                if (el.type === 'wire' || el.type === 'shape' || el.type === 'groupbox' || el.type === 'text') return null
                return WIRE_PORTS.map(port => {
                  const p = portPos(el, port)
                  return <circle key={`${el.id}-${port}`} cx={p.x} cy={p.y} r={3}
                    fill="#22c55e" fillOpacity={0.55} stroke="#0a1628" strokeWidth={0.8}
                    style={{ pointerEvents:'none' }} />
                })
              })}

              {/* 연결선 그리는 중 미리보기 */}
              {wireDraft && (() => {
                const all = [...wireDraft.pts, wireDraft.cur]
                const d = all.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
                return (<g style={{ pointerEvents:'none' }}>
                  <path d={d} fill="none" stroke="#00e5ff" strokeWidth={2} strokeOpacity={0.8}
                    strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 3" />
                  {wireDraft.pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="#00e5ff" />)}
                  {wireDraft.snap && <circle cx={wireDraft.snap.x} cy={wireDraft.snap.y} r={6}
                    fill="none" stroke="#22c55e" strokeWidth={2} />}
                </g>)
              })()}

              {/* 배치 모드 — 기존 요소(점유 영역) 흐리게 + 커서에 고스트 박스 */}
              {placing && (
                <g style={{ pointerEvents:'none' }}>
                  <rect x={0} y={0} width={canvasW} height={canvasH} fill="#0a0f1a" opacity={0.35} />
                  {canvasElements.map(el => {
                    const b = elementBBox(el)
                    return <rect key={`occ-${el.id}`} x={b.left - 6} y={b.top - 6}
                      width={(b.right - b.left) + 12} height={(b.bottom - b.top) + 12} rx={4}
                      fill="#ef4444" fillOpacity={0.10} stroke="#ef4444" strokeOpacity={0.45}
                      strokeWidth={1} strokeDasharray="4 3" />
                  })}
                  {placeCursor && (() => {
                    const w = placeItem?.w || 64, h = placeItem?.h || 64
                    return <rect x={placeCursor.x - w / 2} y={placeCursor.y - h / 2} width={w} height={h} rx={4}
                      fill="#22c55e" fillOpacity={0.18} stroke="#22c55e" strokeWidth={2} />
                  })()}
                </g>
              )}
            </svg>

            {/* 인라인 텍스트 편집 */}
            {inlineEdit && (() => {
              const el = canvasElements.find(e => e.id === inlineEdit.id)
              if (!el) return null
              const svg = svgRef.current
              const svgRect = svg?.getBoundingClientRect()
              const scaleX = svgRect ? svgRect.width / (svg.viewBox.baseVal.width || 1) : 1
              const scaleY = svgRect ? svgRect.height / (svg.viewBox.baseVal.height || 1) : 1
              const fs = (el.fontSize || 13) * scaleX
              const lineH = fs * 1.25
              const nLines = Math.max(1, inlineEdit.value.split('\n').length)
              const iw = Math.max((el.hw || 60) * 2 * scaleX, 90)
              const ih = Math.max(nLines * lineH + 8, 24)
              // 요소 중심에 맞춰 오버레이 중앙 정렬
              const cx = (svgRect?.left || 0) + el.x * scaleX
              const cy = (svgRect?.top  || 0) + el.y * scaleY
              const commit = () => { onResizeElement?.(inlineEdit.id, { label: inlineEdit.value }); setInlineEdit(null) }
              return (
                <textarea
                  autoFocus
                  value={inlineEdit.value}
                  onChange={e => setInlineEdit(prev => ({ ...prev, value: e.target.value }))}
                  onFocus={e => e.target.select()}
                  onKeyDown={e => {
                    // Enter=줄바꿈, Ctrl/⌘+Enter=완료, Esc=취소
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit() }
                    else if (e.key === 'Escape') { e.preventDefault(); setInlineEdit(null) }
                  }}
                  onBlur={commit}
                  style={{
                    position: 'fixed',
                    left: cx - iw / 2, top: cy - ih / 2,
                    width: iw, height: ih,
                    fontSize: fs, lineHeight: `${lineH}px`,
                    fontFamily: el.fontFamily || "'Consolas','Courier New',monospace",
                    fontWeight: el.bold ? 'bold' : 'normal',
                    fontStyle: el.italic ? 'italic' : 'normal',
                    textDecoration: el.underline ? 'underline' : 'none',
                    color: el.color || '#e2e8f0',
                    background: 'rgba(10,15,30,0.95)',
                    border: '1px solid #00d4ff',
                    borderRadius: 3,
                    padding: '2px 4px',
                    outline: 'none',
                    resize: 'none',
                    overflow: 'hidden',
                    zIndex: 1000,
                    textAlign: el.align === 'left' ? 'left' : el.align === 'right' ? 'right' : 'center',
                    whiteSpace: 'pre',
                  }}
                />
              )
            })()}

            {/* 좌표 오버레이 (우하단) */}
            {cursorPos && !dragPos && (
              <div className="absolute bottom-2 right-2 pointer-events-none"
                style={{ fontFamily:'monospace', fontSize:10, color:'#4a5568', background:'rgba(0,0,0,0.5)', padding:'2px 6px', borderRadius:4 }}>
                {cursorPos.x}, {cursorPos.y}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 우클릭 컨텍스트 메뉴 ── */}
      {ctxMenu && (() => {
        const ctxEl = ctxMenu.elId ? canvasElements.find(e => e.id === ctxMenu.elId) : null
        const isImgSymbol = !!(ctxEl && (ctxEl.type === 'symbol' || ctxEl.type === 'shape'))
        const canGroup = selectedIds.length >= 2
        const canUngroup = !!(ctxEl && ctxEl.groupId) || selectedIds.some(id => canvasElements.find(e => e.id === id)?.groupId)
        return (
          <div
            style={{ position:'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 9999,
              background:'#10151f', border:'1px solid #374151', borderRadius:6,
              boxShadow:'0 4px 20px rgba(0,0,0,0.6)', minWidth:160, padding:'4px 0' }}
            onMouseLeave={() => setCtxMenu(null)}
            onPointerDown={e => e.stopPropagation()}>
            {isImgSymbol && (<>
              <div style={{ padding:'4px 12px 2px', fontSize:9, color:'#6b7280', fontWeight:'bold', textTransform:'uppercase', letterSpacing:'0.08em' }}>회전 / 반전</div>
              <button
                className="w-full flex items-center gap-2 px-4 py-1.5 text-[12px] text-[#cbd5e1] hover:bg-[#1e293b] transition-colors"
                onClick={() => { onUpdateElement?.(ctxMenu.elId, { imgRotation: ((ctxEl.imgRotation || 0) + 90) % 360 }); setCtxMenu(null) }}>
                🔄 90° 시계방향 회전
              </button>
              <button
                className="w-full flex items-center gap-2 px-4 py-1.5 text-[12px] text-[#cbd5e1] hover:bg-[#1e293b] transition-colors"
                onClick={() => { onUpdateElement?.(ctxMenu.elId, { imgRotation: ((ctxEl.imgRotation || 0) + 270) % 360 }); setCtxMenu(null) }}>
                🔄 90° 반시계방향 회전
              </button>
              <button
                className="w-full flex items-center gap-2 px-4 py-1.5 text-[12px] text-[#cbd5e1] hover:bg-[#1e293b] transition-colors"
                onClick={() => { onUpdateElement?.(ctxMenu.elId, { imgFlipX: !ctxEl.imgFlipX }); setCtxMenu(null) }}>
                ↔ 좌우 반전
              </button>
              <button
                className="w-full flex items-center gap-2 px-4 py-1.5 text-[12px] text-[#cbd5e1] hover:bg-[#1e293b] transition-colors"
                onClick={() => { onUpdateElement?.(ctxMenu.elId, { imgFlipY: !ctxEl.imgFlipY }); setCtxMenu(null) }}>
                ↕ 상하 반전
              </button>
              <div style={{ height:1, background:'#1e293b', margin:'2px 0' }} />
            </>)}
            {ctxMenu.elId && (<>
              <button
                className="w-full flex items-center gap-2 px-4 py-2 text-[12px] text-[#cbd5e1] hover:bg-[#1e293b] transition-colors"
                onClick={() => { onDoubleClickElement?.(ctxMenu.elId); setCtxMenu(null) }}>
                <span style={{ fontFamily:'monospace', fontSize:11, color:'#4a9eff' }}>Enter</span>
                속성 편집
              </button>
              <div style={{ height:1, background:'#1e293b', margin:'2px 0' }} />
              <button
                className="w-full flex items-center gap-2 px-4 py-2 text-[12px] text-[#cbd5e1] hover:bg-[#1e293b] transition-colors"
                onClick={() => {
                  // 다중 선택 상태에서 그 안의 요소를 우클릭 → 선택 전체 복사
                  const ids = (selectedIds.length > 1 && selectedIds.includes(ctxMenu.elId)) ? selectedIds : ctxMenu.elId
                  onCopyElement?.(ids); setCtxMenu(null)
                }}>
                <span style={{ fontFamily:'monospace', fontSize:11, color:'#4a9eff' }}>Ctrl+C</span>
                복사{selectedIds.length > 1 && selectedIds.includes(ctxMenu.elId) ? ` (${selectedIds.length}개)` : ''}
              </button>
              <div style={{ height:1, background:'#1e293b', margin:'2px 0' }} />
            </>)}
            {(canGroup || canUngroup) && (<>
              {canGroup && (
                <button
                  className="w-full flex items-center gap-2 px-4 py-2 text-[12px] text-[#cbd5e1] hover:bg-[#1e293b] transition-colors"
                  onClick={() => { onGroup?.(); setCtxMenu(null) }}>
                  <span style={{ fontFamily:'monospace', fontSize:11, color:'#4a9eff' }}>Ctrl+G</span>
                  그룹 ({selectedIds.length}개)
                </button>
              )}
              {canUngroup && (
                <button
                  className="w-full flex items-center gap-2 px-4 py-2 text-[12px] text-[#cbd5e1] hover:bg-[#1e293b] transition-colors"
                  onClick={() => { onUngroup?.(); setCtxMenu(null) }}>
                  <span style={{ fontFamily:'monospace', fontSize:11, color:'#4a9eff' }}>Ctrl+⇧G</span>
                  그룹 해제
                </button>
              )}
              <div style={{ height:1, background:'#1e293b', margin:'2px 0' }} />
            </>)}
            <button
              className="w-full flex items-center gap-2 px-4 py-2 text-[12px] text-[#cbd5e1] hover:bg-[#1e293b] transition-colors"
              onClick={() => { onPasteElement?.(); setCtxMenu(null) }}>
              <span style={{ fontFamily:'monospace', fontSize:11, color:'#4a9eff' }}>Ctrl+V</span>
              붙여넣기
            </button>
            {ctxMenu.elId && (<>
              <div style={{ height:1, background:'#1e293b', margin:'2px 0' }} />
              {[
                { label:'맨 앞으로', dir:'front' },
                { label:'앞으로',    dir:'forward' },
                { label:'뒤로',      dir:'backward' },
                { label:'맨 뒤로',   dir:'back' },
              ].map(({ label, dir }) => (
                <button key={dir}
                  className="w-full flex items-center gap-2 px-4 py-2 text-[12px] text-[#cbd5e1] hover:bg-[#1e293b] transition-colors"
                  onClick={() => { onReorderElement?.(ctxMenu.elId, dir); setCtxMenu(null) }}>
                  {label}
                </button>
              ))}
              <div style={{ height:1, background:'#1e293b', margin:'2px 0' }} />
              <button
                className="w-full flex items-center gap-2 px-4 py-2 text-[12px] text-[#f87171] hover:bg-[#1a0808] transition-colors"
                onClick={() => { onDeleteElement?.(ctxMenu.elId); setCtxMenu(null) }}>
                <span style={{ fontFamily:'monospace', fontSize:11, color:'#f87171' }}>Del</span>
                삭제
              </button>
            </>)}
          </div>
        )
      })()}

      {/* ── 윈도우 화면 팝업 오버레이 ── */}
      {popupScreenId && (
        <WindowPopup
          screenId={popupScreenId}
          allScreens={allScreens}
          tags={tags}
          bindings={bindings}
          svgBindings={svgBindings}
          symbols={symbols}
          resolution={resolution}
          onClose={() => setPopupScreenId(null)}
        />
      )}
    </div>
  )
}



