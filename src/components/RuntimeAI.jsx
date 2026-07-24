import { useState, useRef, useEffect } from 'react'
import { Bot, Send, User, Cpu, RefreshCw, Square } from 'lucide-react'
import { listOllamaModels, chatOllamaStream } from '../utils/ollama'
import * as XLSX from 'xlsx'
import { isChartQuery, isExportQuery, isReportQuery, isLogQuery, resolveChartQuery, parseWindowMs } from '../utils/chartQuery'
import { getHistory, getHealth, getEvents } from '../utils/api'
import { ChartCard } from './MiniChart'
import { buildDemoReport, buildReportFromLogger, reportPrompt } from '../utils/buildReport'
import { exportStateToExcel } from '../utils/reportExcel'
import AnalysisDashboard from './AnalysisDashboard'
import { useAccess } from '../auth/access'
import { Lock } from 'lucide-react'

// 분석 대시보드 요청 판별
function isAnalysisQuery(t) {
  if (/급변|추종|분석\s*대시보드|대시보드\s*분석/.test(t)) return true
  if (/(분석|원인|변화)/.test(t) && /(온도|습도|온습도|어제|하루|일간)/.test(t)) return true
  return false
}

// "현재 상태/요약을 엑셀로" — 현재 상태 스냅샷 엑셀
function isStateExcelQuery(t) {
  return /엑셀|excel|xlsx|파일로|저장/.test(t) && /상태|요약|현재|스냅샷|전체|지금/.test(t)
}

const numf = x => (x == null ? '-' : Number(x).toFixed(2))

// 능동 감시 — 심각도 메타
const SEV_META = {
  경보: { o: 3, color: '#ef4444', bg: '#2a0e0e', border: '#7f1d1d', icon: '🔴' },
  주의: { o: 2, color: '#f59e0b', bg: '#2a1e0a', border: '#78500f', icon: '🟡' },
}
// 규칙 기반 이상 감지(결정적) — 상한 근접·알람비트 ON·급변 + 예상(수식)↔실제 편차
function scanFindings(tags, prev) {
  const out = []
  const byId = {}; for (const t of tags) byId[t.id] = t
  // 예상(계산 태그) ↔ 실제(측정 태그) 편차 감시 — 허용% 초과 시
  for (const t of tags) {
    if (!t.formula || !t.watchActual) continue
    const act = byId[t.watchActual]; if (!act) continue
    const expected = Number(t.value) || 0, actual = Number(act.value) || 0
    const tol = Number.isFinite(+t.watchTol) ? +t.watchTol : 5
    const base = Math.abs(expected) > 1e-9 ? Math.abs(expected) : (Math.abs(actual) || 1)
    const devPct = Math.abs(expected - actual) / base * 100
    if (devPct > tol) {
      const sev = devPct > tol * 2 ? '경보' : '주의'
      out.push({ sev, tagId: t.id, hint: t.alarmHint || `${act.desc || act.id} 센서·계수 확인`,
        text: `${t.desc || t.id}: 예상 ${numf(expected)} vs 실제 ${numf(actual)}${act.unit || ''} — 편차 ${Math.round(devPct)}% (허용 ${tol}%)` })
    }
  }
  for (const t of tags) {
    const hint = t.alarmHint || ''
    if (t.type === 'BIT') {
      // 명시적으로 알람 지정한 접점만 (스위치·램프 제외)
      const v = Number(t.value)
      if (t.alarmBit === 'on' && v === 1) out.push({ sev: '경보', tagId: t.id, text: `${t.desc || t.id} 발생(ON)`, hint })
      else if (t.alarmBit === 'off' && v === 0) out.push({ sev: '경보', tagId: t.id, text: `${t.desc || t.id} 발생(OFF)`, hint })
    } else {
      const v = Number(t.value) || 0, max = Number(t.max)
      // 명시적 상한/하한 경보 (예: 토크 — 끊김 전 경고). 상한의 90% 근접 시 주의. 빈값('')은 0 오인 방지
      const aHi = (t.alarmHigh === '' || t.alarmHigh == null) ? NaN : Number(t.alarmHigh)
      const aLo = (t.alarmLow === '' || t.alarmLow == null) ? NaN : Number(t.alarmLow)
      if (Number.isFinite(aHi)) {
        if (v >= aHi) out.push({ sev: '경보', tagId: t.id, hint: t.alarmHint || '', text: `${t.desc || t.id} ${numf(v)}${t.unit || ''} — 상한 경보(${aHi}${t.unit || ''}) 초과` })
        else if (v >= aHi * 0.9) out.push({ sev: '주의', tagId: t.id, hint: t.alarmHint || '', text: `${t.desc || t.id} ${numf(v)}${t.unit || ''} — 상한(${aHi}) 근접` })
      }
      if (Number.isFinite(aLo) && v <= aLo) out.push({ sev: '경보', tagId: t.id, hint: t.alarmHint || '', text: `${t.desc || t.id} ${numf(v)}${t.unit || ''} — 하한 경보(${aLo}${t.unit || ''}) 미만` })
      if (Number.isFinite(max) && max > 0) {
        const r = v / max
        if (r >= 0.95) out.push({ sev: '경보', tagId: t.id, text: `${t.desc || t.id} ${numf(v)}${t.unit || ''} — 상한 ${max}의 ${Math.round(r * 100)}%`, hint })
        else if (r >= 0.85) out.push({ sev: '주의', tagId: t.id, text: `${t.desc || t.id} ${numf(v)}${t.unit || ''} — 상한의 ${Math.round(r * 100)}%`, hint })
      }
      if (prev && prev[t.id] != null) {
        const dv = v - prev[t.id], base = Math.abs(prev[t.id]) || 1
        if (Math.abs(dv) / base >= 0.4 && (!max || Math.abs(dv) > max * 0.1)) out.push({ sev: '주의', tagId: t.id, text: `${t.desc || t.id} 급변 ${dv > 0 ? '▲' : '▼'}${numf(Math.abs(dv))}${t.unit || ''}`, hint })
      }
    }
  }
  const map = new Map()
  for (const f of out) { const e = map.get(f.tagId); if (!e || SEV_META[f.sev].o > SEV_META[e.sev].o) map.set(f.tagId, f) }
  return [...map.values()].sort((a, b) => SEV_META[b.sev].o - SEV_META[a.sev].o)
}
// 기간 해석: "오늘" → 자정~지금, "N분/시간/일" → 구간, 없으면 defaultMs
function windowFromText(text, defaultMs) {
  if (/오늘|today/i.test(text)) {
    const m = new Date(); m.setHours(0, 0, 0, 0)
    return { from: m.getTime(), to: Date.now(), label: '오늘' }
  }
  const hasUnit = /(\d+)\s*(분|시간|일|min|hour|day)/i.test(text)
  const ms = hasUnit ? parseWindowMs(text) : defaultMs
  const to = Date.now()
  const label = ms >= 86400000 ? `최근 ${Math.round(ms / 86400000)}일` : ms >= 3600000 ? `최근 ${Math.round(ms / 3600000)}시간` : `최근 ${Math.round(ms / 60000)}분`
  return { from: to - ms, to, label }
}

const MODEL_KEY = 'nexushmi.ollama.model'
const hhmm = () => new Date().toLocaleTimeString('ko', { hour: '2-digit', minute: '2-digit' })

// 현재 태그 스냅샷 + 최근 이력 + 데이터 저장 정보를 시스템 프롬프트로 구성
function buildSystemPrompt(tags, health, recent) {
  const lines = tags.slice(0, 60).map(t => {
    const v = t.type === 'BIT' ? (t.value === 1 ? 'ON' : 'OFF')
      : t.type === 'FLOAT' ? Number(t.value).toFixed(2) : t.value
    const loc = [t.device, t.utility].filter(Boolean).join('/')
    return `- ${t.id} (${t.desc || '-'}${loc ? ', ' + loc : ''}): ${v}${t.unit || ''} [${t.type}]`
  })

  // 최근 이력 (시간 추적 질문 대응)
  const recentLines = []
  if (recent) {
    for (const t of tags.slice(0, 60)) {
      const pts = recent[t.id]
      if (!pts || !pts.length) continue
      const seq = pts.slice().sort((a, b) => a.sec - b.sec) // 0초전(최신) 먼저
      const vals = seq.map(p => `${p.sec}초전=${Number(p.v).toFixed(2)}${t.unit || ''}`).join(', ')
      recentLines.push(`- ${t.id} (${t.desc || '-'}): ${vals}`)
    }
  }
  const recentBlock = recentLines.length
    ? `\n[최근 이력 (최근 60초, 약 2.5초 간격, "N초전"=현재 기준 N초 전 값)]
${recentLines.join('\n')}
사용자가 "N초/분 전 값", 증가/감소 추세를 물으면 위 최근 이력을 근거로 답하세요. 정확히 그 시각의 샘플이 없으면 가장 가까운 값으로 답하고 그 점을 밝히세요.\n`
    : ''

  const fmtTs = ts => (ts ? new Date(ts).toLocaleString('ko') : '-')
  let dataInfo
  if (health?.ok) {
    dataInfo = `[데이터 저장 정보]
- 저장 폴더: ${health.dataDir}
- 이력 DB (SQLite): ${health.dbPath}
- 저장된 샘플 수: ${Number(health.sampleCount || 0).toLocaleString()}건
- 기록 기간: ${fmtTs(health.firstTs)} ~ ${fmtTs(health.lastTs)}
사용자가 데이터 위치/저장 경로를 물으면 위 경로를 정확히 알려주세요.
과거 추세·평균은 사용자가 "○○ 그래프" 또는 "○○ 추세"라고 요청하면 시스템이 자동으로 차트를 그려줍니다(당신이 직접 그릴 필요 없음).
데이터를 파일로 원하면 "○○ 엑셀로 내보내줘"라고 하면 시스템이 엑셀 파일을 만들어 다운로드합니다. 당신은 파일을 직접 만들 수 없지만 시스템이 처리하니, "만들 수 없다"고 거절하지 말고 그렇게 요청하도록 안내하세요.`
  } else {
    dataInfo = `[데이터 저장 정보]
로컬 서버가 미연결 상태라 이력이 저장되지 않고 있습니다.
\`npm run start\`로 서버를 실행하면 "내 문서\\NexusHMI" 폴더(history\\history.db)에 자동 저장됩니다.`
  }

  return `당신은 산업 HMI/SCADA 운전 감시 보조 AI입니다. 항상 한국어로 간결하고 정확하게 답하세요.
아래는 현재 실시간 태그 값 스냅샷, 최근 이력, 데이터 저장 정보입니다. 이를 근거로 상태 판단, 이상 감지, 추세·시점 질문에 답하세요.
값이 최대치의 85%를 넘으면 경고로 간주합니다.

[현재 태그 스냅샷]
${lines.join('\n') || '(등록된 태그 없음)'}
${recentBlock}
${dataInfo}`
}

function ChatMessage({ msg }) {
  const isUser = msg.role === 'user'

  // 능동 감시 카드
  if (msg.kind === 'watch') {
    const m = SEV_META[msg.severity] || SEV_META['주의']
    return (
      <div className="flex gap-2">
        <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: m.bg, border: `1px solid ${m.border}` }}>
          <span style={{ fontSize: 11 }}>{m.icon}</span>
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${m.border}`, background: m.bg }}>
            <div className="px-2.5 py-1.5 flex items-center gap-1.5" style={{ borderBottom: `1px solid ${m.border}` }}>
              <span className="text-[10px] font-bold" style={{ color: m.color }}>⚠ AI 능동 감시 · {msg.severity}</span>
            </div>
            <div className="px-2.5 py-1.5 space-y-0.5">
              {(msg.findings || []).map((f, j) => (
                <p key={j} className="text-[10px] leading-snug" style={{ color: SEV_META[f.sev]?.color || '#cbd5e1' }}>• {f.text}</p>
              ))}
            </div>
            {(() => {
              const hints = [...new Set((msg.findings || []).map(f => f.hint).filter(Boolean))]
              return hints.length ? (
                <div className="px-2.5 py-1.5 text-[10px] leading-snug" style={{ borderTop: `1px solid ${m.border}`, color: '#fde68a', background: 'rgba(120,80,15,0.25)' }}>
                  🛠 권장 조치: {hints.join(' / ')}
                </div>
              ) : null
            })()}
            {(msg.advice || msg.streaming) && (
              <div className="px-2.5 py-1.5 text-[10px] leading-relaxed" style={{ borderTop: `1px solid ${m.border}`, color: '#bbf7d0', background: '#0f2018' }}>
                💡 {msg.advice || '…'}
              </div>
            )}
          </div>
          <span className="text-[9px] text-[#4a5568] px-1">{msg.time}</span>
        </div>
      </div>
    )
  }

  // 차트 메시지: 넓게 렌더
  if (msg.type === 'chart') {
    return (
      <div className="flex gap-2">
        <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: '#14532d', border: '1px solid #22c55e' }}>
          <Bot size={11} className="text-[#22c55e]" />
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          {msg.text && <div className="text-[10px] text-[#94a3b8] mb-0.5">{msg.text}</div>}
          <ChartCard chart={msg.chart} />
          <span className="text-[9px] text-[#4a5568] px-1">{msg.time}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={isUser
          ? { background: '#1e40af', border: '1px solid #3b82f6' }
          : { background: '#14532d', border: '1px solid #22c55e' }}>
        {isUser ? <User size={11} className="text-[#93c5fd]" /> : <Bot size={11} className="text-[#22c55e]" />}
      </div>
      <div className={`max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
        <div className="px-3 py-2 rounded-lg text-[11px] leading-relaxed whitespace-pre-wrap"
          style={isUser
            ? { background: '#1e3a5f', border: '1px solid #1e40af', color: '#bfdbfe' }
            : { background: '#0f2018', border: '1px solid #166534', color: '#bbf7d0' }}>
          {msg.text || (msg.streaming ? '…' : '')}
        </div>
        <span className="text-[9px] text-[#4a5568] px-1">{msg.time}</span>
      </div>
    </div>
  )
}

export default function RuntimeAI({ tags, onOpenChart, logger, demo }) {
  const access = useAccess() // 무료 유저는 내부 AI 사용 불가
  const tagsRef = useRef(tags)
  tagsRef.current = tags

  const [models, setModels] = useState([])
  const [model, setModel] = useState(() => (typeof localStorage !== 'undefined' && localStorage.getItem(MODEL_KEY)) || '')
  const [status, setStatus] = useState('connecting') // connecting | online | offline

  // 서버/이력 저장 정보 (Gemma에게 데이터 위치를 알려주기 위함)
  const healthRef = useRef(null)
  const [messages, setMessages] = useState([{
    role: 'assistant',
    text: 'NexusAI 에이전트 (로컬 Gemma)입니다.\n· 상태/추세: "지금 알람 있어?", "3초 전 온도는?"\n· 그래프/엑셀: "온도 그래프", "주파수 1시간 엑셀로"\n· 보고서: "오늘 운전 보고서 작성해줘"\n· 로그검색: "오늘 알람 로그 보여줘"\n· 스위치 이력: "펌프 언제 켜졌어?", "오늘 조작 기록", "1번모터 ON/OFF 기록"',
    time: hhmm(),
  }])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const bottomRef = useRef(null)
  const abortRef = useRef(null)
  // 능동 감시
  const [watchOn, setWatchOn] = useState(false)
  const [analysis, setAnalysis] = useState(null) // 분석 대시보드
  const busyRef = useRef(false); busyRef.current = busy
  const prevSnapRef = useRef(null)
  const lastFindKeyRef = useRef('')

  async function refreshModels() {
    setStatus('connecting')
    try {
      const list = await listOllamaModels()
      setModels(list)
      setStatus('online')
      const lowGemma = list.find(m => /gemma/i.test(m) && /(e2b|2b|1b|270m|mini|small)/i.test(m))
      const anyGemma = list.find(m => /gemma/i.test(m))
      const chosen = (model && list.includes(model)) ? model : (lowGemma || anyGemma || list[0] || '')
      setModel(chosen)
      return chosen
    } catch {
      setStatus('offline')
      setModels([])
      return ''
    }
  }

  // Gemma에게 프롬프트 전송 → 새 어시스턴트 메시지에 스트리밍
  async function streamGemma(prompt) {
    let useModel = model
    if (!useModel || status !== 'online') useModel = await refreshModels()
    if (!useModel) {
      setMessages(prev => [...prev, { role: 'assistant', text: '⚠ Gemma 모델이 없습니다. `ollama pull gemma3` 후 다시 시도하세요.', time: hhmm() }])
      return
    }
    setMessages(prev => [...prev, { role: 'assistant', text: '', time: hhmm(), streaming: true }])
    abortRef.current = false
    try {
      await chatOllamaStream({
        model: useModel,
        messages: [{ role: 'user', content: prompt }],
        onDelta: d => setMessages(prev => {
          const c = prev.slice(); const last = c[c.length - 1]
          c[c.length - 1] = { ...last, text: last.text + d }
          return c
        }),
      })
    } catch (err) {
      setMessages(prev => {
        const c = prev.slice()
        c[c.length - 1] = { role: 'assistant', text: `⚠ 생성 실패: ${err.message}`, time: hhmm() }
        return c
      })
    } finally {
      setMessages(prev => prev.map((m, i) => (i === prev.length - 1 ? { ...m, streaming: false } : m)))
    }
  }

  // 에이전트: 운전 보고서 작성 (이력+이벤트 수집 → Gemma 서술)
  async function handleReport(text) {
    const w = windowFromText(text, 8 * 3600000) // 기본 8시간
    setBusy(true)
    const tagIds = tagsRef.current.filter(t => t.type !== 'BIT').map(t => t.id)
    const [hist, evRes] = await Promise.all([
      getHistory({ tagId: tagIds, from: w.from, to: w.to }),
      getEvents({ from: w.from, to: w.to, limit: 500 }),
    ])
    setBusy(false)
    if (!hist && !evRes) {
      setMessages(prev => [...prev, { role: 'assistant', text: '⚠ 로컬 서버 미연결. `npm run start`로 서버를 실행하세요.', time: hhmm() }])
      return
    }
    const tmap = Object.fromEntries(tagsRef.current.map(t => [t.id, t]))
    const stats = (hist?.summary || []).map(s => {
      const t = tmap[s.tagId] || {}
      return `- ${t.desc || s.tagId}: 평균 ${numf(s.avg)}${t.unit || ''}, 최소 ${numf(s.min)}, 최대 ${numf(s.max)} (${s.count}건)`
    }).join('\n')
    const counts = (evRes?.counts || []).map(c => `${c.type} ${c.n}건`).join(', ')
    const alarms = (evRes?.events || []).filter(e => e.type === 'alarm').slice(0, 10)
      .map(e => `- ${new Date(e.ts).toLocaleString('ko')} ${e.message}`).join('\n') || '없음'

    const dataCtx = `[기간] ${w.label}\n[태그 통계]\n${stats || '(데이터 없음)'}\n[이벤트 요약] ${counts || '없음'}\n[주요 알람]\n${alarms}`
    const prompt = `당신은 산업 설비 운전 보고서 작성 에이전트입니다. 아래 실측 데이터만 근거로 한국어 운전 보고서를 작성하세요.
형식: ① 제목 ② 운전 개요 ③ 주요 지표(평균/최대 위주) ④ 알람 및 조치 필요사항 ⑤ 종합 의견. 간결하게, 데이터에 없는 내용은 지어내지 마세요.

${dataCtx}`
    await streamGemma(prompt)
  }

  // 에이전트: 로그/이벤트 검색
  async function handleLogSearch(text) {
    const w = windowFromText(text, 24 * 3600000) // 기본 24시간
    let type
    if (/알람|경고|alarm/i.test(text)) type = 'alarm'
    else if (/조작|버튼|스위치|켜|껐|꺼|끄|운전|정지|작동|on|off|operate/i.test(text)) type = 'operate'
    else if (/설정값|setpoint/i.test(text)) type = 'setpoint'
    setBusy(true)
    const res = await getEvents({ from: w.from, to: w.to, type, limit: 500 })
    setBusy(false)
    if (!res) {
      setMessages(prev => [...prev, { role: 'assistant', text: '⚠ 로컬 서버 미연결.', time: hhmm() }])
      return
    }
    let evs = res.events || []
    // 특정 설비/태그 이름이 질문에 있으면 그 이벤트만 (예: "펌프 언제 켜졌어?")
    const kws = [...new Set((tags || []).map(t => t.desc).filter(d => d && d.length >= 2 && text.includes(d)))]
    if (kws.length) evs = evs.filter(e => kws.some(k => (e.message || '').includes(k)))
    // ON/OFF 만 물으면 해당 방향으로 좁힘
    const onlyOn = /(켜|on|작동|운전\b|기동)/i.test(text) && !/(껐|꺼|off|정지)/i.test(text)
    const onlyOff = /(껐|꺼|off|정지)/i.test(text) && !/(켜|on|기동)/i.test(text)
    if (onlyOn) evs = evs.filter(e => /ON/.test(e.message || ''))
    else if (onlyOff) evs = evs.filter(e => /OFF/.test(e.message || ''))

    const subj = kws.length ? kws.join('·') + ' ' : ''
    if (!evs.length) {
      setMessages(prev => [...prev, { role: 'assistant', text: `🔎 ${w.label} ${subj}${type ? `(${type}) ` : ''}기록이 없습니다.`, time: hhmm() }])
      return
    }
    const shown = evs.slice(0, 25)
    const icon = { alarm: '🔴', recover: '🟢', operate: '🔘', setpoint: '⚙️', system: 'ℹ️' }
    const lines = shown.map(e => `${icon[e.type] || '·'} ${new Date(e.ts).toLocaleString('ko')} ${e.message}`).join('\n')
    const more = evs.length > shown.length ? `\n… 외 ${evs.length - shown.length}건` : ''
    setMessages(prev => [...prev, { role: 'assistant', text: `🔎 ${w.label} ${subj}로그 ${evs.length}건\n${lines}${more}`, time: hhmm() }])
  }

  useEffect(() => { refreshModels() }, [])

  // 서버 상태(데이터 위치/이력 통계) 주기적 갱신
  useEffect(() => {
    let alive = true
    const load = () => getHealth().then(h => { if (alive) healthRef.current = h })
    load()
    const timer = setInterval(load, 30000)
    return () => { alive = false; clearInterval(timer) }
  }, [])

  useEffect(() => { if (model) localStorage.setItem(MODEL_KEY, model) }, [model])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, busy])

  // 능동 감시 카드 발행: 규칙 감지 결과 표시 + Gemma 조언 스트리밍
  async function pushWatchCard(findings) {
    const sev = findings.some(f => f.sev === '경보') ? '경보' : '주의'
    setMessages(prev => [...prev, { role: 'assistant', kind: 'watch', severity: sev, findings, advice: '', time: hhmm(), streaming: true }])
    let useModel = model
    if (!useModel || status !== 'online') useModel = await refreshModels()
    if (!useModel) { setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, streaming: false, advice: '(로컬 AI 오프라인 — 규칙 감지만 표시)' } : m)); return }
    const ctx = findings.map(f => `- [${f.sev}] ${f.text}${f.hint ? ` (권장:${f.hint})` : ''}`).join('\n')
    const prompt = `당신은 SCADA 감시 에이전트입니다. 아래 감지된 이상 징후를 운전원에게 한국어 1~2문장으로 간결히 알리고, 어떤 설비를 켜거나 꺼야 하는지 구체적으로 권고하세요(괄호의 권장 조치 참고). 데이터에 없는 내용은 지어내지 마세요.\n\n[감지]\n${ctx}`
    try {
      await chatOllamaStream({ model: useModel, messages: [{ role: 'user', content: prompt }], onDelta: d => setMessages(prev => { const c = prev.slice(); const last = c[c.length - 1]; c[c.length - 1] = { ...last, advice: (last.advice || '') + d }; return c }) })
    } catch { /* 조언 실패해도 카드는 유지 */ }
    finally { setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, streaming: false } : m)) }
  }

  // 능동 감시 루프 — 주기적으로 스스로 이상 점검
  useEffect(() => {
    if (!watchOn) return
    let alive = true
    const run = () => {
      if (!alive || busyRef.current) return
      const tags = tagsRef.current
      const findings = scanFindings(tags, prevSnapRef.current)
      prevSnapRef.current = Object.fromEntries(tags.filter(t => t.type !== 'BIT').map(t => [t.id, Number(t.value) || 0]))
      if (!findings.length) { lastFindKeyRef.current = ''; return }
      const key = findings.map(f => `${f.tagId}:${f.sev}`).join('|')
      if (key === lastFindKeyRef.current) return // 같은 상황 반복 알림 방지
      lastFindKeyRef.current = key
      pushWatchCard(findings)
    }
    const t0 = setTimeout(run, 3000)      // 시작 3초 후 첫 점검
    const id = setInterval(run, 8000)      // 이후 8초마다
    return () => { alive = false; clearTimeout(t0); clearInterval(id) }
  }, [watchOn]) // eslint-disable-line react-hooks/exhaustive-deps

  function stop() {
    abortRef.current?.abort()
  }

  // 엑셀 내보내기 의도 → 이력 조회 → xlsx 다운로드
  async function handleExport(text) {
    const q = resolveChartQuery(text, tagsRef.current)
    if (!q.tagIds.length) {
      setMessages(prev => [...prev, { role: 'assistant', text: '내보낼 태그를 찾지 못했습니다. 유틸리티/태그 이름을 넣어 다시 말씀해 주세요. 예) "집진기 전력 1시간 엑셀로 내보내줘"', time: hhmm() }])
      return
    }
    const to = Date.now()
    const from = to - q.windowMs
    setBusy(true)
    const res = await getHistory({ tagId: q.tagIds, from, to })
    setBusy(false)
    if (!res) {
      setMessages(prev => [...prev, { role: 'assistant', text: '⚠ 로컬 서버에 연결할 수 없습니다. `npm run start` 로 서버를 함께 실행하세요.', time: hhmm() }])
      return
    }
    const total = (res.series || []).reduce((a, s) => a + (s.points?.length || 0), 0)
    if (total === 0) {
      setMessages(prev => [...prev, { role: 'assistant', text: '해당 기간에 저장된 이력이 없습니다. 실행창을 켜두면 데이터가 쌓입니다.', time: hhmm() }])
      return
    }
    // 타임스탬프 기준 피벗 (시각 | 태그1 | 태그2 …)
    const tagMap = Object.fromEntries(q.picked.map(t => [t.id, t]))
    const perTag = {}
    const tsSet = new Set()
    for (const s of res.series) {
      perTag[s.tagId] = new Map()
      for (const p of s.points) { tsSet.add(p.t); perTag[s.tagId].set(p.t, p.v) }
    }
    const colName = id => { const t = tagMap[id]; return `${t?.desc || id}${t?.unit ? ` (${t.unit})` : ''}` }
    const rows = [...tsSet].sort((a, b) => a - b).map(ts => {
      const row = { 시각: new Date(ts).toLocaleString('ko') }
      for (const id of q.tagIds) row[colName(id)] = perTag[id].get(ts) ?? ''
      return row
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '이력')
    const names = q.picked.map(t => (t.desc || t.id)).join('_').replace(/[^\w가-힣\-]/g, '')
    const fname = `이력_${names}_최근${Math.round(q.windowMs / 60000)}분.xlsx`
    XLSX.writeFile(wb, fname)

    setMessages(prev => [...prev, { role: 'assistant', text: `📥 엑셀 파일을 다운로드했습니다 — ${q.picked.map(t => t.desc || t.id).join(', ')}, 최근 ${Math.round(q.windowMs / 60000)}분, ${rows.length}행.`, time: hhmm() }])
  }

  // 그래프 의도 → 큰 그래프 뷰어를 연다
  async function handleChart(text) {
    const q = resolveChartQuery(text, tagsRef.current)
    if (!q.tagIds.length) {
      setMessages(prev => [...prev, { role: 'assistant', text: '어떤 값을 그릴지 찾지 못했습니다. 유틸리티/디바이스/태그 이름을 넣어 다시 말씀해 주세요. 예) "집진기 전력 그래프", "온도 추세"', time: hhmm() }])
      return
    }
    onOpenChart?.(q.tagIds)
    const names = q.picked.map(t => t.desc || t.id).join(', ')
    setMessages(prev => [...prev, { role: 'assistant', text: `📊 큰 화면 그래프 뷰어를 열었습니다 — ${names} (${q.tagIds.length}개).\n뷰어에서 태그를 추가/비교하고, 한계선(85%)에 가까운 항목이 가장 주의 대상입니다.`, time: hhmm() }])
  }

  // 에이전트: 분석 대시보드 (어제 온·습도 급변구간 + 원인추종)
  async function handleAnalysis() {
    // 데모(sim.auto)는 합성 24시간 쇼케이스, 그 외 프로젝트는 런타임 로거 실기록 → 동일 범용 파이프라인
    const useLive = !demo && logger && logger.size() >= 20
    const report = useLive
      ? buildReportFromLogger(logger, tagsRef.current, { rangeMs: 12 * 3600 * 1000 })
      : buildDemoReport(Date.now())
    const nSpk = report.series.reduce((a, s) => a + (s.spikes?.length || 0), 0)
    setAnalysis({ ...report, streaming: true })
    setMessages(prev => [...prev, { role: 'assistant', text: `📊 ${report.title} 분석 대시보드 — 변수 ${report.series.length}개 · 장비 ${report.events.length}건 · 급변 ${nSpk}구간${useLive ? ' (실시간 기록)' : ' (시연 데이터)'} 분석 중.`, time: hhmm() }])
    let useModel = model
    if (!useModel || status !== 'online') useModel = await refreshModels()
    if (!useModel) { setAnalysis(o => (o ? { ...o, streaming: false } : o)); return }
    try {
      await chatOllamaStream({ model: useModel, messages: [{ role: 'user', content: reportPrompt(report) }], onDelta: d => setAnalysis(o => (o ? { ...o, aiText: (o.aiText || '') + d } : o)) })
    } catch { /* 분석 실패해도 대시보드는 유지 */ }
    finally { setAnalysis(o => (o ? { ...o, streaming: false } : o)) }
  }

  // 현재 상태 스냅샷 엑셀 — 프롬프트로 요청 + (온라인이면) AI 요약 포함
  async function handleStateExcel(text) {
    setBusy(true)
    setMessages(prev => [...prev, { role: 'assistant', text: '📗 현재 운전 상태를 엑셀로 정리 중…', time: hhmm() }])
    let aiText = ''
    let useModel = model
    if (!useModel || status !== 'online') useModel = await refreshModels()
    if (useModel) {
      try {
        healthRef.current = (await getHealth()) || healthRef.current
        const sys = buildSystemPrompt(tagsRef.current, healthRef.current, {})
        await chatOllamaStream({ model: useModel, messages: [{ role: 'system', content: sys }, { role: 'user', content: `${text}\n\n위 요청에 맞춰 현재 운전 상태를 6~8문장으로 한국어 요약해줘. 데이터에 없는 내용은 지어내지 마.` }], onDelta: d => { aiText += d } })
      } catch { /* 요약 실패해도 스냅샷은 저장 */ }
    }
    try {
      exportStateToExcel(tagsRef.current, { title: '현재 운전 상태', aiText, request: text })
      setBusy(false)
      setMessages(prev => [...prev, { role: 'assistant', text: `✅ 현재 상태를 엑셀로 저장했습니다 — ${tagsRef.current.length}개 태그(공정변수·설비·설정값·전력)${aiText ? ' + AI 요약 시트' : ''}.`, time: hhmm() }])
    } catch (e) {
      setBusy(false)
      setMessages(prev => [...prev, { role: 'assistant', text: '⚠ 엑셀 저장 중 오류가 발생했습니다.', time: hhmm() }])
    }
  }

  async function send() {
    const text = input.trim()
    if (!text || busy) return

    // 분석 대시보드 요청 (에이전트) — 다른 인텐트보다 우선
    if (isAnalysisQuery(text)) {
      setMessages(prev => [...prev, { role: 'user', text, time: hhmm() }])
      setInput('')
      await handleAnalysis()
      return
    }

    // "현재 상태/요약을 엑셀로" — 현재 상태 스냅샷 엑셀 (이력 내보내기보다 우선)
    if (isStateExcelQuery(text)) {
      setMessages(prev => [...prev, { role: 'user', text, time: hhmm() }])
      setInput('')
      await handleStateExcel(text)
      return
    }

    // 엑셀/내보내기 요청이면 이력을 파일로 다운로드
    if (isExportQuery(text)) {
      setMessages(prev => [...prev, { role: 'user', text, time: hhmm() }])
      setInput('')
      await handleExport(text)
      return
    }

    // 보고서 작성 요청 (에이전트)
    if (isReportQuery(text)) {
      setMessages(prev => [...prev, { role: 'user', text, time: hhmm() }])
      setInput('')
      await handleReport(text)
      return
    }

    // 로그/이벤트 검색 (에이전트)
    if (isLogQuery(text)) {
      setMessages(prev => [...prev, { role: 'user', text, time: hhmm() }])
      setInput('')
      await handleLogSearch(text)
      return
    }

    // 그래프/차트 요청이면 이력에서 차트 생성
    if (isChartQuery(text)) {
      setMessages(prev => [...prev, { role: 'user', text, time: hhmm() }])
      setInput('')
      await handleChart(text)
      return
    }

    if (status !== 'online') { await refreshModels(); }
    if (!model) {
      setMessages(prev => [...prev, { role: 'assistant', text: '⚠ 사용할 Gemma 모델이 없습니다. 터미널에서 `ollama pull gemma3` 후 새로고침하세요.', time: hhmm() }])
      return
    }

    const userMsg = { role: 'user', text, time: hhmm() }
    const history = [...messages, userMsg]
    setMessages([...history, { role: 'assistant', text: '', time: hhmm(), streaming: true }])
    setInput('')
    setBusy(true)

    // 최신 데이터 저장 정보 + 최근 60초 이력(시간 추적 질문 대응) 반영
    healthRef.current = (await getHealth()) || healthRef.current
    const now = Date.now()
    const recentRes = await getHistory({ tagId: tagsRef.current.map(t => t.id), from: now - 60000, to: now })
    const recent = {}
    if (recentRes?.series) {
      for (const s of recentRes.series) {
        const pts = (s.points || []).slice(-12).map(p => ({ sec: Math.round((now - p.t) / 1000), v: p.v }))
        if (pts.length) recent[s.tagId] = pts
      }
    }

    const ollamaMsgs = [
      { role: 'system', content: buildSystemPrompt(tagsRef.current, healthRef.current, recent) },
      ...history
        .filter(m => (m.role === 'user' || m.role === 'assistant') && m.type !== 'chart' && m.text)
        .map(m => ({ role: m.role, content: m.text })),
    ]

    abortRef.current = new AbortController()
    try {
      await chatOllamaStream({
        model,
        messages: ollamaMsgs,
        signal: abortRef.current.signal,
        onDelta: d => setMessages(prev => {
          const copy = prev.slice()
          const last = copy[copy.length - 1]
          copy[copy.length - 1] = { ...last, text: last.text + d }
          return copy
        }),
      })
    } catch (err) {
      const aborted = err?.name === 'AbortError'
      setMessages(prev => {
        const copy = prev.slice()
        copy[copy.length - 1] = {
          role: 'assistant',
          text: aborted
            ? '⏹ 생성을 중단했습니다.'
            : `⚠ 응답 실패: ${err.message}\nOllama 실행 여부와 CORS(OLLAMA_ORIGINS) 설정을 확인하세요.`,
          time: hhmm(),
        }
        return copy
      })
      if (!aborted) setStatus('offline')
    } finally {
      setBusy(false)
      setMessages(prev => prev.map((m, i) => (i === prev.length - 1 ? { ...m, streaming: false } : m)))
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const statusInfo = {
    connecting: { color: '#f59e0b', label: '연결 중…' },
    online: { color: '#22c55e', label: '연결됨' },
    offline: { color: '#ef4444', label: '미연결' },
  }[status]

  if (!access.ai && !access.loading) {
    return (
      <aside className="flex flex-col h-full items-center justify-center text-center bg-[#0a1410] border-r border-[#166534] p-6" style={{ width: 320 }}>
        <div className="w-12 h-12 rounded-xl bg-[#14532d] border border-[#22c55e] flex items-center justify-center mb-3"><Lock size={22} className="text-[#4ade80]" /></div>
        <p className="text-[13px] font-bold text-[#e2e8f0]">AI 어시스턴트</p>
        <p className="text-[11px] font-bold text-[#6ee7b7] mt-1">🔒 오너 · 프리미엄 전용</p>
        <p className="text-[11px] text-[#7c8aa5] mt-3 leading-relaxed">실시간 분석·급변 원인 추적·보고서 등 AI 기능은 오너/프리미엄에서 사용할 수 있어요. 모니터링·시뮬레이션은 자유롭게 이용하세요.</p>
      </aside>
    )
  }

  return (
    <aside className="flex flex-col h-full bg-[#0a1410] border-r border-[#166534]" style={{ width: 320 }}>
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-[#14532d] flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#14532d] border border-[#22c55e] flex items-center justify-center">
            <Cpu size={14} className="text-[#22c55e]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-[12px] font-bold text-[#e2e8f0]">NexusAI</p>
              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-[#14532d] text-[#22c55e] border border-[#166534]">
                GEMMA · LOCAL
              </span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusInfo.color, boxShadow: `0 0 4px ${statusInfo.color}` }} />
              <p className="text-[9px]" style={{ color: statusInfo.color }}>Ollama {statusInfo.label}</p>
            </div>
          </div>
        </div>

        {/* 모델 선택 */}
        <div className="mt-2 flex items-center gap-1.5">
          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            className="flex-1 text-[10px] font-mono rounded px-2 py-1 bg-[#0f172a] border border-[#166534] text-[#22c55e] focus:outline-none"
          >
            {models.length === 0 && <option value="">(모델 없음)</option>}
            {models.map(m => <option key={m} value={m} style={{ background: '#0f172a', color: '#e2e8f0' }}>{m}</option>)}
          </select>
          <button onClick={refreshModels} title="모델 목록 새로고침"
            className="p-1.5 rounded bg-[#0f172a] border border-[#166534] text-[#22c55e] hover:bg-[#14532d] transition-colors">
            <RefreshCw size={12} />
          </button>
        </div>

        {/* 능동 감시 토글 */}
        <button onClick={() => setWatchOn(v => !v)}
          className="mt-2 w-full py-1.5 rounded text-[10px] font-bold transition-colors flex items-center justify-center gap-1.5"
          style={watchOn ? { background: '#14532d', color: '#4ade80', border: '1px solid #22c55e' } : { background: '#0f172a', color: '#64748b', border: '1px solid #2d3748' }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: watchOn ? '#22c55e' : '#4a5568', boxShadow: watchOn ? '0 0 5px #22c55e' : 'none' }} />
          {watchOn ? '능동 감시 ON — 이상 자동 감지·조언' : '능동 감시 OFF'}
        </button>
      </div>

      {/* 미연결 안내 */}
      {status === 'offline' && (
        <div className="mx-3 mt-2 p-2 rounded bg-[#2a0e0e] border border-[#7f1d1d] text-[9px] text-[#fca5a5] leading-relaxed flex-shrink-0">
          Ollama에 연결할 수 없습니다.<br />
          1) <span className="font-mono text-[#fecaca]">ollama serve</span> 실행<br />
          2) <span className="font-mono text-[#fecaca]">ollama pull gemma3</span> 로 모델 설치<br />
          3) 브라우저 호출 차단 시 <span className="font-mono text-[#fecaca]">OLLAMA_ORIGINS=*</span> 설정 후 재시작
        </div>
      )}

      {/* 채팅 영역 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((msg, i) => <ChatMessage key={i} msg={msg} />)}
        <div ref={bottomRef} />
      </div>

      {/* 빠른 명령어 */}
      <div className="px-3 py-2 border-t border-[#14532d] flex gap-1.5 overflow-x-auto flex-shrink-0">
        {['어제 온습도 분석 (급변 원인)', '전체 상태 요약', '현재 상태 엑셀로 저장', '오늘 운전 보고서 작성', '오늘 알람 로그 보여줘'].map(cmd => (
          <button key={cmd} onClick={() => setInput(cmd)}
            className="px-2 py-1 rounded text-[9px] text-[#6ee7b7] border border-[#166534] hover:bg-[#14532d] transition-all whitespace-nowrap flex-shrink-0">
            {cmd}
          </button>
        ))}
      </div>

      {/* 입력창 */}
      <div className="px-3 py-3 border-t border-[#14532d] flex-shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="현재 운전 상태를 물어보세요…"
            rows={2}
            className="flex-1 bg-[#0f172a] border border-[#166534] rounded-lg px-3 py-2 text-[11px] text-[#e2e8f0] placeholder-[#4a5568] resize-none focus:outline-none focus:border-[#22c55e] transition-colors"
            style={{ minHeight: 52 }}
          />
          {busy ? (
            <button onClick={stop} title="중단"
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: '#7f1d1d', border: '1px solid #ef4444', color: '#fff' }}>
              <Square size={13} fill="white" />
            </button>
          ) : (
            <button onClick={send} disabled={!input.trim()}
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-all"
              style={input.trim()
                ? { background: '#16a34a', border: '1px solid #22c55e', color: '#fff', boxShadow: '0 0 8px #22c55e44' }
                : { background: '#0f172a', border: '1px solid #2d3748', color: '#4a5568' }}>
              <Send size={14} />
            </button>
          )}
        </div>
        <p className="text-[8px] text-[#2d3748] mt-1 text-center">
          로컬 Gemma 실행 · 데이터 외부 전송 없음
        </p>
      </div>

      {analysis && <AnalysisDashboard data={analysis} onClose={() => setAnalysis(null)} />}
    </aside>
  )
}
