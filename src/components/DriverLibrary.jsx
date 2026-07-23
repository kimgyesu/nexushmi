import { useState } from 'react'
import { X, Cpu, Plug, Search, ArrowRight, Sparkles } from 'lucide-react'
import { allDrivers, isCustomDriver } from '../data/drivers'

const CONN = {
  serial:   { label: 'RS-232 / 485', color: '#f59e0b' },
  ethernet: { label: '이더넷',        color: '#38bdf8' },
  virtual:  { label: '가상 시뮬레이션', color: '#a78bfa' },
}

function DriverCard({ d, onUse }) {
  const custom = isCustomDriver(d.id)
  const conn = CONN[d.conn] || { label: d.conn, color: '#64748b' }
  const df = d.defaults || {}
  return (
    <div className="rounded-xl border overflow-hidden flex flex-col transition-all"
      style={{ background: '#0f1520', borderColor: '#2d3748' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#3b82f699'; e.currentTarget.style.boxShadow = '0 0 0 1px #3b82f633' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#2d3748'; e.currentTarget.style.boxShadow = 'none' }}>

      <div className="px-4 pt-3.5 pb-3 border-b" style={{ borderColor: '#1e293b', background: 'linear-gradient(180deg,#131a26,#0f1520)' }}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-bold text-[#60a5fa]">{d.vendor}</span>
          <span className="ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full"
            style={custom
              ? { background: '#2d1b4e', color: '#c4b5fd', border: '1px solid #4c1d95' }
              : { background: 'rgba(16,185,129,0.12)', color: '#4ade80', border: '1px solid rgba(16,185,129,0.4)' }}>
            {custom ? '내 드라이버' : '무료'}
          </span>
        </div>
        <p className="text-[13px] font-bold text-[#f1f5f9] leading-snug">{d.name}</p>
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <span className="text-[9.5px] font-semibold px-2 py-0.5 rounded" style={{ background: '#0a2540', color: '#7dd3fc', border: '1px solid #1e40af55' }}>{d.protocol}</span>
          <span className="text-[9.5px] font-semibold px-2 py-0.5 rounded flex items-center gap-1" style={{ background: conn.color + '18', color: conn.color, border: `1px solid ${conn.color}44` }}>
            <Plug size={9} /> {conn.label}
          </span>
        </div>
      </div>

      {/* 주소 형식 + 통신 기본값 */}
      <div className="px-4 py-3 flex-1 space-y-2">
        {d.addr?.example && (
          <div>
            <p className="text-[9px] text-[#64748b] mb-0.5">주소 형식</p>
            <p className="text-[10.5px] font-mono text-[#cbd5e1] leading-snug">{d.addr.example}</p>
            {d.addr.hint && <p className="text-[9px] text-[#4a5568] mt-0.5">{d.addr.hint}</p>}
          </div>
        )}
        {d.conn === 'serial' && (
          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            {df.baud != null && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: '#0a0f1a', color: '#94a3b8', border: '1px solid #1e293b' }}>{df.baud} bps</span>}
            {df.parity && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: '#0a0f1a', color: '#94a3b8', border: '1px solid #1e293b' }}>parity {df.parity}</span>}
            {df.station != null && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: '#0a0f1a', color: '#94a3b8', border: '1px solid #1e293b' }}>국번 {df.station}</span>}
          </div>
        )}
      </div>

      <div className="px-4 pb-3.5">
        <button onClick={() => onUse(d)}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-bold text-white transition-all"
          style={{ background: '#1e40af', border: '1px solid #3b82f6' }}
          onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.15)'}
          onMouseLeave={e => e.currentTarget.style.filter = 'none'}>
          이 드라이버로 디바이스 추가 <ArrowRight size={13} />
        </button>
      </div>
    </div>
  )
}

export default function DriverLibrary({ open, onClose, onOpenDevices }) {
  const [query, setQuery] = useState('')
  if (!open) return null

  const list = allDrivers()
  const q = query.trim().toLowerCase()
  const filtered = q
    ? list.filter(d => (d.vendor + ' ' + d.name + ' ' + d.protocol).toLowerCase().includes(q))
    : list

  const use = () => { onClose?.(); onOpenDevices?.() }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="rounded-2xl border border-[#2d3748] shadow-2xl overflow-hidden flex flex-col"
        style={{ background: '#0a0f1a', width: 'min(940px, 94vw)', height: 'min(84vh, 780px)' }}>

        {/* 헤더 */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[#2d3748] flex-shrink-0" style={{ background: '#0d1117' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#0a2540', border: '1px solid #3b82f655' }}>
            <Cpu size={16} className="text-[#60a5fa]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold text-[#f1f5f9] leading-tight">드라이버 라이브러리</p>
            <p className="text-[10px] text-[#64748b] leading-tight mt-0.5">지원 PLC · 통신 드라이버 — 모두 무료. 지원 기종은 계속 추가됩니다.</p>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: '#131a26', border: '1px solid #2d3748' }}>
            <Search size={12} className="text-[#4a5568]" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="드라이버 검색"
              className="bg-transparent text-[11px] text-[#e2e8f0] placeholder-[#4a5568] focus:outline-none" style={{ width: 120 }} />
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-[#374151] text-[#6b7280] hover:text-white transition-colors"><X size={16} /></button>
        </div>

        {/* 카드 그리드 */}
        <div className="flex-1 overflow-y-auto p-4" style={{ background: '#0a0f1a' }}>
          {filtered.length === 0
            ? <p className="text-center text-[12px] text-[#4a5568] py-16">"{query}" 에 맞는 드라이버가 없습니다.</p>
            : <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                {filtered.map(d => <DriverCard key={d.id} d={d} onUse={use} />)}
              </div>
          }
        </div>

        {/* 푸터 — 커스텀 드라이버(AI) 안내 */}
        <div className="flex items-center gap-2.5 px-5 py-3 border-t border-[#2d3748] flex-shrink-0" style={{ background: '#0d1117' }}>
          <Sparkles size={14} className="text-[#a78bfa] shrink-0" />
          <span className="text-[11px] text-[#cbd5e1] font-semibold">원하는 기종이 없나요?</span>
          <span className="text-[10px] text-[#64748b]">— 디바이스 추가에서 AI로 커스텀 드라이버를 만들 수 있어요 (무료)</span>
          <button onClick={use} className="ml-auto flex items-center gap-1 text-[11px] font-bold text-[#60a5fa] hover:text-[#93c5fd] transition-colors">
            디바이스 추가 <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
