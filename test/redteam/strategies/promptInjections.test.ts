import { beforeEach, describe, expect, it, vi } from 'vitest';
import data from '../../../src/redteam/strategies/promptInjections/data';
import dataKo from '../../../src/redteam/strategies/promptInjections/dataKo';
import { addInjections } from '../../../src/redteam/strategies/promptInjections/index';

import type { TestCase } from '../../../src/types/index';

describe('addInjections', () => {
  it('should keep korean template array length aligned with english source', () => {
    expect(dataKo).toHaveLength(data.length);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('should add prompt injections and store originalText', async () => {
    const testCases: TestCase[] = [
      {
        vars: { prompt: 'Tell me a joke' },
        metadata: { pluginId: 'harmful:test' },
        assert: [{ type: 'promptfoo:redteam:harmful', metric: 'test' }],
      },
    ];

    const result = await addInjections(testCases, 'prompt', {});

    expect(result).toHaveLength(1);
    // Check that the prompt was modified (it should be different from original)
    expect(result[0].vars?.prompt).toBeDefined();
    expect(result[0].vars?.prompt).not.toBe('Tell me a joke'); // Should be modified
    // Check that metadata stores the original text correctly
    expect(result[0].metadata).toMatchObject({
      pluginId: 'harmful:test',
      strategyId: 'jailbreak-templates',
      originalText: 'Tell me a joke',
    });
    expect(result[0].assert?.[0].metric).toBe('Harmful/Injection');
  });

  it('should handle multiple samples', async () => {
    const testCases: TestCase[] = [
      {
        vars: { prompt: 'Hello world' },
        metadata: {},
      },
    ];

    const result = await addInjections(testCases, 'prompt', { sample: 3 });

    expect(result).toHaveLength(3);
    result.forEach((testCase) => {
      expect(testCase.metadata?.originalText).toBe('Hello world');
      expect(testCase.metadata?.strategyId).toBe('jailbreak-templates');
      // The injection might modify the prompt in various ways
      expect(testCase.vars?.prompt).toBeDefined();
      expect(testCase.vars?.prompt).not.toBe('Hello world'); // Should be modified
    });
  });

  it('should preserve an explicit sample size of 0', async () => {
    const testCases: TestCase[] = [
      {
        vars: { prompt: 'Hello world' },
        metadata: {},
      },
    ];

    const result = await addInjections(testCases, 'prompt', { sample: 0 });

    expect(result).toEqual([]);
  });

  it('should filter harmful only when configured', async () => {
    const testCases: TestCase[] = [
      {
        vars: { prompt: 'Harmful content' },
        metadata: { pluginId: 'harmful:test' },
      },
      {
        vars: { prompt: 'Safe content' },
        metadata: { pluginId: 'safe:test' },
      },
    ];

    const result = await addInjections(testCases, 'prompt', { harmfulOnly: true });

    expect(result).toHaveLength(1);
    expect(result[0].metadata?.originalText).toBe('Harmful content');
  });

  it('should handle test cases without metadata', async () => {
    const testCases: TestCase[] = [
      {
        vars: { prompt: 'Test content' },
      },
    ];

    const result = await addInjections(testCases, 'prompt', {});

    expect(result).toHaveLength(1);
    expect(result[0].metadata?.originalText).toBe('Test content');
    expect(result[0].metadata?.strategyId).toBe('jailbreak-templates');
  });

  it('should use korean injection templates when language is ko', async () => {
    const testCases: TestCase[] = [
      {
        vars: { prompt: '농담 하나 해줘' },
        metadata: { language: 'ko' },
      },
    ];

    const result = await addInjections(testCases, 'prompt', {});

    expect(result).toHaveLength(1);
    expect(result[0].vars?.prompt).toMatch(/윤리|안전|교육/);
    expect(result[0].vars?.prompt).toContain('농담 하나 해줘');
    expect(result[0].metadata?.strategyId).toBe('jailbreak-templates');
  });
});
