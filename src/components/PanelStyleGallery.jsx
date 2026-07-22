import { PANEL_STYLE_LIST } from '../data/panelStyles'
import { X, Check, Palette } from 'lucide-react'

// 스타일 미리보기 미니 패널 (실제 색으로 근사)
function StyleCard({ style, active, onPick }) {
  const g = style.groupbox, n = style.numeric
  return (
    <button onClick={() => onPick(style.key)}
      className="text-left rounded-lg overflow-hidden transition-all"
      style={{
        border: active ? `2px solid ${style.accent}` : '2px solid #2d3748',
        boxShadow: active ? `0 0 12px ${style.accent}55` : 'none',
        background: '#0d1117',
      }}>
      {/* 미리보기 */}
      <div style={{ background: '#0a0e16', padding: 10 }}>
        <div style={{ border: `1.5px solid ${g.borderColor}`, borderRadius: 5, overflow: 'hidden', background: g.bgColor }}>
          <div style={{ background: g.borderColor + '22', borderBottom: `1px solid ${g.borderColor}55`, padding: '3px 8px', fontSize: 10, fontWeight: 700, color: g.titleColor }}>
            설비 패널
          </div>
          <div style={{ padding: '8px 10px', fontFamily: "'Consolas',monospace" }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 9, color: style.labelColor }}>주속도</span>
              <span style={{ background: n.bgColor, border: `1px solid ${n.boxColor}`, borderRadius: 3, padding: '1px 8px', color: n.digitColor, fontSize: Math.min(18, n.valueFontSize), textShadow: `0 0 6px ${n.digitColor}88` }}>120</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: style.labelColor }}>실속도</span>
              <span style={{ background: n.bgColor, border: `1px solid ${n.boxColor}`, borderRadius: 3, padding: '1px 8px', color: n.digitColor, fontSize: Math.min(16, n.valueFontSize - 2), textShadow: `0 0 6px ${n.digitColor}88` }}>118</span>
            </div>
          </div>
        </div>
      </div>
      {/* 이름 */}
      <div className="flex items-center gap-1.5 px-3 py-2" style={{ borderTop: '1px solid #1e2735' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: style.accent, flexShrink: 0 }} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold text-[#e2e8f0] truncate">{style.name}</p>
          <p className="text-[9px] text-[#64748b] truncate">{style.desc}</p>
        </div>
        {active && <Check size={14} style={{ color: style.accent }} />}
      </div>
    </button>
  )
}

export default function PanelStyleGallery({ open, activeKey, onPick, onApplySelected, onApplyAll, hasSelection, onClose }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="rounded-xl border border-[#374151] shadow-2xl overflow-hidden" style={{ background: '#0d1117', width: 620, maxWidth: '92vw' }}>
        {/* 헤더 */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#374151]" style={{ background: '#131a26' }}>
          <Palette size={14} className="text-[#a78bfa]" />
          <span className="text-[13px] font-bold text-[#f1f5f9]">패널 스타일</span>
          <span className="text-[10px] text-[#64748b]">— 카드를 눌러 스타일을 고르세요</span>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-[#374151] text-[#6b7280] hover:text-white"><X size={14} /></button>
        </div>

        {/* 카드 그리드 */}
        <div className="p-4">
          <div className="grid grid-cols-3 gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))' }}>
            {PANEL_STYLE_LIST.map(s => (
              <StyleCard key={s.key} style={s} active={s.key === activeKey} onPick={onPick} />
            ))}
          </div>
          <p className="text-[10px] text-[#64748b] mt-3 leading-relaxed">
            고른 스타일은 <b className="text-[#94a3b8]">앞으로 만드는 패널</b>에 자동 적용됩니다.
            이미 만든 패널에도 입히려면 아래 버튼을 누르세요.
          </p>
        </div>

        {/* 하단 적용 버튼 */}
        <div className="flex gap-2 px-4 py-3 border-t border-[#374151]" style={{ background: '#0a0f1a' }}>
          <button onClick={onClose}
            className="py-2 px-3 rounded text-[11px] font-bold text-[#94a3b8] border border-[#374151] hover:bg-[#1e2736] transition-colors">닫기</button>
          <button onClick={onApplySelected} disabled={!hasSelection}
            className="flex-1 py-2 rounded text-[11px] font-bold transition-colors disabled:opacity-40"
            style={{ background: '#1e293b', border: '1px solid #475569', color: '#cbd5e1' }}>
            선택 패널에 적용
          </button>
          <button onClick={onApplyAll}
            className="flex-1 py-2 rounded text-[11px] font-bold text-white transition-colors"
            style={{ background: '#6d28d9', border: '1px solid #7c3aed' }}>
            전체 패널에 적용
          </button>
        </div>
      </div>
    </div>
  )
}
