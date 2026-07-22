import { useState, useEffect, useCallback } from 'react'
import { LineChart, X, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Minus, Stethoscope } from 'lucide-react'
import { getHistory } from '../utils/api'
import { listOllamaModels, chatOllamaStream } from '../utils/ollama'

const MODEL_KEY = 'nexushmi.ollama.model'

const COLORS = ['#22c55e', '#00d4ff', '#f59e0b', '#a78bfa', '#ef4444', '#ec4899', '#84cc16', '#14b8a6']
const RANGES = [{ m: 5, l: '5분' }, { m: 30, l: '30분' }, { m: 60, l: '1시간' }, { m: 180, l: '3시간' }]

const V_W = 1000   // 차트 viewBox 너비
const V_H = 320    // 차트 viewBox 높이

const fmt = x => (x == null || Number.isNaN(Number(x)) ? '-' : Number(x).toFixed(2))
const hhmmss = ts => new Date(ts).toLocaleTimeString('ko', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

// 시리즈 → 한계대비%(0~100) 경로
function normPath(points, t, from, to) {
  if (!points?.length) return ''
  const range = (Number(t.max) - Number(t.min)) || 1
  const x = ts => ((ts - from) / (to - from || 1)) * V_W
  const y = v => V_H - Math.max(0, Math.min(1, (v - Number(t.min)) / range)) * V_H
  return points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
}

// 악화 판단 분석
function analyze(tags, data) {
  if (!data?.series) return []
  const tmap = Object.fromEntries(tags.map(t => [t.id, t]))
  const smap = Object.fromEntries((data.summary || []).map(s => [s.tagId, s]))
  return data.series.map(s => {
    const t = tmap[s.tagId] || {}
    const pts = s.points || []
    const last = pts.length ? pts[pts.length - 1].v : (smap[s.tagId]?.avg ?? null)
    const range = (Number(t.max) - Number(t.min)) || 1
    const isBit = t.type === 'BIT'
    const pct = last == null ? null : ((last - Number(t.min)) / range) * 100
    let trend = 0
    if (pts.length >= 4) {
      const k = Math.max(1, Math.floor(pts.length / 3))
      const avg = arr => arr.reduce((a, b) => a + b.v, 0) / arr.length
      trend = avg(pts.slice(-k)) - avg(pts.slice(0, k))
    }
    const trendPct = (trend / range) * 100
    const status = isBit ? (last === 1 ? 'ON' : 'OFF')
      : pct >= 85 ? '경고' : pct >= 70 ? '주의' : '정상'
    const concern = isBit ? -1 : (pct || 0) + (trendPct > 1 ? 15 : 0)
    return { tagId: s.tagId, label: t.desc || s.tagId, unit: t.unit || '', type: t.type, last, pct, trendPct, status, concern, summary: smap[s.tagId] }
  }).sort((a, b) => b.concern - a.concern)
}

// Gemma 진단 프롬프트
function buildDiagnosisPrompt(analysis, windowMin) {
  const rows = analysis.filter(a => a.type !== 'BIT').map(a =>
    `- ${a.label}: 현재 ${fmt(a.last)}${a.unit}, 한계대비 ${fmt(a.pct)}%, 추세 ${a.trendPct > 1 ? '상승' : a.trendPct < -1 ? '하강' : '안정'}(${fmt(a.trendPct)}%/구간), 상태 ${a.status}`
  ).join('\n')
  return `당신은 산업 설비 진단 전문가입니다. 아래는 최근 ${windowMin}분간의 설비 비교 분석입니다.
한국어로 간결하게 답하세요:
1) 가장 주의할 항목과 그 이유(가능한 원인)
2) 구체적 조치 권고 (불릿)
데이터에 없는 사실은 단정하지 말고, 한계대비 % 가 높거나 상승 추세인 항목을 우선하세요.

[비교 분석]
${rows || '(분석할 아날로그 태그 없음)'}`
}

function TrendIcon({ v }) {
  if (v > 1) return <TrendingUp size={11} className="text-[#ef4444]" />
  if (v < -1) return <TrendingDown size={11} className="text-[#22c55e]" />
  return <Minus size={11} className="text-[#4a5568]" />
}

export default function ChartViewer({ open, tags, tagIds, onClose }) {
  const [selected, setSelected] = useState(() => new Set(tagIds))
  const [windowMin, setWindowMin] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  // AI 진단
  const [aiOpen, setAiOpen] = useState(false)
  const [aiText, setAiText] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiModel, setAiModel] = useState('')

  // 열릴 때 선택 동기화
  useEffect(() => { if (open) setSelected(new Set(tagIds)) }, [open, tagIds])

  const fetchData = useCallback(async () => {
    const ids = [...selected]
    if (ids.length === 0) { setData(null); return }
    setLoading(true)
    const to = Date.now()
    const from = to - windowMin * 60000
    const bucket = Math.max(2000, Math.floor((to - from) / 150))
    const res = await getHistory({ tagId: ids, from, to, agg: 'avg', bucket })
    setData(res ? { ...res, from, to } : null)
    setLoading(false)
  }, [selected, windowMin])

  // 열림/선택/기간 변경 시 조회 + 5초 자동 갱신
  useEffect(() => {
    if (!open) return
    fetchData()
    const timer = setInterval(fetchData, 5000)
    return () => clearInterval(timer)
  }, [open, fetchData])

  if (!open) return null

  const colorOf = id => COLORS[[...selected].indexOf(id) % COLORS.length]
  const analysis = analyze(tags, data)
  const worst = analysis.find(a => a.type !== 'BIT' && a.pct != null)
  const from = data?.from
  const to = data?.to

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function runDiagnosis() {
    if (aiBusy) return
    setAiOpen(true)
    setAiText('')
    setAiBusy(true)
    let model = aiModel || (typeof localStorage !== 'undefined' && localStorage.getItem(MODEL_KEY)) || ''
    if (!model) {
      try {
        const list = await listOllamaModels()
        model = list.find(m => /gemma/i.test(m) && /(e2b|2b|1b)/i.test(m)) || list.find(m => /gemma/i.test(m)) || list[0] || ''
      } catch { /* offline */ }
      setAiModel(model)
    }
    if (!model) {
      setAiText('⚠ 사용할 Gemma 모델이 없습니다. `ollama pull gemma3` 후 다시 시도하세요.')
      setAiBusy(false)
      return
    }
    const prompt = buildDiagnosisPrompt(analysis, windowMin)
    try {
      await chatOllamaStream({
        model,
        messages: [{ role: 'user', content: prompt }],
        onDelta: d => setAiText(t => t + d),
      })
    } catch (err) {
      setAiText(t => t + `\n⚠ 진단 실패: ${err.message}\nOllama 연결(OLLAMA_ORIGINS)과 모델을 확인하세요.`)
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col" style={{ background: '#0a0e16' }}>
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-4 h-12 bg-[#0d1117] border-b border-[#2d3748] flex-shrink-0">
        <LineChart size={16} className="text-[#00d4ff]" />
        <span className="text-[13px] font-bold text-[#e2e8f0]">그래프 뷰어</span>
        <span className="text-[10px] text-[#4a5568]">한계 대비 % 비교 · {selected.size}개 선택</span>

        {/* 기간 선택 */}
        <div className="flex items-center gap-1 ml-3">
          {RANGES.map(r => (
            <button key={r.m} onClick={() => setWindowMin(r.m)}
              className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${windowMin === r.m ? 'bg-[#0f2444] text-[#00d4ff] border border-[#1e40af]' : 'text-[#718096] hover:bg-[#2d3748] border border-transparent'}`}>
              {r.l}
            </button>
          ))}
        </div>

        <button onClick={fetchData} title="새로고침"
          className="p-1.5 rounded hover:bg-[#2d3748] text-[#718096] hover:text-[#e2e8f0] transition-colors">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
        <span className="text-[9px] text-[#22c55e] flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" /> LIVE
        </span>

        <button onClick={runDiagnosis} disabled={aiBusy || !analysis.length} title="현재 비교 분석을 Gemma에게 진단 요청"
          className="ml-3 flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-bold transition-colors"
          style={aiBusy || !analysis.length
            ? { background: '#1a202c', border: '1px solid #2d3748', color: '#4a5568' }
            : { background: '#312e81', border: '1px solid #6366f1', color: '#c4b5fd' }}>
          <Stethoscope size={13} className={aiBusy ? 'animate-pulse' : ''} />
          {aiBusy ? '진단 중…' : 'AI 진단'}
        </button>

        <button onClick={onClose} className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-[11px] text-[#cbd5e1] hover:bg-[#450a0a] hover:text-[#ef4444] transition-colors">
          <X size={14} /> 닫기
        </button>
      </div>

      {/* 진단 배너 */}
      {worst && (
        <div className="px-4 py-2 flex items-center gap-2 flex-shrink-0"
          style={worst.pct >= 85 ? { background: '#2a0e0e', borderBottom: '1px solid #7f1d1d' }
            : worst.pct >= 70 ? { background: '#2a1e0a', borderBottom: '1px solid #78350f' }
              : { background: '#0f2018', borderBottom: '1px solid #166534' }}>
          <AlertTriangle size={14} className={worst.pct >= 85 ? 'text-[#ef4444]' : worst.pct >= 70 ? 'text-[#f59e0b]' : 'text-[#22c55e]'} />
          <span className="text-[11px] text-[#e2e8f0]">
            {worst.pct >= 70
              ? <>가장 주의 항목: <b style={{ color: colorOf(worst.tagId) }}>{worst.label}</b> — 한계의 <b>{fmt(worst.pct)}%</b>{worst.trendPct > 1 ? ', 상승 추세 ↑' : ''} → 점검 권장</>
              : <>전체 정상 범위입니다. 가장 높은 항목: <b style={{ color: colorOf(worst.tagId) }}>{worst.label}</b> (한계의 {fmt(worst.pct)}%)</>}
          </span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* 좌: 차트 */}
        <div className="flex-1 flex flex-col p-4 overflow-hidden min-w-0">
          {selected.size === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[12px] text-[#4a5568]">오른쪽에서 비교할 태그를 선택하세요.</div>
          ) : (
            <div className="flex-1 relative">
              <svg viewBox={`0 0 ${V_W} ${V_H}`} width="100%" height="100%" preserveAspectRatio="none" className="block">
                {/* 그리드 + 한계선 */}
                {[0, 25, 50, 75, 100].map(p => {
                  const y = V_H - (p / 100) * V_H
                  return <line key={p} x1="0" y1={y} x2={V_W} y2={y} stroke="#1e2736" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                })}
                <line x1="0" y1={V_H - 0.85 * V_H} x2={V_W} y2={V_H - 0.85 * V_H} stroke="#7f1d1d" strokeWidth="1.5" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
                {/* 시리즈 */}
                {(data?.series || []).map(s => {
                  const t = tags.find(x => x.id === s.tagId)
                  if (!t || t.type === 'BIT') return null
                  return <path key={s.tagId} d={normPath(s.points, t, from, to)} fill="none" stroke={colorOf(s.tagId)} strokeWidth="2" vectorEffect="non-scaling-stroke" />
                })}
              </svg>
              {/* Y축 라벨 */}
              <div className="absolute top-0 left-0 text-[9px] text-[#4a5568] font-mono">100% (한계)</div>
              <div className="absolute left-0 font-mono text-[9px] text-[#7f1d1d]" style={{ top: '15%' }}>85% 경고선</div>
              <div className="absolute bottom-0 left-0 text-[9px] text-[#4a5568] font-mono">0% (하한)</div>
              {/* X축 시간 */}
              {from && <div className="absolute bottom-[-14px] left-0 text-[9px] text-[#4a5568] font-mono">{hhmmss(from)}</div>}
              {to && <div className="absolute bottom-[-14px] right-0 text-[9px] text-[#4a5568] font-mono">{hhmmss(to)}</div>}
            </div>
          )}

          {/* AI 진단 결과 */}
          {aiOpen && (
            <div className="h-52 mt-4 rounded-lg border border-[#312e81] bg-[#0f1020] flex flex-col overflow-hidden flex-shrink-0">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1e1b4b] border-b border-[#312e81] flex-shrink-0">
                <Stethoscope size={12} className="text-[#a78bfa]" />
                <span className="text-[11px] font-bold text-[#c4b5fd]">AI 진단 결과</span>
                {aiModel && <span className="text-[9px] text-[#6366f1] font-mono">{aiModel}</span>}
                {aiBusy && <span className="text-[9px] text-[#a78bfa] animate-pulse">생성 중…</span>}
                <button onClick={() => setAiOpen(false)} className="ml-auto p-0.5 rounded hover:bg-[#312e81] text-[#6366f1] hover:text-[#c4b5fd]">
                  <X size={13} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 text-[11px] text-[#ddd6fe] leading-relaxed whitespace-pre-wrap">
                {aiText || (aiBusy ? '진단을 준비 중입니다…' : '')}
              </div>
            </div>
          )}
        </div>

        {/* 우: 태그 선택 + 분석표 */}
        <aside className="w-80 flex flex-col border-l border-[#2d3748] bg-[#0d1117] overflow-hidden flex-shrink-0">
          {/* 분석 (악화 순) */}
          <div className="px-3 py-2 border-b border-[#2d3748]">
            <p className="text-[10px] font-bold text-[#4a9eff] uppercase tracking-wide">비교 분석 (악화 순)</p>
          </div>
          <div className="overflow-y-auto flex-1">
            {analysis.length === 0 ? (
              <div className="p-3 text-[10px] text-[#4a5568]">데이터가 없습니다. 실행창을 켜두면 이력이 쌓입니다.</div>
            ) : analysis.map((a, i) => (
              <div key={a.tagId} className="px-3 py-2 border-b border-[#161d2a] flex items-center gap-2"
                style={i === 0 && a.type !== 'BIT' && a.pct >= 70 ? { background: '#1a0e0e' } : undefined}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colorOf(a.tagId) }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-mono text-[#e2e8f0] truncate">{a.label}</span>
                    {a.type !== 'BIT' && <TrendIcon v={a.trendPct} />}
                  </div>
                  <div className="text-[9px] text-[#64748b] font-mono">
                    {a.type === 'BIT' ? a.status : <>현재 {fmt(a.last)}{a.unit} · 한계 {fmt(a.pct)}%</>}
                  </div>
                </div>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                  style={a.status === '경고' ? { background: '#450a0a', color: '#ef4444' }
                    : a.status === '주의' ? { background: '#422006', color: '#f59e0b' }
                      : a.status === 'ON' ? { background: '#14532d', color: '#22c55e' }
                        : { background: '#1a202c', color: '#718096' }}>
                  {a.status}
                </span>
              </div>
            ))}
          </div>

          {/* 태그 토글 */}
          <div className="px-3 py-2 border-t border-[#2d3748]">
            <p className="text-[9px] font-bold text-[#4a5568] uppercase tracking-wide mb-1.5">표시할 태그 (클릭하여 추가/제거)</p>
            <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
              {tags.map(t => {
                const on = selected.has(t.id)
                return (
                  <button key={t.id} onClick={() => toggle(t.id)}
                    className="px-1.5 py-0.5 rounded text-[9px] font-mono border transition-colors"
                    style={on
                      ? { background: '#0f2444', borderColor: colorOf(t.id), color: colorOf(t.id) }
                      : { background: '#1a202c', borderColor: '#2d3748', color: '#64748b' }}>
                    {t.desc || t.id}
                  </button>
                )
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
