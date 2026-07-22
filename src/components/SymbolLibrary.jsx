import { useRef, useState, useEffect } from 'react'
import { Shapes, Plus, Trash2, X, ImagePlus, FileCode2, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { makeSymbol, makeSvgSymbol, isTwoState, isSvgSymbol } from '../data/symbols'
import { validateSvgLayers, ANIM_PREFIXES } from '../utils/svgNaming'

const MAX_BYTES = 2 * 1024 * 1024 // 2MB (SVG/텍스트용)
const MAX_SRC_BYTES = 40 * 1024 * 1024 // 원본 이미지 상한 40MB (리사이즈 전)
const MAX_DIM = 1600            // 리사이즈 최대 변(px)
const TARGET_BYTES = 700 * 1024 // 저장 데이터 목표 크기(약 0.7MB)

// 큰 이미지는 자동으로 리사이즈·압축하여 dataURL 반환 (localStorage 절약)
function readImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('이미지 파일만 올릴 수 있습니다.'))
    if (file.size > MAX_SRC_BYTES) return reject(new Error('이미지가 너무 큽니다 (최대 40MB).'))
    const r = new FileReader()
    r.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'))
    r.onload = () => {
      const srcUrl = String(r.result)
      // SVG는 벡터라 리사이즈 불필요 — 원본 그대로
      if (file.type === 'image/svg+xml') { resolve(srcUrl); return }
      const img = new Image()
      img.onerror = () => reject(new Error('이미지를 해석할 수 없습니다.'))
      img.onload = () => {
        // JPEG만 불투명 → JPEG 재압축 허용. PNG/WEBP/GIF 등은 투명도 보존 위해 PNG 유지.
        const isJpeg = file.type === 'image/jpeg' || file.type === 'image/jpg'
        const limit = TARGET_BYTES * 1.37 // base64 오버헤드 감안
        const renderAt = (maxDim) => {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
          const w = Math.max(1, Math.round(img.width * scale))
          const h = Math.max(1, Math.round(img.height * scale))
          const canvas = document.createElement('canvas')
          canvas.width = w; canvas.height = h
          const ctx = canvas.getContext('2d')
          ctx.clearRect(0, 0, w, h) // 투명 배경 유지
          ctx.drawImage(img, 0, 0, w, h)
          return canvas
        }

        if (isJpeg) {
          // 투명도 없음 → JPEG 품질 낮춰 압축
          const canvas = renderAt(MAX_DIM)
          let q = 0.85
          let out = canvas.toDataURL('image/jpeg', q)
          while (out.length > limit && q > 0.4) { q -= 0.15; out = canvas.toDataURL('image/jpeg', q) }
          resolve(out); return
        }

        // 투명 가능(PNG 등) → PNG 유지. 크면 해상도를 단계적으로 줄임.
        let dim = MAX_DIM
        let out = renderAt(dim).toDataURL('image/png')
        while (out.length > limit && dim > 500) {
          dim = Math.round(dim * 0.8)
          out = renderAt(dim).toDataURL('image/png')
        }
        resolve(out)
      }
      img.src = srcUrl
    }
    r.readAsDataURL(file)
  })
}

// 배경색 자동 제거(크로마키) — 지정 색과 가까운 픽셀을 투명하게
function chromaKey(dataUrl, hex, tolPct) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onerror = () => resolve(dataUrl)
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      const ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const tr = parseInt(hex.slice(1, 3), 16)
      const tg = parseInt(hex.slice(3, 5), 16)
      const tb = parseInt(hex.slice(5, 7), 16)
      // 허용 오차: 0~100% → 색거리 0~약441
      const tol = (tolPct / 100) * 441
      const soft = tol * 0.35 // 경계 부드럽게
      const data = ctx.getImageData(0, 0, c.width, c.height)
      const px = data.data
      for (let i = 0; i < px.length; i += 4) {
        const d = Math.sqrt((px[i] - tr) ** 2 + (px[i + 1] - tg) ** 2 + (px[i + 2] - tb) ** 2)
        if (d <= tol - soft) px[i + 3] = 0
        else if (d < tol) px[i + 3] = Math.round(px[i + 3] * ((d - (tol - soft)) / soft))
      }
      ctx.putImageData(data, 0, 0)
      resolve(c.toDataURL('image/png'))
    }
    img.src = dataUrl
  })
}

function readText(file) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_BYTES) return reject(new Error('파일이 너무 큽니다 (최대 2MB)'))
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsText(file, 'utf-8')
  })
}

/* ── 네이밍 규칙 안내 패널 ── */
function NamingGuide() {
  return (
    <div className="rounded border border-[#1e3a5f] bg-[#0a1628] px-4 py-3 text-[10px] text-[#94a3b8] space-y-2">
      <p className="font-bold text-[#60a5fa] text-[11px]">SVG 레이어 네이밍 규칙</p>
      <p className="font-mono text-[#e2e8f0]">[동작타입]-[부품명]_[고유번호]</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
        {Object.entries(ANIM_PREFIXES).map(([prefix, info]) => (
          <div key={prefix} className="flex flex-col gap-0.5">
            <span className="font-mono text-[#a78bfa]">{info.example}</span>
            <span className="text-[#64748b]">{info.label} — {info.dataType} · {info.desc}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── SVG 레이어 검사 결과 / 경고 모달 ── */
function SvgValidationModal({ result, fileName, onConfirm, onCancel }) {
  const hasInvalid = result.invalid.length > 0
  const hasValid = result.valid.length > 0

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="flex flex-col bg-[#0f1520] border border-[#2d3748] rounded-lg shadow-2xl overflow-hidden"
        style={{ width: 'min(580px, 92vw)', maxHeight: '80vh' }}>

        {/* 헤더 */}
        <div className={`flex items-center gap-2 px-4 h-12 border-b border-[#2d3748] flex-shrink-0 ${hasInvalid ? 'bg-[#1a0e00]' : 'bg-[#0a1a0a]'}`}>
          {hasInvalid
            ? <AlertTriangle size={16} className="text-[#f59e0b]" />
            : <CheckCircle2 size={16} className="text-[#22c55e]" />}
          <span className="text-[13px] font-bold text-[#e2e8f0]">
            {hasInvalid ? 'SVG 레이어 검사 — 경고' : 'SVG 레이어 검사 — 통과'}
          </span>
          <span className="text-[10px] text-[#4a5568] ml-1 font-mono">{fileName}</span>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* 경고: 인식 불가 레이어 */}
          {hasInvalid && (
            <div className="rounded border border-[#7f1d1d] bg-[#1a0808] p-3 space-y-2">
              <p className="text-[11px] font-bold text-[#ef4444] flex items-center gap-1.5">
                <AlertTriangle size={12} /> 인식할 수 없는 레이어 이름 ({result.invalid.length}개)
              </p>
              <p className="text-[10px] text-[#fca5a5]">
                아래 레이어는 표준 네이밍 규칙과 맞지 않아 애니메이션이 적용되지 않습니다.<br />
                <span className="font-mono text-[#fbbf24]">[동작타입]-[부품명]_[고유번호]</span> 형식을 확인하세요.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {result.invalid.map(id => (
                  <span key={id} className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#7f1d1d] text-[#fca5a5] border border-[#991b1b]">
                    {id}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 인식된 레이어 */}
          {hasValid && (
            <div className="rounded border border-[#14532d] bg-[#081a0e] p-3 space-y-2">
              <p className="text-[11px] font-bold text-[#22c55e] flex items-center gap-1.5">
                <CheckCircle2 size={12} /> 인식된 레이어 ({result.valid.length}개)
              </p>
              <div className="space-y-1">
                {result.valid.map(layer => (
                  <div key={layer.id} className="flex items-center gap-2 text-[10px]">
                    <span className="font-mono text-[#4ade80] w-36 truncate">{layer.id}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                      style={{ background: '#1e3a5f', color: '#60a5fa' }}>
                      {ANIM_PREFIXES[layer.animType]?.label}
                    </span>
                    <span className="text-[#64748b]">{ANIM_PREFIXES[layer.animType]?.dataType}</span>
                    <span className="text-[#4a5568]">— {ANIM_PREFIXES[layer.animType]?.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 아무 레이어도 없음 */}
          {!hasValid && !hasInvalid && (
            <div className="rounded border border-[#2d3748] bg-[#1a202c] p-3">
              <p className="text-[11px] text-[#718096] flex items-center gap-1.5">
                <Info size={12} /> id 속성이 있는 레이어를 찾지 못했습니다. SVG 편집기에서 레이어에 id를 부여하세요.
              </p>
            </div>
          )}

          {/* 네이밍 가이드 */}
          <NamingGuide />
        </div>

        {/* 하단 버튼 */}
        <div className="flex items-center justify-end gap-2 px-4 h-12 bg-[#0d1117] border-t border-[#2d3748] flex-shrink-0">
          <button onClick={onCancel}
            className="px-4 py-1.5 rounded text-[11px] text-[#94a3b8] hover:bg-[#2d3748] transition-colors">
            취소
          </button>
          <button onClick={onConfirm}
            className="px-4 py-1.5 rounded text-[11px] font-bold text-white transition-all"
            style={{ background: hasValid ? '#6d28d9' : '#1e40af', border: `1px solid ${hasValid ? '#7c3aed' : '#3b82f6'}` }}>
            {hasValid ? '인식된 레이어로 추가' : '경고 무시하고 추가'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── 삭제 확인 다이얼로그 ── */
function DeleteConfirmDialog({ name, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="rounded-xl p-5 flex flex-col gap-4" style={{ background: '#10151f', border: '1px solid #7f1d1d', minWidth: 260 }}>
        <div className="flex items-center gap-2">
          <Trash2 size={16} className="text-[#ef4444]" />
          <span className="text-[13px] font-bold text-[#e2e8f0]">심볼 삭제</span>
        </div>
        <p className="text-[12px] text-[#94a3b8] leading-relaxed">
          <span className="text-[#f87171] font-bold">"{name}"</span> 심볼을 삭제할까요?<br />
          캔버스에 배치된 해당 심볼은 빈 상태로 남습니다.
        </p>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 py-1.5 rounded text-[11px] font-bold"
            style={{ background: '#1e293b', border: '1px solid #374151', color: '#94a3b8' }}>
            취소
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-1.5 rounded text-[11px] font-bold"
            style={{ background: '#7f1d1d', border: '1px solid #ef4444', color: '#fca5a5' }}>
            삭제
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── 심볼 카드 ── */
function SymbolCard({ s, onDelete }) {
  const isSvg = isSvgSymbol(s)
  const [confirmOpen, setConfirmOpen] = useState(false)
  return (
    <>
      {confirmOpen && (
        <DeleteConfirmDialog
          name={s.name}
          onConfirm={() => { setConfirmOpen(false); onDelete(s.id) }}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
      <div className="rounded border border-[#2d3748] bg-[#1a202c] p-2 flex flex-col items-center gap-1">
        {isSvg ? (
          <div className="w-24 h-12 rounded bg-[#0f172a] flex items-center justify-center overflow-hidden border border-[#2d3748]"
            dangerouslySetInnerHTML={{ __html: s.svgContent }}
            style={{ maxWidth: '100%' }}
          />
        ) : (
          <div className="flex gap-1">
            <img src={s.on} alt={s.name} className="w-12 h-12 object-contain rounded bg-[#0f172a]" />
            {s.off && <img src={s.off} alt="off" className="w-12 h-12 object-contain rounded bg-[#0f172a]" />}
          </div>
        )}
        <span className="text-[10px] text-[#cbd5e1] truncate w-full text-center">{s.name}</span>
        <span className="text-[8px] text-[#4a5568]">
          {isSvg
            ? `SVG · ${s.layers.length}개 레이어`
            : isTwoState(s) ? '2상태(BIT)' : '단일'}
        </span>
        <button onClick={() => setConfirmOpen(true)}
          className="w-full flex items-center justify-center gap-1 py-1 rounded text-[10px] font-bold transition-colors hover:bg-[#450a0a]"
          style={{ border: '1px solid #4a5568', color: '#ef4444' }}>
          <Trash2 size={10} />
          삭제
        </button>
      </div>
    </>
  )
}

/* ── 메인 컴포넌트 ── */
export default function SymbolLibrary({ open, symbols, onClose, onAdd, onDelete }) {
  const [name, setName] = useState('')
  const [on, setOn] = useState('')
  const [off, setOff] = useState('')
  const [svgValidation, setSvgValidation] = useState(null)  // { result, fileName, svgContent }
  const [tab, setTab] = useState('image')  // 'image' | 'svg'
  const [imgMode, setImgMode] = useState('single')  // 'single' | 'bit' (단일 / ON·OFF 2상태)
  const [bgRemove, setBgRemove] = useState(false)   // 배경색 제거 사용
  const [bgColor, setBgColor] = useState('#000000') // 제거할 배경색
  const [bgTol, setBgTol] = useState(30)            // 허용 오차(%)
  const [onProc, setOnProc] = useState('')          // 배경 제거된 ON 미리보기
  const [offProc, setOffProc] = useState('')        // 배경 제거된 OFF 미리보기
  const onRef = useRef(null)
  const offRef = useRef(null)
  const svgRef = useRef(null)

  // 배경 제거 미리보기 계산
  useEffect(() => {
    if (!bgRemove) { setOnProc(''); setOffProc(''); return }
    let alive = true
    ;(async () => {
      const o = on ? await chromaKey(on, bgColor, bgTol) : ''
      const f = off ? await chromaKey(off, bgColor, bgTol) : ''
      if (alive) { setOnProc(o); setOffProc(f) }
    })()
    return () => { alive = false }
  }, [bgRemove, bgColor, bgTol, on, off])

  if (!open) return null

  const showOn = bgRemove ? (onProc || on) : on
  const showOff = bgRemove ? (offProc || off) : off

  async function pick(which, e) {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    try {
      const url = await readImage(f)
      which === 'on' ? setOn(url) : setOff(url)
      // 이름이 비어 있으면 파일명에서 자동 추출
      if (which === 'on' && !name.trim()) {
        setName(f.name.replace(/\.[^.]+$/, '').slice(0, 30))
      }
    }
    catch (err) { window.alert(err.message) }
  }

  async function pickSvg(e) {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    if (!f.name.endsWith('.svg') && f.type !== 'image/svg+xml') {
      window.alert('SVG 파일(.svg)만 업로드할 수 있습니다.')
      return
    }
    try {
      const text = await readText(f)
      const result = validateSvgLayers(text)
      if (!result.ok) { window.alert(result.error); return }
      setSvgValidation({ result, fileName: f.name, svgContent: text })
    } catch (err) {
      window.alert('SVG 파일을 읽을 수 없습니다: ' + err.message)
    }
  }

  function confirmSvg() {
    if (!svgValidation) return
    const { result, fileName, svgContent } = svgValidation
    const symName = name.trim() || fileName.replace(/\.svg$/i, '')
    onAdd(makeSvgSymbol({ name: symName, svgContent, layers: result.valid }))
    setName('')
    setSvgValidation(null)
  }

  function addImage() {
    if (!on) { window.alert('이미지를 올려주세요.'); return }
    if (imgMode === 'bit' && !off) { window.alert('ON·OFF 2상태는 OFF 이미지도 올려주세요.'); return }
    const finalOn = bgRemove ? (onProc || on) : on
    const finalOff = imgMode === 'bit' ? (bgRemove ? (offProc || off) : off) : ''
    onAdd(makeSymbol({ name: name.trim() || '이미지', on: finalOn, off: finalOff }))
    setName(''); setOn(''); setOff(''); setOnProc(''); setOffProc('')
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
        <div className="flex flex-col bg-[#0f1520] border border-[#2d3748] rounded-lg overflow-hidden shadow-2xl"
          style={{ width: 'min(800px, 96vw)', height: 'min(640px, 92vh)' }} onClick={e => e.stopPropagation()}>

          {/* 헤더 */}
          <div className="flex items-center gap-2 px-4 h-12 bg-[#0d1117] border-b border-[#2d3748] flex-shrink-0">
            <Shapes size={16} className="text-[#a78bfa]" />
            <span className="text-[13px] font-bold text-[#e2e8f0]">심볼 라이브러리</span>
            <span className="text-[10px] text-[#4a5568] ml-1">{symbols.length}개 · 직접 만든 부품 재사용</span>
            <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-[#2d3748] text-[#4a5568] hover:text-[#e2e8f0]">
              <X size={16} />
            </button>
          </div>

          {/* 탭 */}
          <div className="flex gap-0 border-b border-[#2d3748] flex-shrink-0 bg-[#10151f]">
            {[
              { key: 'image', label: '이미지 파일', icon: ImagePlus },
              { key: 'svg',   label: 'SVG 애니메이션', icon: FileCode2 },
            ].map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-semibold border-b-2 transition-colors ${
                  tab === key
                    ? 'border-[#7c3aed] text-[#a78bfa]'
                    : 'border-transparent text-[#4a5568] hover:text-[#94a3b8]'
                }`}>
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>

          {/* 추가 폼 */}
          <div className="px-4 py-3 border-b border-[#2d3748] flex-shrink-0 bg-[#0d1117]">
            {tab === 'image' ? (
              <>
                <p className="text-[10px] font-bold text-[#a78bfa] uppercase tracking-wide mb-2">이미지 파일 가져오기 <span className="text-[#4a5568] normal-case font-normal">— 도면·사진·아이콘을 캔버스에 배치</span></p>

                {/* 모드 선택: 단일 / ON·OFF 2상태 */}
                <div className="flex gap-1.5 mb-3">
                  {[
                    { key: 'single', label: '단일 이미지', desc: '그림 하나' },
                    { key: 'bit',    label: 'ON·OFF 2상태', desc: 'BIT 태그로 전환' },
                  ].map(m => (
                    <button key={m.key} onClick={() => setImgMode(m.key)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-semibold transition-colors"
                      style={imgMode === m.key
                        ? { background:'#2e1065', color:'#c4b5fd', border:'1px solid #7c3aed' }
                        : { background:'#1a202c', color:'#64748b', border:'1px solid #2d3748' }}>
                      {m.label}<span className="text-[8px] opacity-60">{m.desc}</span>
                    </button>
                  ))}
                </div>

                <div className="flex items-end gap-3 flex-wrap">
                  <div>
                    <p className="text-[9px] text-[#4a5568] mb-1">이름</p>
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="파일명에서 자동 추출" spellCheck={false}
                      className="text-[11px] rounded px-2 py-1.5 w-40 bg-[#1a202c] border border-[#2d3748] text-[#e2e8f0] focus:outline-none focus:border-[#6366f1]" />
                  </div>
                  <div>
                    <p className="text-[9px] text-[#4a5568] mb-1">{imgMode === 'bit' ? 'ON 이미지' : '이미지'}</p>
                    <input ref={onRef} type="file" accept="image/*" onChange={e => pick('on', e)} className="hidden" />
                    <button onClick={() => onRef.current?.click()}
                      className="w-14 h-14 rounded border border-[#2d3748] flex items-center justify-center overflow-hidden hover:border-[#6366f1] checker-bg">
                      {showOn ? <img src={showOn} alt="이미지" className="w-full h-full object-contain" /> : <ImagePlus size={18} className="text-[#4a5568]" />}
                    </button>
                  </div>
                  {imgMode === 'bit' && (
                    <div>
                      <p className="text-[9px] text-[#4a5568] mb-1">OFF 이미지</p>
                      <input ref={offRef} type="file" accept="image/*" onChange={e => pick('off', e)} className="hidden" />
                      <button onClick={() => offRef.current?.click()}
                        className="w-14 h-14 rounded border border-[#2d3748] flex items-center justify-center overflow-hidden hover:border-[#6366f1] checker-bg">
                        {showOff ? <img src={showOff} alt="off" className="w-full h-full object-contain" /> : <ImagePlus size={18} className="text-[#4a5568]" />}
                      </button>
                    </div>
                  )}
                  <button onClick={addImage}
                    className="flex items-center gap-1.5 px-3 py-2 rounded text-[11px] font-bold text-white"
                    style={{ background: '#6d28d9', border: '1px solid #7c3aed' }}>
                    <Plus size={13} /> 추가
                  </button>
                  <span className="text-[9px] text-[#4a5568] self-center">
                    {imgMode === 'bit' ? 'ON·OFF 이미지가 BIT 태그값에 따라 전환' : '이미지 하나로 단일 심볼 생성'}
                  </span>
                </div>

                {/* 배경 지우기 (선택) */}
                <div className="mt-3 pt-3 border-t border-[#1e2636]">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={bgRemove} onChange={e => setBgRemove(e.target.checked)}
                      style={{ accentColor:'#22d3ee' }} />
                    <span className="text-[11px] font-bold text-[#cbd5e1]">배경 지우기</span>
                    <span className="text-[9px] text-[#4a5568]">배경색을 유지하려면 끄세요</span>
                  </label>
                  {bgRemove && (
                    <div className="flex items-center gap-4 flex-wrap mt-2 pl-5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-[#94a3b8]">배경색</span>
                        <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)}
                          className="w-7 h-7 rounded border border-[#2d3748] cursor-pointer bg-transparent p-0.5" />
                        <input type="text" value={bgColor} onChange={e => setBgColor(e.target.value)}
                          className="w-20 text-[10px] font-mono rounded px-1.5 py-1 bg-[#1a202c] border border-[#2d3748] text-[#e2e8f0] focus:outline-none focus:border-[#6366f1]" />
                        <button onClick={() => setBgColor('#000000')} className="text-[9px] text-[#64748b] hover:text-[#cbd5e1] px-1">검정</button>
                        <button onClick={() => setBgColor('#ffffff')} className="text-[9px] text-[#64748b] hover:text-[#cbd5e1] px-1">흰색</button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[#94a3b8]">허용범위</span>
                        <input type="range" min={5} max={80} value={bgTol}
                          onChange={e => setBgTol(+e.target.value)} style={{ width:100, accentColor:'#22d3ee' }} />
                        <span className="text-[10px] font-mono text-[#cbd5e1] w-8">{bgTol}%</span>
                      </div>
                      <span className="text-[9px] text-[#4a5568]">미리보기의 체크무늬 = 투명</span>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="text-[10px] font-bold text-[#a78bfa] uppercase tracking-wide mb-2">SVG 파일 업로드</p>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-end gap-3">
                      <div>
                        <p className="text-[9px] text-[#4a5568] mb-1">심볼 이름 (선택)</p>
                        <input value={name} onChange={e => setName(e.target.value)} placeholder="파일명에서 자동 추출"
                          spellCheck={false}
                          className="text-[11px] rounded px-2 py-1.5 w-36 bg-[#1a202c] border border-[#2d3748] text-[#e2e8f0] focus:outline-none focus:border-[#6366f1]" />
                      </div>
                      <div>
                        <p className="text-[9px] text-[#4a5568] mb-1">SVG 파일</p>
                        <input ref={svgRef} type="file" accept=".svg,image/svg+xml" onChange={pickSvg} className="hidden" />
                        <button onClick={() => svgRef.current?.click()}
                          className="flex items-center gap-1.5 px-3 py-2 rounded text-[11px] font-semibold transition-colors"
                          style={{ background: '#1e3a5f', border: '1px solid #3b82f6', color: '#60a5fa' }}>
                          <FileCode2 size={13} /> .svg 업로드
                        </button>
                      </div>
                    </div>
                    <p className="text-[9px] text-[#4a5568]">
                      업로드 즉시 레이어 이름을 검사하여 규칙에 맞지 않는 레이어를 알려드립니다.
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <NamingGuide />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 목록 */}
          <div className="flex-1 overflow-auto p-3">
            {symbols.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-6">
                <Shapes size={30} className="text-[#2d3748]" />
                <p className="text-[11px] text-[#718096]">저장된 심볼이 없습니다. 위에서 이미지 또는 SVG를 추가하세요.</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {symbols.map(s => <SymbolCard key={s.id} s={s} onDelete={onDelete} />)}
              </div>
            )}
          </div>

          <div className="flex items-center px-4 h-10 bg-[#0d1117] border-t border-[#2d3748] flex-shrink-0">
            <span className="text-[9px] text-[#4a5568]">심볼은 브라우저에 저장되어 모든 프로젝트에서 재사용됩니다. 프로젝트 저장 시 함께 포함됩니다.</span>
            <button onClick={onClose} className="ml-auto px-4 py-1.5 rounded text-[11px] font-bold text-white" style={{ background: '#1e40af', border: '1px solid #3b82f6' }}>닫기</button>
          </div>
        </div>
      </div>

      {/* SVG 유효성 검사 모달 */}
      {svgValidation && (
        <SvgValidationModal
          result={svgValidation.result}
          fileName={svgValidation.fileName}
          onConfirm={confirmSvg}
          onCancel={() => setSvgValidation(null)}
        />
      )}
    </>
  )
}
