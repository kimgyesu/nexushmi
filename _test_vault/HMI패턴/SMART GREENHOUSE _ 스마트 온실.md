---
project: SMART GREENHOUSE _ 스마트 온실
captured: 2026-07-09T08:29:49.694Z
resolution: 1280x800
tags: 17
screens: 1
tags-index: [HMI패턴]
---

# SMART GREENHOUSE _ 스마트 온실 — HMI 작화 패턴

![[attachments/SMART GREENHOUSE _ 스마트 온실.svg]]

## 태그 명명
- 접두어: `TAG_`
- 그룹(utility): 존1, 존2, 존3, 존4, 환경, 시계, 설정, 설비
- 예시: TAG_Z1_T, TAG_Z1_H, TAG_Z2_T, TAG_Z2_H, TAG_Z3_T, TAG_Z3_H, TAG_Z4_T, TAG_Z4_H

## 스타일
- 그룹박스: 210×130, 테두리 `#22d3ee`
- 값 글꼴 크기: 26

## 패널 구성 (설비 → 행)
| 설비 | 행 구성 |
|------|--------|
| 패널 | :(numeric) · :(numeric) · 일광량(numeric) |
| 존1 · 토마토 A | 온도(numeric) · 습도(numeric) |
| 존2 · 토마토 B | 온도(numeric) · 습도(numeric) |
| 존4 · 파프리카 B | 온도(numeric) · 습도(numeric) |
| 존3 · 파프리카 A | 온도(numeric) · 습도(numeric) |
| 환경 제어  ·  목표값 클릭 입력 → 자동 제어 | °C(numeric) · %(numeric) · 냉각휀(switch) · 냉각휀(lamp) · 냉동기(switch) · 냉동기(lamp) · 히터(switch) · 히터(lamp) · 물 분사(switch) · 물 분사(lamp) |

> 이 노트는 NexusHMI가 빌드 시 자동 생성했습니다. 자유롭게 고치거나 주석을 달면 AI가 그대로 학습합니다.