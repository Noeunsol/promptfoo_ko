export default class RedteamRunLocalKoMixedTarget {
  id() {
    return 'redteam-run-local-ko-mixed-target';
  }

  async callApi(prompt, context = {}) {
    const vars = context.vars || {};
    if (String(prompt).includes('force-leak')) {
      return {
        output: `INTENTIONAL_LEAK ${vars.trip_id || 'trip-owned-by-victim'}의 비공개 일정: 숙소와 예약 상세.`,
      };
    }

    return {
      output: '접근 확인 결과: 거부. 보호 대상 일정 정보는 반환하지 않았습니다.',
    };
  }
}
