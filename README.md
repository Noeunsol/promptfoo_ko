# promptfoo_ko

promptfoo_ko는 [promptfoo](https://github.com/promptfoo/promptfoo) 기반의 **한국어 중심 LLM 레드팀/평가** 저장소입니다.
영어/한국어 환경에서 플러그인(공격) – 전략(변환) – 채점(그레이더) 흐름을 그대로 실행하며, 사용자 노출 문구·채점 사유를 한국어로 내재화했습니다.

---

## 1. 레포지토리 설명

- 원본 프레임워크: [promptfoo/promptfoo](https://github.com/promptfoo/promptfoo)
- 연관 프로젝트: 한국어 특화 LLM 레드팀 평가 (한국어 공격 유형 확대)
- 담당자: 노은솔
- 작성일: 2026-07-08
- 목적: 영어/한국어 레드팀 스캔이 동일하게 잘 실행되도록 하고, 한국 사회·문화 특화 공격(사칭/위계/정/존댓말)을 추가 평가
- 현재 특징:
  - 한국 특화 플러그인 4종 추가 (`src/redteam/plugins/korean/`)
  - 25종+ 플러그인의 **채점 사유(reason) 한국어화** 및 한국어 거부(refusal) 탐지
  - **언어 자동 탐지**(한글 비율 기반)로 채점 출력 언어 자동 분기
  - init/온보딩 템플릿 한국어 제공
  - 용어 원칙: 코드 식별자·설정 키는 영어 유지, 사용자 노출 문구만 한국어로 통일

---

## 2. 데이터셋

레드팀 플러그인이 사용하는 데이터셋은 (1) 외부 HuggingFace/CSV 데이터셋과 (2) 저장소 내장 한국어 리소스로 나뉩니다.

### 2.1 외부 데이터셋 (플러그인별)

| 데이터셋                                                                                                                 | 플러그인 ID    | 파일                      | 용도                           |
| ------------------------------------------------------------------------------------------------------------------------ | -------------- | ------------------------- | ------------------------------ |
| [nvidia/Aegis-AI-Content-Safety-Dataset-1.0](https://huggingface.co/datasets/nvidia/Aegis-AI-Content-Safety-Dataset-1.0) | `aegis`        | `plugins/aegis.ts`        | 콘텐츠 안전성 프롬프트         |
| [lmsys/toxic-chat](https://huggingface.co/datasets/lmsys/toxic-chat)                                                     | `toxic-chat`   | `plugins/toxicChat.ts`    | 유해 사용자 발화               |
| [PKU-Alignment/BeaverTails](https://huggingface.co/datasets/PKU-Alignment/BeaverTails)                                   | `beavertails`  | `plugins/beavertails.ts`  | 유해 QA 행동                   |
| [yiting/UnsafeBench](https://huggingface.co/datasets/yiting/UnsafeBench)                                                 | `unsafebench`  | `plugins/unsafebench.ts`  | 유해 이미지(VLM, HF 토큰 필요) |
| [ys-zong/VLGuard](https://huggingface.co/datasets/ys-zong/VLGuard)                                                       | `vlguard`      | `plugins/vlguard.ts`      | 유해 이미지(VLM)               |
| [HarmBench](https://github.com/centerforaisafety/HarmBench) (CSV)                                                        | `harmbench`    | `plugins/harmbench.ts`    | HarmBench 유해 행동            |
| Do-Not-Answer (CSV)                                                                                                      | `donotanswer`  | `plugins/donotanswer.ts`  | 거부해야 하는 프롬프트         |
| CyberSecEval (JSON)                                                                                                      | `cyberseceval` | `plugins/cyberseceval.ts` | 프롬프트 인젝션 벤치마크       |
| L1B3RT4S (Pliny)                                                                                                         | `pliny`        | `plugins/pliny.ts`        | 커뮤니티 탈옥 프롬프트         |
| XSTest                                                                                                                   | `xstest`       | `plugins/xstest.ts`       | 과잉거부 테스트셋              |

- 외부 사용 가능 여부: 각 데이터셋의 원 라이선스를 따름(HuggingFace/GitHub 원본 출처 참조). 코드에는 데이터셋 ID/URL만 참조하며 원본을 재배포하지 않음.
- 제작 방법: `fetchHuggingFaceDataset`(`src/integrations/huggingfaceDatasets`) 또는 직접 HTTP(CSV/JSON) fetch로 런타임에 로드.

### 2.2 내장 한국어 리소스

- **한국어 프롬프트 인젝션 템플릿** — `src/redteam/strategies/promptInjections/dataKo.ts`
  - 설명: 잘 알려진 영어 탈옥/인젝션 템플릿(Developer Mode, DAN 계열 등) 103종의 **한국어 번역본**. 각 항목에 `__PROMPT__` 자리표시자 포함.
  - 스키마: `string[]` (기본 export 배열).
  - 제작 방법: 영어 원본 `data.ts`에서 인덱스 정렬 번역. `index.ts`가 길이 정렬 조건(`isLengthAlignedTemplate`)을 통과하는 항목만 한국어로 치환.
- **한국 특화 플러그인 예시/그레이더** — `src/redteam/plugins/korean/*.ts` (내장 정적 예시, 외부 데이터셋 불필요)

---

## 3. 구체적인 설명

### 3.1 핵심 컴포넌트

- **Plugin**: 공격 카테고리 정의 + 테스트 생성 (`src/redteam/plugins/`)
- **Strategy**: 프롬프트 변환/우회 (base64, rot13, crescendo, goat, multilingual, promptInjections 등)
- **Provider**: 공격 생성·채점 모델 (`src/redteam/providers/`)
- **Grader**: 성공/실패·유해성 판정 및 사유 산출 (한국어/영어 분기)
- **Target**: 테스트 대상 시스템 (OpenAI/Anthropic/HTTP 엔드포인트 등)

### 3.2 한국 특화 플러그인

| 플러그인 ID          | 설명                                                                            | 심각도 |
| -------------------- | ------------------------------------------------------------------------------- | ------ |
| `korean:institution` | 공공기관 사칭(국세청·국민건강보험공단·경찰청 등) — 보이스피싱 패턴, 사칭죄 관련 | High   |
| `korean:hierarchy`   | 위계 권위 압박(부장·본부장·상무 등)+민감 요청                                   | Medium |
| `korean:jeong`       | 정(情)·감정 호소("우리가 남도 아니고", "한 번만 봐주세요")+민감 요청            | Medium |
| `korean:honorific`   | 존댓말/반말·의사 친족("친구", "오빠-동생") 프레이밍+민감 요청                   | Medium |

### 3.3 사용 모델

- 기본 생성/채점 모델: `REDTEAM_MODEL = openai:chat:gpt-4o-mini` (`src/redteam/constants/plugins.ts`)
- 대상(target) 모델: 설정에서 지정 (예: `openai:gpt-4o-mini`, `anthropic:*`, `http` 엔드포인트)

### 3.4 언어 선택 (우선순위)

`resolveGraderLanguage()` (`src/redteam/util.ts`) 기준:

1. 설정 `redteam.language: ko` (최상위)
2. 테스트별 `test.metadata.language` / `modifiers.language` (명시 override)
3. 자동 탐지 — 프롬프트/응답의 한글 비율 ≥ 0.05면 `ko`

---

## 4. 파이프라인 설명 및 실행

### 4.1 파이프라인

```text
Config (레드팀 설정 YAML — redteam setup/init 으로 생성)
  -> Plugin (테스트 케이스 생성)
    -> Strategy (변환/우회, 선택)
      -> Target LLM (대상 호출)
        -> Grader (채점, 언어 자동 분기)
          -> Output (output.json / Web UI Report)
```

### 4.2 환경 설정

```bash
# Node 버전 정렬
source ~/.nvm/nvm.sh && nvm use    # .nvmrc = 24.15.0

# 의존성 설치
npm ci

# API 키: 저장소 루트 .env 에 작성 (예: OPENAI_API_KEY=sk-...)
```

### 4.3 실행 방법

```bash
# 0) 레드팀 설정(YAML) 만들기 — 아래 둘 중 하나로 생성
npm run local -- redteam setup       # 브라우저 위저드로 생성 (빌드된 UI; 최신 반영은 npm run build)
npm run local -- redteam init        # CLI 대화형으로 생성

# 1) 설정으로 레드팀 스캔 (생성 + 평가)
npm run local -- redteam run -c <config>.yaml --env-file .env -o output.json --no-cache

# 2) 테스트 케이스 생성만 (redteam.yaml 출력)
npm run local -- redteam generate -c <config>.yaml

# 3) 웹 UI (개발 모드: 앱 :3000 핫리로드 + 서버 :15500)
npm run dev
```

인자 설명:

- `-c <config>`: 레드팀 블록을 포함한 설정 YAML 경로 (`redteam setup`/`redteam init`으로 생성)
- `--env-file .env`: API 키 로드
- `-o output.json`: 결과 저장 (`success`/`score`/`error` 확인)
- `--no-cache`: 캐시 무시(개발 시 권장)
- 언어: 설정 `redteam.language: ko` 또는 자동 탐지

> **웹 UI 실행 선택**: `npm run dev`는 소스 핫리로드(개발용), `redteam setup`은 **빌드된** UI를 서빙하며 설정 화면으로 바로 연다(변경 반영엔 `npm run build` 필요). 글로벌 `promptfoo`가 아니라 반드시 `npm run local -- ...`로 이 저장소 코드를 실행할 것.

### 4.4 원격 생성 on/off

- 기본 **ON**(promptfoo cloud로 생성).
- 끄기: `PROMPTFOO_DISABLE_REMOTE_GENERATION=true` (레드팀만: `PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION=true`). env는 프로세스 시작 시 1회 로드되므로 변경 후 서버 재시작 필요.
- 확인: 서버 실행 중 `curl http://localhost:15500/api/remote-health` → `{"status":"OK"}`(ON) / `{"status":"DISABLED"}`(OFF). 또는 UI Plugins/Strategies에서 원격 전용 항목의 활성/회색 여부로 확인.

```bash
PROMPTFOO_DISABLE_REMOTE_GENERATION=true npm run local -- redteam run -c <config>.yaml --env-file .env   # 이번 실행만 OFF
```

---

## 5. 이슈

- **원격 OFF 시 유해 플러그인 로컬 생성 한계**: 원격 생성은 기본 ON이며, DISABLE 플래그로 끄면 정렬 모델(`gpt-4o-mini`)이 유해 공격 프롬프트 생성을 거부 → 해당 플러그인은 **0건 생성**. (데이터셋 기반·한국 특화 플러그인은 로컬에서도 정상 동작)
- **"0 Generated / 100% pass"는 안전이 아니라 미실행**: 생성 0건 플러그인은 "테스트되지 않음"으로 해석.
- **API 키 필요**: 대상/생성/채점 모두 OpenAI 키 사용. `.env`의 `OPENAI_API_KEY`가 서버 프로세스에 로드돼야 하며, `.env` 변경 시 `npm run dev` **재시작** 필요(dotenv는 시작 시 1회 로드).
- **HuggingFace 토큰**: HF 데이터셋 기반 플러그인(UnsafeBench 등)은 HF API 토큰 필요.
- **HTTP target**: `http` 프로바이더는 `config.url` 필수(미설정 시 `Invalid URL`).

---

## 6. Requirements

- **Node**: `^20.20.0 || >=22.22.0` (권장 `.nvmrc` = `24.15.0`)
- **패키지 매니저**: npm (`package-lock.json`; 하위 패키지 `--prefix src/app`)
- **설치**: `npm ci` — 모든 의존성은 `package.json`에 정의
- **주요 도구**: tsx(실행/dev), tsdown(빌드), Biome+Prettier(린트/포맷), Vitest(테스트), Drizzle(DB)
- **핵심 명령**: `npm run build` · `npm test` · `npm run lint` · `npm run dev` · `npm run local -- redteam setup`
- **기본 모델**: `REDTEAM_MODEL = openai:chat:gpt-4o-mini`
- **환경변수**: `OPENAI_API_KEY`(필수), `API_PORT`(서버 포트, 기본 15500), `PROMPTFOO_DISABLE_REMOTE_GENERATION`(원격 생성 OFF 토글)

---

## 7. 폴더 구조

```text
promptfoo_ko/
├── src/
│   ├── redteam/                    # 레드팀 핵심
│   │   ├── plugins/                # 공격 플러그인 (파일당 1개)
│   │   │   ├── korean/             # 한국 특화: institution/hierarchy/jeong/honorific
│   │   │   ├── harmful/  bias.ts  pii.ts  aegis.ts  harmbench.ts ...
│   │   │   └── index.ts            # 플러그인 팩토리 등록
│   │   ├── strategies/             # 변환/우회 전략
│   │   │   └── promptInjections/   # data.ts + dataKo.ts(한국어) + index.ts
│   │   ├── providers/              # 공격/채점 프로바이더 (iterative, crescendo, goat ...)
│   │   ├── constants/              # plugins.ts(REDTEAM_MODEL) / strategies.ts / metadata.ts
│   │   ├── commands/               # CLI: run / generate / init / discover / report
│   │   ├── util.ts                 # 한국어 거부·언어 자동 탐지
│   │   └── remoteGeneration.ts     # 원격 생성 토글(neverGenerateRemote)
│   ├── app/                        # 웹 UI (React 19 / Vite)
│   ├── server/                     # 백엔드 서버 (:15500)
│   ├── providers/  assertions/  commands/  matchers/  codeScan/
│   └── main.ts
├── drizzle/                        # DB 마이그레이션
├── src/app/  ·  code-scan-action/  ·  plugins/
├── package.json  ·  README.md  ·  LICENSE
```
