import { useState } from 'react'
import { X, Blocks, Plus, Calculator, Gauge, Sliders, Store, Search } from 'lucide-react'
import { PRESETS, applyPreset } from '../data/presets'

// 프리셋 id → 카테고리 (갤러리 그룹핑)
const CATEGORY = {
  recoiler:        { key: 'winding', label: '권취 · 리코일러', color: '#22c55e' },
  recoiler_torque: { key: 'winding', label: '권취 · 리코일러', color: '#22c55e' },
  uncoiler:        { key: 'winding', label: '권출 · 언코일러', color: '#38bdf8' },
  efficiency:      { key: 'general', label: '일반 계산',       color: '#a78bfa' },
}
const catOf = id => CATEGORY[id] || { key: 'general', label: '일반', color: '#a78bfa' }

// 역할별 태그 수 (input=측정입력 · setpoint=설정값 · calc=계산)
const ROLE_META = {
  input:    { label: '측정 입력', color: '#60a5fa', icon: Gauge },
  setpoint: { label: '설정값',    color: '#f59e0b', icon: Sliders },
  calc:     { label: '계산',      color: '#4ade80', icon: Calculator },
}
const TYPE_COLOR = { BIT: '#22c55e', WORD: '#60a5fa', DWORD: '#818cf8', FLOAT: '#f59e0b' }

function roleCounts(tags) {
  const c = { input: 0, setpoint: 0, calc: 0 }
  for (const t of tags) c[(t.role || 'input')] = (c[(t.role || 'input')] || 0) + 1
  return c
}

function PresetCard({ preset, onApply }) {
  const cat = catOf(preset.id)
  const counts = roleCounts(preset.tags)
  const star = preset.name.includes('⭐')
  const name = preset.name.replace('⭐', '').trim()
  return (
    <div className="rounded-xl border overflow-hidden flex flex-col transition-all"
      style={{ background: '#0f1520', borderColor: '#2d3748' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = cat.color + '99'; e.currentTarget.style.boxShadow = `0 0 0 1px ${cat.color}33` }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#2d3748'; e.currentTarget.style.boxShadow = 'none' }}>

      {/* 헤더 */}
      <div className="px-4 pt-3.5 pb-3 border-b" style={{ borderColor: '#1e293b', background: 'linear-gradient(180deg,#131a26,#0f1520)' }}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0"
            style={{ background: cat.color + '1a', color: cat.color, border: `1px solid ${cat.color}44` }}>
            {cat.label}
          </span>
          {star && <span className="text-[10px] text-[#fbbf24]">★ 추천</span>}
        </div>
        <p className="text-[14px] font-bold text-[#f1f5f9] leading-snug">{name}</p>
        <p className="text-[10.5px] text-[#94a3b8] leading-relaxed mt-1">{preset.desc}</p>
      </div>

      {/* 구성 요약 (역할별 배지) */}
      <div className="px-4 py-2.5 flex items-center gap-1.5 flex-wrap">
        {Object.entries(counts).filter(([, n]) => n > 0).map(([role, n]) => {
          const m = ROLE_META[role]; const Icon = m.icon
          return (
            <span key={role} className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded"
              style={{ background: m.color + '14', color: m.color, border: `1px solid ${m.color}33` }}>
              <Icon size={10} /> {m.label} {n}
            </span>
          )
        })}
      </div>

      {/* 태그 미리보기 */}
      <div className="px-4 pb-3 flex-1">
        <div className="rounded-lg border divide-y" style={{ borderColor: '#1e293b', background: '#0a0f1a' }}>
          {preset.tags.map(t => {
            const role = t.role || 'input'
            return (
              <div key={t.key} className="flex items-center gap-2 px-2.5 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ROLE_META[role]?.color || '#64748b' }} />
                <span className="text-[10.5px] text-[#cbd5e1] flex-1 truncate">{t.desc}</span>
                {t.formula && <Calculator size={9} className="text-[#4ade80] shrink-0" title="자동 계산 태그" />}
                {t.writeTo !== undefined && t.role === 'calc' && t.watchActual && (
                  <span className="text-[8px] text-[#38bdf8] shrink-0" title="PLC 출력 + 예상↔실제 감시">↔출력</span>
                )}
                <span className="text-[8.5px] font-mono px-1.5 py-0.5 rounded shrink-0"
                  style={{ background: (TYPE_COLOR[t.type] || '#64748b') + '1a', color: TYPE_COLOR[t.type] || '#94a3b8' }}>
                  {t.type}{t.unit ? ` ${t.unit}` : ''}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 적용 버튼 */}
      <div className="px-4 pb-3.5">
        <button onClick={() => onApply(preset)}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-bold text-white transition-all"
          style={{ background: cat.color, boxShadow: `0 0 12px ${cat.color}44` }}
          onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.1)'}
          onMouseLeave={e => e.currentTarget.style.filter = 'none'}>
          <Plus size={13} /> 이 템플릿 추가
        </button>
      </div>
    </div>
  )
}

export default function TemplateGallery({ open, tags = [], onApplyTags, onClose }) {
  const [query, setQuery] = useState('')
  if (!open) return null

  const applyPresetTags = (preset) => {
    const cleanName = preset.name.replace('⭐', '').trim()
    const prefix = window.prompt(`"${cleanName}"\n\n이 설비의 이름(그룹 이름)을 입력하세요.\n이 이름으로 그룹이 만들어지고 태그가 그 안에 담깁니다.\n예: UNCOILER1 → 그룹 "UNCOILER1", 태그 TAG_UNCOILER1_...`, preset.id)
    if (prefix === null) return
    const grp = prefix.trim() || preset.id                          // 이 이름이 곧 그룹(utility)
    const add = applyPreset(preset, grp).filter(t => !tags.some(x => x.id === t.id))
    onApplyTags([...tags, ...add], grp)                             // App이 그 그룹으로 필터링해 태그창 열기
    window.alert(`✅ "${cleanName}" → 그룹 "${grp}" 에 태그 ${add.length}개 추가됨.\n\n${preset.note || '입력 태그에 PLC 주소를 연결하세요.'}`)
    onClose?.()
  }

  const q = query.trim().toLowerCase()
  const list = q
    ? PRESETS.filter(p => (p.name + ' ' + p.desc + ' ' + catOf(p.id).label).toLowerCase().includes(q))
    : PRESETS

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="rounded-2xl border border-[#2d3748] shadow-2xl overflow-hidden flex flex-col"
        style={{ background: '#0a0f1a', width: 'min(940px, 94vw)', height: 'min(84vh, 780px)' }}>

        {/* 헤더 */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[#2d3748] flex-shrink-0" style={{ background: '#0d1117' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: '#14532d', border: '1px solid #22c55e55' }}>
            <Blocks size={16} className="text-[#4ade80]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold text-[#f1f5f9] leading-tight">템플릿 갤러리</p>
            <p className="text-[10px] text-[#64748b] leading-tight mt-0.5">검증된 계산·제어 태그 세트를 한 번에 추가 — 클릭 후 PLC 주소만 연결하면 끝</p>
          </div>
          {/* 검색 */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: '#131a26', border: '1px solid #2d3748' }}>
            <Search size={12} className="text-[#4a5568]" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="템플릿 검색"
              className="bg-transparent text-[11px] text-[#e2e8f0] placeholder-[#4a5568] focus:outline-none" style={{ width: 120 }} />
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-[#374151] text-[#6b7280] hover:text-white transition-colors"><X size={16} /></button>
        </div>

        {/* 카드 그리드 */}
        <div className="flex-1 overflow-y-auto p-4" style={{ background: '#0a0f1a' }}>
          {list.length === 0
            ? <p className="text-center text-[12px] text-[#4a5568] py-16">"{query}" 에 맞는 템플릿이 없습니다.</p>
            : <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                {list.map(p => <PresetCard key={p.id} preset={p} onApply={applyPresetTags} />)}
              </div>
          }
        </div>

        {/* 푸터 — 마켓플레이스 예고 */}
        <div className="flex items-center gap-2.5 px-5 py-3 border-t border-[#2d3748] flex-shrink-0" style={{ background: '#0d1117' }}>
          <Store size={14} className="text-[#a78bfa] shrink-0" />
          <span className="text-[11px] text-[#cbd5e1] font-semibold">마켓플레이스</span>
          <span className="text-[10px] text-[#64748b]">— 사용자가 만든 검증된 템플릿을 공유·판매 (준비중)</span>
          <span className="ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#2d1b4e', color: '#c4b5fd', border: '1px solid #4c1d95' }}>COMING SOON</span>
        </div>
      </div>
    </div>
  )
}
