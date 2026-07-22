import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
// useValueSimulator removed — no auto simulation in editor
import { CANVAS_ELEMENTS, ELEMENT_TYPE_LABELS, createElement, createSymbolElement } from './data/canvasElements'
import { DEFAULT_TAGS, makeTag, VIRTUAL_DEVICE, withVirtualAddress, nextVirtualAddress, isVirtualDevice } from './data/tags'
import { DEFAULT_DEVICES, makeDevice } from './data/devices'
import { loadGlobalSymbols, saveGlobalSymbols, makeSvgSymbol } from './data/symbols'
import { STD_SYMBOLS } from './data/stdSymbols'
import { DEMO_PROJECT, emptyProject, loadProject, saveProject, makeScreen, DEFAULT_RESOLUTION } from './data/project'
import { saveProjectToServer, captureLearning, getLearningProfile } from './utils/api'
import ProjectPanel from './components/ProjectPanel'
import ScadaCanvas, { portPos, elementBBox } from './components/ScadaCanvas'
import ElementPropertyModal from './components/ElementPropertyModal'
import EditorAI from './components/EditorAI'
import TagRegistry from './components/TagRegistry'
import DeviceRegistry from './components/DeviceRegistry'
import { setCustomDrivers as registerCustomDrivers } from './data/drivers'
import SymbolLibrary from './components/SymbolLibrary'
import SaveProjectDialog from './components/SaveProjectDialog'
import PanelStyleGallery from './components/PanelStyleGallery'
import LearningSettings from './components/LearningSettings'
import RecipeEditor from './components/RecipeEditor'
import { makeFactoryDemo } from './data/demoFactory'
import { makeGreenhouseDemo } from './data/demoGreenhouse'
import { resolvePanelStyle, loadActiveStyleKey, saveActiveStyleKey } from './data/panelStyles'
import FileMenu, { addRecentFile } from './components/FileMenu'
import { useAccess } from './auth/access'
import { doSignOut } from './auth/useAuth'
import {
  Activity, Wifi, Clock, Bell, Settings, LogOut,
  FilePlus2, Layers, Play, Save, Database, Cpu, Download, FolderOpen, LayoutGrid, Brain,
} from 'lucide-react'

// ── 정렬/분배 (여러 요소를 이동) ──
// el.x를 델타만큼 옮기면 bbox도 같은 델타로 이동하는 성질 이용
function shiftWire(e, dx, dy) {
  return { points: e.points.map(p => [p[0] + dx, p[1] + dy]) }
}
// 선택 대상을 "정렬 단위"로 묶는다. 같은 groupId끼리는 하나의 단위로 취급 →
// 그룹은 내부 레이아웃을 유지한 채 통째로 이동한다.
function alignUnits(targets) {
  const units = []
  const byGroup = {}
  for (const e of targets) {
    const b = elementBBox(e)
    if (e.groupId != null) {
      let u = byGroup[e.groupId]
      if (!u) {
        u = { members: [], left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity }
        byGroup[e.groupId] = u; units.push(u)
      }
      u.members.push(e)
      u.left = Math.min(u.left, b.left); u.right = Math.max(u.right, b.right)
      u.top = Math.min(u.top, b.top);   u.bottom = Math.max(u.bottom, b.bottom)
    } else {
      units.push({ members: [e], left: b.left, right: b.right, top: b.top, bottom: b.bottom })
    }
  }
  units.forEach(u => { u.cx = (u.left + u.right) / 2; u.cy = (u.top + u.bottom) / 2 })
  return units
}
// 단위별 델타를 각 멤버에 적용 (그룹 멤버는 동일 델타 → 상대 배치 유지)
function applyDeltas(els, dxById, dyById) {
  return els.map(e => {
    if (!(e.id in dxById) && !(e.id in dyById)) return e
    const dx = dxById[e.id] || 0, dy = dyById[e.id] || 0
    if (!dx && !dy) return e
    return { ...e, x: e.x + dx, y: e.y + dy,
      ...(e.type === 'wire' && Array.isArray(e.points) ? shiftWire(e, dx, dy) : {}) }
  })
}
function applyAlign(els, ids, mode) {
  const targets = els.filter(e => ids.includes(e.id))
  if (targets.length < 2) return els
  const units = alignUnits(targets)
  if (units.length < 2) return els  // 실제 정렬 단위가 2개 미만이면 의미 없음
  const minL = Math.min(...units.map(u => u.left))
  const maxR = Math.max(...units.map(u => u.right))
  const minT = Math.min(...units.map(u => u.top))
  const maxB = Math.max(...units.map(u => u.bottom))
  const midX = (minL + maxR) / 2, midY = (minT + maxB) / 2
  const dxById = {}, dyById = {}
  for (const u of units) {
    let dx = 0, dy = 0
    if (mode === 'left')    dx = Math.round(minL - u.left)
    if (mode === 'right')   dx = Math.round(maxR - u.right)
    if (mode === 'centerX') dx = Math.round(midX - u.cx)
    if (mode === 'top')     dy = Math.round(minT - u.top)
    if (mode === 'bottom')  dy = Math.round(maxB - u.bottom)
    if (mode === 'centerY') dy = Math.round(midY - u.cy)
    for (const m of u.members) { dxById[m.id] = dx; dyById[m.id] = dy }
  }
  return applyDeltas(els, dxById, dyById)
}
function applyDistribute(els, ids, axis) {
  const targets = els.filter(e => ids.includes(e.id))
  if (targets.length < 3) return els
  const units = alignUnits(targets)
  if (units.length < 3) return els  // 그룹은 하나의 단위 — 단위가 3개 미만이면 분배 불가
  const key = axis === 'h' ? 'cx' : 'cy'
  units.sort((a, z) => a[key] - z[key])
  const first = units[0][key], last = units[units.length - 1][key]
  const step = (last - first) / (units.length - 1)
  const dxById = {}, dyById = {}
  units.forEach((u, i) => {
    const d = Math.round((first + i * step) - u[key])
    for (const m of u.members) { if (axis === 'h') dxById[m.id] = d; else dyById[m.id] = d }
  })
  return applyDeltas(els, dxById, dyById)
}

// AI move 안전장치: 원래 그룹박스 안에 있던 요소가 박스 밖으로 나가면 안쪽으로 되당김.
// (AI가 "박스 안 좌우 간격 조절"을 잘못 계산해 요소를 박스 밖으로 보내는 사고 방지)
function clampInsideBox(el, nx, ny, els) {
  if (!el || el.type === 'groupbox' || el.type === 'wire') return { x: nx, y: ny }
  const boxes = els.filter(g => g.type === 'groupbox')
  if (!boxes.length) return { x: nx, y: ny }
  // 요소의 원래 중심 좌표 추정
  const isText = el.type === 'text'
  const cx0 = isText ? el.x + (String(el.label || '').length || 4) * (el.fontSize || 13) * 0.3 : el.x
  const cy0 = isText ? el.y + (el.fontSize || 13) / 2 : el.y
  const box = boxes.find(g => {
    const gr = g.x + (g.width || 200), gb = g.y + (g.height || 120)
    return cx0 >= g.x && cx0 <= gr && cy0 >= g.y && cy0 <= gb
  })
  if (!box) return { x: nx, y: ny }  // 원래 어떤 박스에도 안 속했으면 자유 이동
  const PAD = 12
  const bl = box.x + PAD, br = box.x + (box.width || 200) - PAD
  const bt = box.y + PAD, bb = box.y + (box.height || 120) - PAD
  if (isText) {
    const w = (String(el.label || '').length || 4) * (el.fontSize || 13) * 0.6, h = (el.fontSize || 13) + 4
    return { x: Math.max(bl, Math.min(nx, br - w)), y: Math.max(bt, Math.min(ny, bb - h)) }
  }
  const hw = el.hw || 45, hh = el.hh || 22
  return { x: Math.max(bl + hw, Math.min(nx, br - hw)), y: Math.max(bt + hh, Math.min(ny, bb - hh)) }
}

// ── 부품 세트 템플릿 (좌표를 코드에서 정확히 계산) ──
function occupiedBottom(els) {
  if (!els || !els.length) return 0
  return Math.max(...els.map(e => {
    if (e.type === 'groupbox') return e.y + (e.height || 120)
    return e.y + (e.hh || 22) * 2
  }))
}
function tagBaseFromName(name) {
  return 'TAG_' + String(name || 'PANEL').toUpperCase().replace(/[^A-Z0-9가-힣]+/g, '_').replace(/^_|_$/g, '').slice(0, 20)
}
function buildTemplate(kind, x, y, name, allocId) {
  const els = [], tags = []
  const base = tagBaseFromName(name)
  const gb = (w, h) => { els.push({ id: allocId(), type: 'groupbox', x, y, width: w, height: h, hw: w / 2, hh: h / 2, label: name, borderColor: '#00e5ff', titleColor: '#00e5ff', bgColor: 'rgba(0,229,255,0.03)', variant: 'default' }) }
  const label = (lx, ly, txt) => { els.push({ id: allocId(), type: 'text', x: lx, y: ly, label: txt, fontSize: 10, color: '#94a3b8', hw: 60, hh: 10, variant: 'default' }) }
  const mkTag = (suffix, desc, type, opts = {}) => { const id = `${base}_${suffix}`; tags.push(makeTag({ id, desc, type, device: '__virtual__', ...opts })); return id }
  const ctrl = (type, cx, cy, tagId, extra = {}) => { const e = createElement(type, cx, cy, allocId(), tagId, ''); Object.assign(e, extra); els.push(e); return e }

  if (kind === 'motor') {
    gb(220, 250)
    const runId = mkTag('RUN', '운전', 'BIT'), stopId = mkTag('STOP', '정지', 'BIT')
    label(x + 20, y + 52, '운전 스위치'); ctrl('switch', x + 150, y + 56, runId, { behavior: 'toggle' })
    label(x + 20, y + 92, '운전 표시');  ctrl('lamp', x + 150, y + 96, runId, { color: '#22c55e' })
    label(x + 20, y + 132, '정지 표시'); ctrl('lamp', x + 150, y + 136, stopId, { color: '#ef4444' })
    label(x + 20, y + 172, '속도');     ctrl('numeric', x + 150, y + 176, mkTag('SPEED', '속도', 'WORD', { unit: 'RPM', min: 0, max: 3600 }))
    label(x + 20, y + 212, '전류');     ctrl('numeric', x + 150, y + 216, mkTag('CURR', '전류', 'FLOAT', { unit: 'A', min: 0, max: 100, decimals: 1 }))
  } else if (kind === 'tank') {
    gb(210, 230)
    const lvl = mkTag('LVL', '레벨', 'FLOAT', { unit: '%', min: 0, max: 100, decimals: 1 })
    label(x + 20, y + 50, '레벨');   ctrl('numeric', x + 145, y + 56, lvl)
    ctrl('bar', x + 45, y + 150, lvl)
    label(x + 95, y + 116, '고알람'); ctrl('lamp', x + 155, y + 122, mkTag('HI', '고레벨 알람', 'BIT'), { color: '#ef4444' })
    label(x + 95, y + 166, '저알람'); ctrl('lamp', x + 155, y + 172, mkTag('LO', '저레벨 알람', 'BIT'), { color: '#fbbf24' })
  } else { // pid (기본)
    gb(240, 210)
    label(x + 24, y + 52, 'PV (현재값)'); ctrl('numeric', x + 180, y + 58, mkTag('PV', 'PV 현재값', 'FLOAT', { min: 0, max: 100, decimals: 1 }))
    label(x + 24, y + 92, 'SV (목표값)'); ctrl('numeric', x + 180, y + 98, mkTag('SV', 'SV 목표값', 'FLOAT', { min: 0, max: 100, decimals: 1 }), { inputMode: 'numeric', numMin: 0, numMax: 100 })
    label(x + 24, y + 132, 'MV (출력%)'); ctrl('numeric', x + 180, y + 138, mkTag('MV', 'MV 출력', 'FLOAT', { unit: '%', min: 0, max: 100, decimals: 1 }))
    label(x + 24, y + 176, 'AUTO/MAN');  ctrl('switch', x + 180, y + 180, mkTag('AUTO', '자동/수동', 'BIT'), { behavior: 'toggle' })
  }
  return { els, tags }
}

// text는 중심 앵커(textAnchor=middle)로 렌더 → 좌측정렬하려면 글자폭 절반만큼 오른쪽에 중심을 둬야 함.
// 한글/CJK는 대략 fontSize 폭, 그 외는 약 0.6배 폭.
function estTextWidth(str, fs) {
  let w = 0
  for (const ch of String(str)) w += /[ᄀ-ᇿ　-鿿가-퟿＀-￯]/.test(ch) ? fs : fs * 0.6
  return w
}

// 범용 패널 빌더 — AI는 title + rows(의미)만 주고, 좌표·크기·정렬은 앱이 결정론적으로 계산.
//   ⇒ AI의 좌표 손계산 실수(제목 중복·라벨 박스 밖·정렬 어긋남)를 원천 차단.
//   rows: [{ label, kind?, tag?, unit?, decimals?, min?, max?, input?, behavior?, color? }]
function buildPanel(p, x, y, allocId, tagById = {}, style) {
  const S = style || resolvePanelStyle('default')
  const els = [], tags = []
  const rows = Array.isArray(p.rows) ? p.rows.slice(0, 12) : []
  const N = Math.max(1, rows.length)
  const W = Math.max(200, Math.min(420, Math.round(+p.width || 240)))
  const H = 50 + N * 40                       // 제목 영역 + 행수 (buildTemplate과 동일 비례)
  const border = p.borderColor || S.groupbox.borderColor    // 경보 등 명시 색은 우선, 없으면 스타일
  const title = p.borderColor || S.groupbox.titleColor
  const bg = p.bgColor || S.groupbox.bgColor
  // 제목은 groupbox.label 하나만 (별도 text 제목을 만들지 않음 → 제목 중복 방지)
  els.push({ id: allocId(), type: 'groupbox', x, y, width: W, height: H, hw: W / 2, hh: H / 2,
    label: p.title || '패널', borderColor: border, titleColor: title, bgColor: bg, variant: 'default' })
  const PAD = 16
  const LFS = 10                               // 라벨 글꼴
  const ctrlCx = x + W - 52                     // 값 열 중심: 박스 오른쪽 안쪽 (모든 컨트롤을 이 중심에 정렬)
  rows.forEach((r, i) => {
    const ry = y + 50 + i * 40                  // 행 중심 y (text·컨트롤 모두 중심 앵커)
    // 라벨: 글자폭 절반만큼 오른쪽에 중심을 둬서 좌측(x+PAD)에 정렬
    const lw = estTextWidth(String(r.label ?? ''), LFS)
    els.push({ id: allocId(), type: 'text', x: Math.round(x + PAD + lw / 2), y: ry, label: String(r.label ?? ''),
      fontSize: LFS, color: S.labelColor, hw: Math.max(16, Math.round(lw / 2)), hh: 8, variant: 'default' })
    // 컨트롤 종류: 명시(kind) > 태그 타입 추론(BIT→lamp, 그 외→numeric) > numeric
    let kind = ['numeric', 'lamp', 'switch', 'gauge', 'bar'].includes(r.kind) ? r.kind : null
    const t = r.tag ? tagById[r.tag] : null
    if (!kind) kind = t ? (t.type === 'BIT' ? 'lamp' : 'numeric') : 'numeric'
    const e = createElement(kind, ctrlCx, ry, allocId(), r.tag || '', '')   // 컨트롤 중심 y = 라벨 중심 y
    // ── 멋진 배열을 위한 통일 기본값 (사용자가 상세 지정 안 해도 예쁘게) ──
    if (kind === 'numeric') {
      e.hw = 44; e.hh = 17                      // 값 박스 크기 통일
      e.valueFontSize = S.numeric.valueFontSize  // 스타일별 값 글꼴
      e.showBox = true; e.digitColor = r.digitColor || S.numeric.digitColor
      e.bgColor = S.numeric.bgColor; e.boxColor = S.numeric.boxColor
      if (r.unit != null) e.unit = String(r.unit); else if (t && t.unit) e.unit = t.unit
      if (r.decimals != null) e.decimals = +r.decimals; else if (t && t.decimals != null) e.decimals = t.decimals
      if (r.input) {
        e.inputMode = 'numeric'
        e.numMin = r.min != null ? +r.min : (t && t.min != null ? t.min : 0)
        e.numMax = r.max != null ? +r.max : (t && t.max != null ? t.max : 100)
      }
    } else if (kind === 'switch') {
      e.hw = 32; e.hh = 20                        // 스위치 고정 시각(64×40)에 맞춘 히트박스
      e.behavior = r.behavior || 'toggle'
    } else if (kind === 'lamp') {
      e.hw = 32; e.hh = 20                        // 램프 고정 시각(64×40)에 맞춘 히트박스
      if (r.color) e.color = r.color
    }
    els.push(e)
  })
  return { els, tags }
}

// 배치 경계: 해상도 기반으로 동적 생성
// 핸들이 있으면 확인 후 바로 덮어쓰기, 없으면 저장 팝업 열기
async function quickSave(projectData, fileHandleRef, setSaveDialogOpen, currentFileName) {
  const handle = fileHandleRef.current
  if (!handle) { setSaveDialogOpen(true); return }
  const ok = window.confirm(`현재 파일에 저장하시겠습니까?\n\n📄 ${currentFileName || handle.name}`)
  if (!ok) return
  try {
    const json = JSON.stringify({ ...projectData, _format:'nexushmi', _v:2, _savedAt:new Date().toISOString() }, null, 2)
    const writable = await handle.createWritable()
    await writable.write(json)
    await writable.close()
  } catch (err) {
    if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
      fileHandleRef.current = null
      setSaveDialogOpen(true)
    } else if (err?.name !== 'AbortError') {
      window.alert('저장 실패: ' + err?.message)
    }
  }
}

function makeAppClamp(w, h) {
  return {
    clampX: v => Math.max(0, Math.min(w, Math.round(v))),
    clampY: v => Math.max(0, Math.min(h, Math.round(v))),
  }
}
// 기본값 (resolution 로드 전 사용)
let clampX = v => Math.max(0, Math.min(5000, Math.round(v)))
let clampY = v => Math.max(0, Math.min(3000, Math.round(v)))

function defaultTagFor(type, tags) {
  if (!tags.length) return ''
  if (type === 'lamp' || type === 'switch') return (tags.find(t => t.type === 'BIT') ?? tags[0]).id
  return (tags.find(t => t.type !== 'BIT') ?? tags[0]).id
}

function maxIdNumAll(screens) {
  return screens.reduce((max, s) => {
    const m = s.elements.reduce((m2, el) => {
      const n = parseInt(String(el.id).replace(/\D/g, ''), 10)
      return Number.isFinite(n) ? Math.max(m2, n) : m2
    }, 0)
    return Math.max(max, m)
  }, 0)
}

/* ── Top/Project bars ── */
function TopBar({ tags }) {
  const access = useAccess()
  const alarmCount = tags.filter(t => t.type !== 'BIT' && (t.value / t.max) > 0.85).length
  const now = new Date().toLocaleString('ko', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' })
  return (
    <header className="flex items-center px-4 h-10 bg-[#0d1117] border-b border-[#2d3748] flex-shrink-0 gap-4">
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center shrink-0">
          <svg width="24" height="24" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="tbg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1a6dd4"/>
                <stop offset="100%" stopColor="#0e4fb0"/>
              </linearGradient>
            </defs>
            <rect width="64" height="64" rx="12" fill="url(#tbg)"/>
            <polyline points="6,32 16,32 22,18 28,46 34,24 40,38 46,32 58,32"
              fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <span className="text-[13px] font-bold tracking-wide">
          <span className="text-[#4a9eff]">Nexus</span><span className="text-[#e2e8f0]">HMI</span>
        </span>
        <span className="text-[9px] text-[#4a5568] font-mono ml-1">v1.0.0</span>
      </div>
      <div className="w-px h-4 bg-[#2d3748]" />
      <span className="text-[10px] text-[#3f8cff] font-mono font-bold tracking-wide">EDITOR</span>
      <div className="flex items-center gap-3 ml-auto">
        <button className="flex items-center gap-1.5 px-2 py-0.5 rounded"
          style={alarmCount > 0 ? { background:'#450a0a', border:'1px solid #7f1d1d' } : { background:'#1a202c', border:'1px solid #2d3748' }}>
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
        <button className="p-1 rounded hover:bg-[#2d3748] text-[#4a5568] hover:text-[#e2e8f0] transition-colors">
          <Settings size={13} />
        </button>
        {access.user && (
          <div className="flex items-center gap-1.5 pl-2.5 ml-0.5 border-l border-[#2d3748]">
            {access.owner && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[#14532d] text-[#4ade80] border border-[#166534]">OWNER</span>}
            <span className="text-[10px] text-[#94a3b8] max-w-[150px] truncate hidden sm:inline">{access.user.email}</span>
            <button onClick={doSignOut} title="로그아웃"
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold text-[#f87171] hover:bg-[#450a0a] hover:text-[#fca5a5] transition-colors">
              <LogOut size={12} /> 로그아웃
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

function ProjectBar({ projectName, onRename, onOpenFileMenu, onOpenDevices, onOpenRegistry, onRun, onRelayout, elementCount, tagCount, deviceCount, currentFileName, onOpenLearning, learnedCount = 0 }) {
  return (
    <div className="flex items-center gap-2 px-3 h-9 bg-[#10151f] border-b border-[#2d3748] flex-shrink-0">
      {/* File 메뉴 버튼 */}
      <button onClick={onOpenFileMenu}
        className="flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-bold transition-all"
        style={{ background:'#1a2233', border:'1px solid #374151', color:'#94a3b8' }}
        onMouseEnter={e => { e.currentTarget.style.background='#1e2736'; e.currentTarget.style.color='#e2e8f0' }}
        onMouseLeave={e => { e.currentTarget.style.background='#1a2233'; e.currentTarget.style.color='#94a3b8' }}>
        <svg width="13" height="13" viewBox="0 0 64 64">
          <defs><linearGradient id="fbtn" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#1a6dd4"/><stop offset="100%" stopColor="#0e4fb0"/></linearGradient></defs>
          <rect width="64" height="64" rx="10" fill="url(#fbtn)"/>
          <polyline points="6,32 16,32 22,18 28,46 34,24 40,38 46,32 58,32" fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        파일
      </button>
      <div className="w-px h-4 bg-[#2d3748]" />
      <button onClick={onOpenDevices} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-[#cbd5e1] hover:bg-[#2d3748] transition-colors">
        <Cpu size={12} className="text-[#60a5fa]" /> 디바이스 <span className="text-[#4a5568]">({deviceCount})</span>
      </button>
      <button onClick={onOpenRegistry} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-[#cbd5e1] hover:bg-[#2d3748] transition-colors">
        <Database size={12} className="text-[#a78bfa]" /> 태그 <span className="text-[#4a5568]">({tagCount})</span>
      </button>
      <button onClick={onOpenLearning} title="학습 라이브러리 (패턴 저장 위치·상태)"
        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-[#cbd5e1] hover:bg-[#2d3748] transition-colors">
        <Brain size={12} className="text-[#34d399]" /> 학습 <span className="text-[#4a5568]">({learnedCount})</span>
      </button>
      <div className="w-px h-4 bg-[#2d3748] mx-1" />
      <span className="text-[9px] text-[#4a5568] uppercase tracking-wide">Project</span>
      <input value={projectName} onChange={e => onRename(e.target.value)} spellCheck={false}
        className="text-[11px] font-mono font-bold text-[#e2e8f0] bg-[#1a202c] border border-[#2d3748] rounded px-2 py-1 w-52 focus:outline-none focus:border-[#1e40af]" />
      {currentFileName
        ? <span className="flex items-center gap-1 text-[9px] text-[#22c55e]"><Save size={10} />{currentFileName}</span>
        : <span className="flex items-center gap-1 text-[9px] text-[#4a5568]"><Save size={10} /> 미저장</span>
      }
      <div className="ml-auto flex items-center gap-3">
        <span className="text-[10px] text-[#4a5568]">{elementCount} 요소</span>
        <button onClick={() => {
            const input = window.prompt('열 수를 입력하세요 (비우면 자동)', '')
            const cols = input === null ? undefined : (input.trim() === '' ? undefined : parseInt(input))
            onRelayout(cols)
          }} title="패널 자동 정렬"
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-all"
          style={{ background:'#1a2233', border:'1px solid #374151', color:'#94a3b8' }}
          onMouseEnter={e => { e.currentTarget.style.background='#1e3a5f'; e.currentTarget.style.color='#60a5fa' }}
          onMouseLeave={e => { e.currentTarget.style.background='#1a2233'; e.currentTarget.style.color='#94a3b8' }}>
          <LayoutGrid size={12} /> 정렬
        </button>
        <button onClick={onRun}
          className="flex items-center gap-1.5 px-3 py-1 rounded font-bold text-[11px] text-white transition-all"
          style={{ background:'#16a34a', border:'1px solid #22c55e', boxShadow:'0 0 10px #22c55e55' }}>
          <Play size={12} fill="white" /> RUN ▶
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const initial = useRef(loadProject() ?? DEMO_PROJECT).current

  const [projectName, setProjectName] = useState(initial.name)
  const [resolution, setResolution] = useState(initial.resolution ?? DEFAULT_RESOLUTION)
  const [devices, setDevices] = useState(initial.devices)
  const [customDrivers, setCustomDriversState] = useState(initial.drivers || [])
  registerCustomDrivers(customDrivers) // 드라이버 레지스트리에 주입(내장+커스텀 병합)
  const saveDriver = useCallback((driver) => setCustomDriversState(prev => {
    const i = prev.findIndex(d => d.id === driver.id)
    if (i >= 0) { const n = prev.slice(); n[i] = driver; return n }
    return [...prev, driver]
  }), [])
  const deleteDriver = useCallback((id) => setCustomDriversState(prev => prev.filter(d => d.id !== id)), [])
  const [tags, setTags] = useState(initial.tags)
  const [symbols, setSymbols] = useState(() => {
    // 내장 표준 부품(std_)을 항상 앞에 + 사용자 심볼 (중복 std_ 제거)
    const user = (initial.symbols && initial.symbols.length) ? initial.symbols : loadGlobalSymbols()
    const userClean = (Array.isArray(user) ? user : []).filter(s => !String(s.id).startsWith('std_'))
    return [...STD_SYMBOLS, ...userClean]
  })
  const [recipeSets, setRecipeSets] = useState(initial.recipeSets ?? [])
  const recipeSetsRef = useRef(recipeSets); recipeSetsRef.current = recipeSets

  // ── 멀티 스크린 상태 ──
  const [screens, setScreens] = useState(() => {
    if (Array.isArray(initial.screens) && initial.screens.length) return initial.screens
    // 구버전: elements를 첫 화면으로 마이그레이션
    return [makeScreen({ id:'scr_main', name:'1-메인화면', type:'base', elements: initial.elements ?? [], bindings: initial.bindings ?? {}, svgBindings: initial.svgBindings ?? {} })]
  })
  const [activeScreenId, setActiveScreenId] = useState(() => initial.activeScreenId ?? 'scr_main')

  // active screen 데이터 (derived)
  const activeScreen = useMemo(() => screens.find(s => s.id === activeScreenId) ?? screens[0], [screens, activeScreenId])
  const elements    = activeScreen?.elements    ?? []
  const bindings    = activeScreen?.bindings    ?? {}
  const svgBindings = activeScreen?.svgBindings ?? {}

  // active screen ID를 ref로 유지 (콜백 안에서 최신값 참조)
  const activeScreenIdRef = useRef(activeScreenId)
  activeScreenIdRef.current = activeScreenId

  const [selectedId, setSelectedId] = useState(null)
  const [selectedIds, setSelectedIds] = useState([]) // 다중 선택
  const selectedIdsRef = useRef([]); selectedIdsRef.current = selectedIds
  const selectedIdRef = useRef(null); selectedIdRef.current = selectedId
  const [penMode, setPenMode] = useState(false) // 선 그리기 모드
  const [wireMode, setWireMode] = useState(false) // 연결선 그리기 모드
  const [propModalId, setPropModalId] = useState(null)
  const propOriginalRef = useRef(null) // 속성창 열릴 때 원본 저장 (취소 시 복원)
  const clipboardRef = useRef(null)    // 복사된 요소
  const [registryOpen, setRegistryOpen] = useState(false)
  const [deviceRegistryOpen, setDeviceRegistryOpen] = useState(false)
  // 패널 스타일 (갤러리에서 선택, localStorage 저장) — 새 패널에 자동 적용
  const [panelStyleKey, setPanelStyleKey] = useState(loadActiveStyleKey())
  const panelStyleRef = useRef(panelStyleKey); panelStyleRef.current = panelStyleKey
  const [styleGalleryOpen, setStyleGalleryOpen] = useState(false)
  const pickPanelStyle = useCallback((key) => { setPanelStyleKey(key); saveActiveStyleKey(key) }, [])
  // 학습 라이브러리 — AI 주입용 압축 프로파일 (서버에서 로드)
  const [learnedProfile, setLearnedProfile] = useState('')
  const [learnedCount, setLearnedCount] = useState(0)
  const [learningOpen, setLearningOpen] = useState(false)
  const [recipeOpen, setRecipeOpen] = useState(false)
  useEffect(() => {
    getLearningProfile().then(r => { if (r) { setLearnedProfile(r.summary || ''); setLearnedCount(r.count || 0) } })
  }, [])
  const [symbolLibOpen, setSymbolLibOpen] = useState(false)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [fileMenuOpen, setFileMenuOpen] = useState(false)
  const fileHandleRef = useRef(null)
  const [currentFileName, setCurrentFileName] = useState(null)

  const updatedIds = new Set()

  // resolution 변경 시 clamp 갱신
  const { clampX: cx, clampY: cy } = makeAppClamp(resolution.w, resolution.h)
  clampX = cx; clampY = cy

  const tagsRef = useRef(tags); tagsRef.current = tags
  const devicesRef = useRef(devices); devicesRef.current = devices
  const symbolsRef = useRef(symbols); symbolsRef.current = symbols
  const screensRef = useRef(screens); screensRef.current = screens

  const nextIdRef = useRef(maxIdNumAll(initial.screens ?? []) + 1)

  // ── active screen 패치 헬퍼 ──
  const patchActiveScreen = useCallback((fn) => {
    setScreens(prev => prev.map(s =>
      s.id === activeScreenIdRef.current ? { ...s, ...fn(s) } : s
    ))
  }, [])

  // 레시피 열 → 태그 자동 등록: 주소 있으면 제목으로 태그 생성, 주소 없으면 missing에 담아 반환
  const registerTagsFromRecipe = useCallback((cols = []) => {
    const prev = tagsRef.current
    const ids = new Set(prev.map(t => t.id))
    const addrs = new Set(prev.map(t => t.address).filter(Boolean))
    const missing = [], created = [], newTags = []
    for (const c of cols) {
      if (!c.addr) { missing.push(c.title || '(제목없음)'); continue }
      if (addrs.has(c.addr)) continue // 이미 그 주소의 태그 존재
      const base = (c.title || 'RCP').toUpperCase().replace(/[^A-Z0-9가-힣]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'RCP'
      let id = 'TAG_' + base, n = 1
      while (ids.has(id)) { id = 'TAG_' + base + '_' + (++n) }
      ids.add(id); addrs.add(c.addr)
      const type = c.type === 'text' ? 'WORD' : (c.fmt === 'FLOAT' ? 'FLOAT' : 'WORD')
      newTags.push(makeTag({ id, desc: c.title || id, address: c.addr, type, unit: c.unit || '', decimals: c.decimals || 0, device: VIRTUAL_DEVICE, utility: '레시피' }))
      created.push(id)
    }
    if (newTags.length) setTags(prev => [...prev, ...newTags])
    return { created, missing }
  }, [])

  // 자동 저장
  useEffect(() => {
    saveProject({ name: projectName, resolution, devices, tags, screens, activeScreenId, symbols, recipeSets, drivers: customDrivers,
      elements: activeScreen?.elements ?? [], bindings: activeScreen?.bindings ?? {}, svgBindings: activeScreen?.svgBindings ?? {},
      bgImage: activeScreen?.bgImage ?? '', bgFit: activeScreen?.bgFit ?? 'slice', bgDim: activeScreen?.bgDim ?? 0, sim: activeScreen?.sim ?? null })
  }, [projectName, resolution, devices, tags, screens, activeScreenId, symbols, recipeSets, customDrivers])

  // ── 화면 CRUD ──
  const selectScreen = useCallback((id) => {
    setActiveScreenId(id)
    setSelectedId(null)
    setPropModalId(null)
  }, [])

  const addScreen = useCallback((type, props = {}) => {
    const idx = screensRef.current.filter(s => s.type === (props.type ?? type)).length + 1
    const s = makeScreen({ name: props.name ?? `${idx}-새화면`, type: props.type ?? type, bgColor: props.bgColor })
    setScreens(prev => [...prev, s])
    setActiveScreenId(s.id)
    setSelectedId(null)
  }, [])

  const renameScreen = useCallback((id, name) => {
    setScreens(prev => prev.map(s => s.id === id ? { ...s, name } : s))
  }, [])

  const updateScreen = useCallback((id, patch) => {
    setScreens(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
  }, [])

  const duplicateScreen = useCallback((id) => {
    const src = screensRef.current.find(s => s.id === id)
    if (!src) return
    const s = makeScreen({ ...src, id: undefined, name: src.name + ' (복사)' })
    setScreens(prev => {
      const idx = prev.findIndex(s2 => s2.id === id)
      const next = [...prev]
      next.splice(idx + 1, 0, s)
      return next
    })
    setActiveScreenId(s.id)
  }, [])

  const deleteScreen = useCallback((id) => {
    if (screensRef.current.length <= 1) { window.alert('마지막 화면은 삭제할 수 없습니다.'); return }
    if (!window.confirm('이 화면을 삭제하시겠습니까?')) return
    setScreens(prev => {
      const next = prev.filter(s => s.id !== id)
      if (activeScreenIdRef.current === id) setActiveScreenId(next[0]?.id ?? '')
      return next
    })
  }, [])

  // ── 요소 CRUD (active screen 대상) ──
  const addElement = useCallback((type, x, y, extra) => {
    const id = 'e' + (nextIdRef.current++)
    const tagId = defaultTagFor(type, tagsRef.current)
    // shape: extra = shapeId / groupbox: extra = boxStyle / 그 외: extra 무시
    const label = type === 'shape' ? (extra || 'rect') : (ELEMENT_TYPE_LABELS[type] ?? type).toUpperCase()
    const el = createElement(type, clampX(x), clampY(y), id, tagId, label)
    if (type === 'groupbox' && ['sharp', 'round', 'bevel'].includes(extra)) el.boxStyle = extra
    patchActiveScreen(s => ({ elements: [...s.elements, el] }))
    setSelectedId(id)
  }, [patchActiveScreen])

  const addFreehand = useCallback((partial) => {
    const id = 'e' + (nextIdRef.current++)
    const el = { id, type: 'shape', shape: 'freehand', variant: 'default', label: '', ...partial }
    patchActiveScreen(s => ({ elements: [...s.elements, el] }))
    setSelectedId(id)
  }, [patchActiveScreen])

  const addWire = useCallback((partial) => {
    const id = 'e' + (nextIdRef.current++)
    const first = partial.points?.[0] || [0, 0]
    const el = { id, type: 'wire', x: first[0], y: first[1], label: '',
      strokeColor: '#00e5ff', strokeWidth: 2, opacity: 1, anchors: [], ...partial }
    patchActiveScreen(s => ({ elements: [...s.elements, el] }))
    setSelectedId(id)
  }, [patchActiveScreen])

  // 그룹 / 그룹 해제
  const groupSelected = useCallback(() => {
    const ids = selectedIdsRef.current
    if (!ids || ids.length < 2) return
    const gid = 'grp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    patchActiveScreen(s => ({ elements: s.elements.map(e => ids.includes(e.id) ? { ...e, groupId: gid } : e) }))
  }, [patchActiveScreen])
  const ungroupSelected = useCallback(() => {
    const ids = selectedIdsRef.current.length ? selectedIdsRef.current : (selectedIdRef.current ? [selectedIdRef.current] : [])
    if (!ids.length) return
    patchActiveScreen(s => {
      const gids = new Set(s.elements.filter(e => ids.includes(e.id) && e.groupId).map(e => e.groupId))
      if (!gids.size) return {}
      return { elements: s.elements.map(e => (e.groupId && gids.has(e.groupId)) ? { ...e, groupId: undefined } : e) }
    })
  }, [patchActiveScreen])

  // 정렬 / 분배 (다중 선택 대상)
  const alignSelected = useCallback((mode) => {
    const ids = selectedIdsRef.current
    if (!ids || ids.length < 2) return
    patchActiveScreen(s => ({ elements: applyAlign(s.elements, ids, mode) }))
  }, [patchActiveScreen])
  const distributeSelected = useCallback((axis) => {
    const ids = selectedIdsRef.current
    if (!ids || ids.length < 3) return
    patchActiveScreen(s => ({ elements: applyDistribute(s.elements, ids, axis) }))
  }, [patchActiveScreen])

  const moveElement = useCallback((id, x, y) => {
    patchActiveScreen(s => ({ elements: s.elements.map(el => {
      if (el.id !== id) return el
      // 와이어: 모든 정점을 델타만큼 이동 (붙은 끝은 렌더 시 포트로 재스냅)
      if (el.type === 'wire' && Array.isArray(el.points)) {
        const dx = clampX(x) - el.x, dy = clampY(y) - el.y
        return { ...el, x: clampX(x), y: clampY(y), points: el.points.map(p => [p[0] + dx, p[1] + dy]) }
      }
      return { ...el, x: clampX(x), y: clampY(y) }
    }) }))
  }, [patchActiveScreen, clampX, clampY])

  const resizeElement = useCallback((id, geom) => {
    patchActiveScreen(s => ({
      elements: s.elements.map(e => {
        if (e.id !== id) return e
        const u = { ...e }
        if (geom.x !== undefined) u.x = clampX(geom.x)
        if (geom.y !== undefined) u.y = clampY(geom.y)
        if (geom.width  !== undefined) { u.width  = geom.width;  u.hw = geom.width  / 2 }
        if (geom.height !== undefined) { u.height = geom.height; u.hh = geom.height / 2 }
        // 심볼(symbol): w/h 필드도 동기화
        if (e.type === 'symbol') {
          if (geom.width  !== undefined) u.w = geom.width
          if (geom.height !== undefined) u.h = geom.height
        }
        if (geom.label  !== undefined) u.label = geom.label
        return u
      })
    }))
  }, [patchActiveScreen])

  const updateElement = useCallback((id, patch) => {
    patchActiveScreen(s => ({
      elements: s.elements.map(el => {
        if (el.id !== id) return el
        const next = { ...el, ...patch }
        if ('w' in patch || 'h' in patch) { next.hw = (next.w || 48) / 2; next.hh = (next.h || 48) / 2 }
        // 위치(x/y) 변경 시 와이어는 정점도 같은 델타로 이동
        if (('x' in patch || 'y' in patch) && el.type === 'wire' && Array.isArray(el.points)) {
          const dx = (next.x ?? el.x) - el.x, dy = (next.y ?? el.y) - el.y
          if (dx || dy) next.points = el.points.map(p => [p[0] + dx, p[1] + dy])
        }
        return next
      })
    }))
  }, [patchActiveScreen])

  const deleteElement = useCallback((id) => {
    patchActiveScreen(s => ({
      elements: s.elements.filter(el => el.id !== id),
      bindings: Object.fromEntries(Object.entries(s.bindings).filter(([k]) => k !== id)),
      svgBindings: Object.fromEntries(Object.entries(s.svgBindings).filter(([k]) => k !== id)),
    }))
    setSelectedId(cur => cur === id ? null : cur)
  }, [patchActiveScreen])

  // 다중 삭제 (마퀴 선택 등)
  const deleteElements = useCallback((ids) => {
    const set = new Set(ids)
    if (!set.size) return
    patchActiveScreen(s => ({
      elements: s.elements.filter(el => !set.has(el.id)),
      bindings: Object.fromEntries(Object.entries(s.bindings).filter(([k]) => !set.has(k))),
      svgBindings: Object.fromEntries(Object.entries(s.svgBindings).filter(([k]) => !set.has(k))),
    }))
    setSelectedId(cur => set.has(cur) ? null : cur)
    setSelectedIds(prev => prev.filter(id => !set.has(id)))
  }, [patchActiveScreen])

  const handleBind = useCallback((elementId, tagId) => {
    patchActiveScreen(s => ({ bindings: { ...s.bindings, [elementId]: tagId } }))
  }, [patchActiveScreen])

  // field: 'enable'(BIT) | 'speed'(FLOAT)
  const handleSvgBind = useCallback((elementId, layerId, tagId, field = 'speed') => {
    patchActiveScreen(s => {
      const prev = s.svgBindings[elementId]?.[layerId] || {}
      const entry = typeof prev === 'string' ? { speed: prev } : prev // 구버전 문자열 마이그레이션
      return {
        svgBindings: {
          ...s.svgBindings,
          [elementId]: { ...(s.svgBindings[elementId] || {}), [layerId]: { ...entry, [field]: tagId } }
        }
      }
    })
  }, [patchActiveScreen])

  const setElementVariant = useCallback((id, variant) => {
    patchActiveScreen(s => ({ elements: s.elements.map(el => el.id === id ? { ...el, variant } : el) }))
  }, [patchActiveScreen])

  const setElementBehavior = useCallback((id, behavior) => {
    patchActiveScreen(s => ({ elements: s.elements.map(el => el.id === id ? { ...el, behavior } : el) }))
  }, [patchActiveScreen])

  // 속성창 열기 (원본 저장)
  const openPropModal = useCallback((id) => {
    const el = screensRef.current.find(s => s.id === activeScreenIdRef.current)?.elements?.find(e => e.id === id)
    propOriginalRef.current = el ? { ...el } : null
    setPropModalId(id)
  }, [])

  // 속성창 취소 — 원본 복원
  const cancelPropModal = useCallback(() => {
    const orig = propOriginalRef.current
    if (orig) {
      patchActiveScreen(s => ({ elements: s.elements.map(e => e.id === orig.id ? orig : e) }))
    }
    propOriginalRef.current = null
    setPropModalId(null)
  }, [patchActiveScreen])

  // 속성창 확인 — 변경 유지
  const confirmPropModal = useCallback(() => {
    propOriginalRef.current = null
    setPropModalId(null)
  }, [])

  const handleDeselect = useCallback(() => {
    if (propModalId) cancelPropModal()
    setSelectedId(null)
    setSelectedIds([])
  }, [propModalId, cancelPropModal])

  // 레이어 순서 변경
  const reorderElement = useCallback((id, dir) => {
    patchActiveScreen(s => {
      const els = [...s.elements]
      const idx = els.findIndex(e => e.id === id)
      if (idx < 0) return {}
      if (dir === 'front') { const [el] = els.splice(idx, 1); els.push(el) }
      else if (dir === 'back') { const [el] = els.splice(idx, 1); els.unshift(el) }
      else if (dir === 'forward' && idx < els.length - 1) { [els[idx], els[idx + 1]] = [els[idx + 1], els[idx]] }
      else if (dir === 'backward' && idx > 0) { [els[idx], els[idx - 1]] = [els[idx - 1], els[idx]] }
      return { elements: els }
    })
  }, [patchActiveScreen])

  // 복사 — id 배열(다중) 또는 단일 id 모두 지원
  const copyIds = useCallback((ids) => {
    const list = Array.isArray(ids) ? ids : [ids]
    const els = screensRef.current.find(s => s.id === activeScreenIdRef.current)?.elements || []
    // 선택 요소가 그룹에 속하면 같은 그룹의 나머지 멤버도 함께 복사 (그룹 통째 복사)
    const gids = new Set(els.filter(e => list.includes(e.id) && e.groupId != null).map(e => e.groupId))
    const copied = els.filter(e => list.includes(e.id) || (e.groupId != null && gids.has(e.groupId)))
      .map(e => JSON.parse(JSON.stringify(e)))
    if (copied.length) clipboardRef.current = copied
  }, [])
  const copyElement = useCallback((idOrIds) => copyIds(idOrIds), [copyIds]) // 단일 id 또는 id 배열

  // 붙여넣기 (20px 오프셋) — 다중 요소 + 와이어 좌표/앵커 재매핑
  const pasteFrom = useCallback((src) => {
    if (!src || !src.length) return
    const OFF = 20
    const idMap = {}
    const groupMap = {}
    src.forEach(e => {
      idMap[e.id] = 'e' + (nextIdRef.current++)
      if (e.groupId && !groupMap[e.groupId]) groupMap[e.groupId] = 'grp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + Object.keys(groupMap).length
    })
    const newEls = src.map(e => {
      const ne = JSON.parse(JSON.stringify(e))
      ne.id = idMap[e.id]
      ne.x = (e.x ?? 0) + OFF
      ne.y = (e.y ?? 0) + OFF
      // 그룹은 새 groupId로 (원본과 분리)
      if (ne.groupId && groupMap[ne.groupId]) ne.groupId = groupMap[ne.groupId]
      if (ne.type === 'wire' && Array.isArray(ne.points)) {
        ne.points = ne.points.map(p => [p[0] + OFF, p[1] + OFF])
        if (Array.isArray(ne.anchors)) ne.anchors = ne.anchors.map(a => (a && idMap[a.elId]) ? { ...a, elId: idMap[a.elId] } : a)
        if (ne.from && idMap[ne.from.elId]) ne.from = { ...ne.from, elId: idMap[ne.from.elId] }
        if (ne.to && idMap[ne.to.elId]) ne.to = { ...ne.to, elId: idMap[ne.to.elId] }
      }
      return ne
    })
    patchActiveScreen(s => ({ elements: [...s.elements, ...newEls] }))
    setSelectedId(newEls[0].id)
    setSelectedIds(newEls.length > 1 ? newEls.map(e => e.id) : [])
  }, [patchActiveScreen])
  const pasteElement = useCallback(() => pasteFrom(clipboardRef.current), [pasteFrom])

  // 복제 (Ctrl+D) — 클립보드를 건드리지 않고 선택 요소를 그 자리에 복제
  const duplicateSelected = useCallback(() => {
    const ids = selectedIdsRef.current.length ? selectedIdsRef.current : (selectedIdRef.current ? [selectedIdRef.current] : [])
    if (!ids.length) return
    const els = screensRef.current.find(s => s.id === activeScreenIdRef.current)?.elements || []
    const gids = new Set(els.filter(e => ids.includes(e.id) && e.groupId != null).map(e => e.groupId))
    const src = els.filter(e => ids.includes(e.id) || (e.groupId != null && gids.has(e.groupId)))
      .map(e => JSON.parse(JSON.stringify(e)))
    pasteFrom(src)
  }, [pasteFrom])

  // ── 되돌리기/다시하기 (최대 20단계) ──
  const HISTORY_MAX = 20
  const undoStack = useRef([])
  const redoStack = useRef([])
  const presentRef = useRef(screens)   // 마지막으로 커밋된 screens 스냅샷
  const restoringRef = useRef(false)   // undo/redo로 인한 setScreens 표시
  const histTimerRef = useRef(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const syncHist = useCallback(() => {
    setCanUndo(undoStack.current.length > 0)
    setCanRedo(redoStack.current.length > 0)
  }, [])

  // screens 변경 감지 → 디바운스로 히스토리 커밋 (드래그 등 연속 변경은 1건으로 묶음)
  useEffect(() => {
    if (restoringRef.current) { restoringRef.current = false; presentRef.current = screens; return }
    clearTimeout(histTimerRef.current)
    histTimerRef.current = setTimeout(() => {
      if (screens === presentRef.current) return
      undoStack.current.push(presentRef.current)
      if (undoStack.current.length > HISTORY_MAX) undoStack.current.shift()
      redoStack.current = []
      presentRef.current = screens
      syncHist()
    }, 350)
  }, [screens, syncHist])

  const undo = useCallback(() => {
    clearTimeout(histTimerRef.current)
    // 아직 커밋 안 된 변경이 있으면 먼저 커밋
    if (screensRef.current !== presentRef.current) {
      undoStack.current.push(presentRef.current)
      if (undoStack.current.length > HISTORY_MAX) undoStack.current.shift()
      presentRef.current = screensRef.current
    }
    if (!undoStack.current.length) { syncHist(); return }
    const prev = undoStack.current.pop()
    redoStack.current.push(presentRef.current)
    presentRef.current = prev
    restoringRef.current = true
    setScreens(prev)
    setSelectedId(null); setSelectedIds([])
    syncHist()
  }, [syncHist])

  const redo = useCallback(() => {
    clearTimeout(histTimerRef.current)
    if (!redoStack.current.length) return
    const next = redoStack.current.pop()
    undoStack.current.push(presentRef.current)
    presentRef.current = next
    restoringRef.current = true
    setScreens(next)
    setSelectedId(null); setSelectedIds([])
    syncHist()
  }, [syncHist])

  // ESC → 선택 해제 / Ctrl+C → 복사 / Ctrl+V → 붙여넣기 / Ctrl+Z → 되돌리기 / Ctrl+Y·Shift+Z → 다시하기
  useEffect(() => {
    const fn = e => {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return }
      if (e.key === 'Escape' && (selectedId || selectedIds.length) && !propModalId) { setSelectedId(null); setSelectedIds([]); return }
      // Enter — 선택한 요소의 속성 열기 (뒤에 가려진 요소도 Alt+클릭 선택 후 Enter로 편집)
      if (e.key === 'Enter' && selectedId && !propModalId) { e.preventDefault(); openPropModal(selectedId); return }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault()
        const all = (screensRef.current.find(s => s.id === activeScreenIdRef.current)?.elements || []).map(el => el.id)
        if (all.length) { setSelectedIds(all); setSelectedId(all[all.length - 1]) }
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const ids = selectedIds.length ? selectedIds : (selectedId ? [selectedId] : [])
        if (ids.length) copyIds(ids)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
        const ids = selectedIds.length ? selectedIds : (selectedId ? [selectedId] : [])
        if (ids.length) { e.preventDefault(); copyIds(ids); deleteElements(ids) }
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') { pasteElement(); return }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); duplicateSelected(); return }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault()
        if (e.shiftKey) ungroupSelected(); else groupSelected()
        return
      }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [selectedId, selectedIds, propModalId, copyIds, pasteElement, duplicateSelected, deleteElements, undo, redo, groupSelected, ungroupSelected, openPropModal])

  // ── 심볼 ──
  const addSymbol = useCallback((sym) => {
    setSymbols(prev => { const next = [...prev, sym]; saveGlobalSymbols(next); return next })
  }, [])
  const deleteSymbol = useCallback((id) => {
    setSymbols(prev => { const next = prev.filter(s => s.id !== id); saveGlobalSymbols(next); return next })
  }, [])
  const addSymbolElement = useCallback((symbolId, x, y) => {
    const sym = symbolsRef.current.find(s => s.id === symbolId)
    const id = 'e' + (nextIdRef.current++)
    const role = sym?.off ? 'switchlamp' : 'lamp'
    const tagId = defaultTagFor('lamp', tagsRef.current)
    const el = createSymbolElement(symbolId, clampX(x), clampY(y), id, sym?.w || 48, sym?.h || 48, tagId, '', role)
    patchActiveScreen(s => ({ elements: [...s.elements, el] }))
    setSelectedId(id)
  }, [patchActiveScreen])

  // ── 태그 ──
  const updateTag = useCallback((index, patch) => {
    setTags(prev => prev.map((t, i) => {
      if (i !== index) return t
      const merged = { ...t, ...patch }
      for (const k of ['min','max','value']) {
        if (k in patch) { const n = Number(merged[k]); merged[k] = Number.isFinite(n) ? n : t[k] }
      }
      return merged
    }))
  }, [])

  const addTag = useCallback((tag) => {
    setTags(prev => {
      let id = tag.id || 'TAG_NEW', n = 1
      const ids = new Set(prev.map(t => t.id))
      let unique = id
      while (ids.has(unique)) { unique = `${id}_${n++}` }
      const withAddr = withVirtualAddress(tag, prev) // 가상 태그면 NB/ND 자동 부여
      return [...prev, { ...withAddr, id: unique }]
    })
  }, [])

  const deleteTag = useCallback((index) => {
    setTags(prev => prev.filter((_, i) => i !== index))
  }, [])

  const createGroup = useCallback((groupName, device, members) => {
    const g = String(groupName || '').trim()
    if (!g || !members?.length) return { added: 0 }
    setTags(prev => {
      const ids = new Set(prev.map(t => t.id))
      const additions = []
      for (const m of members) {
        const mem = String(m.name || '').trim() || 'TAG'
        let baseId = `${g}_${mem}`, id = baseId, n = 2
        while (ids.has(id)) { id = `${baseId}_${n++}` }
        ids.add(id)
        additions.push(makeTag({ id, desc:`${g} ${m.label||mem}`, device, utility:g, type:m.type, unit:m.unit, min:m.min, max:m.max, address:m.address }))
      }
      return [...prev, ...additions]
    })
    if (device) setDevices(prev => prev.some(d => d.name === device) ? prev : [...prev, makeDevice({ name: device })])
    return { added: members.length }
  }, [])

  const duplicateGroup = useCallback((sourceGroup, newGroup, newDevice) => {
    const ng = String(newGroup || '').trim()
    if (!ng) return { added: 0 }
    const srcCount = tagsRef.current.filter(t => (t.utility || '') === sourceGroup).length
    setTags(prev => {
      const ids = new Set(prev.map(t => t.id))
      const src = prev.filter(t => (t.utility || '') === sourceGroup)
      const additions = []
      for (const t of src) {
        let baseId = (sourceGroup && t.id.includes(sourceGroup)) ? t.id.split(sourceGroup).join(ng) : `${ng}_${t.id}`
        let id = baseId, n = 2
        while (ids.has(id)) { id = `${baseId}_${n++}` }
        ids.add(id)
        const desc = (sourceGroup && t.desc && t.desc.includes(sourceGroup)) ? t.desc.split(sourceGroup).join(ng) : t.desc
        additions.push({ ...t, id, desc, utility: ng, device: newDevice || t.device })
      }
      return [...prev, ...additions]
    })
    if (newDevice) setDevices(prev => prev.some(d => d.name === newDevice) ? prev : [...prev, makeDevice({ name: newDevice, desc:'(그룹 복제로 추가)' })])
    return { added: srcCount }
  }, [])

  const replaceTags = useCallback((newTags) => {
    setTags(newTags)
    setDevices(prev => {
      const have = new Set(prev.map(d => d.name))
      const additions = []
      for (const t of newTags) {
        const name = String(t.device ?? '').trim()
        if (name && !have.has(name)) { have.add(name); additions.push(makeDevice({ name, desc:'(엑셀에서 자동 등록)' })) }
      }
      return additions.length ? [...prev, ...additions] : prev
    })
  }, [])

  // ── 디바이스 ──
  const updateDevice = useCallback((index, patch) => {
    setDevices(prev => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)))
  }, [])
  const addDevice = useCallback((device) => {
    setDevices(prev => {
      const names = new Set(prev.map(d => d.name))
      let base = device.name || 'DEV_NEW', unique = base, n = 1
      while (names.has(unique)) { unique = `${base}_${n++}` }
      return [...prev, { ...device, name: unique }]
    })
  }, [])
  const deleteDevice = useCallback((index) => {
    setDevices(prev => prev.filter((_, i) => i !== index))
  }, [])

  // ── AI 편집 ──
  const applyAiActions = useCallback((actions) => {
    if (!Array.isArray(actions) || actions.length === 0) return {}
    let els = [...(screensRef.current.find(s => s.id === activeScreenIdRef.current)?.elements ?? [])]
    let binds = { ...(screensRef.current.find(s => s.id === activeScreenIdRef.current)?.bindings ?? {}) }
    const tagAdds = [], devAdds = [], screenAdds = [], recipeAdds = []
    let pendingSwitchId = null
    const tagIds = new Set(tagsRef.current.map(t => t.id))
    const devNames = new Set(devicesRef.current?.map?.(d => d.name) || [])
    let added = 0, removed = 0, bound = 0, moved = 0
    for (const a of actions) {
      const op = a && a.op
      if (op === 'clear') { els = []; binds = {} }
      else if (op === 'add') {
        const id = 'e' + (nextIdRef.current++)
        const type = ['switch','lamp','wordlamp','gauge','numeric','bar','text','groupbox','shape','symbol','recipetable'].includes(a.type) ? a.type : 'numeric'
        const noTagTypes = ['text', 'groupbox', 'shape', 'recipetable']
        const tagId = noTagTypes.includes(type) ? '' : (a.tagId || defaultTagFor(type, tagsRef.current))
        const label = a.label || (ELEMENT_TYPE_LABELS[type] ?? type).toUpperCase()
        let x, y
        if (Number.isFinite(+a.x) && Number.isFinite(+a.y)) {
          // AI가 좌표를 지정한 경우: 겹치면 약간 이동
          x = clampX(+a.x); y = clampY(+a.y)
          const STEP = 20, GAP = 90
          let tries = 0
          while (tries++ < 30 && els.some(e => Math.abs(e.x - x) < GAP && Math.abs(e.y - y) < GAP)) {
            x = clampX(x + STEP); if (x > resolution.w - GAP) { x = 60; y = clampY(y + GAP) }
          }
        } else {
          // AI가 좌표 미지정: 빈 공간 자동 탐색
          const W = resolution.w, H = resolution.h
          const COL_W = 120, ROW_H = 80, MARGIN = 60
          const cols = Math.max(1, Math.floor((W - MARGIN * 2) / COL_W))
          let placed = false
          outer: for (let row = 0; row < 20; row++) {
            for (let col = 0; col < cols; col++) {
              const cx = clampX(MARGIN + col * COL_W)
              const cy = clampY(MARGIN + row * ROW_H)
              if (!els.some(e => Math.abs(e.x - cx) < COL_W * 0.8 && Math.abs(e.y - cy) < ROW_H * 0.8)) {
                x = cx; y = cy; placed = true; break outer
              }
            }
          }
          if (!placed) { x = clampX(MARGIN); y = clampY(MARGIN + els.length * ROW_H) }
        }
        let newEl
        if (type === 'symbol') {
          const w = +a.w || 64, h = +a.h || 64
          newEl = createSymbolElement(a.symbolId || '', x, y, id, w, h, a.tagId || '', label, a.role || 'switchlamp')
        } else {
          newEl = createElement(type, x, y, id, tagId, label)
        }
        // text/groupbox 추가 속성 적용
        if (type === 'text') {
          if (a.fontSize) newEl.fontSize = a.fontSize
          if (a.color) newEl.color = a.color
          if (a.bold !== undefined) newEl.bold = a.bold
          if (a.italic !== undefined) newEl.italic = a.italic
          if (a.underline !== undefined) newEl.underline = a.underline
          if (a.fontFamily) newEl.fontFamily = a.fontFamily
          if (a.align) newEl.align = a.align
        }
        if (type === 'groupbox') {
          if (a.width) { newEl.width = a.width; newEl.hw = a.width / 2 }
          if (a.height) { newEl.height = a.height; newEl.hh = a.height / 2 }
          if (a.borderColor) { newEl.borderColor = a.borderColor; newEl.titleColor = a.borderColor }
          if (a.bgColor) newEl.bgColor = a.bgColor
          if (['sharp','round','bevel'].includes(a.boxStyle)) newEl.boxStyle = a.boxStyle
          if (a.gridRows != null) newEl.gridRows = +a.gridRows
          if (a.gridCols != null) newEl.gridCols = +a.gridCols
          if (a.gridColor) newEl.gridColor = a.gridColor
          if (a.gridColorH) newEl.gridColorH = a.gridColorH
          if (a.gridColorV) newEl.gridColorV = a.gridColorV
          if (a.gridWidth != null) newEl.gridWidth = +a.gridWidth
        }
        if (type === 'shape') {
          newEl.shape = a.shape || 'rect'
          if (a.width)  newEl.hw = +a.width / 2
          if (a.height) newEl.hh = +a.height / 2
          if (a.fillColor) newEl.fillColor = a.fillColor
          if (a.strokeColor) newEl.strokeColor = a.strokeColor
          if (a.strokeWidth != null) newEl.strokeWidth = +a.strokeWidth
          if (a.opacity != null) newEl.opacity = +a.opacity
          if (a.lineStyle) newEl.lineStyle = a.lineStyle
          // 애니메이션 속성 + 태그 연결(별도 bind 없이 add에서 직접)
          if (a.tagId) newEl.tagId = a.tagId
          if (a.animType) newEl.animType = a.animType
          if (a.animBlinkSec != null) newEl.animBlinkSec = +a.animBlinkSec
          if (a.animOnColor) newEl.animOnColor = a.animOnColor
          if (a.animOffColor) newEl.animOffColor = a.animOffColor
          for (const k of ['animMinVal','animMaxVal','animMinSpeed','animMaxSpeed']) if (a[k] != null) newEl[k] = +a[k]
        }
        if (type === 'wordlamp') {
          if (Array.isArray(a.states)) newEl.states = a.states
          if (a.offColor) newEl.offColor = a.offColor
          if (['fill','pill','round'].includes(a.variant)) newEl.variant = a.variant
          if (a.showBits != null) newEl.showBits = !!a.showBits
          if (a.bitWidth != null) newEl.bitWidth = +a.bitWidth
        }
        if (type === 'recipetable') {
          // 레시피셋 지정: id 직접 → 이름 → 이번에 만든/기존 마지막 셋
          let rsid = a.recipeSetId || ''
          if (!rsid && a.recipeSetName) rsid = [...recipeAdds, ...recipeSetsRef.current].find(s => s.name === a.recipeSetName)?.id || ''
          if (!rsid) rsid = recipeAdds[recipeAdds.length - 1]?.id || recipeSetsRef.current[0]?.id || ''
          newEl.recipeSetId = rsid
          if (a.headerColor) newEl.headerColor = a.headerColor
          if (a.width)  { newEl.hw = +a.width / 2 }
          if (a.height) { newEl.hh = +a.height / 2 }
        }
        els.push(newEl); added++
      }
      else if (op === 'addRecipe' && Array.isArray(a.columns)) {
        const rid = 'rs_' + (nextIdRef.current++)
        const columns = a.columns.map((c, i) => ({
          id: 'c_' + rid + '_' + i,
          title: c.title || `항목${i + 1}`,
          type: c.type === 'text' ? 'text' : 'number',
          fmt: ['WORD', 'DWORD', 'FLOAT'].includes(c.fmt) ? c.fmt : 'WORD',
          addr: String(c.addr || '').toUpperCase(),
          unit: c.unit || '',
          digits: +c.digits || 0,
          decimals: +c.decimals || 0,
          maxLen: +c.maxLen || 12,
        }))
        const byTitle = {}; columns.forEach(c => { byTitle[c.title] = c.id })
        const items = (a.items || []).map((it, idx) => {
          const values = {}
          if (Array.isArray(it.values)) it.values.forEach((v, i) => { if (columns[i]) values[columns[i].id] = v })
          else if (it.values && typeof it.values === 'object') for (const [k, v] of Object.entries(it.values)) { if (byTitle[k]) values[byTitle[k]] = v }
          return { no: it.no ?? (idx + 1), values }
        })
        const setName = a.name || `레시피셋 ${recipeSetsRef.current.length + recipeAdds.length + 1}`
        const selectorAddr = String(a.selectorAddr || '').toUpperCase()
        let selectorTag = a.selectorTag || ''
        // 번호 저장 항상 보장: 주소 있으면 아래 regCols에서 등록, 없으면 가상 워드 태그 생성
        if (!selectorAddr) {
          if (!selectorTag) {
            const nb = setName.toUpperCase().replace(/[^A-Z0-9가-힣]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'RCP'
            selectorTag = 'TAG_' + nb + '_NO'; let sn = 1
            while (tagIds.has(selectorTag) || tagAdds.some(t => t.id === selectorTag)) selectorTag = 'TAG_' + nb + '_NO_' + (++sn)
          }
          if (!tagIds.has(selectorTag) && !tagAdds.some(t => t.id === selectorTag)) {
            tagAdds.push(makeTag({ id: selectorTag, desc: setName + ' 번호', type: 'WORD', device: VIRTUAL_DEVICE, utility: '레시피', min: 0, max: 999 }))
          }
        }
        recipeAdds.push({ id: rid, name: setName, index: +a.index || 0, showAddr: true, selectorAddr, selectorTag, columns, items })
        // 주소 있는 열 + 선택 워드 주소 → 태그 자동 등록
        const regCols = selectorAddr ? [...columns, { title: setName + '_번호', addr: selectorAddr, type: 'number', fmt: 'WORD', decimals: 0 }] : columns
        const usedAddr = new Set([...tagsRef.current.map(t => t.address).filter(Boolean), ...tagAdds.map(t => t.address).filter(Boolean)])
        for (const c of regCols) {
          if (!c.addr || usedAddr.has(c.addr)) continue
          const base = (c.title || 'RCP').toUpperCase().replace(/[^A-Z0-9가-힣]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'RCP'
          let id = 'TAG_' + base, n = 1
          while (tagIds.has(id) || tagAdds.some(t => t.id === id)) { id = 'TAG_' + base + '_' + (++n) }
          usedAddr.add(c.addr)
          tagAdds.push(makeTag({ id, desc: c.title || id, address: c.addr, type: c.type === 'text' ? 'WORD' : (c.fmt === 'FLOAT' ? 'FLOAT' : 'WORD'), unit: c.unit || '', decimals: c.decimals || 0, device: VIRTUAL_DEVICE, utility: '레시피' }))
        }
        added++
      }
      else if (op === 'bind' && a.elementId) { binds[a.elementId] = a.tagId; bound++ }
      else if (op === 'delete' && a.elementId) { els = els.filter(e => e.id !== a.elementId); delete binds[a.elementId]; removed++ }
      else if (op === 'move' && a.elementId) {
        const el0 = els.find(e => e.id === a.elementId)
        let nx = clampX(+a.x), ny = clampY(+a.y)
        const c = clampInsideBox(el0, nx, ny, els); nx = c.x; ny = c.y  // 박스 안 요소는 밖으로 못 나감
        els = els.map(e => e.id === a.elementId ? { ...e, x: Math.round(nx), y: Math.round(ny) } : e); moved++
      }
      else if (op === 'setProp' && a.elementId) {
        const { op: _op, elementId: _id, ...props } = a
        // width/height → hw/hh 동기화(도형·심볼 등)
        if (props.width != null) { props.hw = +props.width / 2; if (props.w == null) props.w = +props.width }
        if (props.height != null) { props.hh = +props.height / 2; if (props.h == null) props.h = +props.height }
        // tagId가 오면 실제 태그 바인딩까지 반영 (속성창 매핑 + 애니메이션 동작)
        if (props.tagId) { binds[a.elementId] = props.tagId; bound++ }
        // x/y 변경 시에도 박스 안 요소는 밖으로 못 나가게 클램프
        if (props.x != null || props.y != null) {
          const el0 = els.find(e => e.id === a.elementId)
          const nx = props.x != null ? clampX(+props.x) : el0?.x
          const ny = props.y != null ? clampY(+props.y) : el0?.y
          const c = clampInsideBox(el0, nx, ny, els)
          if (props.x != null) props.x = Math.round(c.x)
          if (props.y != null) props.y = Math.round(c.y)
        }
        els = els.map(e => e.id === a.elementId ? { ...e, ...props } : e)
      }
      else if (op === 'addWire' && a.from?.elId && a.to?.elId) {
        const startEl = els.find(e => e.id === a.from.elId)
        const endEl = els.find(e => e.id === a.to.elId)
        if (startEl && endEl) {
          const sPort = a.from.port || 'right', ePort = a.to.port || 'left'
          const sp = portPos(startEl, sPort), ep = portPos(endEl, ePort)
          els.push({
            id: 'e' + (nextIdRef.current++), type: 'wire',
            x: Math.round(sp.x), y: Math.round(sp.y),
            points: [[Math.round(sp.x), Math.round(sp.y)], [Math.round(ep.x), Math.round(ep.y)]],
            from: { elId: startEl.id, port: sPort }, to: { elId: endEl.id, port: ePort }, anchors: [],
            strokeColor: a.strokeColor || '#00e5ff', strokeWidth: +a.strokeWidth || 2, opacity: 1,
            lineStyle: a.lineStyle || 'solid',
            flow: !!a.flow, flowEnableTag: a.flowEnableTag || '', flowSpeedTag: a.flowSpeedTag || '',
            flowDir: a.flowDir || 'forward', flowColor: a.flowColor || '#38f5d0',
          })
          added++
        }
      }
      else if (op === 'setPropMany' && Array.isArray(a.elementIds)) {
        const { op: _op, elementIds, ...props } = a
        if (props.width != null) { props.hw = +props.width / 2; if (props.w == null) props.w = +props.width }
        if (props.height != null) { props.hh = +props.height / 2; if (props.h == null) props.h = +props.height }
        els = els.map(e => elementIds.includes(e.id) ? { ...e, ...props } : e)
      }
      else if (op === 'align' && Array.isArray(a.elementIds)) {
        els = applyAlign(els, a.elementIds, a.mode)
      }
      else if (op === 'distribute' && Array.isArray(a.elementIds)) {
        els = applyDistribute(els, a.elementIds, a.axis === 'v' ? 'v' : 'h')
      }
      else if (op === 'addTemplate') {
        const bx = clampX(Number.isFinite(+a.x) ? +a.x : 40)
        const by = clampY(Number.isFinite(+a.y) ? +a.y : Math.max(60, occupiedBottom(els) + 40))
        const kind = ['motor', 'tank', 'pid'].includes(a.kind) ? a.kind : 'pid'
        const built = buildTemplate(kind, bx, by, a.name || '패널', () => 'e' + (nextIdRef.current++))
        built.tags.forEach(t => { if (!tagIds.has(t.id)) { tagIds.add(t.id); tagAdds.push(t) } })
        built.els.forEach(e => els.push(e))
        added += built.els.length
      }
      else if (op === 'addPanel') {
        const bx = clampX(Number.isFinite(+a.x) ? +a.x : 40)
        const by = clampY(Number.isFinite(+a.y) ? +a.y : Math.max(60, occupiedBottom(els) + 40))
        const tagById = Object.fromEntries(tagsRef.current.map(t => [t.id, t]))
        const style = resolvePanelStyle(a.style || panelStyleRef.current)   // AI 지정 우선, 없으면 활성 스타일
        const built = buildPanel(a, bx, by, () => 'e' + (nextIdRef.current++), tagById, style)
        built.tags.forEach(t => { if (!tagIds.has(t.id)) { tagIds.add(t.id); tagAdds.push(t) } })
        built.els.forEach(e => els.push(e))
        added += built.els.length
      }
      else if (op === 'addTagSeq' && a.idBase) {
        const from = Number.isFinite(+a.from) ? +a.from : 1
        const to = Number.isFinite(+a.to) ? +a.to : from
        const pad = +a.pad || 0
        const step = +a.addressStep || 1
        const am = String(a.addressStart || '').match(/^([A-Za-z%.]*)(\d+)$/)
        const addrPrefix = am ? am[1] : ''
        let addrNum = am ? parseInt(am[2], 10) : null
        for (let n = from; n <= to && n - from < 500; n++) {
          const suffix = pad ? String(n).padStart(pad, '0') : String(n)
          const id = `${a.idBase}${suffix}`
          if (tagIds.has(id)) { if (addrNum != null) addrNum += step; continue }
          tagIds.add(id)
          tagAdds.push(makeTag({
            id, desc: a.descBase ? `${a.descBase} ${n}` : id,
            type: a.type || 'WORD', unit: a.unit || '',
            min: a.min ?? 0, max: a.max ?? 100, decimals: a.decimals ?? 0,
            device: a.device || '__virtual__', utility: a.utility || '',
            address: addrNum != null ? `${addrPrefix}${addrNum}` : '',
          }))
          if (addrNum != null) addrNum += step
        }
      }
      else if (op === 'addTag' && a.id && !tagIds.has(a.id)) { tagIds.add(a.id); tagAdds.push(makeTag(a)) }
      else if (op === 'addDevice' && a.name && !devNames.has(a.name)) { devNames.add(a.name); devAdds.push(makeDevice(a)) }
      else if (op === 'addScreen') {
        const scr = makeScreen({
          id: `scr_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
          name: a.name || '새 화면',
          type: ['master','base','window','frame'].includes(a.screenType) ? a.screenType : 'base',
          bgColor: a.bgColor || '#1a2233',
        })
        screenAdds.push(scr)
        if (a.switchTo) screenAdds._switchTo = scr.id
      }
      else if (op === 'switchScreen' && a.screenId) {
        pendingSwitchId = a.screenId
      }
      else if (op === 'addSvgSymbol' && a.svgContent) {
        // AI가 생성한 SVG를 심볼 라이브러리에 등록
        const sym = makeSvgSymbol({
          name: a.name || '생성 심볼',
          svgContent: a.svgContent,
          layers: a.layers || [],
          w: a.w || 80,
          h: a.h || 80,
        })
        setSymbols(prev => {
          const next = [...prev, sym]
          saveGlobalSymbols(next)
          return next
        })
      }
    }
    // ── groupbox 자동 격자 재배치 ──────────────────────────────────────────
    // AI 좌표가 부정확해도 클라이언트에서 깔끔하게 정렬
    const boxes = els.filter(e => e.type === 'groupbox')
    if (boxes.length >= 2) {
      const W = resolution.w
      const MARGIN = 30      // 캔버스 좌측 여백
      const GAP    = 20      // 패널 간격
      const TOP    = 60      // 상단 여백 (제목 공간)

      // 패널 너비는 모두 동일하게 가장 넓은 값 기준
      const panelW = Math.max(...boxes.map(b => b.width || 200))
      const cols   = Math.max(1, Math.floor((W - MARGIN * 2 + GAP) / (panelW + GAP)))

      // 원래 x 순서대로 정렬 (AI가 의도한 좌→우 순서 유지)
      const sorted = [...boxes].sort((a, b) => a.x - b.x)

      // 각 패널의 새 위치 계산
      const newPos = {}
      let maxRowH = {}
      sorted.forEach((box, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        if (!maxRowH[row]) maxRowH[row] = 0
        maxRowH[row] = Math.max(maxRowH[row], box.height || 200)
        newPos[box.id] = { col, row }
      })

      // 행별 누적 y 계산
      const rowY = {}
      let cumY = TOP
      const rowCount = Math.ceil(sorted.length / cols)
      for (let r = 0; r < rowCount; r++) {
        rowY[r] = cumY
        cumY += (maxRowH[r] || 200) + GAP
      }

      // groupbox 이동 + 내부 요소도 같이 이동
      els = els.map(el => {
        if (el.type === 'groupbox') {
          const { col, row } = newPos[el.id] || { col: 0, row: 0 }
          const nx = MARGIN + col * (panelW + GAP)
          const ny = rowY[row] || TOP
          return { ...el, x: nx, y: ny, width: panelW, hw: panelW / 2 }
        }
        // 비groupbox 요소: 원래 속해있던 groupbox 찾아서 오프셋 유지
        const parent = boxes.find(b =>
          el.x >= b.x && el.x <= b.x + (b.width || 200) &&
          el.y >= b.y && el.y <= b.y + (b.height || 200)
        )
        if (!parent || !newPos[parent.id]) return el
        const { col, row } = newPos[parent.id]
        const nx = MARGIN + col * (panelW + GAP) + (el.x - parent.x)
        const ny = (rowY[row] || TOP) + (el.y - parent.y)
        return { ...el, x: Math.round(nx), y: Math.round(ny) }
      })
    }
    // ────────────────────────────────────────────────────────────────────────

    patchActiveScreen(() => ({ elements: els, bindings: binds }))
    setSelectedId(null)
    if (tagAdds.length) setTags(prev => {
      const ids = new Set(prev.map(t => t.id))
      const fresh = tagAdds.filter(t => !ids.has(t.id))
      const acc = [...prev]
      const out = fresh.map(t => { const wa = withVirtualAddress(t, acc); acc.push(wa); return wa }) // 가상 태그 NB/ND 순차 부여
      return [...prev, ...out]
    })
    if (devAdds.length) setDevices(prev => { const names = new Set(prev.map(d => d.name)); return [...prev, ...devAdds.filter(d => !names.has(d.name))] })
    if (screenAdds.length) {
      setScreens(prev => [...prev, ...screenAdds])
      if (screenAdds._switchTo) setActiveScreenId(screenAdds._switchTo)
    }
    if (pendingSwitchId) setActiveScreenId(pendingSwitchId)
    if (recipeAdds.length) setRecipeSets(prev => [...prev, ...recipeAdds])
    return { added, removed, bound, moved, tagsAdded: tagAdds.length, devicesAdded: devAdds.length, screensAdded: screenAdds.length, recipesAdded: recipeAdds.length }
  }, [patchActiveScreen])

  // ── 기존 패널에 스타일 다시 입히기 (갤러리에서 "선택/전체 적용") ──
  const restylePanels = useCallback((scope) => {
    const style = resolvePanelStyle(panelStyleRef.current)
    patchActiveScreen(s => {
      const sel = selectedIdsRef.current.length ? selectedIdsRef.current : (selectedIdRef.current ? [selectedIdRef.current] : [])
      const boxes = (s.elements || []).filter(e => e.type === 'groupbox' && (scope === 'all' || sel.includes(e.id)))
      if (!boxes.length) return {}
      const boxSet = new Set(boxes.map(b => b.id))
      const parentOf = (el) => boxes.find(b => el.x >= b.x && el.x <= b.x + (b.width || 200) && el.y >= b.y && el.y <= b.y + (b.height || 120))
      const elements = s.elements.map(el => {
        if (el.type === 'groupbox') {
          if (!boxSet.has(el.id)) return el
          return { ...el, borderColor: style.groupbox.borderColor, titleColor: style.groupbox.titleColor, bgColor: style.groupbox.bgColor }
        }
        const parent = parentOf(el)
        if (!parent) return el
        if (el.type === 'numeric') return { ...el, valueFontSize: style.numeric.valueFontSize, digitColor: style.numeric.digitColor, bgColor: style.numeric.bgColor, boxColor: style.numeric.boxColor }
        if (el.type === 'text') return { ...el, color: style.labelColor }
        return el
      })
      return { elements }
    })
  }, [patchActiveScreen])

  // ── 팔레트에서 "패널" 드래그 → 드롭 위치에 스타일 적용된 샘플 패널 생성 ──
  const addStyledPanel = useCallback((styleKey, x, y) => {
    const style = resolvePanelStyle(styleKey || panelStyleRef.current)
    const tagById = Object.fromEntries(tagsRef.current.map(t => [t.id, t]))
    const rows = [
      { label: '운전', kind: 'switch' },
      { label: '설정값', kind: 'numeric', input: true },
      { label: '현재값', kind: 'numeric' },
      { label: '상태', kind: 'lamp' },
    ]
    const built = buildPanel({ title: '패널', rows }, clampX(x), clampY(y), () => 'e' + (nextIdRef.current++), tagById, style)
    patchActiveScreen(s => ({ elements: [...s.elements, ...built.els] }))
    pickPanelStyle(style.key)   // 드롭한 스타일을 활성 스타일로도 지정
  }, [patchActiveScreen, pickPanelStyle])

  // ── 현재 화면 groupbox 자동 정렬 ──
  const relayout = useCallback((forceCols) => {
    patchActiveScreen(scr => {
      const els = [...(scr.elements || [])]
      const boxes = els.filter(e => e.type === 'groupbox')
      if (boxes.length < 1) return scr

      const W = resolution.w
      const MARGIN = 30, GAP = 20, TOP = 60

      // 열 수: 강제값 > 자동계산 (캔버스 폭에 패널이 다 들어오도록 패널 너비 조정)
      const cols = forceCols
        ? Math.max(1, Math.min(forceCols, boxes.length))
        : Math.max(1, Math.floor((W - MARGIN * 2 + GAP) / ((boxes[0]?.width || 200) + GAP)))

      // 열 수에 맞게 패널 너비 자동 계산 (꽉 채우기)
      const panelW = Math.floor((W - MARGIN * 2 - GAP * (cols - 1)) / cols)

      const sorted = [...boxes].sort((a, b) => a.x - b.x)
      const newPos = {}, maxRowH = {}
      sorted.forEach((box, i) => {
        const col = i % cols, row = Math.floor(i / cols)
        if (!maxRowH[row]) maxRowH[row] = 0
        maxRowH[row] = Math.max(maxRowH[row], box.height || 200)
        newPos[box.id] = { col, row, origX: box.x, origY: box.y, origW: box.width || 200 }
      })
      const rowY = {}
      let cumY = TOP
      for (let r = 0; r < Math.ceil(sorted.length / cols); r++) {
        rowY[r] = cumY
        cumY += (maxRowH[r] || 200) + GAP
      }
      const newEls = els.map(el => {
        if (el.type === 'groupbox') {
          const { col, row } = newPos[el.id] || { col: 0, row: 0 }
          return { ...el, x: MARGIN + col * (panelW + GAP), y: rowY[row] || TOP, width: panelW, hw: panelW / 2 }
        }
        const parent = boxes.find(b =>
          el.x >= b.x && el.x <= b.x + (b.width || 200) &&
          el.y >= b.y && el.y <= b.y + (b.height || 200)
        )
        if (!parent || !newPos[parent.id]) return el
        const { col, row, origX, origY, origW } = newPos[parent.id]
        // 내부 요소 x도 패널 너비 비율에 맞게 스케일
        const scale = panelW / origW
        return { ...el,
          x: Math.round(MARGIN + col * (panelW + GAP) + (el.x - origX) * scale),
          y: Math.round((rowY[row] || TOP) + (el.y - origY)),
        }
      })
      return { ...scr, elements: newEls }
    })
  }, [patchActiveScreen, resolution])

  // ── 프로젝트 관리 ──
  const newProject = useCallback(() => {
    if (!window.confirm('현재 프로젝트를 지우고 새 프로젝트를 시작할까요?')) return
    const p = emptyProject()
    setProjectName(p.name); setResolution(p.resolution); setDevices(p.devices); setTags(p.tags)
    setScreens(p.screens); setActiveScreenId(p.activeScreenId); setSelectedId(null)
    setRecipeSets(p.recipeSets ?? [])
    nextIdRef.current = 1
  }, [])

  const loadDemo = useCallback(() => {
    if (!window.confirm('현재 작업을 스마트팩토리 데모로 교체할까요?')) return
    const demo = makeFactoryDemo()
    const demoScr = makeScreen({ id:'scr_demo', name:'1-스마트팩토리', type:'base', elements: demo.elements })
    setProjectName(demo.name); setDevices(DEFAULT_DEVICES); setTags(demo.tags)
    setScreens([demoScr]); setActiveScreenId(demoScr.id); setSelectedId(null)
    setRecipeSets([])
    nextIdRef.current = maxIdNumAll([demoScr]) + 1
  }, [])

  const loadGreenhouseDemo = useCallback(() => {
    if (!window.confirm('현재 작업을 스마트 온실 데모로 교체할까요? (배경 이미지: public/greenhouse.jpg)')) return
    const demo = makeGreenhouseDemo()
    const demoScr = makeScreen({ id: 'scr_gh', name: '1-스마트온실', type: 'base', elements: demo.elements, bgColor: demo.bgColor, bgImage: demo.bgImage, sim: demo.sim })
    setProjectName(demo.name); setDevices(DEFAULT_DEVICES); setTags(demo.tags)
    setScreens([demoScr]); setActiveScreenId(demoScr.id); setSelectedId(null)
    setRecipeSets([])
    nextIdRef.current = maxIdNumAll([demoScr]) + 1
  }, [])

  const exportProjectFile = useCallback(() => {
    setSaveDialogOpen(true)
  }, [])

  const importProjectFile = useCallback(async (file) => {
    try {
      const p = JSON.parse(await file.text())
      setProjectName(p.name || '가져온 프로젝트')
      setDevices(Array.isArray(p.devices) ? p.devices : [])
      setTags(Array.isArray(p.tags) ? p.tags : [])
      if (Array.isArray(p.screens) && p.screens.length) {
        setScreens(p.screens); setActiveScreenId(p.activeScreenId ?? p.screens[0].id)
      } else if (Array.isArray(p.elements)) {
        const scr = makeScreen({ name:'1-메인화면', type:'base', elements: p.elements, bindings: p.bindings ?? {} })
        setScreens([scr]); setActiveScreenId(scr.id)
      }
      if (Array.isArray(p.symbols) && p.symbols.length) {
        setSymbols(prev => { const ids = new Set(prev.map(s => s.id)); const merged = [...prev, ...p.symbols.filter(s => !ids.has(s.id))]; saveGlobalSymbols(merged); return merged })
      }
      setRecipeSets(Array.isArray(p.recipeSets) ? p.recipeSets : [])
      setSelectedId(null)
    } catch (e) { window.alert('프로젝트 파일을 읽을 수 없습니다: ' + e.message) }
  }, [])

  const runProject = useCallback(() => {
    const project = { name: projectName, resolution, devices, tags, screens, symbols, recipeSets,
      elements: activeScreen?.elements ?? [], bindings: activeScreen?.bindings ?? {}, svgBindings: activeScreen?.svgBindings ?? {},
      bgImage: activeScreen?.bgImage ?? '', bgFit: activeScreen?.bgFit ?? 'slice', bgDim: activeScreen?.bgDim ?? 0, sim: activeScreen?.sim ?? null }
    saveProject(project)
    saveProjectToServer(project)
    // 최종 실행파일 만들 때 = 학습 체크포인트: 패턴 + 썸네일을 라이브러리에 누적
    try {
      const svgEl = document.querySelector('svg[data-hmi-canvas]')
      const thumb = svgEl ? svgEl.outerHTML : null
      captureLearning(project, thumb).then(r => { if (r?.ok) getLearningProfile().then(p => { if (p) { setLearnedProfile(p.summary || ''); setLearnedCount(p.count || 0) } }) })
    } catch { /* 학습 실패는 실행을 막지 않음 */ }
    const url = new URL(window.location.href)
    url.searchParams.set('mode', 'run')
    window.open(url.toString(), '_blank', 'noopener')
  }, [projectName, resolution, devices, tags, screens, symbols, recipeSets, activeScreen])

  // Delete 키
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Delete' || registryOpen || deviceRegistryOpen) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const ids = selectedIds.length ? selectedIds : (selectedId ? [selectedId] : [])
      if (ids.length) { e.preventDefault(); deleteElements(ids) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, selectedIds, deleteElements, registryOpen, deviceRegistryOpen])

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ background: '#1a202c' }}>
      <TopBar tags={tags} />
      <ProjectBar
        projectName={projectName}
        onRename={setProjectName}
        onOpenFileMenu={() => setFileMenuOpen(true)}
        onOpenDevices={() => setDeviceRegistryOpen(true)}
        onOpenRegistry={() => setRegistryOpen(true)}
        onRun={runProject}
        elementCount={elements.length}
        tagCount={tags.length}
        deviceCount={devices.length}
        currentFileName={currentFileName}
        onRelayout={relayout}
        onOpenLearning={() => setLearningOpen(true)}
        learnedCount={learnedCount}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* 좌측 프로젝트 패널 */}
        <ProjectPanel
          projectName={projectName}
          resolution={resolution}
          screens={screens}
          activeScreenId={activeScreenId}
          devices={devices}
          tags={tags}
          customSymbols={symbols}
          onSelectScreen={selectScreen}
          onAddScreen={addScreen}
          onRenameScreen={renameScreen}
          onUpdateScreen={updateScreen}
          onDuplicateScreen={duplicateScreen}
          onDeleteScreen={deleteScreen}
          onChangeResolution={setResolution}
          onOpenDevices={() => setDeviceRegistryOpen(true)}
          onOpenRegistry={() => setRegistryOpen(true)}
          onRenameProject={setProjectName}
          onSave={() => saveProject({ name:projectName, resolution, devices, tags, screens, activeScreenId, symbols, recipeSets })}
          onOpenSymbols={() => setSymbolLibOpen(true)}
          onDeleteSymbol={deleteSymbol}
          onStartLineDraw={() => { setWireMode(false); setPenMode(true) }}
          onStartWireDraw={() => { setPenMode(false); setWireMode(true) }}
          onOpenRecipe={() => setRecipeOpen(true)}
          recipeCount={recipeSets.length}
          onOpenSchedule={() => window.alert('스케줄 기능은 곧 추가됩니다. (레시피 다음 단계)')}
        />

        {/* 메인 캔버스 */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          <ScadaCanvas
            tags={tags}
            recipeSets={recipeSets}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDeselect={handleDeselect}
            bindings={bindings}
            svgBindings={svgBindings}
            canvasElements={elements}
            onAddElement={addElement}
            onMoveElement={moveElement}
            onResizeElement={resizeElement}
            onResetLayout={loadDemo}
            symbols={symbols}
            onAddSymbol={addSymbolElement}
            onDoubleClickElement={id => { setSelectedId(id); openPropModal(id) }}
            onCopyElement={copyElement}
            onPasteElement={pasteElement}
            onDeleteElement={deleteElement}
            onReorderElement={reorderElement}
            onGotoScreen={selectScreen}
            allScreens={screens}
            resolution={resolution}
            screenBgColor={activeScreen?.bgColor ?? '#1a2233'}
            screenBgImage={activeScreen?.bgImage ?? ''}
            screenBgFit={activeScreen?.bgFit ?? 'slice'}
            screenBgDim={activeScreen?.bgDim ?? 0}
            selectedIds={selectedIds}
            onSelectMultiple={setSelectedIds}
            onUpdateElement={updateElement}
            onAddFreehand={addFreehand}
            penMode={penMode}
            setPenMode={setPenMode}
            onAddWire={addWire}
            wireMode={wireMode}
            setWireMode={setWireMode}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            onAlign={alignSelected}
            onDistribute={distributeSelected}
            onGroup={groupSelected}
            onUngroup={ungroupSelected}
            onOpenStyleGallery={() => setStyleGalleryOpen(true)}
            onAddPanel={addStyledPanel}
          />
        </main>

        <EditorAI
          tags={tags}
          elements={elements}
          screens={screens}
          activeScreenId={activeScreenId}
          devices={devices}
          symbols={symbols}
          resolution={resolution}
          projectName={projectName}
          bindings={bindings}
          recipeSets={recipeSets}
          selectedIds={selectedIds.length ? selectedIds : (selectedId ? [selectedId] : [])}
          onApplyActions={applyAiActions}
          learnedProfile={learnedProfile}
        />
      </div>

      <TagRegistry
        open={registryOpen}
        tags={tags}
        devices={devices}
        projectName={projectName}
        onClose={() => setRegistryOpen(false)}
        onOpenDevices={() => setDeviceRegistryOpen(true)}
        onUpdateTag={updateTag}
        onAddTag={addTag}
        onDeleteTag={deleteTag}
        onReplaceTags={replaceTags}
        onDuplicateGroup={duplicateGroup}
        onCreateGroup={createGroup}
      />

      <DeviceRegistry
        open={deviceRegistryOpen}
        devices={devices}
        drivers={customDrivers}
        onClose={() => setDeviceRegistryOpen(false)}
        onUpdateDevice={updateDevice}
        onAddDevice={addDevice}
        onDeleteDevice={deleteDevice}
        onSaveDriver={saveDriver}
        onDeleteDriver={deleteDriver}
      />

      <SymbolLibrary
        open={symbolLibOpen}
        symbols={symbols}
        onClose={() => setSymbolLibOpen(false)}
        onAdd={addSymbol}
        onDelete={deleteSymbol}
      />

      {fileMenuOpen && (
        <FileMenu
          projectName={projectName}
          screens={screens}
          tags={tags}
          devices={devices}
          symbols={symbols}
          resolution={resolution}
          activeScreenId={activeScreenId}
          onClose={() => setFileMenuOpen(false)}
          onNewProject={newProject}
          onOpenFile={importProjectFile}
          onSave={() => quickSave({ projectName, resolution, devices, tags, screens, symbols, activeScreenId }, fileHandleRef, setSaveDialogOpen, currentFileName)}
          onSaveAs={() => { fileHandleRef.current = null; setSaveDialogOpen(true) }}
          onLoadDemo={loadDemo}
          onLoadGreenhouse={loadGreenhouseDemo}
        />
      )}

      <LearningSettings
        open={learningOpen}
        onClose={() => setLearningOpen(false)}
        onProfileChange={setLearnedProfile}
      />

      {recipeOpen && (
        <RecipeEditor
          recipeSets={recipeSets}
          tags={tags}
          onChange={setRecipeSets}
          onRegisterTags={registerTagsFromRecipe}
          onClose={() => setRecipeOpen(false)}
        />
      )}

      <PanelStyleGallery
        open={styleGalleryOpen}
        activeKey={panelStyleKey}
        hasSelection={[...selectedIds, selectedId].some(id => elements.find(e => e.id === id)?.type === 'groupbox')}
        onPick={pickPanelStyle}
        onApplySelected={() => restylePanels('selected')}
        onApplyAll={() => restylePanels('all')}
        onClose={() => setStyleGalleryOpen(false)}
      />

      {saveDialogOpen && (
        <SaveProjectDialog
          projectData={{ name: projectName, resolution, devices, tags, screens, symbols, activeScreenId, recipeSets }}
          onClose={() => setSaveDialogOpen(false)}
          onSaved={(newName, fileName, handle) => {
            setProjectName(newName)
            if (handle) fileHandleRef.current = handle
            setCurrentFileName(fileName ?? null)
            addRecentFile({ name: newName, fileName: fileName ?? `${newName.replace(/[^\w가-힣\-]/g,'_')}.nexus` })
          }}
        />
      )}

      {propModalId && (() => {
        const el = elements.find(e => e.id === propModalId)
        return el ? (
          <ElementPropertyModal
            element={el}
            tags={tags}
            bindings={bindings}
            svgBindings={svgBindings}
            symbols={symbols}
            screens={screens}
            recipeSets={recipeSets}
            onBind={handleBind}
            onSvgBind={handleSvgBind}
            onSetVariant={setElementVariant}
            onSetBehavior={setElementBehavior}
            onUpdateElement={updateElement}
            onDelete={deleteElement}
            onClose={confirmPropModal}
            onCancel={cancelPropModal}
          />
        ) : null
      })()}
    </div>
  )
}
