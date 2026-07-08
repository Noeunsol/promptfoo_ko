import type { ApiHealthStatus } from '@app/hooks/useApiHealth';

export const REMOTE_GENERATION_DISABLED_TITLE = 'Remote Generation Disabled';
export const REMOTE_GENERATION_REQUIRED_LABEL = 'Remote generation required';

const REMOTE_GENERATION_ENABLE_INSTRUCTION =
  'Set PROMPTFOO_ENABLE_REMOTE_GENERATION=true to enable.';

export function isRemoteGenerationDisabledStatus(status: ApiHealthStatus): boolean {
  return status === 'disabled';
}

export function getRemoteGenerationRequiredMessage(kind: 'plugin' | 'strategy'): string {
  return `This ${kind} requires remote generation. ${REMOTE_GENERATION_ENABLE_INSTRUCTION}`;
}

export function getRemoteGenerationRequiredToastMessage(kind: 'plugin' | 'strategy'): string {
  return `This ${kind} requires remote generation to be enabled. ${REMOTE_GENERATION_ENABLE_INSTRUCTION}`;
}

export function getRemoteGenerationDisabledBannerDescription(
  kind: 'plugins' | 'strategies',
): string {
  if (kind === 'plugins') {
    return `Some plugins require remote generation and are currently unavailable. These plugins include harmful content tests, bias tests, and other advanced security checks. ${REMOTE_GENERATION_ENABLE_INSTRUCTION}`;
  }

  return `Some strategies require remote generation and are currently unavailable. These strategies include GOAT, GCG, audio, and other advanced attack techniques. ${REMOTE_GENERATION_ENABLE_INSTRUCTION}`;
}
