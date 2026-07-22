// SVG 레이어 네이밍 규칙 정의 및 유효성 검사
// 표준 포맷: [동작타입]-[부품명]_[고유번호]   예) rotate-fan_01

export const ANIM_PREFIXES = {
  rotate: {
    label: '회전',
    dataType: 'FLOAT',
    unit: 'RPM / °',
    desc: '0~100 값을 회전 각도(0~360°)로 변환',
    example: 'rotate-fan_01',
  },
  translate: {
    label: '직선이동',
    dataType: 'FLOAT',
    unit: 'mm / %',
    desc: '0~100 값을 X 또는 Y 방향 이동으로 변환',
    example: 'translate-cylinder_02',
  },
  fill: {
    label: '채워짐',
    dataType: 'FLOAT',
    unit: '%',
    desc: '0~100 값을 아래→위 방향 채움 높이로 변환',
    example: 'fill-tank_01',
  },
  toggle: {
    label: '토글(ON/OFF)',
    dataType: 'BIT',
    unit: '',
    desc: 'Boolean 값으로 레이어 표시(1) / 숨김(0)',
    example: 'toggle-lamp_03',
  },
}

// 유효한 레이어 ID 정규식: rotate-fan_01 또는 rotate-fan 형태 모두 허용
const LAYER_REGEX = /^(rotate|translate|fill|toggle)-([a-zA-Z가-힣][a-zA-Z가-힣0-9]*)(?:_(\d+))?$/

export function parseLayerName(id) {
  const m = String(id || '').match(LAYER_REGEX)
  if (!m) return null
  return {
    id,
    animType: m[1],       // 'rotate' | 'translate' | 'fill' | 'toggle'
    partName: m[2],       // 'fan', 'cylinder', ...
    index: m[3] ? parseInt(m[3], 10) : 0,
    dataType: ANIM_PREFIXES[m[1]]?.dataType ?? 'FLOAT',
  }
}

// SVG 텍스트에서 모든 id 속성을 추출하여 유효/무효 분류
export function validateSvgLayers(svgText) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgText, 'image/svg+xml')

  // XML 파싱 에러 체크
  const err = doc.querySelector('parsererror')
  if (err) return { ok: false, error: 'SVG 파싱 오류: ' + err.textContent.slice(0, 80), valid: [], invalid: [] }

  const allIds = [...doc.querySelectorAll('[id]')]
    .map(el => el.id)
    .filter(id => id && id !== 'svg' && !id.startsWith('defs') && !id.startsWith('clip'))

  const valid = []
  const invalid = []

  for (const id of allIds) {
    const parsed = parseLayerName(id)
    if (parsed) valid.push(parsed)
    else invalid.push(id)
  }

  return { ok: true, valid, invalid, allIds }
}

// 태그 값 → SVG 애니메이션 transform/style 계산
export function computeLayerStyle(animType, value, min = 0, max = 100) {
  const pct = max === min ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)))

  switch (animType) {
    case 'rotate':
      return { transform: `rotate(${Math.round(pct * 360)}deg)`, transformOrigin: 'center' }
    case 'translate':
      return { transform: `translateY(${-Math.round(pct * 40)}px)` }
    case 'fill':
      // fill은 clipPath 높이로 제어 (렌더러에서 별도 처리)
      return { fillPct: pct }
    case 'toggle':
      return { opacity: value ? 1 : 0 }
    default:
      return {}
  }
}
