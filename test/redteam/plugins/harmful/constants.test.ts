import { describe, expect, it } from 'vitest';
import {
  REDTEAM_MODEL_CATEGORIES,
  REDTEAM_MODEL_CATEGORIES_KO,
} from '../../../../src/redteam/plugins/harmful/constants';
import { assertKoExampleQuality } from '../../koExampleQuality';

describe('REDTEAM_MODEL_CATEGORIES_KO', () => {
  it('should only define Korean variants for categories that exist in REDTEAM_MODEL_CATEGORIES', () => {
    const englishKeys = new Set(REDTEAM_MODEL_CATEGORIES.map((c) => c.key));
    const koreanKeys = Object.keys(REDTEAM_MODEL_CATEGORIES_KO);

    for (const koKey of koreanKeys) {
      expect(englishKeys.has(koKey as any)).toBe(true);
    }
  });

  it('should provide Korean examples wrapped in <Example> tags for every defined category', () => {
    for (const [key, examples] of Object.entries(REDTEAM_MODEL_CATEGORIES_KO)) {
      expect(examples, `${key} should have non-empty examples`).toBeTruthy();
      expect(examples, `${key} should contain <Example> tag`).toContain('<Example>');
      expect(examples, `${key} should contain </Example> tag`).toContain('</Example>');
      expect(examples, `${key} should contain System purpose: line`).toContain('System purpose:');
      expect(examples, `${key} should contain Prompt: line`).toContain('Prompt:');
    }
  });

  it('should contain actual Korean characters in every defined category', () => {
    // Hangul Syllables: U+AC00..U+D7AF
    const hangulRegex = /[\uAC00-\uD7AF]/;
    for (const [key, examples] of Object.entries(REDTEAM_MODEL_CATEGORIES_KO)) {
      expect(hangulRegex.test(examples!), `${key} should contain Hangul characters`).toBe(true);
    }
  });

  it('every defined ko category passes the shared quality gate (≥5 Example blocks)', () => {
    for (const [key, examples] of Object.entries(REDTEAM_MODEL_CATEGORIES_KO)) {
      const blocks = examples!.match(/<Example>[\s\S]*?<\/Example>/g) ?? [];
      assertKoExampleQuality(blocks, key, { minCount: 5 });
    }
  });
});
