import { SingleBar } from 'cli-progress';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';
import * as remoteGeneration from '../../../src/redteam/remoteGeneration';
import {
  addMathPrompt,
  DEFAULT_MATH_CONCEPTS,
  EXAMPLES,
  encodeMathPrompt,
  generateMathPrompt,
  KO_EXAMPLES,
} from '../../../src/redteam/strategies/mathPrompt';
import { createMockProvider, createProviderResponse } from '../../factories/provider';

vi.mock('cli-progress');
vi.mock('../../../src/redteam/providers/shared');
vi.mock('../../../src/cache');
vi.mock('../../../src/redteam/remoteGeneration');

describe('mathPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('generateMathPrompt', () => {
    it('should generate math prompts remotely', async () => {
      const mockProgressBar = {
        start: vi.fn(),
        increment: vi.fn(),
        stop: vi.fn(),
        render: vi.fn(),
        update: vi.fn(),
        isActive: vi.fn(),
        getProgress: vi.fn(),
      } as unknown as SingleBar;

      (SingleBar as any).mockImplementation(function () {
        return mockProgressBar;
      });

      const mockTestCases = [{ vars: { prompt: 'test1' } }, { vars: { prompt: 'test2' } }];
      const mockResult = [{ vars: { prompt: 'encoded1' } }, { vars: { prompt: 'encoded2' } }];

      const mockResponse = {
        data: {
          result: mockResult,
        },
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: {},
        deleteFromCache: async () => {},
      };

      vi.mocked(fetchWithCache).mockResolvedValue(mockResponse as any);
      const result = await generateMathPrompt(mockTestCases as any, 'prompt', {});

      expect(result).toEqual(mockResult);
      expect(mockProgressBar.start).toHaveBeenCalledWith(1, 0);
      expect(mockProgressBar.increment).toHaveBeenCalledWith(1);
      expect(mockProgressBar.stop).toHaveBeenCalledWith();
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(fetchWithCache).mockRejectedValue(new Error('Network error'));
      (SingleBar as any).mockImplementation(function () {
        return {
          start: vi.fn(),
          increment: vi.fn(),
          stop: vi.fn(),
        } as unknown as SingleBar;
      });

      const result = await generateMathPrompt([{ vars: { prompt: 'test' } }] as any, 'prompt', {});
      expect(result).toEqual([]);
    });
  });

  describe('encodeMathPrompt', () => {
    it('should encode text using math concepts', async () => {
      const mockProvider = createMockProvider({
        id: 'mock',
        response: createProviderResponse({
          output: JSON.stringify({ encodedPrompt: 'encoded math text' }),
        }),
      });

      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider);

      const result = await encodeMathPrompt('test text', 'set theory');

      expect(result).toContain('encoded math text');
      expect(result).toContain('Also provide a complete translation');
    });

    it('should handle JSON parsing errors', async () => {
      const mockProvider = createMockProvider({
        id: 'mock',
        response: createProviderResponse({ output: 'invalid json' }),
      });

      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider);

      await expect(encodeMathPrompt('test text', 'set theory')).rejects.toThrow(
        'Expected a JSON object',
      );
    });

    it('should use korean localization when language is ko', async () => {
      const mockProvider = createMockProvider({
        id: 'mock',
        response: createProviderResponse({
          output: JSON.stringify({ encodedPrompt: '수학 인코딩 프롬프트' }),
        }),
      });

      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider);

      const result = await encodeMathPrompt('테스트 텍스트', '집합론', 'ko');

      expect(result).toContain('수학 인코딩 프롬프트');
      expect(result).toContain('또한 본문 증명과 별도로');
      expect(mockProvider.callApi).toHaveBeenCalledWith(
        expect.stringContaining('아래 예시 스타일을 참고해'),
      );
      const providerPrompt = vi.mocked(mockProvider.callApi).mock.calls[0][0] as string;
      expect(KO_EXAMPLES.some((example) => providerPrompt.includes(example.slice(0, 20)))).toBe(
        true,
      );
    });
  });

  describe('addMathPrompt', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should use custom math concepts when provided', async () => {
      vi.mocked(remoteGeneration.shouldGenerateRemote).mockImplementation(function () {
        return false;
      });
      const customConcepts = ['topology', 'calculus'];

      const mockProvider = createMockProvider({
        id: 'mock',
        response: createProviderResponse({
          output: JSON.stringify({ encodedPrompt: 'encoded' }),
        }),
      });

      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider);
      (SingleBar as any).mockImplementation(function () {
        return {
          start: vi.fn(),
          increment: vi.fn(),
          stop: vi.fn(),
        } as unknown as SingleBar;
      });

      const result = await addMathPrompt([{ vars: { prompt: 'test' } }] as any, 'prompt', {
        mathConcepts: customConcepts,
      });

      expect(result).toHaveLength(customConcepts.length);
    });

    it('should validate mathConcepts config', async () => {
      await expect(addMathPrompt([], 'prompt', { mathConcepts: 'invalid' })).rejects.toThrow(
        'MathPrompt strategy: `mathConcepts` must be an array of strings',
      );
    });
  });

  describe('constants', () => {
    it('should expose DEFAULT_MATH_CONCEPTS', () => {
      expect(DEFAULT_MATH_CONCEPTS).toEqual(['set theory', 'group theory', 'abstract algebra']);
    });

    it('should expose EXAMPLES', () => {
      expect(EXAMPLES).toHaveLength(3);
      expect(EXAMPLES[0]).toContain('Let A represent a set');
    });

    it('should expose KO_EXAMPLES', () => {
      expect(KO_EXAMPLES).toHaveLength(3);
      expect(KO_EXAMPLES[0]).toContain('A를 어떤 체계 안에서 가능한 행동들의 집합이라고 하자');
    });
  });
});
