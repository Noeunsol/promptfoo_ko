import async from 'async';
import { Presets, SingleBar } from 'cli-progress';
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

async function generateLikertPrompts(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): Promise<TestCase[]> {
  let progressBar: SingleBar | undefined;
  try {
    const concurrency = 10;
    let allResults: TestCase[] = [];
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
            ? 'Likert 탈옥 생성 {bar} {percentage}% | ETA: {eta}s | {value}/{total}개 케이스'
            : 'Likert Jailbreak Generation {bar} {percentage}% | ETA: {eta}s | {value}/{total} cases',
          hideCursor: true,
          gracefulExit: true,
        },
        Presets.shades_classic,
      );
      progressBar.start(testCases.length, 0);
    }

    await async.forEachOfLimit(testCases, concurrency, async (testCase, index) => {
      logger.debug(`[Likert] Processing test case: ${JSON.stringify(testCase)}`);
      invariant(
        testCase.vars,
        isKorean
          ? `Likert: testCase.vars가 필요하지만 ${JSON.stringify(testCase)}를 받았습니다`
          : `Likert: testCase.vars is required, but got ${JSON.stringify(testCase)}`,
      );

      const payload = {
        task: 'jailbreak:likert',
        prompt: testCase.vars[injectVar],
        index,
        plugin: testCase.metadata?.plugins?.join(',') ?? testCase.metadata?.pluginId,
        ...config,
        email: getUserEmail(),
      };

      interface LikertGenerationResponse {
        error?: string;
        modifiedPrompts?: string[];
      }

      const { data } = await fetchWithCache<LikertGenerationResponse>(
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
        `Got Likert jailbreak generation result for case ${Number(index) + 1}: ${JSON.stringify(
          data,
        )}`,
      );
      // Runtime check is necessary because both properties are optional in LikertGenerationResponse.
      // The remote API could return {} or {error: "..."} without modifiedPrompts, and line 80 directly
      // accesses data.modifiedPrompts.map() which would throw if undefined.
      if (data.error || !data.modifiedPrompts) {
        logger.error(
          isKorean
            ? `[jailbreak:likert] Likert 생성 중 오류: ${data.error}}`
            : `[jailbreak:likert] Error in Likert generation: ${data.error}}`,
        );
        logger.debug(`[jailbreak:likert] Response: ${JSON.stringify(data)}`);
        return;
      }

      const likertTestCases = data.modifiedPrompts.map((modifiedPrompt: string) => {
        const originalText = String(testCase.vars![injectVar]);
        return {
          ...testCase,
          vars: {
            ...testCase.vars,
            [injectVar]: modifiedPrompt,
          },
          assert: testCase.assert?.map((assertion) => ({
            ...assertion,
            metric: `${assertion.metric}/Likert`,
          })),
          metadata: {
            ...testCase.metadata,
            strategyId: 'jailbreak:likert',
            originalText,
          },
        };
      });

      allResults = allResults.concat(likertTestCases);

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
        ? `Likert 생성 중 오류: ${error}`
        : `Error in Likert generation: ${error}`,
    );
    return [];
  }
}

export async function addLikertTestCases(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  if (neverGenerateRemote()) {
    throw new Error(getRemoteGenerationExplicitlyDisabledError('Likert jailbreak strategy'));
  }

  const likertTestCases = await generateLikertPrompts(testCases, injectVar, config);
  if (likertTestCases.length === 0) {
    const language = resolveGraderLanguage(
      testCases[0] as { metadata?: Record<string, any> } | undefined,
      String(testCases[0]?.vars?.[injectVar] ?? ''),
      '',
    );
    logger.warn(
      language === 'ko'
        ? '생성된 Likert 탈옥 테스트 케이스가 없습니다'
        : 'No Likert jailbreak test cases were generated',
    );
  }

  return likertTestCases;
}
