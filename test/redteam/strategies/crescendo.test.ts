import { describe, expect, it } from 'vitest';
import {
  CRESCENDO_SYSTEM_PROMPT,
  EVAL_SYSTEM_PROMPT,
  REFUSAL_SYSTEM_PROMPT,
} from '../../../src/redteam/providers/crescendo/prompts';
import { addCrescendo } from '../../../src/redteam/strategies/crescendo';
import { getNunjucksEngine } from '../../../src/util/templates';

import type { TestCase } from '../../../src/types/index';

describe('addCrescendo', () => {
  it('should add crescendo configuration to test cases', () => {
    const testCases: TestCase[] = [
      {
        description: 'Test case 1',
        vars: { input: 'test input' },
        assert: [
          {
            type: 'contains',
            metric: 'exactMatch',
            value: 'expected output',
          },
        ],
      },
    ];

    const injectVar = 'input';
    const config = { someConfig: 'value' };

    const result = addCrescendo(testCases, injectVar, config);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      description: 'Test case 1',
      vars: { input: 'test input' },
      provider: {
        id: 'promptfoo:redteam:crescendo',
        config: {
          injectVar: 'input',
          someConfig: 'value',
        },
      },
      metadata: {
        strategyId: 'crescendo',
        originalText: 'test input',
      },
      assert: [
        {
          type: 'contains',
          metric: 'exactMatch/Crescendo',
          value: 'expected output',
        },
      ],
    });
  });

  it('should handle test cases without assertions', () => {
    const testCases: TestCase[] = [
      {
        description: 'Test case without assertions',
        vars: { input: 'test input' },
      },
    ];

    const result = addCrescendo(testCases, 'input', {});

    expect(result).toHaveLength(1);
    expect(result[0].assert).toBeUndefined();
    expect(result[0].provider).toEqual({
      id: 'promptfoo:redteam:crescendo',
      config: {
        injectVar: 'input',
      },
    });
    expect(result[0].metadata).toEqual({
      strategyId: 'crescendo',
      originalText: 'test input',
    });
  });

  it('should handle empty test cases array', () => {
    const result = addCrescendo([], 'inject', {});
    expect(result).toEqual([]);
  });

  it('should preserve other test case properties', () => {
    const testCases: TestCase[] = [
      {
        description: 'Test case',
        vars: { input: 'test' },
        provider: { id: 'original-provider' },
        assert: [{ type: 'contains', metric: 'test', value: 'value' }],
        otherProp: 'should be preserved',
      } as TestCase & { otherProp: string },
    ];

    const result = addCrescendo(testCases, 'input', {});

    expect(result[0]).toMatchObject({
      description: 'Test case',
      vars: { input: 'test' },
      otherProp: 'should be preserved',
      provider: {
        id: 'promptfoo:redteam:crescendo',
        config: {
          injectVar: 'input',
        },
      },
      metadata: {
        strategyId: 'crescendo',
        originalText: 'test',
      },
    });
  });

  describe('Rubric Storage (Provider Level)', () => {
    it('should store rendered rubric in storedGraderResult.assertion.value', () => {
      // Test the pattern used in crescendo provider for storing rubric
      const mockRenderedRubric = '<rubric>Rendered grading criteria</rubric>';
      const mockGraderResult: {
        pass: boolean;
        score: number;
        reason: string;
        assertion?: any;
      } = {
        pass: false,
        score: 0,
        reason: 'Jailbreak detected',
      };

      const testAssertion = {
        type: 'promptfoo:redteam:policy' as const,
        metric: 'PolicyViolation:test/Crescendo',
      };

      // Simulate the pattern used in crescendo provider
      const storedResult = {
        ...mockGraderResult,
        assertion: mockGraderResult.assertion
          ? { ...mockGraderResult.assertion, value: mockRenderedRubric }
          : testAssertion && 'type' in testAssertion && (testAssertion as any).type !== 'assert-set'
            ? { ...testAssertion, value: mockRenderedRubric }
            : undefined,
      };

      expect(storedResult.assertion).toBeDefined();
      expect(storedResult.assertion?.value).toBe(mockRenderedRubric);
      expect(storedResult.assertion?.type).toBe('promptfoo:redteam:policy');
      expect(storedResult.assertion?.metric).toBe('PolicyViolation:test/Crescendo');
    });

    it('should use grade.assertion when present', () => {
      const mockRenderedRubric = '<rubric>Test rubric</rubric>';
      const mockGraderResultWithAssertion = {
        pass: false,
        score: 0,
        reason: 'Failed',
        assertion: {
          type: 'promptfoo:redteam:harmful' as const,
          metric: 'Harmful/Crescendo',
          value: 'old value',
        },
      };

      const storedResult = {
        ...mockGraderResultWithAssertion,
        assertion: mockGraderResultWithAssertion.assertion
          ? { ...mockGraderResultWithAssertion.assertion, value: mockRenderedRubric }
          : undefined,
      };

      expect(storedResult.assertion?.value).toBe(mockRenderedRubric);
      expect(storedResult.assertion?.type).toBe('promptfoo:redteam:harmful');
      expect(storedResult.assertion?.metric).toBe('Harmful/Crescendo');
    });

    it('should not create assertion for AssertionSet', () => {
      const mockRenderedRubric = '<rubric>Test rubric</rubric>';
      const mockGraderResult = {
        pass: false,
        score: 0,
        reason: 'Failed',
      };

      const assertionSet = {
        type: 'assert-set' as const,
        assert: [{ type: 'contains' as const, value: 'test' }],
      };

      const storedResult = {
        ...mockGraderResult,
        assertion:
          assertionSet && 'type' in assertionSet && assertionSet.type !== 'assert-set'
            ? { ...assertionSet, value: mockRenderedRubric }
            : undefined,
      };

      expect(storedResult.assertion).toBeUndefined();
      expect(storedResult.pass).toBe(false);
    });
  });
});

describe('Crescendo provider prompts — language branching', () => {
  const nunjucks = getNunjucksEngine();
  const baseCrescendoVars = {
    conversationObjective: 'test conversation goal',
    currentRound: 1,
    maxTurns: 5,
    successFlag: 0,
    purpose: 'a friendly assistant',
    inputs: '',
  };
  const baseScoringVars = { conversationObjective: 'test goal' };

  describe('CRESCENDO_SYSTEM_PROMPT', () => {
    it('renders Korean body when language=ko', () => {
      const rendered = nunjucks.renderString(CRESCENDO_SYSTEM_PROMPT, {
        ...baseCrescendoVars,
        language: 'ko',
      });
      expect(rendered).toMatch(/[가-힣]/);
      expect(rendered).toContain('AI 안전성 연구자');
      expect(rendered).not.toContain('You are a proficient AI safety researcher');
    });

    it('renders English body when language=en', () => {
      const rendered = nunjucks.renderString(CRESCENDO_SYSTEM_PROMPT, {
        ...baseCrescendoVars,
        language: 'en',
      });
      expect(rendered).toContain('You are a proficient AI safety researcher');
      expect(rendered).not.toContain('AI 안전성 연구자');
    });

    it('renders English body when language is undefined (no regression)', () => {
      const rendered = nunjucks.renderString(CRESCENDO_SYSTEM_PROMPT, baseCrescendoVars);
      expect(rendered).toContain('You are a proficient AI safety researcher');
      expect(rendered).not.toContain('AI 안전성 연구자');
    });

    it('preserves Nunjucks variable interpolation in both branches', () => {
      const ko = nunjucks.renderString(CRESCENDO_SYSTEM_PROMPT, {
        ...baseCrescendoVars,
        language: 'ko',
      });
      const en = nunjucks.renderString(CRESCENDO_SYSTEM_PROMPT, {
        ...baseCrescendoVars,
        language: 'en',
      });
      expect(ko).toContain('test conversation goal');
      expect(en).toContain('test conversation goal');
    });
  });

  describe('REFUSAL_SYSTEM_PROMPT', () => {
    it('renders Korean body when language=ko', () => {
      const rendered = nunjucks.renderString(REFUSAL_SYSTEM_PROMPT, {
        ...baseScoringVars,
        language: 'ko',
      });
      expect(rendered).toMatch(/[가-힣]/);
      expect(rendered).toContain('평가자');
      expect(rendered).not.toContain('You are an evaluator with a focus on assessing');
    });

    it('renders English body when language=en or undefined', () => {
      const en = nunjucks.renderString(REFUSAL_SYSTEM_PROMPT, {
        ...baseScoringVars,
        language: 'en',
      });
      const noLang = nunjucks.renderString(REFUSAL_SYSTEM_PROMPT, baseScoringVars);
      expect(en).toContain('You are an evaluator with a focus on assessing');
      expect(noLang).toContain('You are an evaluator with a focus on assessing');
    });
  });

  describe('EVAL_SYSTEM_PROMPT', () => {
    it('renders Korean body when language=ko', () => {
      const rendered = nunjucks.renderString(EVAL_SYSTEM_PROMPT, {
        ...baseScoringVars,
        language: 'ko',
      });
      expect(rendered).toMatch(/[가-힣]/);
      expect(rendered).toContain('레드팀 엔지니어');
      expect(rendered).not.toContain('You are a proficient red teaming engineer');
    });

    it('renders English body when language=en or undefined', () => {
      const en = nunjucks.renderString(EVAL_SYSTEM_PROMPT, {
        ...baseScoringVars,
        language: 'en',
      });
      const noLang = nunjucks.renderString(EVAL_SYSTEM_PROMPT, baseScoringVars);
      expect(en).toContain('You are a proficient red teaming engineer');
      expect(noLang).toContain('You are a proficient red teaming engineer');
    });
  });
});
