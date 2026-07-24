import { useState, useRef, useEffect, useCallback } from 'react'
import {
  ChevronRight, ChevronDown, Monitor, Layers, LayoutTemplate,
  AppWindow, Plus, Trash2, Pencil, Check, X,
  Settings, Package, Hash, Gauge, Activity, Bell,
  FolderOpen, Folder, FilePlus, Copy, Save, Cpu, Maximize2, Tag, Type, RectangleHorizontal, Shapes,
  Server, Globe, HardDrive, Usb, Wifi, Database, Share2, FlaskConical, Clock,
} from 'lucide-react'
import { SCREEN_TYPES, makeScreen, RESOLUTION_PRESETS } from '../data/project'
import { playBeep } from '../utils/beep'
import { isSvgSymbol } from '../data/symbols'
import { SHAPE_LIST } from '../data/canvasElements'
import { PANEL_STYLE_LIST } from '../data/panelStyles'

/* ── 화면 타입 메타 ── */
const TYPE_META = {
  master: { icon: LayoutTemplate, color: '#60a5fa' },
  base:   { icon: Monitor,        color: '#e2e8f0' },
  window: { icon: AppWindow,      color: '#a78bfa' },
  frame:  { icon: Layers,         color: '#f59e0b' },
}

/* ── 배경색 프리셋 ── */
const BG_PRESETS = [
  '#0d1117','#111827','#1a2233','#1e293b','#0f172a',
  '#14213d','#1a1a2e','#0a0e1a','#16213e','#1b2838',
  '#172554','#1e1b4b','#4a1942','#431407','#14532d',
  '#2d2d2d','#3d2b1f','#1f2937','#292524','#1c1917',
]

/* 컨텍스트 메뉴 위치 보정 — 화면 밖으로 넘치면 위/왼쪽으로 뒤집어 배치 */
function menuPos(x, y, w, h) {
  const vw = window.innerWidth, vh = window.innerHeight, PAD = 8
  const left = (x + w > vw - PAD) ? Math.max(PAD, x - w) : x
  const maxH = Math.min(h, vh - PAD * 2)
  const top = (y + maxH > vh - PAD) ? Math.max(PAD, vh - PAD - maxH) : y
  return { position: 'fixed', left, top }
}

/* ════════════════════════════════════════════
   컨텍스트 메뉴
════════════════════════════════════════════ */
function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    setTimeout(() => {
      window.addEventListener('mousedown', fn)
      window.addEventListener('contextmenu', fn)
    }, 50)
    return () => { window.removeEventListener('mousedown', fn); window.removeEventListener('contextmenu', fn) }
  }, [onClose])

  const left = Math.min(x, window.innerWidth - 210)
  const top  = Math.min(y, window.innerHeight - items.length * 34 - 20)

  return (
    <div ref={ref}
      className="fixed z-[200] rounded-lg overflow-hidden shadow-2xl border border-[#374151] py-1"
      style={{ left, top, background: '#1e2736', minWidth: 188 }}
      onContextMenu={e => e.preventDefault()}>
      {items.map((item, i) =>
        item === 'divider'
          ? <div key={i} className="h-px bg-[#374151] my-1" />
          : (
            <button key={i} disabled={item.disabled}
              onClick={() => { item.action(); onClose() }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-left transition-colors"
              style={item.disabled ? { color:'#4a5568', cursor:'not-allowed' } : { color: item.danger ? '#f87171' : '#e2e8f0' }}
              onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = item.danger ? '#450a0a' : '#2d3748' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              {item.icon && <item.icon size={12} style={{ color: item.disabled ? '#4a5568' : item.iconColor ?? (item.danger ? '#f87171' : '#94a3b8') }} />}
              <span>{item.label}</span>
            </button>
          )
      )}
    </div>
  )
}

/* ════════════════════════════════════════════
   화면 속성 다이얼로그
════════════════════════════════════════════ */
function ScreenPropDialog({ title, screen, typeId, onConfirm, onClose }) {
  const [name, setName] = useState(screen?.name ?? '')
  const [type, setType] = useState(screen?.type ?? typeId ?? 'base')
  const [bgColor, setBgColor] = useState(screen?.bgColor ?? '#1a2233')
  const [bgImage, setBgImage] = useState(screen?.bgImage ?? '')
  const [bgFit, setBgFit] = useState(screen?.bgFit ?? 'slice')
  const [bgDim, setBgDim] = useState(screen?.bgDim ?? 0)
  const [bgLocked, setBgLocked] = useState(screen?.bgLocked !== false) // 기본 고정
  const inputRef = useRef(null)
  const fileRef = useRef(null)
  useEffect(() => { inputRef.current?.select() }, [])

  // 이미지 업로드 → 자동 축소(최대 1600px)·압축 후 data URI
  const pickBg = e => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f || !f.type.startsWith('image/')) return
    const img = new Image()
    img.onload = () => {
      const maxW = 1600, sc = Math.min(1, maxW / img.width)
      const cv = document.createElement('canvas')
      cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc)
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height)
      setBgImage(cv.toDataURL('image/jpeg', 0.82))
      URL.revokeObjectURL(img.src)
    }
    img.src = URL.createObjectURL(f)
  }
  const submit = () => { if (!name.trim()) return; onConfirm({ name: name.trim(), type, bgColor, bgImage, bgFit, bgDim, bgLocked }) }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center" style={{ background:'rgba(0,0,0,0.6)', cursor:'not-allowed' }}
      onClick={e => { if (e.target === e.currentTarget) playBeep() }}>
      <div className="rounded-xl border border-[#374151] shadow-2xl overflow-hidden" style={{ background:'#0d1117', width:360, cursor:'default' }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#374151]" style={{ background:'#131a26' }}>
          <FilePlus size={13} className="text-[#60a5fa]" />
          <span className="text-[13px] font-bold text-[#f1f5f9]">{title}</span>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-[#374151] text-[#6b7280] hover:text-white"><X size={13} /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <p className="text-[10px] font-bold text-[#94a3b8] mb-1.5">화면 이름</p>
            <input ref={inputRef} value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose() }}
              className="w-full text-[12px] font-mono rounded px-2.5 py-2 bg-[#0a0f1a] border border-[#374151] text-[#e2e8f0] focus:outline-none focus:border-[#3b82f6]"
              placeholder="예: 1-메인화면" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-[#94a3b8] mb-1.5">화면 타입</p>
            <div className="grid grid-cols-2 gap-1.5">
              {SCREEN_TYPES.map(t => {
                const meta = TYPE_META[t.id]; const Icon = meta.icon
                return (
                  <button key={t.id} onClick={() => setType(t.id)}
                    className="flex items-center gap-2 px-2.5 py-2 rounded text-[11px] font-semibold transition-colors"
                    style={type === t.id
                      ? { background:'#1e3a5f', color:'#60a5fa', border:'1px solid #3b82f6' }
                      : { background:'#1a2233', color:'#94a3b8', border:'1px solid #374151' }}>
                    <Icon size={11} style={{ color: type === t.id ? '#60a5fa' : meta.color }} />{t.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-[#94a3b8] mb-1.5">배경색</p>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded border border-[#374151] shrink-0" style={{ background: bgColor }} />
              <input type="text" value={bgColor} onChange={e => setBgColor(e.target.value)}
                className="flex-1 text-[11px] font-mono rounded px-2 py-1.5 bg-[#0a0f1a] border border-[#374151] text-[#e2e8f0] focus:outline-none focus:border-[#3b82f6]" />
              <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)}
                className="w-8 h-8 rounded border border-[#374151] cursor-pointer bg-[#0a0f1a] p-0.5" />
            </div>
            <div className="grid grid-cols-10 gap-1">
              {BG_PRESETS.map(c => (
                <button key={c} onClick={() => setBgColor(c)}
                  className="w-6 h-6 rounded border-2 transition-all"
                  style={{ background:c, borderColor: bgColor===c ? '#60a5fa' : '#374151', boxShadow: bgColor===c ? '0 0 6px #60a5fa88' : 'none' }} />
              ))}
            </div>
          </div>
          {/* 배경 이미지 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-bold text-[#94a3b8]">배경 이미지</p>
              <button onClick={() => setBgLocked(v => !v)}
                className="text-[9px] px-2 py-0.5 rounded font-bold transition-colors"
                style={bgLocked ? { background:'#1a2233', color:'#94a3b8', border:'1px solid #374151' } : { background:'#14532d', color:'#4ade80', border:'1px solid #22c55e' }}>
                {bgLocked ? '🔒 고정' : '🔓 해제(편집)'}
              </button>
            </div>
            {bgImage
              ? <div className="rounded border border-[#374151] overflow-hidden mb-2" style={{ height:56, background:'#000' }}>
                  <img src={bgImage} alt="" style={{ width:'100%', height:'100%', objectFit: bgFit==='stretch'?'fill':bgFit==='meet'?'contain':'cover', opacity: 1 - bgDim/100 }} />
                </div>
              : <p className="text-[9px] text-[#4a5568] mb-2">배경 이미지 없음</p>}
            {bgLocked
              ? (bgImage && <p className="text-[9px] text-[#64748b]">🔒 고정됨 — "해제"를 눌러 편집/교체/제거</p>)
              : (<>
                  <input ref={fileRef} type="file" accept="image/*" onChange={pickBg} style={{ display:'none' }} />
                  <div className="flex gap-1.5 mb-2">
                    <button onClick={() => fileRef.current?.click()} className="flex-1 py-1.5 rounded text-[10px] font-bold" style={{ background:'#1e3a5f', color:'#60a5fa', border:'1px solid #3b82f6' }}>이미지 선택</button>
                    {bgImage && <button onClick={() => setBgImage('')} className="px-3 py-1.5 rounded text-[10px] font-bold" style={{ background:'#2a0e0e', color:'#f87171', border:'1px solid #7f1d1d' }}>제거</button>}
                  </div>
                  {bgImage && (<>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-[9px] text-[#64748b] w-10 shrink-0">표시</span>
                      <select value={bgFit} onChange={e => setBgFit(e.target.value)} className="flex-1 text-[10px] rounded px-2 py-1 bg-[#0a0f1a] border border-[#374151] text-[#e2e8f0] focus:outline-none focus:border-[#3b82f6]">
                        <option value="slice">채움 (꽉차게)</option>
                        <option value="meet">맞춤 (전체보기)</option>
                        <option value="stretch">늘림</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] text-[#64748b] w-10 shrink-0">어둡게</span>
                      <input type="range" min={0} max={80} value={bgDim} onChange={e => setBgDim(+e.target.value)} style={{ flex:1, accentColor:'#3b82f6' }} />
                      <span className="text-[9px] text-[#94a3b8] w-8 text-right">{bgDim}%</span>
                    </div>
                  </>)}
                </>)}
          </div>
          <div className="rounded border border-[#374151] overflow-hidden relative" style={{ height:46 }}>
            {bgImage && <img src={bgImage} alt="" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit: bgFit==='stretch'?'fill':bgFit==='meet'?'contain':'cover' }} />}
            <div className="flex items-center justify-center h-full relative" style={{ background: bgImage ? `rgba(0,0,0,${bgDim/100})` : bgColor }}>
              <span className="text-[11px] font-bold text-white opacity-60">미리보기 · {name || '화면 이름'}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 px-4 py-3 border-t border-[#374151]" style={{ background:'#0a0f1a' }}>
          <button onClick={onClose}
            className="flex-1 py-2 rounded text-[11px] font-bold text-[#94a3b8] border border-[#374151] hover:bg-[#1e2736] transition-colors">취소</button>
          <button onClick={submit}
            disabled={!name.trim()}
            className="flex-1 py-2 rounded text-[11px] font-bold text-white transition-colors"
            style={{ background: name.trim() ? '#1e40af' : '#374151', border:'1px solid #3b82f6' }}>확인</button>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════
   해상도 설정 다이얼로그
════════════════════════════════════════════ */
function ResolutionDialog({ resolution, onConfirm, onClose }) {
  const [w, setW] = useState(String(resolution?.w ?? 1280))
  const [h, setH] = useState(String(resolution?.h ?? 800))
  const [orient, setOrient] = useState('landscape')
  const [fit, setFit] = useState(resolution?.fit ?? 'meet')

  const applyPreset = (p) => { setW(String(p.w)); setH(String(p.h)) }
  const swap = () => { const tmp = w; setW(h); setH(tmp) }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center" style={{ background:'rgba(0,0,0,0.65)', cursor:'not-allowed' }}
      onClick={e => { if (e.target === e.currentTarget) playBeep() }}>
      <div className="rounded-xl border border-[#374151] shadow-2xl overflow-hidden" style={{ background:'#0d1117', width:420, cursor:'default' }}>

        {/* 헤더 */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#374151]" style={{ background:'#131a26' }}>
          <Maximize2 size={13} className="text-[#60a5fa]" />
          <span className="text-[13px] font-bold text-[#f1f5f9]">해상도 설정</span>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-[#374151] text-[#6b7280] hover:text-white"><X size={13} /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* 프리셋 목록 */}
          <div>
            <p className="text-[10px] font-bold text-[#94a3b8] mb-2">프리셋</p>
            <div className="space-y-1 max-h-[180px] overflow-y-auto pr-1">
              {RESOLUTION_PRESETS.map(p => {
                const isActive = String(p.w) === w && String(p.h) === h
                return (
                  <button key={p.label} onClick={() => applyPreset(p)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded text-left transition-colors"
                    style={isActive
                      ? { background:'#1e3a5f', border:'1px solid #3b82f6' }
                      : { background:'#1a2233', border:'1px solid #374151' }}>
                    {/* 비율 시각화 */}
                    <div className="flex items-center justify-center shrink-0" style={{ width:36, height:24 }}>
                      <div className="border-2 rounded-sm" style={{
                        width: Math.round(36 * Math.min(p.w, p.h * 2) / Math.max(p.w, p.h * 2 / (p.w / p.h))),
                        height: Math.round(24 * Math.min(p.h, p.w / 2) / Math.max(p.h, p.w / 2 * (p.h / p.w))),
                        maxWidth: 36, maxHeight: 24,
                        borderColor: isActive ? '#3b82f6' : '#374151',
                        background: isActive ? '#1e3a5f' : '#1a2233',
                      }} />
                    </div>
                    <span className="flex-1 text-[11px] font-mono" style={{ color: isActive ? '#60a5fa' : '#cbd5e1' }}>{p.label}</span>
                    {isActive && <Check size={11} className="text-[#22c55e] shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 직접 입력 */}
          <div>
            <p className="text-[10px] font-bold text-[#94a3b8] mb-2">직접 입력</p>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <p className="text-[9px] text-[#6b7280] mb-1">가로 (px)</p>
                <input type="number" value={w} onChange={e => setW(e.target.value)} min={320} max={3840}
                  className="w-full text-[12px] font-mono rounded px-2.5 py-2 bg-[#0a0f1a] border border-[#374151] text-[#e2e8f0] focus:outline-none focus:border-[#3b82f6]" />
              </div>
              <button onClick={swap} title="가로/세로 전환"
                className="mt-4 p-2 rounded border border-[#374151] hover:bg-[#2d3748] text-[#94a3b8] transition-colors">
                ⇄
              </button>
              <div className="flex-1">
                <p className="text-[9px] text-[#6b7280] mb-1">세로 (px)</p>
                <input type="number" value={h} onChange={e => setH(e.target.value)} min={240} max={2160}
                  className="w-full text-[12px] font-mono rounded px-2.5 py-2 bg-[#0a0f1a] border border-[#374151] text-[#e2e8f0] focus:outline-none focus:border-[#3b82f6]" />
              </div>
            </div>
          </div>

          {/* 현재 선택 미리보기 */}
          <div className="rounded border border-[#2d3748] p-3 flex items-center gap-4" style={{ background:'#0a0f1a' }}>
            <div style={{
              width: Math.min(120, Math.round(120 * (+w / +h) / Math.max(1, +w / +h))),
              height: Math.min(68, Math.round(68 * (+h / +w) / Math.max(1, +h / +w))),
              maxWidth: 120, maxHeight: 68, minWidth: 40, minHeight: 24,
              border: '2px solid #3b82f6', borderRadius: 3,
              background: '#1a2233', flexShrink: 0,
            }} />
            <div className="space-y-1">
              <p className="text-[16px] font-mono font-bold text-[#e2e8f0]">{w} <span className="text-[#4a5568]">×</span> {h}</p>
              <p className="text-[10px] text-[#6b7280]">
                비율: {(() => { const g = (a,b) => b ? g(b, a%b) : a; const d = g(+w,+h); return `${+w/d} : ${+h/d}` })()}
              </p>
            </div>
          </div>

          {/* 화면 맞춤 방식 — 실제 설치 화면 비율이 다를 때 */}
          <div>
            <p className="text-[10px] font-bold text-[#94a3b8] mb-2">화면 맞춤 (설치 화면 비율이 다를 때)</p>
            <div className="flex gap-2">
              {[
                { v:'meet',    title:'비율 유지', desc:'여백 생김·왜곡 없음' },
                { v:'stretch', title:'꽉 채우기', desc:'늘림·왜곡 가능' },
              ].map(o => {
                const active = fit === o.v
                return (
                  <button key={o.v} onClick={() => setFit(o.v)}
                    className="flex-1 px-3 py-2 rounded text-left transition-colors"
                    style={active
                      ? { background:'#1e3a5f', border:'1px solid #3b82f6' }
                      : { background:'#1a2233', border:'1px solid #374151' }}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold" style={{ color: active ? '#60a5fa' : '#cbd5e1' }}>{o.title}</span>
                      {active && <Check size={10} className="text-[#22c55e]" />}
                    </div>
                    <p className="text-[9px] text-[#6b7280] mt-0.5">{o.desc}</p>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-[#374151]" style={{ background:'#0a0f1a' }}>
          <button onClick={onClose} className="flex-1 py-2 rounded text-[11px] font-bold text-[#94a3b8] border border-[#374151] hover:bg-[#1e2736] transition-colors">취소</button>
          <button onClick={() => { const nw = Math.max(320, +w||1280); const nh = Math.max(240, +h||800); onConfirm({ w:nw, h:nh, fit }) }}
            className="flex-1 py-2 rounded text-[11px] font-bold text-white transition-colors"
            style={{ background:'#1e40af', border:'1px solid #3b82f6' }}>적용</button>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════
   프로젝트 탭 — 트리 구조
════════════════════════════════════════════ */
function TreeItem({ icon: Icon, iconColor='#94a3b8', label, value, children, onClick, depth=0, defaultOpen=true }) {
  const [open, setOpen] = useState(defaultOpen)
  const hasChildren = !!children

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-1.5 rounded cursor-pointer hover:bg-[#1a2233] transition-colors select-none group"
        style={{ paddingLeft: 8 + depth * 14, paddingRight: 8 }}
        onClick={() => { if (hasChildren) setOpen(o => !o); onClick?.() }}
      >
        {hasChildren
          ? (open ? <ChevronDown size={9} className="text-[#4a5568] shrink-0" /> : <ChevronRight size={9} className="text-[#4a5568] shrink-0" />)
          : <span className="w-[9px] shrink-0" />
        }
        {Icon && <Icon size={12} style={{ color: iconColor, flexShrink: 0 }} />}
        <span className="flex-1 text-[11px] text-[#cbd5e1] truncate">{label}</span>
        {value && <span className="text-[10px] font-mono text-[#6b7280] shrink-0 ml-1">{value}</span>}
      </div>
      {hasChildren && open && <div>{children}</div>}
    </div>
  )
}

function ActionRow({ icon: Icon, iconColor='#60a5fa', label, badge, onClick, danger=false }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 rounded transition-colors text-left"
      style={{ background:'transparent' }}
      onMouseEnter={e => e.currentTarget.style.background = danger ? '#450a0a' : '#1e2736'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {Icon && <Icon size={13} style={{ color: danger ? '#f87171' : iconColor, flexShrink:0 }} />}
      <span className="flex-1 text-[12px] font-semibold" style={{ color: danger ? '#f87171' : '#e2e8f0' }}>{label}</span>
      {badge && <span className="text-[10px] px-2 py-0.5 rounded font-bold" style={{ background:'#1e3a5f', color:'#60a5fa', border:'1px solid #1e40af' }}>{badge}</span>}
    </button>
  )
}

function Divider({ label }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 mt-1">
      <div className="h-px flex-1 bg-[#2d3748]" />
      {label && <span className="text-[9px] text-[#4a5568] uppercase tracking-wider shrink-0">{label}</span>}
      <div className="h-px flex-1 bg-[#2d3748]" />
    </div>
  )
}

function ProjectTab({ projectName, resolution, devices, tags, screens, onChangeResolution, onOpenDevices, onOpenRegistry, onRename, onSave, onShowResolutionDialog, onOpenRecipe, recipeCount = 0, onOpenSchedule }) {
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(projectName)

  return (
    <div className="flex-1 overflow-y-auto py-1">
      {/* 프로젝트 이름 헤더 */}
      <div className="px-3 py-2.5 border-b border-[#2d3748] mb-1" style={{ background:'#0a0f1a' }}>
        <p className="text-[9px] text-[#4a5568] uppercase tracking-widest mb-1">현재 프로젝트</p>
        {editingName ? (
          <div className="flex items-center gap-1">
            <input autoFocus value={nameVal} onChange={e => setNameVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { onRename(nameVal); setEditingName(false) } if (e.key === 'Escape') setEditingName(false) }}
              className="flex-1 text-[12px] font-mono rounded px-2 py-1 bg-[#0d1117] border border-[#3b82f6] text-[#e2e8f0] focus:outline-none" />
            <button onClick={() => { onRename(nameVal); setEditingName(false) }} className="text-[#4ade80]"><Check size={12} /></button>
            <button onClick={() => setEditingName(false)} className="text-[#6b7280]"><X size={12} /></button>
          </div>
        ) : (
          <div className="flex items-center gap-2 group">
            <span className="flex-1 text-[13px] font-bold font-mono text-[#e2e8f0] truncate">{projectName}</span>
            <button onClick={() => { setNameVal(projectName); setEditingName(true) }}
              className="hidden group-hover:flex p-0.5 rounded hover:bg-[#374151] text-[#4a5568]"><Pencil size={10} /></button>
          </div>
        )}
      </div>

      {/* ── 1. 해상도 ── */}
      <Divider label="화면" />
      <ActionRow
        icon={Maximize2}
        iconColor="#00d4ff"
        label="해상도 변경 및 설정"
        badge={`${resolution?.w ?? 1280} × ${resolution?.h ?? 800}`}
        onClick={onShowResolutionDialog}
      />

      <TreeItem icon={Monitor} iconColor="#4a5568" label="화면 목록" value={`${screens.length}개`} depth={0} defaultOpen={false}>
        {screens.map(s => {
          const meta = TYPE_META[s.type] ?? TYPE_META.base
          const Icon = meta.icon
          return (
            <TreeItem key={s.id} icon={Icon} iconColor={meta.color} label={s.name} depth={1} defaultOpen={false}>
              <TreeItem icon={null} label="배경색" value={s.bgColor ?? '#1a2233'} depth={2} />
              <TreeItem icon={null} label="요소 수" value={`${s.elements?.length ?? 0}개`} depth={2} />
            </TreeItem>
          )
        })}
      </TreeItem>

      {/* ── 2. 디바이스 ── */}
      <Divider label="디바이스" />
      <ActionRow
        icon={Cpu}
        iconColor="#60a5fa"
        label="디바이스 설정"
        badge={`${devices.length}`}
        onClick={onOpenDevices}
      />

      <TreeItem icon={Server} iconColor="#4a5568" label="등록 디바이스" value={`${devices.length}개`} depth={0} defaultOpen={devices.length > 0}>
        {devices.map((d, i) => (
          <TreeItem key={i} icon={Globe} iconColor="#60a5fa" label={d.name} value={d.type ?? ''} depth={1} />
        ))}
        {devices.length === 0 && (
          <div className="px-4 py-1.5 text-[10px] text-[#4a5568] italic">등록된 디바이스 없음</div>
        )}
      </TreeItem>

      {/* ── 3. 태그 ── */}
      <Divider label="태그" />
      <ActionRow
        icon={Tag}
        iconColor="#a78bfa"
        label="태그 등록 / 편집"
        badge={`${tags.length}`}
        onClick={onOpenRegistry}
      />

      {/* ── 4. 레시피 · 스케줄 ── */}
      <Divider label="레시피 · 스케줄" />
      <ActionRow
        icon={FlaskConical}
        iconColor="#4ade80"
        label="레시피 편집"
        badge={`${recipeCount}`}
        onClick={onOpenRecipe}
      />
      <ActionRow
        icon={Clock}
        iconColor="#fbbf24"
        label="스케줄 (준비중)"
        onClick={onOpenSchedule}
      />

      {/* ── 5. 프로젝트 이름 ── */}
      <Divider label="프로젝트" />
      <ActionRow
        icon={Pencil}
        iconColor="#f59e0b"
        label="프로젝트 이름 변경"
        onClick={() => { setNameVal(projectName); setEditingName(true); window.scrollTo(0,0) }}
      />

      {/* ── 5. 저장 ── */}
      <Divider />
      <ActionRow
        icon={Save}
        iconColor="#22c55e"
        label="프로젝트 저장"
        onClick={onSave}
      />
    </div>
  )
}

/* ════════════════════════════════════════════
   화면 트리
════════════════════════════════════════════ */
function ScreenRow({ screen, isActive, depth, onSelect, onContextMenu }) {
  const meta = TYPE_META[screen.type] ?? TYPE_META.base
  const Icon = meta.icon
  return (
    <div
      className="flex items-center gap-1.5 py-[5px] rounded cursor-pointer select-none transition-colors group"
      style={{
        paddingLeft: 8 + depth * 14, paddingRight: 8,
        background: isActive ? '#1e3a5f' : 'transparent',
        borderLeft: isActive ? '2px solid #3b82f6' : '2px solid transparent',
      }}
      onClick={() => onSelect(screen.id)}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, screen) }}
    >
      <div className="w-2.5 h-2.5 rounded-sm border border-[#374151] shrink-0" style={{ background: screen.bgColor ?? '#1a2233' }} />
      <Icon size={11} style={{ color: isActive ? '#60a5fa' : meta.color, flexShrink: 0 }} />
      <span className={`flex-1 min-w-0 truncate text-[11px] ${isActive ? 'text-[#e2e8f0] font-bold' : 'text-[#94a3b8]'}`}>
        {screen.name}
      </span>
    </div>
  )
}

function ScreenGroup({ typeId, label, screens, activeScreenId, onSelect, onContextMenu, onGroupContextMenu }) {
  const [open, setOpen] = useState(true)
  const meta = TYPE_META[typeId] ?? TYPE_META.base
  const TypeIcon = meta.icon
  const groupScreens = screens.filter(s => s.type === typeId)

  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-[#1a2233] transition-colors select-none"
        onClick={() => setOpen(o => !o)}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onGroupContextMenu(e, typeId) }}>
        {open ? <ChevronDown size={10} className="text-[#4a5568]" /> : <ChevronRight size={10} className="text-[#4a5568]" />}
        <TypeIcon size={11} style={{ color: meta.color }} />
        <span className="flex-1 text-[11px] font-bold text-[#cbd5e1]">{label}</span>
        <span className="text-[9px] text-[#4a5568]">{groupScreens.length}</span>
      </div>
      {open && groupScreens.map(s => (
        <ScreenRow key={s.id} screen={s} isActive={s.id === activeScreenId} depth={1}
          onSelect={onSelect} onContextMenu={onContextMenu} />
      ))}
    </div>
  )
}

/* ════════════════════════════════════════════
   오브젝트 팔레트
════════════════════════════════════════════ */
const PALETTE_ITEMS = [
  { type:'numeric',  label:'Numeric',      color:'#f59e0b', icon: Hash },
  { type:'wordlamp', label:'워드 램프',     color:'#22c55e', icon: Layers },
  { type:'gauge',    label:'Gauge',        color:'#a78bfa', icon: Gauge },
  { type:'bar',      label:'트렌드',        color:'#06b6d4', icon: Activity },
  { type:'recipetable', label:'레시피 표',  color:'#4ade80', icon: FlaskConical },
  { type:'alarmtable', label:'알람 목록',   color:'#ef4444', icon: Bell },
  { type:'text',     label:'텍스트 라벨',  color:'#e2e8f0', icon: Type },
  { type:'groupbox', label:'그룹 박스',    color:'#00e5ff', icon: RectangleHorizontal },
  { type:'shape',    label:'도형',         color:'#f472b6', icon: Shapes },
  { type:'__line__', label:'선 그리기',    color:'#c4b5fd', icon: Pencil },
  { type:'__wire__', label:'연결선',        color:'#38bdf8', icon: Share2 },
]

function ShapePopup({ color, onClose }) {
  return (
    <div style={{
      position:'fixed', zIndex:99999, background:'#1a2235',
      border:'1px solid #f472b644', borderRadius:8, padding:10,
      boxShadow:'0 8px 32px rgba(0,0,0,0.8)', width:220,
    }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[9px] text-[#f472b6] font-bold tracking-widest uppercase">도형 선택 → 드래그</p>
        <button onClick={onClose} className="text-[#4a5568] hover:text-white"><X size={11}/></button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:4 }}>
        {SHAPE_LIST.map(s => (
          <div key={s.id} draggable title={s.label}
            onDragStart={e => {
              e.dataTransfer.setData('application/x-hmi-type', 'shape')
              e.dataTransfer.setData('application/x-hmi-shape', s.id)
              e.dataTransfer.effectAllowed = 'copy'
            }}
            onDragEnd={() => onClose()}
            style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2,
              padding:'4px 2px', borderRadius:4, cursor:'grab', border:'1px solid transparent', transition:'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor='#f472b6'; e.currentTarget.style.background='#2d1a2e' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor='transparent'; e.currentTarget.style.background='transparent' }}>
            <svg width={34} height={26} viewBox="0 0 34 26">
              {(() => {
                const hw=13, hh=9, cx=17, cy=13
                const pts = (fn) => Array.from({length:fn===5?5:6},(_,i)=>{
                  const a=2*Math.PI*i/(fn===5?5:6)-(fn===5?Math.PI/2:0)
                  return `${i===0?'M':'L'}${(cx+hw*Math.cos(a)).toFixed(1)},${(cy+hh*Math.sin(a)).toFixed(1)}`
                }).join(' ')+'z'
                const f='#1e3a5f', st='#f472b6'
                switch(s.id) {
                  case 'ellipse': case 'roundrect': return <ellipse cx={cx} cy={cy} rx={hw} ry={hh} fill={f} stroke={st} strokeWidth="1.2"/>
                  case 'triangle': return <path d={`M${cx},${cy-hh} L${cx+hw},${cy+hh} L${cx-hw},${cy+hh} z`} fill={f} stroke={st} strokeWidth="1.2"/>
                  case 'rtriangle': return <path d={`M${cx-hw},${cy-hh} L${cx+hw},${cy+hh} L${cx-hw},${cy+hh} z`} fill={f} stroke={st} strokeWidth="1.2"/>
                  case 'diamond': return <path d={`M${cx},${cy-hh} L${cx+hw},${cy} L${cx},${cy+hh} L${cx-hw},${cy} z`} fill={f} stroke={st} strokeWidth="1.2"/>
                  case 'pentagon': return <path d={pts(5)} fill={f} stroke={st} strokeWidth="1.2"/>
                  case 'hexagon': return <path d={pts(6)} fill={f} stroke={st} strokeWidth="1.2"/>
                  case 'parallelogram': return <path d={`M${cx-hw+hh*0.4},${cy-hh} L${cx+hw},${cy-hh} L${cx+hw-hh*0.4},${cy+hh} L${cx-hw},${cy+hh} z`} fill={f} stroke={st} strokeWidth="1.2"/>
                  case 'trapezoid': return <path d={`M${cx-hw*0.6},${cy-hh} L${cx+hw*0.6},${cy-hh} L${cx+hw},${cy+hh} L${cx-hw},${cy+hh} z`} fill={f} stroke={st} strokeWidth="1.2"/>
                  case 'arrow_r': return <path d={`M${cx-hw},${cy-hh*0.4} L${cx+hw*0.3},${cy-hh*0.4} L${cx+hw*0.3},${cy-hh} L${cx+hw},${cy} L${cx+hw*0.3},${cy+hh} L${cx+hw*0.3},${cy+hh*0.4} L${cx-hw},${cy+hh*0.4} z`} fill={f} stroke={st} strokeWidth="1.2"/>
                  case 'arrow_l': return <path d={`M${cx+hw},${cy-hh*0.4} L${cx-hw*0.3},${cy-hh*0.4} L${cx-hw*0.3},${cy-hh} L${cx-hw},${cy} L${cx-hw*0.3},${cy+hh} L${cx-hw*0.3},${cy+hh*0.4} L${cx+hw},${cy+hh*0.4} z`} fill={f} stroke={st} strokeWidth="1.2"/>
                  case 'arrow_u': return <path d={`M${cx-hw*0.4},${cy+hh} L${cx-hw*0.4},${cy-hh*0.3} L${cx-hw},${cy-hh*0.3} L${cx},${cy-hh} L${cx+hw},${cy-hh*0.3} L${cx+hw*0.4},${cy-hh*0.3} L${cx+hw*0.4},${cy+hh} z`} fill={f} stroke={st} strokeWidth="1.2"/>
                  case 'arrow_d': return <path d={`M${cx-hw*0.4},${cy-hh} L${cx-hw*0.4},${cy+hh*0.3} L${cx-hw},${cy+hh*0.3} L${cx},${cy+hh} L${cx+hw},${cy+hh*0.3} L${cx+hw*0.4},${cy+hh*0.3} L${cx+hw*0.4},${cy-hh} z`} fill={f} stroke={st} strokeWidth="1.2"/>
                  case 'star4': {
                    const r1=hw,r2=hw*0.4,ps=Array.from({length:8},(_,i)=>{const r=i%2===0?r1:r2;const a=Math.PI*i/4-Math.PI/2;return `${i===0?'M':'L'}${(cx+r*Math.cos(a)).toFixed(1)},${(cy+r*Math.sin(a)*hh/hw).toFixed(1)}`}).join(' ')+'z'
                    return <path d={ps} fill={f} stroke={st} strokeWidth="1.2"/>
                  }
                  case 'star5': {
                    const r1=hw,r2=hw*0.4,ps=Array.from({length:10},(_,i)=>{const r=i%2===0?r1:r2;const a=Math.PI*2*i/10-Math.PI/2;return `${i===0?'M':'L'}${(cx+r*Math.cos(a)).toFixed(1)},${(cy+r*Math.sin(a)*hh/hw).toFixed(1)}`}).join(' ')+'z'
                    return <path d={ps} fill={f} stroke={st} strokeWidth="1.2"/>
                  }
                  case 'cross': return <path d={`M${cx-hw*0.3},${cy-hh} h${hw*0.6} v${hh-hh*0.3} h${hw-hw*0.3} v${hh*0.6} h${-(hw-hw*0.3)} v${hh-hh*0.3} h${-hw*0.6} v${-(hh-hh*0.3)} h${-(hw-hw*0.3)} v${-hh*0.6} h${hw-hw*0.3} z`} fill={f} stroke={st} strokeWidth="1.2"/>
                  case 'callout': return <path d={`M${cx-hw},${cy-hh} h${hw*2} v${hh*1.2} h${-hw*0.7} l${-hw*0.3},${hh*0.5} l${-hw*0.2},${-hh*0.5} h${-hw*0.8} z`} fill={f} stroke={st} strokeWidth="1.2"/>
                  default: return <rect x={cx-hw} y={cy-hh} width={hw*2} height={hh*2} fill={f} stroke={st} strokeWidth="1.2"/>
                }
              })()}
            </svg>
            <span style={{ fontSize:8, color:'#94a3b8', textAlign:'center', lineHeight:1.1 }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* 그룹박스 드롭다운 — 빈 그룹박스 + 스타일 패널(샘플 포함) */
function GroupboxPopup({ onClose }) {
  return (
    <div style={{
      position:'fixed', zIndex:99999, background:'#1a2235',
      border:'1px solid #00e5ff44', borderRadius:8, padding:10,
      boxShadow:'0 8px 32px rgba(0,0,0,0.8)', width:210,
    }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[9px] text-[#00e5ff] font-bold tracking-widest uppercase">그룹박스 / 패널 → 드래그</p>
        <button onClick={onClose} className="text-[#4a5568] hover:text-white"><X size={11}/></button>
      </div>
      {/* 빈 그룹박스 — 모서리 스타일 3종 */}
      <div className="grid grid-cols-3 gap-1 mb-2">
        {[
          { v:'sharp', l:'직각', box:{ borderRadius:0, border:'1.5px solid #00e5ff', background:'rgba(0,229,255,0.05)' } },
          { v:'round', l:'둥근', box:{ borderRadius:4, border:'1.5px solid #00e5ff', background:'rgba(0,229,255,0.05)' } },
          { v:'bevel', l:'입체', box:{ borderRadius:3, border:'1.5px solid #00e5ff', background:'linear-gradient(180deg,#35455e,#0e1826)', boxShadow:'inset 1px 1px 0 #ffffff30, inset -1px -1px 0 #00000060' } },
        ].map(o => (
          <div key={o.v} draggable title={`${o.l} 그룹박스 — 끌어서 배치`}
            onDragStart={e => { e.dataTransfer.setData('application/x-hmi-type','groupbox'); e.dataTransfer.setData('application/x-hmi-boxstyle',o.v); e.dataTransfer.effectAllowed='copy' }}
            onDragEnd={onClose}
            className="flex flex-col items-center gap-1 p-1.5 rounded border border-transparent hover:border-[#00e5ff] hover:bg-[#0a1f2e] cursor-grab active:cursor-grabbing select-none">
            <span style={{ width:30, height:20, flexShrink:0, ...o.box }} />
            <span className="text-[9px] text-[#cbd5e1]">{o.l}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-[#2d3748] my-1" />
      <p className="text-[8px] text-[#4a5568] px-0.5 pb-1 pt-0.5">스타일 패널 (샘플 포함)</p>
      <div className="grid grid-cols-2 gap-1">
        {PANEL_STYLE_LIST.map(st => (
          <div key={st.key} draggable title={`${st.name} 패널 — 끌어서 배치`}
            onDragStart={e => { e.dataTransfer.setData('application/x-hmi-panel', st.key); e.dataTransfer.effectAllowed='copy' }}
            onDragEnd={onClose}
            className="flex items-center gap-1.5 p-1.5 rounded border border-transparent hover:border-[#4a5568] hover:bg-[#1a2233] cursor-grab active:cursor-grabbing select-none">
            <span style={{ width:14, height:14, borderRadius:3, background: st.groupbox.bgColor, border:`1.5px solid ${st.accent}`, flexShrink:0 }} />
            <span className="text-[10px] text-[#cbd5e1] truncate">{st.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ObjectsTab({ customSymbols, onOpenSymbols, onDeleteSymbol, onSetSymbolCategory, symbolParts = [], onAddSymbolPart, onDeleteSymbolPart, onStartLineDraw, onStartWireDraw }) {
  const [shapeOpen, setShapeOpen] = useState(false)
  const [groupboxOpen, setGroupboxOpen] = useState(false)
  const groupboxRef = useRef(null)
  const shapeRef = useRef(null)
  const [ctxMenu, setCtxMenu] = useState(null) // { x, y, sym }
  const [collapsedParts, setCollapsedParts] = useState(() => new Set())
  const [dragOverPart, setDragOverPart] = useState(null)   // 심볼 드래그로 이동 중인 대상 파트
  const [headerCtx, setHeaderCtx] = useState(null)         // 파트 헤더 우클릭 { x, y, part }
  const togglePart = (name) => setCollapsedParts(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })

  // 파트(분류)별 그룹핑 — 심볼의 category + 빈 파트(symbolParts) 합집합, '기타'는 맨 뒤
  const grouped = {}
  for (const s of customSymbols) { const c = s.category || '기타'; (grouped[c] ||= []).push(s) }
  const partNames = [...new Set([...symbolParts, ...Object.keys(grouped)])]
    .sort((a, b) => (a === '기타') - (b === '기타') || a.localeCompare(b))
  // 파트 전체를 다른 이름으로 (기존 파트명이면 합쳐짐)
  const renamePart = (from, to) => {
    const t = String(to || '').trim().slice(0, 20)
    if (!t || t === from) return
    ;(grouped[from] || []).forEach(s => onSetSymbolCategory?.(s.id, t))
  }
  // 심볼을 파트 헤더에 드롭 → 그 파트로 이동
  const handlePartDrop = (e, part) => {
    e.preventDefault(); setDragOverPart(null)
    const id = e.dataTransfer.getData('application/x-hmi-symbol')
    if (id) onSetSymbolCategory?.(id, part)
  }
  useEffect(() => {
    if (!shapeOpen) return
    function close(e) { if (shapeRef.current && !shapeRef.current.contains(e.target)) setShapeOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [shapeOpen])
  useEffect(() => {
    if (!groupboxOpen) return
    function close(e) { if (groupboxRef.current && !groupboxRef.current.contains(e.target)) setGroupboxOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [groupboxOpen])

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-1">
      <p className="text-[9px] font-bold text-[#4a5568] tracking-widest uppercase px-1 pb-1">기본 컴포넌트</p>
      {PALETTE_ITEMS.map(item => {
        const Icon = item.icon
        if (item.type === 'shape') {
          return (
            <div key="shape" ref={shapeRef} style={{ position:'relative' }}>
              <div onClick={() => setShapeOpen(o => !o)}
                className="flex items-center gap-2 px-2 py-2 rounded border border-transparent hover:border-[#374151] hover:bg-[#1a2233] cursor-pointer transition-colors">
                <div className="w-7 h-7 rounded flex items-center justify-center shrink-0"
                  style={{ background:`${item.color}18`, border:`1px solid ${item.color}44` }}>
                  <Icon size={14} style={{ color: item.color }} />
                </div>
                <p className="text-[11px] font-semibold text-[#cbd5e1]">{item.label}</p>
                <span className="ml-auto text-[#4a5568] text-[10px]">{shapeOpen?'▲':'▼'}</span>
              </div>
              {shapeOpen && (
                <div style={{ position:'absolute', left:'100%', top:0, marginLeft:4 }}>
                  <ShapePopup color={item.color} onClose={() => setShapeOpen(false)} />
                </div>
              )}
            </div>
          )
        }
        if (item.type === '__line__' || item.type === '__wire__') {
          const isWire = item.type === '__wire__'
          return (
            <div key={item.type} onClick={() => (isWire ? onStartWireDraw : onStartLineDraw)?.()}
              className="flex items-center gap-2 px-2 py-2 rounded border border-transparent hover:border-[#374151] hover:bg-[#1a2233] cursor-pointer transition-colors">
              <div className="w-7 h-7 rounded flex items-center justify-center shrink-0"
                style={{ background:`${item.color}18`, border:`1px solid ${item.color}44` }}>
                <Icon size={14} style={{ color: item.color }} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-[#cbd5e1]">{item.label}</p>
                <p className="text-[9px] text-[#4a5568] leading-tight">
                  {isWire ? '심볼 포트 클릭으로 연결' : '드래그=자유곡선 · Shift=직선'}
                </p>
              </div>
            </div>
          )
        }
        return (
          <div key={item.type} draggable
            onDragStart={e => { e.dataTransfer.setData('application/x-hmi-type', item.type); e.dataTransfer.effectAllowed = 'copy' }}
            className="flex items-center gap-2 px-2 py-2 rounded border border-transparent hover:border-[#374151] hover:bg-[#1a2233] cursor-grab active:cursor-grabbing transition-colors">
            <div className="w-7 h-7 rounded flex items-center justify-center shrink-0"
              style={{ background:`${item.color}18`, border:`1px solid ${item.color}44` }}>
              <Icon size={14} style={{ color: item.color }} />
            </div>
            <p className="text-[11px] font-semibold text-[#cbd5e1]">{item.label}</p>
          </div>
        )
      })}
      <div className="border-t border-[#2d3748] my-2" />
      <div className="flex items-center gap-1 px-1 pb-1">
        <p className="flex-1 text-[9px] font-bold text-[#a78bfa] tracking-widest uppercase">내 심볼</p>
        <button onClick={() => { const n = window.prompt('새 파트 이름:', ''); if (n && n.trim()) onAddSymbolPart?.(n.trim()) }}
          title="빈 파트(분류) 만들기"
          className="flex items-center gap-0.5 text-[9px] text-[#94a3b8] hover:text-white px-1.5 py-0.5 rounded border border-[#374151] hover:bg-[#1e2736] transition-colors">
          <Folder size={9} /> 파트
        </button>
        <button onClick={onOpenSymbols}
          title="심볼 등록 (그리기/이미지)"
          className="flex items-center gap-0.5 text-[9px] text-[#c4b5fd] hover:text-white px-1.5 py-0.5 rounded border border-[#4c1d95] hover:bg-[#2d1b4e] transition-colors">
          <Plus size={9} /> 심볼
        </button>
      </div>
      {partNames.length === 0
        ? <p className="text-[9px] text-[#4a5568] px-1 italic">등록된 심볼이 없습니다.</p>
        : partNames.map(part => {
          const items = grouped[part] || []
          const open = !collapsedParts.has(part)
          return (
            <div key={part} className="mb-0.5">
              {/* 파트 헤더 (접기/펴기 · 드롭 타겟 · 우클릭 메뉴) */}
              <div onClick={() => togglePart(part)}
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setHeaderCtx({ x: e.clientX, y: e.clientY, part }) }}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverPart !== part) setDragOverPart(part) }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverPart(dp => dp === part ? null : dp) }}
                onDrop={e => handlePartDrop(e, part)}
                className="flex items-center gap-1 px-1 py-1 rounded cursor-pointer transition-colors select-none"
                style={dragOverPart === part
                  ? { background: '#14532d', outline: '1px dashed #22c55e' }
                  : undefined}
                onMouseEnter={e => { if (dragOverPart !== part) e.currentTarget.style.background = '#1a2233' }}
                onMouseLeave={e => { if (dragOverPart !== part) e.currentTarget.style.background = '' }}>
                {open ? <ChevronDown size={10} className="text-[#4a5568] shrink-0" /> : <ChevronRight size={10} className="text-[#4a5568] shrink-0" />}
                <Folder size={10} className={dragOverPart === part ? 'text-[#4ade80] shrink-0' : 'text-[#a78bfa] shrink-0'} />
                <span className="flex-1 text-[10px] font-semibold text-[#cbd5e1] truncate">{part}</span>
                <span className="text-[9px] text-[#4a5568]">{items.length}</span>
              </div>
              {open && (items.length === 0
                ? <p className="text-[8px] text-[#4a5568] px-2 py-1 italic">비어 있음 — 심볼을 여기로 드래그</p>
                : <div className="grid grid-cols-3 gap-1 px-1 pb-1">
                  {items.map(s => (
                    <div key={s.id} draggable
                      onDragStart={e => { e.dataTransfer.setData('application/x-hmi-symbol', s.id); e.dataTransfer.effectAllowed = 'copy' }}
                      onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, sym: s }) }}
                      className="flex flex-col items-center gap-0.5 p-1 rounded border border-transparent hover:border-[#4a5568] hover:bg-[#2d3748] cursor-grab active:cursor-grabbing select-none">
                      {isSvgSymbol(s)
                        ? <div className="w-8 h-8 rounded bg-[#0f172a] overflow-hidden flex items-center justify-center"
                            dangerouslySetInnerHTML={{ __html: s.svgContent }} />
                        : <img src={s.on} alt={s.name} className="w-8 h-8 object-contain rounded bg-[#0f172a]" />}
                      <span className="text-[8px] text-[#94a3b8] truncate w-full text-center">{s.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })
      }

      {/* 파트 헤더 우클릭 — 이름변경/합치기 */}
      {headerCtx && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setHeaderCtx(null)} onContextMenu={e => { e.preventDefault(); setHeaderCtx(null) }} />
          <div style={{ ...menuPos(headerCtx.x, headerCtx.y, 160, 300), zIndex: 9999,
            background:'#10151f', border:'1px solid #374151', borderRadius:6,
            boxShadow:'0 4px 20px rgba(0,0,0,0.6)', minWidth:160, maxHeight:'min(320px, 70vh)', overflowY:'auto', padding:'4px 0' }}>
            <div className="px-3 py-1.5 text-[10px] text-[#64748b] border-b border-[#1e293b] truncate max-w-[190px]">
              📁 {headerCtx.part} ({grouped[headerCtx.part]?.length || 0})
            </div>
            <button className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[#cbd5e1] hover:bg-[#1a2233] transition-colors"
              onClick={() => {
                const name = window.prompt('파트 이름 변경 (기존 파트명 입력 시 합쳐짐):', headerCtx.part)
                if (name) renamePart(headerCtx.part, name)
                setHeaderCtx(null)
              }}>
              <Pencil size={11} className="text-[#94a3b8]" /> 이름 변경 / 합치기…
            </button>
            {partNames.filter(p => p !== headerCtx.part).length > 0 && (
              <div className="px-3 pt-1.5 pb-0.5 text-[9px] font-bold text-[#4a5568] uppercase tracking-wider">다른 파트로 합치기</div>
            )}
            {partNames.filter(p => p !== headerCtx.part).map(p => (
              <button key={p} className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[#cbd5e1] hover:bg-[#1a2233] transition-colors"
                onClick={() => { renamePart(headerCtx.part, p); setHeaderCtx(null) }}>
                <Folder size={11} className="text-[#a78bfa]" /> {p} 로 합치기
              </button>
            ))}
            {(grouped[headerCtx.part]?.length || 0) === 0 && headerCtx.part !== '기타' && (
              <>
                <div className="h-px bg-[#1e293b] my-1" />
                <button className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-[#f87171] hover:bg-[#1a0808] transition-colors"
                  onClick={() => { onDeleteSymbolPart?.(headerCtx.part); setHeaderCtx(null) }}>
                  <Trash2 size={11} /> 빈 파트 삭제
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* 우클릭 컨텍스트 메뉴 */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setCtxMenu(null)} />
          <div style={{ ...menuPos(ctxMenu.x, ctxMenu.y, 150, 300), zIndex: 9999,
            background:'#10151f', border:'1px solid #374151', borderRadius:6,
            boxShadow:'0 4px 20px rgba(0,0,0,0.6)', minWidth:150, padding:'4px 0', maxHeight:'min(320px, 70vh)', overflowY:'auto' }}>
            <div className="px-3 py-1.5 text-[10px] text-[#64748b] border-b border-[#1e293b] truncate max-w-[180px]">
              {ctxMenu.sym.name}
            </div>
            {/* 파트 이동 */}
            <div className="px-3 pt-1.5 pb-0.5 text-[9px] font-bold text-[#4a5568] uppercase tracking-wider">파트 이동</div>
            {partNames.filter(p => p !== (ctxMenu.sym.category || '기타')).map(p => (
              <button key={p} className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[#cbd5e1] hover:bg-[#1a2233] transition-colors"
                onClick={() => { onSetSymbolCategory?.(ctxMenu.sym.id, p); setCtxMenu(null) }}>
                <Folder size={11} className="text-[#a78bfa]" /> {p}
              </button>
            ))}
            <button className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[#4ade80] hover:bg-[#0f2418] transition-colors"
              onClick={() => {
                const name = window.prompt('새 파트 이름:', '')
                if (name && name.trim()) onSetSymbolCategory?.(ctxMenu.sym.id, name.trim())
                setCtxMenu(null)
              }}>
              <Plus size={11} /> 새 파트로…
            </button>
            <div className="h-px bg-[#1e293b] my-1" />
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-[#f87171] hover:bg-[#1a0808] transition-colors"
              onClick={() => {
                if (window.confirm(`"${ctxMenu.sym.name}" 심볼을 삭제할까요?\n캔버스에 배치된 해당 심볼은 빈 상태로 남습니다.`)) {
                  onDeleteSymbol?.(ctxMenu.sym.id)
                }
                setCtxMenu(null)
              }}>
              <Trash2 size={11} />
              삭제
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════
   메인 패널
════════════════════════════════════════════ */
const BOTTOM_TABS = [
  { id:'project', label:'프로젝트', icon: Settings },
  { id:'screens', label:'화면',     icon: Monitor },
  { id:'objects', label:'오브젝트', icon: Package },
]

export default function ProjectPanel({
  projectName,
  resolution,
  screens = [],
  activeScreenId,
  devices = [],
  tags = [],
  customSymbols = [],
  onSelectScreen,
  onAddScreen,
  onRenameScreen,
  onUpdateScreen,
  onDuplicateScreen,
  onDeleteScreen,
  onChangeResolution,
  onOpenDevices,
  onOpenRegistry,
  onRenameProject,
  onSave,
  onOpenSymbols,
  onDeleteSymbol,
  onSetSymbolCategory,
  symbolParts = [],
  onAddSymbolPart,
  onDeleteSymbolPart,
  onStartLineDraw,
  onStartWireDraw,
  onOpenRecipe,
  recipeCount = 0,
  onOpenSchedule,
}) {
  const [activeTab, setActiveTab] = useState('screens')
  const [ctxMenu, setCtxMenu] = useState(null)
  const [screenDialog, setScreenDialog] = useState(null)
  const [resolutionDialog, setResolutionDialog] = useState(false)

  const closeCtx = useCallback(() => setCtxMenu(null), [])

  const handleGroupContextMenu = useCallback((e, typeId) => {
    const typeLabel = SCREEN_TYPES.find(t => t.id === typeId)?.label ?? '화면'
    setCtxMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label:`${typeLabel} 새로 만들기`, icon: FilePlus, iconColor:'#60a5fa',
          action: () => setScreenDialog({ mode:'new', typeId }) },
      ],
    })
  }, [])

  const handleScreenContextMenu = useCallback((e, screen) => {
    setCtxMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label:'속성 변경', icon: Pencil, iconColor:'#94a3b8', action: () => setScreenDialog({ mode:'edit', screen }) },
        { label:'화면 복제', icon: Copy,   iconColor:'#94a3b8', action: () => onDuplicateScreen?.(screen.id) },
        'divider',
        { label:'화면 삭제', icon: Trash2, danger: true, action: () => onDeleteScreen(screen.id) },
      ],
    })
  }, [onDeleteScreen, onDuplicateScreen])

  const handleScreenDialogConfirm = useCallback((props) => {
    if (screenDialog.mode === 'new') {
      onAddScreen?.(screenDialog.typeId, props)
    } else {
      onRenameScreen?.(screenDialog.screen.id, props.name)
      onUpdateScreen?.(screenDialog.screen.id, { type: props.type, bgColor: props.bgColor, bgImage: props.bgImage, bgFit: props.bgFit, bgDim: props.bgDim, bgLocked: props.bgLocked })
    }
    setScreenDialog(null)
  }, [screenDialog, onAddScreen, onRenameScreen, onUpdateScreen])

  return (
    <aside className="flex flex-col h-full border-r border-[#2d3748]"
      style={{ width: 220, background:'#0f1520', minWidth: 180 }}>

      {/* 헤더 */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#2d3748] flex-shrink-0"
        style={{ background:'#0d1117' }}>
        <FolderOpen size={13} className="text-[#60a5fa] shrink-0" />
        <span className="text-[11px] font-bold text-[#e2e8f0] flex-1 truncate">프로젝트 관리</span>
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">

        {activeTab === 'project' && (
          <ProjectTab
            projectName={projectName}
            resolution={resolution}
            devices={devices}
            tags={tags}
            screens={screens}
            onChangeResolution={onChangeResolution}
            onOpenDevices={onOpenDevices}
            onOpenRegistry={onOpenRegistry}
            onRename={onRenameProject}
            onSave={onSave}
            onShowResolutionDialog={() => setResolutionDialog(true)}
            onOpenRecipe={onOpenRecipe}
            recipeCount={recipeCount}
            onOpenSchedule={onOpenSchedule}
          />
        )}

        {activeTab === 'screens' && (
          <div className="flex-1 overflow-y-auto py-1">
            {SCREEN_TYPES.map(t => (
              <ScreenGroup key={t.id} typeId={t.id} label={t.label} screens={screens}
                activeScreenId={activeScreenId}
                onSelect={onSelectScreen}
                onContextMenu={handleScreenContextMenu}
                onGroupContextMenu={handleGroupContextMenu}
              />
            ))}
          </div>
        )}

        {activeTab === 'objects' && (
          <ObjectsTab customSymbols={customSymbols} onOpenSymbols={onOpenSymbols} onDeleteSymbol={onDeleteSymbol} onSetSymbolCategory={onSetSymbolCategory} symbolParts={symbolParts} onAddSymbolPart={onAddSymbolPart} onDeleteSymbolPart={onDeleteSymbolPart} onStartLineDraw={onStartLineDraw} onStartWireDraw={onStartWireDraw} />
        )}
      </div>

      {/* 하단 탭 */}
      <div className="flex-shrink-0 border-t border-[#2d3748]" style={{ background:'#0a0f1a' }}>
        <div className="flex">
          {BOTTOM_TABS.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className="flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors"
                style={isActive
                  ? { background:'#1e3a5f', borderTop:'2px solid #f97316', color:'#f97316' }
                  : { borderTop:'2px solid transparent', color:'#4a5568' }}>
                <Icon size={13} />
                <span className="text-[8px] font-bold leading-none">{tab.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 컨텍스트 메뉴 */}
      {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={closeCtx} />}

      {/* 화면 속성 다이얼로그 */}
      {screenDialog && (
        <ScreenPropDialog
          title={screenDialog.mode === 'new' ? '새 화면 만들기' : '화면 속성'}
          screen={screenDialog.screen}
          typeId={screenDialog.typeId}
          onConfirm={handleScreenDialogConfirm}
          onClose={() => setScreenDialog(null)}
        />
      )}

      {/* 해상도 다이얼로그 */}
      {resolutionDialog && (
        <ResolutionDialog
          resolution={resolution}
          onConfirm={(r) => { onChangeResolution(r); setResolutionDialog(false) }}
          onClose={() => setResolutionDialog(false)}
        />
      )}
    </aside>
  )
}
