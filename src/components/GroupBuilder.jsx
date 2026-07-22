import { useState } from 'react'
import { Boxes, Plus, Trash2, X } from 'lucide-react'
import { TAG_TYPES } from '../data/tags'

// 장비 타입 프리셋 — 멤버(태그) 묶음
const PRESETS = {
  '모터': [
    { name: 'RUN', label: '운전', type: 'BIT', unit: '', min: 0, max: 1 },
    { name: 'CURR', label: '전류', type: 'FLOAT', unit: 'A', min: 0, max: 30 },
    { name: 'TEMP', label: '온도', type: 'FLOAT', unit: '°C', min: 0, max: 150 },
    { name: 'VIB', label: '진동', type: 'FLOAT', unit: 'mm/s', min: 0, max: 1.5 },
  ],
  '온도센서': [{ name: 'TEMP', label: '온도', type: 'FLOAT', unit: '°C', min: 0, max: 150 }],
  '압력센서': [{ name: 'PR', label: '압력', type: 'FLOAT', unit: 'MPa', min: 0, max: 5 }],
  '펌프': [
    { name: 'RUN', label: '운전', type: 'BIT', unit: '', min: 0, max: 1 },
    { name: 'SPEED', label: '속도', type: 'WORD', unit: 'RPM', min: 0, max: 3600 },
    { name: 'FLOW', label: '유량', type: 'FLOAT', unit: 'L/m', min: 0, max: 100 },
  ],
  '집진기': [
    { name: 'FAN', label: '팬 운전', type: 'BIT', unit: '', min: 0, max: 1 },
    { name: 'TEMP', label: '온도', type: 'FLOAT', unit: '°C', min: 0, max: 150 },
    { name: 'PR', label: '압력', type: 'FLOAT', unit: 'MPa', min: 0, max: 5 },
  ],
}

const COLS = [
  { key: 'name', label: '멤버명', w: 90 },
  { key: 'label', label: '설명', w: 90 },
  { key: 'type', label: '타입', w: 80 },
  { key: 'unit', label: '단위', w: 60 },
  { key: 'min', label: '최소', w: 60 },
  { key: 'max', label: '최대', w: 60 },
]

export default function GroupBuilder({ open, devices = [], onClose, onCreate }) {
  const [name, setName] = useState('')
  const [device, setDevice] = useState('')
  const [members, setMembers] = useState([])

  if (!open) return null

  function addPreset(key) {
    setMembers(prev => [...prev, ...PRESETS[key].map(m => ({ ...m }))])
  }
  function addBlank() {
    setMembers(prev => [...prev, { name: '', label: '', type: 'FLOAT', unit: '', min: 0, max: 100 }])
  }
  function updateMember(i, patch) {
    setMembers(prev => prev.map((m, idx) => idx === i ? { ...m, ...patch } : m))
  }
  function removeMember(i) {
    setMembers(prev => prev.filter((_, idx) => idx !== i))
  }
  function create() {
    if (!name.trim()) { window.alert('그룹 이름을 입력하세요. (예: 집진기1)'); return }
    const valid = members.filter(m => String(m.name).trim())
    if (valid.length === 0) { window.alert('멤버를 1개 이상 추가하세요. (프리셋 또는 멤버 추가)'); return }
    const r = onCreate?.(name.trim(), device, valid) || {}
    window.alert(`"${name.trim()}" 그룹에 ${r.added ?? valid.length}개 태그를 생성했습니다.`)
    setName(''); setMembers([])
    onClose?.()
  }

  const previewId = (m) => `${name.trim() || '그룹'}_${String(m.name).trim() || '멤버'}`

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="flex flex-col bg-[#0f1520] border border-[#2d3748] rounded-lg overflow-hidden shadow-2xl"
        style={{ width: 'min(820px, 94vw)', height: 'min(620px, 90vh)' }} onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center gap-2 px-4 h-12 bg-[#0d1117] border-b border-[#2d3748] flex-shrink-0">
          <Boxes size={16} className="text-[#22c55e]" />
          <span className="text-[13px] font-bold text-[#e2e8f0]">그룹 만들기</span>
          <span className="text-[10px] text-[#4a5568]">템플릿으로 멤버 태그 일괄 생성</span>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-[#2d3748] text-[#4a5568] hover:text-[#e2e8f0]">
            <X size={16} />
          </button>
        </div>

        {/* 그룹 정보 */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#2d3748] flex-shrink-0 flex-wrap">
          <span className="text-[10px] text-[#4a5568]">그룹 이름</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="예: 집진기1" spellCheck={false}
            className="text-[11px] font-mono font-bold rounded px-2 py-1 w-32 bg-[#1a202c] border border-[#2d3748] text-[#e2e8f0] focus:outline-none focus:border-[#22c55e]" />
          <span className="text-[10px] text-[#4a5568]">디바이스</span>
          <select value={device} onChange={e => setDevice(e.target.value)}
            className="text-[10px] font-mono rounded px-2 py-1 bg-[#0f172a] border border-[#2d3748] text-[#94a3b8] focus:outline-none">
            <option value="">(없음/나중에)</option>
            {devices.map(d => <option key={d.name} value={d.name} style={{ background: '#0f172a', color: '#e2e8f0' }}>{d.name}</option>)}
          </select>
          <span className="text-[9px] text-[#4a5568] ml-2">→ 태그ID는 <span className="font-mono text-[#22c55e]">{name.trim() || '그룹'}_멤버명</span></span>
        </div>

        {/* 프리셋 */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[#2d3748] flex-shrink-0 flex-wrap">
          <span className="text-[9px] text-[#4a5568] uppercase tracking-wide">프리셋</span>
          {Object.keys(PRESETS).map(k => (
            <button key={k} onClick={() => addPreset(k)}
              className="px-2 py-1 rounded text-[10px] text-[#6ee7b7] border border-[#166534] hover:bg-[#14532d] transition-colors">
              + {k}
            </button>
          ))}
          <button onClick={addBlank} className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-[10px] text-[#00d4ff] border border-[#1e40af] hover:bg-[#0f2444]">
            <Plus size={11} /> 멤버 추가
          </button>
        </div>

        {/* 멤버 표 */}
        <div className="flex-1 overflow-auto">
          {members.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-6">
              <Boxes size={30} className="text-[#2d3748]" />
              <p className="text-[11px] text-[#718096]">위 <span className="text-[#6ee7b7]">프리셋</span>을 누르거나 <span className="text-[#00d4ff]">멤버 추가</span>로 태그를 구성하세요.</p>
              <p className="text-[10px] text-[#4a5568]">예: 집진기1 그룹에 FAN, TEMP, PR 멤버 → 집진기1_FAN, 집진기1_TEMP, 집진기1_PR 생성</p>
            </div>
          ) : (
            <table className="text-[11px]" style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
              <thead>
                <tr className="bg-[#1a202c] sticky top-0 z-10">
                  <th className="px-2 py-1.5 text-left text-[9px] font-bold text-[#4a5568] uppercase" style={{ borderBottom: '1px solid #2d3748', width: 36 }}>#</th>
                  {COLS.map(c => <th key={c.key} className="px-2 py-1.5 text-left text-[9px] font-bold text-[#4a5568] uppercase" style={{ borderBottom: '1px solid #2d3748', minWidth: c.w }}>{c.label}</th>)}
                  <th className="px-2 py-1.5 text-left text-[9px] font-bold text-[#4a5568] uppercase" style={{ borderBottom: '1px solid #2d3748' }}>생성될 태그ID</th>
                  <th style={{ borderBottom: '1px solid #2d3748', width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => (
                  <tr key={i} className="border-b border-[#1e2736] hover:bg-[#161d2a]">
                    <td className="px-2 py-1 text-[9px] text-[#4a5568] font-mono text-center">{i + 1}</td>
                    {COLS.map(c => (
                      <td key={c.key} className="px-1 py-1" style={{ minWidth: c.w }}>
                        {c.key === 'type' ? (
                          <select value={m.type} onChange={e => updateMember(i, { type: e.target.value })}
                            className="w-full text-[10px] font-mono rounded px-1 py-1 bg-[#0f172a] border border-[#1e2a4a] text-[#a78bfa] focus:outline-none">
                            {TAG_TYPES.map(t => <option key={t} value={t} style={{ background: '#0f172a', color: '#e2e8f0' }}>{t}</option>)}
                          </select>
                        ) : (
                          <input
                            type={(c.key === 'min' || c.key === 'max') ? 'number' : 'text'}
                            value={m[c.key] ?? ''}
                            spellCheck={false}
                            onChange={e => updateMember(i, { [c.key]: e.target.value })}
                            className="w-full text-[10px] font-mono rounded px-1.5 py-1 bg-[#0f172a] border border-[#1e2a4a] text-[#e2e8f0] focus:outline-none focus:border-[#22c55e]" />
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-1 text-[10px] font-mono text-[#22c55e] whitespace-nowrap">{previewId(m)}</td>
                    <td className="px-1 py-1 text-center">
                      <button onClick={() => removeMember(i)} className="p-1 rounded hover:bg-[#450a0a] text-[#4a5568] hover:text-[#ef4444]"><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center px-4 h-12 bg-[#0d1117] border-t border-[#2d3748] flex-shrink-0 gap-2">
          <span className="text-[9px] text-[#4a5568]">멤버 {members.length}개 · 생성 후 그룹 복제로 다른 호기(집진기2…)에 재활용 가능</span>
          <button onClick={create}
            className="ml-auto px-4 py-1.5 rounded text-[11px] font-bold text-white"
            style={{ background: '#16a34a', border: '1px solid #22c55e' }}>
            그룹 생성
          </button>
          <button onClick={onClose} className="px-3 py-1.5 rounded text-[11px] text-[#718096] hover:bg-[#2d3748]">취소</button>
        </div>
      </div>
    </div>
  )
}
