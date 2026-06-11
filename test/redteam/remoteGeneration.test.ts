import { beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { getEnvBool, getEnvString } from '../../src/envars';
import { isLoggedIntoCloud } from '../../src/globalConfig/accounts';
import { readGlobalConfig } from '../../src/globalConfig/globalConfig';
import { hasCodexDefaultCredentials } from '../../src/providers/openai/codexDefaults';
import {
  getRemoteGenerationDisabledError,
  getRemoteGenerationExplicitlyDisabledError,
  getRemoteGenerationUrl,
  getRemoteGenerationUrlForUnaligned,
  getRemoteHealthUrl,
  neverGenerateRemote,
  neverGenerateRemoteForRegularEvals,
  shouldGenerateRemote,
} from '../../src/redteam/remoteGeneration';

vi.mock('../../src/envars');
vi.mock('../../src/globalConfig/accounts');
vi.mock('../../src/globalConfig/globalConfig');
vi.mock('../../src/providers/openai/codexDefaults', () => ({
  hasCodexDefaultCredentials: vi.fn().mockReturnValue(false),
}));
vi.mock('../../src/cliState', () => ({
  default: {
    remote: undefined,
  },
}));

describe('shouldGenerateRemote', () => {
  // remote-off branch: PROMPTFOO_ENABLE_REMOTE_GENERATION is opt-in and unset here
  // (getEnvBool mocked false), so neverGenerateRemote() stays true and
  // shouldGenerateRemote() must return false regardless of cloud login, env vars,
  // local credentials, or cliState.remote.
  beforeEach(() => {
    vi.resetAllMocks();
    cliState.remote = undefined;
    vi.mocked(isLoggedIntoCloud).mockReturnValue(false);
    vi.mocked(hasCodexDefaultCredentials).mockReturnValue(false);
  });

  it('should always return false even when logged into cloud', () => {
    vi.mocked(isLoggedIntoCloud).mockReturnValue(true);
    vi.mocked(getEnvBool).mockReturnValue(false);
    vi.mocked(getEnvString).mockReturnValue('sk-123');
    expect(shouldGenerateRemote()).toBe(false);
  });

  it('should always return false even with no local credentials', () => {
    vi.mocked(getEnvBool).mockReturnValue(false);
    vi.mocked(getEnvString).mockReturnValue('');
    vi.mocked(hasCodexDefaultCredentials).mockReturnValue(false);
    expect(shouldGenerateRemote()).toBe(false);
  });

  it('should always return false even when a custom remote generation URL is set', () => {
    vi.mocked(getEnvBool).mockReturnValue(false);
    vi.mocked(getEnvString).mockImplementation((key) =>
      key === 'PROMPTFOO_REMOTE_GENERATION_URL' ? 'https://remote.example.test/api/v1/task' : '',
    );
    expect(shouldGenerateRemote()).toBe(false);
  });

  it('should always return false even when cliState.remote is true', () => {
    vi.mocked(getEnvBool).mockReturnValue(false);
    vi.mocked(getEnvString).mockReturnValue('sk-123');
    cliState.remote = true;
    expect(shouldGenerateRemote()).toBe(false);
  });

  it('should always return false even for Codex/embedding-backed checks', () => {
    vi.mocked(getEnvBool).mockReturnValue(false);
    vi.mocked(getEnvString).mockReturnValue('');
    vi.mocked(hasCodexDefaultCredentials).mockReturnValue(true);
    expect(
      shouldGenerateRemote({
        canUseCodexDefaultProvider: true,
        requireEmbeddingProvider: true,
      }),
    ).toBe(false);
  });
});

describe('remote generation error helpers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should include the --remote recovery path when remote generation is implicitly disabled', () => {
    expect(getRemoteGenerationDisabledError('jailbreak:hydra strategy')).toBe(
      'jailbreak:hydra strategy requires remote generation, which is currently disabled for this configuration. To enable it, run with --remote, set PROMPTFOO_REMOTE_GENERATION_URL to a self-hosted endpoint, or log into Promptfoo Cloud with `promptfoo auth login`.',
    );
  });

  it('should list only the active disable flag when one flag is set', () => {
    vi.mocked(getEnvBool).mockImplementation(
      (key: string) => key === 'PROMPTFOO_DISABLE_REMOTE_GENERATION',
    );
    expect(getRemoteGenerationExplicitlyDisabledError('Best-of-N strategy')).toBe(
      'Best-of-N strategy requires remote generation, which has been explicitly disabled. To enable it, unset PROMPTFOO_DISABLE_REMOTE_GENERATION. Once re-enabled, you can point at a self-hosted endpoint with PROMPTFOO_REMOTE_GENERATION_URL or use Promptfoo Cloud via `promptfoo auth login`.',
    );
  });

  it('should list only the redteam-specific flag when only that flag is set', () => {
    vi.mocked(getEnvBool).mockImplementation(
      (key: string) => key === 'PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION',
    );
    expect(getRemoteGenerationExplicitlyDisabledError('Best-of-N strategy')).toBe(
      'Best-of-N strategy requires remote generation, which has been explicitly disabled. To enable it, unset PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION. Once re-enabled, you can point at a self-hosted endpoint with PROMPTFOO_REMOTE_GENERATION_URL or use Promptfoo Cloud via `promptfoo auth login`.',
    );
  });

  it('should list both disable flags when both are set', () => {
    vi.mocked(getEnvBool).mockReturnValue(true);
    expect(getRemoteGenerationExplicitlyDisabledError('Best-of-N strategy')).toBe(
      'Best-of-N strategy requires remote generation, which has been explicitly disabled. To enable it, unset PROMPTFOO_DISABLE_REMOTE_GENERATION and PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION. Once re-enabled, you can point at a self-hosted endpoint with PROMPTFOO_REMOTE_GENERATION_URL or use Promptfoo Cloud via `promptfoo auth login`.',
    );
  });

  it('should fall back to a generic "whichever is set" hint when no flag is visible in env', () => {
    vi.mocked(getEnvBool).mockReturnValue(false);
    expect(getRemoteGenerationExplicitlyDisabledError('Best-of-N strategy')).toBe(
      'Best-of-N strategy requires remote generation, which has been explicitly disabled. To enable it, unset PROMPTFOO_DISABLE_REMOTE_GENERATION or PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION (whichever is set). Once re-enabled, you can point at a self-hosted endpoint with PROMPTFOO_REMOTE_GENERATION_URL or use Promptfoo Cloud via `promptfoo auth login`.',
    );
  });
});

// remote-off branch: remote generation is opt-in via
// PROMPTFOO_ENABLE_REMOTE_GENERATION. Build a getEnvBool stub from a flag map.
function mockEnvFlags(flags: Partial<Record<string, boolean>>) {
  vi.mocked(getEnvBool).mockImplementation((key: string) => flags[key] ?? false);
}

describe('neverGenerateRemote', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('stays disabled by default when the opt-in switch is unset', () => {
    mockEnvFlags({});
    expect(neverGenerateRemote()).toBe(true);
  });

  it('enables remote generation when the opt-in switch is set', () => {
    mockEnvFlags({ PROMPTFOO_ENABLE_REMOTE_GENERATION: true });
    expect(neverGenerateRemote()).toBe(false);
  });

  it('honors the general disable flag once enabled', () => {
    mockEnvFlags({
      PROMPTFOO_ENABLE_REMOTE_GENERATION: true,
      PROMPTFOO_DISABLE_REMOTE_GENERATION: true,
    });
    expect(neverGenerateRemote()).toBe(true);
  });

  it('honors the redteam-specific disable flag once enabled', () => {
    mockEnvFlags({
      PROMPTFOO_ENABLE_REMOTE_GENERATION: true,
      PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION: true,
    });
    expect(neverGenerateRemote()).toBe(true);
  });
});

describe('neverGenerateRemoteForRegularEvals', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('stays disabled by default when the opt-in switch is unset', () => {
    mockEnvFlags({});
    expect(neverGenerateRemoteForRegularEvals()).toBe(true);
  });

  it('enables remote generation when the opt-in switch is set', () => {
    mockEnvFlags({ PROMPTFOO_ENABLE_REMOTE_GENERATION: true });
    expect(neverGenerateRemoteForRegularEvals()).toBe(false);
  });

  it('honors the general disable flag once enabled', () => {
    mockEnvFlags({
      PROMPTFOO_ENABLE_REMOTE_GENERATION: true,
      PROMPTFOO_DISABLE_REMOTE_GENERATION: true,
    });
    expect(neverGenerateRemoteForRegularEvals()).toBe(true);
  });

  it('ignores the redteam-specific disable flag for regular evals', () => {
    mockEnvFlags({
      PROMPTFOO_ENABLE_REMOTE_GENERATION: true,
      PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION: true,
    });
    expect(neverGenerateRemoteForRegularEvals()).toBe(false);
  });
});

describe('getRemoteGenerationUrl', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return env URL + /task when PROMPTFOO_REMOTE_GENERATION_URL is set', () => {
    vi.mocked(getEnvString).mockImplementation(function () {
      return 'https://custom.api.com/task';
    });
    expect(getRemoteGenerationUrl()).toBe('https://custom.api.com/task');
  });

  it('should return cloud API host + /task when cloud is enabled and no env URL is set', () => {
    vi.mocked(getEnvString).mockImplementation(function () {
      return '';
    });
    vi.mocked(readGlobalConfig).mockImplementation(function () {
      return {
        id: 'test-id',
        cloud: {
          apiKey: 'some-api-key',
          apiHost: 'https://cloud.api.com',
        },
      };
    });

    expect(getRemoteGenerationUrl()).toBe('https://cloud.api.com/api/v1/task');
  });

  it('should return default URL when cloud is disabled and no env URL is set', () => {
    vi.mocked(getEnvString).mockImplementation(function () {
      return '';
    });
    vi.mocked(readGlobalConfig).mockImplementation(function () {
      return {
        id: 'test-id',
        cloud: {
          apiKey: undefined,
          apiHost: 'https://cloud.api.com',
        },
      };
    });

    expect(getRemoteGenerationUrl()).toBe('https://api.promptfoo.app/api/v1/task');
  });
});

describe('getRemoteHealthUrl', () => {
  // remote-off branch: buildRemoteUrl() short-circuits on neverGenerateRemote(),
  // so the health URL is always null regardless of env/cloud configuration.
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should always return null because remote generation is disabled', () => {
    vi.mocked(getEnvBool).mockReturnValue(false);
    vi.mocked(getEnvString).mockImplementation((key) =>
      key === 'PROMPTFOO_REMOTE_GENERATION_URL' ? 'https://custom.api.com/task' : '',
    );
    vi.mocked(readGlobalConfig).mockReturnValue({
      id: 'test-id',
      cloud: {
        apiKey: 'some-api-key',
        apiHost: 'https://cloud.api.com',
      },
    });
    expect(getRemoteHealthUrl()).toBeNull();
  });
});

describe('getRemoteGenerationUrlForUnaligned', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return env URL when PROMPTFOO_UNALIGNED_INFERENCE_ENDPOINT is set', () => {
    vi.mocked(getEnvString).mockImplementation(function () {
      return 'https://custom.api.com/harmful';
    });
    expect(getRemoteGenerationUrlForUnaligned()).toBe('https://custom.api.com/harmful');
  });

  it('should return cloud API harmful URL when cloud is enabled', () => {
    vi.mocked(getEnvString).mockImplementation(function () {
      return '';
    });
    vi.mocked(readGlobalConfig).mockImplementation(function () {
      return {
        id: 'test-id',
        cloud: {
          apiKey: 'some-api-key',
          apiHost: 'https://cloud.api.com',
        },
      };
    });
    expect(getRemoteGenerationUrlForUnaligned()).toBe('https://cloud.api.com/api/v1/task/harmful');
  });

  it('should return default harmful URL when cloud is disabled', () => {
    vi.mocked(getEnvString).mockImplementation(function () {
      return '';
    });
    vi.mocked(readGlobalConfig).mockImplementation(function () {
      return {
        id: 'test-id',
        cloud: {
          apiKey: undefined,
          apiHost: 'https://cloud.api.com',
        },
      };
    });
    expect(getRemoteGenerationUrlForUnaligned()).toBe(
      'https://api.promptfoo.app/api/v1/task/harmful',
    );
  });
});
