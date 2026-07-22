// 웹사이트 메인(랜딩) 페이지 — AI 기반 차세대 제어 컨셉의 미래형 히어로
const FEATURES = [
  { i: '🎨', t: '드래그 편집기', d: '도형·게이지·트렌드·심볼로 화면을 자유롭게 구성' },
  { i: '▶️', t: '실시간 시뮬레이션', d: '가상 태그로 바로 실행하고 동작을 검증' },
  { i: '📊', t: 'AI 분석 보고서', d: '트렌드·급변 원인 추적, 엑셀로 내보내기' },
  { i: '☁️', t: '클라우드 저장', d: '로그인하면 어디서든 내 프로젝트 그대로' },
]

// 떠다니는 미니 HMI 화면 목업
function MiniPanel({ style, title, accent = '#38bdf8', kind = 'bars' }) {
  return (
    <div className="absolute rounded-xl p-2.5 hidden md:block" style={{
      width: 158, background: 'linear-gradient(160deg,#0d1a33,#0a1120)', border: '1px solid #1c3a5e',
      boxShadow: `0 0 26px ${accent}22, inset 0 0 22px #0a1a3055`, ...style,
    }}>
      <div className="flex items-center gap-1 mb-2">
        <span style={{ width: 6, height: 6, borderRadius: 9, background: accent, boxShadow: `0 0 6px ${accent}` }} />
        <span className="text-[9px] font-bold text-[#8fb4e0]">{title}</span>
      </div>
      <svg viewBox="0 0 140 58" width="100%">
        {kind === 'bars' && [18, 34, 22, 40, 28, 46].map((h, i) => (
          <rect key={i} x={8 + i * 22} y={54 - h} width={13} height={h} rx={2} fill={accent} opacity={0.55 + i * 0.06} />
        ))}
        {kind === 'trend' && <>
          <polyline points="4,44 24,30 44,36 64,16 84,26 104,10 132,20" fill="none" stroke={accent} strokeWidth="2" />
          <polyline points="4,50 24,42 44,46 64,34 84,40 104,30 132,36" fill="none" stroke="#f472b6" strokeWidth="1.5" opacity="0.8" />
        </>}
        {kind === 'ai' && <>
          <circle cx="70" cy="28" r="16" fill="none" stroke={accent} strokeWidth="2" />
          <text x="70" y="33" textAnchor="middle" fontSize="13" fontWeight="800" fill={accent}>AI</text>
          <path d="M8,50 H132" stroke="#1c3a5e" strokeWidth="1" />
          <circle cx="24" cy="50" r="2" fill="#6ee7b7" /><circle cx="70" cy="50" r="2" fill="#fbbf24" /><circle cx="116" cy="50" r="2" fill="#f472b6" />
        </>}
      </svg>
    </div>
  )
}

export default function Landing({ onStart }) {
  return (
    <div className="min-h-screen w-full overflow-x-hidden text-[#e6edf7]" style={{ background: '#060a12' }}>
      <style>{`
        @keyframes nxPulse{0%,100%{opacity:.5}50%{opacity:1}}
        @keyframes nxFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
        @keyframes nxDash{to{stroke-dashoffset:-40}}
      `}</style>

      {/* 네비 */}
      <nav className="relative z-20 flex items-center justify-between max-w-6xl mx-auto px-6 h-16">
        <span className="text-[20px] font-extrabold tracking-tight"><span className="text-[#4a9eff]">Nexus</span><span>HMI</span></span>
        <button onClick={onStart} className="text-[13px] font-bold px-4 py-2 rounded-lg border border-[#22406a] text-[#cbd5e1] hover:bg-[#0f1b30] transition-colors">로그인</button>
      </nav>

      {/* 히어로 */}
      <section className="relative overflow-hidden" style={{ minHeight: '84vh' }}>
        {/* 배경 아트: 글로우 빔 + 회로선 */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1200 640" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="ctr" cx="50%" cy="42%" r="50%">
              <stop offset="0%" stopColor="#0e7490" stopOpacity="0.55" />
              <stop offset="45%" stopColor="#0c4a6e" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#060a12" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="beam" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
              <stop offset="50%" stopColor="#67e8f9" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
            </linearGradient>
            <filter id="blur"><feGaussianBlur stdDeviation="9" /></filter>
          </defs>
          <ellipse cx="600" cy="270" rx="520" ry="260" fill="url(#ctr)" />
          <g filter="url(#blur)" opacity="0.8"><path d="M0,330 C300,300 900,360 1200,318" stroke="url(#beam)" strokeWidth="8" fill="none" /></g>
          <path d="M0,346 C300,320 900,372 1200,336" stroke="url(#beam)" strokeWidth="1.5" fill="none" opacity="0.9" />
          {/* 회로선 (중앙에서 방사) */}
          <g stroke="#164e63" strokeWidth="1.2" fill="none" opacity="0.6" strokeDasharray="3 5" style={{ animation: 'nxDash 3s linear infinite' }}>
            <path d="M600,250 L360,150 L180,150" /><path d="M600,250 L840,150 L1020,150" />
            <path d="M600,250 L380,360 L200,380" /><path d="M600,250 L820,360 L1000,380" />
          </g>
          <g fill="#22d3ee">{[[360, 150], [180, 150], [840, 150], [1020, 150], [380, 360], [820, 360]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3" opacity="0.8" />)}</g>
        </svg>

        {/* 떠다니는 미니 화면 */}
        <div style={{ animation: 'nxFloat 6s ease-in-out infinite' }}>
          <MiniPanel title="화면 편집" kind="bars" accent="#38bdf8" style={{ left: '6%', top: '46%', transform: 'perspective(900px) rotateY(24deg) rotate(-4deg)' }} />
          <MiniPanel title="실시간 트렌드" kind="trend" accent="#22d3ee" style={{ left: '15%', top: '62%', transform: 'perspective(900px) rotateY(20deg) rotate(-2deg)', opacity: 0.9 }} />
        </div>
        <div style={{ animation: 'nxFloat 7s ease-in-out infinite reverse' }}>
          <MiniPanel title="AI 분석 보고서" kind="ai" accent="#34d399" style={{ right: '6%', top: '46%', transform: 'perspective(900px) rotateY(-24deg) rotate(4deg)' }} />
          <MiniPanel title="패턴·고장 예측" kind="trend" accent="#a78bfa" style={{ right: '15%', top: '62%', transform: 'perspective(900px) rotateY(-20deg) rotate(2deg)', opacity: 0.9 }} />
        </div>

        {/* 중앙 콘텐츠 */}
        <div className="relative z-10 max-w-3xl mx-auto px-6 pt-10 text-center">
          <span className="inline-block text-[11px] font-bold px-3 py-1 rounded-full mb-6" style={{ background: 'rgba(15,43,35,0.7)', color: '#6ee7b7', border: '1px solid #14532d' }}>☁️ 클라우드 · 어디서든 이어서 작업</span>
          <h1 className="text-[34px] sm:text-[50px] font-extrabold leading-[1.08] tracking-tight" style={{ textShadow: '0 2px 30px rgba(34,211,238,0.25)' }}>
            브라우저로 만드는<br /><span style={{ background: 'linear-gradient(90deg,#67e8f9,#4a9eff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>산업용 HMI · SCADA</span>
          </h1>

          {/* AI 코어 */}
          <div className="my-5 flex justify-center" style={{ animation: 'nxPulse 3s ease-in-out infinite' }}>
            <svg width="150" height="120" viewBox="0 0 150 120">
              <defs><radialGradient id="core" cx="50%" cy="45%" r="55%"><stop offset="0%" stopColor="#67e8f9" stopOpacity="0.9" /><stop offset="60%" stopColor="#0891b2" stopOpacity="0.35" /><stop offset="100%" stopColor="#0891b2" stopOpacity="0" /></radialGradient></defs>
              <ellipse cx="75" cy="55" rx="60" ry="45" fill="url(#core)" />
              <polygon points="75,20 108,40 108,72 75,92 42,72 42,40" fill="#06131f" stroke="#22d3ee" strokeWidth="2" style={{ filter: 'drop-shadow(0 0 8px #22d3ee)' }} />
              <text x="75" y="62" textAnchor="middle" fontSize="22" fontWeight="800" fill="#67e8f9" style={{ filter: 'drop-shadow(0 0 6px #22d3ee)' }}>AI</text>
            </svg>
          </div>

          <h2 className="text-[19px] sm:text-[22px] font-extrabold text-[#dbeafe]">AI 기반의 차세대 제어</h2>
          <p className="mt-3 text-[15px] text-[#93a4bd] max-w-lg mx-auto leading-relaxed">
            드래그로 화면을 그리고, 실시간 시뮬레이션과 AI 분석 보고서까지.
            설치 없이 웹에서 바로, 로그인하면 어디서든 이어서 작업하세요.
          </p>
          <div className="mt-7 flex justify-center">
            <button onClick={onStart} className="h-12 px-8 rounded-xl font-bold text-[15px] text-white transition-transform hover:scale-[1.03]"
              style={{ background: 'linear-gradient(180deg,#22c55e,#15803d)', border: '1px solid #4ade80', boxShadow: '0 0 30px rgba(34,197,94,0.5), inset 0 1px 0 rgba(255,255,255,0.3)' }}>
              무료로 시작하기 →
            </button>
          </div>
          <p className="mt-3 text-[12px] text-[#5b6b83]">구글 계정으로 30초면 시작</p>
        </div>
      </section>

      {/* 기능 카드 */}
      <section className="max-w-5xl mx-auto px-6 py-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {FEATURES.map(f => (
          <div key={f.t} className="rounded-2xl p-5" style={{ background: '#0c1424', border: '1px solid #16233a' }}>
            <div className="text-[26px] mb-2">{f.i}</div>
            <h3 className="font-bold text-[15px] mb-1">{f.t}</h3>
            <p className="text-[12px] text-[#7c8aa5] leading-relaxed">{f.d}</p>
          </div>
        ))}
      </section>

      {/* 하단 CTA */}
      <section className="max-w-3xl mx-auto px-6 pb-16 text-center">
        <button onClick={onStart} className="h-12 px-8 rounded-xl font-bold text-[15px] text-white bg-[#16a34a] hover:bg-[#15803d] transition-colors">지금 시작하기 →</button>
      </section>

      <footer className="border-t border-[#111a28] py-6 text-center text-[12px] text-[#475569]">
        © 2026 NexusHMI · 웹 기반 SCADA / HMI 편집기
      </footer>
    </div>
  )
}
