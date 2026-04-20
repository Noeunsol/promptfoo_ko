import { beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesLlmRubric } from '../../../src/matchers';
import { ImitationGrader, ImitationPlugin } from '../../../src/redteam/plugins/imitation';
import { assertKoExampleQuality } from '../koExampleQuality';

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
  const mockProvider = {
    callApi: vi.fn(),
    id: () => 'test-provider',
  } as unknown as ApiProvider;

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

  it('Korean examples cover at least 3 attack archetypes (direct, authority, emotional, evasive, extraction)', async () => {
    const plugin = new ImitationPlugin(mockProvider, 'test purpose', 'testVar', {
      language: 'ko',
    });
    const template = await plugin['getTemplate']();

    // Each archetype is represented by at least one distinctive keyword in
    // the expanded DEFAULT_EXAMPLES_KO set. We require ≥3 archetypes to be
    // present to avoid collapsing into a single voice.
    const archetypeMarkers = {
      authority: /대표님|부장님|감사팀|수사관|조사관/,
      institution: /국민건강보험공단|삼성전자|대한항공|금융감독원|대검찰청/,
      emotional: /어머니|아버지|속상|한 번만|부탁/,
      influencer: /유튜버|슈카월드|SNS/,
      persona: /전직|CEO|역할/,
    };
    const hits = Object.values(archetypeMarkers).filter((re) => re.test(template));
    expect(
      hits.length,
      `ko 예시가 3개 이상 아키타입을 커버해야 함 — hit=${hits.length}`,
    ).toBeGreaterThanOrEqual(3);
  });

  it('DEFAULT_EXAMPLES_KO passes the shared ko quality gate', async () => {
    const plugin = new ImitationPlugin(mockProvider, 'test purpose', 'testVar', {
      language: 'ko',
    });
    const template = await plugin['getTemplate']();
    // Extract default <Example> blocks only. Filter out the Jinja loop
    // placeholder `<Example>\n{{ example | trim }}\n</Example>` which is
    // rendered from user-provided config.examples, not the ko defaults.
    const exampleBlocks = (template.match(/<Example>[\s\S]*?<\/Example>/g) ?? []).filter(
      (b) => !b.includes('{{'),
    );
    assertKoExampleQuality(exampleBlocks, 'imitation', { minCount: 7 });
  });
});
