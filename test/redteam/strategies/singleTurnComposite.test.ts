import { SingleBar } from 'cli-progress';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { getUserEmail } from '../../../src/globalConfig/accounts';
import logger from '../../../src/logger';
import {
  getRemoteGenerationExplicitlyDisabledError,
  getRemoteGenerationUrl,
  neverGenerateRemote,
} from '../../../src/redteam/remoteGeneration';
import { addCompositeTestCases } from '../../../src/redteam/strategies/singleTurnComposite';

import type { TestCase } from '../../../src/types/index';

vi.mock('cli-progress');
vi.mock('../../../src/cache');
vi.mock('../../../src/globalConfig/accounts');
vi.mock('../../../src/redteam/remoteGeneration');
vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  getLogLevel: vi.fn().mockReturnValue('info'),
}));

describe('singleTurnComposite strategy', () => {
  let mockProgressBar: Mocked<SingleBar>;

  beforeEach(() => {
    vi.resetAllMocks();
    mockProgressBar = {
      start: vi.fn(),
      increment: vi.fn(),
      stop: vi.fn(),
    } as unknown as Mocked<SingleBar>;
    vi.mocked(SingleBar).mockImplementation(function () {
      return mockProgressBar;
    });
    vi.mocked(getUserEmail).mockReturnValue('test@example.com');
    vi.mocked(getRemoteGenerationUrl).mockReturnValue('http://test.com');
    vi.mocked(getRemoteGenerationExplicitlyDisabledError).mockImplementation(
      (strategyName) =>
        `${strategyName} requires remote generation, which has been explicitly disabled.`,
    );
    vi.mocked(neverGenerateRemote).mockReturnValue(false);
  });

  it('should generate composite test cases successfully', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        modifiedPrompts: ['modified prompt 1', 'modified prompt 2'],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const testCases: TestCase[] = [
      {
        vars: {
          prompt: 'test prompt 1',
        },
        assert: [
          {
            type: 'equals',
            value: 'expected',
            metric: 'test-metric',
          },
        ],
      },
    ];

    const result = await addCompositeTestCases(testCases, 'prompt', {});

    expect(result).toHaveLength(2);
    expect(result[0]?.vars?.prompt).toBe('modified prompt 1');
    expect(result[0]?.metadata?.strategyId).toBe('jailbreak:composite');
    expect(result[0]?.assert?.[0].metric).toBe('test-metric/Composite');
  });

  it('should localize errors and warnings for Korean test cases', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        error: 'API 오류',
      },
      cached: false,
      status: 500,
      statusText: 'Error',
    });

    const koreanTestCases: TestCase[] = [
      {
        vars: {
          prompt: '복합 탈옥 테스트',
        },
        metadata: {
          language: 'ko',
        },
      },
    ];

    const result = await addCompositeTestCases(koreanTestCases, 'prompt', {});

    expect(result).toHaveLength(0);
    expect(logger.error).toHaveBeenCalledWith(
      '[jailbreak:composite] Composite 생성 중 오류: API 오류}',
    );
    expect(logger.warn).toHaveBeenCalledWith('생성된 Composite 탈옥 테스트 케이스가 없습니다');
  });

  it('should throw error when remote generation is disabled', async () => {
    vi.mocked(neverGenerateRemote).mockReturnValue(true);

    await expect(addCompositeTestCases([], 'prompt', {})).rejects.toThrow(
      'Composite jailbreak strategy requires remote generation, which has been explicitly disabled.',
    );
  });
});
