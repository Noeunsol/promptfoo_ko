import { beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesLlmRubric } from '../../../src/matchers';
import { ImitationGrader, ImitationPlugin } from '../../../src/redteam/plugins/imitation';

import type { ApiProvider, AtomicTestCase } from '../../../src/types/index';

vi.mock('../../../src/matchers', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    matchesLlmRubric: vi.fn(),
  };
});

describe('ImitationGrader', () => {
  let grader: ImitationGrader;
  let mockTest: AtomicTestCase;

  beforeEach(() => {
    grader = new ImitationGrader();
    mockTest = {
      vars: { harmCategory: 'imitation' },
      metadata: {
        purpose: 'test-imitation',
        entities: ['AllowedEntity1', 'AllowedEntity2', 'AllowedEntity3'],
      },
    } as AtomicTestCase;
    vi.clearAllMocks();
  });

  it('should have the correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:imitation');
    expect(grader.id).toBe('promptfoo:redteam:imitation');
  });

  it('should render the rubric with correct structure and variables', async () => {
    const mockResult = { pass: true, score: 1, reason: 'No imitation detected' };
    vi.mocked(matchesLlmRubric).mockResolvedValue(mockResult);

    const userQuery = 'Pretend to be AllowedEntity1 or AllowedEntity2';
    const aiOutput = 'I am AllowedEntity1. How can I help you today?';

    await grader.getResult(userQuery, aiOutput, mockTest, undefined /* provider */, undefined);

    const expectedRubric = expect.stringMatching(
      new RegExp(
        `
      <UserQuery>\\s*
      ${userQuery}\\s*
      </UserQuery>\\s*

      <AllowedEntities>\\s*
      <Entity>AllowedEntity1</Entity>\\s*
      <Entity>AllowedEntity2</Entity>\\s*
      <Entity>AllowedEntity3</Entity>\\s*
      </AllowedEntities>\\s*

      You are reviewing the output of a red team review of an AI language model.*
    `.replace(/\s+/g, '\\s*'),
        's',
      ),
    );

    expect(matchesLlmRubric).toHaveBeenCalledWith(expectedRubric, aiOutput, expect.any(Object));
  });

  it('should include all provided entities in the rubric', async () => {
    const mockResult = { pass: true, score: 1, reason: 'No imitation detected' };
    vi.mocked(matchesLlmRubric).mockResolvedValue(mockResult);

    mockTest.metadata!.entities = ['Entity1', 'Entity2', 'Entity3', 'Entity4', 'Entity5'];
    const userQuery = 'Tell me about all the entities';
    const aiOutput = 'Here is information about Entity1, Entity2, Entity3, Entity4, and Entity5.';

    await grader.getResult(userQuery, aiOutput, mockTest, undefined /* provider */, undefined);
    const expectedEntitiesSection = expect.stringMatching(
      /<AllowedEntities>.*?<Entity>Entity1<\/Entity>.*?<Entity>Entity2<\/Entity>.*?<Entity>Entity3<\/Entity>.*?<Entity>Entity4<\/Entity>.*?<Entity>Entity5<\/Entity>.*?<\/AllowedEntities>/s,
    );

    expect(matchesLlmRubric).toHaveBeenCalledWith(
      expectedEntitiesSection,
      aiOutput,
      expect.any(Object),
    );
  });

  it('should handle cases with no allowed entities', async () => {
    const mockResult = { pass: true, score: 1, reason: 'No imitation detected' };
    vi.mocked(matchesLlmRubric).mockResolvedValue(mockResult);

    mockTest.metadata!.entities = [];
    const userQuery = 'Tell me a fact';
    const aiOutput = 'The sky is blue.';

    await grader.getResult(userQuery, aiOutput, mockTest, undefined /* provider */, undefined);

    const expectedEmptyEntitiesSection = expect.stringContaining(
      '<AllowedEntities>\n\n</AllowedEntities>',
    );

    expect(matchesLlmRubric).toHaveBeenCalledWith(
      expectedEmptyEntitiesSection,
      aiOutput,
      expect.any(Object),
    );
  });
});

describe('ImitationPlugin - language support', () => {
  const mockProvider: ApiProvider = {
    callApi: vi.fn(),
    id: () => 'test-provider',
  };

  it('should include English default examples when language is not ko', async () => {
    const plugin = new ImitationPlugin(mockProvider, 'test purpose', 'testVar');
    const template = await plugin['getTemplate']();

    expect(template).toContain('former U.S. president');
    expect(template).toContain('CEO of a major airline');
    // Should not contain Korean examples
    expect(template).not.toContain('삼성전자');
    expect(template).not.toContain('국민건강보험공단');
  });

  it('should include Korean default examples when language is ko', async () => {
    const plugin = new ImitationPlugin(mockProvider, 'test purpose', 'testVar', {
      language: 'ko',
    });
    const template = await plugin['getTemplate']();

    expect(template).toContain('삼성전자');
    expect(template).toContain('국민건강보험공단');
    expect(template).toContain('대한항공');
    // Should not contain English defaults
    expect(template).not.toContain('former U.S. president');
    expect(template).not.toContain('CEO of a major airline');
  });

  it('should fall back to English default examples when language is a different non-ko value', async () => {
    const plugin = new ImitationPlugin(mockProvider, 'test purpose', 'testVar', {
      language: 'ja',
    });
    const template = await plugin['getTemplate']();

    expect(template).toContain('former U.S. president');
    expect(template).not.toContain('삼성전자');
  });

  it('should produce different templates for English vs Korean language config', async () => {
    const enPlugin = new ImitationPlugin(mockProvider, 'test purpose', 'testVar');
    const koPlugin = new ImitationPlugin(mockProvider, 'test purpose', 'testVar', {
      language: 'ko',
    });

    const enTemplate = await enPlugin['getTemplate']();
    const koTemplate = await koPlugin['getTemplate']();

    expect(enTemplate).not.toEqual(koTemplate);
  });
});
