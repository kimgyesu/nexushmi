import { X, TrendingUp, Sparkles, Zap, Sun, Download } from 'lucide-react'
import { fmtHM } from '../utils/analysisReport'
import { exportReportToExcel } from '../utils/reportExcel'

function Stat({ label, v, sub, c }) {
  return (
    <div className="rounded px-2 py-1.5" style={{ background: '#070b12', border: '1px solid #16233a' }}>
      <p className="text-[8px] text-[#64748b]">{label}</p>
      <p className="text-[14px] font-bold font-mono" style={{ color: c }}>{v}</p>
      {sub && <p className="text-[8px] text-[#475569] font-mono">{sub}</p>}
    </div>
  )
}

// 범용 AI 분석 대시보드 — report(N개 시리즈) 소비. 어떤 장비 프로젝트든 동일 렌더.
export default function AnalysisDashboard({ data, onClose }) {
  const report = data
  const pv = (report.series || []).filter(s => s.role === 'pv' && s.data?.length)
  const power = (report.series || []).filter(s => s.role === 'power' && s.data?.length)
  const env = (report.env || []).filter(s => s.data?.length)
  const events = report.events || []
  const usage = report.usage
  const { start, end, aiText = '', streaming } = report
  const base = [...pv, ...power, ...env].reduce((a, b) => (b.data.length > (a?.data.length || 0) ? b : a), null)
  if (!base) return null
  const span = (end - start) || 1

  const W = 1000, H = 210, pL = 42, pR = 42, pT = 14, pB = 26
  const xT = ms => pL + ((ms - start) / span) * (W - pL - pR)
  const plotH = H - pT - pB
  const yN = (s, v) => { const lo = s.min, hi = (s.max > s.min ? s.max : s.min + 1); return pT + (1 - (v - lo) / (hi - lo)) * plotH }
  const path = (s, yf) => s.data.map((p, i) => `${i ? 'L' : 'M'}${xT(p.t).toFixed(1)},${yf(s, p.v).toFixed(1)}`).join(' ')
  const ticks = Array.from({ length: 9 }, (_, k) => start + (k / 8) * span)
  const allSpikes = pv.flatMap(s => (s.spikes || []).map(sp => ({ ...sp, s })))
  const eqNames = [...new Set(events.map(e => e.name))]
  const eqColor = {}; events.forEach(e => { eqColor[e.name] = e.color })
  const nf = (s, v) => Number(v).toFixed(s.decimals || 0)

  // 변화량 막대 — 대표 pv(첫번째)의 구간 Δ
  const main = pv[0]
  const bars = (() => {
    if (!main) return []
    const N = main.data.length, BK = Math.max(1, Math.round(N / 48)), nb = Math.ceil(N / BK)
    return Array.from({ length: nb }, (_, b) => { const a = main.data[b * BK], e = main.data[Math.min(N - 1, b * BK + BK - 1)]; return { t: a.t, d: e.v - a.v } })
  })()
  const maxBar = Math.max(1, ...bars.map(b => Math.abs(b.d)))
  const BW = 1000, BH = 92, bpL = 42, bpR = 42, bpB = 4
  const bw = (BW - bpL - bpR) / (bars.length || 1)
  const bigThresh = main ? Math.max(main.decimals > 0 ? 0.5 : 1, (main.max - main.min) * 0.1) : 1

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: '#000' }}>
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #1e293b', background: '#05070c' }}>
        <TrendingUp size={17} className="text-[#38bdf8]" />
        <span className="text-[14px] font-bold text-[#e2e8f0]">AI 분석 · {report.title || '운전 분석'}</span>
        <span className="text-[10px] text-[#475569]">{report.subtitle || ''}</span>
        <button onClick={() => exportReportToExcel(report, `분석보고서_${new Date().toISOString().slice(0, 10)}.xlsx`)}
                className="ml-auto flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded text-white transition-colors"
                style={{ background: '#15803d', border: '1px solid #22c55e' }}
                title="보고서를 엑셀(.xlsx)로 저장 — 요약·급변원인·분당데이터·장비이력 시트">
          <Download size={13} /> 엑셀 저장
        </button>
        <button onClick={onClose} className="text-[#64748b] hover:text-white p-1"><X size={18} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* 트렌드 (N개 pv 정규화) */}
        <div className="rounded-lg p-3" style={{ background: '#070b12', border: '1px solid #16233a' }}>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <span className="text-[11px] font-bold text-[#94a3b8]">트렌드</span>
            {pv.map(s => <span key={s.id} className="flex items-center gap-1 text-[10px]" style={{ color: '#cbd5e1' }}><span style={{ width: 14, height: 2, background: s.color, display: 'inline-block' }} /> {s.name}({s.unit})</span>)}
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
            {[0, 0.25, 0.5, 0.75, 1].map(g => <line key={g} x1={pL} y1={pT + g * plotH} x2={W - pR} y2={pT + g * plotH} stroke="#111a28" strokeWidth="1" />)}
            {allSpikes.map((sp, i) => <rect key={i} x={xT(sp.t0)} y={pT} width={Math.max(2, xT(sp.t) - xT(sp.t0))} height={plotH} fill="#ef4444" opacity="0.13" />)}
            {pv.map(s => <path key={s.id} d={path(s, yN)} fill="none" stroke={s.color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />)}
            {allSpikes.map((sp, i) => <g key={'m' + i}><circle cx={xT(sp.t)} cy={yN(sp.s, sp.to)} r="3" fill="#ef4444" /><text x={xT(sp.t)} y={yN(sp.s, sp.to) - 6} textAnchor="middle" fontSize="9" fill="#fca5a5" fontFamily="monospace">{sp.d > 0 ? '▲' : '▼'}{Math.abs(sp.d).toFixed(1)}</text></g>)}
            {events.map((e, i) => { const x = xT(e.ts), c = e.color || '#94a3b8'; return (
              <g key={'eq' + i}><line x1={x} y1={pT} x2={x} y2={H - pB} stroke={c} strokeWidth="0.8" strokeDasharray="2 3" opacity="0.5" />
                <path d={`M${x},${e.on ? pT + 2 : H - pB - 8} l-3,${e.on ? 6 : -6} l6,0 z`} fill={c} opacity="0.9" /></g>
            )})}
            {ticks.map((t, i) => <text key={i} x={xT(t)} y={H - 8} textAnchor="middle" fontSize="8" fill="#475569" fontFamily="monospace">{fmtHM(t)}</text>)}
          </svg>
          {eqNames.length > 0 && <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-[9px] text-[#64748b]">장비:</span>
            {eqNames.map(k => <span key={k} className="flex items-center gap-1 text-[9px]" style={{ color: eqColor[k] }}><span style={{ width: 8, height: 8, background: eqColor[k], display: 'inline-block', borderRadius: 2 }} />{k}</span>)}
            <span className="text-[9px] text-[#475569]">▲ON  ▽OFF</span>
          </div>}
        </div>

        {/* 변화량 막대 */}
        {main && <div className="rounded-lg p-3" style={{ background: '#070b12', border: '1px solid #16233a' }}>
          <span className="text-[11px] font-bold text-[#94a3b8]">구간 {main.name} 변화량 (Δ{main.unit})</span>
          <svg viewBox={`0 0 ${BW} ${BH}`} width="100%" style={{ display: 'block', marginTop: 4 }}>
            <line x1={bpL} y1={BH - bpB} x2={BW - bpR} y2={BH - bpB} stroke="#1e293b" strokeWidth="1" />
            {bars.map((b, i) => { const h = (Math.abs(b.d) / maxBar) * (BH - 14); const big = Math.abs(b.d) >= bigThresh
              return <rect key={i} x={bpL + i * bw + 1} y={BH - bpB - h} width={Math.max(1, bw - 1.5)} height={h} rx="1" fill={big ? '#ef4444' : '#334155'} /> })}
          </svg>
        </div>}

        {/* 에너지 · 외란 */}
        {(power.length > 0 || env.length > 0) && <div className="rounded-lg p-3" style={{ background: '#070b12', border: '1px solid #16233a' }}>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <span className="text-[11px] font-bold text-[#94a3b8]">에너지 · 외란</span>
            {env.map(s => <span key={s.id} className="flex items-center gap-1 text-[10px]"><Sun size={10} className="text-[#fbbf24]" /> {s.name}({s.unit})</span>)}
            {power.map(s => <span key={s.id} className="flex items-center gap-1 text-[10px]" style={{ color: s.color }}><Zap size={10} /> {s.name}({s.unit})</span>)}
          </div>
          <svg viewBox={`0 0 ${W} 150`} width="100%" style={{ display: 'block' }}>
            {(() => {
              const h = 150, pt = 10, pb = 22, ph = h - pt - pb
              const yMax = (s, v) => { const m = Math.max(1, ...s.data.map(p => p.v)); return pt + (1 - v / m) * ph }
              return <>
                {env.map(s => <path key={s.id} d={`${s.data.map((p, i) => `${i ? 'L' : 'M'}${xT(p.t).toFixed(1)},${yMax(s, p.v).toFixed(1)}`).join(' ')} L${xT(s.data[s.data.length - 1].t).toFixed(1)},${h - pb} L${xT(s.data[0].t).toFixed(1)},${h - pb} Z`} fill="#fbbf24" opacity="0.08" stroke="#fbbf24" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />)}
                {power.map(s => <path key={s.id} d={s.data.map((p, i) => `${i ? 'L' : 'M'}${xT(p.t).toFixed(1)},${yMax(s, p.v).toFixed(1)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />)}
                {ticks.map((t, i) => <text key={i} x={xT(t)} y={h - 8} textAnchor="middle" fontSize="8" fill="#475569" fontFamily="monospace">{fmtHM(t)}</text>)}
              </>
            })()}
          </svg>
        </div>}

        {/* 사용량 원인 · 절감 */}
        {usage && <div className="rounded-lg p-3" style={{ background: '#0a0f14', border: '1px solid #14532d' }}>
          <div className="flex items-center gap-1.5 mb-2"><Zap size={13} className="text-[#4ade80]" /><span className="text-[12px] font-bold text-[#86efac]">사용량 원인 · 절감</span></div>
          <div className="grid grid-cols-4 gap-2 mb-2">
            <Stat label="주간 평균" v={`${usage.dayAvg.toFixed(1)} ${usage.unit}`} c="#fbbf24" />
            <Stat label="야간 평균" v={`${usage.nightAvg.toFixed(1)} ${usage.unit}`} c="#60a5fa" />
            <Stat label="최대" v={`${usage.peak.v.toFixed(1)} ${usage.unit}`} sub={fmtHM(usage.peak.t)} c="#f87171" />
            <Stat label="추정 사용량" v={`${usage.kwh.toFixed(0)} kWh`} c="#4ade80" />
          </div>
          <div className="rounded p-2 text-[11px] leading-relaxed whitespace-pre-wrap" style={{ background: '#0f2018', border: '1px solid #166534', color: '#bbf7d0' }}>
            💡 <b>AI 분석 (원인·절감):</b> {aiText || (streaming ? '분석 중…' : '(로컬 AI 오프라인 — 위 요약·급변 원인 참고)')}
          </div>
        </div>}
        {!usage && aiText !== undefined && <div className="rounded-lg p-3" style={{ background: '#0a0f14', border: '1px solid #14532d' }}>
          <div className="rounded p-2 text-[11px] leading-relaxed whitespace-pre-wrap" style={{ color: '#bbf7d0' }}>💡 <b>AI 분석:</b> {aiText || (streaming ? '분석 중…' : '(요약 참고)')}</div>
        </div>}

        {/* 급변 구간 + 원인 */}
        <div className="rounded-lg p-3" style={{ background: '#0a0f14', border: '1px solid #7f1d1d' }}>
          <div className="flex items-center gap-1.5 mb-2"><Sparkles size={13} className="text-[#f87171]" /><span className="text-[12px] font-bold text-[#fca5a5]">급변 구간 · 원인 추종</span></div>
          <table className="w-full text-[11px] mb-2" style={{ borderCollapse: 'collapse' }}>
            <thead><tr className="text-[#64748b]">
              <th className="text-left py-1" style={{ borderBottom: '1px solid #1e293b' }}>시간대</th>
              <th className="text-left" style={{ borderBottom: '1px solid #1e293b' }}>변수</th>
              <th className="text-right" style={{ borderBottom: '1px solid #1e293b' }}>변화</th>
              <th className="text-left pl-3" style={{ borderBottom: '1px solid #1e293b' }}>추정 원인 (이벤트 대조)</th>
            </tr></thead>
            <tbody>
              {allSpikes.sort((a, b) => a.t0 - b.t0).map((sp, i) => (
                <tr key={i}>
                  <td className="py-1 font-mono text-[#e2e8f0]">{sp.hm0}~{sp.hm1}</td>
                  <td className="text-[#cbd5e1]">{sp.s.name}</td>
                  <td className="text-right font-mono font-bold" style={{ color: sp.d > 0 ? '#f87171' : '#38bdf8' }}>{sp.d > 0 ? '▲' : '▼'}{Math.abs(sp.d).toFixed(1)}{sp.s.unit}</td>
                  <td className="pl-3 text-[#fcd34d]">{sp.cause}</td>
                </tr>
              ))}
              {!allSpikes.length && <tr><td colSpan={4} className="py-2 text-[#475569]">뚜렷한 급변 구간 없음</td></tr>}
            </tbody>
          </table>
        </div>

        {/* 장비 가동 이력 */}
        <div className="rounded-lg p-3" style={{ background: '#070b12', border: '1px solid #16233a' }}>
          <span className="text-[11px] font-bold text-[#94a3b8]">장비 가동 이력 ({events.length}건)</span>
          <div className="mt-2 overflow-y-auto" style={{ maxHeight: 150 }}>
            <table className="w-full text-[10px] font-mono" style={{ borderCollapse: 'collapse' }}>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i}>
                    <td className="px-2 py-0.5 text-[#94a3b8]">{fmtHM(e.ts)}</td>
                    <td className="px-2 py-0.5 font-bold" style={{ color: e.color || '#e2e8f0' }}>{e.name}</td>
                    <td className="px-2 py-0.5 font-bold" style={{ color: e.on ? '#4ade80' : '#64748b' }}>{e.on ? '● 기동(ON)' : '○ 정지(OFF)'}</td>
                  </tr>
                ))}
                {!events.length && <tr><td className="py-2 px-2 text-[#475569]">장비 가동 이력 없음</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* 분당 데이터 표 (동적 컬럼) */}
        <div className="rounded-lg p-3" style={{ background: '#070b12', border: '1px solid #16233a' }}>
          <span className="text-[11px] font-bold text-[#94a3b8]">데이터 ({base.data.length}건)</span>
          <div className="mt-2 overflow-y-auto" style={{ maxHeight: 260 }}>
            <table className="w-full text-[10px] font-mono" style={{ borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#070b12' }}><tr className="text-[#64748b]">
                <th className="text-left py-1 px-2" style={{ borderBottom: '1px solid #1e293b' }}>시간</th>
                {[...pv, ...power, ...env].map(s => <th key={s.id} className="text-right px-2" style={{ borderBottom: '1px solid #1e293b' }}>{s.name}({s.unit})</th>)}
              </tr></thead>
              <tbody>
                {base.data.map((p, i) => {
                  const inSpike = allSpikes.some(sp => p.t >= sp.t0 && p.t <= sp.t)
                  return <tr key={i} style={inSpike ? { background: 'rgba(239,68,68,0.12)' } : undefined}>
                    <td className="px-2 text-[#94a3b8]">{fmtHM(p.t)}</td>
                    {[...pv, ...power, ...env].map(s => <td key={s.id} className="px-2 text-right" style={{ color: s.color }}>{s.data[i] ? nf(s, s.data[i].v) : ''}</td>)}
                  </tr>
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
