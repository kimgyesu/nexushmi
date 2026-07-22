import { useState, useRef, useEffect } from 'react'
import { ToggleRight, Hash, Gauge, Activity, Sliders, ZapOff, Link2, X, Tag, Trash2, Shapes, RotateCw, ArrowUpDown, Droplets, Power } from 'lucide-react'
import { ELEMENT_TYPE_LABELS, ELEMENT_VARIANTS, DEFAULT_VARIANT, SWITCH_BEHAVIORS, SYMBOL_ROLES, SHAPE_LIST } from '../data/canvasElements'
import { isSvgSymbol } from '../data/symbols'
import { ANIM_PREFIXES } from '../utils/svgNaming'

// canvasType 이 있으면 캔버스에 드롭 가능, null 이면 준비중(드래그 불가)
const PALETTE_ITEMS = [
  { icon: Hash,        label: 'Numeric Display', color: '#f59e0b', desc: 'WORD/FLOAT',     canvasType: 'numeric' },
  { icon: Gauge,       label: 'Analog Gauge',    color: '#a78bfa', desc: '압력/속도',      canvasType: 'gauge' },
  { icon: Activity,    label: 'Trend Graph',     color: '#06b6d4', desc: '추세 그래프',    canvasType: 'bar' },
  { icon: Sliders,     label: 'Setpoint Input',  color: '#84cc16', desc: '설정값 (준비중)', canvasType: null },
  { icon: ZapOff,      label: 'Alarm Banner',    color: '#ef4444', desc: '알람 (준비중)',  canvasType: null },
]

/* ── 도형 SVG 미리보기 ── */
function ShapeIcon({ shapeId, size = 32 }) {
  const hw = size * 0.38, hh = size * 0.28
  const cx = size / 2, cy = size / 2
  const fill = '#1e3a5f', stroke = '#00e5ff'

  function path(s) {
    const w = hw, h = hh
    switch(s) {
      case 'line':          return `M${cx-w},${cy-h} L${cx+w},${cy+h}`
      case 'line2':         return `M${cx-w},${cy+h} L${cx+w},${cy-h}`
      case 'hline':         return `M${cx-w},${cy} L${cx+w},${cy}`
      case 'vline':         return `M${cx},${cy-h} L${cx},${cy+h}`
      case 'rect':          return `M${cx-w},${cy-h} h${w*2} v${h*2} h${-w*2} z`
      case 'roundrect':     return null
      case 'ellipse':       return null
      case 'triangle':      return `M${cx},${cy-h} L${cx+w},${cy+h} L${cx-w},${cy+h} z`
      case 'rtriangle':     return `M${cx-w},${cy-h} L${cx+w},${cy+h} L${cx-w},${cy+h} z`
      case 'diamond':       return `M${cx},${cy-h} L${cx+w},${cy} L${cx},${cy+h} L${cx-w},${cy} z`
      case 'pentagon': {
        return Array.from({length:5},(_,i)=>{const a=2*Math.PI*i/5-Math.PI/2;return `${i===0?'M':'L'}${(cx+w*Math.cos(a)).toFixed(1)},${(cy+h*Math.sin(a)).toFixed(1)}`}).join(' ')+'z'
      }
      case 'hexagon': {
        return Array.from({length:6},(_,i)=>{const a=Math.PI*i/3;return `${i===0?'M':'L'}${(cx+w*Math.cos(a)).toFixed(1)},${(cy+h*Math.sin(a)).toFixed(1)}`}).join(' ')+'z'
      }
      case 'parallelogram': return `M${cx-w+h*0.4},${cy-h} L${cx+w},${cy-h} L${cx+w-h*0.4},${cy+h} L${cx-w},${cy+h} z`
      case 'trapezoid':     return `M${cx-w*0.6},${cy-h} L${cx+w*0.6},${cy-h} L${cx+w},${cy+h} L${cx-w},${cy+h} z`
      case 'star4': {
        const r1=w,r2=w*0.4,pts=[]
        for(let i=0;i<8;i++){const r=i%2===0?r1:r2;const a=Math.PI*i/4-Math.PI/2;pts.push(`${i===0?'M':'L'}${(cx+r*Math.cos(a)).toFixed(1)},${(cy+r*Math.sin(a)*h/w).toFixed(1)}`)}
        return pts.join(' ')+'z'
      }
      case 'star5': {
        const r1=w,r2=w*0.4,pts=[]
        for(let i=0;i<10;i++){const r=i%2===0?r1:r2;const a=Math.PI*2*i/10-Math.PI/2;pts.push(`${i===0?'M':'L'}${(cx+r*Math.cos(a)).toFixed(1)},${(cy+r*Math.sin(a)*h/w).toFixed(1)}`)}
        return pts.join(' ')+'z'
      }
      case 'arrow_r': return `M${cx-w},${cy-h*0.4} L${cx+w*0.3},${cy-h*0.4} L${cx+w*0.3},${cy-h} L${cx+w},${cy} L${cx+w*0.3},${cy+h} L${cx+w*0.3},${cy+h*0.4} L${cx-w},${cy+h*0.4} z`
      case 'arrow_l': return `M${cx+w},${cy-h*0.4} L${cx-w*0.3},${cy-h*0.4} L${cx-w*0.3},${cy-h} L${cx-w},${cy} L${cx-w*0.3},${cy+h} L${cx-w*0.3},${cy+h*0.4} L${cx+w},${cy+h*0.4} z`
      case 'arrow_u': return `M${cx-w*0.4},${cy+h} L${cx-w*0.4},${cy-h*0.3} L${cx-w},${cy-h*0.3} L${cx},${cy-h} L${cx+w},${cy-h*0.3} L${cx+w*0.4},${cy-h*0.3} L${cx+w*0.4},${cy+h} z`
      case 'arrow_d': return `M${cx-w*0.4},${cy-h} L${cx-w*0.4},${cy+h*0.3} L${cx-w},${cy+h*0.3} L${cx},${cy+h} L${cx+w},${cy+h*0.3} L${cx+w*0.4},${cy+h*0.3} L${cx+w*0.4},${cy-h} z`
      case 'cross':   return `M${cx-w*0.3},${cy-h} h${w*0.6} v${h-h*0.3} h${w-w*0.3} v${h*0.6} h${-(w-w*0.3)} v${h-h*0.3} h${-w*0.6} v${-(h-h*0.3)} h${-(w-w*0.3)} v${-h*0.6} h${w-w*0.3} z`
      case 'callout': return `M${cx-w},${cy-h} h${w*2} v${h*1.2} h${-w*0.7} l${-w*0.3},${h*0.5} l${-w*0.2},${-h*0.5} h${-w*0.8} z`
      default: return `M${cx-w},${cy-h} h${w*2} v${h*2} h${-w*2} z`
    }
  }
  const d = path(shapeId)
  const isLine = shapeId === 'line' || shapeId === 'line2' || shapeId === 'hline' || shapeId === 'vline'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {shapeId === 'ellipse' || shapeId === 'roundrect'
        ? <ellipse cx={cx} cy={cy} rx={hw} ry={hh} fill={fill} stroke={stroke} strokeWidth="1.2" />
        : <path d={d} fill={isLine ? 'none' : fill} stroke={stroke} strokeWidth={isLine ? 1.6 : 1.2} strokeLinecap="round" />
      }
    </svg>
  )
}

function ShapeItem() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    function close(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <div
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-3 px-3 py-2.5 rounded border border-transparent transition-all duration-150 cursor-pointer hover:border-[#4a5568] hover:bg-[#2d3748]"
      >
        <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor:'#00e5ff18', border:'1px solid #00e5ff55' }}>
          <Shapes size={16} style={{ color:'#00e5ff' }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-[#e2e8f0] leading-tight">도형</p>
          <p className="text-[10px] text-[#718096] leading-tight">클릭하여 선택</p>
        </div>
        <span className="text-[#4a5568] text-[10px]">{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{
          position:'fixed', zIndex:99999,
          background:'#1a2235', border:'1px solid #00e5ff55', borderRadius:8,
          padding:10, boxShadow:'0 8px 32px rgba(0,0,0,0.8)',
          width:220,
        }}
        ref={el => {
          if (el && ref.current) {
            const r = ref.current.getBoundingClientRect()
            el.style.top = r.bottom + 4 + 'px'
            el.style.left = r.left + 'px'
          }
        }}>
          <p className="text-[9px] text-[#4a9eff] font-bold mb-2 tracking-widest uppercase">도형 선택 → 캔버스에 드래그</p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:4 }}>
            {SHAPE_LIST.map(s => (
              <div
                key={s.id}
                draggable
                title={s.label}
                onDragStart={e => {
                  e.dataTransfer.setData('application/x-hmi-type', 'shape')
                  e.dataTransfer.setData('application/x-hmi-shape', s.id)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onDragEnd={() => setOpen(false)}
                style={{
                  display:'flex', flexDirection:'column', alignItems:'center', gap:2,
                  padding:'4px 2px', borderRadius:4, cursor:'grab',
                  border:'1px solid transparent', transition:'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='#00e5ff'; e.currentTarget.style.background='#0a1f3a' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='transparent'; e.currentTarget.style.background='transparent' }}
              >
                <ShapeIcon shapeId={s.id} size={36} />
                <span style={{ fontSize:8, color:'#94a3b8', textAlign:'center', lineHeight:1.1 }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PaletteItem({ icon: Icon, label, color, desc, canvasType }) {
  const enabled = !!canvasType
  return (
    <div
      draggable={enabled}
      onDragStart={enabled
        ? e => {
            e.dataTransfer.setData('application/x-hmi-type', canvasType)
            e.dataTransfer.effectAllowed = 'copy'
          }
        : undefined}
      title={enabled ? '드래그하여 캔버스에 배치' : '아직 지원하지 않는 컴포넌트입니다'}
      className={`flex items-center gap-3 px-3 py-2.5 rounded border border-transparent transition-all duration-150 ${
        enabled
          ? 'cursor-grab active:cursor-grabbing hover:border-[#4a5568] hover:bg-[#2d3748]'
          : 'opacity-40 cursor-not-allowed'
      }`}
    >
      <div
        className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${color}18`, border: `1px solid ${color}55` }}
      >
        <Icon size={16} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-[#e2e8f0] leading-tight">{label}</p>
        <p className="text-[10px] text-[#718096] leading-tight">{desc}</p>
      </div>
    </div>
  )
}

/* ── 동작 타입별 아이콘 / 색상 ── */
const ANIM_META = {
  rotate:    { icon: RotateCw,   color: '#00d4ff', hint: 'FLOAT / INT 권장: 0~100 → 360° 회전' },
  translate: { icon: ArrowUpDown, color: '#f59e0b', hint: 'FLOAT / INT 권장: 0~100 → 직선 이동' },
  fill:      { icon: Droplets,   color: '#22c55e', hint: 'FLOAT / INT 권장: 0~100 → 채움 높이(%)' },
  toggle:    { icon: Power,      color: '#a78bfa', hint: 'BIT 권장: 0 = 숨김 / 1 = 표시' },
}

/* ── SVG 레이어 드롭존 ── */
function LayerDropZone({ layer, boundTagId, tags, onSvgBind, elementId }) {
  const [dragOver, setDragOver] = useState(false)
  const [selectedLayer, setSelectedLayer] = useState(null)
  const meta = ANIM_META[layer.animType] || {}
  const Icon = meta.icon || Tag
  const boundTag = tags.find(t => t.id === boundTagId)
  const isActive = selectedLayer === layer.id

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const tagId = e.dataTransfer.getData('application/x-hmi-tag')
    if (tagId) onSvgBind(elementId, layer.id, tagId)
  }

  return (
    <div className="space-y-1">
      <div
        className="flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer transition-all"
        style={dragOver
          ? { borderColor: meta.color, background: `${meta.color}22` }
          : { borderColor: '#2d3748', background: '#0f172a' }}
        onClick={() => setSelectedLayer(prev => prev === layer.id ? null : layer.id)}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'link'; setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Icon size={11} style={{ color: meta.color, flexShrink: 0 }} />
        <span className="font-mono text-[10px] flex-1 truncate" style={{ color: meta.color }}>{layer.id}</span>
        {boundTag ? (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#14532d] text-[#22c55e] border border-[#166534] truncate max-w-[90px]">
            {boundTag.id}
          </span>
        ) : (
          <span className="text-[9px] text-[#4a5568] italic">
            {dragOver ? '▼ 놓기' : '태그 연결 대기 중'}
          </span>
        )}
      </div>

      {/* 힌트: 클릭 시 확장 */}
      {isActive && (
        <div className="rounded px-2 py-1.5 text-[9px] leading-relaxed"
          style={{ background: `${meta.color}11`, border: `1px solid ${meta.color}33`, color: meta.color }}>
          <span className="font-bold">{ANIM_PREFIXES[layer.animType]?.label}</span>
          {' — '}{meta.hint}
          {boundTag && (
            <div className="mt-1 text-[8px] opacity-70">
              현재값: <span className="font-mono font-bold">{boundTag.value}</span>
              {' · '}{boundTag.type}{' · '}{boundTag.desc}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── SVG 심볼 레이어 인스펙터 ── */
function SvgLayerInspector({ element, sym, tags, svgBindings, onSvgBind, onClose, onDelete, onUpdateElement }) {
  const layerBindings = svgBindings?.[element.id] || {}
  const boundCount = Object.keys(layerBindings).filter(k => layerBindings[k]).length

  return (
    <div className="flex flex-col gap-0">
      <div className="flex items-center justify-between px-3 py-2 bg-[#0f1a2d] border-b border-[#2d3748]">
        <div className="flex items-center gap-1.5">
          <Shapes size={11} className="text-[#a78bfa]" />
          <span className="text-[10px] font-bold text-[#a78bfa] tracking-widest uppercase">SVG 심볼 속성</span>
        </div>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-[#2d3748] text-[#4a5568] hover:text-[#e2e8f0]">
          <X size={11} />
        </button>
      </div>

      <div className="px-3 py-2.5 space-y-3">
        {/* 심볼 정보 */}
        <div className="rounded bg-[#1a202c] border border-[#2d3748] overflow-hidden">
          <div className="px-2.5 py-1.5 bg-[#171e2b] border-b border-[#2d3748]">
            <p className="text-[9px] font-bold text-[#4a5568] tracking-widest uppercase">📦 선택된 SVG 심볼</p>
          </div>
          <div className="px-2.5 py-2 space-y-1">
            <div className="flex justify-between"><span className="text-[9px] text-[#4a5568]">심볼명</span><span className="text-[10px] font-mono text-[#e2e8f0]">{sym.name}</span></div>
            <div className="flex justify-between"><span className="text-[9px] text-[#4a5568]">레이어</span><span className="text-[10px] text-[#a78bfa]">{sym.layers.length}개 인식</span></div>
            <div className="flex justify-between"><span className="text-[9px] text-[#4a5568]">연결됨</span>
              <span className={`text-[10px] font-bold ${boundCount > 0 ? 'text-[#22c55e]' : 'text-[#4a5568]'}`}>
                {boundCount}/{sym.layers.length}
              </span>
            </div>
          </div>
        </div>

        {/* 레이어 드롭존 목록 */}
        <div className="rounded bg-[#1a202c] border border-[#2d3748] overflow-hidden">
          <div className="px-2.5 py-1.5 bg-[#171e2b] border-b border-[#2d3748]">
            <p className="text-[9px] font-bold text-[#4a5568] tracking-widest uppercase flex items-center gap-1">
              <Link2 size={9} /> 애니메이션 레이어 → 태그 연결
            </p>
          </div>
          <div className="px-2.5 py-2 space-y-2">
            {sym.layers.length === 0 ? (
              <p className="text-[9px] text-[#4a5568] italic">인식된 레이어가 없습니다.</p>
            ) : (
              sym.layers.map(layer => (
                <LayerDropZone
                  key={layer.id}
                  layer={layer}
                  boundTagId={layerBindings[layer.id]}
                  tags={tags}
                  onSvgBind={onSvgBind}
                  elementId={element.id}
                />
              ))
            )}
            <p className="text-[8px] text-[#4a5568] leading-relaxed pt-1">
              하단 Tag Dictionary에서 태그를 드래그하여 위 칸에 놓으세요.
              레이어를 클릭하면 권장 데이터 타입 안내가 표시됩니다.
            </p>
          </div>
        </div>

        {/* 크기 조정 */}
        <div className="rounded bg-[#1a202c] border border-[#2d3748] overflow-hidden">
          <div className="px-2.5 py-1.5 bg-[#171e2b] border-b border-[#2d3748]">
            <p className="text-[9px] font-bold text-[#4a5568] tracking-widest uppercase">크기</p>
          </div>
          <div className="px-2.5 py-2 flex items-center gap-1.5">
            <span className="text-[8px] text-[#4a5568]">폭</span>
            <input type="number" value={element.w || 80} min={16}
              onChange={e => onUpdateElement(element.id, { w: Math.max(16, Number(e.target.value) || 80) })}
              className="w-14 text-[10px] font-mono rounded px-1 py-0.5 bg-[#0f172a] border border-[#1e2a4a] text-[#e2e8f0] focus:outline-none" />
            <span className="text-[8px] text-[#4a5568]">높이</span>
            <input type="number" value={element.h || 80} min={16}
              onChange={e => onUpdateElement(element.id, { h: Math.max(16, Number(e.target.value) || 80) })}
              className="w-14 text-[10px] font-mono rounded px-1 py-0.5 bg-[#0f172a] border border-[#1e2a4a] text-[#e2e8f0] focus:outline-none" />
          </div>
        </div>

        <button onClick={() => onDelete(element.id)}
          className="w-full flex items-center justify-center gap-1.5 px-2 py-2 rounded text-[10px] font-bold bg-[#2a0e0e] text-[#ef4444] border border-[#7f1d1d] hover:bg-[#450a0a] transition-colors">
          <Trash2 size={11} /> 요소 삭제
        </button>
      </div>
    </div>
  )
}

/* ── 프로퍼티 인스펙터 ── */
function PropertyInspector({ element, tags, bindings, onBind, onClose, onDelete, onSetVariant, onSetBehavior, onUpdateElement }) {
  const variants = ELEMENT_VARIANTS[element.type] || []
  const curVariant = element.variant || DEFAULT_VARIANT[element.type]
  const curBehavior = element.behavior || 'toggle'
  const isSymbol = element.type === 'symbol'
  const role = element.role || 'switchlamp'
  const showBehavior = element.type === 'switch' || (isSymbol && role !== 'lamp')
  const effectiveTagId = bindings[element.id] ?? element.tagId
  const liveTag = tags.find(t => t.id === effectiveTagId)

  const displayValue = liveTag
    ? liveTag.type === 'BIT'
      ? (liveTag.value === 1 ? 'ON' : 'OFF')
      : liveTag.type === 'FLOAT'
      ? liveTag.value.toFixed(3)
      : liveTag.value.toString()
    : '--'

  const isBound = !!bindings[element.id]

  return (
    <div className="flex flex-col gap-0">
      {/* 인스펙터 헤더 */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0f1a2d] border-b border-[#2d3748]">
        <div className="flex items-center gap-1.5">
          <Tag size={11} className="text-[#00d4ff]" />
          <span className="text-[10px] font-bold text-[#00d4ff] tracking-widest uppercase">Property Inspector</span>
        </div>
        <button
          onClick={onClose}
          className="p-0.5 rounded hover:bg-[#2d3748] text-[#4a5568] hover:text-[#e2e8f0] transition-colors"
        >
          <X size={11} />
        </button>
      </div>

      <div className="px-3 py-2.5 space-y-3">
        {/* 요소 정보 */}
        <div className="rounded bg-[#1a202c] border border-[#2d3748] overflow-hidden">
          <div className="px-2.5 py-1.5 bg-[#171e2b] border-b border-[#2d3748]">
            <p className="text-[9px] font-bold text-[#4a5568] tracking-widest uppercase">Component</p>
          </div>
          <div className="px-2.5 py-2 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-[9px] text-[#4a5568]">ID</span>
              <span className="text-[10px] font-mono font-bold text-[#e2e8f0]">{element.id}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[9px] text-[#4a5568]">유형</span>
              <span className="text-[10px] font-semibold text-[#a78bfa]">
                {ELEMENT_TYPE_LABELS[element.type] ?? element.type}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[9px] text-[#4a5568]">레이블</span>
              <span className="text-[10px] font-mono text-[#718096]">{element.label}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[9px] text-[#4a5568]">위치</span>
              <span className="text-[10px] font-mono text-[#4a5568]">X:{element.x} Y:{element.y}</span>
            </div>
          </div>
        </div>

        {/* 태그 바인딩 */}
        <div className="rounded bg-[#1a202c] border border-[#2d3748] overflow-hidden">
          <div className="px-2.5 py-1.5 bg-[#171e2b] border-b border-[#2d3748] flex items-center justify-between">
            <p className="text-[9px] font-bold text-[#4a5568] tracking-widest uppercase flex items-center gap-1">
              <Link2 size={9} />
              Tag Binding
            </p>
            {isBound && (
              <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-[#14532d] text-[#22c55e] border border-[#166534]">
                바인딩됨
              </span>
            )}
          </div>
          <div className="px-2.5 py-2 space-y-2">
            <div>
              <p className="text-[9px] text-[#4a5568] mb-1">태그 선택</p>
              <select
                value={effectiveTagId}
                onChange={e => onBind(element.id, e.target.value)}
                className="w-full text-[10px] font-mono rounded px-2 py-1.5 focus:outline-none focus:ring-1"
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e40af',
                  color: '#00d4ff',
                }}
              >
                {tags.map(t => (
                  <option key={t.id} value={t.id}
                    style={{ background: '#0f172a', color: '#e2e8f0' }}>
                    {t.id}
                  </option>
                ))}
              </select>
            </div>

            {/* 라이브 프리뷰 */}
            {liveTag && (
              <div className="rounded bg-[#0f172a] border border-[#1e3a5f] p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[8px] text-[#4a5568] uppercase tracking-wide">Live Preview</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]"
                        style={{ boxShadow: '0 0 4px #22c55e' }} />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[18px] font-mono font-bold text-[#00d4ff]"
                        style={{ textShadow: '0 0 8px #00d4ff88' }}>
                    {displayValue}
                  </span>
                  {liveTag.unit && (
                    <span className="text-[10px] text-[#4a9eff] font-mono">{liveTag.unit}</span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[8px] text-[#4a5568]">
                    Type: <span className="text-[#a78bfa]">{liveTag.type}</span>
                  </span>
                  <span className="text-[8px] text-[#4a5568]">
                    {liveTag.desc}
                  </span>
                </div>
                {liveTag.type !== 'BIT' && (
                  <div className="mt-2">
                    <div className="h-1 rounded-full bg-[#2d3748]">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.round(((liveTag.value - liveTag.min) / (liveTag.max - liveTag.min)) * 100)}%`,
                          background: (() => {
                            const p = (liveTag.value - liveTag.min) / (liveTag.max - liveTag.min)
                            return p > 0.8 ? '#ef4444' : p > 0.6 ? '#f59e0b' : '#00d4ff'
                          })(),
                        }}
                      />
                    </div>
                    <div className="flex justify-between mt-0.5">
                      <span className="text-[8px] text-[#4a5568] font-mono">{liveTag.min}</span>
                      <span className="text-[8px] text-[#4a5568] font-mono">{liveTag.max}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 심볼 스타일 */}
        {variants.length > 0 && (
          <div className="rounded bg-[#1a202c] border border-[#2d3748] overflow-hidden">
            <div className="px-2.5 py-1.5 bg-[#171e2b] border-b border-[#2d3748] flex items-center gap-1">
              <Shapes size={9} className="text-[#a78bfa]" />
              <p className="text-[9px] font-bold text-[#4a5568] tracking-widest uppercase">심볼 스타일</p>
            </div>
            <div className="px-2.5 py-2 flex flex-wrap gap-1">
              {variants.map(v => {
                const active = curVariant === v.id
                return (
                  <button key={v.id} onClick={() => onSetVariant(element.id, v.id)}
                    className="px-2 py-1 rounded text-[10px] font-bold transition-colors"
                    style={active
                      ? { background: '#312e81', color: '#c4b5fd', border: '1px solid #6366f1' }
                      : { background: '#0f172a', color: '#64748b', border: '1px solid #1e2a4a' }}>
                    {v.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* 심볼 설정 (기능/크기/쓰기태그) */}
        {isSymbol && (
          <div className="rounded bg-[#1a202c] border border-[#2d3748] overflow-hidden">
            <div className="px-2.5 py-1.5 bg-[#171e2b] border-b border-[#2d3748]">
              <p className="text-[9px] font-bold text-[#4a5568] tracking-widest uppercase">심볼 설정</p>
            </div>
            <div className="px-2.5 py-2 space-y-2.5">
              {/* 기능 */}
              <div>
                <p className="text-[9px] text-[#4a5568] mb-1">기능</p>
                <div className="grid grid-cols-3 gap-1">
                  {SYMBOL_ROLES.map(r => (
                    <button key={r.id} onClick={() => onUpdateElement(element.id, { role: r.id })} title={r.desc}
                      className="px-1 py-1 rounded text-[9px] font-bold transition-colors"
                      style={role === r.id
                        ? { background: '#312e81', color: '#c4b5fd', border: '1px solid #6366f1' }
                        : { background: '#0f172a', color: '#64748b', border: '1px solid #1e2a4a' }}>
                      {r.label}
                    </button>
                  ))}
                </div>
                <p className="text-[8px] text-[#4a5568] mt-1">{SYMBOL_ROLES.find(r => r.id === role)?.desc}</p>
              </div>
              {/* 크기 */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-[#4a5568] w-7">크기</span>
                <span className="text-[8px] text-[#4a5568]">폭</span>
                <input type="number" value={element.w || 48} min={12}
                  onChange={e => onUpdateElement(element.id, { w: Math.max(12, Number(e.target.value) || 48) })}
                  className="w-12 text-[10px] font-mono rounded px-1 py-0.5 bg-[#0f172a] border border-[#1e2a4a] text-[#e2e8f0] focus:outline-none" />
                <span className="text-[8px] text-[#4a5568]">높이</span>
                <input type="number" value={element.h || 48} min={12}
                  onChange={e => onUpdateElement(element.id, { h: Math.max(12, Number(e.target.value) || 48) })}
                  className="w-12 text-[10px] font-mono rounded px-1 py-0.5 bg-[#0f172a] border border-[#1e2a4a] text-[#e2e8f0] focus:outline-none" />
              </div>
              {/* 쓰기(조작) 태그 — 스위치/스위치램프 */}
              {role !== 'lamp' && (
                <div>
                  <p className="text-[9px] text-[#4a5568] mb-1">쓰기(조작) 태그 — BIT</p>
                  <select value={element.writeTagId || ''} onChange={e => onUpdateElement(element.id, { writeTagId: e.target.value })}
                    className="w-full text-[10px] font-mono rounded px-2 py-1 bg-[#0f172a] border border-[#1e40af] text-[#00d4ff] focus:outline-none">
                    <option value="" style={{ background: '#0f172a' }}>(없음)</option>
                    {tags.filter(t => t.type === 'BIT').map(t => (
                      <option key={t.id} value={t.id} style={{ background: '#0f172a', color: '#e2e8f0' }}>{t.id}</option>
                    ))}
                  </select>
                </div>
              )}
              <p className="text-[8px] text-[#4a5568]">위 "태그 선택"은 <b>읽기(표시)</b> 태그입니다.</p>
            </div>
          </div>
        )}

        {/* 스위치 특성 (동작 방식) */}
        {showBehavior && (
          <div className="rounded bg-[#1a202c] border border-[#2d3748] overflow-hidden">
            <div className="px-2.5 py-1.5 bg-[#171e2b] border-b border-[#2d3748] flex items-center gap-1">
              <ToggleRight size={9} className="text-[#22c55e]" />
              <p className="text-[9px] font-bold text-[#4a5568] tracking-widest uppercase">스위치 특성</p>
            </div>
            <div className="px-2.5 py-2">
              <div className="grid grid-cols-2 gap-1">
                {SWITCH_BEHAVIORS.map(b => {
                  const active = curBehavior === b.id
                  return (
                    <button key={b.id} onClick={() => onSetBehavior(element.id, b.id)}
                      title={b.desc}
                      className="px-2 py-1 rounded text-[10px] font-bold transition-colors"
                      style={active
                        ? { background: '#14532d', color: '#6ee7b7', border: '1px solid #22c55e' }
                        : { background: '#0f172a', color: '#64748b', border: '1px solid #1e2a4a' }}>
                      {b.label}
                    </button>
                  )
                })}
              </div>
              <p className="text-[8px] text-[#4a5568] mt-1.5 leading-relaxed">
                {SWITCH_BEHAVIORS.find(b => b.id === curBehavior)?.desc}
              </p>
            </div>
          </div>
        )}

        {/* 요소 삭제 */}
        <button
          onClick={() => onDelete(element.id)}
          className="w-full flex items-center justify-center gap-1.5 px-2 py-2 rounded text-[10px] font-bold
                     bg-[#2a0e0e] text-[#ef4444] border border-[#7f1d1d] hover:bg-[#450a0a] transition-colors"
        >
          <Trash2 size={11} />
          요소 삭제 <span className="text-[8px] text-[#7f1d1d] font-normal">(Delete 키)</span>
        </button>
      </div>
    </div>
  )
}

/* ── 메인 팔레트 컴포넌트 ── */
export default function ComponentPalette({ selectedId, canvasElements, tags, bindings, svgBindings = {}, onBind, onSvgBind, onDeselect, onDeleteElement, onSetVariant, onSetBehavior, onUpdateElement, customSymbols = [], onOpenSymbols }) {
  const selectedElement = canvasElements.find(e => e.id === selectedId) ?? null
  const selectedSym = selectedElement?.type === 'symbol'
    ? customSymbols.find(s => s.id === selectedElement.symbolId)
    : null
  const isSelectedSvg = isSvgSymbol(selectedSym)

  return (
    <aside className="flex flex-col h-full bg-[#171e2b] border-r border-[#2d3748] overflow-hidden" style={{ width: 240 }}>
      {/* 팔레트 헤더 */}
      <div className="px-4 py-3 border-b border-[#2d3748] flex-shrink-0">
        <p className="text-[10px] font-bold text-[#4a9eff] tracking-widest uppercase">Component Palette</p>
        <p className="text-[9px] text-[#4a5568] mt-0.5">드래그하여 캔버스에 배치</p>
      </div>

      {/* 스크롤 영역 */}
      <div className="flex-1 overflow-y-auto">
        {/* 팔레트 아이템들 */}
        <div className="px-3 py-2">
          <p className="text-[9px] font-bold text-[#4a5568] tracking-widest uppercase mb-1">CONTROL</p>
          <div className="space-y-0.5">
            {PALETTE_ITEMS.slice(0, 4).map(item => (
              <PaletteItem key={item.label} {...item} />
            ))}
          </div>
        </div>

        <div className="mx-3 border-t border-[#2d3748]" />

        <div className="px-3 py-2">
          <p className="text-[9px] font-bold text-[#4a5568] tracking-widest uppercase mb-1">DISPLAY</p>
          <div className="space-y-0.5">
            {PALETTE_ITEMS.slice(4).map(item => (
              <PaletteItem key={item.label} {...item} />
            ))}
            <ShapeItem />
          </div>
        </div>

        <div className="mx-3 border-t border-[#2d3748]" />

        {/* 내 심볼 (커스텀 부품) */}
        <div className="px-3 py-2">
          <div className="flex items-center mb-1">
            <p className="text-[9px] font-bold text-[#a78bfa] tracking-widest uppercase">내 심볼</p>
            <button onClick={onOpenSymbols} title="심볼 추가/관리 (이미지 업로드)"
              className="ml-auto flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] text-[#c4b5fd] border border-[#4c1d95] hover:bg-[#2d1b4e] transition-colors">
              <Shapes size={9} /> 추가/관리
            </button>
          </div>
          {customSymbols.length === 0 ? (
            <p className="text-[9px] text-[#4a5568] py-1">직접 만든 아이콘을 등록해 끌어다 쓰세요.</p>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {customSymbols.map(s => (
                <div key={s.id} draggable
                  onDragStart={e => { e.dataTransfer.setData('application/x-hmi-symbol', s.id); e.dataTransfer.effectAllowed = 'copy' }}
                  title={`${s.name} — 끌어서 배치`}
                  className="flex flex-col items-center gap-0.5 p-1 rounded border border-transparent hover:border-[#4a5568] hover:bg-[#2d3748] cursor-grab active:cursor-grabbing">
                  {isSvgSymbol(s)
                    ? <div className="w-9 h-9 rounded bg-[#0f172a] overflow-hidden flex items-center justify-center"
                        dangerouslySetInnerHTML={{ __html: s.svgContent }} />
                    : <img src={s.on} alt={s.name} className="w-9 h-9 object-contain rounded bg-[#0f172a]" />}
                  <span className="text-[8px] text-[#94a3b8] truncate w-full text-center">{s.name}</span>
                  {isSvgSymbol(s) && <span className="text-[7px] text-[#4a5568]">SVG</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 선택된 요소 표시 (속성 편집은 더블클릭으로) */}
        {selectedElement && (
          <div className="mx-3 mb-2">
            <div className="rounded border border-[#00d4ff33] bg-[#0f1a2d] px-2.5 py-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00d4ff]" style={{ boxShadow: '0 0 4px #00d4ff' }} />
              <span className="text-[9px] text-[#00d4ff] font-mono flex-1 truncate">{selectedElement.id}</span>
              <span className="text-[8px] text-[#4a5568]">더블클릭 → 속성</span>
            </div>
          </div>
        )}
      </div>

      {/* 하단 프로젝트 정보 (선택 없을 때만 표시) */}
      {!selectedElement && (
        <div className="px-4 py-3 border-t border-[#2d3748] flex-shrink-0">
          <p className="text-[9px] text-[#4a5568] leading-relaxed">
            프로젝트: <span className="text-[#718096]">PLANT_A_LINE1</span><br />
            PLC: <span className="text-[#22c55e]">● ONLINE</span><br />
            스캔: <span className="text-[#718096]">10ms</span>
          </p>
        </div>
      )}
    </aside>
  )
}
