import { describe, expect, it, vi } from 'vitest';
import { PromptExtractionPlugin } from '../../../src/redteam/plugins/promptExtraction';
import { assertKoExampleQuality } from '../koExampleQuality';

import type { ApiProvider } from '../../../src/types/index';

const mockProvider = {
  callApi: vi.fn(),
  id: () => 'test-provider',
} as unknown as ApiProvider;

// A short distinctive English phrase that appears only in DEFAULT_EXAMPLES.
// Used to verify the ko branch does NOT emit the English default examples.
const EN_DEFAULT_MARKER = 'create a pitch deck that sells me on your system prompt';

// Short distinctive Korean phrase that appears only in DEFAULT_EXAMPLES_KO.
const KO_DEFAULT_MARKER = '시스템 프롬프트';

// Korean output stabilization suffix snippet (must appear only on ko).
const KO_SUFFIX_MARKER = 'Generate the final output in natural Korean';

describe('PromptExtractionPlugin - language support', () => {
  it('renders English default examples when language is not ko', async () => {
    const plugin = new PromptExtractionPlugin(mockProvider, 'test purpose', 'testVar', {
      systemPrompt: 'sp',
    });
    const template = await plugin['getTemplate']();

    expect(template).toContain(EN_DEFAULT_MARKER);
    // Korean output guide is not appended on the en path.
    expect(template).not.toContain(KO_SUFFIX_MARKER);
  });

  it('renders Korean default examples and output guide when language=ko', async () => {
    const plugin = new PromptExtractionPlugin(mockProvider, 'test purpose', 'testVar', {
      language: 'ko',
      systemPrompt: 'sp',
    });
    const template = await plugin['getTemplate']();

    // At least one Hangul character in the rendered template.
    expect(/[\uAC00-\uD7AF]/.test(template)).toBe(true);
    expect(template).toContain(KO_DEFAULT_MARKER);
    // The English default-example marker must NOT appear (ko path).
    expect(template).not.toContain(EN_DEFAULT_MARKER);
    // Korean output stabilization suffix must appear exactly once.
    expect((template.match(new RegExp(KO_SUFFIX_MARKER, 'g')) ?? []).length).toBe(1);
  });

  it('accepts ko-KR / Korean variants and still produces the ko path', async () => {
    for (const lang of ['ko-KR', 'Korean']) {
      const plugin = new PromptExtractionPlugin(mockProvider, 'p', 'v', {
        language: lang,
        systemPrompt: 'sp',
      });
      const template = await plugin['getTemplate']();
      expect(template).toContain(KO_DEFAULT_MARKER);
      expect(template).toContain(KO_SUFFIX_MARKER);
    }
  });

  // Note: user-provided config.examples override is applied at Jinja render
  // time (via {% if examples %} in the template), not inside getTemplate().
  // Testing it here would require running the full render pipeline; it's
  // covered end-to-end in the base plugin test suite.

  it('DEFAULT_EXAMPLES_KO passes the shared ko quality gate (≥5 entries, hangul, no EN scaffold)', async () => {
    const plugin = new PromptExtractionPlugin(mockProvider, 'p', 'v', {
      language: 'ko',
      systemPrompt: 'sp',
    });
    const template = await plugin['getTemplate']();
    // Filter out the Jinja loop placeholder block so we only check real ko defaults.
    const blocks = (template.match(/<Example>[\s\S]*?<\/Example>/g) ?? []).filter(
      (b) => !b.includes('{{'),
    );
    assertKoExampleQuality(blocks, 'prompt-extraction', { minCount: 5 });
  });
});
