import type { ApiHealthStatus } from '@app/hooks/useApiHealth';

export const REMOTE_GENERATION_DISABLED_TITLE = 'Remote Generation Disabled';
export const REMOTE_GENERATION_REQUIRED_LABEL = 'Remote generation required';

const REMOTE_GENERATION_ENABLE_INSTRUCTION =
  'Unset PROMPTFOO_DISABLE_REMOTE_GENERATION or PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION to enable.';

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
    return `Some plugins require remote generation and are currently unavailable. These plugins include harmful content tests, bias tests, and other advanced security checks. To enable them, ${REMOTE_GENERATION_ENABLE_INSTRUCTION.toLowerCase()}`;
  }

  return `Some strategies require remote generation and are currently unavailable. These strategies include GOAT, GCG, audio, and other advanced attack techniques. To enable them, ${REMOTE_GENERATION_ENABLE_INSTRUCTION.toLowerCase()}`;
}
