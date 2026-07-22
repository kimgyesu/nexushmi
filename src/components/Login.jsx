import { useState } from 'react'
import { signInGoogle, signInEmail, signUpEmail } from '../auth/useAuth'

export default function Login() {
  const [mode, setMode] = useState('signin')   // signin | signup
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const google = async () => { setErr(''); setBusy(true); try { await signInGoogle() } catch (e) { setErr(msg(e)) } finally { setBusy(false) } }
  const submit = async e => {
    e.preventDefault(); setErr(''); setBusy(true)
    try { await (mode === 'signup' ? signUpEmail(email, pw) : signInEmail(email, pw)) }
    catch (e) { setErr(msg(e)) } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen w-screen flex items-center justify-center" style={{ background: 'radial-gradient(1200px 600px at 50% -10%, #0f2b23, #070b12)' }}>
      <div className="w-[360px] rounded-2xl p-7" style={{ background: '#0f1520', border: '1px solid #1e2a3f', boxShadow: '0 20px 60px #0008' }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[20px] font-extrabold tracking-tight"><span className="text-[#4a9eff]">Nexus</span><span className="text-[#e2e8f0]">HMI</span></span>
        </div>
        <p className="text-[12px] text-[#64748b] mb-6">로그인하고 내 프로젝트를 어디서든 이어서 작업하세요.</p>

        <button onClick={google} disabled={busy}
          className="w-full flex items-center justify-center gap-2 h-11 rounded-lg font-bold text-[14px] text-[#1f2937] bg-white hover:bg-[#f1f5f9] transition-colors disabled:opacity-60">
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.4 5.4 2.5 13.2l7.9 6.1C12.3 13.2 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-4 6.2-9.9 6.2-17.2z"/><path fill="#FBBC05" d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.5 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.3-5.5l-7.3-5.7c-2 1.4-4.7 2.3-8 2.3-6.3 0-11.7-3.7-13.6-9.1l-7.9 6.1C6.4 42.6 14.6 48 24 48z"/></svg>
          Google로 계속하기
        </button>

        <div className="flex items-center gap-3 my-5"><div className="flex-1 h-px bg-[#1e2a3f]" /><span className="text-[10px] text-[#475569]">또는 이메일</span><div className="flex-1 h-px bg-[#1e2a3f]" /></div>

        <form onSubmit={submit} className="space-y-2.5">
          <input type="email" required placeholder="이메일" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full h-11 px-3 rounded-lg text-[14px] text-[#e2e8f0] bg-[#0b1220] border border-[#1e2a3f] outline-none focus:border-[#3b82f6]" />
          <input type="password" required placeholder="비밀번호 (6자 이상)" value={pw} onChange={e => setPw(e.target.value)}
            className="w-full h-11 px-3 rounded-lg text-[14px] text-[#e2e8f0] bg-[#0b1220] border border-[#1e2a3f] outline-none focus:border-[#3b82f6]" />
          {err && <p className="text-[11px] text-[#fca5a5]">{err}</p>}
          <button type="submit" disabled={busy}
            className="w-full h-11 rounded-lg font-bold text-[14px] text-white bg-[#16a34a] hover:bg-[#15803d] transition-colors disabled:opacity-60">
            {busy ? '처리 중…' : (mode === 'signup' ? '가입하고 시작' : '로그인')}
          </button>
        </form>

        <p className="text-center text-[12px] text-[#64748b] mt-4">
          {mode === 'signup' ? '이미 계정이 있나요? ' : '계정이 없나요? '}
          <button onClick={() => { setErr(''); setMode(mode === 'signup' ? 'signin' : 'signup') }} className="text-[#60a5fa] font-bold">
            {mode === 'signup' ? '로그인' : '가입하기'}
          </button>
        </p>
      </div>
    </div>
  )
}

function msg(e) {
  const c = e?.code || ''
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return '이메일 또는 비밀번호가 올바르지 않습니다.'
  if (c.includes('email-already-in-use')) return '이미 가입된 이메일입니다. 로그인하세요.'
  if (c.includes('weak-password')) return '비밀번호는 6자 이상이어야 합니다.'
  if (c.includes('popup-closed')) return '로그인 창이 닫혔습니다.'
  if (c.includes('operation-not-allowed')) return '이 로그인 방식이 Firebase 콘솔에서 아직 활성화되지 않았습니다.'
  return e?.message || '로그인 중 오류가 발생했습니다.'
}
