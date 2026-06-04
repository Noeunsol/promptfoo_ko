import async from 'async';
import { Presets, SingleBar } from 'cli-progress';
import { fetchWithCache } from '../../cache';
import { getUserEmail, isLoggedIntoCloud } from '../../globalConfig/accounts';
import logger from '../../logger';
import { getRequestTimeoutMs } from '../../providers/shared';
import invariant from '../../util/invariant';
import {
  getRemoteGenerationExplicitlyDisabledError,
  getRemoteGenerationUrl,
  neverGenerateRemote,
} from '../remoteGeneration';
import { resolveGraderLanguage } from '../util';

import type { TestCase } from '../../types/index';

export const CONCURRENCY = 10;

function resolveGcgLanguage(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, unknown>,
): string {
  if (typeof config.language === 'string') {
    return config.language;
  }
  const firstTestCase = testCases[0];
  const prompt = String(firstTestCase?.vars?.[injectVar] ?? '');
  return resolveGraderLanguage(firstTestCase, prompt, '') ?? 'en';
}

async function generateGcgPrompts(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any> & { n?: number },
): Promise<TestCase[]> {
  const language = resolveGcgLanguage(testCases, injectVar, config);
  const isKorean = language === 'ko';
  let progressBar: SingleBar | undefined;
  try {
    const allResults: TestCase[] = [];

    if (logger.level !== 'debug') {
      progressBar = new SingleBar(
        {
          format: isKorean
            ? 'GCG 생성 {bar} {percentage}% | ETA: {eta}s | {value}/{total} 건'
            : 'GCG Generation {bar} {percentage}% | ETA: {eta}s | {value}/{total} cases',
          hideCursor: true,
          gracefulExit: true,
        },
        Presets.shades_classic,
      );
      progressBar.start(testCases.length, 0);
    }

    await async.forEachOfLimit(testCases, CONCURRENCY, async (testCase, index) => {
      const caseNumber = Number(index) + 1;
      logger.debug('[GCG] Processing test case', {
        caseNumber,
        totalCases: testCases.length,
        hasInjectVar: testCase.vars ? injectVar in testCase.vars : false,
        varsKeyCount: Object.keys(testCase.vars ?? {}).length,
        assertionCount: testCase.assert?.length ?? 0,
        metadataKeyCount: Object.keys(testCase.metadata ?? {}).length,
      });
      invariant(
        testCase.vars,
        isKorean
          ? `GCG: ${caseNumber}번 케이스에는 testCase.vars가 필요합니다`
          : `GCG: testCase.vars is required for case ${caseNumber}`,
      );

      const payload = {
        task: 'gcg',
        query: testCase.vars[injectVar],
        ...(config.n && { n: config.n }),
        email: getUserEmail(),
      };

      interface GCGGenerationResponse {
        error?: string;
        responses?: string[];
      }

      const { data, status, statusText } = await fetchWithCache<GCGGenerationResponse>(
        getRemoteGenerationUrl(),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-promptfoo-silent': 'true',
          },
          body: JSON.stringify(payload),
        },
        getRequestTimeoutMs(),
        'json',
        true,
      );

      logger.debug('[GCG] Got generation result', {
        caseNumber,
        hasError: Boolean(data.error),
        responseCount: Array.isArray(data.responses) ? data.responses.length : 0,
      });

      if (data.error) {
        logger.error('[GCG] Error in GCG generation', {
          caseNumber,
          status,
          statusText,
        });
        logger.debug('[GCG] Error response metadata', {
          caseNumber,
          hasError: true,
        });
        return;
      }

      // Handle both single response and array of responses
      const responses = data.responses as string[];
      const originalText = String(testCase.vars[injectVar]);

      const gcgTestCases = responses.map((response: string) => ({
        ...testCase,
        vars: {
          ...testCase.vars,
          [injectVar]: response,
        },
        assert: testCase.assert?.map((assertion) => ({
          ...assertion,
          metric: `${assertion.metric}/GCG`,
        })),
        metadata: {
          ...testCase.metadata,
          strategyId: 'gcg',
          originalText,
        },
      }));

      allResults.push(...gcgTestCases);

      if (progressBar) {
        progressBar.increment(1);
      } else {
        logger.debug('[GCG] Processed test case', {
          caseNumber,
          totalCases: testCases.length,
        });
      }
    });

    if (progressBar) {
      progressBar.stop();
    }

    return allResults;
  } catch (error) {
    if (progressBar) {
      progressBar.stop();
    }
    logger.error('Error in GCG generation', {
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    return [];
  }
}

export async function addGcgTestCases(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  const language = resolveGcgLanguage(testCases, injectVar, config);
  const isKorean = language === 'ko';
  if (!isLoggedIntoCloud()) {
    throw new Error(
      isKorean
        ? 'GCG 전략을 사용하려면 인증이 필요합니다. `promptfoo auth login`을 실행해 로그인하세요.'
        : 'The GCG strategy requires authentication. Run `promptfoo auth login` to use this strategy.',
    );
  }

  if (neverGenerateRemote()) {
    throw new Error(getRemoteGenerationExplicitlyDisabledError('GCG strategy'));
  }

  const gcgTestCases = await generateGcgPrompts(testCases, injectVar, config);
  if (gcgTestCases.length === 0) {
    logger.warn(
      isKorean ? 'GCG 테스트 케이스가 생성되지 않았습니다' : 'No GCG test cases were generated',
    );
  }

  return gcgTestCases;
}
