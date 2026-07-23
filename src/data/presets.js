// 검증된 계산·제어 프리셋 (템플릿) — 태그 세트를 한 번에 생성.
//   · 수식/감시/출력에서 다른 태그 참조는 {KEY} 로 표기 → 적용 시 실제 태그ID로 치환
//   · 입력(input) 태그는 사용자가 PLC 디바이스·주소 연결, 계산(calc) 태그는 자동
//   · 나중에 마켓플레이스 "스마트 컴포넌트" 콘텐츠로 확장
import { makeTag } from './tags'

export const PRESETS = [
  {
    id: 'recoiler',
    name: '리코일러 (직경 기반 속도 제어)',
    tagline: '감길수록 속도를 자동으로 줄여 일정한 라인 속도를 유지합니다.',
    desc: '감길수록(직경↑) RPM↓. HMI가 목표RPM 계산→PLC setpoint(램프·클램프·워치독). 실제RPM 편차 AI 감시.',
    tags: [
      { key: 'SPEED', desc: '라인 속도', type: 'WORD', unit: 'm/min', role: 'input', min: 0, max: 300 },
      { key: 'DIA', desc: '코일 직경', type: 'WORD', unit: 'mm', role: 'input', min: 0, max: 2000 },
      { key: 'ACTUAL', desc: '실제 RPM', type: 'WORD', unit: 'rpm', role: 'input', min: 0, max: 3000 },
      {
        key: 'TORQUE', desc: '리코일러 토크', type: 'WORD', unit: '%', role: 'input', min: 0, max: 150,
        alarmHigh: 80, alarmLow: 3,   // 얇은 라인: 토크 급증=끊김 위험 (사용자 값 조정)
        alarmHint: '라인이 얇아 토크 급증 시 끊김 위험 — 장력·속도·직경 확인',
      },
      {
        key: 'RPM', desc: '목표 RPM (계산)', type: 'WORD', unit: 'rpm', role: 'calc', min: 0, max: 3000,
        formula: '{SPEED} / (PI * ({DIA} / 1000))',   // RPM = 라인속도 / (π × 직경[m])
        watchActual: '{ACTUAL}', watchTol: 5,
        writeTo: '', writeRate: 50, writeMin: 0, writeMax: 3000, writeHeartbeat: '',   // 출력 주소는 사용자가
      },
    ],
    note: '입력(속도·직경·실제RPM·토크)에 PLC 주소 연결 + 목표RPM의 출력주소(writeTo)·하트비트 지정. 토크 상한 경보값은 얇은 라인에 맞게 낮게 조정하세요.',
  },
  {
    id: 'recoiler_torque',
    name: '리코일러 (토크/장력 제어 + 테이퍼) ⭐',
    tagline: '직경이 커져도 장력을 일정하게 — 얇은 라인도 안 끊기게 토크를 자동 계산합니다.',
    desc: '일정/테이퍼 장력 감기. 감길수록 토크↑(일정장력), 테이퍼로 안쪽 눌림 방지. HMI가 토크SP(Nm) 계산→서보 토크지령. 끊김 전 토크 감시.',
    tags: [
      { key: 'DIA', desc: '코일 직경', type: 'WORD', unit: 'mm', role: 'input', min: 0, max: 2000 },
      { key: 'DIA_CORE', desc: '코어 직경 (설정)', type: 'WORD', unit: 'mm', role: 'setpoint', min: 0, max: 2000, value: 100 },
      { key: 'DIA_FULL', desc: '만감 직경 (설정)', type: 'WORD', unit: 'mm', role: 'setpoint', min: 0, max: 2000, value: 600 },
      { key: 'TENSION_START', desc: '시작 장력 (설정)', type: 'WORD', unit: 'N', role: 'setpoint', min: 0, max: 500, value: 50 },
      { key: 'TAPER', desc: '테이퍼 (설정, 0=일정장력)', type: 'WORD', unit: '%', role: 'setpoint', min: 0, max: 100, value: 30 },
      {
        key: 'ACTUAL_TQ', desc: '실제 토크', type: 'FLOAT', unit: 'Nm', role: 'input', min: 0, max: 50, decimals: 1,
        alarmHigh: 25, alarmHint: '토크 상한 근접 — 얇은 라인 끊김 위험. 장력·직경 확인',
      },
      {
        key: 'TENSION_ACT', desc: '실효 장력 (테이퍼 적용)', type: 'FLOAT', unit: 'N', role: 'calc', min: 0, max: 500, decimals: 1,
        // 시작장력 × (1 − 테이퍼% × 감김진행률[0~1]) → 감길수록 장력↓
        formula: '{TENSION_START} * (1 - {TAPER}/100 * min(1, max(0, ({DIA} - {DIA_CORE}) / max(1, {DIA_FULL} - {DIA_CORE}))))',
      },
      {
        key: 'TORQUE', desc: '목표 토크 (계산)', type: 'FLOAT', unit: 'Nm', role: 'calc', min: 0, max: 50, decimals: 1,
        formula: '{TENSION_ACT} * {DIA} / 2000',   // 토크(Nm) = 실효장력(N) × 반지름(m) = 장력 × 직경(mm)/2000
        watchActual: '{ACTUAL_TQ}', watchTol: 10,
        writeTo: '', writeRate: 5, writeMin: 0, writeMax: 30, writeHeartbeat: '',   // 출력주소·상한은 사용자
      },
    ],
    note: '직경·실제토크에 PLC주소 연결 · 코어/만감직경·시작장력·테이퍼% 설정 · 목표토크의 출력주소(서보 토크지령)·상한(writeMax=안전토크) 지정. 테이퍼 0=일정장력. 서보="토크모드+속도리밋".',
  },
  {
    id: 'uncoiler',
    name: '언코일러 (장력 제어, 로드셀) ⭐',
    tagline: '로드셀로 실제 장력을 재고 목표대로 자동 제어 — 슬랙·끊김을 막습니다.',
    desc: '로드셀 폐루프 장력 제어. HMI가 장력 지령(N)→PLC PID가 브레이크 토크 제어. 로드셀 실제장력 감시(끊김·슬랙). 테이퍼 옵션.',
    tags: [
      { key: 'DIA', desc: '코일 직경', type: 'WORD', unit: 'mm', role: 'input', min: 0, max: 2000 },
      { key: 'DIA_CORE', desc: '코어 직경 (설정)', type: 'WORD', unit: 'mm', role: 'setpoint', min: 0, max: 2000, value: 100 },
      { key: 'DIA_FULL', desc: '만감 직경 (설정)', type: 'WORD', unit: 'mm', role: 'setpoint', min: 0, max: 2000, value: 600 },
      { key: 'TENSION_START', desc: '목표 장력 (설정)', type: 'WORD', unit: 'N', role: 'setpoint', min: 0, max: 500, value: 50 },
      { key: 'TAPER', desc: '테이퍼 (설정, 0=일정)', type: 'WORD', unit: '%', role: 'setpoint', min: 0, max: 100, value: 0 },
      {
        key: 'LOADCELL', desc: '실제 장력 (로드셀)', type: 'FLOAT', unit: 'N', role: 'input', min: 0, max: 500, decimals: 1,
        alarmHigh: 100, alarmLow: 5, alarmHint: '로드셀 장력 이상 — 상한=끊김위험 / 하한=슬랙·슬립. 속도·PID·소재 확인',
      },
      {
        key: 'TENSION_SP', desc: '장력 지령 (계산)', type: 'FLOAT', unit: 'N', role: 'calc', min: 0, max: 500, decimals: 1,
        // 테이퍼 적용 장력 지령 (테이퍼 0이면 일정). PLC PID의 setpoint로 씀
        formula: '{TENSION_START} * (1 - {TAPER}/100 * min(1, max(0, ({DIA} - {DIA_CORE}) / max(1, {DIA_FULL} - {DIA_CORE}))))',
        watchActual: '{LOADCELL}', watchTol: 10,   // 지령 vs 로드셀 실제 → PID 못따라가면 알림
        writeTo: '', writeRate: 10, writeMin: 0, writeMax: 150, writeHeartbeat: '',   // 출력주소=PLC PID setpoint
      },
    ],
    note: '직경·로드셀에 PLC주소 연결 · 목표장력·테이퍼 설정 · 장력지령의 출력주소(PLC PID setpoint)·상한·하트비트 지정. PID 장력루프는 PLC가 담당. 로드셀 상한/하한 경보값을 라인에 맞게 튜닝.',
  },
  {
    id: 'efficiency',
    name: '효율 (%)',
    tagline: '입력 대비 출력 효율을 실시간으로 계산합니다.',
    desc: '출력 / 입력 × 100. 두 태그로 효율 계산 태그 생성.',
    tags: [
      { key: 'IN', desc: '입력', type: 'FLOAT', unit: '', role: 'input', min: 0, max: 1000 },
      { key: 'OUT', desc: '출력', type: 'FLOAT', unit: '', role: 'input', min: 0, max: 1000 },
      { key: 'EFF', desc: '효율', type: 'FLOAT', unit: '%', role: 'calc', min: 0, max: 100, decimals: 1,
        formula: '{IN} > 0 ? {OUT} / {IN} * 100 : 0' },
    ],
    note: '입력·출력 태그에 PLC 주소를 연결하세요.',
  },
]

export const getPreset = id => PRESETS.find(p => p.id === id) || null

// 프리셋 → 실제 태그 배열 (prefix로 고유 ID 생성, {KEY} 참조 치환)
export function applyPreset(preset, prefix = '') {
  if (!preset) return []
  const p = String(prefix || preset.id).toUpperCase().replace(/[^A-Z0-9_가-힣]/g, '_')
  const idOf = key => `TAG_${p}_${key}`
  const sub = s => String(s || '').replace(/\{(\w+)\}/g, (_, k) => idOf(k))
  const grp = String(prefix || preset.name)
  return preset.tags.map(t => makeTag({
    id: idOf(t.key),
    desc: t.desc, type: t.type, unit: t.unit, utility: grp,
    min: t.min, max: t.max, decimals: t.decimals,
    formula: t.formula ? sub(t.formula) : '',
    watchActual: t.watchActual ? sub(t.watchActual) : '',
    watchTol: t.watchTol,
    writeTo: t.writeTo || '', writeMin: t.writeMin, writeMax: t.writeMax,
    writeRate: t.writeRate, writeHeartbeat: t.writeHeartbeat || '',
    alarmHigh: t.alarmHigh, alarmLow: t.alarmLow, alarmHint: t.alarmHint,
    device: '',   // 사용자가 PLC 연결 (계산 태그는 불필요)
  }))
}
