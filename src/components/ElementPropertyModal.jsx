import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { playBeep } from '../utils/beep'
import {
  X, Tag, Link2, Shapes, ToggleRight, Trash2,
  RotateCw, ArrowUpDown, Droplets, Power, Move, Maximize2, MonitorPlay, Waves, Gauge, Type, FlaskConical,
  AlignLeft, AlignCenter, AlignRight,
} from 'lucide-react'
import { ELEMENT_TYPE_LABELS, ELEMENT_VARIANTS, DEFAULT_VARIANT, SWITCH_BEHAVIORS, SYMBOL_ROLES, SHAPE_LIST, getShapePath } from '../data/canvasElements'
import { isSvgSymbol } from '../data/symbols'
import { ANIM_PREFIXES, computeLayerStyle, parseLayerName } from '../utils/svgNaming'
import { formatTagValue } from '../data/tags'

/* ── 선 종류(점선/쇄선) 옵션 ── */
const LINE_STYLE_OPTIONS = [
  { id: 'solid',   label: '실선 ──────' },
  { id: 'dashed',  label: '점선 - - - -' },
  { id: 'dotted',  label: '촘촘점선 ······' },
  { id: 'center',  label: '일점쇄선 —·—·' },
  { id: 'center2', label: '이점쇄선 —··—··' },
]

/* ── 흐름(flow) 표시 설정 UI (선/연결선 공용) ── */
function FlowSettings({ element, tags, onUpdateElement }) {
  const selCls = "w-full bg-[#1a202c] border border-[#2d3748] rounded px-2 py-1.5 text-[11px] text-[#e2e8f0] focus:outline-none focus:border-[#0891b2] mt-1"
  const bitTags = (tags || []).filter(t => t.type === 'BIT')
  const numTags = (tags || []).filter(t => t.type !== 'BIT')
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={!!element.flow}
          onChange={e => onUpdateElement(element.id, { flow: e.target.checked })}
          style={{ accentColor:'#22d3ee' }} />
        <span className="text-[11px] font-semibold text-[#cbd5e1]">흐름 애니메이션 사용</span>
      </label>
      {element.flow && (<>
        <div>
          <p className="text-[10px] font-bold text-[#94a3b8] mb-0.5">작동 태그 (BIT · ON/OFF)</p>
          <select value={element.flowEnableTag || ''} className={selCls}
            onChange={e => onUpdateElement(element.id, { flowEnableTag: e.target.value })}>
            <option value="">(항상 흐름 ON)</option>
            {bitTags.map(t => <option key={t.id} value={t.id}>{t.id}{t.desc ? ` — ${t.desc}` : ''}</option>)}
          </select>
        </div>
        <div>
          <p className="text-[10px] font-bold text-[#94a3b8] mb-0.5">속도 태그 (아날로그)</p>
          <select value={element.flowSpeedTag || ''} className={selCls}
            onChange={e => onUpdateElement(element.id, { flowSpeedTag: e.target.value })}>
            <option value="">(기본 속도)</option>
            {numTags.map(t => <option key={t.id} value={t.id}>{t.id}{t.desc ? ` — ${t.desc}` : ''}</option>)}
          </select>
          <p className="text-[9px] text-[#6b7280] mt-0.5">값이 클수록 빠르게, 0이면 정지</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-[#94a3b8] mb-0.5">흐름 방향</p>
          <select value={element.flowDir || 'forward'} className={selCls}
            onChange={e => onUpdateElement(element.id, { flowDir: e.target.value })}>
            <option value="forward">정방향 → (시작→끝, 좌→우)</option>
            <option value="reverse">역방향 ← (끝→시작, 우→좌)</option>
          </select>
        </div>
        <ColorPicker label="흐름 색상"
          value={element.flowColor || '#38f5d0'}
          onChange={v => onUpdateElement(element.id, { flowColor: v })} />
        <p className="text-[9px] text-[#6b7280] leading-relaxed">
          실행 화면에서 태그값에 따라 흐름이 표시됩니다.
        </p>
      </>)}
    </div>
  )
}

/* ── 동작 타입 메타 ── */
const ANIM_META = {
  rotate:    { icon: RotateCw,    color: '#00d4ff', hint: 'FLOAT / INT 권장 — 0~100 → 360° 회전' },
  translate: { icon: ArrowUpDown, color: '#f59e0b', hint: 'FLOAT / INT 권장 — 0~100 → 직선 이동' },
  fill:      { icon: Droplets,    color: '#22c55e', hint: 'FLOAT / INT 권장 — 0~100 → 채움 높이(%)' },
  toggle:    { icon: Power,       color: '#a78bfa', hint: 'BIT 권장 — 0 = 숨김 / 1 = 표시' },
}

/* ── 색상 유틸 ── */
const PRESET_COLORS = [
  '#ffffff','#e2e8f0','#94a3b8','#64748b','#374151','#1e293b','#0f172a','#000000',
  '#ef4444','#f97316','#f59e0b','#eab308','#84cc16','#22c55e','#10b981','#14b8a6',
  '#06b6d4','#00d4ff','#4a9eff','#3b82f6','#6366f1','#8b5cf6','#a78bfa','#ec4899',
  '#ff0055','#ff6600','#00ff88','#00e5ff','#fbbf24','#86efac','#f87171','#c084fc',
]

function hsvToHex(h, s, v) {
  const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)) }
  const r = Math.round(f(5) * 255), g = Math.round(f(3) * 255), b = Math.round(f(1) * 255)
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')
}
function hexToHsv(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  const v = max
  const s = max === 0 ? 0 : d / max
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  return { h, s, v }
}
function isValidHex(h) { return /^#[0-9a-fA-F]{6}$/.test(h) }

function toHex(v) {
  if (!v) return '#e2e8f0'
  if (isValidHex(v)) return v
  const m = v.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/)
  if (m) return '#' + [m[1],m[2],m[3]].map(n => (+n).toString(16).padStart(2,'0')).join('')
  return '#e2e8f0'
}

function ColorPicker({ value, onChange, label }) {
  const safeVal = toHex(value)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top:0, left:0 })
  const [hsv, setHsv] = useState(() => hexToHsv(safeVal))
  const [hexInput, setHexInput] = useState(safeVal)
  const btnRef = useRef(null)
  const popupRef = useRef(null)
  const sbRef = useRef(null)

  const draft = hsvToHex(hsv.h, hsv.s, hsv.v)
  const hueColor = hsvToHex(hsv.h, 1, 1)

  useEffect(() => {
    if (isValidHex(value)) { setHsv(hexToHsv(value)); setHexInput(value) }
  }, [value])

  function openPicker() {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 4, left: Math.max(4, r.right - 230) })
    setOpen(o => !o)
  }

  useEffect(() => {
    if (!open) return
    const fn = e => { if (popupRef.current && !popupRef.current.contains(e.target) && e.target !== btnRef.current) setOpen(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [open])

  function startSbDrag(e) {
    e.preventDefault()
    const update = ev => {
      const box = sbRef.current?.getBoundingClientRect()
      if (!box) return
      const s = Math.max(0, Math.min(1, (ev.clientX - box.left) / box.width))
      const v = Math.max(0, Math.min(1, 1 - (ev.clientY - box.top) / box.height))
      setHsv(prev => { const n = { ...prev, s, v }; setHexInput(hsvToHex(n.h, n.s, n.v)); return n })
    }
    update(e)
    const onMove = ev => update(ev)
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  return (
    <div>
      {label && <p className="text-[9px] text-[#6b7280] mb-1">{label}</p>}
      <div className="flex items-center gap-2">
        <button ref={btnRef} onClick={openPicker}
          style={{ width:28, height:28, background:draft, border:'2px solid #374151', borderRadius:4, flexShrink:0, cursor:'pointer' }} />
        <span className="flex-1 text-[11px] text-[#94a3b8] font-mono">{draft}</span>
        <button onClick={() => { onChange(draft); setOpen(false) }}
          className="px-3 py-1 rounded text-[10px] font-bold text-white"
          style={{ background:'#1e40af', border:'1px solid #3b82f6', whiteSpace:'nowrap' }}>
          적용
        </button>
      </div>

      {open && createPortal(
          <div ref={popupRef}
            style={{ position:'fixed', top:pos.top, left:pos.left, zIndex:999999,
              background:'#0d1117', border:'1px solid #374151', borderRadius:8,
              boxShadow:'0 8px 40px rgba(0,0,0,0.9)', padding:12, width:230 }}>

            {/* 채도·명도 박스 */}
            <div ref={sbRef} onMouseDown={startSbDrag}
              style={{ width:'100%', height:130, borderRadius:4, cursor:'crosshair', position:'relative', marginBottom:10, userSelect:'none',
                background:`linear-gradient(to bottom, transparent, #000), linear-gradient(to right, #fff, ${hueColor})`,
                border:'1px solid #374151' }}>
              <div style={{ position:'absolute', left:`${hsv.s*100}%`, top:`${(1-hsv.v)*100}%`,
                width:12, height:12, borderRadius:'50%', transform:'translate(-50%,-50%)',
                border:'2px solid #fff', boxShadow:'0 0 0 1px rgba(0,0,0,0.8)', pointerEvents:'none', background:draft }} />
            </div>

            {/* 색상환 */}
            <p style={{ fontSize:9, color:'#6b7280', marginBottom:3 }}>색상</p>
            <div style={{ position:'relative', height:16, borderRadius:8, marginBottom:10,
              background:'linear-gradient(to right,#f00 0%,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00 100%)',
              border:'1px solid #374151' }}>
              <input type="range" min={0} max={360} step={1} value={Math.round(hsv.h)}
                onChange={e => { const h=+e.target.value; setHsv(p=>{const n={...p,h};setHexInput(hsvToHex(n.h,n.s,n.v));return n}) }}
                style={{ position:'absolute', inset:0, width:'100%', height:'100%', opacity:0, cursor:'ew-resize', margin:0 }} />
              <div style={{ position:'absolute', top:'50%', left:`${(hsv.h/360)*100}%`,
                width:16, height:16, borderRadius:'50%', transform:'translate(-50%,-50%)',
                background:hueColor, border:'2px solid #fff', boxShadow:'0 0 0 1px rgba(0,0,0,0.6)', pointerEvents:'none' }} />
            </div>

            {/* 밝기 */}
            <p style={{ fontSize:9, color:'#6b7280', marginBottom:3 }}>밝기</p>
            <div style={{ position:'relative', height:16, borderRadius:8, marginBottom:10,
              background:`linear-gradient(to right,#000,${hueColor})`,
              border:'1px solid #374151' }}>
              <input type="range" min={0} max={100} step={1} value={Math.round(hsv.v*100)}
                onChange={e => { const v=+e.target.value/100; setHsv(p=>{const n={...p,v};setHexInput(hsvToHex(n.h,n.s,n.v));return n}) }}
                style={{ position:'absolute', inset:0, width:'100%', height:'100%', opacity:0, cursor:'ew-resize', margin:0 }} />
              <div style={{ position:'absolute', top:'50%', left:`${hsv.v*100}%`,
                width:16, height:16, borderRadius:'50%', transform:'translate(-50%,-50%)',
                background:draft, border:'2px solid #fff', boxShadow:'0 0 0 1px rgba(0,0,0,0.6)', pointerEvents:'none' }} />
            </div>

            {/* 프리셋 */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(8,1fr)', gap:3, marginBottom:10 }}>
              {PRESET_COLORS.map(c => (
                <button key={c} title={c}
                  onClick={() => { setHsv(hexToHsv(c)); setHexInput(c) }}
                  style={{ width:'100%', aspectRatio:'1', background:c, borderRadius:2,
                    border: draft===c ? '2px solid #00d4ff' : '1px solid #374151', cursor:'pointer' }} />
              ))}
            </div>

            {/* hex + 확인 */}
            <div style={{ display:'flex', gap:4, alignItems:'center' }}>
              <div style={{ width:22, height:22, borderRadius:3, background:draft, border:'1px solid #374151', flexShrink:0 }} />
              <input value={hexInput}
                onChange={e => { setHexInput(e.target.value); if(isValidHex(e.target.value)) setHsv(hexToHsv(e.target.value)) }}
                onKeyDown={e => { if(e.key==='Enter'&&isValidHex(hexInput)){onChange(hexInput);setOpen(false)} }}
                placeholder="#rrggbb"
                style={{ flex:1, background:'#1a202c', border:'1px solid #2d3748', borderRadius:4,
                  padding:'3px 8px', fontSize:11, color:'#e2e8f0', fontFamily:'monospace', outline:'none' }} />
              <button onClick={() => { onChange(draft); setOpen(false) }}
                style={{ padding:'3px 8px', borderRadius:4, fontSize:10, fontWeight:'bold', color:'#fff', whiteSpace:'nowrap',
                  background:'#1e40af', border:'1px solid #3b82f6', cursor:'pointer' }}>
                확인
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

/* ── 섹션 헤더 ── */
function Section({ title, icon: Icon, color = '#94a3b8', children }) {
  return (
    <div className="rounded border border-[#374151] overflow-hidden">
      <div className="px-3 py-2 bg-[#1e2736] border-b border-[#374151] flex items-center gap-1.5">
        {Icon && <Icon size={11} style={{ color }} />}
        <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color }}>{title}</p>
      </div>
      <div className="px-3 py-3 space-y-2.5 bg-[#131a26]">
        {children}
      </div>
    </div>
  )
}

/* 공통 레이블 */
function Label({ children }) {
  return <p className="text-[10px] font-semibold text-[#94a3b8] mb-1">{children}</p>
}

/* 숫자 입력 — 편집 중엔 자유 입력(빈칸·맨앞자리 수정 가능), 포커스 시 전체선택,
   최소/최대 제약은 확정(blur·Enter) 시에만 적용 */
function NumField({ value, min, max, onCommit, className, placeholder }) {
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  const [editing, setEditing] = useState(false)
  // 외부 값이 바뀌면(편집 중이 아닐 때만) 반영
  if (!editing && draft !== (value == null ? '' : String(value))) {
    setDraft(value == null ? '' : String(value))
  }
  const commit = () => {
    setEditing(false)
    if (draft === '' || draft === '-') { setDraft(value == null ? '' : String(value)); return }
    let v = parseFloat(draft)
    if (Number.isNaN(v)) { setDraft(value == null ? '' : String(value)); return }
    if (min != null) v = Math.max(min, v)
    if (max != null) v = Math.min(max, v)
    setDraft(String(v))
    onCommit(v)
  }
  return (
    <input
      type="number"
      value={draft}
      placeholder={placeholder}
      onFocus={e => { setEditing(true); e.target.select() }}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { commit(); e.currentTarget.blur() } if (e.key === 'Escape') { setDraft(value == null ? '' : String(value)); e.currentTarget.blur() } }}
      className={className}
    />
  )
}

/* 자리맞춤(좌/중/우) 버튼 그룹 — text·numeric 등 */
function AlignButtons({ value = 'center', onChange }) {
  const opts = [
    { v: 'left', Icon: AlignLeft, t: '왼쪽' },
    { v: 'center', Icon: AlignCenter, t: '가운데' },
    { v: 'right', Icon: AlignRight, t: '오른쪽' },
  ]
  return (
    <div className="flex gap-1">
      {opts.map(({ v, Icon, t }) => {
        const active = (value || 'center') === v
        return (
          <button key={v} onClick={() => onChange(v)} title={t}
            className="flex-1 flex items-center justify-center py-1.5 rounded transition-colors"
            style={active
              ? { background: '#1e3a5f', color: '#60a5fa', border: '1px solid #3b82f6' }
              : { background: '#1a202c', color: '#64748b', border: '1px solid #374151' }}>
            <Icon size={13} />
          </button>
        )
      })}
    </div>
  )
}

/* 값 막대 구간색 편집기 — animStops: [{upTo, color}] 오름차순, 마지막은 '그 이상' */
function StopsEditor({ element, onUpdateElement }) {
  const minV = element.animMinVal ?? element.gaugeMin ?? element.trendMin ?? 0
  const maxV = element.animMaxVal ?? element.gaugeMax ?? element.trendMax ?? 100
  const stops = (Array.isArray(element.animStops) && element.animStops.length)
    ? element.animStops
    : [{ upTo: null, color: element.animOnColor || '#22c55e' }]
  const commit = next => onUpdateElement(element.id, { animStops: next })
  const setUpTo = (i, v) => commit(stops.map((s, idx) => idx === i ? { ...s, upTo: v === '' ? null : +v } : s))
  const setColor = (i, c) => commit(stops.map((s, idx) => idx === i ? { ...s, color: c } : s))
  const addStop = () => {
    const mid = Math.round((minV + maxV) / 2)
    const body = stops.slice(0, -1), last = stops[stops.length - 1]
    commit([...body, { upTo: mid, color: '#eab308' }, last])
  }
  const removeStop = i => { if (stops.length > 1) commit(stops.filter((_, idx) => idx !== i)) }
  return (
    <div style={{ marginTop: 6 }}>
      <Label>구간별 색상 (값 오름차순)</Label>
      <div className="space-y-1 mt-1">
        {stops.map((s, i) => {
          const isLast = i === stops.length - 1
          const lower = i === 0 ? null : stops[i - 1].upTo  // 앞 구간의 상한 = 이 구간의 하한
          return (
            <div key={i} className="flex items-center gap-1.5">
              <div className="flex-1 flex items-center gap-1 min-w-0">
                {lower != null && <span className="text-[10px] text-[#64748b] flex-shrink-0">{lower} &lt;</span>}
                {isLast
                  ? <span className="text-[10px] text-[#94a3b8] flex-shrink-0">값{lower == null ? ' (전체)' : ' (초과)'}</span>
                  : (<>
                      <span className="text-[10px] text-[#94a3b8] flex-shrink-0">값 ≤</span>
                      <input type="number" value={s.upTo ?? ''} onChange={e => setUpTo(i, e.target.value)}
                        className="w-16 min-w-0 bg-[#1a202c] border border-[#2d3748] rounded px-1.5 py-1 text-[11px] text-[#e2e8f0] focus:outline-none focus:border-[#f472b6]" />
                    </>)}
              </div>
              <input type="color" value={s.color || '#22c55e'} onChange={e => setColor(i, e.target.value)}
                style={{ width: 28, height: 24, padding: 0, border: '1px solid #2d3748', borderRadius: 4, background: 'transparent', cursor: 'pointer', flexShrink: 0 }} />
              {!isLast && stops.length > 1 && (
                <button onClick={() => removeStop(i)} className="text-[#ef4444] text-[13px] leading-none px-1 flex-shrink-0" title="삭제">×</button>
              )}
            </div>
          )
        })}
      </div>
      <button onClick={addStop} className="mt-1.5 w-full py-1 rounded text-[10px] font-bold"
        style={{ background: '#2a1e3a', border: '1px solid #6d28d9', color: '#c4b5fd' }}>+ 구간 추가</button>
      <p className="text-[9px] text-[#6b7280] mt-1 leading-relaxed">각 줄은 <b style={{color:'#94a3b8'}}>겹치지 않는 범위</b>입니다. 예) 값 ≤10 황색 / 10&lt;값 ≤70 녹색 / 70&lt;값 적색.</p>
    </div>
  )
}

/* 워드(다중상태) 램프 상태 편집기 — states: [{value, label, color}] */
function StatesEditor({ element, onUpdateElement }) {
  const states = Array.isArray(element.states) ? element.states : []
  const commit = next => onUpdateElement(element.id, { states: next })
  const setField = (i, k, val) => commit(states.map((s, idx) => idx === i ? { ...s, [k]: val } : s))
  const PAL = ['#eab308', '#22c55e', '#ef4444', '#38bdf8', '#a78bfa', '#f97316', '#14b8a6']
  const add = () => {
    const nv = states.length ? Math.max(...states.map(s => Number(s.value) || 0)) + 1 : 0
    commit([...states, { value: nv, label: `상태${nv}`, color: PAL[states.length % PAL.length] }])
  }
  const remove = i => commit(states.filter((_, idx) => idx !== i))
  return (
    <div>
      <div className="flex items-center gap-1.5 px-0.5 mb-1 text-[8px] text-[#64748b] font-bold">
        <span className="w-11 flex-shrink-0">값</span><span className="flex-1">라벨</span><span className="w-7 text-center flex-shrink-0">색</span><span className="w-4 flex-shrink-0" />
      </div>
      <div className="space-y-1">
        {states.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input type="number" value={s.value} onChange={e => setField(i, 'value', e.target.value === '' ? 0 : +e.target.value)}
              className="w-11 flex-shrink-0 bg-[#1a202c] border border-[#2d3748] rounded px-1 py-1 text-[11px] text-[#e2e8f0] focus:outline-none focus:border-[#22c55e]" />
            <input value={s.label || ''} onChange={e => setField(i, 'label', e.target.value)} placeholder="라벨"
              className="flex-1 min-w-0 bg-[#1a202c] border border-[#2d3748] rounded px-1.5 py-1 text-[11px] text-[#e2e8f0] focus:outline-none focus:border-[#22c55e]" />
            <input type="color" value={s.color || '#22c55e'} onChange={e => setField(i, 'color', e.target.value)}
              style={{ width: 26, height: 24, padding: 0, border: '1px solid #2d3748', borderRadius: 4, background: 'transparent', cursor: 'pointer', flexShrink: 0 }} />
            <button onClick={() => remove(i)} className="text-[#ef4444] text-[13px] leading-none w-4 flex-shrink-0" title="삭제">×</button>
          </div>
        ))}
        {!states.length && <p className="text-[9px] text-[#6b7280] py-1">상태가 없습니다. 아래 버튼으로 추가하세요.</p>}
      </div>
      <button onClick={add} className="mt-1.5 w-full py-1 rounded text-[10px] font-bold"
        style={{ background: '#0d2515', border: '1px solid #166534', color: '#86efac' }}>+ 상태 추가</button>
      <p className="text-[9px] text-[#6b7280] mt-1 leading-relaxed">태그값(정수)이 "값"과 정확히 일치하는 상태의 색·라벨을 표시합니다. 예) 값0=운전준비, 값1=운전중.</p>
    </div>
  )
}

/* 공통 라벨 글자 스타일 — 라벨이 있는 모든 요소에 적용(비우면 기본값) */
function LabelStyleSection({ element, onUpdateElement }) {
  const set = patch => onUpdateElement(element.id, patch)
  const BIU = [
    { k: 'labelBold', label: 'B', style: { fontWeight: 'bold' } },
    { k: 'labelItalic', label: 'I', style: { fontStyle: 'italic' } },
    { k: 'labelUnderline', label: 'U', style: { textDecoration: 'underline' } },
  ]
  return (
    <Section title="라벨 글자 스타일" icon={Type} color="#f59e0b">
      <p className="text-[9px] text-[#6b7280] mb-2 leading-relaxed">비워두면 요소 기본값을 사용합니다. (라벨 텍스트에 공통 적용)</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>글자 크기</Label>
          <input type="number" min={5} max={80} value={element.labelFontSize ?? ''} placeholder="기본"
            onChange={e => set({ labelFontSize: e.target.value === '' ? undefined : +e.target.value })} className={inputCls} />
        </div>
        <div>
          <Label>폰트</Label>
          <select value={element.labelFontFamily || ''} onChange={e => set({ labelFontFamily: e.target.value || undefined })}
            className="w-full bg-[#1a202c] border border-[#2d3748] rounded px-2 py-1.5 text-[11px] text-[#e2e8f0] focus:outline-none focus:border-[#f59e0b] mt-1">
            <option value="">기본</option>
            <option value="monospace">Monospace</option>
            <option value="'Malgun Gothic','맑은 고딕',sans-serif">맑은 고딕</option>
            <option value="'NanumGothic',sans-serif">나눔고딕</option>
            <option value="'Arial','Helvetica',sans-serif">Arial</option>
            <option value="'Segoe UI',sans-serif">Segoe UI</option>
            <option value="'Georgia','Times New Roman',serif">Georgia</option>
          </select>
        </div>
      </div>
      <div className="pt-2">
        <Label>스타일</Label>
        <div className="flex gap-1.5 mt-1">
          {BIU.map(o => {
            const active = !!element[o.k]
            return (
              <button key={o.k} onClick={() => set({ [o.k]: !element[o.k] })}
                className="flex-1 py-1.5 rounded text-[13px] transition-colors"
                style={{ ...o.style, ...(active
                  ? { background: '#3a2a00', color: '#fbbf24', border: '1px solid #f59e0b' }
                  : { background: '#1e2736', color: '#94a3b8', border: '1px solid #374151' }) }}>
                {o.label}
              </button>
            )
          })}
        </div>
      </div>
      <div className="mt-2">
        <ColorPicker label="글자 색 (비우면 기본)"
          value={element.labelColor || '#94a3b8'}
          onChange={v => set({ labelColor: v })} />
      </div>
    </Section>
  )
}

/* 도형 애니메이션 미리보기 (슬라이더 내장, 태그 불필요) */
function ShapeAnimPreview({ element }) {
  const anim = element.animType || 'none'
  const shape = element.shape || 'rect'
  const hw = 44, hh = 30
  const svgW = 180, svgH = 100
  const cx = svgW / 2, cy = svgH / 2

  const minV = element.animMinVal ?? 0
  const maxV = element.animMaxVal ?? 100
  const [sliderVal, setSliderVal] = useState((minV + maxV) / 2)
  const [lampOn, setLampOn] = useState(false)

  // 램프 모드 색상
  let fill = element.fillColor || '#1e3a5f'
  const stroke = element.strokeColor || '#00e5ff'
  const sw = element.strokeWidth ?? 2
  const op = element.opacity ?? 1
  if (anim === 'lamp') {
    fill = lampOn ? (element.animOnColor || '#00ff00') : (element.animOffColor || '#ff0000')
  }

  // 아날로그 속도 계산
  const pct = maxV !== minV ? Math.max(0, Math.min(1, (sliderVal - minV) / (maxV - minV))) : 0
  const minSpeed = element.animMinSpeed ?? 10
  const maxSpeed = element.animMaxSpeed ?? 0.5
  const duration = sliderVal <= minV ? 0 : (minSpeed - pct * (minSpeed - maxSpeed))

  // 값 막대(valbar) 미리보기 계산
  const isValbar = anim === 'valbar'
  let vbColor = '#22c55e', vbRect = null
  if (isValbar) {
    const stops = (Array.isArray(element.animStops) && element.animStops.length)
      ? element.animStops : [{ upTo: null, color: element.animOnColor || '#22c55e' }]
    vbColor = stops[stops.length - 1].color
    for (const s of stops) { if (s.upTo == null || sliderVal <= s.upTo) { vbColor = s.color; break } }
    const fw = hw * 2, fh = hh * 2, dir = element.animBarDir || 'up'
    if (dir === 'down')       vbRect = { x: -hw, y: -hh, width: fw, height: fh * pct }
    else if (dir === 'right') vbRect = { x: -hw, y: -hh, width: fw * pct, height: fh }
    else if (dir === 'left')  vbRect = { x: hw - fw * pct, y: -hh, width: fw * pct, height: fh }
    else                      vbRect = { x: -hw, y: hh - fh * pct, width: fw, height: fh * pct }
  }

  const uid = `prev_${element.id}`
  let kf = '', innerStyle = {}
  if (anim === 'rotate' && duration > 0) {
    kf = `@keyframes ${uid}{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`
    innerStyle = { animation:`${uid} ${duration.toFixed(2)}s linear infinite`, transformBox:'fill-box', transformOrigin:'center' }
  } else if (anim === 'move_lr' && duration > 0) {
    const d = hw * 0.45
    kf = `@keyframes ${uid}{0%,100%{transform:translateX(${-d}px)}50%{transform:translateX(${d}px)}}`
    innerStyle = { animation:`${uid} ${duration.toFixed(2)}s ease-in-out infinite`, transformBox:'fill-box', transformOrigin:'center' }
  } else if (anim === 'move_rl' && duration > 0) {
    const d = hw * 0.45
    kf = `@keyframes ${uid}{0%,100%{transform:translateX(${d}px)}50%{transform:translateX(${-d}px)}}`
    innerStyle = { animation:`${uid} ${duration.toFixed(2)}s ease-in-out infinite`, transformBox:'fill-box', transformOrigin:'center' }
  }

  const isLine = shape === 'line' || shape === 'line2' || shape === 'hline' || shape === 'vline'
  const isFree = shape === 'freehand'
  const path = isFree && Array.isArray(element.points)
    ? element.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(p[0] * hw).toFixed(1)},${(p[1] * hh).toFixed(1)}`).join(' ')
    : getShapePath(shape, hw, hh)
  const statusText = anim === 'lamp' ? (lampOn ? 'ON' : 'OFF')
    : isValbar ? `${Math.round(sliderVal * 10) / 10} · ${Math.round(pct * 100)}%`
    : duration > 0 ? `${duration.toFixed(1)}초/사이클` : '정지 (최솟값)'

  return (
    <div style={{ marginTop:8, background:'#0a1628', border:'1px solid #f472b644', borderRadius:6, padding:'8px 10px' }}>
      <p style={{ fontSize:9, color:'#f472b6', fontWeight:700, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.08em' }}>
        미리보기 — 속성창에서만 재생
      </p>
      <div style={{ display:'flex', justifyContent:'center' }}>
        <svg width={svgW} height={svgH}>
          {kf && <style>{kf}</style>}
          <g transform={`translate(${cx},${cy})`}>
            <g style={innerStyle}>
              {shape === 'ellipse' || shape === 'roundrect'
                ? <ellipse rx={hw} ry={hh} fill={fill} fillOpacity={op} stroke={stroke} strokeWidth={sw} />
                : path && <path d={path} fill={(isLine || isFree) ? 'none' : fill} fillOpacity={op}
                    stroke={stroke} strokeWidth={sw} strokeOpacity={(isLine || isFree) ? op : 1}
                    strokeLinecap="round" strokeLinejoin="round" />
              }
            </g>
            {isValbar && vbRect && (<>
              <clipPath id={`${uid}_vb`}>
                {shape === 'ellipse' || shape === 'roundrect' ? <ellipse rx={hw} ry={hh} /> : <path d={path} />}
              </clipPath>
              <g clipPath={`url(#${uid}_vb)`}>
                <rect x={vbRect.x} y={vbRect.y} width={Math.max(0, vbRect.width)} height={Math.max(0, vbRect.height)}
                  fill={vbColor} style={{ filter: `drop-shadow(0 0 4px ${vbColor}99)` }} />
              </g>
              {element.animShowVal !== false && (
                <text textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight="700"
                  fill="#f8fafc" stroke="#0009" strokeWidth={3} paintOrder="stroke">{Math.round(sliderVal * 10) / 10}</text>
              )}
            </>)}
          </g>
        </svg>
      </div>
      <p style={{ fontSize:9, color:'#94a3b8', textAlign:'center', margin:'2px 0 8px' }}>{statusText}</p>
      {/* 컨트롤 */}
      {anim === 'lamp' ? (
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={() => setLampOn(false)}
            style={{ flex:1, padding:'3px 0', borderRadius:4, fontSize:10, fontWeight:700, cursor:'pointer',
              background:!lampOn?'#3f1d1d':'#1e2736', color:!lampOn?'#ef4444':'#6b7280',
              border:`1px solid ${!lampOn?'#ef4444':'#374151'}` }}>OFF</button>
          <button onClick={() => setLampOn(true)}
            style={{ flex:1, padding:'3px 0', borderRadius:4, fontSize:10, fontWeight:700, cursor:'pointer',
              background:lampOn?'#14532d':'#1e2736', color:lampOn?'#22c55e':'#6b7280',
              border:`1px solid ${lampOn?'#22c55e':'#374151'}` }}>ON</button>
        </div>
      ) : (
        <>
          <input type="range" min={minV} max={maxV} step={(maxV-minV)/100 || 1}
            value={sliderVal} onChange={e => setSliderVal(+e.target.value)}
            style={{ width:'100%', accentColor:'#f472b6' }} />
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:8, color:'#4a5568', fontFamily:'monospace' }}>
            <span>{minV}{isValbar ? '' : ' (정지)'}</span><span>{maxV}{isValbar ? '' : ' (최고속)'}</span>
          </div>
        </>
      )}
    </div>
  )
}

/* SVG 심볼 미리보기 — 고유 컨테이너 ID로 CSS 격리 */
function SvgSymbolPreview({ sym, layerBindings, tags, onSvgBind, elementId }) {
  // 컴포넌트 인스턴스별 고유 ID — CSS가 이 컨테이너 안에서만 적용됨
  const previewId = useRef(`hprev_${Math.random().toString(36).slice(2, 8)}`).current
  const [previewOn, setPreviewOn] = useState(false)
  const [sliderValues, setSliderValues] = useState({})

  const allLayers = (sym?.layers || []).map(l => {
    if (l.animType && l.animType !== 'none') return l
    const parsed = parseLayerName(l.id)
    return parsed ? { ...l, animType: parsed.animType } : l
  })
  const animLayers = allLayers.filter(l => l.animType && l.animType !== 'none')
  const setVal = (layerId, v) => setSliderValues(prev => ({ ...prev, [layerId]: v }))

  useEffect(() => {
    const init = {}
    for (const l of animLayers) init[l.id] = 50
    setSliderValues(init)
  }, [sym]) // eslint-disable-line

  // 정적 SVG — 기존 모든 애니메이션/스타일 제거 (XMLSerializer 사용 안 함)
  const staticSvg = useMemo(() => {
    if (!sym?.svgContent) return ''
    // 정규식으로 직접 제거 — XMLSerializer 재직렬화 없이 원본 문자열 유지
    return sym.svgContent
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<animate[\s\S]*?\/>/gi, '')
      .replace(/<animate[\s\S]*?<\/animate>/gi, '')
      .replace(/<animateTransform[\s\S]*?\/>/gi, '')
      .replace(/<animateTransform[\s\S]*?<\/animateTransform>/gi, '')
      .replace(/<animateMotion[\s\S]*?\/>/gi, '')
      .replace(/<animateMotion[\s\S]*?<\/animateMotion>/gi, '')
      .replace(/(<svg[^>]*)\s+width="[^"]*"/, '$1')
      .replace(/(<svg[^>]*)\s+height="[^"]*"/, '$1')
      .replace(/<svg/, '<svg width="120" height="120"')
  }, [sym])

  // 애니메이션 CSS — SVG 밖에서 React <style> 요소로 주입 (캔버스 유출 없음)
  const animCss = useMemo(() => {
    if (!previewOn || !sym?.svgContent) return ''
    let css = ''
    for (const layer of allLayers) {
      if (!layer.animType || layer.animType === 'none') continue
      const bind = layerBindings[layer.id] || {}
      const bindObj = typeof bind === 'string' ? { speed: bind } : bind
      // 미리보기에서는 실제 태그값 무시 — 슬라이더 값만 사용
      const speedPct = (sliderValues[layer.id] ?? 50) / 100
      const eid = CSS.escape(layer.id)
      const sel = `#${previewId} #${eid}`
      const kname = `hprev_${layer.id.replace(/[^a-z0-9]/gi, '_')}`

      if (layer.animType === 'rotate') {
        if (speedPct > 0.005) {
          const dur = (1 / (speedPct * 2)).toFixed(2)
          css += `@keyframes ${kname}{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`
          css += `${sel}{transform-box:fill-box;transform-origin:center;animation:${kname} ${dur}s linear infinite;}`
        }
      } else if (layer.animType === 'translate') {
        if (speedPct > 0.005) {
          const dist = Math.round(speedPct * 20)
          const dur = Math.max(0.3, 3 - speedPct * 2.5).toFixed(2)
          css += `@keyframes ${kname}{0%,100%{transform:translateX(0)}50%{transform:translateX(${dist}px)}}`
          css += `${sel}{transform-box:fill-box;transform-origin:center;animation:${kname} ${dur}s ease-in-out infinite;}`
        }
      } else if (layer.animType === 'fill') {
        const pct = Math.round((1 - speedPct) * 100)
        css += `${sel}{clip-path:inset(${pct}% 0 0 0);}`
      } else if (layer.animType === 'toggle') {
        css += `${sel}{opacity:${speedPct > 0.5 ? 1 : 0.2};}`
      }
    }
    return css
  }, [previewOn, sliderValues, layerBindings, tags, allLayers, previewId, sym]) // eslint-disable-line

  if (!sym?.svgContent) return null

  return (
    <div style={{ marginTop: 8, background: '#0a1628', border: '1px solid #a78bfa44', borderRadius: 6, padding: 10 }}>
      {/* CSS를 SVG 안이 아닌 DOM에 직접 주입 — 브라우저가 반드시 인식 */}
      {animCss && <style>{animCss}</style>}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <p style={{ fontSize: 9, color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', flex: 1 }}>
          SVG 미리보기
        </p>
        {animLayers.length > 0 && (
          <button
            onClick={() => setPreviewOn(o => !o)}
            style={{
              padding: '3px 12px', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              background: previewOn ? '#14532d' : '#1e2736',
              color: previewOn ? '#4ade80' : '#6b7280',
              border: `1px solid ${previewOn ? '#22c55e' : '#374151'}`,
              transition: 'all 0.15s',
            }}
          >
            {previewOn ? '■ OFF' : '▶ ON'}
          </button>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
        <div id={previewId}
          style={{ width: 120, height: 120, background: '#0f172a', borderRadius: 6,
            border: `1px solid ${previewOn ? '#22c55e44' : '#334155'}`,
            overflow: 'hidden', transition: 'border-color 0.2s' }}
          dangerouslySetInnerHTML={{ __html: staticSvg }} />
      </div>
      {animLayers.length === 0 && (
        <p style={{ fontSize: 9, color: '#4a5568', textAlign: 'center' }}>애니메이션 레이어가 없습니다.</p>
      )}
      {animLayers.map(layer => {
        const bind = layerBindings[layer.id] || {}
        const bindObj = typeof bind === 'string' ? { speed: bind } : bind
        const speedTag = tags.find(t => t.id === bindObj.speed)
        const speedMax = speedTag?.max ?? 100
        const speedMin = speedTag?.min ?? 0
        const curSpeed = sliderValues[layer.id] ?? 50
        const meta = ANIM_PREFIXES[layer.animType] || {}
        return (
          <div key={layer.id} style={{ marginBottom: 10, background: '#0d1117', borderRadius: 6, padding: '8px 10px', border: `1px solid ${meta.color || '#374151'}33` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 9, color: meta.color || '#94a3b8', fontWeight: 700 }}>{layer.id}</span>
              <span style={{ fontSize: 9, color: '#64748b' }}>{meta.label || layer.animType}</span>
            </div>
            {/* 속도 슬라이더 (미리보기용) */}
            <div style={{ marginBottom: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#64748b', marginBottom: 2 }}>
                <span>속도 시뮬레이션</span>
                <span style={{ fontFamily: 'monospace', color: meta.color || '#e2e8f0' }}>
                  {speedTag
                    ? `${((curSpeed / 100) * speedMax).toFixed(1)} / ${speedMax}`
                    : `${curSpeed}%`}
                </span>
              </div>
              <input type="range" min={0} max={100} step={1}
                value={curSpeed}
                onChange={e => setVal(layer.id, +e.target.value)}
                style={{ width: '100%', accentColor: meta.color || '#a78bfa' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#4a5568', fontFamily: 'monospace' }}>
                <span>0</span>
                <span>{speedTag ? `${speedMax} (max)` : '100%'}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* 요소 타입별 시각 미리보기 */
function ElementVisualPreview({ element, liveTag, sym }) {
  const type = element.type
  const val = liveTag?.value ?? 0
  const on = Number(val) === 1
  const pct = liveTag && liveTag.type !== 'BIT'
    ? Math.max(0, Math.min(1, (val - (liveTag.min ?? 0)) / ((liveTag.max ?? 100) - (liveTag.min ?? 0))))
    : 0

  if (type === 'lamp') {
    const v = element.variant || 'round'
    const fill = on ? '#22c55e' : '#374151'
    const glow = on ? { filter: 'drop-shadow(0 0 8px #22c55e)' } : {}
    return (
      <div style={{ display:'flex', justifyContent:'center', padding:'8px 0' }}>
        <svg width={80} height={56}>
          <rect x="8" y="4" width="64" height="48" rx="4" fill="#1a202c" stroke="#2d3748" strokeWidth="1" />
          {v === 'square'
            ? <rect x="31" y="11" width="18" height="18" rx="3" fill={fill} style={glow} />
            : v === 'beacon'
              ? <g><path d="M 31 31 A 9 9 0 0 1 49 31 Z" fill={fill} style={glow} /><rect x="29" y="31" width="22" height="3" rx="1" fill="#1f2937" /></g>
              : <circle cx="40" cy="22" r="10" fill={fill} style={glow} />
          }
          <text x="40" y="43" textAnchor="middle" fontSize="8" fill="#94a3b8" fontFamily="monospace">{on ? 'ON' : 'OFF'}</text>
        </svg>
      </div>
    )
  }

  if (type === 'wordlamp') {
    const dec = liveTag && liveTag.type === 'WORD' ? Math.max(0, Math.min(6, Number(liveTag.decimals) || 0)) : 0
    const raw = liveTag ? Math.round(liveTag.type === 'FLOAT' ? Number(val) : liveTag.type === 'BIT' ? (val ? 1 : 0) : Number(val) / Math.pow(10, dec)) : (element.states?.[0]?.value ?? 0)
    const states = Array.isArray(element.states) ? element.states : []
    const st = states.find(s => Number(s.value) === raw)
    const color = st?.color || element.offColor || '#374151'
    const text = st?.label ?? String(raw)
    const bits = element.showBits ? `${raw} · ${(raw < 0 ? 0 : raw).toString(2).padStart(element.bitWidth || 4, '0')}` : ''
    const v = element.variant || 'fill'
    return (
      <div style={{ display:'flex', justifyContent:'center', padding:'8px 0' }}>
        <svg width={124} height={56}>
          {v === 'round' ? (
            <g>
              <rect x="12" y="6" width="100" height="44" rx="4" fill="#141a26" stroke="#2d3748" strokeWidth="1" />
              <circle cx="62" cy="21" r="9" fill={color} style={{ filter:`drop-shadow(0 0 6px ${color})` }} />
              <text x="62" y="41" textAnchor="middle" fontSize="9" fontWeight="700" fill="#e2e8f0" fontFamily="'Malgun Gothic',sans-serif">{text}</text>
            </g>
          ) : (
            <g>
              <rect x="12" y="10" width="100" height="36" rx={v === 'pill' ? 18 : 5} fill={color} stroke="#0b1220" strokeWidth="1" style={{ filter:`drop-shadow(0 0 6px ${color}aa)` }} />
              <text x="62" y={bits ? 24 : 30} textAnchor="middle" fontSize="12" fontWeight="700" fill="#f8fafc" stroke="#0006" strokeWidth="2.5" paintOrder="stroke" fontFamily="'Malgun Gothic',sans-serif">{text}</text>
              {bits && <text x="62" y="40" textAnchor="middle" fontSize="8" fill="#f8fafccc" fontFamily="monospace">{bits}</text>}
            </g>
          )}
        </svg>
      </div>
    )
  }

  if (type === 'switch') {
    const v = element.variant || 'toggle'
    return (
      <div style={{ display:'flex', justifyContent:'center', padding:'8px 0' }}>
        <svg width={80} height={56}>
          <rect x="8" y="8" width="64" height="40" rx="4" fill="#1a202c" stroke="#2d3748" strokeWidth="1" />
          {v === 'rocker' ? (
            <g>
              <rect x="24" y="16" width="32" height="20" rx="2" fill="#0f172a" stroke="#334155" strokeWidth="1" />
              <rect x={on ? 40 : 24} y="16" width="16" height="20" rx="2"
                fill={on ? '#14532d' : '#3f1d1d'} stroke={on ? '#22c55e' : '#7f1d1d'} strokeWidth="1" />
              <text x={on ? 48 : 32} y="29" textAnchor="middle" fontSize="6" fontFamily="monospace"
                fill={on ? '#22c55e' : '#9ca3af'}>{on ? 'ON' : 'OFF'}</text>
            </g>
          ) : v === 'push' ? (
            <g>
              <circle cx="40" cy="24" r="12" fill="#1f2937" stroke="#334155" strokeWidth="1.5" />
              <circle cx="40" cy="24" r="8" fill={on ? '#22c55e' : '#4b5563'}
                style={on ? { filter:'drop-shadow(0 0 6px #22c55e)' } : {}} />
            </g>
          ) : (
            <g>
              <rect x="24" y="21" width="32" height="14" rx="7" fill={on ? '#14532d' : '#3f1d1d'} stroke={on ? '#22c55e' : '#7f1d1d'} strokeWidth="1" />
              <circle cx={on ? 49 : 31} cy="28" r="7" fill={on ? '#22c55e' : '#9ca3af'}
                style={on ? { filter:'drop-shadow(0 0 5px #22c55e)' } : {}} />
            </g>
          )}
        </svg>
      </div>
    )
  }

  if (type === 'gauge') {
    const v = element.variant || 'arc'
    // 엔지니어링 값 · 구간색 · 범위(override) 반영
    const dec = liveTag && liveTag.type === 'WORD' ? Math.max(0, Math.min(6, Number(liveTag.decimals) || 0)) : 0
    const engVal = liveTag ? (liveTag.type === 'FLOAT' ? Number(val) : liveTag.type === 'BIT' ? (val ? 1 : 0) : Number(val) / Math.pow(10, dec)) : 0
    const stops = element.animStops
    const gcolor = (Array.isArray(stops) && stops.length)
      ? (stops.find(s => s.upTo == null || engVal <= s.upTo)?.color ?? stops[stops.length - 1].color)
      : (element.gaugeColor || '#00d4ff')
    const gmin = element.gaugeMin ?? liveTag?.min ?? 0, gmax = element.gaugeMax ?? liveTag?.max ?? 100
    const gpct = gmax !== gmin ? Math.max(0, Math.min(1, (engVal - gmin) / (gmax - gmin))) : 0
    const disp = liveTag ? formatTagValue(liveTag) : '--'
    const cx = 50, cy = 42, R = 24, sw = 5
    const ARC = { arc:{A0:135,SW:270}, semi:{A0:180,SW:180}, dial:{A0:135,SW:270} }[v] || { A0:135, SW:270 }
    const arcPath = (t0, t1) => {
      const a0=(ARC.A0+t0*ARC.SW)*Math.PI/180, a1=(ARC.A0+t1*ARC.SW)*Math.PI/180
      const x0=cx+R*Math.cos(a0), y0=cy+R*Math.sin(a0), x1=cx+R*Math.cos(a1), y1=cy+R*Math.sin(a1)
      const large=Math.abs((t1-t0)*ARC.SW)>180?1:0
      return `M${x0.toFixed(1)},${y0.toFixed(1)} A${R},${R} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)}`
    }
    if (v === 'linear') {
      const bx = 12, bw = 76, byy = 34, bh = 12
      return (
        <div style={{ display:'flex', justifyContent:'center', padding:'4px 0' }}>
          <svg width={100} height={70}>
            <rect x="4" y="8" width="92" height="54" rx="4" fill="#1a202c" stroke="#2d3748" strokeWidth="1" />
            <rect x={bx} y={byy} width={bw} height={bh} rx={bh/2} fill="#0f172a" stroke="#334155" strokeWidth="1" />
            <rect x={bx} y={byy} width={Math.max(0,bw*gpct)} height={bh} rx={bh/2} fill={gcolor} style={{filter:`drop-shadow(0 0 4px ${gcolor}88)`}} />
            <text x={bx+bw} y={26} textAnchor="end" fontSize="12" fontWeight="700" fill={gcolor} fontFamily="monospace">{disp} {liveTag?.unit}</text>
          </svg>
        </div>
      )
    }
    return (
      <div style={{ display:'flex', justifyContent:'center', padding:'4px 0' }}>
        <svg width={100} height={70}>
          <circle cx={cx} cy={cy} r={R+8} fill="#1a202c" stroke="#2d3748" strokeWidth="1" />
          {v === 'ring' ? (() => {
            const C = 2*Math.PI*R
            return (<g transform={`rotate(-90 ${cx} ${cy})`}>
              <circle cx={cx} cy={cy} r={R} fill="none" stroke="#374151" strokeWidth={sw} />
              <circle cx={cx} cy={cy} r={R} fill="none" stroke={gcolor} strokeWidth={sw} strokeLinecap="round"
                strokeDasharray={`${(gpct*C).toFixed(1)} ${C.toFixed(1)}`} style={{filter:`drop-shadow(0 0 4px ${gcolor}aa)`}} />
            </g>)
          })() : (<>
            <path d={arcPath(0,1)} fill="none" stroke="#374151" strokeWidth={sw} strokeLinecap="round" />
            <path d={arcPath(0,gpct)} fill="none" stroke={gcolor} strokeWidth={sw} strokeLinecap="round" style={{filter:`drop-shadow(0 0 4px ${gcolor}aa)`}} />
            {v === 'dial' && [0,0.25,0.5,0.75,1].map(t => {
              const a=(ARC.A0+t*ARC.SW)*Math.PI/180
              return <line key={t} x1={cx+Math.cos(a)*(R-7)} y1={cy+Math.sin(a)*(R-7)} x2={cx+Math.cos(a)*(R-2)} y2={cy+Math.sin(a)*(R-2)} stroke="#475569" strokeWidth="1.5"/>
            })}
            {(() => { const a=(ARC.A0+gpct*ARC.SW)*Math.PI/180
              return <line x1={cx} y1={cy} x2={cx+(R-4)*Math.cos(a)} y2={cy+(R-4)*Math.sin(a)} stroke={gcolor} strokeWidth="2.5" strokeLinecap="round"/> })()}
            <circle cx={cx} cy={cy} r="3.5" fill={gcolor} />
          </>)}
          <text x={cx} y={v==='semi'?cy+4:(v==='ring'?cy+2:cy+15)} textAnchor="middle" fontSize="10" fontWeight="700" fill={gcolor} fontFamily="monospace">{disp}</text>
          {liveTag?.unit && <text x={cx} y={v==='semi'?cy+14:(v==='ring'?cy+13:cy+24)} textAnchor="middle" fontSize="6.5" fill="#64748b" fontFamily="monospace">{liveTag.unit}</text>}
        </svg>
      </div>
    )
  }

  if (type === 'bar') {
    const v = element.variant || 'line'
    const gmin = element.trendMin ?? liveTag?.min ?? 0, gmax = element.trendMax ?? liveTag?.max ?? 100
    const stops = element.animStops, base = element.gaugeColor || '#00d4ff'
    const pickC = val => (Array.isArray(stops) && stops.length)
      ? (stops.find(s => s.upTo == null || val <= s.upTo)?.color ?? stops[stops.length - 1].color) : base
    const sample = [0.2, 0.32, 0.28, 0.46, 0.6, 0.52, 0.68, 0.82, 0.72, 0.9]  // 예시 파형
    const Wp = 172, Hp = 50, ox = 4, oy = 10
    const xa = i => ox + (i / (sample.length - 1)) * Wp
    const ya = p => oy + (1 - p) * Hp
    const bands = []
    if (Array.isArray(stops) && stops.length) {
      let lo = gmin
      for (const s of stops) {
        const hi = s.upTo == null ? gmax : Math.min(s.upTo, gmax)
        if (hi > lo) { const pt = (hi - gmin) / ((gmax - gmin) || 1), pb = (lo - gmin) / ((gmax - gmin) || 1); bands.push({ y: ya(pt), h: ya(pb) - ya(pt), color: s.color }) }
        lo = s.upTo == null ? gmax : s.upTo; if (lo >= gmax) break
      }
    }
    const cur = liveTag ? formatTagValue(liveTag) : '--'
    const curC = pickC(gmin + pct * (gmax - gmin))
    const areaD = v === 'area'
      ? sample.map((p, i) => `${i ? 'L' : 'M'}${xa(i).toFixed(1)},${ya(p).toFixed(1)}`).join(' ') + ` L${xa(sample.length - 1).toFixed(1)},${oy + Hp} L${xa(0).toFixed(1)},${oy + Hp} Z`
      : ''
    return (
      <div style={{ display:'flex', justifyContent:'center', padding:'4px 0' }}>
        <svg width={180} height={70}>
          <rect x="1" y="1" width="178" height="68" rx="4" fill="#0f172a" stroke="#2d3748" strokeWidth="1" />
          {bands.map((b, i) => <rect key={i} x={ox} y={b.y} width={Wp} height={b.h} fill={b.color} opacity={0.12} />)}
          {areaD && <path d={areaD} fill={curC} fillOpacity={0.15} />}
          {sample.slice(1).map((p, i) => (
            <line key={i} x1={xa(i)} y1={ya(sample[i])} x2={xa(i + 1)} y2={ya(p)}
              stroke={pickC(gmin + sample[i] * (gmax - gmin))} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          <circle cx={xa(sample.length - 1)} cy={ya(sample[sample.length - 1])} r="2.4" fill={curC} style={{ filter:`drop-shadow(0 0 3px ${curC})` }} />
          <text x={ox} y={8} fontSize="8" fill="#94a3b8" fontFamily="monospace">{element.label}</text>
          <text x={ox + Wp} y={8} textAnchor="end" fontSize="9" fontWeight="700" fill={curC} fontFamily="monospace">{cur} {liveTag?.unit}</text>
        </svg>
      </div>
    )
  }

  if (type === 'numeric') {
    const v = element.variant || 'lcd'
    const panel = v === 'panel'
    const color = panel ? '#fbbf24' : '#00d4ff'
    return (
      <div style={{ display:'flex', justifyContent:'center', padding:'8px 0' }}>
        <svg width={140} height={44}>
          <rect x="4" y="4" width="132" height="36" rx={panel?1:3} fill={panel?'#0a0a0a':'#0f172a'} stroke={panel?'#52525b':'#1e2a4a'} strokeWidth={panel?2:1} />
          <text x="70" y="20" textAnchor="middle" fontSize="8" fill="#64748b" fontFamily="monospace">{element.label}</text>
          <text x="70" y="34" textAnchor="middle" fontSize="14" fill={color} fontFamily="monospace" style={{filter:`drop-shadow(0 0 4px ${color}aa)`}}>
            {liveTag ? formatTagValue(liveTag) : '--'} {liveTag?.unit}
          </text>
        </svg>
      </div>
    )
  }

  // 비트맵 심볼 ON/OFF 이미지
  if (type === 'symbol' && sym && !isSvgSymbol(sym)) {
    const href = sym.off ? (on ? sym.on : sym.off) : sym.on
    return (
      <div style={{ display:'flex', justifyContent:'center', padding:'8px 0' }}>
        <div style={{ width:80, height:80, background:'#0f172a', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center',
          border:'1px solid #334155' }}>
          {href
            ? <img src={href} alt={on?'ON':'OFF'} style={{ maxWidth:72, maxHeight:72, objectFit:'contain' }} />
            : <div style={{ width:64, height:64, background:'#1a202c', borderRadius:4, border:'1px solid #7f1d1d' }} />
          }
        </div>
      </div>
    )
  }

  return null
}

/* 공통 인풋 */
const inputCls = 'w-full text-[12px] font-mono rounded px-2.5 py-1.5 bg-[#0d1117] border border-[#374151] text-[#e2e8f0] focus:outline-none focus:border-[#3b82f6] placeholder-[#4a5568]'
const numInputCls = 'w-16 text-[11px] font-mono rounded px-1.5 py-1 bg-[#0d1117] border border-[#374151] text-[#e2e8f0] focus:outline-none focus:border-[#3b82f6]'
const selectCls = 'w-full text-[11px] font-mono rounded px-2.5 py-1.5 focus:outline-none focus:border-[#3b82f6]'

/* ── 태그 드롭존 (SVG 레이어용) — enable(BIT) + speed(FLOAT) 두 태그 ── */
function LayerDropZone({ layer, binding, tags, onSvgBind, elementId }) {
  const animType = layer.animType || parseLayerName(layer.id)?.animType
  const meta = ANIM_META[animType] || {}
  const Icon = meta.icon || Tag
  // 구버전 문자열 호환
  const bind = typeof binding === 'string' ? { speed: binding } : (binding || {})
  const enableTag = tags.find(t => t.id === bind.enable)
  const speedTag  = tags.find(t => t.id === bind.speed)
  const bitTags   = tags.filter(t => t.type === 'BIT')
  const numTags   = tags.filter(t => t.type !== 'BIT')

  return (
    <div className="rounded mb-2" style={{ border: `1px solid ${meta.color || '#374151'}44`, background: '#0a1628', overflow: 'hidden' }}>
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-2.5 py-2 select-none">
        <Icon size={11} style={{ color: meta.color, flexShrink: 0 }} />
        <span className="font-mono text-[11px] font-semibold flex-1 min-w-0 truncate" style={{ color: meta.color || '#94a3b8' }}>{layer.id}</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: `${meta.color}22`, color: meta.color || '#64748b' }}>
          {ANIM_PREFIXES[animType]?.label || animType || '?'}
        </span>
      </div>
      <div className="px-2.5 pb-2.5 space-y-2">
        {/* Enable 태그 (BIT) */}
        <div>
          <div className="text-[9px] text-[#ef4444] font-bold mb-1">▶ 작동 조건 (BIT 태그)</div>
          <select
            value={bind.enable || ''}
            onChange={e => onSvgBind(elementId, layer.id, e.target.value, 'enable')}
            style={{ width: '100%', fontSize: 10, fontFamily: 'monospace', borderRadius: 4, padding: '3px 6px',
              background: '#0d1117', border: `1px solid #ef444466`,
              color: enableTag ? '#f87171' : '#64748b', cursor: 'pointer', outline: 'none' }}
          >
            <option value="">— 없음 (항상 작동) —</option>
            {bitTags.map(t => (
              <option key={t.id} value={t.id} style={{ background: '#0d1117', color: '#e2e8f0' }}>
                {t.id}{t.desc ? '  — ' + t.desc : ''}
              </option>
            ))}
          </select>
          {enableTag && (
            <div className="text-[9px] font-mono mt-0.5" style={{ color: enableTag.value ? '#4ade80' : '#ef4444' }}>
              현재: {enableTag.value ? 'ON (작동)' : 'OFF (정지)'}
            </div>
          )}
        </div>
        {/* Speed 태그 (FLOAT/INT) */}
        <div>
          <div className="text-[9px] font-bold mb-1" style={{ color: meta.color || '#00d4ff' }}>⚡ 속도 (아날로그 태그)</div>
          <select
            value={bind.speed || ''}
            onChange={e => onSvgBind(elementId, layer.id, e.target.value, 'speed')}
            style={{ width: '100%', fontSize: 10, fontFamily: 'monospace', borderRadius: 4, padding: '3px 6px',
              background: '#0d1117', border: `1px solid ${meta.color || '#374151'}66`,
              color: speedTag ? '#4ade80' : '#64748b', cursor: 'pointer', outline: 'none' }}
          >
            <option value="">— 없음 (최대 속도) —</option>
            {numTags.map(t => (
              <option key={t.id} value={t.id} style={{ background: '#0d1117', color: '#e2e8f0' }}>
                {t.id}  [{t.type}]  {t.min ?? 0}~{t.max ?? 100}{t.desc ? '  — ' + t.desc : ''}
              </option>
            ))}
          </select>
          {speedTag && (
            <div className="text-[9px] font-mono mt-0.5 text-[#94a3b8]">
              현재: <b className="text-[#e2e8f0]">{speedTag.value}</b> / max {speedTag.max ?? 100}
              {speedTag.desc && <span className="text-[#64748b]"> · {speedTag.desc}</span>}
            </div>
          )}
        </div>
        {/* 회전방향 (rotate 타입만) */}
        {animType === 'rotate' && (
          <div>
            <div className="text-[9px] font-bold mb-1" style={{ color: '#a78bfa' }}>🔄 회전방향</div>
            <select
              value={bind.direction || 'cw'}
              onChange={e => onSvgBind(elementId, layer.id, e.target.value, 'direction')}
              style={{ width: '100%', fontSize: 10, fontFamily: 'monospace', borderRadius: 4, padding: '3px 6px',
                background: '#0d1117', border: '1px solid #a78bfa66',
                color: '#c4b5fd', cursor: 'pointer', outline: 'none' }}
            >
              <option value="cw" style={{ background: '#0d1117', color: '#e2e8f0' }}>시계방향 (CW)</option>
              <option value="ccw" style={{ background: '#0d1117', color: '#e2e8f0' }}>반시계방향 (CCW)</option>
            </select>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── 드래그 가능 모달 훅 ── */
function useDraggable(initialPos) {
  const [pos, setPos] = useState(initialPos)
  const dragState = useRef(null)

  const onMouseDown = useCallback((e) => {
    // 버튼/인풋/셀렉트 위에서는 드래그 시작 안 함
    if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return
    e.preventDefault()
    dragState.current = { startX: e.clientX - pos.x, startY: e.clientY - pos.y }

    function onMove(ev) {
      if (!dragState.current) return
      setPos({ x: ev.clientX - dragState.current.startX, y: ev.clientY - dragState.current.startY })
    }
    function onUp() {
      dragState.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [pos])

  return { pos, onMouseDown }
}

/* ── 메인 모달 ── */
export default function ElementPropertyModal({
  element, tags, bindings, svgBindings = {}, symbols = [], screens = [], recipeSets = [],
  onBind, onSvgBind, onSetVariant, onSetBehavior, onUpdateElement, onDelete,
  onClose,   // 확인 (변경 유지)
  onCancel,  // 취소 (변경 복원)
}) {
  const handleCancel = onCancel ?? onClose
  const [previewOn, setPreviewOn] = useState(false)
  if (!element) return null

  const isSymbol = element.type === 'symbol'
  const sym = isSymbol ? symbols.find(s => s.id === element.symbolId) : null
  const isSvg = isSvgSymbol(sym)

  const effectiveTagId = bindings[element.id] ?? element.tagId
  const liveTag = tags.find(t => t.id === effectiveTagId)
  const layerBindings = svgBindings[element.id] || {}

  const variants = ELEMENT_VARIANTS[element.type] || []
  const curVariant = element.variant || DEFAULT_VARIANT[element.type]
  const curBehavior = element.behavior || 'toggle'
  const role = element.role || 'switchlamp'
  const showBehavior = element.type === 'switch' || (isSymbol && !isSvg && role !== 'lamp')

  const displayValue = liveTag
    ? liveTag.type === 'BIT'
      ? (liveTag.value === 1 ? 'ON' : 'OFF')
      : liveTag.type === 'FLOAT'
      ? liveTag.value.toFixed(3)
      : liveTag.value.toString()
    : '--'

  // 화면 중앙 기준 초기 위치
  const { pos, onMouseDown } = useDraggable({ x: window.innerWidth / 2 - 280, y: window.innerHeight / 2 - 300 })

  // ESC → 취소 (변경 복원)
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') handleCancel() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])

  return (
    <div className="fixed inset-0 z-[70] pointer-events-none">
      {/* 반투명 배경 — 클릭 시 경고음 (닫히지 않음) */}
      <div className="absolute inset-0 pointer-events-auto" style={{ background: 'rgba(0,0,0,0.4)', cursor: 'not-allowed' }}
        onClick={handleCancel} />

      {/* 모달 패널 */}
      <div
        className="absolute flex flex-col bg-[#0d1117] border border-[#374151] rounded-xl shadow-2xl overflow-hidden pointer-events-auto"
        style={{
          width: 'min(560px, 94vw)',
          maxHeight: '85vh',
          left: pos.x,
          top: pos.y,
          boxShadow: '0 0 0 1px #1e40af44, 0 25px 50px rgba(0,0,0,0.7)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 드래그 헤더 */}
        <div
          className="flex items-center gap-2.5 px-4 h-13 bg-[#131a26] border-b border-[#374151] flex-shrink-0 select-none"
          style={{ cursor: 'grab', paddingTop: 10, paddingBottom: 10 }}
          onMouseDown={onMouseDown}
        >
          <Move size={13} className="text-[#4a5568] shrink-0" />
          <div className="w-5 h-5 rounded flex items-center justify-center shrink-0" style={{ background: '#1e40af33', border: '1px solid #1e40af77' }}>
            <Shapes size={11} className="text-[#60a5fa]" />
          </div>
          <span className="text-[13px] font-bold text-[#f1f5f9]">
            {ELEMENT_TYPE_LABELS[element.type] ?? element.type}
          </span>
          <span className="font-mono text-[11px] text-[#6b7280] ml-0.5">{element.id}</span>
          {isSvg && sym && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold ml-1" style={{ background: '#312e81', color: '#c4b5fd', border: '1px solid #6366f1' }}>
              SVG · {sym.name}
            </span>
          )}
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={handleCancel}
            className="ml-auto p-1.5 rounded hover:bg-[#374151] text-[#6b7280] hover:text-[#f1f5f9] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* 스크롤 바디 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">

          {/* 기본 정보 */}
          <Section title="기본 정보" icon={Move} color="#94a3b8">
            <div className="grid grid-cols-2 gap-3">
              <div>
                {isSymbol ? (
                  <>
                    <Label>심볼 이름</Label>
                    <div className={inputCls} style={{ color: '#a78bfa', background: '#0d1117' }}>
                      {sym?.name || element.symbolId || '(없음)'}
                    </div>
                  </>
                ) : element.type === 'text' ? (
                  <>
                    <Label>내용 (여러 줄 가능)</Label>
                    <textarea
                      value={element.label || ''}
                      onChange={e => onUpdateElement(element.id, { label: e.target.value })}
                      spellCheck={false}
                      rows={2}
                      className={inputCls}
                      style={{ resize: 'vertical', minHeight: 34, whiteSpace: 'pre', lineHeight: 1.3 }}
                      placeholder="텍스트 내용"
                    />
                  </>
                ) : (
                  <>
                    <Label>레이블</Label>
                    <input
                      value={element.label || ''}
                      onChange={e => onUpdateElement(element.id, { label: e.target.value })}
                      spellCheck={false}
                      className={inputCls}
                      placeholder="표시 이름"
                    />
                  </>
                )}
              </div>
              <div className="space-y-1.5 pt-0.5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-[#6b7280]">위치</span>
                  <span className="font-mono text-[11px] text-[#cbd5e1]">X:{element.x} Y:{element.y}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-[#6b7280]">유형</span>
                  <span className="text-[11px] font-semibold text-[#c4b5fd]">{ELEMENT_TYPE_LABELS[element.type] ?? element.type}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 pt-1 flex-wrap">
              <Maximize2 size={11} className="text-[#6b7280] shrink-0" />
              <span className="text-[10px] text-[#94a3b8] font-semibold">크기</span>
              <span className="text-[10px] text-[#6b7280]">폭</span>
              <NumField min={8}
                value={element.type === 'groupbox' ? (element.width || 200) : (element.w || (element.hw ? element.hw * 2 : 64))}
                onCommit={v => {
                  if (element.type === 'groupbox') onUpdateElement(element.id, { width: v, hw: v / 2 })
                  else onUpdateElement(element.id, { w: v, hw: v / 2 })
                }}
                className={numInputCls} />
              <span className="text-[10px] text-[#6b7280]">높이</span>
              <NumField min={8}
                value={element.type === 'groupbox' ? (element.height || 120) : (element.h || (element.hh ? element.hh * 2 : 44))}
                onCommit={v => {
                  if (element.type === 'groupbox') onUpdateElement(element.id, { height: v, hh: v / 2 })
                  else onUpdateElement(element.id, { h: v, hh: v / 2 })
                }}
                className={numInputCls} />
            </div>

            <div className="flex items-center gap-2.5 pt-1 flex-wrap">
              <Move size={11} className="text-[#6b7280] shrink-0" />
              <span className="text-[10px] text-[#94a3b8] font-semibold">위치</span>
              <span className="text-[10px] text-[#6b7280]">X</span>
              <NumField value={Math.round(element.x ?? 0)}
                onCommit={v => onUpdateElement(element.id, { x: Math.round(v) })}
                className={numInputCls} />
              <span className="text-[10px] text-[#6b7280]">Y</span>
              <NumField value={Math.round(element.y ?? 0)}
                onCommit={v => onUpdateElement(element.id, { y: Math.round(v) })}
                className={numInputCls} />
            </div>
          </Section>

          {/* 투명도 — 그룹박스(도형)만 */}
          {element.type === 'groupbox' && (
            <Section title="배경 투명도" icon={Move} color="#94a3b8">
              <div className="flex items-center gap-3">
                <input type="range" min={0} max={100}
                  value={Math.round((element.opacity ?? 0.1) * 100)}
                  onChange={e => onUpdateElement(element.id, { opacity: +e.target.value / 100 })}
                  style={{ flex:1, accentColor:'#00d4ff' }} />
                <span className="text-[12px] font-mono text-[#cbd5e1] w-10 text-right">
                  {Math.round((element.opacity ?? 0.1) * 100)}%
                </span>
              </div>
            </Section>
          )}

          {/* gauge 설정 — 값 범위 · 구간별 색 */}
          {element.type === 'gauge' && (
            <Section title="게이지 값 · 구간 색상" icon={Gauge} color="#f472b6">
              <p className="text-[9px] text-[#6b7280] mb-2 leading-relaxed">
                위 "스타일"에서 원형·반원·다이얼·링·사각(막대) 유형을 고르세요. 값·색은 연결된 태그에 반응합니다.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>최솟값 (0%)</Label>
                  <input type="number" value={element.gaugeMin ?? ''} placeholder="태그 최소"
                    onChange={e => onUpdateElement(element.id, { gaugeMin: e.target.value === '' ? undefined : +e.target.value })}
                    className={inputCls} />
                </div>
                <div>
                  <Label>최댓값 (100%)</Label>
                  <input type="number" value={element.gaugeMax ?? ''} placeholder="태그 최대"
                    onChange={e => onUpdateElement(element.id, { gaugeMax: e.target.value === '' ? undefined : +e.target.value })}
                    className={inputCls} />
                </div>
              </div>
              <div className="mt-2">
                <ColorPicker label="기본 색상 (구간 없을 때)"
                  value={element.gaugeColor || '#00d4ff'}
                  onChange={v => onUpdateElement(element.id, { gaugeColor: v })} />
              </div>
              <StopsEditor element={element} onUpdateElement={onUpdateElement} />
            </Section>
          )}

          {/* trend(bar) 설정 — 값 범위 · 구간색 · 기록주기 */}
          {element.type === 'bar' && (
            <Section title="트렌드 값 · 구간 색상" icon={Waves} color="#22d3ee">
              <p className="text-[9px] text-[#6b7280] mb-2 leading-relaxed">
                태그값을 시간축으로 기록하는 트렌드 그래프입니다. 위 "스타일"에서 라인·영역을 고르세요.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Y 최솟값</Label>
                  <input type="number" value={element.trendMin ?? ''} placeholder="태그 최소"
                    onChange={e => onUpdateElement(element.id, { trendMin: e.target.value === '' ? undefined : +e.target.value })}
                    className={inputCls} />
                </div>
                <div>
                  <Label>Y 최댓값</Label>
                  <input type="number" value={element.trendMax ?? ''} placeholder="태그 최대"
                    onChange={e => onUpdateElement(element.id, { trendMax: e.target.value === '' ? undefined : +e.target.value })}
                    className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <Label>기록 주기 (ms)</Label>
                  <input type="number" min={200} max={10000} step={100} value={element.trendSampleMs ?? 1000}
                    onChange={e => onUpdateElement(element.id, { trendSampleMs: Math.max(200, +e.target.value || 1000) })}
                    className={inputCls} />
                </div>
                <div>
                  <Label>표시 점 개수</Label>
                  <input type="number" min={10} max={400} step={10} value={element.trendPoints ?? 60}
                    onChange={e => onUpdateElement(element.id, { trendPoints: Math.max(10, Math.min(400, +e.target.value || 60)) })}
                    className={inputCls} />
                </div>
              </div>
              <div className="mt-2">
                <ColorPicker label="기본 색상 (구간 없을 때)"
                  value={element.gaugeColor || '#00d4ff'}
                  onChange={v => onUpdateElement(element.id, { gaugeColor: v })} />
              </div>
              <StopsEditor element={element} onUpdateElement={onUpdateElement} />
            </Section>
          )}

          {/* wordlamp 설정 — 다중 상태 (값→색·라벨) */}
          {element.type === 'wordlamp' && (
            <Section title="워드 램프 상태" icon={Power} color="#22c55e">
              <StatesEditor element={element} onUpdateElement={onUpdateElement} />
              <div className="mt-3">
                <ColorPicker label="기본 색 (일치 상태 없을 때)"
                  value={element.offColor || '#374151'}
                  onChange={v => onUpdateElement(element.id, { offColor: v })} />
              </div>
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input type="checkbox" checked={!!element.showBits}
                  onChange={e => onUpdateElement(element.id, { showBits: e.target.checked })}
                  style={{ accentColor: '#22c55e' }} />
                <span className="text-[10px] text-[#94a3b8]">값·2진수(비트) 함께 표시</span>
              </label>
              {element.showBits && (
                <div className="mt-2">
                  <Label>비트 자리수</Label>
                  <input type="number" min={1} max={16} value={element.bitWidth ?? 4}
                    onChange={e => onUpdateElement(element.id, { bitWidth: Math.max(1, Math.min(16, +e.target.value || 4)) })}
                    className={inputCls} />
                </div>
              )}
            </Section>
          )}

          {/* 레시피 표 설정 */}
          {element.type === 'recipetable' && (
            <Section title="레시피 표" icon={FlaskConical} color="#4ade80">
              <Label>표시할 레시피셋</Label>
              <select value={element.recipeSetId || ''} onChange={e => onUpdateElement(element.id, { recipeSetId: e.target.value })}
                className="w-full bg-[#1a202c] border border-[#2d3748] rounded px-2 py-1.5 text-[11px] text-[#e2e8f0] focus:outline-none focus:border-[#22c55e] mt-1">
                <option value="">(첫 번째 레시피셋)</option>
                {recipeSets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {recipeSets.length === 0 && (
                <p className="text-[9px] text-[#f59e0b] mt-1.5 leading-relaxed">⚠ 레시피셋이 없습니다. 왼쪽 프로젝트 탭 → "레시피 편집"에서 먼저 만드세요.</p>
              )}
              <div className="mt-2">
                <Label>번호 읽기/쓰기 태그 (레시피 번호 저장 워드)</Label>
                <select value={element.selectorTagId || ''} onChange={e => onUpdateElement(element.id, { selectorTagId: e.target.value })}
                  className="w-full bg-[#1a202c] border border-[#2d3748] rounded px-2 py-1.5 text-[11px] text-[#e2e8f0] focus:outline-none focus:border-[#22c55e] mt-1">
                  <option value="">(레시피셋의 선택 워드 사용)</option>
                  {tags.filter(t => t.type === 'WORD').map(t => <option key={t.id} value={t.id}>{t.id}{t.address ? ` (${t.address})` : ''}{t.desc ? ` — ${t.desc}` : ''}</option>)}
                </select>
                <p className="text-[9px] text-[#6b7280] mt-1 leading-relaxed">레시피 번호를 읽고/쓸 워드 태그. 드롭다운 선택 시 이 태그에 번호가 기록되고, 실행 시작 시 이 값을 읽어 해당 레시피를 적용합니다. (값 0 → 1)</p>
              </div>
              <div className="mt-2">
                <ColorPicker label="헤더 색상"
                  value={element.headerColor || '#1e40af'}
                  onChange={v => onUpdateElement(element.id, { headerColor: v })} />
              </div>
              <p className="text-[9px] text-[#6b7280] mt-2 leading-relaxed">
                실행(런타임) 화면에서 <b className="text-[#94a3b8]">드롭다운으로 레시피 선택 → 적용</b> 하면 해당 레시피 값이 지정 주소로 다운로드됩니다.
              </p>
            </Section>
          )}

          {/* 공통 라벨 글자 스타일 — 라벨 있는 요소 (numeric은 자체 글자크기 컨트롤 보유로 제외) */}
          {['wordlamp','gauge','bar','lamp','switch','symbol','groupbox'].includes(element.type) && (
            <LabelStyleSection element={element} onUpdateElement={onUpdateElement} />
          )}

          {/* numeric 설정 */}
          {element.type === 'numeric' && (
            <>
              <Section title="글자 크기 / 자리맞춤" icon={Move} color="#f59e0b">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>레이블 크기</Label>
                    <NumField min={5} max={40}
                      value={element.labelFontSize || 7}
                      onCommit={v => onUpdateElement(element.id, { labelFontSize: v })}
                      className={inputCls} />
                  </div>
                  <div>
                    <Label>수치 크기</Label>
                    <NumField min={6} max={80}
                      value={element.valueFontSize || 13}
                      onCommit={v => onUpdateElement(element.id, { valueFontSize: v })}
                      className={inputCls} />
                  </div>
                </div>
                <div className="mt-2">
                  <Label>수치 자리맞춤</Label>
                  <AlignButtons value={element.align} onChange={a => onUpdateElement(element.id, { align: a })} />
                </div>
              </Section>
              <Section title="박스 & 색상" icon={Move} color="#ec4899">
                {/* 박스 표시 토글 */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] text-[#94a3b8]">박스 표시</span>
                  <button onClick={() => onUpdateElement(element.id, { showBox: element.showBox === false ? true : false })}
                    className="px-4 py-1 rounded text-[10px] font-bold transition-colors"
                    style={element.showBox !== false
                      ? { background: '#1a3a00', color: '#4ade80', border: '1px solid #22c55e' }
                      : { background: '#2d1515', color: '#f87171', border: '1px solid #7f1d1d' }}>
                    {element.showBox !== false ? '표시 ✓' : '숨김'}
                  </button>
                </div>
                {element.showBox !== false && (
                  <>
                    <ColorPicker label="바탕색"
                      value={element.bgColor || '#0f172a'}
                      onChange={v => onUpdateElement(element.id, { bgColor: v })} />
                    <ColorPicker label="테두리색"
                      value={element.boxColor || '#1e2a4a'}
                      onChange={v => onUpdateElement(element.id, { boxColor: v })} />
                  </>
                )}
                <ColorPicker label="숫자 색상"
                  value={element.digitColor || '#00d4ff'}
                  onChange={v => onUpdateElement(element.id, { digitColor: v })} />
                <ColorPicker label="레이블 색상"
                  value={element.labelColor || '#64748b'}
                  onChange={v => onUpdateElement(element.id, { labelColor: v })} />
              </Section>
              <Section title="수치 형식 (PLC 정수 변환)" icon={Move} color="#06b6d4">
                <p className="text-[9px] text-[#4a9eff] mb-2">PLC 정수값 → 표시값 변환. 예) 총4자리 소숫점2 → 4050 → 40.50</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>총 자리수 (0=자동)</Label>
                    <input type="number" min={0} max={10}
                      value={element.digits ?? ''}
                      placeholder={String(liveTag?.digits ?? 0)}
                      onChange={e => onUpdateElement(element.id, { digits: e.target.value === '' ? undefined : Math.max(0, +e.target.value) })}
                      className={inputCls} />
                  </div>
                  <div>
                    <Label>소숫점 자리수</Label>
                    <input type="number" min={0} max={6}
                      value={element.decimals ?? ''}
                      placeholder={String(liveTag?.decimals ?? 0)}
                      onChange={e => onUpdateElement(element.id, { decimals: e.target.value === '' ? undefined : Math.max(0, +e.target.value) })}
                      className={inputCls} />
                  </div>
                </div>
              </Section>
              <Section title="입력 허용" icon={Move} color="#a78bfa">
                <div className="flex gap-2 mb-3">
                  {[{v:'none',l:'없음 (읽기전용)'},{v:'numeric',l:'숫자 입력'},{v:'text',l:'문자 입력'}].map(opt => (
                    <button key={opt.v} onClick={() => onUpdateElement(element.id, { inputMode: opt.v })}
                      className="flex-1 py-1.5 rounded text-[10px] font-bold transition-colors"
                      style={(element.inputMode || 'none') === opt.v
                        ? { background: '#1e1b4b', color: '#a78bfa', border: '1px solid #7c3aed' }
                        : { background: '#1a202c', color: '#6b7280', border: '1px solid #374151' }}>
                      {opt.l}
                    </button>
                  ))}
                </div>
                {(element.inputMode === 'numeric') && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>최소값</Label>
                      <NumField value={element.numMin ?? liveTag?.min ?? 0}
                        onCommit={v => onUpdateElement(element.id, { numMin: v })}
                        className={inputCls} />
                    </div>
                    <div>
                      <Label>최대값</Label>
                      <NumField value={element.numMax ?? liveTag?.max ?? 100}
                        onCommit={v => onUpdateElement(element.id, { numMax: v })}
                        className={inputCls} />
                    </div>
                  </div>
                )}
              </Section>
            </>
          )}

          {/* 텍스트 라벨 속성 */}
          {element.type === 'text' && (
            <Section title="텍스트 스타일" icon={Move} color="#f59e0b">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>글자 크기</Label>
                  <NumField min={6} max={120}
                    value={element.fontSize || 13}
                    onCommit={v => onUpdateElement(element.id, { fontSize: v })}
                    className={inputCls} />
                </div>
                <div>
                  <Label>자리맞춤</Label>
                  <AlignButtons value={element.align} onChange={a => onUpdateElement(element.id, { align: a })} />
                </div>
              </div>
              <ColorPicker label="색상"
                value={element.color || '#e2e8f0'}
                onChange={v => onUpdateElement(element.id, { color: v })} />
              <div className="mt-2">
                <Label>폰트</Label>
                <select
                  value={element.fontFamily || 'monospace'}
                  onChange={e => onUpdateElement(element.id, { fontFamily: e.target.value })}
                  className="w-full bg-[#1a202c] border border-[#2d3748] rounded px-2 py-1.5 text-[11px] text-[#e2e8f0] focus:outline-none focus:border-[#1e40af] mt-1">
                  <option value="monospace">Monospace (기본)</option>
                  <option value="'Consolas','Courier New',monospace">Consolas</option>
                  <option value="'Arial','Helvetica',sans-serif">Arial</option>
                  <option value="'Tahoma','Geneva',sans-serif">Tahoma</option>
                  <option value="'Verdana',sans-serif">Verdana</option>
                  <option value="'Georgia','Times New Roman',serif">Georgia</option>
                  <option value="'Segoe UI',sans-serif">Segoe UI</option>
                  <option value="'Malgun Gothic','맑은 고딕',sans-serif">맑은 고딕</option>
                  <option value="'NanumGothic',sans-serif">나눔고딕</option>
                </select>
              </div>
              <div className="pt-2">
                <Label>글자 스타일</Label>
                <div className="flex gap-1.5 mt-1">
                  {[
                    { k: 'bold', on: '굵게', label: 'B', style: { fontWeight: 'bold' } },
                    { k: 'italic', on: '기울임', label: 'I', style: { fontStyle: 'italic' } },
                    { k: 'underline', on: '밑줄', label: 'U', style: { textDecoration: 'underline' } },
                  ].map(o => {
                    const active = !!element[o.k]
                    return (
                      <button key={o.k} title={o.on} onClick={() => onUpdateElement(element.id, { [o.k]: !element[o.k] })}
                        className="flex-1 py-1.5 rounded text-[13px] transition-colors"
                        style={{ ...o.style,
                          ...(active
                            ? { background: '#1a3a00', color: '#4ade80', border: '1px solid #22c55e' }
                            : { background: '#1e2736', color: '#94a3b8', border: '1px solid #374151' }) }}>
                        {o.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <p className="text-[9px] text-[#6b7280] mt-2 leading-relaxed">
                💡 캔버스에서 텍스트를 <b className="text-[#94a3b8]">더블클릭</b>하면 바로 편집됩니다. 편집 중 <b className="text-[#94a3b8]">Enter=줄바꿈</b>, <b className="text-[#94a3b8]">Ctrl+Enter=완료</b>, Esc=취소.
              </p>
            </Section>
          )}

          {/* 그룹박스 속성 */}
          {element.type === 'groupbox' && (
            <Section title="그룹 박스 스타일" icon={Maximize2} color="#00e5ff">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>너비</Label>
                  <NumField min={20} value={element.width || 200}
                    onCommit={v => onUpdateElement(element.id, { width: v, hw: v / 2 })}
                    className={inputCls} />
                </div>
                <div>
                  <Label>높이</Label>
                  <NumField min={20} value={element.height || 120}
                    onCommit={v => onUpdateElement(element.id, { height: v, hh: v / 2 })}
                    className={inputCls} />
                </div>
              </div>
              {/* 모서리 스타일 */}
              <div>
                <Label>모서리 스타일</Label>
                <div className="flex gap-1.5">
                  {[{v:'sharp',l:'직각'},{v:'round',l:'둥근'},{v:'bevel',l:'입체'}].map(o => {
                    const active = (element.boxStyle || 'round') === o.v
                    return (
                      <button key={o.v} onClick={() => onUpdateElement(element.id, { boxStyle: o.v })}
                        className="flex-1 py-1.5 rounded text-[11px] font-bold transition-colors"
                        style={active
                          ? { background:'#1e3a5f', color:'#60a5fa', border:'1px solid #3b82f6' }
                          : { background:'#1a202c', color:'#64748b', border:'1px solid #374151' }}>
                        {o.l}
                      </button>
                    )
                  })}
                </div>
              </div>
              {/* 내부 표 (행·열) */}
              <div>
                <Label>내부 표 (0=없음)</Label>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#6b7280]">가로 칸</span>
                  <NumField min={0} max={20} value={element.gridRows || 0}
                    onCommit={v => onUpdateElement(element.id, { gridRows: v })} className={numInputCls} />
                  <span className="text-[10px] text-[#6b7280]">세로 칸</span>
                  <NumField min={0} max={20} value={element.gridCols || 0}
                    onCommit={v => onUpdateElement(element.id, { gridCols: v })} className={numInputCls} />
                </div>
              </div>
              {/* 표 선 색상(가로/세로 분리) · 굵기 — 표가 있을 때만 */}
              {((element.gridRows || 0) > 1 || (element.gridCols || 0) > 1) && (
                <>
                  <ColorPicker label="가로줄 색 (행 구분)"
                    value={element.gridColorH || element.gridColor || element.borderColor || '#00e5ff'}
                    onChange={v => onUpdateElement(element.id, { gridColorH: v })} />
                  <ColorPicker label="세로줄 색 (열 구분)"
                    value={element.gridColorV || element.gridColor || element.borderColor || '#00e5ff'}
                    onChange={v => onUpdateElement(element.id, { gridColorV: v })} />
                  <div>
                    <Label>선 굵기</Label>
                    <NumField min={0.3} max={5} value={element.gridWidth || 0.8}
                      onCommit={v => onUpdateElement(element.id, { gridWidth: v })} className={numInputCls} />
                  </div>
                </>
              )}
              <ColorPicker label="테두리 색상"
                value={element.borderColor || '#00e5ff'}
                onChange={v => onUpdateElement(element.id, { borderColor: v })} />
              <ColorPicker label="배경 색상"
                value={element.bgColor || '#0a1628'}
                onChange={v => onUpdateElement(element.id, { bgColor: v })} />
              <ColorPicker label="텍스트 색상"
                value={element.titleColor || '#00e5ff'}
                onChange={v => onUpdateElement(element.id, { titleColor: v })} />
            </Section>
          )}

          {/* 도형 속성 */}
          {element.type === 'shape' && (() => {
          const isLineType = ['line','line2','hline','vline','freehand'].includes(element.shape)
          return (<>
            <Section title={isLineType ? '선 스타일' : '도형 스타일'} icon={Maximize2} color="#00e5ff">
              {element.shape !== 'freehand' && (
                <div>
                  <Label>{isLineType ? '선 종류' : '도형 종류'}</Label>
                  <select value={element.shape || 'rect'}
                    onChange={e => onUpdateElement(element.id, { shape: e.target.value })}
                    className="w-full bg-[#1a202c] border border-[#2d3748] rounded px-2 py-1.5 text-[11px] text-[#e2e8f0] focus:outline-none focus:border-[#1e40af] mt-1">
                    {SHAPE_LIST.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
              )}
              {!isLineType && (
                <ColorPicker label="채우기 색상"
                  value={element.fillColor || '#1e3a5f'}
                  onChange={v => onUpdateElement(element.id, { fillColor: v })} />
              )}
              <ColorPicker label={isLineType ? '선 색상' : '테두리 색상'}
                value={element.strokeColor || '#00e5ff'}
                onChange={v => onUpdateElement(element.id, { strokeColor: v })} />
              {!isLineType && (
                <ColorPicker label="텍스트 색상"
                  value={element.textColor || '#e2e8f0'}
                  onChange={v => onUpdateElement(element.id, { textColor: v })} />
              )}
              <div>
                <Label>{isLineType ? '선 두께' : '테두리 두께'}</Label>
                <input type="number" min={0} max={40}
                  value={element.strokeWidth ?? 2}
                  onChange={e => onUpdateElement(element.id, { strokeWidth: +e.target.value })}
                  className={inputCls} />
              </div>
              <div>
                <Label>{isLineType ? '선 종류' : '테두리 종류'}</Label>
                <select value={element.lineStyle || 'solid'}
                  onChange={e => onUpdateElement(element.id, { lineStyle: e.target.value })}
                  className="w-full bg-[#1a202c] border border-[#2d3748] rounded px-2 py-1.5 text-[11px] text-[#e2e8f0] focus:outline-none focus:border-[#1e40af] mt-1">
                  {LINE_STYLE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <Label>{isLineType ? '투명도' : '채우기 투명도'}</Label>
                <div className="flex items-center gap-3 mt-1">
                  <input type="range" min={0} max={100}
                    value={Math.round((element.opacity ?? 1) * 100)}
                    onChange={e => onUpdateElement(element.id, { opacity: +e.target.value / 100 })}
                    style={{ flex:1, accentColor:'#00d4ff' }} />
                  <span className="text-[12px] font-mono text-[#cbd5e1] w-10 text-right">
                    {Math.round((element.opacity ?? 1) * 100)}%
                  </span>
                </div>
              </div>
              {!isLineType && (
                <div>
                  <Label>글자 크기</Label>
                  <input type="number" min={6} max={80}
                    value={element.fontSize || 12}
                    onChange={e => onUpdateElement(element.id, { fontSize: +e.target.value })}
                    className={inputCls} />
                </div>
              )}
            </Section>

            {/* 선/자유곡선 흐름 표시 */}
            {isLineType && (
              <Section title="흐름 표시" icon={Waves} color="#22d3ee">
                <FlowSettings element={element} tags={tags} onUpdateElement={onUpdateElement} />
              </Section>
            )}

            {/* 도형 애니메이션 (닫힌 도형만) */}
            {!isLineType && (
            <Section title="도형 애니메이션" icon={RotateCw} color="#f472b6">
              <div>
                <Label>애니메이션 종류</Label>
                <select value={element.animType || 'none'}
                  onChange={e => onUpdateElement(element.id, { animType: e.target.value })}
                  className="w-full bg-[#1a202c] border border-[#2d3748] rounded px-2 py-1.5 text-[11px] text-[#e2e8f0] focus:outline-none focus:border-[#f472b6] mt-1">
                  <option value="none">없음</option>
                  <option value="lamp">램프 (디지털 ON/OFF 색 변경)</option>
                  <option value="blink">점멸/깜빡임 (디지털 ON시 반복)</option>
                  <option value="valbar">값 막대 (아날로그 값 비례 + 구간색)</option>
                  <option value="rotate">회전 (아날로그 속도)</option>
                  <option value="move_lr">좌우 반복 이동 (아날로그 속도)</option>
                  <option value="move_rl">우좌 반복 이동 (아날로그 속도)</option>
                </select>
                <p className="text-[9px] text-[#6b7280] mt-1">
                  ⚠ 애니메이션은 아래 Tag Binding에서 태그를 연결해야 동작합니다.
                </p>
              </div>

              {/* 점멸 설정 */}
              {element.animType === 'blink' && (
                <div>
                  <Label>점멸 주기 (초)</Label>
                  <input type="number" min={0.2} max={10} step={0.1}
                    value={element.animBlinkSec ?? 1}
                    onChange={e => onUpdateElement(element.id, { animBlinkSec: +e.target.value })}
                    className={inputCls} />
                  <p className="text-[9px] text-[#6b7280] mt-1">태그값이 ON(0 아님)일 때 이 주기로 깜빡입니다.</p>
                </div>
              )}

              {/* 램프 설정 */}
              {element.animType === 'lamp' && (<>
                <ColorPicker label="ON 색상"
                  value={element.animOnColor || '#00ff00'}
                  onChange={v => onUpdateElement(element.id, { animOnColor: v })} />
                <ColorPicker label="OFF 색상"
                  value={element.animOffColor || '#ff0000'}
                  onChange={v => onUpdateElement(element.id, { animOffColor: v })} />
                {/* 램프 미리보기 */}
                <ShapeAnimPreview element={element} />
              </>)}

              {/* 값 막대 설정 (조건부 색상 막대 그래프) */}
              {element.animType === 'valbar' && (<>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>최솟값</Label>
                    <input type="number" value={element.animMinVal ?? 0}
                      onChange={e => onUpdateElement(element.id, { animMinVal: +e.target.value })}
                      className={inputCls} />
                  </div>
                  <div>
                    <Label>최댓값</Label>
                    <input type="number" value={element.animMaxVal ?? 100}
                      onChange={e => onUpdateElement(element.id, { animMaxVal: +e.target.value })}
                      className={inputCls} />
                  </div>
                </div>
                <div>
                  <Label>채우는 방향</Label>
                  <select value={element.animBarDir || 'up'}
                    onChange={e => onUpdateElement(element.id, { animBarDir: e.target.value })}
                    className="w-full bg-[#1a202c] border border-[#2d3748] rounded px-2 py-1.5 text-[11px] text-[#e2e8f0] focus:outline-none focus:border-[#f472b6] mt-1">
                    <option value="up">아래→위 (수직 상승)</option>
                    <option value="down">위→아래 (수직 하강)</option>
                    <option value="right">왼쪽→오른쪽 (수평)</option>
                    <option value="left">오른쪽→왼쪽 (수평)</option>
                  </select>
                </div>
                <StopsEditor element={element} onUpdateElement={onUpdateElement} />
                <label className="flex items-center gap-2 mt-1 cursor-pointer">
                  <input type="checkbox" checked={element.animShowVal !== false}
                    onChange={e => onUpdateElement(element.id, { animShowVal: e.target.checked })}
                    style={{ accentColor: '#f472b6' }} />
                  <span className="text-[10px] text-[#94a3b8]">막대 위에 현재값 숫자 표시</span>
                </label>
                <ShapeAnimPreview element={element} />
              </>)}

              {/* 아날로그 애니메이션 설정 */}
              {(element.animType === 'rotate' || element.animType === 'move_lr' || element.animType === 'move_rl') && (<>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>최솟값</Label>
                    <input type="number" value={element.animMinVal ?? 0}
                      onChange={e => onUpdateElement(element.id, { animMinVal: +e.target.value })}
                      className={inputCls} />
                  </div>
                  <div>
                    <Label>최댓값</Label>
                    <input type="number" value={element.animMaxVal ?? 100}
                      onChange={e => onUpdateElement(element.id, { animMaxVal: +e.target.value })}
                      className={inputCls} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>느린 속도 (초)</Label>
                    <input type="number" min={0.1} max={60} step={0.1}
                      value={element.animMinSpeed ?? 10}
                      onChange={e => onUpdateElement(element.id, { animMinSpeed: +e.target.value })}
                      className={inputCls} />
                  </div>
                  <div>
                    <Label>빠른 속도 (초)</Label>
                    <input type="number" min={0.1} max={60} step={0.1}
                      value={element.animMaxSpeed ?? 0.5}
                      onChange={e => onUpdateElement(element.id, { animMaxSpeed: +e.target.value })}
                      className={inputCls} />
                  </div>
                </div>
                <p className="text-[9px] text-[#6b7280] leading-relaxed">
                  태그값이 최솟값이면 느리게, 최댓값이면 빠르게 동작합니다.<br/>
                  태그값 = 0 이면 정지합니다.
                </p>
                {/* 아날로그 미리보기 */}
                <ShapeAnimPreview element={element} />
              </>)}
            </Section>
            )}
          </>)})()}

          {/* 연결선(와이어) 속성 */}
          {element.type === 'wire' && (
            <Section title="연결선 스타일" icon={Maximize2} color="#38bdf8">
              <ColorPicker label="선 색상"
                value={element.strokeColor || '#00e5ff'}
                onChange={v => onUpdateElement(element.id, { strokeColor: v })} />
              <div>
                <Label>선 두께</Label>
                <input type="number" min={0} max={40}
                  value={element.strokeWidth ?? 2}
                  onChange={e => onUpdateElement(element.id, { strokeWidth: +e.target.value })}
                  className={inputCls} />
              </div>
              <div>
                <Label>선 종류</Label>
                <select value={element.lineStyle || 'solid'}
                  onChange={e => onUpdateElement(element.id, { lineStyle: e.target.value })}
                  className="w-full bg-[#1a202c] border border-[#2d3748] rounded px-2 py-1.5 text-[11px] text-[#e2e8f0] focus:outline-none focus:border-[#1e40af] mt-1">
                  {LINE_STYLE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <Label>투명도</Label>
                <div className="flex items-center gap-3 mt-1">
                  <input type="range" min={0} max={100}
                    value={Math.round((element.opacity ?? 1) * 100)}
                    onChange={e => onUpdateElement(element.id, { opacity: +e.target.value / 100 })}
                    style={{ flex:1, accentColor:'#00d4ff' }} />
                  <span className="text-[12px] font-mono text-[#cbd5e1] w-10 text-right">
                    {Math.round((element.opacity ?? 1) * 100)}%
                  </span>
                </div>
              </div>
              <p className="text-[9px] text-[#6b7280] leading-relaxed pt-1">
                끝점이 심볼 포트에 연결되어 있으면 심볼을 옮길 때 함께 따라갑니다.
              </p>
            </Section>
          )}

          {/* 연결선 흐름 표시 */}
          {element.type === 'wire' && (
            <Section title="흐름 표시" icon={Waves} color="#22d3ee">
              <FlowSettings element={element} tags={tags} onUpdateElement={onUpdateElement} />
            </Section>
          )}

          {/* SVG 레이어 바인딩 */}
          {isSvg && sym && (
            <Section title={`SVG 애니메이션 레이어 (${sym.layers.length}개)`} icon={RotateCw} color="#a78bfa">
              {sym.layers.length === 0
                ? <p className="text-[11px] text-[#6b7280] italic">인식된 레이어가 없습니다.</p>
                : sym.layers.map(layer => (
                  <LayerDropZone
                    key={layer.id}
                    layer={layer}
                    binding={layerBindings[layer.id]}
                    tags={tags}
                    onSvgBind={onSvgBind}
                    elementId={element.id}
                  />
                ))
              }
              <p className="text-[9px] text-[#6b7280] pt-1">
                하단 Tag Dictionary에서 태그를 드래그해 위 칸에 놓으세요.
              </p>
              <SvgSymbolPreview sym={sym} layerBindings={layerBindings} tags={tags} onSvgBind={onSvgBind} elementId={element.id} />
            </Section>
          )}

          {/* 일반 태그 바인딩 */}
          {!isSvg && element.type !== 'groupbox' && element.type !== 'text' && element.type !== 'wire' && element.type !== 'recipetable' && (
            <Section title="Tag Binding" icon={Link2} color="#00d4ff">
              <div>
                <Label>읽기 태그</Label>
                <select
                  value={effectiveTagId}
                  onChange={e => onBind(element.id, e.target.value)}
                  className={selectCls}
                  style={{ background: '#0d1117', border: '1px solid #1e40af', color: '#38bdf8' }}
                >
                  {tags.map(t => (
                    <option key={t.id} value={t.id} style={{ background: '#0d1117', color: '#e2e8f0' }}>
                      {t.id}  [{t.type}]{t.desc ? '  — ' + t.desc : ''}
                    </option>
                  ))}
                </select>
              </div>

              {liveTag && (() => {
                // 미리보기용 가상 태그: previewOn 버튼 상태 반영
                const isBit = liveTag.type === 'BIT'
                const previewTag = isBit
                  ? { ...liveTag, value: previewOn ? 1 : 0 }
                  : { ...liveTag, value: previewOn ? liveTag.max : liveTag.min }
                const previewVal = isBit
                  ? (previewOn ? 'ON' : 'OFF')
                  : previewOn ? liveTag.max : liveTag.min
                const pct = isBit ? 0 : (previewOn ? 1 : 0)
                const barColor = pct > 0.8 ? '#ef4444' : pct > 0.6 ? '#f59e0b' : '#00d4ff'
                return (
                  <div className="rounded bg-[#0d1117] border border-[#1e3a5f] p-3">
                    {/* 헤더 + ON/OFF 버튼 */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[9px] font-bold text-[#6b7280] uppercase tracking-wide">미리보기</span>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setPreviewOn(false)}
                          style={{ padding:'2px 10px', borderRadius:4, fontSize:10, fontWeight:700, cursor:'pointer',
                            background: !previewOn ? '#3f1d1d' : '#1e2736',
                            color: !previewOn ? '#ef4444' : '#6b7280',
                            border: `1px solid ${!previewOn ? '#ef4444' : '#374151'}` }}>
                          OFF
                        </button>
                        <button onClick={() => setPreviewOn(true)}
                          style={{ padding:'2px 10px', borderRadius:4, fontSize:10, fontWeight:700, cursor:'pointer',
                            background: previewOn ? '#14532d' : '#1e2736',
                            color: previewOn ? '#22c55e' : '#6b7280',
                            border: `1px solid ${previewOn ? '#22c55e' : '#374151'}` }}>
                          ON
                        </button>
                      </div>
                    </div>
                    {/* 시각 미리보기 */}
                    <ElementVisualPreview element={element} liveTag={previewTag} sym={sym} />
                    {/* 값 표시 */}
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className="text-[22px] font-mono font-bold text-[#38bdf8]" style={{ textShadow: '0 0 12px #38bdf888' }}>
                        {previewVal}
                      </span>
                      {!isBit && liveTag.unit && <span className="text-[13px] text-[#60a5fa] font-mono">{liveTag.unit}</span>}
                    </div>
                    <div className="flex justify-between text-[10px] mt-1">
                      <span className="text-[#6b7280]">Type: <span className="text-[#c4b5fd] font-semibold">{liveTag.type}</span></span>
                      <span className="text-[#94a3b8]">{liveTag.desc}</span>
                    </div>
                    {!isBit && (
                      <div className="mt-2.5">
                        <div className="h-2 rounded-full bg-[#1e2736]">
                          <div className="h-full rounded-full transition-all duration-300"
                            style={{ width: `${pct * 100}%`, background: barColor }} />
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-[10px] text-[#6b7280] font-mono">{liveTag.min}</span>
                          <span className="text-[10px] text-[#6b7280] font-mono">{liveTag.max}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </Section>
          )}

          {/* 심볼 설정 (이미지 심볼) */}
          {isSymbol && !isSvg && (
            <Section title="심볼 설정" icon={Shapes} color="#a78bfa">
              <div>
                <Label>기능</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {SYMBOL_ROLES.map(r => (
                    <button key={r.id} onClick={() => onUpdateElement(element.id, { role: r.id })} title={r.desc}
                      className="py-2 rounded text-[11px] font-bold transition-colors"
                      style={role === r.id
                        ? { background: '#312e81', color: '#c4b5fd', border: '1px solid #6366f1' }
                        : { background: '#1e2736', color: '#94a3b8', border: '1px solid #374151' }}>
                      {r.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-[#6b7280] mt-1.5">{SYMBOL_ROLES.find(r => r.id === role)?.desc}</p>
              </div>
              {role !== 'lamp' && (
                <div>
                  <Label>쓰기(조작) 태그 — BIT</Label>
                  <select value={element.writeTagId || ''} onChange={e => onUpdateElement(element.id, { writeTagId: e.target.value })}
                    className={selectCls}
                    style={{ background: '#0d1117', border: '1px solid #1e40af', color: '#38bdf8' }}>
                    <option value="" style={{ background: '#0d1117', color: '#6b7280' }}>(없음)</option>
                    {tags.filter(t => t.type === 'BIT').map(t => (
                      <option key={t.id} value={t.id} style={{ background: '#0d1117', color: '#e2e8f0' }}>{t.id}</option>
                    ))}
                  </select>
                </div>
              )}
            </Section>
          )}

          {/* 스타일 Variant */}
          {variants.length > 0 && (
            <Section title="심볼 스타일" icon={Shapes} color="#fbbf24">
              <div className="flex flex-wrap gap-2">
                {variants.map(v => (
                  <button key={v.id} onClick={() => onSetVariant(element.id, v.id)}
                    className="px-3 py-2 rounded text-[11px] font-bold transition-colors"
                    style={curVariant === v.id
                      ? { background: '#312e81', color: '#c4b5fd', border: '1px solid #6366f1' }
                      : { background: '#1e2736', color: '#94a3b8', border: '1px solid #374151' }}>
                    {v.label}
                  </button>
                ))}
              </div>
            </Section>
          )}

          {/* 스위치 동작 */}
          {showBehavior && (
            <Section title="스위치 동작" icon={ToggleRight} color="#4ade80">
              <div className="grid grid-cols-2 gap-1.5">
                {SWITCH_BEHAVIORS.map(b => (
                  <button key={b.id} onClick={() => onSetBehavior(element.id, b.id)} title={b.desc}
                    className="py-2 rounded text-[11px] font-bold transition-colors"
                    style={curBehavior === b.id
                      ? { background: '#14532d', color: '#4ade80', border: '1px solid #22c55e' }
                      : { background: '#1e2736', color: '#94a3b8', border: '1px solid #374151' }}>
                    {b.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-[#94a3b8]">{SWITCH_BEHAVIORS.find(b => b.id === curBehavior)?.desc}</p>
            </Section>
          )}

          {/* 화면 이동 / 팝업 — switch / symbol(switchlamp) 에 표시 */}
          {(element.type === 'switch' || (element.type === 'symbol' && role !== 'lamp')) && (
            <Section title="화면 동작 (클릭 시)" icon={MonitorPlay} color="#f59e0b">
              {/* 동작 모드 선택 */}
              <div>
                <Label>동작 모드</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'none',   label: '없음',     desc: '클릭해도 화면 변경 없음' },
                    { id: 'switch', label: '화면 전환', desc: '다른 화면으로 전체 전환' },
                    { id: 'popup',  label: '팝업 열기', desc: '윈도우 화면을 팝업으로 표시' },
                  ].map(m => {
                    const cur = element.gotoScreen
                      ? (element.gotoMode === 'popup' ? 'popup' : 'switch')
                      : 'none'
                    return (
                      <button key={m.id} title={m.desc}
                        onClick={() => {
                          if (m.id === 'none') onUpdateElement(element.id, { gotoScreen: undefined, gotoMode: undefined })
                          else onUpdateElement(element.id, { gotoMode: m.id, gotoScreen: element.gotoScreen || undefined })
                        }}
                        className="py-2 rounded text-[11px] font-bold transition-colors"
                        style={cur === m.id
                          ? m.id === 'popup'
                            ? { background: '#312e81', color: '#c4b5fd', border: '1px solid #6366f1' }
                            : m.id === 'switch'
                            ? { background: '#1a3a00', color: '#4ade80', border: '1px solid #22c55e' }
                            : { background: '#1e2736', color: '#94a3b8', border: '1px solid #374151' }
                          : { background: '#1e2736', color: '#94a3b8', border: '1px solid #374151' }}>
                        {m.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 대상 화면 선택 */}
              {(element.gotoMode === 'switch' || element.gotoMode === 'popup') && (
                <div>
                  <Label>{element.gotoMode === 'popup' ? '팝업으로 열 화면 (window 타입 권장)' : '전환할 화면'}</Label>
                  <select
                    value={element.gotoScreen || ''}
                    onChange={e => onUpdateElement(element.id, { gotoScreen: e.target.value || undefined })}
                    className={selectCls}
                    style={{
                      background: '#0d1117',
                      border: `1px solid ${element.gotoMode === 'popup' ? '#4c1d95' : '#92400e'}`,
                      color: element.gotoScreen ? (element.gotoMode === 'popup' ? '#c4b5fd' : '#fbbf24') : '#6b7280',
                    }}
                  >
                    <option value="" style={{ background: '#0d1117', color: '#6b7280' }}>(화면 선택)</option>
                    {screens
                      .filter(s => s.id !== undefined && (element.gotoMode !== 'popup' || s.type === 'window' || true))
                      .map(s => (
                        <option key={s.id} value={s.id} style={{ background: '#0d1117', color: s.type === 'window' ? '#c4b5fd' : '#e2e8f0' }}>
                          {s.name} [{s.type}]{s.type === 'window' ? ' ★' : ''}
                        </option>
                      ))}
                  </select>

                  {element.gotoScreen && element.gotoMode === 'popup' && (
                    <p className="text-[10px] mt-1.5 px-2 py-1.5 rounded flex items-center gap-1.5"
                      style={{ background: '#1e1b4b', border: '1px solid #4c1d95', color: '#c4b5fd' }}>
                      <MonitorPlay size={11} />
                      클릭 시 "{screens.find(s => s.id === element.gotoScreen)?.name ?? element.gotoScreen}" 팝업 표시
                    </p>
                  )}
                  {element.gotoScreen && element.gotoMode === 'switch' && (
                    <p className="text-[10px] mt-1.5 px-2 py-1.5 rounded"
                      style={{ background: '#1a1000', border: '1px solid #92400e', color: '#fbbf24' }}>
                      ▶ 클릭 시 "{screens.find(s => s.id === element.gotoScreen)?.name ?? element.gotoScreen}" 화면으로 전환
                    </p>
                  )}
                </div>
              )}
            </Section>
          )}

          {/* 삭제 */}
          <button onClick={() => { onDelete(element.id); onClose() }}
            className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded text-[12px] font-bold transition-colors bg-[#1a0808] text-[#f87171] border border-[#7f1d1d] hover:bg-[#450a0a] hover:text-[#fca5a5]">
            <Trash2 size={14} /> 요소 삭제
          </button>
        </div>

        {/* 하단 */}
        <div className="flex items-center justify-between px-4 h-11 bg-[#0a0f1a] border-t border-[#374151] flex-shrink-0">
          <span className="text-[9px] text-[#4a5568] font-mono">헤더 드래그로 이동</span>
          <div className="flex gap-2">
            <button onClick={handleCancel}
              className="px-4 py-1.5 rounded text-[11px] font-bold transition-colors"
              style={{ background: '#1a1a2e', border: '1px solid #374151', color: '#94a3b8' }}>
              취소
            </button>
            <button onClick={onClose}
              className="px-5 py-1.5 rounded text-[11px] font-bold text-white transition-colors"
              style={{ background: '#1e40af', border: '1px solid #3b82f6' }}>
              확인
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
