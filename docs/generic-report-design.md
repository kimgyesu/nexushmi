# 범용 보고서 · 자동운전 아키텍처 설계

> 목표: NexusHMI는 범용 HMI다. 온실뿐 아니라 **집진기·급수펌프·하수처리장** 등
> 어떤 프로젝트든 "설정값 기준으로 장비가 작동"하고, **동일한 AI 보고서**가 나와야 한다.
> 특정 장비(온실)에 박힌 물리식·보고서를 **태그 메타데이터 + 데이터 로거**로 일반화한다.

---

## 1. 태그 역할(role) 메타데이터

모든 보고서/시뮬레이션은 "이 태그가 무엇인가"만 알면 동작해야 한다. 태그에 `role`을 둔다.

| role | 뜻 | 예시 | 보고서에서 |
|---|---|---|---|
| `pv` | 공정변수(측정 아날로그) | 온도, 수위, 차압ΔP, 유량, DO, 탁도, pH | 트렌드·급변 탐지 대상 |
| `sv` | 설정값(목표) | 목표온도, 목표수위, 목표차압 | 목표 대비 실적 편차 |
| `equipment` | 장비 가동상태(BIT) | 급수펌프, 집진팬, 블로워, 밸브, 히터 | ON/OFF 마커·가동 이력 |
| `power` | 전력/에너지 | 송풍기 kW, 펌프 kWh | 사용량·원인·절감 판단 |
| `env` | 외란/환경 입력(옵션) | 일광량, 외기온 | 원인 설명 보조 |

**자동 분류(기존 태그도 즉시 적용):** 명시적 `tag.role` 우선, 없으면 추론
- `BIT` → `equipment`
- `isSetpointTag(tag)`(desc에 "설정"/SV) → `sv`
- `unit`에 kW/kWh 포함 → `power`
- 그 외 아날로그(FLOAT/WORD) → `pv`

**선택적 연결(정확도 ↑, 없으면 시간근접 매칭으로 폴백):**
- `equipment` 태그: `affects: 'TAG_LEVEL'` — 이 장비가 어떤 pv를 움직이는지
- `pv` 태그: `sv: 'TAG_SET_LEVEL'` — 이 pv의 설정값 태그

---

## 2. 런타임 데이터 로거 (핵심 신규 모듈)

보고서를 "실제 운전 기록"으로 만들기 위해, 런타임이 태그 이력을 기록한다.

```
logger = {
  meta:   { start, interval, capacity },
  series: { [tagId]: [{ t, v }, ...] },      // pv/power 링버퍼 (실시간 샘플)
  events: [{ ts, tagId, name, on }],          // equipment BIT 엣지(ON/OFF)
  spLog:  [{ ts, tagId, name, value }],       // 설정값 변경 이력
}
```

- **샘플링**: 고정 실시간 간격(예 2s)으로 pv/power 스냅샷 append. 링버퍼로 상한(예 최근 6~24h).
- **이벤트**: BIT 태그 값이 바뀌는 순간만 엣지로 기록(가동 이력).
- **구현 위치**: `Runtime.jsx`가 `logRef`(useRef)로 보관 → 리렌더 없이 누적. 별도 샘플 인터벌 effect.
- **v1**: 메모리 전용. (v2: IndexedDB 영속화 → 새로고침 후에도 보고서 가능)

---

## 3. 보고서 생성기 `buildReport(logger, tags, opts)`

`genDemoDayData`(온실 합성) 를 대체하는 범용 함수.

1. 태그를 role로 분류.
2. `opts.range`(최근 1h/오늘/어제)로 logger 시계열 슬라이스.
3. **PV마다** `detectSpikes(series, logger.events, …)` → 급변 + 근접 장비이벤트로 **원인 매칭**(이미 범용).
4. `power` 있으면 `usageSummary` → 주간/야간 평균·피크·kWh. 없으면 사용량 카드 생략.
5. `equipment` 이벤트 → 가동 타임라인 + 트렌드 마커.
6. `sv`↔`pv` → 목표 대비 편차.
7. 출력: **N개 시리즈 · N종 이벤트**의 범용 구조(온도/습도 하드코딩 제거).

```
report = {
  range, series: [{ name, unit, color, data, spikes, sv? }],
  events, equipTimeline, usage? , deviations?
}
```

---

## 4. 대시보드 범용 렌더 (`AnalysisDashboard`)

- 하드코딩 온도(빨강)/습도(파랑) → **report.series를 M개 라인**으로 자동 렌더(색 자동배정).
- 장비 마커/타임라인 = report.events(어떤 장비든).
- 사용량 카드 = `report.usage` 있을 때만.
- 분당 데이터 표 컬럼 = report.series.
- 제목·라벨 = 태그 이름 → 집진기면 "차압/풍량", 펌프면 "수위/유량" 자동.

---

## 5. 자동운전 엔진 범용화 (`sim.auto` physics config)

온실 태그명·계수가 박힌 `tTarget/hTarget`을 config로 이관.

```
effects: [
  { target:'TAG_LEVEL', converge:0.03, base: 20,           // 또는 base:'ambient'
    gains: [ {ctrl:'TAG_PUMP', k:+0.8}, {ctrl:'TAG_DRAIN', k:-1.2} ] }
]
```
런타임: `target = base + Σ(gain.k × 스위치상태)`, `value += (target−value)×converge`.
→ 클럭/일광량/`control`(설정값 히스테리시스)은 이미 범용. physics만 config화하면 완성.

---

## 6. 검증용 예시 매핑 (같은 파이프라인, 다른 태그)

| 프로젝트 | pv | sv | equipment | power | 보고서 예 |
|---|---|---|---|---|---|
| 집진기 | 차압ΔP, 풍량 | 목표차압 | 집진팬, 탈진밸브 | 송풍기kW | 차압 급상승(필터막힘)→탈진 가동 매칭 |
| 급수펌프 | 수위, 유량, 압력 | 목표수위 | 급수펌프, 배수밸브 | 펌프kW | 수위 급변→펌프 ON 매칭 |
| 하수처리 | DO, 탁도, pH | 목표DO | 블로워, 교반기 | 블로워kW | DO 저하→블로워 증속 매칭 |

---

## 7. 구현 단계 (진행 현황)

1. ✅ **태그 role 메타 + 분류 유틸** — `src/data/tagRoles.js` (`tagRole`, `classifyTags`, `findSetpointFor`, 색상 팔레트)
2. ✅ **데이터 로거** — `src/utils/dataLogger.js` (`createLogger`), Runtime에서 2초 간격 sample + BIT 엣지/설정변경 캡처
3. ✅ **보고서 생성기 범용화** — `src/utils/buildReport.js` (`assembleReport` 코어 + `buildDemoReport` 온실 + `buildReportFromLogger` 실기록 + `reportPrompt`)
4. ✅ **대시보드 범용 렌더** — `AnalysisDashboard`가 report(N개 pv 정규화 트렌드/에너지/사용량/급변/이력/동적표) 소비
5. ✅ **엑셀 범용화** — `reportExcel`가 report의 series 동적 컬럼으로 4시트 구성
   - RuntimeAI: demo(sim.auto)면 buildDemoReport 쇼케이스, 그 외 프로젝트는 로거 실기록(buildReportFromLogger). 검증: 집진기 태그(차압/풍량/송풍기전력/집진팬/탈진밸브)가 동일 파이프라인 통과 확인.
6. ⬜ **자동엔진 physics config화** (`sim.auto.effects`) + **데모 2종(집진기·급수펌프) 추가**로 범용성 시각 시연 — 다음 단계

> 온실 데모는 이 범용 구조 위에서 "effects/role만 정의한 한 사례"로 재작성되어,
> 코드 변경 없이 새 장비 데모를 추가할 수 있음을 증명한다.
