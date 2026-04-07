# NOT-visionOS 아키텍처 설계 (Web MVP)

## 1) 시스템 레이어

- **Input Layer**
  - Camera Manager (`getUserMedia`, 권한, 상태)
  - Hand Tracker Adapter (MediaPipe Hands 래퍼)
  - Mouse Fallback Adapter
- **Gesture Layer**
  - 포인터 추정(손가락 방향 벡터 -> 2D 좌표)
  - 제스처 상태기계(Idle/Pinch/LongPress/Drag/Scroll)
  - 필터(EMA/One-Euro) + 클램프
- **Interaction Layer**
  - 클릭/롱프레스/드래그/스크롤 이벤트 정규화
  - 이벤트 디스패처(창 시스템에 전달)
- **Workspace Layer**
  - 다중 창 관리자(z-index, 포커스, 이동, 리사이즈)
  - 홈 화면/빠른 설정 패널

## 2) 상태 머신(핵심)

### Global Input Mode

- `camera_hand` : 카메라+손추적 정상
- `mouse_fallback` : 카메라 거부/실패 시 자동 전환

### Gesture State

- `idle`
- `pinch_start`
- `pinch_hold`
- `long_press` (hold >= 700ms default)
- `dragging` (pinch 상태에서 위치 이동 임계치 초과)
- `scrolling` (scrollable target에서 pinch-drag)

전이 조건:

- `idle -> pinch_start`: pinch distance < thresholdDown
- `pinch_start -> pinch_hold`: 1~2프레임 안정화
- `pinch_hold -> long_press`: holdDuration >= longPressMs
- `pinch_hold -> dragging`: movement >= dragThresholdPx
- `dragging/scolling -> idle`: pinch distance > thresholdUp

> 히스테리시스(thresholdDown < thresholdUp)를 사용해 떨림에 의한 상태 튐을 줄입니다.

## 3) 포인터 계산

### 랜드마크 기반 방향 추정

- index MCP/PIP/TIP, wrist를 활용해 손가락 방향 벡터 추정
- 손목 기준 상대 좌표를 화면 좌표로 매핑

### 안정화

- EMA(지수이동평균) 기본 적용
- 필요 시 One-Euro Filter로 고속 이동 시 지연 감소

### 범위 제한

- viewport 클램프: `x=[0,width], y=[0,height]`
- 소프트 클램프(가장자리 감쇠) 옵션 제공

## 4) 제스처 정의

- **클릭**: pinch 유지 시간이 클릭 최소/롱프레스 미만
- **롱프레스**: pinch 유지 시간 600~800ms (기본 700ms)
- **드래그**: pinch 유지 + 이동량 임계 초과
- **스크롤**: scroll container에서 pinch-drag의 y 델타를 scroll로 변환
- **관성 정지**: 스크롤 중 클릭 발생 시 inertial animation cancel

## 5) 창 시스템 요구사항

- 최소 3개 창 동시 표시(메인1+보조2)
- 창 포커스 시 최상단(z-index 증가)
- 타이틀바 드래그 이동
- 코너 리사이즈(최소/최대 크기 제한)
- 내용 반응형 레이아웃 유지

## 6) UI 구성

- **Home Screen**
  - 최근 연 창
  - 새 창 열기
  - 설정 진입
  - 호출: 손바닥 펴기(옵션) 또는 고정 버튼
- **Quick Settings**
  - 카메라 on/off
  - 손 추적 재시작
  - 민감도
  - 커서 속도
  - 좌우 반전
  - 전체화면
- **Tracking Reset**
  - 기준 자세 다시 잡기
  - 손 미검출 안내
  - 자동 복구 상태 표시

## 7) 구현 순서 권장

1. Camera Manager + mouse fallback
2. 단일 포인터 안정화(EMA+클램프)
3. pinch 클릭/롱프레스
4. 드래그/스크롤
5. 창 관리자(다중창/포커스/이동/리사이즈)
6. 홈/빠른설정/재설정 UX
7. 2차 기능(양손/저장/음성/얼굴보조)

## 8) 비기능 요구사항

- 30fps 이상 입력 처리 목표
- 제스처 오인식률 모니터링(디버그 오버레이)
- 카메라 권한 거부 시 즉시 폴백 + 사용자 안내
- HTTPS 환경 체크 및 에러 메시지 표준화
