import { describe, expect, it, vi } from 'vitest';
import logger from '../../../src/logger';
import { addMultilingual } from '../../../src/redteam/strategies/multilingual';

import type { TestCase } from '../../../src/types/index';

vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    level: 'info',
  },
}));

vi.mock('../../../src/redteam/remoteGeneration', async (importOriginal) => ({
  ...(await importOriginal()),
  shouldGenerateRemote: vi.fn(() => false),
}));

describe('multilingual strategy', () => {
  it('should localize deprecation messaging for Korean test cases', async () => {
    const testCases: TestCase[] = [
      {
        vars: {
          prompt: '한국어 테스트',
        },
        metadata: {
          language: 'ko',
          modifiers: {
            language: 'ja',
          },
        },
      },
    ];

    const result = await addMultilingual(testCases, 'prompt', {});

    expect(result).toEqual(testCases);
    expect(logger.debug).toHaveBeenCalledWith(
      '[DEPRECATED] "multilingual" 전략은 deprecated되었습니다. 대신 최상위 "language" 설정을 사용하세요. 참고: https://www.promptfoo.dev/docs/red-team/configuration/#language',
    );
    expect(logger.debug).toHaveBeenCalledWith(
      'Multilingual 전략: 1개 테스트가 이미 언어 지원과 함께 생성되었습니다',
    );
  });
});
