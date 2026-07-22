// 웹사이트 메인(랜딩) 페이지 — AI 코어 히어로 (중앙 정렬, 겹침 없음)
const FEATURES = [
  { i: '🎨', t: '드래그 편집기', d: '도형·게이지·트렌드·심볼로 화면을 자유롭게 구성' },
  { i: '▶️', t: '실시간 시뮬레이션', d: '가상 태그로 바로 실행하고 동작을 검증' },
  { i: '📊', t: 'AI 분석 보고서', d: '트렌드·급변 원인 추적, 엑셀로 내보내기' },
  { i: '☁️', t: '클라우드 저장', d: '로그인하면 어디서든 내 프로젝트 그대로' },
]

function MiniPanel({ title, accent, kind, className, rotate }) {
  return (
    <div className={`rounded-xl p-2.5 ${className}`} style={{
      width: 150, background: 'linear-gradient(160deg,#0d1a33,#0a1120)', border: '1px solid #1c3a5e',
      boxShadow: `0 0 24px ${accent}22`, transform: `perspective(900px) ${rotate}`,
    }}>
      <div className="flex items-center gap-1 mb-1.5">
        <span style={{ width: 6, height: 6, borderRadius: 9, background: accent, boxShadow: `0 0 6px ${accent}` }} />
        <span className="text-[9px] font-bold text-[#8fb4e0]">{title}</span>
      </div>
      <svg viewBox="0 0 140 52" width="100%">
        {kind === 'bars' && [16, 30, 20, 36, 26, 42].map((h, i) => <rect key={i} x={8 + i * 22} y={48 - h} width={13} height={h} rx={2} fill={accent} opacity={0.55 + i * 0.06} />)}
        {kind === 'trend' && <><polyline points="4,40 24,26 44,32 64,14 84,24 104,10 132,18" fill="none" stroke={accent} strokeWidth="2" /><polyline points="4,46 24,38 44,42 64,30 84,36 104,26 132,32" fill="none" stroke="#f472b6" strokeWidth="1.5" opacity="0.75" /></>}
        {kind === 'ai' && <><circle cx="70" cy="24" r="15" fill="none" stroke={accent} strokeWidth="2" /><text x="70" y="29" textAnchor="middle" fontSize="13" fontWeight="800" fill={accent}>AI</text><circle cx="30" cy="46" r="2" fill="#6ee7b7" /><circle cx="70" cy="46" r="2" fill="#fbbf24" /><circle cx="110" cy="46" r="2" fill="#f472b6" /></>}
      </svg>
    </div>
  )
}

export default function Landing({ onStart }) {
  return (
    <div className="min-h-screen w-full overflow-x-hidden text-[#e6edf7]" style={{ background: '#060a12' }}>
      <style>{`@keyframes nxPulse{0%,100%{opacity:.55}50%{opacity:1}}@keyframes nxFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}`}</style>

      <nav className="relative z-20 flex items-center justify-between max-w-6xl mx-auto px-6 h-16">
        <span className="text-[20px] font-extrabold tracking-tight"><span className="text-[#4a9eff]">Nexus</span><span>HMI</span></span>
        <button onClick={onStart} className="text-[13px] font-bold px-4 py-2 rounded-lg border border-[#22406a] text-[#cbd5e1] hover:bg-[#0f1b30] transition-colors">로그인</button>
      </nav>

      {/* 히어로 — 세로/가로 중앙 정렬 */}
      <section className="relative flex items-center justify-center overflow-hidden" style={{ minHeight: 'calc(100vh - 64px)' }}>
        {/* 배경 글로우 */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="ctr" cx="50%" cy="45%" r="50%"><stop offset="0%" stopColor="#0e7490" stopOpacity="0.5" /><stop offset="45%" stopColor="#0c4a6e" stopOpacity="0.15" /><stop offset="100%" stopColor="#060a12" stopOpacity="0" /></radialGradient>
            <linearGradient id="beam" x1="0" x2="1"><stop offset="0%" stopColor="#22d3ee" stopOpacity="0" /><stop offset="50%" stopColor="#67e8f9" stopOpacity="0.6" /><stop offset="100%" stopColor="#22d3ee" stopOpacity="0" /></linearGradient>
          </defs>
          <ellipse cx="600" cy="330" rx="540" ry="280" fill="url(#ctr)" />
          <path d="M0,470 C300,440 900,500 1200,458" stroke="url(#beam)" strokeWidth="2" fill="none" opacity="0.8" />
        </svg>

        {/* 좌측 떠다니는 화면 (넓은 화면만) */}
        <div className="hidden lg:flex flex-col gap-5 absolute left-[3%] top-1/2 -translate-y-1/2 z-0" style={{ animation: 'nxFloat 6s ease-in-out infinite' }}>
          <MiniPanel title="화면 편집" kind="bars" accent="#38bdf8" rotate="rotateY(22deg) rotate(-3deg)" />
          <MiniPanel title="실시간 트렌드" kind="trend" accent="#22d3ee" rotate="rotateY(18deg) rotate(-2deg)" className="ml-8" />
        </div>
        {/* 우측 떠다니는 화면 */}
        <div className="hidden lg:flex flex-col gap-5 absolute right-[3%] top-1/2 -translate-y-1/2 z-0" style={{ animation: 'nxFloat 7s ease-in-out infinite reverse' }}>
          <MiniPanel title="AI 분석 보고서" kind="ai" accent="#34d399" rotate="rotateY(-22deg) rotate(3deg)" />
          <MiniPanel title="패턴·고장 예측" kind="trend" accent="#a78bfa" rotate="rotateY(-18deg) rotate(2deg)" className="mr-8 self-end" />
        </div>

        {/* 중앙 콘텐츠 */}
        <div className="relative z-10 w-full max-w-xl mx-auto px-6 text-center">
          <span className="inline-block text-[11px] font-bold px-3 py-1 rounded-full" style={{ background: 'rgba(15,43,35,0.7)', color: '#6ee7b7', border: '1px solid #14532d' }}>☁️ 클라우드 · 어디서든 이어서 작업</span>
          <h1 className="mt-6 text-[36px] sm:text-[52px] font-extrabold leading-[1.08] tracking-tight">
            브라우저로 만드는<br /><span style={{ background: 'linear-gradient(90deg,#67e8f9,#4a9eff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>산업용 HMI · SCADA</span>
          </h1>

          <div className="my-6 flex justify-center" style={{ animation: 'nxPulse 3s ease-in-out infinite' }}>
            <svg width="132" height="108" viewBox="0 0 132 108">
              <defs><radialGradient id="core" cx="50%" cy="45%" r="55%"><stop offset="0%" stopColor="#67e8f9" stopOpacity="0.85" /><stop offset="60%" stopColor="#0891b2" stopOpacity="0.3" /><stop offset="100%" stopColor="#0891b2" stopOpacity="0" /></radialGradient></defs>
              <ellipse cx="66" cy="52" rx="56" ry="42" fill="url(#core)" />
              <polygon points="66,18 96,36 96,68 66,86 36,68 36,36" fill="#06131f" stroke="#22d3ee" strokeWidth="2" style={{ filter: 'drop-shadow(0 0 7px #22d3ee)' }} />
              <text x="66" y="60" textAnchor="middle" fontSize="21" fontWeight="800" fill="#67e8f9" style={{ filter: 'drop-shadow(0 0 5px #22d3ee)' }}>AI</text>
            </svg>
          </div>

          <h2 className="text-[19px] sm:text-[22px] font-extrabold text-[#dbeafe]">AI 기반의 차세대 제어</h2>
          <p className="mt-3 text-[15px] text-[#93a4bd] leading-relaxed">드래그로 화면을 그리고, 실시간 시뮬레이션과 AI 분석 보고서까지. 설치 없이 웹에서 바로, 로그인하면 어디서든 이어서 작업하세요.</p>
          <div className="mt-7 flex justify-center">
            <button onClick={onStart} className="h-12 px-8 rounded-xl font-bold text-[15px] text-white transition-transform hover:scale-[1.03]"
              style={{ background: 'linear-gradient(180deg,#22c55e,#15803d)', border: '1px solid #4ade80', boxShadow: '0 0 30px rgba(34,197,94,0.45)' }}>무료로 시작하기 →</button>
          </div>
          <p className="mt-3 text-[12px] text-[#5b6b83]">구글 계정으로 30초면 시작</p>
        </div>
      </section>

      {/* 기능 카드 */}
      <section className="max-w-5xl mx-auto px-6 py-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {FEATURES.map(f => (
          <div key={f.t} className="rounded-2xl p-5" style={{ background: '#0c1424', border: '1px solid #16233a' }}>
            <div className="text-[26px] mb-2">{f.i}</div>
            <h3 className="font-bold text-[15px] mb-1">{f.t}</h3>
            <p className="text-[12px] text-[#7c8aa5] leading-relaxed">{f.d}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-[#111a28] py-6 text-center text-[12px] text-[#475569]">© 2026 NexusHMI · 웹 기반 SCADA / HMI 편집기</footer>
    </div>
  )
}
