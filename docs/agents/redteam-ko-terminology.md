# Redteam Korean Terminology

기준 목적:

- `src/redteam/`, `test/redteam/`, `site/docs/red-team/`에서 한국어 분기를 추가할 때 용어와 어투를 일관되게 유지한다.
- 코드 식별자와 설정 키는 영어 원형을 유지하고, 사용자에게 노출되는 문구만 한국어로 통일한다.

## 진행 방식

1. 기준 용어를 먼저 고정한다.
2. `rg`로 기존 문자열을 스캔해 같은 개념을 여러 표현으로 옮긴 곳을 찾는다.
3. 런타임 문구, 테스트 기대값, 문서 표기를 기준 용어로 맞춘다.
4. 새 번역을 추가할 때는 이 문서를 먼저 확인한다.

## 기준 용어

| English concept      | Preferred Korean | Notes                                                         |
| -------------------- | ---------------- | ------------------------------------------------------------- |
| red team             | 레드팀           | 고유 기능명으로 유지                                          |
| plugin               | 플러그인         | 설정 키 `plugins`는 유지                                      |
| strategy             | 전략             | 설정 키 `strategies`는 유지                                   |
| provider             | 프로바이더       | `target provider`, `grader provider`처럼 코드 개념일 때 사용  |
| target               | 대상 시스템      | 코드 식별자 `target`은 유지, 사용자 문구는 `대상 시스템` 우선 |
| grader / grading     | 채점 / 채점기    | 과정은 `채점`, 결정 로직은 `채점기`                           |
| judge                | 평가자           | 이미지/비교 프롬프트 안의 심사자 역할에 사용                  |
| probe                | 프로브           | 레드팀 입력 단위                                              |
| prompt               | 프롬프트         | 일반 번역 없이 유지                                           |
| jailbreak            | 탈옥             | 전략 ID `jailbreak`는 유지, 설명 문구는 `탈옥` 사용           |
| guardrail            | 가드레일         | `안전장치`와 혼용하지 말고 기본은 `가드레일`                  |
| goal / objective     | 목표             | 한 문서 안에서 `목표`로 통일                                  |
| attack surface       | 공격 표면        | 입력 변수 설명에 사용                                         |
| input variables      | 입력 변수        | `injectVar`는 코드 명칭 유지                                  |
| remote generation    | 원격 생성        | 로컬 실행 대비 개념으로 유지                                  |
| conversation history | 대화 이력        | multi-turn 문맥에서 사용                                      |
| session              | 세션             | `sessionId`는 코드 명칭 유지                                  |
| backtrack            | 백트래킹         | `되돌아가기` 대신 기술 용어 유지                              |
| fail-closed          | 실패 시 차단     | 필요 시 `실패 시 차단(fail-closed)` 병기                      |

## 표기 원칙

- 전략/플러그인 ID 자체는 번역하지 않는다. 예: `jailbreak:meta`, `policy`, `rbac`
- 사용자 노출 문구에서 기능명을 함께 써야 하면 `` `policy` 플러그인 ``, `` `jailbreak:meta` 전략 ``처럼 코드명과 한국어 일반명을 함께 쓴다.
- 진행률 문구는 `생성`, `채점`, `실행`처럼 동작을 앞에 두고, 필요할 때만 기능명을 뒤에 붙인다.
- 오류 문구는 가능한 한 원인과 결과를 함께 적는다. 예: `원격 생성이 비활성화되어 이 전략을 실행할 수 없습니다.`
- `평가`는 폭넓은 분석 맥락에서만 쓰고, pass/fail 또는 score를 매기는 동작은 `채점`으로 통일한다.
