// 웹사이트 메인(랜딩) 페이지 — 사용자 제공 디자인(HTML/CSS) 이식 + 로그인 연결
import { PRESETS } from '../data/presets'

// 랜딩 소개용 — 프리셋 id → 카테고리 (에디터 갤러리와 같은 데이터 공유)
const TPL_CAT = {
  recoiler:        { label: '권취', color: '#22c55e' },
  recoiler_torque: { label: '권취', color: '#22c55e' },
  uncoiler:        { label: '권출', color: '#38bdf8' },
  efficiency:      { label: '일반', color: '#a78bfa' },
}
const ROLE_LABEL = { input: '측정', setpoint: '설정', calc: '계산' }
function roleCounts(tags) {
  const c = { input: 0, setpoint: 0, calc: 0 }
  for (const t of tags) c[t.role || 'input'] = (c[t.role || 'input'] || 0) + 1
  return c
}

export default function Landing({ onStart }) {
  const scrollToTemplates = () =>
    document.getElementById('nx-templates')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="nx-landing">
      <style>{CSS}</style>
      <div className="bg-glow" />
      <div className="bg-wave" />

      <header>
        <div className="logo">Nexus<span>HMI</span></div>
        <nav className="nav-links">
          <button className="nav-link" onClick={scrollToTemplates}>템플릿</button>
          <button className="nav-btn" onClick={onStart}>로그인</button>
        </nav>
      </header>

      <main>
        <div className="badge">
          <span className="badge-icon" />
          <span>클라우드 · 어디서든 이어서 작업</span>
        </div>

        <h1 className="hero-title">
          브라우저로 만드는<br />
          <span className="highlight">산업용 HMI · SCADA</span>
        </h1>

        <div className="ai-centerpiece">
          <div className="ai-circle" />
          <div className="ai-core">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2a10 10 0 0 0-10 10c0 5.5 4.5 10 10 10s10-4.5 10-10A10 10 0 0 0 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 13v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
            </svg>
          </div>
        </div>

        <h2 className="sub-heading">AI 기반의 차세대 제어</h2>

        <p className="hero-desc">
          드래그로 화면을 그리고, 실시간 시뮬레이션과 <strong>AI 분석 보고서</strong>까지.<br />
          설치 없이 웹에서 바로, 로그인하면 어디서든 이어서 작업하세요.
        </p>

        <div className="cta-container">
          <button className="cta-btn" onClick={onStart}>
            <span>무료로 시작하기</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
          <span className="cta-subtext">구글 계정으로 30초면 시작</span>
        </div>

        <div className="features-grid">
          <div className="card">
            <div className="card-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.5 7.5" /></svg></div>
            <h3 className="card-title">드래그 편집기</h3>
            <p className="card-desc">도형·게이지·트렌드·심볼로 화면을 자유롭게 구성하세요.</p>
          </div>
          <div className="card">
            <div className="card-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg></div>
            <h3 className="card-title">실시간 시뮬레이션</h3>
            <p className="card-desc">가상 태그로 바로 실행하고 동작을 즉시 검증하세요.</p>
          </div>
          <div className="card">
            <div className="card-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg></div>
            <h3 className="card-title">AI 분석 보고서</h3>
            <p className="card-desc">트렌드 및 급변 원인을 추적하고 엑셀 보고서로 내보내세요.</p>
          </div>
          <div className="card">
            <div className="card-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" /></svg></div>
            <h3 className="card-title">클라우드 자동 저장</h3>
            <p className="card-desc">로그인하면 어디서든 내 프로젝트 그대로 이어 작업하세요.</p>
          </div>
        </div>

        {/* ── 템플릿 소개 (구경용 — 실제 사용은 로그인 후 편집기에서) ── */}
        <section id="nx-templates" className="tpl-section">
          <span className="tpl-eyebrow">검증된 제어 템플릿</span>
          <h2 className="tpl-title">복잡한 계산, <span>클릭 한 번</span>으로 태그 세트 완성</h2>
          <p className="tpl-sub">
            리코일러·언코일러 장력제어 같은 어려운 수식을 미리 만들어 뒀어요.<br />
            템플릿을 추가하고 PLC 주소만 연결하면 끝. <strong>로그인 후 편집기에서 바로 사용</strong>하세요.
          </p>

          <div className="tpl-grid">
            {PRESETS.map(p => {
              const cat = TPL_CAT[p.id] || { label: '일반', color: '#a78bfa' }
              const star = p.name.includes('⭐')
              const title = p.name.replace('⭐', '').trim()
              const counts = roleCounts(p.tags)
              return (
                <button key={p.id} className="tpl-card" onClick={onStart} title="로그인하고 사용하기">
                  <div className="tpl-card-top">
                    <span className="tpl-chip" style={{ background: cat.color + '22', color: cat.color, border: `1px solid ${cat.color}55` }}>{cat.label}</span>
                    {star && <span className="tpl-star">★ 추천</span>}
                  </div>
                  <h3 className="tpl-card-title">{title}</h3>
                  <p className="tpl-card-desc">{p.tagline || p.desc}</p>
                  <div className="tpl-badges">
                    {Object.entries(counts).filter(([, n]) => n > 0).map(([role, n]) => (
                      <span key={role} className="tpl-badge">{ROLE_LABEL[role]} {n}</span>
                    ))}
                  </div>
                  <span className="tpl-card-use">로그인하고 사용 →</span>
                </button>
              )
            })}
          </div>

          <div className="tpl-foot">
            <button className="cta-btn" onClick={onStart}>
              <span>로그인하고 템플릿 쓰기</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
            </button>
            <span className="tpl-market">🏪 직접 만든 템플릿을 마켓에 공유·판매 — 준비중</span>
          </div>
        </section>

        <div className="footer-banner">
          <h3>지금 바로 시작하세요</h3>
          <p>무료입니다. 작업물은 자동으로 클라우드에 안전하게 저장됩니다.</p>
          <button className="cta-btn" style={{ padding: '0.75rem 1.8rem', fontSize: '1rem' }} onClick={onStart}>
            <span>시작하기</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
          </button>
          <div className="copyright">© 2026 NexusHMI · 웹 기반 SCADA / HMI 편집기</div>
        </div>
      </main>
    </div>
  )
}

const CSS = `
.nx-landing { --bg-dark:#070a12; --primary-glow:#00f2ff; --secondary-glow:#0066ff; --accent-green:#10b981; --card-bg:rgba(13,20,38,0.5); --card-border:rgba(0,242,255,0.15); --card-border-hover:rgba(0,242,255,0.4); --text-main:#f3f4f6; --text-sub:#9ca3af;
  background-color:var(--bg-dark); color:var(--text-main); height:100vh; overflow-y:auto; overflow-x:hidden; position:relative; font-family:'Pretendard',-apple-system,BlinkMacSystemFont,system-ui,Roboto,sans-serif; }
.nx-landing * { margin:0; padding:0; box-sizing:border-box; font-family:inherit; }
.nx-landing .bg-glow { position:absolute; top:15%; left:50%; transform:translate(-50%,-50%); width:600px; height:350px; background:radial-gradient(ellipse at center, rgba(0,102,255,0.25) 0%, rgba(0,242,255,0.1) 40%, rgba(7,10,18,0) 70%); z-index:0; pointer-events:none; filter:blur(40px); }
.nx-landing .bg-wave { position:absolute; top:28%; left:0; width:100%; height:300px; background:linear-gradient(90deg, transparent, rgba(0,242,255,0.05), rgba(0,102,255,0.08), transparent); transform:skewY(-4deg); z-index:0; pointer-events:none; }
.nx-landing header { display:flex; justify-content:space-between; align-items:center; padding:1.5rem 4rem; position:relative; z-index:10; max-width:1400px; margin:0 auto; }
.nx-landing .logo { font-size:1.5rem; font-weight:800; letter-spacing:-0.5px; color:#fff; display:flex; align-items:center; }
.nx-landing .logo span { color:var(--primary-glow); text-shadow:0 0 12px rgba(0,242,255,0.6); }
.nx-landing .nav-btn { background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.15); color:#fff; padding:0.5rem 1.4rem; border-radius:8px; font-weight:500; font-size:0.9rem; cursor:pointer; transition:all 0.3s ease; }
.nx-landing .nav-btn:hover { background:rgba(255,255,255,0.12); border-color:rgba(255,255,255,0.3); box-shadow:0 0 15px rgba(255,255,255,0.1); }
.nx-landing main { max-width:1200px; margin:0 auto; padding:2rem 1.5rem 5rem; position:relative; z-index:1; text-align:center; }
.nx-landing .badge { display:inline-flex; align-items:center; gap:0.5rem; background:rgba(0,242,255,0.08); border:1px solid rgba(0,242,255,0.25); padding:0.4rem 1.1rem; border-radius:50px; font-size:0.85rem; color:#e0f7fa; margin-bottom:2rem; box-shadow:0 0 15px rgba(0,242,255,0.1); }
.nx-landing .badge-icon { width:8px; height:8px; background-color:var(--primary-glow); border-radius:50%; box-shadow:0 0 8px var(--primary-glow); }
.nx-landing .hero-title { font-size:3.2rem; font-weight:800; line-height:1.25; letter-spacing:-1px; margin-bottom:1.5rem; background:linear-gradient(180deg,#fff 30%,#a5f3fc 100%); -webkit-background-clip:text; -webkit-text-fill-color:transparent; text-shadow:0 10px 30px rgba(0,0,0,0.5); }
.nx-landing .hero-title .highlight { background:linear-gradient(90deg,#38bdf8,#00f2ff); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
.nx-landing .ai-centerpiece { position:relative; width:140px; height:140px; margin:1.5rem auto 2rem; display:flex; align-items:center; justify-content:center; }
.nx-landing .ai-circle { position:absolute; width:100%; height:100%; border-radius:50%; background:radial-gradient(circle, rgba(0,242,255,0.15) 0%, transparent 70%); border:1px solid rgba(0,242,255,0.4); box-shadow:0 0 30px rgba(0,242,255,0.25), inset 0 0 20px rgba(0,242,255,0.2); animation:nxPulse 3s infinite alternate; }
.nx-landing .ai-core { width:70px; height:70px; background:linear-gradient(135deg,#00f2ff,#0055ff); border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 0 25px rgba(0,242,255,0.8); z-index:2; }
.nx-landing .ai-core svg { width:36px; height:36px; fill:#fff; filter:drop-shadow(0 0 4px rgba(255,255,255,0.8)); }
@keyframes nxPulse { 0%{transform:scale(0.95); opacity:0.8;} 100%{transform:scale(1.08); opacity:1; box-shadow:0 0 45px rgba(0,242,255,0.4);} }
.nx-landing .sub-heading { font-size:1.8rem; font-weight:700; color:#fff; margin-bottom:1rem; letter-spacing:-0.5px; }
.nx-landing .hero-desc { font-size:1.05rem; color:var(--text-sub); line-height:1.6; max-width:680px; margin:0 auto 2.5rem; font-weight:400; }
.nx-landing .hero-desc strong { color:var(--primary-glow); font-weight:600; }
.nx-landing .cta-container { margin-bottom:4rem; }
.nx-landing .cta-btn { display:inline-flex; align-items:center; gap:0.6rem; background:linear-gradient(135deg,#059669 0%,#10b981 100%); color:#fff; font-size:1.1rem; font-weight:700; padding:0.9rem 2.2rem; border-radius:12px; cursor:pointer; box-shadow:0 0 25px rgba(16,185,129,0.4), inset 0 1px 0 rgba(255,255,255,0.3); border:1px solid rgba(52,211,153,0.5); transition:all 0.3s cubic-bezier(0.4,0,0.2,1); }
.nx-landing .cta-btn:hover { transform:translateY(-2px); box-shadow:0 0 35px rgba(16,185,129,0.6), inset 0 1px 0 rgba(255,255,255,0.5); background:linear-gradient(135deg,#047857 0%,#059669 100%); }
.nx-landing .cta-subtext { display:block; margin-top:0.7rem; font-size:0.85rem; color:#6b7280; }
.nx-landing .features-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:1.25rem; margin-top:2rem; }
.nx-landing .card { background:var(--card-bg); border:1px solid var(--card-border); border-radius:16px; padding:1.8rem 1.4rem; text-align:left; backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); transition:all 0.3s ease; position:relative; overflow:hidden; }
.nx-landing .card::before { content:''; position:absolute; top:0; left:0; width:100%; height:2px; background:linear-gradient(90deg, transparent, var(--primary-glow), transparent); opacity:0; transition:opacity 0.3s ease; }
.nx-landing .card:hover { transform:translateY(-4px); border-color:var(--card-border-hover); box-shadow:0 10px 30px rgba(0,0,0,0.4), 0 0 20px rgba(0,242,255,0.1); }
.nx-landing .card:hover::before { opacity:1; }
.nx-landing .card-icon { width:44px; height:44px; border-radius:10px; background:rgba(0,242,255,0.1); border:1px solid rgba(0,242,255,0.2); display:flex; align-items:center; justify-content:center; margin-bottom:1.2rem; color:var(--primary-glow); }
.nx-landing .card-title { font-size:1.15rem; font-weight:700; color:#fff; margin-bottom:0.6rem; }
.nx-landing .card-desc { font-size:0.88rem; color:var(--text-sub); line-height:1.5; }
.nx-landing .footer-banner { margin-top:5rem; padding-top:3rem; border-top:1px solid rgba(255,255,255,0.08); }
.nx-landing .footer-banner h3 { font-size:1.6rem; font-weight:700; margin-bottom:0.6rem; }
.nx-landing .footer-banner p { color:var(--text-sub); font-size:0.95rem; margin-bottom:1.5rem; }
.nx-landing .copyright { margin-top:4rem; font-size:0.8rem; color:#4b5563; }
.nx-landing .nav-links { display:flex; align-items:center; gap:1.3rem; }
.nx-landing .nav-link { background:none; border:none; color:var(--text-sub); font-size:0.9rem; font-weight:500; cursor:pointer; transition:color 0.2s ease; }
.nx-landing .nav-link:hover { color:#fff; text-shadow:0 0 10px rgba(0,242,255,0.4); }
.nx-landing .tpl-section { margin-top:6rem; text-align:center; scroll-margin-top:2rem; }
.nx-landing .tpl-eyebrow { display:inline-block; font-size:0.78rem; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:var(--primary-glow); margin-bottom:0.9rem; }
.nx-landing .tpl-title { font-size:2.2rem; font-weight:800; letter-spacing:-0.5px; margin-bottom:1rem; color:#fff; line-height:1.25; }
.nx-landing .tpl-title span { background:linear-gradient(90deg,#38bdf8,#00f2ff); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
.nx-landing .tpl-sub { font-size:1.02rem; color:var(--text-sub); line-height:1.65; max-width:660px; margin:0 auto 2.8rem; }
.nx-landing .tpl-sub strong { color:var(--primary-glow); font-weight:600; }
.nx-landing .tpl-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:1.25rem; }
.nx-landing .tpl-card { text-align:left; background:var(--card-bg); border:1px solid var(--card-border); border-radius:16px; padding:1.5rem 1.3rem; cursor:pointer; backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); transition:all 0.3s ease; display:flex; flex-direction:column; gap:0.7rem; position:relative; overflow:hidden; color:inherit; font-family:inherit; }
.nx-landing .tpl-card::before { content:''; position:absolute; top:0; left:0; width:100%; height:2px; background:linear-gradient(90deg, transparent, var(--primary-glow), transparent); opacity:0; transition:opacity 0.3s ease; }
.nx-landing .tpl-card:hover { transform:translateY(-4px); border-color:var(--card-border-hover); box-shadow:0 10px 30px rgba(0,0,0,0.4), 0 0 20px rgba(0,242,255,0.12); }
.nx-landing .tpl-card:hover::before { opacity:1; }
.nx-landing .tpl-card-top { display:flex; align-items:center; gap:0.5rem; }
.nx-landing .tpl-chip { font-size:0.7rem; font-weight:700; padding:0.15rem 0.65rem; border-radius:50px; }
.nx-landing .tpl-star { font-size:0.72rem; color:#fbbf24; font-weight:700; }
.nx-landing .tpl-card-title { font-size:1.02rem; font-weight:700; color:#fff; line-height:1.35; }
.nx-landing .tpl-card-desc { font-size:0.85rem; color:var(--text-sub); line-height:1.55; flex:1; }
.nx-landing .tpl-badges { display:flex; flex-wrap:wrap; gap:0.35rem; }
.nx-landing .tpl-badge { font-size:0.68rem; font-weight:600; padding:0.15rem 0.5rem; border-radius:6px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#cbd5e1; }
.nx-landing .tpl-card-use { font-size:0.78rem; font-weight:700; color:var(--primary-glow); margin-top:0.2rem; opacity:0.85; }
.nx-landing .tpl-foot { margin-top:2.8rem; display:flex; flex-direction:column; align-items:center; gap:0.9rem; }
.nx-landing .tpl-market { font-size:0.85rem; color:#6b7280; }
@media (max-width:1024px){ .nx-landing .features-grid{ grid-template-columns:repeat(2,1fr);} .nx-landing .tpl-grid{ grid-template-columns:repeat(2,1fr);} }
@media (max-width:640px){ .nx-landing header{ padding:1rem 1.5rem;} .nx-landing .hero-title{ font-size:2.2rem;} .nx-landing .sub-heading{ font-size:1.4rem;} .nx-landing .features-grid{ grid-template-columns:1fr;} .nx-landing .tpl-grid{ grid-template-columns:1fr;} .nx-landing .tpl-title{ font-size:1.7rem;} }
`
