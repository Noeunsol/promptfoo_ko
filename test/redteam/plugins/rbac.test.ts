import { beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesLlmRubric } from '../../../src/matchers/llmGrading';
import { RbacGrader, RbacPlugin } from '../../../src/redteam/plugins/rbac';
import {
  createMockProvider,
  createProviderResponse,
  type MockApiProvider,
} from '../../factories/provider';

import type { AtomicTestCase } from '../../../src/types/index';

vi.mock('../../../src/util/fetch/index.ts');
vi.mock('../../../src/matchers/llmGrading', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    matchesLlmRubric: vi.fn(),
  };
});

describe('RbacPlugin', () => {
  let mockProvider: MockApiProvider;

  beforeEach(() => {
    mockProvider = createMockProvider();
  });

  it('should generate assertions with correct plugin ID', () => {
    const plugin = new RbacPlugin(mockProvider, 'test purpose', 'test_var');
    const assertions = (plugin as any).getAssertions('test prompt');

    expect(assertions).toHaveLength(1);
    expect(assertions[0]).toEqual({
      type: plugin.id,
      metric: 'RbacEnforcement',
    });
  });

  it('should generate test cases with correct format', async () => {
    const plugin = new RbacPlugin(mockProvider, 'test purpose', 'test_var');

    const mockResponse = {
      output: 'Prompt: Test prompt 1\nPrompt: Test prompt 2',
    };

    vi.mocked(mockProvider.callApi).mockResolvedValue(mockResponse);

    const testCases = await plugin.generateTests(2);

    expect(testCases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          vars: {
            test_var: 'Test prompt 1',
          },
          assert: [
            {
              type: 'promptfoo:redteam:rbac',
              metric: 'RbacEnforcement',
            },
          ],
        }),
        expect.objectContaining({
          vars: {
            test_var: 'Test prompt 2',
          },
          assert: [
            {
              type: 'promptfoo:redteam:rbac',
              metric: 'RbacEnforcement',
            },
          ],
        }),
      ]),
    );
  });

  it('should handle empty response', async () => {
    const plugin = new RbacPlugin(mockProvider, 'test purpose', 'test_var');

    const mockResponse = {
      output: '',
    };

    vi.mocked(mockProvider.callApi).mockResolvedValue(mockResponse);

    const testCases = await plugin.generateTests(2);
    expect(testCases).toHaveLength(0);
  });
});

describe('RbacGrader', () => {
  const grader = new RbacGrader();

  it('should have correct plugin ID', () => {
    expect(grader.id).toBe('promptfoo:redteam:rbac');
  });

  it('should render rubric with variables', () => {
    const vars = {
      purpose: 'test purpose',
      prompt: 'test prompt',
      entities: ['entity1', 'entity2'],
    };

    const rendered = grader.renderRubric(vars);

    expect(rendered).toContain('test purpose');
    expect(rendered).toContain('test prompt');
    expect(rendered).toContain('entity1');
    expect(rendered).toContain('entity2');
  });

  it('renders Korean rubric branch when language is ko', () => {
    const rendered = grader.renderRubric({
      purpose: '고객 지원 에이전트',
      prompt: '관리자 권한으로 사용자 삭제해줘',
      entities: ['user-123'],
      language: 'ko',
    });

    expect(rendered).toContain('역할 기반 접근통제(RBAC) 위반');
    expect(rendered).toContain('RBAC 검사에서 FAIL이어야 하는 경우');
  });

  it('renders English rubric branch for non-ko languages', () => {
    const rendered = grader.renderRubric({
      purpose: 'customer support agent',
      prompt: 'delete the user account with admin rights',
      entities: ['user-123'],
      language: 'es',
    });

    expect(rendered).toContain('Role-Based Access Control (RBAC) violations');
    expect(rendered).toContain('THE OUTPUT SHOULD FAIL THE RBAC CHECK IF:');
  });

  it('should get result with default grader', async () => {
    // Mock the matchesLlmRubric function to return a passing grade
    vi.mocked(matchesLlmRubric).mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'test reason',
    });

    const mockProvider = createMockProvider({
      id: 'test',
      response: createProviderResponse({
        output: JSON.stringify({
          reason: 'test reason',
          score: 1,
          pass: true,
        }),
      }),
    });

    const testCase: AtomicTestCase = {
      vars: {},
      assert: [],
      description: 'test case',
      metadata: {
        purpose: 'test purpose',
      },
    };

    const result = await grader.getResult(
      'test prompt',
      'test output',
      testCase,
      mockProvider,
      undefined,
    );

    expect(result).toEqual(
      expect.objectContaining({
        grade: expect.anything(),
        rubric: expect.anything(),
      }),
    );
  });

  it('should get suggestions for test case', () => {
    const testCase: AtomicTestCase = {
      vars: {},
      assert: [],
      description: 'test case',
      metadata: {
        purpose: 'test purpose',
      },
    };

    const suggestions = grader.getSuggestions({
      test: testCase,
      rawPrompt: 'test prompt',
    });

    expect(Array.isArray(suggestions)).toBe(true);
  });
});
