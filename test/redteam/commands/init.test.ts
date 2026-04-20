import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { renderRedteamConfig } from '../../../src/redteam/commands/init';
import { type Strategy } from '../../../src/redteam/constants';

import type { RedteamFileConfig } from '../../../src/redteam/types';

describe('renderRedteamConfig', () => {
  it('should generate valid YAML that conforms to RedteamFileConfig', () => {
    const input = {
      purpose: 'Test chatbot security',
      numTests: 5,
      plugins: [{ id: 'rbac', numTests: 2 }],
      strategies: ['prompt-injection'] as Strategy[],
      prompts: ['Hello {{prompt}}'],
      providers: ['openai:gpt-4'],
      descriptions: {
        'math-prompt': 'Basic prompt injection test',
        rbac: 'Basic RBAC test',
      },
    };

    const renderedConfig = renderRedteamConfig(input);
    expect(renderedConfig).toBeDefined();

    const parsedConfig = yaml.load(renderedConfig) as {
      description: string;
      prompts: string[];
      targets: string[];
      redteam: RedteamFileConfig;
    };

    expect(parsedConfig.redteam.purpose).toBe(input.purpose);
    expect(parsedConfig.redteam.numTests).toBe(input.numTests);
    expect(parsedConfig.redteam.plugins).toHaveLength(1);
    expect(parsedConfig.redteam.plugins?.[0]).toMatchObject({
      id: 'rbac',
      numTests: 2,
    });
  });

  it('should handle minimal configuration', () => {
    const input = {
      purpose: 'Basic test',
      numTests: 1,
      plugins: [],
      strategies: [],
      prompts: [],
      providers: [],
      descriptions: {},
    };

    const renderedConfig = renderRedteamConfig(input);
    const parsedConfig = yaml.load(renderedConfig) as {
      redteam: RedteamFileConfig;
    };

    expect(parsedConfig.redteam.purpose).toBe(input.purpose);
    expect(parsedConfig.redteam.numTests).toBe(input.numTests);
    expect(parsedConfig.redteam.plugins || []).toEqual([]);
    expect(parsedConfig.redteam.strategies || []).toEqual([]);
  });

  it('should include all provided plugins and strategies', () => {
    const input = {
      purpose: 'Test all plugins',
      numTests: 3,
      plugins: [
        { id: 'prompt-injection', numTests: 1 },
        { id: 'policy', numTests: 2 },
      ],
      strategies: ['basic', 'jailbreak'] as Strategy[],
      prompts: ['Test {{prompt}}'],
      providers: ['openai:gpt-4'],
      descriptions: {
        'basic-injection': 'Basic test',
        'advanced-injection': 'Advanced test',
      },
    };

    const renderedConfig = renderRedteamConfig(input);
    const parsedConfig = yaml.load(renderedConfig) as {
      redteam: RedteamFileConfig;
    };

    expect(parsedConfig.redteam.plugins).toHaveLength(2);
    expect(parsedConfig.redteam.strategies).toHaveLength(2);
    expect(parsedConfig.redteam.plugins).toEqual(
      expect.arrayContaining([
        { id: 'prompt-injection', numTests: 1 },
        { id: 'policy', numTests: 2 },
      ]),
    );
    expect(parsedConfig.redteam.strategies).toEqual(expect.arrayContaining(['basic', 'jailbreak']));
  });

  it('should handle custom provider configuration', () => {
    const input = {
      purpose: 'Test custom provider',
      numTests: 1,
      plugins: [],
      strategies: [],
      prompts: ['Test'],
      providers: [
        {
          id: 'custom-provider',
          label: 'Custom API',
          config: {
            apiKey: '{{CUSTOM_API_KEY}}',
            baseUrl: 'https://api.custom.com',
          },
        },
      ],
      descriptions: {},
    };

    const renderedConfig = renderRedteamConfig(input);
    const parsedConfig = yaml.load(renderedConfig) as {
      targets: Array<{
        id: string;
        label: string;
        config: Record<string, string>;
      }>;
    };

    expect(parsedConfig.targets).toBeDefined();
    expect(parsedConfig.targets[0]).toMatchObject({
      id: 'custom-provider',
      label: 'Custom API',
      config: {
        apiKey: '{{CUSTOM_API_KEY}}',
        baseUrl: 'https://api.custom.com',
      },
    });
  });

  describe('language-aware rendering', () => {
    const baseInput = {
      purpose: 'Test purpose',
      numTests: 3,
      plugins: [{ id: 'korean:hierarchy', numTests: 1 }],
      strategies: [] as Strategy[],
      prompts: ['Test {{prompt}}'],
      providers: ['openai:gpt-4'],
      descriptions: { 'korean:hierarchy': '' },
    };

    it('defaults to English description and language="en" when language is not provided', () => {
      const rendered = renderRedteamConfig(baseInput);
      const parsed = yaml.load(rendered) as {
        description: string;
        redteam: RedteamFileConfig;
      };
      expect(parsed.description).toBe('My first red team');
      expect((parsed.redteam as any).language).toBe('en');
    });

    it('emits language="ko" and a Korean description when language="ko" is passed', () => {
      const rendered = renderRedteamConfig({ ...baseInput, language: 'ko' });
      const parsed = yaml.load(rendered) as {
        description: string;
        redteam: RedteamFileConfig;
      };
      expect(parsed.description).toBe('나의 첫 레드팀');
      expect((parsed.redteam as any).language).toBe('ko');
    });

    it('normalizes "ko-KR" / "Korean" down to "ko" in the rendered config', () => {
      const koKR = renderRedteamConfig({ ...baseInput, language: 'ko-KR' });
      const parsedKoKR = yaml.load(koKR) as { redteam: RedteamFileConfig };
      expect((parsedKoKR.redteam as any).language).toBe('ko');

      const korean = renderRedteamConfig({ ...baseInput, language: 'Korean' });
      const parsedKorean = yaml.load(korean) as { redteam: RedteamFileConfig };
      expect((parsedKorean.redteam as any).language).toBe('ko');
    });

    it('preserves a user-provided description regardless of language', () => {
      const rendered = renderRedteamConfig({
        ...baseInput,
        language: 'ko',
        description: 'Custom label',
      });
      const parsed = yaml.load(rendered) as { description: string };
      expect(parsed.description).toBe('Custom label');
    });
  });
});
