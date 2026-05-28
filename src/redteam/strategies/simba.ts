import logger from '../../logger';

import type { TestCase, TestCaseWithPlugin } from '../../types/index';

/**
 * @deprecated The Simba strategy has been removed.
 * This function exists only for backwards compatibility with existing configs.
 * It logs a deprecation warning and returns an empty array (no-op).
 */
export async function addSimbaTestCases(
  _testCases: TestCaseWithPlugin[],
  _injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  const language = typeof config['language'] === 'string' ? config['language'] : undefined;
  const warningMessage =
    language === 'ko'
      ? '"simba" 전략은 더 이상 사용되지 않으며 제거되었습니다. 이 전략은 건너뜁니다. 대안으로 "jailbreak:hydra" 사용을 고려하세요.'
      : 'The "simba" strategy has been deprecated and removed. This strategy will be skipped. Consider using "jailbreak:hydra" as an alternative.';
  logger.warn(warningMessage);
  return [];
}
