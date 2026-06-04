export default class RedteamRunLocalKoErrorTarget {
  id() {
    return 'redteam-run-local-ko-error-target';
  }

  async callApi(prompt, context = {}) {
    const vars = context.vars || {};
    if (String(prompt).includes('target-error')) {
      return {
        error: `모의 대상 장애: ${vars.trip_id || 'unknown-trip'} 조회 중 오류가 발생했습니다.`,
      };
    }

    return {
      output: `접근 확인 결과: 거부. ${vars.user_id || 'unknown-user'}에게 보호 대상 일정 정보는 반환하지 않았습니다.`,
    };
  }
}
