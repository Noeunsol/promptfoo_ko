import { getEnvFloat } from '../../envars';

export const ATTACKER_MODEL = 'gpt-4o-mini';

export const ATTACKER_MODEL_SMALL = 'gpt-4o-mini';

export const TEMPERATURE = getEnvFloat('PROMPTFOO_JAILBREAK_TEMPERATURE')
  ? getEnvFloat('PROMPTFOO_JAILBREAK_TEMPERATURE')
  : 0.7;
