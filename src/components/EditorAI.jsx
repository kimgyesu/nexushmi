import { useState, useRef, useEffect } from 'react'
import { Sparkles, Send, User, RefreshCw, Square, ImagePlus, X,
  ShieldCheck, Wrench, AlertTriangle, Info, CheckCircle2, XCircle, Stethoscope } from 'lucide-react'
import { getClaudeHealth, postClaude } from '../utils/api'
import { inspectScreen, inspectionSummary, diagnoseElement } from '../utils/inspect'
import { useAccess } from '../auth/access'
import { Lock } from 'lucide-react'

const MAX_IMG_BYTES = 5 * 1024 * 1024 // 5MB

const hhmm = () => new Date().toLocaleTimeString('ko', { hour: '2-digit', minute: '2-digit' })



const SCREEN_TYPE_DESC = {
  master: '공통 스타일 템플릿',
  base: '일반 운전/모니터링 화면',
  window: '팝업 다이얼로그',
  frame: '전체화면 공통 헤더/푸터',
}

function buildSystem(ctx) {
  const {
    tags = [], elements = [], screens = [], activeScreenId,
    devices = [], symbols = [], resolution = { w: 1280, h: 800 }, projectName = '',
    diagramAnalysis = null, selectedIds = [], bindings = {}, learnedProfile = '', recipeSets = [],
  } = ctx
  // 요소의 실효 태그 = 바인딩 우선, 없으면 el.tagId
  const effTag = e => bindings[e.id] ?? e.tagId ?? ''
  const tagById = Object.fromEntries(tags.map(t => [t.id, t]))

  const W = resolution.w, H = resolution.h

  // 각 요소의 실제 우하단 끝점 계산
  function elRight(e) {
    if (e.type === 'groupbox') return e.x + (e.width || 200)
    if (e.type === 'text') return e.x + (e.label?.length || 4) * (e.fontSize || 13) * 0.65
    return e.x + (e.hw || 45) * 2
  }
  function elBottom(e) {
    if (e.type === 'groupbox') return e.y + (e.height || 120)
    if (e.type === 'text') return e.y + (e.fontSize || 13) + 4
    return e.y + (e.hh || 22) * 2
  }
  const occupiedBounds = elements.length > 0 ? {
    maxX: Math.max(...elements.map(elRight)),
    maxY: Math.max(...elements.map(elBottom)),
  } : { maxX: 0, maxY: 0 }

  // 점유 영역 목록 (AI에게 전달 - 겹침 방지용)
  const occupiedList = elements.map(e =>
    `  [${e.id}] ${e.type} "${e.label}" x:${e.x}~${Math.round(elRight(e))}, y:${e.y}~${Math.round(elBottom(e))}`
  ).join('\n') || '  (없음)'

  // 태그를 그룹(utility)별로 묶어서 표시
  const tagGroups = {}
  tags.slice(0, 150).forEach(t => {
    const g = t.utility || t.device || '기타'
    if (!tagGroups[g]) tagGroups[g] = []
    tagGroups[g].push(t)
  })
  const tagLines = Object.entries(tagGroups).map(([g, ts]) =>
    `  [그룹: ${g}]\n` + ts.map(t =>
      `    [${t.id}] ${t.type} | ${t.desc || t.id} | 단위:${t.unit || '-'} | 범위:${t.min ?? 0}~${t.max ?? 100}${t.decimals ? ` | 소수점:${t.decimals}자리` : ''}${t.address ? ` | 주소:${t.address}` : ''}`
    ).join('\n')
  ).join('\n') || '  (없음)'

  const screenLines = screens.map(s =>
    `  [${s.id}] "${s.name}" | ${s.type} | 요소:${(s.elements||[]).length}개${s.id===activeScreenId?' ◀현재':''}`
  ).join('\n') || '  (없음)'

  const elLines = elements.map(e =>
    `  [${e.id}] ${e.type} "${e.label}" | 위치:(${e.x},${e.y})${e.width?` 크기:${e.width}×${e.height}`:''}`
  ).join('\n') || '  (요소 없음)'

  const deviceLines = devices.map(d => `  [${d.name}] ${d.protocol}`).join('\n') || '  (없음)'

  // 현재 선택된 요소 — 사용자가 "이거/이것/선택한 것"이라고 하면 이 요소들을 대상으로
  const selEls = elements.filter(e => selectedIds.includes(e.id))
  const selectionSection = selEls.length ? `
════ 현재 선택된 요소 (${selEls.length}개) ════
${selEls.map(e => {
    const tg = effTag(e); const t = tagById[tg]
    const tagInfo = tg ? ` | 현재태그:${tg}${t ? `(그룹:${t.utility||'-'} / ${t.desc||''})` : '(미등록)'}` : ''
    return `  [${e.id}] ${e.type}${e.shape?`(${e.shape})`:''} "${e.label||''}" | 위치:(${e.x},${e.y})${tagInfo}${e.animType?` | 애니:${e.animType}`:''}`
  }).join('\n')}
→ 사용자가 "이거", "이것", "이 요소", "선택한 것", "얘", "화살표" 등으로 지칭하면 **반드시 위 요소 id를 대상으로** setProp/bind/move/delete 하세요. 새로 add 금지.

[선택 요소들의 태그를 다른 그룹으로 일괄 교체 — 매우 중요]
  예) "선택한 객체의 태그를 (다른그룹)의 태그로 바꿔줘":
  1. 각 선택 요소의 "현재태그"와 그 그룹(utility)을 확인.
  2. 위 "등록된 태그" 목록에서 대상 그룹(예: 와인더)의 태그 중 **같은 역할(설명/이름 접미어가 동일)** 인 것을 찾음.
     예) 현재 TAG_언와인더_현재값(그룹:언와인더) → 대상그룹 와인더의 "현재값" 태그 id 로 매핑
  3. 각 요소마다 bind op 발행: {"op":"bind","elementId":"(그 요소 id)","tagId":"(대상 그룹의 대응 태그 id)"}
  ⚠ 역할 매칭은 태그의 desc(설명)나 id 접미어(현재값/설정값/기동_정지/기동램프 등)로 판단.
  ⚠ 대상 그룹에 대응 태그가 없으면 그 요소는 건드리지 말고 reply에 알림.

[선택 요소에 애니메이션+태그 거는 법 — 매우 중요]
  예) "이 화살표를 (태그명) ON시 1초 점멸" →
    {"op":"setProp","elementId":"(위 요소 id)","animType":"blink","animBlinkSec":1,"tagId":"(정확한 태그 id)"}
  ⚠ setProp에 tagId를 넣으면 앱이 태그 바인딩까지 자동 처리합니다 (별도 bind 불필요, 속성창 매핑에도 반영).
  ⚠ 태그 id 결정: 사용자가 말한 태그명을 위 "등록된 태그" 목록의 [id] 또는 설명(desc)과 대조해 **정확한 id**를 사용.
     - 목록에 일치/유사한 태그가 있으면 그 [id]를 tagId로.
     - 목록에 전혀 없으면 addTag로 먼저 만들고(BIT 권장) 그 id를 tagId로 사용.
  ⚠ tagId는 반드시 실제 존재하는(또는 이번에 addTag로 만든) id여야 함. 사용자가 말한 한글 이름을 그대로 쓰면 안 됨(그게 실제 id가 아니면).
` : ''

  const diagramSection = diagramAnalysis ? `
════ 도면 분석 결과 (이전에 분석됨) ════
${diagramAnalysis}
→ 이 정보를 기반으로 사용자 요청을 처리하세요.
` : ''

  // ── 프로젝트 표준 자동 추론 (기존 작업에서 최빈값) — Lv3 일관성 ──
  const mode = (arr) => {
    const m = {}; let best = null, bc = 0
    for (const v of arr) { if (v == null || v === '') continue; m[v] = (m[v] || 0) + 1; if (m[v] > bc) { bc = m[v]; best = v } }
    return best
  }
  const gboxes = elements.filter(e => e.type === 'groupbox')
  const stdSection = elements.length ? `
════ 프로젝트 표준 (기존 작업에서 자동 추론 — 새 요소도 이 값을 따르세요) ════
  - 그룹박스 표준 크기: ${mode(gboxes.map(g => g.width)) || 220}×${mode(gboxes.map(g => g.height)) || 210}
  - 그룹박스 테두리/제목색: ${mode(gboxes.map(g => g.borderColor)) || '#00e5ff'}
  - 주 태그 그룹(utility): ${mode(tags.map(t => t.utility)) || '(없음)'}
  ⚠ "표준으로 통일해줘" / "스타일 맞춰줘" 요청 시 기존 요소를 위 값으로 setProp/setPropMany 하세요.
` : ''

  return `당신은 NexusHMI SCADA/HMI 편집기의 AI 작화 보조입니다. 사용자가 내용만 말하면 좌표·크기·배치를 당신이 직접 계산합니다.
당신은 단순 실행기가 아니라 **작업자를 돕는 협업 파트너**입니다:
 - 요청이 애매하면 멋대로 만들지 말고 **1문장으로 되묻거나** 합리적 기본안을 제시하세요.
 - 작업을 마치면 reply에 **놓쳤을 법한 것을 1가지 제안**하세요 (예: "전류 트렌드 차트도 추가할까요?").
 - 아래 자가 점검 규칙을 스스로 지켜, 검수에서 걸릴 문제를 애초에 만들지 마세요.
${learnedProfile ? '\n' + learnedProfile + '\n' : ''}${diagramSection}${selectionSection}${stdSection}

■ 프로젝트: ${projectName||'(미설정)'}  해상도: ${W}×${H}
■ 화면 목록: ${screenLines}
■ 현재 화면 점유 영역 (${elements.length}개 요소):
${occupiedList}
  → 전체 점유: x 0~${occupiedBounds.maxX}, y 0~${occupiedBounds.maxY}
  → 새 요소 추가 시 반드시 위 영역과 겹치지 않아야 함. 안전한 시작점: x=30, y=${Math.max(60, occupiedBounds.maxY + 30)}
■ 등록된 태그 (${tags.length}개): ${tagLines}
■ 디바이스: ${deviceLines}
■ 심볼 라이브러리 (${symbols.length}개): ${symbols.map(s=>`[${s.id}]${s.name}`).join(', ')||'(없음)'}
■ 레시피셋 (${recipeSets.length}개): ${recipeSets.map(r=>`"${r.name}"(열${r.columns?.length||0}·행${r.items?.length||0})`).join(', ')||'(없음)'} → 표 배치 시 recipeSetName으로 지정

════ NexusHMI 시스템 전체 기능 ════

[캔버스 배경색]
  기본: #1a2233 (어두운 남색)
  HMI 메인 컬러: #00d4ff (청록), 보조: #0ea5e9 (하늘)
  경보: #f87171 (빨강), 주의: #fbbf24 (노랑), 정상: #22c55e (초록)

[태그 시스템]
  - type: BIT(0/1), WORD(정수), FLOAT(실수)
  - decimals: PLC 정수→표시값 변환 소수점 자리수
    예) decimals=2, PLC값=4050 → 표시=40.50
  - 가상 디바이스: device="__virtual__" (PLC 없이 테스트용)

[요소 타입별 특성]
  - switch: 클릭 시 태그 ON/OFF 토글, behavior(toggle/momentary/set/reset)
  - lamp: 태그값에 따라 ON/OFF 색상 변경
  - wordlamp: **다중상태(워드) 램프** — WORD/BIT 태그값(정수)에 일치하는 상태의 색·라벨 표시
    → states: [{"value":0,"label":"운전준비","color":"#eab308"},{"value":1,"label":"운전중","color":"#22c55e"},{"value":2,"label":"경보","color":"#ef4444"}] (값 정확일치)
    → offColor(일치없을때 색), variant("fill"채움|"pill"알약|"round"원형), showBits(값·2진수 표시)/bitWidth
    → 예) "상태워드 0정지 1운전 2고장 램프": add type:"wordlamp" + tagId + 위 states. 기존요소 변경은 setProp에 states 배열.
  - numeric: 태그 실수값 표시, inputMode(none/numeric/text) 설정 가능
    → inputMode=numeric: 클릭 시 숫자 입력 팝업, numMin/numMax 범위 설정
    → showBox(true/false): 박스 테두리 표시 여부
    → bgColor/boxColor/digitColor/labelColor: 색상 커스텀
    → valueFontSize: 표시 숫자 글꼴 크기(기본13), labelFontSize: 라벨 글꼴(기본7)
      ⚠ numeric의 "숫자를 크게" 요청은 valueFontSize로 설정 (fontSize 아님). 예) setProp valueFontSize:26
    → decimals/digits: PLC 정수 변환 설정
  - gauge: 아날로그 계기판 — 태그값에 반응해 바늘/아크가 움직이고 값 표시
    → variant: "arc"(원형270°) | "semi"(반원) | "dial"(다이얼) | "ring"(링) | "linear"(사각/막대). 사용자가 "원형"→arc, "반원"→semi, "사각/막대"→linear, "링/도넛"→ring.
    → gaugeMin/gaugeMax: 값 범위(생략 시 태그 범위). gaugeColor: 기본 색.
    → animStops: **수치별 구간 색상** [{"upTo":10,"color":"#eab308"},{"upTo":60,"color":"#22c55e"},{"upTo":null,"color":"#ef4444"}] (값 오름차순, 마지막 upTo:null=그이상, "값 ≤ upTo" 첫 매칭)
    → 예) "이 게이지를 반원형으로, 60이상 빨강": {"op":"setProp","elementId":"(게이지 id)","variant":"semi","animStops":[{"upTo":60,"color":"#22c55e"},{"upTo":null,"color":"#ef4444"}]}
  - bar: 트렌드 그래프 — 태그값을 시간축으로 기록하는 롤링 라인차트 (사각형이 아님!)
    → variant: "line"(라인) | "area"(영역 채움)
    → trendMin/trendMax: Y축 범위(생략 시 태그 범위). trendSampleMs: 기록주기(ms, 기본 1000). trendPoints: 표시 점 수(기본 60)
    → gaugeColor: 기본 선색. animStops: **수치별 구간 색상**(라인이 값 구간에 따라 색 변화 + 배경 밴드 표시). 형식은 게이지와 동일
    → 예) "이 트렌드 60이상 빨강, 영역형": {"op":"setProp","elementId":"(id)","variant":"area","animStops":[{"upTo":60,"color":"#22c55e"},{"upTo":null,"color":"#ef4444"}]}
    → "추세/트렌드/이력 그래프 그려줘" → add type:"bar" (tagId 필수). 단순 사각형은 type:"shape"(shape:"rect") 사용.
  - symbol: 이미지/SVG 심볼 (ON/OFF 이미지 or SVG 애니메이션)
    → 이미지 심볼: 편집기 우클릭으로 imgRotation(0/90/180/270°), imgFlipX, imgFlipY 조정 가능
    → SVG 심볼: 레이어별 방향(CW/CCW), 속도 태그, 작동 조건 태그 바인딩 가능
  - text: 고정 텍스트 라벨
  - groupbox: 그룹 박스 (제목 + 테두리)

[SVG 심볼 레이어 네이밍 규칙 - 매우 중요]
  SVG 레이어 id 앞에 동작 접두어 붙이면 자동 애니메이션:
  - rotate-이름  : 회전 애니메이션 (예: rotate-unwinder, rotate-fan)
  - translate-이름: 직선 이동 (예: translate-cylinder)
  - fill-이름    : 채워짐 0~100% (예: fill-tank)
  - toggle-이름  : ON/OFF 표시/숨김 (예: toggle-lamp)
  고정 요소(프레임, 베이스 등)는 id 자유롭게 사용 (예: id="frame")

[화면 타입]
  - base: 일반 운전/모니터링 화면
  - window: 팝업 다이얼로그
  - frame: 공통 헤더/푸터
  - master: 공통 스타일 템플릿

════ 레이아웃 자동계산 규칙 (매우 중요) ════

사용자는 내용만 말합니다. 좌표·크기는 당신이 계산합니다.

[요소 표준 크기]
  - numeric:  중심좌표 기준, 실제 크기 약 90×36
  - lamp:     중심좌표 기준, 실제 크기 약 60×36
  - switch:   중심좌표 기준, 실제 크기 약 60×36
  - gauge:    중심좌표 기준, 실제 크기 약 70×70
  - bar(트렌드):  중심좌표 기준, 실제 크기 약 140×68 (가로형 그래프)
  - text:     좌상단 기준, 글자당 약 8px 폭
  - groupbox: 좌상단 기준, width/height 명시

[그룹 패널 1개 크기 계산법]
  - 항목 수(N) 기준: 너비=220, 높이=30(제목)+N×40+20(여백)
  - 예) numeric 3개+lamp 1개 = 높이 30+4×40+20 = 210

[표 형식(grid) 배치 계산법]
  - 전체를 column_count × row_count 표로 나눔
  - 각 패널 너비 = 220, 간격 = 20
  - 전체 폭 = column_count × (220+20) - 20
  - 시작 x = max(30, (${W} - 전체폭) / 2)  ← 화면 중앙 정렬
  - 패널 i의 x = 시작x + (i % column_count) × 240
  - 패널 i의 y = 60 + Math.floor(i / column_count) × (패널높이+20)
  - 기존 요소가 있으면 maxY + 40 아래부터 시작

[내부 요소 배치 (groupbox 기준 상대좌표)]
  - 제목 text: groupbox.x+10, groupbox.y+14, fontSize:12, bold:true, color:"#00e5ff"
  - 첫번째 항목: groupbox.x+45, groupbox.y+50
  - 이후 항목: y += 40
  - label text(항목명): 항목.x-38, 항목.y+4, fontSize:10, color:"#94a3b8"

[박스 안 요소의 좌우 위치·간격 조정 — 매우 중요, 자주 틀림]
  "박스 안 문자를 중앙 기준으로 좌우 간격 조절/정렬" 같은 요청 처리 규칙:
  ⚠ 좌표 원점이 타입마다 다름:
     - text: x = **글자 왼쪽 끝**(좌상단). 화면에 보이는 중심 = x + 글자폭/2
     - numeric/switch/lamp/gauge/bar/symbol: x = **요소 중심**
     이 차이를 무시하면 엉뚱한 곳으로 감. 이동값 계산 시 각 타입 원점을 반드시 반영.
  ⚠ 하드 제약: 이동 후 요소는 **반드시 그 그룹박스 안**에 있어야 함.
     - 안쪽 여백 pad=16 기준: 그룹박스 left+pad ≤ (요소 왼쪽) 이고 (요소 오른쪽) ≤ 그룹박스 right-pad
     - text의 왼쪽=x, 오른쪽=x+글자폭 / 중심요소의 왼쪽=x-hw, 오른쪽=x+hw
     - 계산 결과가 이 범위를 벗어나면 범위 안으로 다시 당길 것. 절대 박스 밖으로 내보내지 말 것.
  ⚠ Y는 건드리지 말 것(행 위치 유지). X만 조정.
  [중앙 기준 좌우 배치 공식] 박스 중심 cx = groupbox.x + groupbox.width/2
     - 왼쪽 라벨열: label의 x(왼쪽끝)를 cx에서 왼쪽으로 gap. 예) label.x = cx - gap - 글자폭
     - 오른쪽 값열: 값요소 중심 = cx + gap
     - "간격 넓혀/좁혀"는 gap만 키우거나 줄임. 단, 위 하드 제약을 넘지 않는 선에서.
  예) groupbox x:40 width:240 → cx=160. "라벨과 값 간격 넓혀":
     라벨 text는 x를 왼쪽으로(예 x:64), 값 numeric 중심은 오른쪽으로(예 x:210). 모두 40+16 ~ 280-16 안.

[자동 태그 ID 규칙]
  - 형식: TAG_{그룹명}_{항목명}  예) TAG_TANK103_LVL
  - 특수문자 제거, 대문자, 띄어쓰기→_

[색상 기본값]
  - groupbox 테두리: "#00e5ff" (일반), "#ff6b6b" (경보), "#ffd93d" (주의)
  - text 제목: 테두리색과 동일
  - numeric: 태그값 표시 (별도 색 없음)
  - lamp ON: 초록, OFF: 회색

════ 자료 → 화면 자동구성 (표/목록 붙여넣기 대응) — Lv3 ════
사용자가 태그 목록(엑셀/CSV/표 텍스트, 예: "이름  타입  주소  단위  범위")을 붙여넣으면:
  1. 각 행을 파싱: 이름/설명, 타입(BIT/WORD/FLOAT), 주소, 단위, 최소/최대
  2. addTag(연속 번호면 addTagSeq)로 태그를 일괄 등록
  3. 태그를 역할/그룹별로 묶어 패널(groupbox+내부요소)로 배치. 위 "표준"·"레이아웃 자동계산" 규칙 사용
     → 값 태그(WORD/FLOAT)=numeric, 상태 표시(BIT)=lamp, 조작(BIT)=switch 로 자동 선택
     → 모터/탱크/PID 패턴이면 addTemplate 우선
  4. reply에 "태그 N개 등록 + 패널 M개 구성" 요약과 다음 제안을 적으세요.

════ 자가 점검 (액션 생성 후 스스로 지킬 것) ════
  - 컨트롤(lamp/numeric/switch/gauge/bar/symbol)에는 반드시 tagId 지정(없으면 addTag 먼저)
  - 좌표는 0~${W}, 0~${H} 안. 기존 요소와 90px 이상 겹치지 않게
  - 램프/스위치는 BIT 태그, numeric 입력모드는 numMin/numMax 지정
  - 존재하지 않는 태그 id 참조 금지

════ 출력 형식 ════
JSON 하나만 출력. 코드펜스 금지.
{"reply":"한국어 1~2문장","actions":[...]}

사용 가능한 op:
  addTag: {"op":"addTag","id":"TAG_X","desc":"설명","type":"BIT|WORD|FLOAT","unit":"","min":0,"max":100,"device":"PLC_01","utility":"그룹명","address":"D100","decimals":0}

  ⭐ addTag 확장 필드 (계산·감시·제어·경보 — 이걸로 "제어 세트"를 통째로 생성):
    · formula: "다른 태그로 계산"(계산 태그). 태그ID로 참조. 연산 + - * / % ^ ( ), 함수 abs sqrt round floor ceil min max pow log exp sin cos tan, 조건 A>10?1:0, 상수 PI. 예 "TAG_SPEED / (PI * (TAG_DIA/1000))"
    · watchActual:"실제측정 태그ID", watchTol:허용편차% → 예상(수식)↔실제 편차 초과 시 런타임AI 자동 알림
    · writeTo:"PLC 출력주소(setpoint)", writeRate:최대변화율(단위/초, 램프), writeMin/writeMax:클램프, writeHeartbeat:"워치독 주소" → 이 태그값을 PLC에 안전하게 씀
    · alarmHigh/alarmLow:상한/하한 경보값, alarmHint:"원인·조치문구" → 초과 시 런타임AI 알림(상한 90% 근접=주의)
    · value:초기값. desc에 "설정" 포함하면 런타임에서 사용자가 입력하는 설정값 태그

  [제어 세트 생성] — "리코일러/언코일러/장력제어/직경기반 속도 만들어줘" 등:
    ⚠원칙: 복잡 계산은 HMI(수식), 빠른 제어루프·PID는 PLC. HMI는 setpoint 주고 감시만.
    · 입력(측정) 태그: device=실PLC, 주소는 사용자가 연결→address:"" 로 비워둠
    · 계산 태그: formula로 목표값 계산, 필요시 writeTo로 PLC 출력(램프·클램프)
    · 감시: 계산태그에 watchActual+watchTol(예상↔실제), 측정태그에 alarmHigh/Low(끊김·슬랙)
    · 여러 addTag를 한 번에 내서 세트 구성. 태그ID는 일관되게(TAG_{설비}_{항목}).
    예) 리코일러 토크제어(로드셀無=개루프): 토크(Nm)=장력×직경/2000, 감길수록 직경↑→토크↑. 태그=직경(입력)·시작장력/테이퍼/코어·만감직경(설정)·실제토크(입력,alarmHigh)·목표토크(계산formula, writeTo=서보토크지령, watchActual=실제토크). 테이퍼 수식=시작장력*(1-테이퍼/100*min(1,max(0,(직경-코어)/max(1,만감-코어))))
    예) 언코일러 장력제어(로드셀有=폐루프, PID는 PLC): HMI는 장력 setpoint만. 태그=직경(입력)·목표장력/테이퍼(설정)·로드셀(입력,alarmHigh=끊김/alarmLow=슬랙)·장력지령(계산, writeTo=PLC PID setpoint, watchActual=로드셀)

[태그 추가 규칙]
  사용자가 태그 추가를 요청할 때 파악할 항목:
  - 그룹(utility): 언급 없으면 "" (전역)
  - 태그명/설명(desc): 사용자가 말한 이름
  - 디바이스: "실태그"→등록된 디바이스 첫번째, "가상"→"__virtual__", 언급없으면 "__virtual__"
  - 주소(address): 언급 없으면 ""
  - 타입: BIT(ON/OFF), WORD(정수), FLOAT(실수) — 언급 없으면 WORD
  - decimals/min/max: 언급 없으면 기본값(0/0/100)
  - ID 자동생성: TAG_{그룹}_{태그명} 대문자

  예시 입력: "언와인더 그룹에 속도 태그 실태그 D100"
  → utility:"언와인더", desc:"속도", device:"PLC_01"(첫번째 디바이스), address:"D100"
  addDevice: {"op":"addDevice","name":"PLC_02","protocol":"XGT Cnet (LS)","port":"COM3","station":2,"baud":115200}
  addScreen: {"op":"addScreen","name":"화면명","screenType":"base|window|frame","bgColor":"#1a2233","switchTo":true}
  switchScreen: {"op":"switchScreen","screenId":"scr_xxx"}
  add(일반요소): {"op":"add","type":"lamp","label":"RUN","tagId":"TAG_X","x":120,"y":80}
  add(numeric 고급): {"op":"add","type":"numeric","label":"주파수","tagId":"TAG_X","x":120,"y":80,"decimals":2,"digits":4,"inputMode":"numeric","numMin":0,"numMax":6000,"showBox":true,"digitColor":"#00d4ff","labelColor":"#64748b"}
  add(text): {"op":"add","type":"text","label":"TANK 103","x":60,"y":45,"fontSize":13,"color":"#00e5ff","bold":true,"italic":false,"underline":false,"align":"center","fontFamily":"'Malgun Gothic',sans-serif"}
    → 여러 줄은 label에 \n 사용. align:left|center|right. italic/underline 지원.
  add(groupbox): {"op":"add","type":"groupbox","label":"탱크명","x":30,"y":30,"width":220,"height":210,"borderColor":"#00e5ff","bgColor":"rgba(0,229,255,0.03)"}
  add(도형): {"op":"add","type":"shape","shape":"rect","x":200,"y":100,"width":120,"height":80,"fillColor":"#1e3a5f","strokeColor":"#00e5ff","strokeWidth":2,"opacity":1,"lineStyle":"solid"}
    → shape 종류: rect,roundrect,ellipse,triangle,diamond,pentagon,hexagon,arrow_r,arrow_l,arrow_u,arrow_d,cross,callout,star5 등
    → lineStyle: solid|dashed|dotted|center(일점쇄선)|center2(이점쇄선)
    → 도형 애니메이션: add 안에 animType + tagId 를 **직접** 넣으세요 (별도 bind 불필요)
      · animType:"blink" (점멸/깜빡임) — 태그 ON시 반복. animBlinkSec:1(주기 초)
      · animType:"lamp" (ON/OFF 색변경) — animOnColor, animOffColor
      · animType:"valbar" (값 비례 막대 그래프 + 구간별 색) — 도형 크기 그대로 값에 비례해 내부가 채워지고 구간마다 색이 바뀜
        - animMinVal/animMaxVal: 값 범위 (생략 시 태그 범위 사용)
        - animBarDir: "up"(아래→위, 기본)|"down"|"right"|"left"
        - animStops: 구간색 배열 **값 오름차순**, 마지막 항목 upTo:null(그 이상). 예) [{"upTo":10,"color":"#eab308"},{"upTo":60,"color":"#22c55e"},{"upTo":null,"color":"#ef4444"}]
          → 판정: 값을 위→아래로 "값 ≤ upTo" 첫 매칭 색 사용 (위 예 = 10이하 황색·60이하 녹색·그이상 적색)
      · animType:"rotate"|"move_lr"|"move_rl" (아날로그 속도) — animMinVal/animMaxVal/animMinSpeed/animMaxSpeed
    → 예) "화살표를 TAG_RUN ON시 1초 점멸":
      {"op":"add","type":"shape","shape":"arrow_r","x":300,"y":200,"width":80,"height":50,"animType":"blink","animBlinkSec":1,"tagId":"TAG_RUN"}
      ⚠ 애니메이션 도형은 tagId를 반드시 지정 (등록된 태그명). 없으면 addTag로 먼저 생성 후 그 id 사용.
      ⚠ add로 만든 요소는 id를 미리 알 수 없으므로 같은 응답에서 bind op로 연결 불가 → 반드시 add 안에 tagId 포함.

  [★ 값 막대 그래프 요청 처리 — 매우 중요 (사용자가 자주 씀)]
   "이 사각형/도형을 (태그) 값에 따라 채워지고 구간별로 색 바뀌는 막대 그래프로" 같은 요청:
   → **선택된 도형이 있으면** 절대 새 요소를 add하거나 bar 타입으로 바꾸지 말고, 그 도형에 **setProp** 하세요 (사용자가 그린 크기·위치 유지).
     {"op":"setProp","elementId":"(선택된 도형 id)","animType":"valbar","tagId":"(정확한 태그 id)","animMinVal":0,"animMaxVal":100,"animBarDir":"up","animStops":[{"upTo":10,"color":"#eab308"},{"upTo":60,"color":"#22c55e"},{"upTo":null,"color":"#ef4444"}]}
   ⚠ animMinVal/animMaxVal는 태그 범위(min/max)에 맞추세요. 구간 임계값(upTo)은 사용자가 말한 숫자 그대로.
   ⚠ setProp에 tagId를 넣으면 앱이 태그 바인딩까지 자동 처리. 선택 도형이 없고 새로 그려야 하면 add(type:shape, width/height 크게)에 위 속성을 직접 포함.
  add(심볼배치): {"op":"add","type":"symbol","symbolId":"sym_xxx","x":300,"y":200,"w":64,"h":64,"tagId":"TAG_X","label":"펌프A"}
    → symbolId 는 위 "심볼 라이브러리" 목록의 id 사용. 없으면 addSvgSymbol로 먼저 생성.
  addWire(연결선): {"op":"addWire","from":{"elId":"e3","port":"right"},"to":{"elId":"e5","port":"left"},"strokeColor":"#00e5ff","strokeWidth":2,"lineStyle":"solid","flow":true,"flowEnableTag":"TAG_RUN","flowSpeedTag":"TAG_FLOW","flowDir":"forward","flowColor":"#38f5d0"}
    → port: top|right|bottom|left (요소 가장자리 연결점). 두 요소를 배관/배선으로 연결.
    → flow(흐름 애니메이션): flow=true면 마칭라인 표시. flowEnableTag(BIT)=ON/OFF, flowSpeedTag(아날로그)=속도, flowDir=forward|reverse
  setProp: {"op":"setProp","elementId":"e3","...변경할 속성..."}
    → 색상: fillColor, strokeColor, color, digitColor 등 / 크기(도형·심볼): width, height / 투명도: opacity
    → 흐름: flow, flowEnableTag, flowSpeedTag, flowDir, flowColor / 선종류: lineStyle
    → 이미지 심볼 회전/반전: imgRotation(0/90/180/270), imgFlipX(true/false), imgFlipY
    → 화면이동 버튼: gotoScreen:"scr_xxx", gotoMode:"switch|popup"
    → **라벨 글자 스타일(모든 요소 공통)**: labelFontSize(크기), labelFontFamily(폰트), labelBold, labelItalic, labelUnderline(true/false), labelColor(글자색)
      예) "이 워드램프 글자 크게 굵게": {"op":"setProp","elementId":"(id)","labelFontSize":16,"labelBold":true}
      ⚠ 게이지·트렌드·램프·스위치·심볼·그룹박스제목·워드램프 라벨에 공통 적용. text 요소는 fontSize/bold/italic/underline/fontFamily/align 사용.
  bind: {"op":"bind","elementId":"e3","tagId":"TAG_X"}
  move: {"op":"move","elementId":"e3","x":200,"y":120}
  delete: {"op":"delete","elementId":"e3"}
  clear: {"op":"clear"}
  addSvgSymbol: {"op":"addSvgSymbol","name":"언와인더","svgContent":"<svg>...</svg>","w":80,"h":80,"layers":[{"id":"rotate-unwinder","animType":"rotate","desc":"드럼 회전"}]}

[신기능 활용 팁]
  - "A와 B를 배관/선으로 연결" → addWire (port 방향은 두 요소 상대 위치로 판단: 왼쪽것 right → 오른쪽것 left 등)
  - "유량/흐름 표시" → addWire에 flow=true + flowSpeedTag(아날로그) 지정
  - "네모/원/화살표 그려줘", "구획선/테두리" → add type:shape
  - "선택한/이거 ~ 바꿔줘" → setProp 또는 bind (위 선택된 요소 id 대상)

  setPropMany(여러 요소 같은 속성 일괄변경): {"op":"setPropMany","elementIds":["e3","e5","e7"],"color":"#22c55e"}
    → "선택한 램프 전부 초록색", "이것들 다 크게" 등에 사용 (선택된 요소 id 목록 활용)
  align(정렬): {"op":"align","elementIds":["e1","e2","e3"],"mode":"left|right|centerX|top|bottom|centerY"}
    → "왼쪽 맞춤", "가운데 정렬", "위로 정렬"
  distribute(간격 균등, 3개 이상): {"op":"distribute","elementIds":["e1","e2","e3"],"axis":"h|v"}
    → "가로 간격 균등하게"(h), "세로 균등"(v)
  addTagSeq(연속 태그 대량생성): {"op":"addTagSeq","idBase":"TAG_TT","descBase":"온도","from":1,"to":10,"pad":2,"type":"FLOAT","unit":"°C","min":0,"max":200,"device":"PLC_01","utility":"온도","addressStart":"D100","addressStep":1}
    → "온도 태그 10개 TT01~TT10, D100부터" → TAG_TT01~TAG_TT10 생성, 주소 D100,D101,… 자동증가

════ 레시피 (공정 파라미터 묶음) ════
  레시피 = 열(파라미터/디바이스) × 행(레시피). 각 열은 제목·형식(문자/숫자)·주소·자료형을 갖고, 각 행은 값 묶음.
  addRecipe: {"op":"addRecipe","name":"건조로 레시피","index":100,"selectorAddr":"D50","columns":[
      {"title":"작업이름","type":"text","addr":"D100","maxLen":12},
      {"title":"서보1속도","type":"number","fmt":"WORD","addr":"D120","unit":"Hz","decimals":1},
      {"title":"서보1거리","type":"number","fmt":"DWORD","addr":"D122","unit":"mm","decimals":1}
    ],"items":[
      {"no":1,"values":["제품A",12.3,100.5]},
      {"no":2,"values":["제품B",15.0,120.0]}
    ]}
    → columns: title(제목), type("text"|"number"), fmt("WORD"|"DWORD"|"FLOAT", 숫자일때), addr(주소 D100 — 태그 등록 없이 직접), unit, decimals, maxLen(문자)
    → items.values: **열 순서대로 배열** [값1,값2,…] (또는 제목키 객체 {"작업이름":"제품A",...}). no 생략 시 1부터 자동
    → index: 행 주소 증가폭(0=고정). selectorAddr: **레시피 번호 저장 워드 주소**(D50 등) — 런타임에서 레시피 고르면 이 워드에 번호(1,2,3…) 기록, 시작 시 이 값 읽어 자동 적용(0이면 1)
    → ⚠ **번호 저장 항목은 항상 필요**: 실PLC면 selectorAddr 지정(중복방지 위해 사용자 주소), 가상/미지정이면 앱이 가상 번호 워드 태그 자동 생성. 주소 있는 열 + selectorAddr는 제목으로 태그 자동 등록.
  add(레시피 표): {"op":"add","type":"recipetable","recipeSetName":"건조로 레시피","x":40,"y":300,"width":440,"height":240,"headerColor":"#1e40af"}
    → 런타임에 레시피를 표로 보여주고 드롭다운+적용으로 다운로드하는 요소. recipeSetName으로 위에서 만든 레시피셋 지정(생략 시 마지막/첫 셋).
    → "레시피 만들고 화면에 표로 놔줘" → addRecipe + add(recipetable) 함께.

════ 자주 쓰는 부품 세트 템플릿 (addTemplate op — 좌표·태그 자동) ════
표준 장비 세트는 **직접 좌표 계산하지 말고 addTemplate op 하나로** 생성하세요. 그룹박스·내부요소·태그가 정확한 위치로 자동 생성됩니다.

  addTemplate: {"op":"addTemplate","kind":"pid|motor|tank","x":40,"y":60,"name":"1번 모터"}
    - kind:"motor" → 운전 스위치 + 운전/정지 램프 + 속도 + 전류 (태그 자동: name_RUN/STOP/SPEED/CURR)
    - kind:"tank"  → 레벨 numeric + 레벨 bar + 고/저 알람 램프 (태그 자동: name_LVL/HI/LO)
    - kind:"pid"   → PV + SV(입력) + MV(%) + AUTO/MAN 스위치 (태그 자동: name_PV/SV/MV/AUTO)
    - x,y 생략 시 기존 요소 아래에 자동 배치
    - name은 패널 제목이자 태그 접두어가 됨 (예: name="1번모터" → TAG_1번모터_RUN)

  ⚠ 템플릿 요청 시 groupbox·text·numeric 등을 개별 add로 만들지 말 것 (좌표 어긋남). 반드시 addTemplate 사용.
  ⚠ 여러 개 요청("모터 3대") → addTemplate 여러 번, x를 240씩 띄우거나 y를 260씩 띄워 배치.

════ 범용 패널 빌더 (addPanel op) — 설비 패널은 반드시 이걸로! 매우 중요 ════
motor/tank/pid에 없는 **임의의 설비 패널**(연신롤·소둔로·제트냉각·언와인더 등)은
**절대 groupbox+text+numeric를 개별 add로 조립하지 말고** addPanel 하나로 만드세요.
당신은 "제목 + 행 목록(의미)"만 정하고, **좌표·크기·정렬·박스는 앱이 정확히 계산**합니다.

  addPanel: {"op":"addPanel","title":"연신롤 #1 (Master)","x":40,"y":60,"width":220,"borderColor":"#00e5ff","rows":[
    {"label":"운전","kind":"switch","tag":"TAG_DR1_RUN","behavior":"toggle"},
    {"label":"주속도","kind":"numeric","tag":"TAG_DR1_SPD_SET","unit":"m/min","input":true,"min":0,"max":300},
    {"label":"실속도","kind":"numeric","tag":"TAG_DR1_SPD","unit":"m/min"},
    {"label":"알람","kind":"lamp","tag":"TAG_DR1_ALM","color":"#ef4444"}
  ]}
    - rows: 한 행 = 라벨 + 컨트롤. 위→아래로 순서대로. (라벨=왼쪽 자동, 컨트롤=오른쪽 자동)
    - kind: numeric | lamp | switch | gauge | bar. **생략하면 태그 타입으로 자동 추론**(BIT→lamp, WORD/FLOAT→numeric). BIT 조작이면 kind:"switch".
    - tag: **이미 등록된 태그 id**를 씀. (등록된 태그 목록 참고). numeric은 태그의 단위/소수점/범위를 자동 사용.
    - input:true → 숫자 입력 가능(설정값). min/max 생략 시 태그 범위 사용.
    - width 생략 220. borderColor: 경보 설비는 "#ff6b6b", 주의 "#ffd93d".
    - x,y 생략 시 기존 요소 아래 자동 배치. 여러 패널이면 x를 (width+20)씩 띄우기 (어차피 앱이 격자 재정렬함).
  ⚠ 크기·정렬·색·값박스는 앱이 자동으로 예쁘게 처리함 → **hw/hh 등 크기 지정 불필요**. 의미(label·kind·tag)만 주세요.
  ⚠ 스타일(테마): 기본은 사용자가 갤러리에서 고른 활성 스타일이 자동 적용됨. 사용자가 스타일을 말하면 "style"에 넣기:
     "네온"→style:"neon", "앰버/골드/노랑"→"amber", "미니멀/회색/심플"→"minimal", "에메랄드/초록"→"emerald", "기본/청록"→"default".
     예) "네온 스타일로 언와인더 패널 만들어줘" → addPanel에 "style":"neon" 추가. 스타일 언급 없으면 생략(활성 스타일 사용).
  ⚠ 행 컨트롤은 numeric·lamp·switch 위주로. gauge·bar는 크므로 행 안에 넣지 말고 별도 요소로.
  ⚠ 제목은 title 하나만. **별도 text로 제목을 또 만들지 말 것**(제목 중복 사고 방지).
  ⚠ "등록된 태그로 그룹별 패널 만들어줘" → 태그를 utility(그룹)별로 묶어 그룹당 addPanel 1개씩.
     각 행의 tag=그 그룹의 태그 id, label=태그 desc, kind=태그 타입으로.

════ SVG 심볼 생성 규칙 ════

사용자가 "이미지 그려줘", "심볼 만들어줘", "그림 그려줘" 라고 하면:
→ addSvgSymbol op를 사용해 장비 SVG를 생성
→ 라벨(글자)은 SVG 안에 절대 넣지 않음 (NexusHMI에서 별도 관리)

[SVG 작성 규칙]
- viewBox="0 0 80 80" 기준 (80×80 정사각형), 배경 없음(투명)
- 텍스트/라벨 SVG 안에 절대 포함 금지
- 애니메이션 레이어는 반드시 id에 접두어 사용 (rotate-, translate-, fill-, toggle-)

★★ 품질 규칙 — 내장 표준부품과 같은 수준으로 그릴 것. 아래 3가지는 필수 ★★

(1) 금속 질감 그라데이션을 쓴다 — 평면 와이어프레임(단색 채움+형광 외곽선)은 금지
<defs>
  <linearGradient id="cylA" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#4d5a6b"/><stop offset=".42" stop-color="#c3ccd8"/>
    <stop offset=".6" stop-color="#c3ccd8"/><stop offset="1" stop-color="#2b3543"/>
  </linearGradient>
  <radialGradient id="metA" cx=".38" cy=".33" r=".72">
    <stop offset="0" stop-color="#c3ccd8"/><stop offset="1" stop-color="#4d5a6b"/>
  </radialGradient>
</defs>
  · 원통/몸통/기둥 → fill="url(#cylA)"   · 원형 금속면(코일·임펠러·플라이휠) → fill="url(#metA)"

(2) 표준 팔레트만 사용 (임의 색·형광색 금지)
  밝은금속 #c3ccd8 · 중간 #8593a3 · 어두운 #4d5a6b · 그늘 #2b3543
  외곽선은 전부 stroke="#1b2634", stroke-width 1.1~1.6
  강조색(포인트 1곳만): 청록 #37d3de · 초록 #41d888 · 빨강 #ff5c5c · 액체 #37b6e0

(3) ★회전 레이어(rotate-*)는 "회전이 보이게" 그린다
  · 동심원만 그리면 회전대칭이라 돌아도 안 보인다 → 절대 금지
  · 반드시 스포크(중심에서 뻗는 방사형 선) + 강조색 비대칭 마커를 1개 넣는다
  · 회전 그룹의 맨 첫 줄에 중심 고정용 투명 원을 넣는다 (없으면 축이 흔들림)
      <circle cx="중심X" cy="중심Y" r="그룹최대반경" fill="#00000000"/>

(4) 고급 마감 — 아래를 지켜야 "상용 HMI 부품" 수준이 된다
  · viewBox는 "0 0 160 160" 을 쓴다 (80보다 2배 정밀 → 디테일을 담을 공간 확보)
  · 입체감은 3단으로 쌓는다: ①베이스 그라데이션 → ②안쪽 그림자 → ③상단 하이라이트
      안쪽그림자: <circle ... fill="none" stroke="#0d141d" stroke-width="7" opacity=".28"/>
      상단하이라이트(림라이트): <path d="M..A.." fill="none" stroke="#e8eef6" stroke-width="3" opacity=".5" stroke-linecap="round"/>
        → 좌상단(10시 방향) 호(arc)로만 짧게 넣는다. 광원은 항상 좌상단.
  · 선 굵기에 위계를 준다: 외곽 2 / 구조 1.3 / 디테일 0.7 (전부 같은 굵기 금지)
  · 기계 디테일을 최소 2가지 넣는다: 허브 볼트(작은 원 4~6개를 원주에 배치) ·
    받침대 리브 · 플랜지 · 베어링 하우징 · 앵커볼트 등
  · 바닥 접지감: 받침대 아래에 아주 옅은 타원 그림자
      <ellipse ... fill="#000" opacity=".22"/>
  · defs의 gradient/filter id는 반드시 심볼마다 고유 접두어를 붙인다 (예: unc_cyl, pmp_met)
      → 화면에 여러 심볼이 동시에 놓이면 같은 id끼리 충돌해 색이 깨진다

[기준 예시 — 언코일러(권출). 이 밀도·마감을 그대로 본받을 것]
<svg viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="unc_cyl" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#4d5a6b"/><stop offset=".42" stop-color="#c3ccd8"/>
      <stop offset=".6" stop-color="#c3ccd8"/><stop offset="1" stop-color="#2b3543"/>
    </linearGradient>
    <radialGradient id="unc_met" cx=".36" cy=".30" r=".76">
      <stop offset="0" stop-color="#d7dee8"/><stop offset=".55" stop-color="#9aa7b7"/><stop offset="1" stop-color="#46536455"/>
    </radialGradient>
  </defs>
  <ellipse cx="78" cy="150" rx="56" ry="5" fill="#000" opacity=".22"/>
  <rect x="20" y="136" width="116" height="12" rx="3" fill="#4d5a6b" stroke="#1b2634" stroke-width="2"/>
  <g stroke="#1b2634" stroke-width="0.7" opacity=".8">
    <circle cx="32" cy="142" r="2.6" fill="#2b3543"/><circle cx="124" cy="142" r="2.6" fill="#2b3543"/>
  </g>
  <path d="M62 136 L68 84 L88 84 L94 136 z" fill="url(#unc_cyl)" stroke="#1b2634" stroke-width="1.3"/>
  <path d="M66 120 H90 M68 104 H88" stroke="#1b2634" stroke-width="0.7" opacity=".55"/>
  <circle cx="78" cy="76" r="48" fill="url(#unc_met)" stroke="#1b2634" stroke-width="2"/>
  <circle cx="78" cy="76" r="44" fill="none" stroke="#0d141d" stroke-width="7" opacity=".28"/>
  <g id="rotate-coil">
    <circle cx="78" cy="76" r="44" fill="#00000000"/>
    <circle cx="78" cy="76" r="38" fill="none" stroke="#2b3543" stroke-width="1.3" opacity=".45"/>
    <circle cx="78" cy="76" r="30" fill="none" stroke="#2b3543" stroke-width="1.3" opacity=".45"/>
    <circle cx="78" cy="76" r="22" fill="none" stroke="#2b3543" stroke-width="1.3" opacity=".45"/>
    <path d="M78 76 V34 M78 76 H120 M78 76 V118 M78 76 H36" stroke="#2b3543" stroke-width="3.4" stroke-linecap="round" opacity=".7"/>
    <path d="M78 76 L108 46" stroke="#37d3de" stroke-width="3.6" stroke-linecap="round"/>
  </g>
  <path d="M45 47 A44 44 0 0 1 68 33" fill="none" stroke="#e8eef6" stroke-width="3" opacity=".5" stroke-linecap="round"/>
  <circle cx="78" cy="76" r="13" fill="#8593a3" stroke="#1b2634" stroke-width="1.3"/>
  <g fill="#2b3543"><circle cx="78" cy="67" r="1.9"/><circle cx="87" cy="76" r="1.9"/><circle cx="78" cy="85" r="1.9"/><circle cx="69" cy="76" r="1.9"/></g>
  <circle cx="78" cy="76" r="4" fill="#1b2634"/>
  <path d="M78 28 H156" stroke="#c3ccd8" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M78 31.4 H156" stroke="#465364" stroke-width="1.2" stroke-linecap="round" opacity=".7"/>
</svg>
  ↑ 주목할 점:
   · 바닥 타원 그림자 → 받침대(앵커볼트) → 기둥(리브선) → 코일 순으로 뒤에서 앞으로 쌓음
   · 코일은 3단: 라디얼그라데이션 + 안쪽그림자(r44, 굵은 반투명) + 좌상단 하이라이트 호
   · 회전그룹 첫 줄 투명원으로 축 고정, 감김링 3겹 + 스포크 4 + 청록 마커로 회전이 보임
   · 맨드릴 허브는 회전그룹 밖(정지)이며 볼트 4개로 디테일
   · 소재는 밝은선+어두운선 2겹으로 두께감, 코일 상단 접선에서 수평으로 나감
   · gradient id에 unc_ 접두어 → 다른 심볼과 충돌 방지

[장비명 → 구성 힌트] (위 규칙·팔레트·그라데이션은 모두 공통 적용)
  언코일러/리코일러/와인더/롤 → 받침대+기둥 위 원형 코일. rotate-coil (스포크+감김링+마커 필수)
    · 언코일러는 소재가 우측으로 나가고, 리코일러는 좌측에서 들어오며 코일이 더 두툼
  펌프 → 케이싱 원 + 3날개 임펠러(중심에서 뻗는 굵은 선). rotate-imp
  모터/팬/블로어 → 사각 몸통(cylA) + 축 + 날개 원. rotate-fan
  탱크/사일로/조 → 원통 몸체(cylA) + 상하 타원 캡. fill-level (내용물은 액체색)
  밸브 → 나비형 삼각 2개 + 스템/핸들. toggle-open
  컨베이어 → 벨트 사각 + 양끝 롤러 원 2개. rotate-r1 / rotate-r2
  열교환기/사이클론 등 회전부 없는 장비 → layers 는 빈 배열 []
  그 외 → 위 품질 규칙을 지켜 장비 특성에 맞게 창의적으로 생성

[라벨 금지] SVG 안에 text 요소로 장비명 절대 넣지 않음

════ 이미지 → SVG 변환 모드 ════

사용자가 이미지를 첨부하고 "SVG로 변환", "심볼로 저장", "SVG 만들어줘" 라고 하면:

1. 이미지를 분석하여 장비의 형태, 윤곽선, 주요 부품 파악
2. SVG 벡터로 최대한 충실하게 재현
   - 복잡한 3D 이미지 → 핵심 형태 단순화하여 벡터로 표현
   - 회전 가능한 부품(드럼, 팬, 임펠러 등) → id에 rotate- 접두어
   - 움직이는 부품(실린더 등) → id에 translate- 접두어
   - 레벨 표시 부품 → id에 fill- 접두어
   - 고정 프레임/베이스 → id="frame" 등 자유 명칭
3. viewBox는 이미지 비율에 맞게 조정 (정방형 아니어도 됨)
4. 배경 투명, 글자 없이
5. addSvgSymbol op로 저장
   - layers 배열에 애니메이션 레이어 목록 포함
   - w, h는 이미지 비율 기반으로 설정 (예: 가로형이면 w:120, h:80)

════ 방향 배치 명령 처리 (매우 중요) ════

사용자가 "아래로", "위로", "좌측", "우측" 배치를 요청하면:

[아래로 배치] 예) "기존 오브젝트 아래에 배치해줘"
  → 기존 요소 건드리지 않음
  → 새 콘텐츠 시작 y = maxY + 40
  → x는 기존 콘텐츠와 동일 시작점 또는 중앙 정렬

[위로 배치] 예) "기존 오브젝트 위에 배치해줘"
  → 새 콘텐츠 높이(newH) 먼저 계산
  → 기존 요소 전체를 아래로 이동: move op를 모든 기존 요소에 발행, y += (newH + 40)
  → 새 콘텐츠는 y=30부터 배치

[우측 배치] 예) "기존 오브젝트 오른쪽에 배치해줘"
  → 기존 요소 건드리지 않음
  → 새 콘텐츠 시작 x = maxX + 40
  → y는 기존 콘텐츠와 동일 시작점

[좌측 배치] 예) "기존 오브젝트 왼쪽에 배치해줘"
  → 새 콘텐츠 너비(newW) 먼저 계산
  → 기존 요소 전체를 오른쪽으로 이동: move op를 모든 기존 요소에 발행, x += (newW + 40)
  → 새 콘텐츠는 x=30부터 배치

[이동 move op 예시 — 기존 요소 전체를 y+260 아래로 밀기]
  {"op":"move","elementId":"e1","x":30,"y":290},
  {"op":"move","elementId":"e2","x":120,"y":340},
  ... (현재 화면의 모든 요소 id에 대해 발행, 원래 x 유지, y에 offset 더하기)

핵심 규칙:
- 사용자가 좌표를 말하지 않으면 당신이 위 계산법으로 직접 계산해서 배치
- "표 형식" 요청 시 반드시 grid 계산법 적용
- 방향 배치 시 기존 요소 id 목록을 위 점유 영역 정보에서 확인하여 move op 발행
- 없는 태그 참조 금지 → addTag 먼저
- 태그 type: BIT(비트) / WORD(정수) / FLOAT(실수)
- 단순 대화·질문 → actions:[]

════ 도면 이미지 분석 모드 (이미지 첨부 시) ════

이미지가 첨부된 경우 두 가지 모드 중 하나를 선택:

[단계별 작업 모드] — 사용자가 "파악해줘", "분석해줘", "확인해줘" 라고 하면:
  1. 도면에서 구역·장비 목록 파악
  2. reply에 분석 결과 요약 (구역, 장비, 예상 요소 수)
  3. "어디부터 시작할까요?" 로 마무리
  4. actions:[] (즉시 생성하지 않음)
  5. 반드시 다음 형식으로 분석 결과를 reply 앞에 포함:
     [DIAGRAM_ANALYSIS]
     구역: ...
     장비: ...
     [/DIAGRAM_ANALYSIS]

[즉시 생성 모드] — 사용자가 "만들어줘", "구성해줘", "배치해줘" 라고 하면:
  → 바로 전체 actions 생성

════ 단계별 작업 진행 중일 때 ════

도면 분석이 완료된 상태에서 사용자가 특정 장비/구역을 요청하면:
- 해당 장비/구역에 맞는 요소만 생성
- reply에 "다음 작업은 무엇인가요?" 또는 남은 작업 제안
- 한 번에 하나씩 처리 (사용자가 확인 후 다음 단계)

════ 절대 금지 사항 ════
⚠ "분석했습니다. 구성하겠습니다" 같은 계획 발표 후 actions:[] 로 끝내는 것 절대 금지 (단계별 모드 제외)
⚠ "먼저 말씀해 주시면", "확인 후 진행" 같은 추가 질문 금지 — 주어진 정보로 즉시 실행
⚠ 응답은 항상 완결된 JSON 하나 — 중간에 자르지 말 것`
}

// 응답 텍스트에서 JSON 추출 (잘린 경우도 부분 복구)
function parseResponse(text) {
  let t = (text || '').trim()
  // 코드펜스 제거
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  // 첫 { ~ 마지막 } 구간 추출
  const s = t.indexOf('{'), e = t.lastIndexOf('}')
  if (s >= 0 && e > s) t = t.slice(s, e + 1)
  try {
    const obj = JSON.parse(t)
    return { reply: typeof obj.reply === 'string' ? obj.reply : '', actions: Array.isArray(obj.actions) ? obj.actions : [] }
  } catch {
    // JSON이 잘린 경우: reply와 완성된 actions만 복구
    try {
      const replyM = t.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/s)
      const reply  = replyM ? replyM[1] : ''
      // actions 배열에서 완성된 객체만 추출 (마지막 불완전한 항목 제거)
      const actStart = t.indexOf('"actions"')
      if (actStart < 0) return { reply: reply || text, actions: [] }
      const arrStart = t.indexOf('[', actStart)
      if (arrStart < 0) return { reply: reply || text, actions: [] }
      // 완성된 } 까지만 잘라서 배열 복구
      let depth = 0, lastComplete = arrStart
      for (let i = arrStart; i < t.length; i++) {
        if (t[i] === '{') depth++
        if (t[i] === '}') { depth--; if (depth === 0) lastComplete = i }
      }
      const partial = t.slice(arrStart, lastComplete + 1) + ']'
      const actions = JSON.parse(partial)
      if (actions.length > 0) {
        console.warn(`[EditorAI] JSON 잘림 감지 — ${actions.length}개 actions 부분 복구`)
      }
      return { reply: reply || '(부분 처리됨)', actions }
    } catch {
      return { reply: text, actions: [] }
    }
  }
}

// 액션 종류별 한글 요약
function summarizeActions(actions) {
  const cnt = { add: 0, addPanel: 0, addTemplate: 0, addTag: 0, addTagSeq: 0, addDevice: 0, addScreen: 0, addSvgSymbol: 0, addWire: 0, addRecipe: 0, setProp: 0, setPropMany: 0, align: 0, distribute: 0, bind: 0, move: 0, delete: 0, other: 0 }
  const svgNames = [], tagNames = [], elNames = []
  for (const a of actions) {
    if (cnt[a.op] !== undefined) cnt[a.op]++
    else cnt.other++
    if (a.op === 'addSvgSymbol') svgNames.push(a.name || '심볼')
    if (a.op === 'addTag') tagNames.push(a.id || '')
    if (a.op === 'add') elNames.push(`${a.type} "${a.label || ''}"`)
  }
  const lines = []
  if (cnt.addSvgSymbol) lines.push(`🎨 SVG 심볼 생성: ${svgNames.join(', ')}`)
  if (cnt.addScreen)    lines.push(`🖥 화면 ${cnt.addScreen}개 추가`)
  if (cnt.addTag)       lines.push(`🏷 태그 ${cnt.addTag}개 생성: ${tagNames.slice(0,3).join(', ')}${tagNames.length>3?'…':''}`)
  if (cnt.addDevice)    lines.push(`🔌 디바이스 ${cnt.addDevice}개 추가`)
  if (cnt.add)          lines.push(`➕ 요소 ${cnt.add}개 배치: ${elNames.slice(0,3).join(', ')}${elNames.length>3?'…':''}`)
  if (cnt.addPanel)     lines.push(`🧩 설비 패널 ${cnt.addPanel}개 생성`)
  if (cnt.addTemplate)  lines.push(`🧩 부품 세트 ${cnt.addTemplate}개 생성`)
  if (cnt.addWire)      lines.push(`🔌 연결선 ${cnt.addWire}개`)
  if (cnt.addRecipe)    lines.push(`🧪 레시피 ${cnt.addRecipe}개 생성 (태그 자동 등록)`)
  if (cnt.addTagSeq)    lines.push(`🏷 연속 태그 생성`)
  if (cnt.setProp || cnt.setPropMany) lines.push(`🎨 속성 변경 ${cnt.setProp + cnt.setPropMany}건`)
  if (cnt.align)        lines.push(`📐 정렬 ${cnt.align}건`)
  if (cnt.distribute)   lines.push(`📏 간격 균등 ${cnt.distribute}건`)
  if (cnt.bind)         lines.push(`🔗 태그 바인딩 ${cnt.bind}개`)
  if (cnt.move)         lines.push(`↔ 요소 이동 ${cnt.move}개`)
  if (cnt.delete)       lines.push(`🗑 요소 삭제 ${cnt.delete}개`)
  return lines
}

function ActionConfirmPanel({ result, onConfirm, onCancel }) {
  const { reply, actions = [], tokNote } = result
  const lines = summarizeActions(actions)
  // DIAGRAM_ANALYSIS 마커 제거 후 표시
  const cleanReply = reply.replace(/\[DIAGRAM_ANALYSIS\][\s\S]*?\[\/DIAGRAM_ANALYSIS\]/g, '').trim()

  return (
    <div className="mx-0 rounded-lg overflow-hidden" style={{ border: '1px solid #7c3aed', background: '#13102a' }}>
      {/* AI 말풍선 */}
      <div className="px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap" style={{ color: '#ddd6fe', borderBottom: actions.length ? '1px solid #2d1b4e' : 'none' }}>
        {cleanReply || '처리할 내용을 확인해 주세요.'}
      </div>

      {/* 액션 요약 */}
      {actions.length > 0 && (
        <div className="px-3 py-2" style={{ background: '#0d0b1a' }}>
          <p className="text-[9px] text-[#7c3aed] mb-1.5 font-bold">적용 예정 ({actions.length}개 작업)</p>
          <div className="space-y-0.5">
            {lines.map((l, i) => (
              <p key={i} className="text-[10px]" style={{ color: '#c4b5fd' }}>{l}</p>
            ))}
          </div>
        </div>
      )}

      {/* 버튼 */}
      <div className="flex gap-2 px-3 py-2" style={{ borderTop: '1px solid #2d1b4e' }}>
        <button onClick={onCancel}
          className="flex-1 py-1 rounded text-[10px] font-bold transition-colors"
          style={{ background: '#1e1b4b', border: '1px solid #4c1d95', color: '#a78bfa' }}>
          취소
        </button>
        <button onClick={onConfirm}
          className="flex-1 py-1 rounded text-[10px] font-bold transition-colors"
          style={{ background: '#6d28d9', border: '1px solid #7c3aed', color: '#fff', boxShadow: '0 0 8px #7c3aed44' }}>
          ✓ 적용
        </button>
      </div>
      {tokNote && <p className="text-[8px] text-[#2d1b4e] px-3 pb-1.5">{tokNote}</p>}
    </div>
  )
}

const SEV = {
  error: { color: '#ef4444', bg: '#2a0e0e', border: '#7f1d1d', Icon: XCircle, label: '오류' },
  warn:  { color: '#f59e0b', bg: '#2a1e0a', border: '#78500f', Icon: AlertTriangle, label: '주의' },
  info:  { color: '#38bdf8', bg: '#0c1f2e', border: '#155e75', Icon: Info, label: '참고' },
}

// 화면 검수 결과 패널 — Level 2 서포터
function InspectionPanel({ inspection, onFix, onFixAll, onDeep, onClose, busy }) {
  const { findings } = inspection
  const s = inspectionSummary(findings)
  const headerLabel = inspection.label || '화면 검수 결과'
  const deepLabel = inspection.mode === 'element' ? '✦ AI 심층 진단' : '✦ AI 심층 검수'

  if (!findings.length) {
    return (
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #166534', background: '#0c1f14' }}>
        <div className="flex items-center gap-2 px-3 py-2.5">
          <CheckCircle2 size={15} className="text-[#22c55e]" />
          <span className="text-[11px] font-bold text-[#86efac]">검수 통과 — 발견된 문제가 없습니다.</span>
        </div>
        <div className="flex gap-2 px-3 py-2" style={{ borderTop: '1px solid #14532d' }}>
          <button onClick={onDeep} disabled={busy}
            className="flex-1 py-1 rounded text-[10px] font-bold transition-colors disabled:opacity-40"
            style={{ background: '#0d2515', border: '1px solid #166534', color: '#86efac' }}>
            {deepLabel}
          </button>
          <button onClick={onClose}
            className="flex-1 py-1 rounded text-[10px] font-bold"
            style={{ background: '#1e1b4b', border: '1px solid #4c1d95', color: '#a78bfa' }}>닫기</button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #7c3aed', background: '#13102a' }}>
      {/* 헤더 요약 */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid #2d1b4e', background: '#0d0b1a' }}>
        <ShieldCheck size={14} className="text-[#c4b5fd]" />
        <span className="text-[11px] font-bold text-[#ddd6fe]">{headerLabel}</span>
        <div className="ml-auto flex items-center gap-1.5 text-[9px] font-bold">
          {s.error > 0 && <span style={{ color: SEV.error.color }}>● {s.error}</span>}
          {s.warn > 0 && <span style={{ color: SEV.warn.color }}>● {s.warn}</span>}
          {s.info > 0 && <span style={{ color: SEV.info.color }}>● {s.info}</span>}
        </div>
      </div>

      {/* 문제 목록 */}
      <div className="max-h-[320px] overflow-y-auto px-2 py-2 space-y-1.5">
        {findings.map(f => {
          const sv = SEV[f.severity] || SEV.info
          const Icon = sv.Icon
          return (
            <div key={f.id} className="rounded px-2 py-1.5" style={{ background: sv.bg, border: `1px solid ${sv.border}` }}>
              <div className="flex items-start gap-1.5">
                <Icon size={12} style={{ color: sv.color, marginTop: 1, flexShrink: 0 }} />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold leading-snug" style={{ color: sv.color }}>{f.title}</p>
                  <p className="text-[9px] text-[#94a3b8] leading-snug mt-0.5">{f.detail}</p>
                </div>
                {f.fix && f.fix.length > 0 && (
                  <button onClick={() => onFix(f)} disabled={busy}
                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold flex-shrink-0 disabled:opacity-40 transition-colors"
                    style={{ background: '#6d28d9', border: '1px solid #7c3aed', color: '#fff' }}>
                    <Wrench size={9} /> 고치기
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 하단 액션 */}
      <div className="flex gap-2 px-3 py-2" style={{ borderTop: '1px solid #2d1b4e' }}>
        <button onClick={onClose}
          className="py-1 px-2 rounded text-[10px] font-bold"
          style={{ background: '#1e1b4b', border: '1px solid #4c1d95', color: '#a78bfa' }}>닫기</button>
        <button onClick={onDeep} disabled={busy}
          className="flex-1 py-1 rounded text-[10px] font-bold transition-colors disabled:opacity-40"
          style={{ background: '#1e1b4b', border: '1px solid #4c1d95', color: '#c4b5fd' }}>
          {deepLabel}
        </button>
        {s.fixable > 0 && (
          <button onClick={onFixAll} disabled={busy}
            className="flex-1 py-1 rounded text-[10px] font-bold transition-colors disabled:opacity-40"
            style={{ background: '#6d28d9', border: '1px solid #7c3aed', color: '#fff', boxShadow: '0 0 8px #7c3aed44' }}>
            🔧 자동수정 {s.fixable}건
          </button>
        )}
      </div>
    </div>
  )
}

function ChatMessage({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={isUser
          ? { background: '#1e40af', border: '1px solid #3b82f6' }
          : { background: '#4c1d95', border: '1px solid #7c3aed' }}>
        {isUser ? <User size={11} className="text-[#93c5fd]" /> : <Sparkles size={11} className="text-[#c4b5fd]" />}
      </div>
      <div className={`max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
        {msg.image && (
          <img src={msg.image} alt="첨부" className="rounded-lg border border-[#1e40af] max-h-32 object-contain mb-0.5" />
        )}
        <div className="px-3 py-2 rounded-lg text-[11px] leading-relaxed whitespace-pre-wrap"
          style={isUser
            ? { background: '#1e3a5f', border: '1px solid #1e40af', color: '#bfdbfe' }
            : { background: '#1e1b4b', border: '1px solid #4c1d95', color: '#ddd6fe' }}>
          {msg.text || (msg.streaming ? '…' : '')}
        </div>
        {msg.note && <span className="text-[9px] text-[#7c3aed] px-1">{msg.note}</span>}
        <div className="flex items-center gap-2 px-1">
          <span className="text-[9px] text-[#4a5568]">{msg.time}</span>
          {msg.tokNote && <span className="text-[9px] text-[#374151]">{msg.tokNote}</span>}
        </div>
      </div>
    </div>
  )
}

export default function EditorAI({ tags, elements, screens, activeScreenId, devices, symbols, resolution, projectName, bindings = {}, selectedIds = [], recipeSets = [], onApplyActions, learnedProfile = '' }) {
  const ctxRef = useRef({ tags, elements, screens, activeScreenId, devices, symbols, resolution, projectName, bindings, selectedIds, recipeSets, learnedProfile })
  ctxRef.current = { tags, elements, screens, activeScreenId, devices, symbols, resolution, projectName, bindings, selectedIds, recipeSets, learnedProfile }

  const access = useAccess() // 무료 유저는 내부 AI 사용 불가
  const [status, setStatus] = useState('connecting') // connecting | ready | nokey | offline
  const [model, setModel] = useState('')
  const [messages, setMessages] = useState([{
    role: 'assistant',
    text: 'Claude 작화 보조입니다.\n\n· "와인더 라인 화면 만들어줘" → 즉시 생성\n· 태그 표(엑셀/CSV) 붙여넣기 → 화면 자동구성\n· 아래 "화면 검수" → 미연결·겹침·오류 점검 + 원클릭 수정\n· 도면 첨부 후 "파악해줘" → 단계별 작업',
    time: hhmm(),
  }])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [attachment, setAttachment] = useState(null) // { name, mediaType, dataUrl }

  // 대화 히스토리 (Claude API 형식: [{role, content}])
  const historyRef = useRef([])
  // 도면 분석 결과 (문자열) — 이후 대화에서 시스템 프롬프트에 포함
  const [diagramAnalysis, setDiagramAnalysis] = useState(null)
  // 단계별 작업 모드 여부
  const [stepMode, setStepMode] = useState(false)
  // 확인 대기 중인 결과 { reply, actions, tokNote, continueCtx }
  const [pendingResult, setPendingResult] = useState(null)
  // 화면 검수 결과 { findings } | null (Level 2)
  const [inspection, setInspection] = useState(null)

  const fileRef = useRef(null)
  const bottomRef = useRef(null)
  const abortRef = useRef(false)

  function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { window.alert('이미지 파일만 첨부할 수 있습니다.'); return }
    if (file.size > MAX_IMG_BYTES) { window.alert('이미지가 너무 큽니다 (최대 5MB).'); return }
    const reader = new FileReader()
    reader.onload = () => setAttachment({ name: file.name, mediaType: file.type, dataUrl: reader.result })
    reader.readAsDataURL(file)
  }

  async function checkHealth() {
    setStatus('connecting')
    const h = await getClaudeHealth()
    if (!h) { setStatus('offline'); return }
    setModel(h.model || '')
    setStatus(h.hasKey ? 'ready' : 'nokey')
  }
  useEffect(() => { checkHealth() }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, busy])

  // 검수 패널이 열려 있는 동안 화면/태그가 바뀌면 자동 재검수 (수정 반영·실시간 점검)
  const inspectOpenRef = useRef(false)
  inspectOpenRef.current = !!inspection
  useEffect(() => {
    if (!inspectOpenRef.current) return
    const c = ctxRef.current
    setInspection({ findings: inspectScreen({
      elements: c.elements, tags: c.tags, bindings: c.bindings, resolution: c.resolution, screens: c.screens,
    }) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, bindings, tags])

  async function sendText(forcedText) {
    if (!access.ai) return // 무료 유저 차단
    const text = (forcedText || input).trim()
    if (!text || busy || pendingResult) return
    if (status !== 'ready') { await checkHealth() }
    const userMsg = { role: 'user', text, time: hhmm() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setBusy(true)
    abortRef.current = false
    const thisUserContent = [{ type: 'text', text }]
    try {
      const curCtx = { ...ctxRef.current, diagramAnalysis }
      const res = await postClaude({ system: buildSystem(curCtx), messages: [...historyRef.current, { role:'user', content: thisUserContent }], max_tokens: 8192 })
      if (abortRef.current) { setBusy(false); return }
      const { reply, actions } = parseResponse(res.text)
      const m = reply.match(/\[DIAGRAM_ANALYSIS\]([\s\S]*?)\[\/DIAGRAM_ANALYSIS\]/)
      if (m) { setDiagramAnalysis(m[1].trim()); setStepMode(true) }
      historyRef.current = [...historyRef.current, { role:'user', content: thisUserContent }, { role:'assistant', content: reply||'(처리됨)' }]
      if (historyRef.current.length > 20) historyRef.current = historyRef.current.slice(-20)
      const usage = res.usage || {}
      const tokNote = `입력 ${(usage.input_tokens||0).toLocaleString()} / 출력 ${(usage.output_tokens||0).toLocaleString()} 토큰`
      if (actions.length > 0) {
        setPendingResult({ reply, actions, tokNote, needContinue: res.stop_reason==='max_tokens', thisUserContent, text })
        setMessages(prev => prev.filter(m => !m.streaming))
      } else {
        const cleanReply = reply.replace(/\[DIAGRAM_ANALYSIS\][\s\S]*?\[\/DIAGRAM_ANALYSIS\]/g,'').trim()
        setMessages(prev => [...prev.filter(m => !m.streaming), { role:'assistant', text: cleanReply||'(처리했습니다)', tokNote, time: hhmm() }])
      }
      setStatus('ready')
    } catch(err) {
      setMessages(prev => [...prev.filter(m => !m.streaming), { role:'assistant', text:`⚠ ${err.message}`, time: hhmm() }])
    } finally { setBusy(false) }
  }

  // "이거 왜 안 돼" 류 = 선택 요소 진단 의도 (선택이 있을 때만)
  const DIAG_INTENT = /(왜\s*(안|못))|안\s*(떠|뜨|나와|나옴|켜|움직|되|돼|바뀌|변)|작동.*안|동작.*안|진단|이상해|고장|안\s*먹/

  async function send() {
    const text = input.trim()
    if ((!text && !attachment) || busy || pendingResult) return
    // 증상 신고 + 선택 요소 있음 → 로컬 진단 먼저 (즉시·오프라인). 심층은 진단패널의 버튼으로.
    if (text && !attachment && DIAG_INTENT.test(text) && (ctxRef.current.selectedIds?.length)) {
      setInput('')
      runDiagnosis(text)
      return
    }
    if (status !== 'ready') { await checkHealth() }

    const pendingImg = attachment
    const userMsg = { role: 'user', text: text || '(이미지 참고)', time: hhmm(), image: pendingImg?.dataUrl }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setAttachment(null)
    setBusy(true)
    abortRef.current = false

    // 이번 턴의 사용자 메시지 (API 형식)
    const thisUserContent = []
    if (text) thisUserContent.push({ type: 'text', text })
    if (pendingImg) thisUserContent.push({
      type: 'image',
      source: { type: 'base64', media_type: pendingImg.mediaType, data: String(pendingImg.dataUrl).split(',')[1] },
    })

    try {
      const curCtx = { ...ctxRef.current, diagramAnalysis }
      const apiMessages = [
        ...historyRef.current,
        { role: 'user', content: thisUserContent },
      ]

      const res = await postClaude({
        system: buildSystem(curCtx),
        messages: apiMessages,
        max_tokens: 8192,
      })
      if (abortRef.current) { setBusy(false); return }

      const { reply, actions } = parseResponse(res.text)

      // 도면 분석 결과 추출
      const m = reply.match(/\[DIAGRAM_ANALYSIS\]([\s\S]*?)\[\/DIAGRAM_ANALYSIS\]/)
      if (m) { setDiagramAnalysis(m[1].trim()); setStepMode(true) }

      // 히스토리에 추가 (이미지 제외)
      const userForHistory = text ? [{ type: 'text', text }] : [{ type: 'text', text: '(이미지 첨부됨)' }]
      historyRef.current = [
        ...historyRef.current,
        { role: 'user', content: userForHistory },
        { role: 'assistant', content: reply || '(처리됨)' },
      ]
      if (historyRef.current.length > 20) historyRef.current = historyRef.current.slice(-20)

      const usage = res.usage || {}
      const totalInTok  = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0)
      const totalOutTok = (usage.output_tokens || 0)
      const wasCached   = res.cached || (usage.cache_read_input_tokens || 0) > 0
      const tokNote = `입력 ${totalInTok.toLocaleString()} / 출력 ${totalOutTok.toLocaleString()} 토큰${wasCached ? ' ⚡캐시' : ''}`

      if (actions.length > 0) {
        // 액션이 있으면 확인 패널 표시
        setPendingResult({
          reply, actions, tokNote,
          needContinue: res.stop_reason === 'max_tokens',
          thisUserContent, text,
        })
        setMessages(prev => prev.filter(m => !m.streaming))
      } else {
        // 액션 없는 순수 대화
        const cleanReply = reply.replace(/\[DIAGRAM_ANALYSIS\][\s\S]*?\[\/DIAGRAM_ANALYSIS\]/g, '').trim()
        setMessages(prev => [
          ...prev.filter(m => !m.streaming),
          { role: 'assistant', text: cleanReply || '(처리했습니다)', tokNote, time: hhmm() },
        ])
      }
      setStatus('ready')
    } catch (err) {
      setMessages(prev => [...prev.filter(m => !m.streaming), { role: 'assistant', text: `⚠ ${err.message}`, time: hhmm() }])
      if (/API key|ANTHROPIC/i.test(err.message)) setStatus('nokey')
    } finally {
      setBusy(false)
    }
  }

  // 확인 → 적용 + 필요 시 2라운드~ 자동 계속
  async function applyPending() {
    if (!pendingResult) return
    const { reply, actions, tokNote, needContinue, thisUserContent, text } = pendingResult
    setPendingResult(null)

    let totalApplied = { screensAdded:0, tagsAdded:0, devicesAdded:0, added:0, removed:0, bound:0, moved:0 }

    // 1라운드 액션 적용
    if (actions.length && onApplyActions) {
      const r = onApplyActions(actions) || {}
      Object.keys(totalApplied).forEach(k => { totalApplied[k] += r[k] || 0 })
    }

    // 결과 메시지 표시
    const parts = []
    if (totalApplied.screensAdded) parts.push(`화면 ${totalApplied.screensAdded}`)
    if (totalApplied.tagsAdded)    parts.push(`태그 ${totalApplied.tagsAdded}`)
    if (totalApplied.devicesAdded) parts.push(`디바이스 ${totalApplied.devicesAdded}`)
    if (totalApplied.added)        parts.push(`요소 ${totalApplied.added}`)
    if (totalApplied.removed)      parts.push(`삭제 ${totalApplied.removed}`)
    if (totalApplied.bound)        parts.push(`바인딩 ${totalApplied.bound}`)
    if (totalApplied.moved)        parts.push(`이동 ${totalApplied.moved}`)
    const note = parts.length ? `✦ 적용됨: ${parts.join(', ')}` : ''
    const cleanReply = reply.replace(/\[DIAGRAM_ANALYSIS\][\s\S]*?\[\/DIAGRAM_ANALYSIS\]/g, '').trim()

    setMessages(prev => [
      ...prev,
      { role: 'assistant', text: cleanReply || '(처리했습니다)', note, tokNote, time: hhmm() },
    ])

    // max_tokens로 잘린 경우 자동으로 2라운드~ 진행
    if (needContinue) {
      setBusy(true)
      let round = 1
      const MAX_ROUNDS = 4
      try {
        while (round < MAX_ROUNDS) {
          round++
          setMessages(prev => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.streaming) next[next.length - 1] = { ...last, text: `⟳ 계속 작업 중… (${round}회차)` }
            else next.push({ role: 'assistant', text: `⟳ 계속 작업 중… (${round}회차)`, streaming: true, time: hhmm() })
            return next
          })
          const curCtx = { ...ctxRef.current, diagramAnalysis }
          const res2 = await postClaude({
            system: buildSystem(curCtx),
            messages: [
              ...historyRef.current,
              { role: 'user', content: thisUserContent },
              { role: 'assistant', content: reply },
              { role: 'user', content: [{ type: 'text', text: `이전 작업이 토큰 한도로 중단됐습니다. 나머지 항목을 이어서 완성해주세요. (${round}회차)` }] },
            ],
            max_tokens: 8192,
          })
          const { reply: r2, actions: a2 } = parseResponse(res2.text)
          if (a2.length && onApplyActions) onApplyActions(a2)
          setMessages(prev => [
            ...prev.filter(m => !m.streaming),
            { role: 'assistant', text: r2 || '(계속 처리됨)', note: a2.length ? `✦ 추가 적용: 요소 ${a2.filter(a=>a.op==='add').length}개` : '', time: hhmm() },
          ])
          if (res2.stop_reason !== 'max_tokens' || !a2.length) break
        }
      } catch (err) {
        setMessages(prev => [...prev.filter(m => !m.streaming), { role: 'assistant', text: `⚠ ${err.message}`, time: hhmm() }])
      } finally {
        setBusy(false)
      }
    }
  }

  function cancelPending() {
    setPendingResult(null)
    setMessages(prev => [...prev, { role: 'assistant', text: '취소했습니다.', time: hhmm() }])
  }

  // ── 화면 검수 (Level 2) — 규칙 기반, 오프라인 즉시 동작 ──
  function runInspection() {
    if (busy || pendingResult) return
    const c = ctxRef.current
    const findings = inspectScreen({
      elements: c.elements, tags: c.tags, bindings: c.bindings,
      resolution: c.resolution, screens: c.screens,
    })
    setInspection({ findings, mode: 'screen', label: '화면 검수 결과' })
  }
  // ── 선택 요소 진단 (Level 3) — 지목한 요소의 "안 되는 원인" 역추적 ──
  function runDiagnosis(userText) {
    if (busy || pendingResult) return
    const c = ctxRef.current
    const ids = c.selectedIds || []
    const els = (c.elements || []).filter(e => ids.includes(e.id))
    if (userText) setMessages(prev => [...prev, { role: 'user', text: userText, time: hhmm() }])
    if (!els.length) {
      setMessages(prev => [...prev, { role: 'assistant', text: '진단할 요소를 먼저 선택해 주세요. (캔버스에서 클릭)', time: hhmm() }])
      return
    }
    const findings = els.flatMap(el => diagnoseElement(el, { tags: c.tags, bindings: c.bindings, resolution: c.resolution }))
    const label = els.length === 1 ? `진단: "${els[0].label || els[0].id}"` : `진단 (${els.length}개 요소)`
    setInspection({ findings, mode: 'element', label, symptom: userText || '' })
  }
  function applyFix(finding) {
    if (!finding.fix || !onApplyActions) return
    onApplyActions(finding.fix)  // 적용 후 재검수는 아래 effect가 처리 (props 변화 감지)
  }
  function applyAllFixes() {
    if (!inspection || !onApplyActions) return
    const all = inspection.findings.flatMap(f => (f.fix && f.fix.length) ? f.fix : [])
    if (!all.length) return
    onApplyActions(all)
    setMessages(prev => [...prev, { role: 'assistant', text: `🔧 자동수정 ${all.length}건 적용했습니다.`, time: hhmm() }])
  }
  // ── AI 심층 검수/진단 — 규칙 결과를 Claude에 넘겨 의미 기반 분석 요청 ──
  function deepInspect() {
    const findings = inspection?.findings || []
    const isDiag = inspection?.mode === 'element'
    const lines = findings.map(f => `- [${f.severity}] ${f.title} — ${f.detail}`).join('\n')
    const prompt = isDiag
? `방금 선택 요소를 규칙 진단했습니다.${inspection?.symptom ? ` 사용자 증상: "${inspection.symptom}".` : ''}
아래 결과를 참고해 **더 깊이** 원인을 분석하고, 고칠 수 있으면 액션(op)으로 제안해줘.
(위 "현재 선택된 요소" 정보의 태그·바인딩·애니 상태를 근거로 판단)

[규칙 진단 결과 ${findings.length}건]
${lines || '(규칙 진단은 문제 없음)'}`
: `방금 화면을 규칙 검수했습니다. 아래 결과를 참고해 **더 깊이** 검토해줘:
라벨과 태그 역할의 불일치, 색상 규칙(경보=빨강/주의=노랑/정상=초록) 위반, 누락된 알람·표시, 배치·가독성 개선점을 찾고,
고칠 수 있는 건 액션(op)으로 제안해줘. 문제 없으면 잘 된 점을 짚어줘.

[규칙 검수 결과 ${findings.length}건]
${lines || '(규칙 검수는 문제 없음)'}`
    setInspection(null)
    sendText(prompt)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const statusInfo = {
    connecting: { color: '#f59e0b', label: '연결 중…' },
    ready: { color: '#22c55e', label: model || '준비됨' },
    nokey: { color: '#ef4444', label: 'API 키 미설정' },
    offline: { color: '#ef4444', label: '서버 미연결' },
  }[status]

  return (
    <aside className="flex flex-col h-full bg-[#120f1f] border-l border-[#4c1d95]" style={{ width: 320 }}>
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-[#4c1d95] flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#4c1d95] border border-[#7c3aed] flex items-center justify-center">
            <Sparkles size={14} className="text-[#c4b5fd]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-[12px] font-bold text-[#e2e8f0]">Claude</p>
              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-[#4c1d95] text-[#c4b5fd] border border-[#7c3aed]">
                편집 보조 · CLOUD
              </span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusInfo.color, boxShadow: `0 0 4px ${statusInfo.color}` }} />
              <p className="text-[9px] truncate" style={{ color: statusInfo.color }}>{statusInfo.label}</p>
              <button onClick={checkHealth} title="상태 새로고침" className="ml-auto p-1 rounded hover:bg-[#2d1b4e] text-[#7c3aed]">
                <RefreshCw size={11} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {status === 'nokey' && (
        <div className="mx-3 mt-2 p-2 rounded bg-[#2a0e0e] border border-[#7f1d1d] text-[9px] text-[#fca5a5] leading-relaxed flex-shrink-0">
          서버에 Claude API 키가 없습니다.<br />
          터미널에서 키 설정 후 <span className="font-mono text-[#fecaca]">npm run start</span> 재실행:<br />
          <span className="font-mono text-[#fecaca]">$env:ANTHROPIC_API_KEY="sk-ant-..."</span>
        </div>
      )}

      {/* 채팅 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((m, i) => <ChatMessage key={i} msg={m} />)}
        {busy && !pendingResult && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center bg-[#4c1d95] border border-[#7c3aed] flex-shrink-0">
              <Sparkles size={11} className="text-[#c4b5fd]" />
            </div>
            <div className="px-3 py-2 rounded-lg bg-[#1e1b4b] border border-[#4c1d95]">
              <span className="text-[10px] text-[#c4b5fd] animate-pulse">분석 중…</span>
            </div>
          </div>
        )}
        {pendingResult && (
          <ActionConfirmPanel
            result={pendingResult}
            onConfirm={applyPending}
            onCancel={cancelPending}
          />
        )}
        {inspection && !pendingResult && (
          <InspectionPanel
            inspection={inspection}
            busy={busy}
            onFix={applyFix}
            onFixAll={applyAllFixes}
            onDeep={deepInspect}
            onClose={() => setInspection(null)}
          />
        )}
        <div ref={bottomRef} />
      </div>

      {/* 태그 일괄 생성 폼 */}
      {/* 빠른 명령 */}
      {/* 단계별 모드 표시 */}
      {stepMode && diagramAnalysis && (
        <div className="mx-3 mb-1 mt-1 p-2 rounded border border-[#7c3aed] bg-[#1e1b4b] flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-[#c4b5fd] font-bold">📋 단계별 작업 모드</span>
            <button onClick={() => { setStepMode(false); setDiagramAnalysis(null); historyRef.current = [] }}
              className="text-[8px] text-[#6d28d9] hover:text-[#c4b5fd]">초기화</button>
          </div>
          <p className="text-[8px] text-[#7c3aed] leading-relaxed whitespace-pre-wrap line-clamp-3">{diagramAnalysis}</p>
        </div>
      )}

      {/* 검수(전체) + 진단(선택 요소) — 오프라인 즉시 동작 */}
      <div className="px-3 pt-2 flex-shrink-0 flex gap-1.5">
        <button onClick={runInspection} disabled={busy || !!pendingResult}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-[10px] font-bold transition-colors disabled:opacity-40"
          style={{ background: '#0d0b1a', border: '1px solid #4c1d95', color: '#c4b5fd' }}>
          <ShieldCheck size={12} /> 화면 검수
        </button>
        <button onClick={() => runDiagnosis()} disabled={busy || !!pendingResult}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-[10px] font-bold transition-colors disabled:opacity-40"
          style={{ background: '#0d0b1a', border: '1px solid #166534', color: '#86efac' }}
          title="선택한 요소가 왜 안 되는지 원인 진단">
          <Stethoscope size={12} /> 선택 진단
        </button>
      </div>

      {/* 빠른 명령 */}
      <div className="px-3 py-2 border-t border-[#2d1b4e] flex gap-1.5 overflow-x-auto flex-shrink-0">
        {(stepMode
          ? ['이미지 그려줘', '속도표시기 만들어줘', '태그 연결해줘', '다음 작업은?']
          : ['등록된 태그로 표 형식으로 화면 구성해줘', '표준 스타일로 통일해줘', '미연결 태그 채워줘', '전체 비우기']
        ).map(cmd => (
          <button key={cmd} onClick={() => setInput(cmd)}
            className="px-2 py-1 rounded text-[9px] text-[#c4b5fd] border border-[#4c1d95] hover:bg-[#2d1b4e] transition-all whitespace-nowrap flex-shrink-0">
            {cmd}
          </button>
        ))}
      </div>

      {/* 입력 */}
      <div className="px-3 py-3 border-t border-[#4c1d95] flex-shrink-0">
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />

        {!access.ai && !access.loading ? (
          <div className="flex items-center gap-2 px-3 py-3 rounded-lg" style={{ background: '#1a1530', border: '1px solid #4c1d95', color: '#c4b5fd' }}>
            <Lock size={14} className="flex-shrink-0" />
            <span className="text-[11px] leading-snug">내부 AI는 <b className="text-[#ddd6fe]">오너 · 프리미엄 전용</b>입니다. 그리기 · 태그 · 시뮬레이션은 자유롭게 사용하세요.</span>
          </div>
        ) : (<></>)}
        <div style={{ display: (!access.ai && !access.loading) ? 'none' : 'block' }}>

        {/* 첨부 미리보기 */}
        {attachment && (
          <div className="flex items-center gap-2 mb-2 p-1.5 rounded bg-[#1a1530] border border-[#4c1d95]">
            <img src={attachment.dataUrl} alt="첨부" className="w-10 h-10 object-cover rounded" />
            <span className="text-[10px] text-[#c4b5fd] truncate flex-1">{attachment.name}</span>
            <button onClick={() => setAttachment(null)} className="p-1 rounded hover:bg-[#2d1b4e] text-[#7c3aed]">
              <X size={12} />
            </button>
          </div>
        )}

        <div className="flex gap-2 items-end">
          <button onClick={() => fileRef.current?.click()} title="이미지 첨부 (참고 도면/스케치)"
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-[#1a1530] border border-[#4c1d95] text-[#c4b5fd] hover:bg-[#2d1b4e] transition-colors">
            <ImagePlus size={15} />
          </button>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="화면 작성/수정을 요청하세요…"
            rows={2}
            className="flex-1 bg-[#1a1530] border border-[#4c1d95] rounded-lg px-3 py-2 text-[11px] text-[#e2e8f0] placeholder-[#6d28d9] resize-none focus:outline-none focus:border-[#7c3aed] transition-colors"
            style={{ minHeight: 52 }}
          />
          {busy ? (
            <button onClick={() => { abortRef.current = true; setBusy(false) }} title="중단"
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: '#7f1d1d', border: '1px solid #ef4444', color: '#fff' }}>
              <Square size={13} fill="white" />
            </button>
          ) : (
            <button onClick={send} disabled={(!input.trim() && !attachment) || !!pendingResult}
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-all"
              style={(input.trim() || attachment)
                ? { background: '#6d28d9', border: '1px solid #7c3aed', color: '#fff', boxShadow: '0 0 8px #7c3aed44' }
                : { background: '#1a1530', border: '1px solid #2d1b4e', color: '#4a5568' }}>
              <Send size={14} />
            </button>
          )}
        </div>
        <p className="text-[8px] text-[#2d1b4e] mt-1 text-center">{model ? `${model} · ` : ''}편집창 전용 · Claude API</p>
        </div>
      </div>
    </aside>
  )
}
