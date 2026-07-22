// Canvas에 배치된 HMI 요소 정의
// hw/hh: 선택 하이라이트용 반폭/반높이 (픽셀)
export const CANVAS_ELEMENTS = [
  { id: 'e1', type: 'lamp',    x: 80,  y: 60,  label: 'FAN RUN',    tagId: 'TAG_FAN_RUN',       hw: 32, hh: 22 },
  { id: 'e2', type: 'lamp',    x: 180, y: 60,  label: 'VALVE',      tagId: 'TAG_VALVE_STATUS',  hw: 32, hh: 22 },
  { id: 'e3', type: 'gauge',   x: 290, y: 50,  label: 'PRESS',      tagId: 'TAG_CHAMBER_PRESS', hw: 34, hh: 34 },
  { id: 'e4', type: 'numeric', x: 430, y: 55,  label: 'MOTOR CURR', tagId: 'TAG_MOTOR_CURR',    hw: 44, hh: 20 },
  { id: 'e5', type: 'numeric', x: 570, y: 55,  label: 'PUMP RPM',   tagId: 'TAG_PUMP_SPEED',    hw: 44, hh: 20 },
  { id: 'e6', type: 'bar',     x: 120, y: 175, label: 'TEMP Z1',    tagId: 'TAG_TEMP_ZONE1',    hw: 70, hh: 34 },
  { id: 'e7', type: 'bar',     x: 120, y: 255, label: 'FEED RATE',  tagId: 'TAG_FEED_RATE',     hw: 70, hh: 34 },
  { id: 'e8', type: 'numeric', x: 370, y: 160, label: 'VIBRATION',  tagId: 'TAG_VIBRATION',     hw: 44, hh: 20 },
]

export const ELEMENT_TYPE_LABELS = {
  switch:   '스위치',
  lamp:     'Status Lamp',
  gauge:    'Analog Gauge',
  numeric:  'Numeric Display',
  wordlamp: '워드 램프',
  bar:      'Trend Graph',
  text:     '텍스트 라벨',
  groupbox: '그룹 박스',
  shape:    '도형',
  recipetable: '레시피 표',
}

export const SHAPE_LIST = [
  { id:'rect',          label:'사각형',        },
  { id:'roundrect',     label:'둥근 사각형',   },
  { id:'ellipse',       label:'타원',          },
  { id:'triangle',      label:'삼각형',        },
  { id:'rtriangle',     label:'직각 삼각형',   },
  { id:'diamond',       label:'마름모',        },
  { id:'pentagon',      label:'오각형',        },
  { id:'hexagon',       label:'육각형',        },
  { id:'parallelogram', label:'평행사변형',    },
  { id:'trapezoid',     label:'사다리꼴',      },
  { id:'star4',         label:'4꼭지 별',      },
  { id:'star5',         label:'5꼭지 별',      },
  { id:'arrow_r',       label:'오른쪽 화살표', },
  { id:'arrow_l',       label:'왼쪽 화살표',   },
  { id:'arrow_u',       label:'위 화살표',     },
  { id:'arrow_d',       label:'아래 화살표',   },
  { id:'cross',         label:'십자',          },
  { id:'callout',       label:'말풍선',        },
]

// 타입별 선택 하이라이트 반폭/반높이
const GEOMETRY = {
  switch:   { hw: 32, hh: 22 },
  lamp:     { hw: 32, hh: 22 },
  gauge:    { hw: 34, hh: 34 },
  numeric:  { hw: 44, hh: 20 },
  wordlamp: { hw: 44, hh: 22 },
  bar:      { hw: 70, hh: 34 },
  text:     { hw: 60, hh: 10 },
  groupbox: { hw: 100, hh: 60 },
  shape:    { hw: 60, hh: 40 },
  recipetable: { hw: 220, hh: 50 },
}

// 드롭 가능한 캔버스 요소 타입
export const DROPPABLE_TYPES = Object.keys(GEOMETRY)

// 타입별 심볼 스타일(variant) — 일반 HMI의 "부품 모양" 선택
export const ELEMENT_VARIANTS = {
  switch:  [{ id: 'toggle', label: '토글' }, { id: 'rocker', label: '로커' }, { id: 'push', label: '푸시버튼' }],
  lamp:    [{ id: 'round', label: '원형' }, { id: 'square', label: '사각 LED' }, { id: 'beacon', label: '경광등' }],
  gauge:   [{ id: 'arc', label: '원형(아크)' }, { id: 'semi', label: '반원' }, { id: 'dial', label: '다이얼' }, { id: 'ring', label: '링' }, { id: 'linear', label: '사각(막대)' }],
  numeric: [{ id: 'lcd', label: 'LCD' }, { id: 'panel', label: '패널' }],
  wordlamp:[{ id: 'fill', label: '채움' }, { id: 'pill', label: '알약' }, { id: 'round', label: '원형' }],
  bar:     [{ id: 'line', label: '라인' }, { id: 'area', label: '영역' }],
}

export const DEFAULT_VARIANT = { switch: 'toggle', lamp: 'round', gauge: 'arc', numeric: 'lcd', wordlamp: 'fill', bar: 'line' }

// 스위치 동작 특성 (모양과 별개: 누를 때 어떻게 동작하는가)
export const SWITCH_BEHAVIORS = [
  { id: 'toggle', label: '토글', desc: '누를 때마다 ON↔OFF 교차' },
  { id: 'momentary', label: '모멘터리', desc: '누르는 동안만 ON (떼면 OFF)' },
  { id: 'on', label: 'ON', desc: '누르면 ON 고정' },
  { id: 'off', label: 'OFF', desc: '누르면 OFF 고정' },
]

// 심볼 기능
export const SYMBOL_ROLES = [
  { id: 'switch', label: '스위치', desc: '쓰기(조작)만' },
  { id: 'lamp', label: '램프', desc: '읽기(표시)만' },
  { id: 'switchlamp', label: '스위치램프', desc: '쓰기+읽기 (조작+표시)' },
]

// 커스텀 심볼 요소 생성
//  tagId      = 읽기(표시) 태그
//  writeTagId = 쓰기(조작) 태그
//  role       = switch | lamp | switchlamp
export function createSymbolElement(symbolId, x, y, id, w = 48, h = 48, tagId = '', label = '', role = 'switchlamp') {
  return { id, type: 'symbol', symbolId, x, y, label, tagId, writeTagId: tagId, w, h, hw: w / 2, hh: h / 2, behavior: 'toggle', role }
}

// 새 캔버스 요소 생성 (id/tagId/label은 호출측에서 결정)
export function createElement(type, x, y, id, tagId, label) {
  const g = GEOMETRY[type] ?? { hw: 32, hh: 22 }
  const el = { id, type, x, y, label, tagId, hw: g.hw, hh: g.hh, variant: DEFAULT_VARIANT[type] ?? 'default' }
  if (type === 'switch') el.behavior = 'toggle'
  if (type === 'recipetable') {
    el.recipeSetId = ''      // 비우면 첫 레시피셋 표시
    el.headerColor = '#1e40af'
    el.hw = 220; el.hh = 50
    el.label = ''
  }
  if (type === 'wordlamp') {
    el.states = [
      { value: 0, label: '운전준비', color: '#eab308' },
      { value: 1, label: '운전중',   color: '#22c55e' },
      { value: 2, label: '경보',     color: '#ef4444' },
    ]
    el.offColor = '#374151'   // 매칭 없을 때
    el.showBits = false
    el.bitWidth = 4
  }
  if (type === 'text') {
    el.fontSize = 13
    el.color = '#e2e8f0'
    el.bold = false
    el.hw = 60; el.hh = 10
  }
  if (type === 'groupbox') {
    el.width = 200
    el.height = 120
    el.borderColor = '#00e5ff'
    el.bgColor = '#0a1628'
    el.titleColor = '#00e5ff'
    el.hw = 100; el.hh = 60
  }
  if (type === 'shape') {
    el.shape = label || 'rect'  // label 필드에 shape id 전달
    el.label = ''
    el.hw = 60; el.hh = 40
    el.fillColor = '#1e3a5f'
    el.strokeColor = '#00e5ff'
    el.strokeWidth = 2
    el.opacity = 1
  }
  return el
}

/* ── 도형 경로 생성 (hw/hh 기준, 중심=0,0) ── */
export function getShapePath(shape, hw, hh) {
  const w = hw, h = hh
  switch (shape) {
    case 'rect':          return `M${-w},${-h} h${w*2} v${h*2} h${-w*2} z`
    case 'roundrect':     return null
    case 'ellipse':       return null
    case 'triangle':      return `M0,${-h} L${w},${h} L${-w},${h} z`
    case 'rtriangle':     return `M${-w},${-h} L${w},${h} L${-w},${h} z`
    case 'diamond':       return `M0,${-h} L${w},0 L0,${h} L${-w},0 z`
    case 'pentagon': {
      const a = (i) => ({ x: w*Math.sin(2*Math.PI*i/5 - Math.PI/2), y: h*Math.cos(2*Math.PI*i/5 - Math.PI/2)*-1 })
      return Array.from({length:5},(_,i)=>a(i)).map((p,i)=>`${i===0?'M':'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')+'z'
    }
    case 'hexagon': {
      const a = (i) => ({ x: w*Math.cos(Math.PI*i/3), y: h*Math.sin(Math.PI*i/3) })
      return Array.from({length:6},(_,i)=>a(i)).map((p,i)=>`${i===0?'M':'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')+'z'
    }
    case 'parallelogram': return `M${-w+h*0.4},${-h} L${w},${-h} L${w-h*0.4},${h} L${-w},${h} z`
    case 'trapezoid':     return `M${-w*0.6},${-h} L${w*0.6},${-h} L${w},${h} L${-w},${h} z`
    case 'star4': {
      const r1=w, r2=w*0.4, pts=[]
      for(let i=0;i<8;i++){const r=i%2===0?r1:r2;const a=Math.PI*i/4-Math.PI/2;pts.push(`${i===0?'M':'L'}${(r*Math.cos(a)).toFixed(1)},${(r*Math.sin(a)*h/w).toFixed(1)}`)}
      return pts.join(' ')+'z'
    }
    case 'star5': {
      const r1=w, r2=w*0.4, pts=[]
      for(let i=0;i<10;i++){const r=i%2===0?r1:r2;const a=Math.PI*2*i/10-Math.PI/2;pts.push(`${i===0?'M':'L'}${(r*Math.cos(a)).toFixed(1)},${(r*Math.sin(a)*h/w).toFixed(1)}`)}
      return pts.join(' ')+'z'
    }
    case 'arrow_r': return `M${-w},${-h*0.4} L${w*0.3},${-h*0.4} L${w*0.3},${-h} L${w},0 L${w*0.3},${h} L${w*0.3},${h*0.4} L${-w},${h*0.4} z`
    case 'arrow_l': return `M${w},${-h*0.4} L${-w*0.3},${-h*0.4} L${-w*0.3},${-h} L${-w},0 L${-w*0.3},${h} L${-w*0.3},${h*0.4} L${w},${h*0.4} z`
    case 'arrow_u': return `M${-w*0.4},${h} L${-w*0.4},${-h*0.3} L${-w},${-h*0.3} L0,${-h} L${w},${-h*0.3} L${w*0.4},${-h*0.3} L${w*0.4},${h} z`
    case 'arrow_d': return `M${-w*0.4},${-h} L${-w*0.4},${h*0.3} L${-w},${h*0.3} L0,${h} L${w},${h*0.3} L${w*0.4},${h*0.3} L${w*0.4},${-h} z`
    case 'cross':   return `M${-w*0.3},${-h} h${w*0.6} v${h-h*0.3} h${w-w*0.3} v${h*0.6} h${-(w-w*0.3)} v${h-h*0.3} h${-w*0.6} v${-(h-h*0.3)} h${-(w-w*0.3)} v${-h*0.6} h${w-w*0.3} z`
    case 'callout': return `M${-w},${-h} h${w*2} v${h*1.4} h${-w*0.8} l${-w*0.2},${h*0.6} l${-w*0.2},${-h*0.6} h${-w*0.8} z`
    default:        return `M${-w},${-h} h${w*2} v${h*2} h${-w*2} z`
  }
}
