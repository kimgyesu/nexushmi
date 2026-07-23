import { useState, useRef, useEffect } from 'react'
import { useValueSimulator } from '../hooks/useTagSimulator'
import { useHistorian } from '../hooks/useHistorian'
import { isSetpointTag, isVirtualDevice } from '../data/tags'
import { loadGlobalSymbols } from '../data/symbols'
import { driverForDevice, normalizeForDriver } from '../data/drivers'
import { postEvents, plcConnect, plcRead, plcWrite } from '../utils/api'
import { createLogger } from '../utils/dataLogger'
import { tryFormula } from '../utils/formula'
import { loadProject } from '../data/project'
import { RENDERERS, resolveTag, tagAlarmLevel, elementBBox } from './ScadaCanvas'
import RuntimeAI from './RuntimeAI'
import ChartViewer from './ChartViewer'
import { MonitorPlay, Wifi, Clock, Bell, X, Database, LineChart, Lock, Cpu } from 'lucide-react'
import { useAccess } from '../auth/access'

/* 실행(런타임) 화면 — 운전자 모니터링 뷰
   - 편집 기능 없음 (팔레트/인스펙터/드래그 없음)
   - 스위치를 클릭하면 연결된 BIT 태그를 ON/OFF 토글 (운전자 조작 시뮬레이션) */
export default function Runtime() {
  const project = useRef(
    loadProject() ?? { name: '(빈 프로젝트)', tags: [], elements: [], bindings: {} }
  ).current

  // 무료 유저 실행 시간 제한 (오너 무제한)
  const access = useAccess()
  const [expired, setExpired] = useState(false)
  const [leftSec, setLeftSec] = useState(null)
  useEffect(() => {
    if (access.loading || access.runtimeMinutes === Infinity) return
    const endAt = Date.now() + access.runtimeMinutes * 60 * 1000
    const id = setInterval(() => {
      const s = Math.max(0, Math.round((endAt - Date.now()) / 1000))
      setLeftSec(s)
      if (s <= 0) { setExpired(true); clearInterval(id) }
    }, 1000)
    return () => clearInterval(id)
  }, [access.loading, access.runtimeMinutes])

  // 런타임도 자체 태그 상태를 소유하고 값을 시뮬레이션
  const [tags, setTags] = useState(project.tags ?? [])

  // ── 실 PLC 대상 태그 파악 (시리얼 디바이스 + 주소 있는 실태그) ──
  const plcDev = (project.devices || []).find(d => driverForDevice(d).conn === 'serial')
  const plcDriver = plcDev ? driverForDevice(plcDev) : null
  // 태그 주소를 드라이버 형식으로 정규화 (Modbus는 그대로 M100/D100, XGT/LS는 %DW100/%MX 로)
  const plcItems = useRef(plcDev
    ? (project.tags || []).filter(t => t.device === plcDev.name && t.address && !isVirtualDevice(t.device) && !t.formula && !t.writeTo)
        .map(t => ({ id: t.id, device: normalizeForDriver(plcDriver, t.address, t.type), type: t.type }))
    : []).current
  // 계산 태그(수식) — 시뮬/폴링 대상에서 제외 (수식으로 계산됨)
  const formulaIds = useRef(new Set((project.tags || []).filter(t => t.formula).map(t => t.id))).current
  const plcSkipIds = useRef(new Set([...plcItems.map(i => i.id), ...formulaIds])).current
  const [plcOn, setPlcOn] = useState(false)

  // 실 PLC 폴링/계산 태그는 시뮬 제외 (실제 값·수식으로 갱신)
  useValueSimulator(setTags, false, 2500, plcSkipIds)

  // ── 계산 태그 평가 (다른 태그값으로 수식 계산, 300ms 주기) ──
  useEffect(() => {
    if (!formulaIds.size) return
    const id = setInterval(() => {
      setTags(prev => {
        const byId = {}; for (const t of prev) byId[t.id] = Number(t.value) || 0
        let changed = false
        const next = prev.map(t => {
          if (!t.formula) return t
          const { value } = tryFormula(t.formula, byId)
          if (value != null && value !== t.value) { changed = true; return { ...t, value } }
          return t
        })
        return changed ? next : prev
      })
    }, 300)
    return () => clearInterval(id)
  }, [])

  // ── setpoint 출력: HMI 계산값 → 레이트제한(램프) → 클램프 → PLC 쓰기 + 하트비트(워치독) ──
  const outTags = useRef((project.tags || []).filter(t => t.writeTo)).current
  useEffect(() => {
    if (!outTags.length) return
    const DT = 0.2                         // 200ms
    const lastOut = {}                     // tagId → 마지막 출력값 (램프 기준)
    let hb = 0
    const hbAddrs = [...new Set(outTags.map(t => t.writeHeartbeat).filter(Boolean))]
    const id = setInterval(() => {
      const byId = {}; for (const t of tagsRef.current) byId[t.id] = Number(t.value) || 0
      for (const t of outTags) {
        const target = byId[t.id] || 0
        const rate = Number(t.writeRate) || 0
        const min = Number.isFinite(+t.writeMin) ? +t.writeMin : -Infinity
        const max = Number.isFinite(+t.writeMax) ? +t.writeMax : Infinity
        const prev = lastOut[t.id] != null ? lastOut[t.id] : target
        let out = target
        if (rate > 0) { const step = rate * DT; out = Math.max(prev - step, Math.min(prev + step, target)) }  // 램프
        out = Math.max(min, Math.min(max, out))                                                                // 클램프
        lastOut[t.id] = out
        plcWrite(t.writeTo, out, t.type).catch(() => { /* 미연결 등 */ })
      }
      // 워치독 하트비트 (증가 카운터) — PLC가 이게 멈추면 HMI 다운으로 판단해 안전조치
      hb = (hb + 1) & 0xFFFF
      for (const a of hbAddrs) plcWrite(a, hb, 'WORD').catch(() => {})
    }, 200)
    return () => clearInterval(id)
  }, [])

  // ── 실 PLC 실시간 폴링 (RUN 시 자동 연결 → 1초마다 읽어 태그 갱신) ──
  useEffect(() => {
    if (!plcDev || !plcItems.length) return
    const driver = driverForDevice(plcDev)
    const protocol = /modbus/i.test(driver.protocol || '') ? 'modbus' : 'xgt'
    // LS 매핑: 드라이버 설정 우선, 없으면 M/D 주소를 쓰는 Modbus면 기본 LS 매핑 자동 적용
    const usesLsAddr = plcItems.some(i => /^[md]\d+$/i.test(String(i.device)))
    const lsMap = driver?.addr?.lsModbus
      || (protocol === 'modbus' && usesLsAddr ? { bitReadStart: 100, bitWriteStart: 500, wordReadStart: 100, wordWriteStart: 500 } : null)
    let alive = true, timer = null
    ;(async () => {
      try {
        await plcConnect({
          protocol, port: plcDev.port, baud: plcDev.baud, station: plcDev.station,
          dataBits: plcDev.dataBits, parity: plcDev.parity, stopBits: plcDev.stopBits,
          lsMap,
        })
        if (!alive) return
        setPlcOn(true)
      } catch (e) { console.warn('[PLC] 연결 실패:', e.message); return }
      const poll = async () => {
        if (!alive) return
        try {
          const r = await plcRead(plcItems.map(i => ({ device: i.device, type: i.type })))
          const vals = r?.values || {}
          setTags(prev => prev.map(t => {
            const it = plcItems.find(i => i.id === t.id)
            if (!it) return t
            const v = vals[it.device]
            return v == null ? t : { ...t, value: Number(v) }
          }))
        } catch { /* 한 박자 건너뜀 */ }
        if (alive) timer = setTimeout(poll, 200)   // 읽기 완료 후 200ms 뒤 재폴링 (체감 지연 최소화)
      }
      poll()
    })()
    return () => { alive = false; if (timer) clearTimeout(timer) }
  }, [])

  // 데이터 로거 — 실행 중 태그 이력 기록 (범용 보고서의 실데이터 근거)
  const loggerRef = useRef(createLogger())
  const tagsRef = useRef(tags); tagsRef.current = tags
  useEffect(() => {
    const id = setInterval(() => loggerRef.current.sample(tagsRef.current, Date.now()), 2000)
    return () => clearInterval(id)
  }, [])

  // 데모 물리 시뮬레이션 — 자동 하루 주기(auto) 또는 스위치 기반 물리(rules)
  useEffect(() => {
    const sim = project.sim
    if (!sim) return
    const startT = Date.now()
    const id = setInterval(() => {
      setTags(prev => {
        const byId = {}; for (const t of prev) byId[t.id] = t
        const a = sim.auto
        if (a) {
          // 가속 가상 시계 → 일조량·외기 순환, 자동 장비 제어
          const vh = ((a.startHour || 0) + ((Date.now() - startT) / 1000) / a.daySeconds * 24) % 24
          const sr = a.sunrise ?? 6, ss = a.sunset ?? 18
          const sun = (vh > sr && vh < ss) ? Math.sin((vh - sr) / (ss - sr) * Math.PI) : 0
          const lux = Math.round(sun * (a.luxPeak ?? 82) * 10) / 10
          const ambient = a.ambientNight + sun * (a.ambientDay - a.ambientNight)
          const vhInt = Math.floor(vh), vmInt = Math.floor((vh - vhInt) * 60)
          const refT = Number(byId[a.refTemp]?.value) || 20
          const refH = Number(byId[a.refHum]?.value) || 60
          const sw = {}
          for (const c of a.control) {
            const cur = Number(byId[c.ctrl]?.value) || 0
            // 설정값(set) 지정 시 오프셋 기준, 없으면 on/off를 절대 임계값으로 사용
            const spv = c.set != null ? Number(byId[c.set]?.value) : NaN
            const base = Number.isFinite(spv) ? spv : 0
            const onT = base + c.on, offT = base + c.off
            sw[c.ctrl] = c.type === 'cool' ? (refT >= onT ? 1 : refT <= offT ? 0 : cur)
              : c.type === 'heat' ? (refT <= onT ? 1 : refT >= offT ? 0 : cur)
              : (refH <= onT ? 1 : refH >= offT ? 0 : cur)
          }
          const heat = sw['TAG_HEAT_SW'] || 0, fan = sw['TAG_FAN_SW'] || 0, chill = sw['TAG_CHILL_SW'] || 0, mist = sw['TAG_MIST_SW'] || 0
          const tset = new Set(a.tempTags), hset = new Set(a.humTags)
          // 목표값으로 천천히 수렴 (외기 + 장비 오프셋) — 급변 없이 완만하게
          const tTarget = ambient + heat * 7 - fan * 3 - chill * 5.5
          const hTarget = 60 - sun * 8 + mist * 22 - fan * 8
          const K = 0.03 // 수렴 속도 (작을수록 완만)
          return prev.map(t => {
            if (t.id === a.hourTag) return t.value !== vhInt ? { ...t, value: vhInt } : t
            if (t.id === a.minTag) return t.value !== vmInt ? { ...t, value: vmInt } : t
            if (t.id === a.luxTag) return Math.abs(t.value - lux) > 0.05 ? { ...t, value: lux } : t
            if (sw[t.id] != null) return sw[t.id] !== t.value ? { ...t, value: sw[t.id] } : t
            if (tset.has(t.id)) {
              const v = Math.round(Math.max(t.min ?? 0, Math.min(t.max ?? 40, Number(t.value) + (tTarget - Number(t.value)) * K)) * 10) / 10
              return v !== t.value ? { ...t, value: v } : t
            }
            if (hset.has(t.id)) {
              const v = Math.round(Math.max(t.min ?? 0, Math.min(t.max ?? 100, Number(t.value) + (hTarget - Number(t.value)) * K)) * 10) / 10
              return v !== t.value ? { ...t, value: v } : t
            }
            return t
          })
        }
        // 수동(스위치 기반) 물리
        const delta = {}
        for (const r of sim.rules || []) { const c = byId[r.ctrl]; if (!c || Number(c.value) !== 1) continue; for (const tid of r.targets) delta[tid] = (delta[tid] || 0) + r.rate }
        for (const d of sim.drift || []) for (const tid of d.targets) { const t = byId[tid]; if (t) delta[tid] = (delta[tid] || 0) + (d.toward - Number(t.value)) * d.rate }
        let any = false
        const next = prev.map(t => { if (delta[t.id] == null) return t; const v = Math.round(Math.max(t.min ?? 0, Math.min(t.max ?? 100, Number(t.value) + delta[t.id])) * 10) / 10; if (v !== t.value) any = true; return { ...t, value: v } })
        return any ? next : prev
      })
    }, 700)
    return () => clearInterval(id)
  }, [])

  // 커스텀 심볼 — 프로젝트에 임베드되어 있으면 그것, 없으면 로컬 라이브러리
  const symbols = (project.symbols && project.symbols.length) ? project.symbols : loadGlobalSymbols()

  // 이력 저장: 실행 중 현재 태그값을 로컬 서버(SQLite)에 주기적으로 누적
  const hist = useHistorian(tags, { enabled: true, intervalMs: 2500 })

  // 알람 자동 기록 — 아날로그 태그가 한계의 85% 넘으면 알람, 내려가면 복귀
  const alarmRef = useRef(new Set())
  useEffect(() => {
    const nowAlarm = new Set()
    const newEvents = []
    for (const t of tags) {
      if (t.type === 'BIT') continue
      const range = (t.max - t.min) || 1
      const pct = (t.value - t.min) / range
      if (pct >= 0.85) {
        nowAlarm.add(t.id)
        if (!alarmRef.current.has(t.id)) {
          newEvents.push({ type: 'alarm', level: 'alarm', tagId: t.id, value: t.value, message: `${t.desc || t.id} 경고 — 한계의 ${(pct * 100).toFixed(0)}% (${Number(t.value).toFixed(1)}${t.unit || ''})` })
        }
      }
    }
    for (const id of alarmRef.current) {
      if (!nowAlarm.has(id)) {
        const t = tags.find(x => x.id === id)
        newEvents.push({ type: 'recover', level: 'info', tagId: id, message: `${t?.desc || id} 정상 복귀` })
      }
    }
    alarmRef.current = nowAlarm
    if (newEvents.length) postEvents(newEvents)
  }, [tags])

  // 큰 그래프 뷰어
  const [chart, setChart] = useState({ open: false, tagIds: [] })
  const openChart = (tagIds) => setChart({ open: true, tagIds: tagIds && tagIds.length ? tagIds : tags.filter(t => t.type !== 'BIT').slice(0, 4).map(t => t.id) })

  const now = new Date().toLocaleString('ko', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })

  const alarmCount = tags.filter(t => t.type !== 'BIT' && (t.value / t.max) > 0.85).length

  // 설정값(SV) 입력 모달
  const [sp, setSp] = useState(null)         // { tagId, name, unit, min, max }
  const [spInput, setSpInput] = useState('')

  // 실 PLC 태그면 값을 PLC에도 씀 (쓰기 영역: M500·D500…). 로컬 태그값은 별도로 갱신됨.
  function plcWriteIfReal(tagId, value) {
    const it = plcItems.find(i => i.id === tagId)
    if (it) plcWrite(it.device, value, it.type).catch(e => console.warn('[PLC] 쓰기 실패:', it.device, e.message))
  }

  function setBit(tagId, v) {
    setTags(prev => prev.map(t => t.id === tagId ? { ...t, value: v } : t))
    plcWriteIfReal(tagId, v)
  }

  // BIT 비트 조작 (behavior별) — wId: 쓰기 태그
  function operateBit(wId, wtag, behavior) {
    const label = wtag.desc || wId
    if (behavior === 'on') {
      setBit(wId, 1); postEvents({ type: 'operate', tagId: wId, value: 1, message: `${label} ON (조작)` })
    } else if (behavior === 'off') {
      setBit(wId, 0); postEvents({ type: 'operate', tagId: wId, value: 0, message: `${label} OFF (조작)` })
    } else if (behavior === 'momentary') {
      setBit(wId, 1); postEvents({ type: 'operate', tagId: wId, value: 1, message: `${label} 모멘터리 ON (조작)` })
      const up = () => { setBit(wId, 0); window.removeEventListener('pointerup', up) }
      window.addEventListener('pointerup', up)
    } else {
      const nv = wtag.value === 1 ? 0 : 1
      setBit(wId, nv); postEvents({ type: 'operate', tagId: wId, value: nv, message: `${label} ${nv ? 'ON' : 'OFF'} (토글 조작)` })
    }
  }

  function handleElementPointer(el) {
    const readId = project.bindings?.[el.id] ?? el.tagId
    const readTag = tags.find(t => t.id === readId)

    // 커스텀 심볼
    if (el.type === 'symbol') {
      const role = el.role || 'switchlamp'
      if (role === 'lamp') return
      const wId = el.writeTagId || readId
      const wt = tags.find(t => t.id === wId)
      if (wt && wt.type === 'BIT') operateBit(wId, wt, el.behavior || 'toggle')
      return
    }

    if (!readTag) return

    // 내장 스위치(BIT) — 가상 태그 포함 동작
    if (el.type === 'switch' && readTag.type === 'BIT') {
      operateBit(readId, readTag, el.behavior || 'toggle')
      return
    }
    // numeric 요소 — inputMode 설정에 따라 입력창
    if (el.type === 'numeric' && el.inputMode === 'numeric' && readTag.type !== 'BIT') {
      const dec = el.decimals ?? readTag.decimals ?? 0
      const scale = Math.pow(10, dec)
      // min/max: 엘리먼트 오버라이드 or 태그값 (모두 PLC 정수 기준)
      const rawMin = el.numMin ?? readTag.min
      const rawMax = el.numMax ?? readTag.max
      setSp({
        tagId: readTag.id,
        name: readTag.desc || readTag.id,
        unit: readTag.unit,
        decimals: dec,
        // 표시용 min/max
        min: dec > 0 ? rawMin / scale : rawMin,
        max: dec > 0 ? rawMax / scale : rawMax,
      })
      // 현재값을 표시 형식으로 변환
      const dispVal = dec > 0 ? (readTag.value / scale).toFixed(dec) : String(readTag.value)
      setSpInput(dispVal)
      return
    }
    // 설정값(SV) 태그 — isSetpointTag 판별
    if (readTag.type !== 'BIT' && isSetpointTag(readTag)) {
      setSp({ tagId: readTag.id, name: readTag.desc || readTag.id, unit: readTag.unit, min: readTag.min, max: readTag.max })
      setSpInput(String(readTag.value))
    }
  }

  function applySetpoint() {
    if (!sp) return
    let displayV = Number(spInput)
    if (!Number.isFinite(displayV)) { setSp(null); return }
    displayV = Math.max(sp.min, Math.min(sp.max, displayV))
    // PLC 정수 역변환: 소숫점 있으면 scale 곱해서 정수로
    const dec = sp.decimals ?? 0
    const rawV = dec > 0 ? Math.round(displayV * Math.pow(10, dec)) : displayV
    setTags(prev => prev.map(t => t.id === sp.tagId ? { ...t, value: rawV } : t))
    plcWriteIfReal(sp.tagId, rawV)
    postEvents({ type: 'setpoint', tagId: sp.tagId, value: rawV, message: `${sp.name} 설정값 변경 → ${displayV}${sp.unit || ''}` })
    setSp(null)
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ background: '#0a0e16' }}>
      {/* 무료 체험 남은 시간 배지 */}
      {leftSec != null && !expired && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[400] flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold"
          style={{ background: 'rgba(20,10,10,0.9)', border: '1px solid #f59e0b', color: '#fcd34d' }}>
          <Clock size={12} /> 무료 체험 {Math.floor(leftSec / 60)}:{String(leftSec % 60).padStart(2, '0')} 남음
        </div>
      )}
      {/* 10분 종료 오버레이 */}
      {expired && (
        <div className="fixed inset-0 z-[500] flex flex-col items-center justify-center text-center px-6" style={{ background: 'rgba(5,8,14,0.92)' }}>
          <div className="w-14 h-14 rounded-2xl bg-[#1f1305] border border-[#f59e0b] flex items-center justify-center mb-4"><Lock size={26} className="text-[#fcd34d]" /></div>
          <p className="text-[18px] font-extrabold text-[#e2e8f0]">무료 체험 시간이 끝났어요</p>
          <p className="text-[13px] text-[#94a3b8] mt-2">무료 실행은 10분까지 이용할 수 있어요.<br />오너 · 프리미엄이면 시간 제한 없이 계속 실행됩니다.</p>
          <button onClick={() => window.close()} className="mt-6 h-11 px-6 rounded-xl font-bold text-[13px] text-white" style={{ background: '#16a34a', border: '1px solid #22c55e' }}>실행 종료</button>
        </div>
      )}
      {/* 런타임 헤더 */}
      <header className="flex items-center px-4 h-11 bg-[#0d1117] border-b-2 border-[#16a34a] flex-shrink-0 gap-4"
              style={{ boxShadow: '0 2px 12px #16a34a33' }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-[#14532d] flex items-center justify-center"
               style={{ boxShadow: '0 0 10px #22c55e66' }}>
            <MonitorPlay size={15} className="text-[#22c55e]" />
          </div>
          <span className="text-[13px] font-bold tracking-wide">
            <span className="text-[#4a9eff]">Nexus</span>
            <span className="text-[#e2e8f0]">HMI</span>
          </span>
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#14532d] text-[#22c55e] border border-[#166534] ml-1 animate-pulse">
            ● RUNTIME
          </span>
        </div>

        <div className="w-px h-4 bg-[#2d3748]" />
        <span className="text-[11px] text-[#e2e8f0] font-mono font-bold">{project.name}</span>

        <div className="flex items-center gap-3 ml-auto">
          {/* 실 PLC 연결 상태 (실 디바이스 태그가 있을 때만) */}
          {plcItems.length > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded"
              style={plcOn ? { background: '#0f2018', border: '1px solid #166534' } : { background: '#2a1a0a', border: '1px solid #78350f' }}
              title={plcOn ? `실 PLC 연결됨 · ${plcItems.length}개 태그 폴링 중` : 'PLC 연결 시도 중… (로컬 서버 실행 필요)'}>
              <Cpu size={10} className={plcOn ? 'text-[#22c55e]' : 'text-[#f59e0b]'} />
              <span className={`text-[10px] font-mono ${plcOn ? 'text-[#22c55e]' : 'text-[#f59e0b]'}`}>
                {plcOn ? `PLC ${plcItems.length}` : 'PLC…'}
              </span>
            </div>
          )}
          {/* 이력 저장 상태 */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded"
            style={hist.connected
              ? { background: '#0f2018', border: '1px solid #166534' }
              : { background: '#1a202c', border: '1px solid #2d3748' }}
            title={hist.connected ? 'SQLite 이력 저장 중' : '로컬 서버 미연결 (이력 저장 안 됨)'}>
            <Database size={10} className={hist.connected ? 'text-[#22c55e]' : 'text-[#4a5568]'} />
            <span className={`text-[10px] font-mono ${hist.connected ? 'text-[#22c55e]' : 'text-[#4a5568]'}`}>
              {hist.connected ? `REC ${hist.savedCount}` : 'REC OFF'}
            </span>
          </div>
          <button className="flex items-center gap-1.5 px-2 py-0.5 rounded"
            style={alarmCount > 0
              ? { background: '#450a0a', border: '1px solid #7f1d1d' }
              : { background: '#1a202c', border: '1px solid #2d3748' }}>
            <Bell size={10} className={alarmCount > 0 ? 'text-[#ef4444]' : 'text-[#4a5568]'} />
            <span className={`text-[10px] font-bold ${alarmCount > 0 ? 'text-[#ef4444]' : 'text-[#4a5568]'}`}>
              {alarmCount > 0 ? `알람 ${alarmCount}` : '정상'}
            </span>
          </button>
          <div className="flex items-center gap-1">
            <Wifi size={11} className="text-[#22c55e]" />
            <span className="text-[10px] text-[#22c55e] font-mono">192.168.1.100</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock size={10} className="text-[#4a5568]" />
            <span className="text-[10px] text-[#4a5568] font-mono">{now}</span>
          </div>
          <button onClick={() => openChart()} title="그래프 뷰어 열기 (여러 값 비교)"
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-[#00d4ff] border border-[#1e40af] hover:bg-[#0f2444] transition-colors">
            <LineChart size={12} /> 그래프
          </button>
          <button onClick={() => window.close()} title="실행 화면 닫기"
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-[#cbd5e1] hover:bg-[#450a0a] hover:text-[#ef4444] transition-colors">
            <X size={12} /> 닫기
          </button>
        </div>
      </header>

      {/* 본문: 좌측 Gemma AI 패널 + 런타임 캔버스 */}
      <div className="flex flex-1 overflow-hidden">
        <RuntimeAI tags={tags} onOpenChart={openChart} logger={loggerRef.current} demo={!!project.sim?.auto} />

      {/* 런타임 캔버스 */}
      <div className="flex-1 overflow-hidden relative" style={{ background: '#0a0e16' }}>
        {project.elements.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-[13px] text-[#4a5568]">배치된 요소가 없습니다. 편집창에서 요소를 추가한 뒤 다시 실행하세요.</p>
          </div>
        ) : (() => {
          const rw = project.resolution?.w ?? 1280
          const rh = project.resolution?.h ?? 800
          // 비율이 다른 화면에서 스케일 방식: stretch=꽉 채우기(늘림), 그 외=비율 유지
          const par = project.resolution?.fit === 'stretch' ? 'none' : 'xMidYMid meet'
          return (
            <svg viewBox={`0 0 ${rw} ${rh}`} className="w-full h-full"
              style={{ display: 'block', background: '#0a0e16' }}
              preserveAspectRatio={par}>
              <style>{`@keyframes nxAlarmBlink{0%,49%{opacity:1}50%,100%{opacity:0.08}}`}</style>
              {project.bgImage && <>
                <image href={project.bgImage} x="0" y="0" width={rw} height={rh}
                  preserveAspectRatio={project.bgFit === 'stretch' ? 'none' : project.bgFit === 'meet' ? 'xMidYMid meet' : 'xMidYMid slice'} />
                {project.bgDim > 0 && <rect x="0" y="0" width={rw} height={rh} fill="#000" opacity={project.bgDim / 100} />}
              </>}
              {project.elements.map(el => {
                const Renderer = RENDERERS[el.type]
                if (!Renderer) return null
                const tag = resolveTag(el, project.bindings, tags)
                const alarm = tagAlarmLevel(tag)
                return (
                  <g key={el.id}>
                  {alarm === '경보' && (() => { const b = elementBBox(el); return (
                    <rect x={b.left - 5} y={b.top - 5} width={(b.right - b.left) + 10} height={(b.bottom - b.top) + 10} rx={6}
                      fill="none" stroke="#ef4444" strokeWidth={2.5} pointerEvents="none"
                      style={{ animation: 'nxAlarmBlink 0.7s steps(1,end) infinite', filter: 'drop-shadow(0 0 5px #ef4444)' }} />
                  )})()}
                  <Renderer
                    el={el}
                    tag={tag}
                    tags={tags}
                    elements={project.elements}
                    recipeSets={project.recipeSets || []}
                    selected={false}
                    symbols={symbols}
                    svgBindings={project.svgBindings || {}}
                    runtime={true}
                    onWriteTag={(tagId, value) => { setTags(prev => prev.map(t => t.id === tagId ? { ...t, value } : t)); plcWriteIfReal(tagId, value) }}
                    onPointerDown={() => handleElementPointer(el)}
                  />
                  </g>
                )
              })}
            </svg>
          )
        })()}
      </div>
      </div>

      <ChartViewer
        open={chart.open}
        tags={tags}
        tagIds={chart.tagIds}
        onClose={() => setChart(c => ({ ...c, open: false }))}
      />

      {/* 설정값(SV) 입력 모달 */}
      {sp && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setSp(null)}>
          <div className="bg-[#0f1520] border border-[#1e40af] rounded-lg p-4 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-[12px] font-bold text-[#e2e8f0] mb-1">설정값 입력</p>
            <p className="text-[10px] text-[#4a9eff] font-mono mb-3">{sp.tagId} <span className="text-[#718096]">({sp.name})</span></p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={spInput}
                autoFocus
                onChange={e => setSpInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') applySetpoint(); if (e.key === 'Escape') setSp(null) }}
                className="flex-1 text-[16px] font-mono font-bold rounded px-3 py-2 bg-[#0f172a] border border-[#1e40af] text-[#00d4ff] focus:outline-none focus:border-[#3b82f6]"
              />
              <span className="text-[12px] text-[#4a9eff] font-mono">{sp.unit}</span>
            </div>
            <p className="text-[9px] text-[#4a5568] font-mono mt-1.5">허용 범위: {sp.min} ~ {sp.max} {sp.unit}</p>
            <div className="flex gap-2 mt-4">
              <button onClick={applySetpoint}
                className="flex-1 px-3 py-2 rounded text-[11px] font-bold text-white"
                style={{ background: '#16a34a', border: '1px solid #22c55e' }}>
                적용
              </button>
              <button onClick={() => setSp(null)}
                className="px-4 py-2 rounded text-[11px] text-[#718096] hover:bg-[#2d3748] border border-[#2d3748]">
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
