// 웹사이트 메인(랜딩) 페이지 — 로그아웃 상태에서 보이는 소개 홈
const FEATURES = [
  { i: '🎨', t: '드래그 편집기', d: '도형·게이지·트렌드·심볼로 화면을 자유롭게 구성' },
  { i: '▶️', t: '실시간 시뮬레이션', d: '가상 태그로 바로 실행하고 동작을 검증' },
  { i: '📊', t: 'AI 분석 보고서', d: '트렌드·급변 원인 추적, 엑셀로 내보내기' },
  { i: '☁️', t: '클라우드 저장', d: '로그인하면 어디서든 내 프로젝트 그대로' },
]

export default function Landing({ onStart }) {
  return (
    <div className="min-h-screen w-full overflow-x-hidden text-[#e2e8f0]" style={{ background: '#070b12' }}>
      {/* 상단 네비 */}
      <nav className="flex items-center justify-between max-w-6xl mx-auto px-6 h-16">
        <span className="text-[20px] font-extrabold tracking-tight"><span className="text-[#4a9eff]">Nexus</span><span>HMI</span></span>
        <button onClick={onStart} className="text-[13px] font-bold px-4 py-2 rounded-lg border border-[#1e2a3f] hover:bg-[#0f1520] transition-colors">로그인</button>
      </nav>

      {/* 히어로 */}
      <section className="relative">
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(900px 420px at 50% -5%, rgba(16,84,60,0.35), transparent)' }} />
        <div className="relative max-w-4xl mx-auto px-6 pt-20 pb-14 text-center">
          <span className="inline-block text-[11px] font-bold px-3 py-1 rounded-full mb-5" style={{ background: '#0f2b23', color: '#6ee7b7', border: '1px solid #14532d' }}>☁️ 클라우드 · 어디서든 이어서 작업</span>
          <h1 className="text-[38px] sm:text-[52px] font-extrabold leading-[1.1] tracking-tight">
            브라우저로 만드는<br /><span className="text-[#4a9eff]">산업용 HMI · SCADA</span>
          </h1>
          <p className="mt-5 text-[16px] text-[#94a3b8] max-w-xl mx-auto leading-relaxed">
            드래그로 화면을 그리고, 실시간 시뮬레이션과 AI 분석 보고서까지.
            설치 없이 웹에서 바로, 로그인하면 어디서든 이어서 작업하세요.
          </p>
          <div className="mt-8 flex items-center justify-center">
            <button onClick={onStart} className="h-12 px-7 rounded-xl font-bold text-[15px] text-white transition-colors"
              style={{ background: '#16a34a', boxShadow: '0 10px 30px rgba(22,163,74,0.35)' }}>무료로 시작하기 →</button>
          </div>
          <p className="mt-3 text-[12px] text-[#475569]">구글 계정으로 30초면 시작</p>
        </div>
      </section>

      {/* 기능 카드 */}
      <section className="max-w-5xl mx-auto px-6 py-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {FEATURES.map(f => (
          <div key={f.t} className="rounded-2xl p-5" style={{ background: '#0d1424', border: '1px solid #16233a' }}>
            <div className="text-[26px] mb-2">{f.i}</div>
            <h3 className="font-bold text-[15px] mb-1">{f.t}</h3>
            <p className="text-[12px] text-[#7c8aa5] leading-relaxed">{f.d}</p>
          </div>
        ))}
      </section>

      {/* 하단 CTA */}
      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        <h2 className="text-[26px] font-extrabold">지금 바로 시작하세요</h2>
        <p className="mt-2 text-[14px] text-[#94a3b8]">무료입니다. 작업물은 자동으로 클라우드에 저장됩니다.</p>
        <button onClick={onStart} className="mt-6 h-12 px-7 rounded-xl font-bold text-[15px] text-white bg-[#16a34a] hover:bg-[#15803d] transition-colors">시작하기 →</button>
      </section>

      <footer className="border-t border-[#111a28] py-6 text-center text-[12px] text-[#475569]">
        © 2026 NexusHMI · 웹 기반 SCADA / HMI 편집기
      </footer>
    </div>
  )
}
