import { expect } from 'vitest';

/**
 * Shared quality assertions for Korean-language plugin example sets.
 * Kept in a non-`.test.ts` file so it can be imported without vitest picking
 * up its describe blocks in every importing file.
 */
export function assertKoExampleQuality(
  examples: readonly string[],
  pluginId: string,
  { minCount = 5 }: { minCount?: number } = {},
): void {
  expect(
    examples.length,
    `${pluginId} ko 예시는 최소 ${minCount}개 이상이어야 함`,
  ).toBeGreaterThanOrEqual(minCount);

  for (const ex of examples) {
    expect(/[\uAC00-\uD7AF]/.test(ex), `${pluginId}: 한글 미포함 예시 — ${ex}`).toBe(true);
    // "User query:" is an English scaffold label that must not appear in ko
    // examples (Korean equivalent "사용자 질문:" should be used instead).
    expect(ex.includes('User query:'), `${pluginId}: 영어 스캐폴드 잔재 — ${ex}`).toBe(false);
  }
}
