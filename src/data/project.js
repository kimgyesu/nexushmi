// 프로젝트 저장/불러오기 (편집창 ↔ 실행창 공유)
import { CANVAS_ELEMENTS } from './canvasElements'
import { DEFAULT_TAGS } from './tags'
import { DEFAULT_DEVICES } from './devices'

export const PROJECT_KEY = 'nexushmi.project.v1'

/* ── 화면 타입 ── */
export const SCREEN_TYPES = [
  { id: 'master', label: '마스터 화면' },
  { id: 'base',   label: '기본 화면' },
  { id: 'window', label: '윈도우 화면' },
  { id: 'frame',  label: '프레임 화면' },
]

export function makeScreen(p = {}) {
  return {
    id:          p.id          ?? ('scr_' + Math.random().toString(36).slice(2, 8)),
    name:        p.name        ?? '새 화면',
    type:        p.type        ?? 'base',
    bgColor:     p.bgColor     ?? '#1a2233',
    bgImage:     p.bgImage     ?? '',
    bgFit:       p.bgFit       ?? 'slice',
    bgDim:       p.bgDim       ?? 0,
    bgLocked:    p.bgLocked     !== false,
    sim:         p.sim         ?? null,
    elements:    p.elements    ?? [],
    bindings:    p.bindings    ?? {},
    svgBindings: p.svgBindings ?? {},
  }
}

/* ── 기본 화면 목록 ── */
const DEFAULT_SCREENS = [
  makeScreen({ id: 'scr_main', name: '1-메인화면', type: 'base', elements: CANVAS_ELEMENTS }),
]

/* ── 해상도 프리셋 ── */
export const RESOLUTION_PRESETS = [
  { label: '1920 × 1080  (Full HD)',  w: 1920, h: 1080 },
  { label: '1280 × 800   (WXGA)',     w: 1280, h: 800  },
  { label: '1280 × 1024  (SXGA)',     w: 1280, h: 1024 },
  { label: '1024 × 768   (XGA)',      w: 1024, h: 768  },
  { label: '800 × 600    (SVGA)',     w: 800,  h: 600  },
  { label: '800 × 480    (WVGA)',     w: 800,  h: 480  },
  { label: '480 × 272    (Quarter)',  w: 480,  h: 272  },
  { label: '320 × 240    (QVGA)',     w: 320,  h: 240  },
]

// fit: 화면 비율이 다를 때 스케일 방식
//   'meet'    = 비율 유지 (여백 생김, 기본)
//   'stretch' = 꽉 채우기 (늘림, 왜곡될 수 있음)
export const DEFAULT_RESOLUTION = { w: 1280, h: 800, fit: 'meet' }

/* ── 데모 프로젝트 ── */
export const DEMO_PROJECT = {
  name: 'PLANT_A_LINE1',
  resolution: DEFAULT_RESOLUTION,
  devices: DEFAULT_DEVICES,
  tags: DEFAULT_TAGS,
  screens: DEFAULT_SCREENS,
  activeScreenId: 'scr_main',
  symbols: [],
  elements: CANVAS_ELEMENTS,
  bindings: {},
  svgBindings: {},
  recipeSets: [],
}

/* ── 빈 프로젝트 ── */
export function emptyProject() {
  const scr = makeScreen({ name: '1-새화면', type: 'base' })
  return {
    name: '새 프로젝트',
    resolution: DEFAULT_RESOLUTION,
    devices: [],
    tags: [],
    screens: [scr],
    activeScreenId: scr.id,
    symbols: [],
    elements: [],
    bindings: {},
    svgBindings: {},
    recipeSets: [],
  }
}

/* ── 불러오기 ── */
export function loadProject() {
  try {
    const raw = localStorage.getItem(PROJECT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw)

    // screens 구조가 있는 신버전
    if (Array.isArray(d.screens) && d.screens.length > 0) {
      return {
        name:           typeof d.name === 'string' ? d.name : '무제 프로젝트',
        resolution:     d.resolution ?? DEFAULT_RESOLUTION,
        devices:        Array.isArray(d.devices) ? d.devices : DEFAULT_DEVICES,
        tags:           Array.isArray(d.tags) ? d.tags : DEFAULT_TAGS,
        screens:        d.screens,
        activeScreenId: d.activeScreenId ?? d.screens[0].id,
        symbols:        Array.isArray(d.symbols) ? d.symbols : [],
        drivers:        Array.isArray(d.drivers) ? d.drivers : [],
        elements:       d.elements ?? [],
        bindings:       d.bindings ?? {},
        svgBindings:    d.svgBindings ?? {},
        recipeSets:     Array.isArray(d.recipeSets) ? d.recipeSets : [],
        bgImage:        d.bgImage ?? (d.screens?.find(s => s.id === d.activeScreenId)?.bgImage) ?? '',
        bgFit:          d.bgFit ?? (d.screens?.find(s => s.id === d.activeScreenId)?.bgFit) ?? 'slice',
        bgDim:          d.bgDim ?? (d.screens?.find(s => s.id === d.activeScreenId)?.bgDim) ?? 0,
        sim:            d.sim ?? (d.screens?.find(s => s.id === d.activeScreenId)?.sim) ?? null,
      }
    }

    // 구버전 (elements 배열만 있는 경우) → 마이그레이션
    if (Array.isArray(d.elements)) {
      const scr = makeScreen({ name: '1-메인화면', type: 'base', elements: d.elements, bindings: d.bindings ?? {}, svgBindings: d.svgBindings ?? {} })
      return {
        name:           typeof d.name === 'string' ? d.name : '무제 프로젝트',
        devices:        Array.isArray(d.devices) ? d.devices : DEFAULT_DEVICES,
        tags:           Array.isArray(d.tags) ? d.tags : DEFAULT_TAGS,
        screens:        [scr],
        activeScreenId: scr.id,
        symbols:        Array.isArray(d.symbols) ? d.symbols : [],
        elements:       d.elements,
        bindings:       d.bindings ?? {},
        svgBindings:    d.svgBindings ?? {},
        recipeSets:     Array.isArray(d.recipeSets) ? d.recipeSets : [],
      }
    }

    return null
  } catch {
    return null
  }
}

/* ── 저장 ── */
// 클라우드 저장 훅 — 로그인 시 AuthGate가 등록(디바운스). 미로그인/미설정이면 null → 로컬만.
let _cloudSaver = null
export function setCloudSaver(fn) { _cloudSaver = fn }

export function saveProject(project) {
  try {
    localStorage.setItem(PROJECT_KEY, JSON.stringify(project))
  } catch { /* 저장 실패 무시 */ }
  if (_cloudSaver) { try { _cloudSaver(project) } catch { /* noop */ } }
}
