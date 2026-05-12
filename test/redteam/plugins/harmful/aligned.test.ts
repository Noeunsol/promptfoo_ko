import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HARM_PLUGINS, UNALIGNED_PROVIDER_HARM_PLUGINS } from '../../../../src/redteam/constants';
import { categoryAliases } from '../../../../src/redteam/constants/metadata';
import { AlignedHarmfulPlugin } from '../../../../src/redteam/plugins/harmful/aligned';
import {
  REDTEAM_MODEL_CATEGORIES,
  REDTEAM_MODEL_CATEGORIES_KO,
} from '../../../../src/redteam/plugins/harmful/constants';
import { createMockProvider, type MockApiProvider } from '../../../factories/provider';

import type { HarmfulCategory } from '../../../../src/redteam/plugins/harmful/constants';

describe('AlignedHarmfulPlugin', () => {
  let mockProvider: MockApiProvider;
  let plugin: AlignedHarmfulPlugin;
  let harmCategory: keyof typeof HARM_PLUGINS;

  beforeEach(() => {
    mockProvider = createMockProvider();

    // Find a harm category that isn't in unaligned providers
    harmCategory = Object.keys(HARM_PLUGINS).find(
      (key) => !(key in UNALIGNED_PROVIDER_HARM_PLUGINS),
    ) as keyof typeof HARM_PLUGINS;

    const harmfulCategory: HarmfulCategory = {
      key: harmCategory as HarmfulCategory['key'],
      prompt: 'test prompt template {{ examples }}',
      examples: 'test examples',
      label: 'Test Label' as HarmfulCategory['label'],
      description: 'Test Description',
    };

    // Mock a valid category in REDTEAM_MODEL_CATEGORIES
    vi.spyOn(REDTEAM_MODEL_CATEGORIES, 'find').mockReturnValue(harmfulCategory);

    plugin = new AlignedHarmfulPlugin(mockProvider, 'test purpose', 'testVar', harmCategory);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create instance with valid parameters', () => {
      expect(plugin).toBeInstanceOf(AlignedHarmfulPlugin);
      expect(mockProvider.id()).toBe('test-provider');
    });

    it('should accept optional config parameter', () => {
      const configPlugin = new AlignedHarmfulPlugin(
        mockProvider,
        'test purpose',
        'testVar',
        harmCategory,
        { examples: ['test example'] },
      );
      expect(configPlugin).toBeInstanceOf(AlignedHarmfulPlugin);
    });
  });

  describe('template handling', () => {
    it('should retrieve correct template for harm category', async () => {
      const template = await plugin['getTemplate']();
      expect(template).toBe('test prompt template {{ examples }}');
    });

    it('should throw when category config is not found', async () => {
      vi.spyOn(REDTEAM_MODEL_CATEGORIES, 'find').mockReturnValue(undefined);
      await expect(plugin['getTemplate']()).rejects.toThrow(
        `Harmful category ${harmCategory} not found`,
      );
    });
  });

  describe('assertion generation', () => {
    it('should generate harmful assertions for given prompt', () => {
      const assertions = plugin['getAssertions']('test prompt');
      const expectedMetric = categoryAliases[harmCategory] || harmCategory;
      expect(assertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            metric: expectedMetric,
          }),
        ]),
      );
    });

    it('should include harm category in assertions', () => {
      const assertions = plugin['getAssertions']('test prompt');
      const expectedMetric = categoryAliases[harmCategory] || harmCategory;
      assertions.forEach((assertion) => {
        expect(assertion).toHaveProperty('metric');
        expect(assertion.metric).toBe(expectedMetric);
      });
    });
  });

  describe('test case generation', () => {
    const mockPrompts = [{ __prompt: 'Test prompt 1' }, { __prompt: 'Test prompt 2' }];

    it('should create properly structured test cases', async () => {
      const testCases = await plugin['promptsToTestCases'](mockPrompts);
      const expectedMetric = categoryAliases[harmCategory] || harmCategory;

      expect(testCases).toHaveLength(2);
      testCases.forEach((testCase) => {
        expect(testCase).toMatchObject({
          vars: {
            testVar: expect.any(String),
          },
          metadata: {
            harmCategory: HARM_PLUGINS[harmCategory],
          },
          assert: expect.arrayContaining([
            expect.objectContaining({
              metric: expectedMetric,
            }),
          ]),
        });
      });
    });

    it('should handle empty prompts array', async () => {
      const testCases = await plugin['promptsToTestCases']([]);
      expect(testCases).toHaveLength(0);
    });
  });

  describe('end-to-end test generation', () => {
    beforeEach(() => {
      vi.spyOn(mockProvider, 'callApi').mockResolvedValue({
        output: 'Prompt: Generated test 1\nPrompt: Generated test 2',
      });
    });

    it('should generate requested number of test cases', async () => {
      const testCases = await plugin.generateTests(2);
      expect(testCases).toHaveLength(2);
      expect(mockProvider.callApi).toHaveBeenCalledTimes(1);
    });

    it('should handle custom examples in config', async () => {
      const customExamples = ['Custom example 1', 'Custom example 2'];
      const configuredPlugin = new AlignedHarmfulPlugin(
        mockProvider,
        'test purpose',
        'testVar',
        harmCategory,
        { examples: customExamples },
      );

      await configuredPlugin.generateTests(1);

      expect(mockProvider.callApi).toHaveBeenCalledWith(
        expect.stringContaining('test prompt template Custom example 1,Custom example 2'),
      );
    });

    it('should handle API errors gracefully', async () => {
      vi.spyOn(mockProvider, 'callApi').mockResolvedValue({
        output: '',
        error: 'API Error',
      });

      const testCases = await plugin.generateTests(1);
      expect(testCases).toHaveLength(0);
    });
  });

  describe('Korean language support', () => {
    beforeEach(() => {
      vi.spyOn(mockProvider, 'callApi').mockResolvedValue({
        output: 'Prompt: 한국어 테스트 1\nPrompt: 한국어 테스트 2',
      });
    });

    it('should use Korean examples when language is ko and category has Korean variant', async () => {
      // Use the real intellectual-property category with Korean examples
      vi.spyOn(REDTEAM_MODEL_CATEGORIES, 'find').mockReturnValue({
        key: 'harmful:intellectual-property',
        prompt: 'test prompt template {{ examples }}',
        examples: 'english fallback examples',
        label: 'Intellectual Property violation',
        description: 'Test Description',
      });

      const koPlugin = new AlignedHarmfulPlugin(
        mockProvider,
        'test purpose',
        'testVar',
        'harmful:intellectual-property',
        { language: 'ko' },
      );

      await koPlugin.generateTests(1);

      // Verify provider received the Korean examples in the rendered prompt
      const callArg = vi.mocked(mockProvider.callApi).mock.calls[0]?.[0];
      const expectedKoExamples = REDTEAM_MODEL_CATEGORIES_KO['harmful:intellectual-property'];
      expect(expectedKoExamples).toBeDefined();
      expect(callArg).toContain(expectedKoExamples!);
      expect(callArg).not.toContain('english fallback examples');
    });

    it('should fall back to English examples when language is ko but category has no Korean variant', async () => {
      // Use a category that does NOT have a Korean variant
      const englishOnlyCategory = Object.keys(HARM_PLUGINS).find(
        (key) => !(key in UNALIGNED_PROVIDER_HARM_PLUGINS) && !(key in REDTEAM_MODEL_CATEGORIES_KO),
      ) as keyof typeof HARM_PLUGINS;

      vi.spyOn(REDTEAM_MODEL_CATEGORIES, 'find').mockReturnValue({
        key: englishOnlyCategory as HarmfulCategory['key'],
        prompt: 'test prompt template {{ examples }}',
        examples: 'english fallback examples',
        label: 'Test Label' as HarmfulCategory['label'],
        description: 'Test Description',
      });

      const koPlugin = new AlignedHarmfulPlugin(
        mockProvider,
        'test purpose',
        'testVar',
        englishOnlyCategory,
        { language: 'ko' },
      );

      await koPlugin.generateTests(1);

      const callArg = vi.mocked(mockProvider.callApi).mock.calls[0]?.[0];
      expect(callArg).toContain('english fallback examples');
    });

    it('should produce different prompts for Korean vs English language config', async () => {
      vi.spyOn(REDTEAM_MODEL_CATEGORIES, 'find').mockReturnValue({
        key: 'harmful:intellectual-property',
        prompt: 'test prompt template {{ examples }}',
        examples: 'english default examples',
        label: 'Intellectual Property violation',
        description: 'Test Description',
      });

      // English run
      const enPlugin = new AlignedHarmfulPlugin(
        mockProvider,
        'test purpose',
        'testVar',
        'harmful:intellectual-property',
      );
      await enPlugin.generateTests(1);
      const enCallArg = vi.mocked(mockProvider.callApi).mock.calls[0]?.[0];

      // Reset mock between runs
      vi.mocked(mockProvider.callApi).mockClear();

      // Korean run
      const koPlugin = new AlignedHarmfulPlugin(
        mockProvider,
        'test purpose',
        'testVar',
        'harmful:intellectual-property',
        { language: 'ko' },
      );
      await koPlugin.generateTests(1);
      const koCallArg = vi.mocked(mockProvider.callApi).mock.calls[0]?.[0];

      // The two prompts must differ - language has materially changed the examples block
      expect(enCallArg).not.toEqual(koCallArg);
      expect(enCallArg).toContain('english default examples');
      expect(koCallArg).toContain(REDTEAM_MODEL_CATEGORIES_KO['harmful:intellectual-property']!);
    });

    it('should respect user-provided examples even when language is ko', async () => {
      vi.spyOn(REDTEAM_MODEL_CATEGORIES, 'find').mockReturnValue({
        key: 'harmful:intellectual-property',
        prompt: 'test prompt template {{ examples }}',
        examples: 'english default examples',
        label: 'Intellectual Property violation',
        description: 'Test Description',
      });

      const koPlugin = new AlignedHarmfulPlugin(
        mockProvider,
        'test purpose',
        'testVar',
        'harmful:intellectual-property',
        { language: 'ko', examples: ['user custom example'] },
      );

      await koPlugin.generateTests(1);

      const callArg = vi.mocked(mockProvider.callApi).mock.calls[0]?.[0];
      expect(callArg).toContain('user custom example');
      const koExamples = REDTEAM_MODEL_CATEGORIES_KO['harmful:intellectual-property'];
      expect(callArg).not.toContain(koExamples!);
    });
  });
});
