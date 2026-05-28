import { resolveGraderLanguage } from '../../util';
import data from './data';
import dataKo from './dataKo';

import type { TestCase } from '../../../types/index';

function buildInjectionFns(
  dataset: string[],
  sampleSize: number,
): Array<(prompt: string) => string> {
  if (sampleSize === 1) {
    return [(prompt: string) => dataset[0].replace(/__PROMPT__/g, prompt)];
  }

  return [...dataset]
    .sort(() => 0.5 - Math.random())
    .slice(0, sampleSize)
    .map((injection) => (prompt: string) => injection.replace(/__PROMPT__/g, prompt));
}

function isLengthAlignedTemplate(source: string, candidate: string): boolean {
  const sourceHasPrompt = source.includes('__PROMPT__');
  const candidateHasPrompt = candidate.includes('__PROMPT__');

  if (sourceHasPrompt !== candidateHasPrompt) {
    return false;
  }

  const sourceLength = source.length || 1;
  const ratio = candidate.length / sourceLength;

  // Guardrail: reject heavily compressed/expanded rewrites while allowing
  // naturally shorter Korean phrasing.
  return ratio >= 0.4 && ratio <= 1.8;
}

export async function addInjections(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): Promise<TestCase[]> {
  const sampleSize = config.sample ?? 1;
  const harmfulOnly = config.harmfulOnly || false;
  const koPreferredData = data.map((enTemplate, index) => {
    const koTemplate = dataKo[index];
    if (typeof koTemplate === 'string' && isLengthAlignedTemplate(enTemplate, koTemplate)) {
      return koTemplate;
    }
    return enTemplate;
  });
  const englishInjections = buildInjectionFns(data, sampleSize);
  const koreanInjections = buildInjectionFns(koPreferredData, sampleSize);

  const filteredTests = harmfulOnly
    ? testCases.filter((t) => t.metadata?.pluginId?.startsWith('harmful:'))
    : testCases;

  return filteredTests.flatMap((testCase) =>
    (resolveGraderLanguage(
      testCase as { metadata?: Record<string, any> },
      String(testCase.vars?.[injectVar] ?? ''),
      '',
    ) === 'ko'
      ? koreanInjections
      : englishInjections
    ).map((fn) => {
      const originalText = String(testCase.vars![injectVar]);
      return {
        ...testCase,
        assert: testCase.assert?.map((assert) => ({
          ...assert,
          metric: 'Harmful/Injection',
        })),
        vars: {
          ...testCase.vars,
          [injectVar]: `${fn(originalText)}`,
        },
        metadata: {
          ...testCase.metadata,
          strategyId: 'jailbreak-templates',
          originalText,
        },
      };
    }),
  );
}
