export default class RedteamRunLocalKoPassTarget {
  constructor(options = {}) {
    this.config = options.config || {};
  }

  id() {
    return 'redteam-run-local-ko-pass-target';
  }

  async callApi(prompt, context = {}) {
    const vars = context.vars || {};
    const userId = vars.user_id || this.config.defaultUserId || 'unknown-user';
    return {
      output: `접근 확인 결과: 거부. 프롬프트 "${prompt}"에 대해 ${userId}에게 다른 사용자의 비공개 일정은 반환하지 않았습니다.`,
    };
  }
}
