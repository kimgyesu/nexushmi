// 패널용 경량 SVG 차트 (의존성 없음) — 시리즈별 스파크라인 + 통계
const COLORS = ['#22c55e', '#00d4ff', '#f59e0b', '#a78bfa']
const W = 250
const H = 38

const fmt = x => (x == null || Number.isNaN(Number(x)) ? '-' : Number(x).toFixed(2))

function Sparkline({ points, color }) {
  if (!points || points.length < 2) {
    return <div className="text-[9px] text-[#4a5568] py-2">데이터 부족 (실행창을 잠시 켜두면 쌓입니다)</div>
  }
  const vs = points.map(p => p.v)
  const min = Math.min(...vs)
  const max = Math.max(...vs)
  const span = (max - min) || 1
  const n = points.length
  const xAt = i => (i / (n - 1)) * (W - 4) + 2
  const yAt = v => (H - 3) - ((v - min) / span) * (H - 6)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(p.v).toFixed(1)}`).join(' ')
  const lastX = xAt(n - 1)
  const lastY = yAt(points[n - 1].v)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className="block">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <circle cx={lastX} cy={lastY} r="2.2" fill={color} />
    </svg>
  )
}

export function ChartCard({ chart }) {
  return (
    <div className="rounded-lg border border-[#166534] bg-[#0a1410] p-2 w-full">
      <div className="text-[10px] font-bold text-[#6ee7b7] mb-1.5">{chart.title}</div>
      <div className="space-y-2">
        {chart.series.map((s, i) => {
          const color = COLORS[i % COLORS.length]
          const last = s.points?.length ? s.points[s.points.length - 1].v : null
          return (
            <div key={s.tagId} className="rounded bg-[#0f172a] border border-[#1e2a4a] p-1.5">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] font-mono font-bold" style={{ color }}>{s.label}</span>
                <span className="text-[10px] text-[#e2e8f0] font-mono">{fmt(last)}<span className="text-[#4a9eff]">{s.unit}</span></span>
              </div>
              <Sparkline points={s.points} color={color} />
              <div className="flex gap-2 mt-0.5 text-[8px] text-[#64748b] font-mono">
                <span className="text-[#22c55e]">평균 {fmt(s.avg)}{s.unit}</span>
                <span>최소 {fmt(s.min)}</span>
                <span>최대 {fmt(s.max)}</span>
                <span className="ml-auto">{s.points?.length ?? 0}p</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
