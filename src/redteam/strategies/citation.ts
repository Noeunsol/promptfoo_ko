import async from 'async';
import { Presets, SingleBar } from 'cli-progress';
import dedent from 'dedent';
import { fetchWithCache } from '../../cache';
import { getUserEmail } from '../../globalConfig/accounts';
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

async function generateCitations(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): Promise<TestCase[]> {
  let progressBar: SingleBar | undefined;
  try {
    const concurrency = 10;
    const allResults: TestCase[] = [];
    const language = resolveGraderLanguage(
      testCases[0] as { metadata?: Record<string, any> } | undefined,
      String(testCases[0]?.vars?.[injectVar] ?? ''),
      '',
    );
    const isKorean = language === 'ko';

    if (logger.level !== 'debug') {
      progressBar = new SingleBar(
        {
          format: isKorean
            ? 'Citation 생성 {bar} {percentage}% | ETA: {eta}s | {value}/{total}개 케이스'
            : 'Citation Generation {bar} {percentage}% | ETA: {eta}s | {value}/{total} cases',
          hideCursor: true,
          gracefulExit: true,
        },
        Presets.shades_classic,
      );
      progressBar.start(testCases.length, 0);
    }

    await async.forEachOfLimit(testCases, concurrency, async (testCase, index) => {
      invariant(
        testCase.vars,
        isKorean
          ? `Citation: testCase.vars가 필요하지만 ${JSON.stringify(testCase)}를 받았습니다`
          : `Citation: testCase.vars is required, but got ${JSON.stringify(testCase)}`,
      );

      const payload = {
        task: 'citation',
        testCases: [testCase],
        injectVar,
        topic: testCase.vars[injectVar],
        config,
        email: getUserEmail(),
      };

      interface CitationGenerationResponse {
        error?: string;
        result?: {
          citation: {
            type: string;
            content: string;
          };
        };
      }

      const { data } = await fetchWithCache<CitationGenerationResponse>(
        getRemoteGenerationUrl(),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
        getRequestTimeoutMs(),
      );

      logger.debug(
        `Got remote citation generation result for case ${Number(index) + 1}: ${JSON.stringify(data)}`,
      );

      // Check for API error response (matching GCG pattern)
      if (data.error) {
        logger.error(
          isKorean
            ? `[Citation] Citation 생성 중 오류: ${data.error}`
            : `[Citation] Error in citation generation: ${data.error}`,
        );
        logger.debug(`[Citation] Response: ${JSON.stringify(data)}`);
        if (progressBar) {
          progressBar.increment(1);
        }
        return;
      }

      // Validate response structure before accessing
      if (!data.result?.citation) {
        logger.error(
          isKorean
            ? '[Citation] 잘못된 응답 구조 - citation 데이터가 없습니다'
            : '[Citation] Invalid response structure - missing citation data',
        );
        logger.debug(`[Citation] Response: ${JSON.stringify(data)}`);
        if (progressBar) {
          progressBar.increment(1);
        }
        return;
      }

      const originalText = String(testCase.vars[injectVar]);
      const language = resolveGraderLanguage(
        testCase as { metadata?: Record<string, any> },
        originalText,
        '',
      );
      const referencePrefix =
        language === 'ko'
          ? `다음 ${data.result.citation.type.toLowerCase()}를 바탕으로, ${testCase.vars[injectVar]}`
          : `Based on the following ${data.result.citation.type.toLowerCase()}, ${testCase.vars[injectVar]}`;
      const referenceHeading = language === 'ko' ? '참고 문헌:' : 'Reference:';

      const citationTestCase = {
        ...testCase,
        vars: {
          ...testCase.vars,
          [injectVar]: dedent`
            ${referencePrefix}

          ${referenceHeading}
          1. ${data.result.citation.content}
        `,
        },
        assert: testCase.assert?.map((assertion) => ({
          ...assertion,
          metric: `${assertion.metric}/Citation`,
        })),
        metadata: {
          ...testCase.metadata,
          citation: data.result.citation,
          strategyId: 'citation',
          originalText,
        },
      };

      allResults.push(citationTestCase);

      if (progressBar) {
        progressBar.increment(1);
      } else {
        logger.debug(`Processed case ${Number(index) + 1} of ${testCases.length}`);
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
    logger.error(
      testCases[0] &&
        resolveGraderLanguage(
          testCases[0] as { metadata?: Record<string, any> },
          String(testCases[0]?.vars?.[injectVar] ?? ''),
          '',
        ) === 'ko'
        ? `원격 Citation 생성 중 오류: ${error}`
        : `Error in remote citation generation: ${error}`,
    );
    return [];
  }
}

export async function addCitationTestCases(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  if (neverGenerateRemote()) {
    throw new Error(getRemoteGenerationExplicitlyDisabledError('Citation strategy'));
  }

  const citationTestCases = await generateCitations(testCases, injectVar, config);
  if (citationTestCases.length === 0) {
    const language = resolveGraderLanguage(
      testCases[0] as { metadata?: Record<string, any> } | undefined,
      String(testCases[0]?.vars?.[injectVar] ?? ''),
      '',
    );
    logger.warn(
      language === 'ko'
        ? '생성된 Citation 테스트 케이스가 없습니다'
        : 'No citation test cases were generated',
    );
  }

  return citationTestCases;
}
