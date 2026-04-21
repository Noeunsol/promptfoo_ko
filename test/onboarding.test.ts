import { rm } from 'fs/promises';

import yaml from 'js-yaml';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDummyFiles,
  reportProviderAPIKeyWarnings,
  resolveInitLocale,
} from '../src/onboarding';
import { TestSuiteConfigSchema } from '../src/types/index';

// Create hoisted mocks for inquirer modules
const mockSelect = vi.hoisted(() => vi.fn());
const mockCheckbox = vi.hoisted(() => vi.fn());
const mockConfirm = vi.hoisted(() => vi.fn());
const mockFs = vi.hoisted(() => ({
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('fs', () => ({
  default: mockFs,
  ...mockFs,
}));

vi.mock('fs/promises', () => ({
  mkdtemp: vi.fn(),
  rm: vi.fn(),
}));

vi.mock('glob', () => ({
  globSync: vi.fn(),
}));

vi.mock('better-sqlite3');

vi.mock('@inquirer/select', () => ({
  __esModule: true,
  default: mockSelect,
}));

vi.mock('@inquirer/checkbox', () => ({
  __esModule: true,
  default: mockCheckbox,
}));

vi.mock('@inquirer/confirm', () => ({
  __esModule: true,
  default: mockConfirm,
}));

vi.mock('../src/database', () => ({
  getDb: vi.fn(),
}));

vi.mock('../src/telemetry', () => ({
  default: { record: vi.fn() },
  record: vi.fn(),
}));

vi.mock('../src/util/fetch/index.ts', () => ({
  fetch: vi.fn(),
}));

vi.mock('../src/redteam/commands/init', () => ({
  redteamInit: vi.fn(),
}));

vi.mock('../src/envars', () => ({
  getEnvString: vi.fn(),
  getEnvBool: vi.fn(() => false),
  getEnvInt: vi.fn((_key: string, defaultValue: number) => defaultValue),
}));

describe('reportProviderAPIKeyWarnings', () => {
  const openaiID = 'openai:gpt-4o';
  const anthropicID = 'anthropic:messages:claude-3-5-sonnet-20241022';
  let oldEnv: any = {};
  beforeAll(() => {
    oldEnv = { ...process.env };
  });
  beforeEach(() => {
    process.env.OPENAI_API_KEY = '';
    process.env.ANTHROPIC_API_KEY = '';
  });
  afterAll(() => {
    process.env = { ...oldEnv };
  });
  it('should produce a warning for openai if env key is not set', () => {
    expect(reportProviderAPIKeyWarnings([openaiID])).toEqual(
      expect.arrayContaining([
        expect.stringContaining('OPENAI_API_KEY environment variable is not set'),
      ]),
    );
  });
  it('should produce a warning for anthropic if env key is not set', () => {
    expect(reportProviderAPIKeyWarnings([anthropicID])).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ANTHROPIC_API_KEY environment variable is not set'),
      ]),
    );
  });
  it('should produce multiple warnings for applicable providers if env keys are not set', () => {
    expect(reportProviderAPIKeyWarnings([openaiID, anthropicID])).toEqual(
      expect.arrayContaining([
        expect.stringContaining('OPENAI_API_KEY environment variable is not set'),
        expect.stringContaining('ANTHROPIC_API_KEY environment variable is not set'),
      ]),
    );
  });
  it('should be able to accept an object input so long as it has a valid id field', () => {
    expect(reportProviderAPIKeyWarnings([{ id: openaiID }, anthropicID])).toEqual(
      expect.arrayContaining([
        expect.stringContaining('OPENAI_API_KEY environment variable is not set'),
        expect.stringContaining('ANTHROPIC_API_KEY environment variable is not set'),
      ]),
    );
  });
  it('should produce only warnings for applicable providers if the env keys are not set', () => {
    process.env.OPENAI_API_KEY = '<my-api-key>';
    expect(reportProviderAPIKeyWarnings([openaiID, anthropicID])).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ANTHROPIC_API_KEY environment variable is not set'),
      ]),
    );
  });
  it('should produce Korean warnings when locale is ko', () => {
    expect(reportProviderAPIKeyWarnings([openaiID], 'ko')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('OPENAI_API_KEY 환경 변수가 설정되어 있지 않습니다'),
        expect.stringContaining('다음과 같이 환경 변수를 설정하세요'),
      ]),
    );
  });
});

describe('createDummyFiles', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = '/fake/temp/dir';
    vi.clearAllMocks();
    mockConfirm.mockResolvedValue(true);
    mockFs.existsSync.mockReturnValue(false);
    mockFs.writeFileSync.mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should generate a valid YAML configuration file that matches TestSuiteConfigSchema', async () => {
    await createDummyFiles(tempDir, false);

    const configCall = mockFs.writeFileSync.mock.calls.find((call: any[]) =>
      call[0].toString().endsWith('promptfooconfig.yaml'),
    );
    const readmeCall = mockFs.writeFileSync.mock.calls.find((call: any[]) =>
      call[0].toString().endsWith('README.md'),
    );

    expect(configCall).toBeDefined();
    expect(readmeCall).toBeDefined();

    const configContent = configCall?.[1] as string;
    expect(configContent).toBeDefined();

    const parsedConfig = yaml.load(configContent);
    const validationResult = TestSuiteConfigSchema.safeParse(parsedConfig);

    expect(validationResult.success).toBe(true);

    // Assert that validation was successful and config is defined
    expect(validationResult.data).toBeDefined();

    const config = validationResult.data!;
    expect(config.prompts).toHaveLength(2);
    expect(config.providers).toHaveLength(2);
    expect(config.providers).toContain('openai:gpt-4o-mini');
    expect(config.providers).toContain('openai:gpt-4.1-mini');
  });

  it('should generate Korean template content when locale is ko', async () => {
    await createDummyFiles(tempDir, false, 'ko');

    const configCall = mockFs.writeFileSync.mock.calls.find((call: any[]) =>
      call[0].toString().endsWith('promptfooconfig.yaml'),
    );
    const readmeCall = mockFs.writeFileSync.mock.calls.find((call: any[]) =>
      call[0].toString().endsWith('README.md'),
    );

    const configContent = configCall?.[1] as string;
    const readmeContent = readmeCall?.[1] as string;

    expect(configContent).toContain('# 구성 작성 가이드');
    expect(configContent).toContain('{{topic}}에 대한 트윗을 작성해줘');
    expect(configContent).toContain('"openai:gpt-4o-mini"');
    expect(configContent).toContain('"openai:gpt-4.1-mini"');
    expect(configContent).toMatchSnapshot();

    expect(readmeContent).toContain('## 빠른 시작');
    expect(readmeContent).toContain('프롬프트 및 모델 비교 평가');
    expect(readmeContent).toMatchSnapshot();
  });

  it('should generate valid YAML configuration for RAG setup', async () => {
    mockSelect
      .mockResolvedValueOnce('rag')
      .mockResolvedValueOnce('python')
      .mockResolvedValueOnce('openai:gpt-4o');

    await createDummyFiles(tempDir, true);

    const configCall = mockFs.writeFileSync.mock.calls.find((call: any[]) =>
      call[0].toString().endsWith('promptfooconfig.yaml'),
    );
    const contextCall = mockFs.writeFileSync.mock.calls.find((call: any[]) =>
      call[0].toString().endsWith('context.py'),
    );

    expect(configCall).toBeDefined();
    expect(contextCall).toBeDefined();

    const configContent = configCall?.[1] as string;
    expect(configContent).toBeDefined();

    const parsedConfig = yaml.load(configContent);
    const validationResult = TestSuiteConfigSchema.safeParse(parsedConfig);

    expect(validationResult.success).toBe(true);

    // Assert that validation was successful and config is defined
    expect(validationResult.data).toBeDefined();

    const config = validationResult.data!;
    expect(config.tests).toBeDefined();
    expect(Array.isArray(config.tests)).toBe(true);

    const tests = config.tests as any[];
    expect(tests.length).toBeGreaterThan(0);

    const firstTest = tests[0];
    expect(firstTest).toBeTruthy();
    expect(typeof firstTest).toBe('object');
    expect(firstTest).toHaveProperty('vars');

    const { vars } = firstTest;
    expect(typeof vars).toBe('object');
    expect(vars).toHaveProperty('inquiry');
    expect(vars).toHaveProperty('context');

    expect(mockSelect).toHaveBeenCalledTimes(3);
    expect(mockCheckbox).toHaveBeenCalledTimes(0);
    expect(mockConfirm).toHaveBeenCalledTimes(0);
  });

  it('should show Korean action selection choices when locale is ko', async () => {
    mockSelect.mockResolvedValueOnce('compare').mockResolvedValueOnce('openai:gpt-4o');

    await createDummyFiles(tempDir, true, 'ko');

    expect(mockSelect).toHaveBeenCalled();
    const firstSelectArgs = mockSelect.mock.calls[0]?.[0] as {
      message: string;
      choices: Array<{ name: string; value: string; description: string }>;
    };
    expect(firstSelectArgs.message).toBe('무엇을 해보고 싶나요?');
    expect(firstSelectArgs.choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: '아직 잘 모르겠어요',
          value: 'compare',
        }),
        expect.objectContaining({
          name: '레드팀 보안 평가 실행',
          value: 'redteam',
        }),
      ]),
    );
  });

  it('should show Korean development language choices when locale is ko and action is rag', async () => {
    mockSelect
      .mockResolvedValueOnce('rag')
      .mockResolvedValueOnce('not_sure')
      .mockResolvedValueOnce('openai:gpt-4o');

    await createDummyFiles(tempDir, true, 'ko');

    const secondSelectArgs = mockSelect.mock.calls[1]?.[0] as {
      message: string;
      choices: Array<{ name: string; value: string }>;
    };

    expect(secondSelectArgs.message).toBe('어떤 프로그래밍 언어로 앱을 개발하고 있나요?');
    expect(secondSelectArgs.choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: '아직 잘 모르겠어요',
          value: 'not_sure',
        }),
        expect.objectContaining({
          name: 'JavaScript',
          value: 'javascript',
        }),
      ]),
    );
  });

  it('should show Korean provider choices when locale is ko', async () => {
    mockSelect
      .mockResolvedValueOnce('rag')
      .mockResolvedValueOnce('python')
      .mockResolvedValueOnce('openai:gpt-4o');

    await createDummyFiles(tempDir, true, 'ko');

    const thirdSelectArgs = mockSelect.mock.calls[2]?.[0] as {
      message: string;
      choices: Array<{ name: string; value: unknown; description?: string }>;
    };

    expect(thirdSelectArgs.message).toBe(
      '어떤 모델 제공자(Provider)를 사용하여 테스트를 시작하시겠습니까?',
    );
    expect(thirdSelectArgs.choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: '나중에 선택하기 (기본 설정 사용)',
          description: '설정 파일에서 나중에 직접 모델을 추가할 수 있습니다.',
        }),
        expect.objectContaining({
          name: '로컬 Python 스크립트',
          description: '직접 작성한 Python 코드를 모델 인터페이스로 사용합니다.',
        }),
        expect.objectContaining({
          name: 'HTTP 엔드포인트',
          description: '커스텀 API 서버나 특정 URL로 요청을 보냅니다.',
        }),
      ]),
    );
  });

  it('should prompt for confirmation when files exist', async () => {
    mockFs.existsSync.mockImplementation((path: string) =>
      path.toString().includes('promptfooconfig.yaml'),
    );

    mockConfirm.mockResolvedValueOnce(true);
    mockSelect.mockResolvedValueOnce('compare').mockResolvedValueOnce('openai:gpt-4o');

    await createDummyFiles(tempDir, true);

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('already exist'),
      }),
    );
  });

  it('should show Korean overwrite confirmation when locale is ko', async () => {
    mockFs.existsSync.mockImplementation((path: string) =>
      path.toString().includes('promptfooconfig.yaml'),
    );

    mockConfirm.mockResolvedValueOnce(true);
    mockSelect.mockResolvedValueOnce('compare').mockResolvedValueOnce('openai:gpt-4o');

    await createDummyFiles(tempDir, true, 'ko');

    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('파일이 이미 존재합니다. 덮어쓸까요?'),
      }),
    );
  });
});

describe('resolveInitLocale', () => {
  it('should normalize locale values to en or ko', () => {
    expect(resolveInitLocale(undefined)).toBe('en');
    expect(resolveInitLocale('en')).toBe('en');
    expect(resolveInitLocale('ko')).toBe('ko');
    expect(resolveInitLocale('KO')).toBe('ko');
    expect(resolveInitLocale('ko-KR')).toBe('ko');
    expect(resolveInitLocale('korean')).toBe('ko');
    expect(resolveInitLocale('fr')).toBe('en');
  });
});
