import dedent from 'dedent';
import { z } from 'zod';
import logger from '../../logger';
import { maybeLoadFromExternalFile } from '../../util/file';
import { getNunjucksEngine } from '../../util/templates';
import { RedteamPluginBase } from './base';

import type { ApiProvider, Assertion, PluginConfig, TestCase } from '../../types/index';

const CustomPluginDefinitionSchema = z.strictObject({
  generator: z.string().min(1, 'Generator must not be empty').trim(),
  grader: z.string().min(1, 'Grader must not be empty').trim(),
  threshold: z.number().optional(),
  metric: z.string().optional(),
  id: z.string().optional(),
});

type CustomPluginDefinition = z.infer<typeof CustomPluginDefinitionSchema>;

export function loadCustomPluginDefinition(filePath: string): CustomPluginDefinition {
  logger.debug(`Loading custom plugin from ${filePath}`);

  const result = CustomPluginDefinitionSchema.safeParse(maybeLoadFromExternalFile(filePath));
  if (!result.success) {
    const validationError = z.prettifyError(result.error);
    throw new Error(
      '\n' +
        dedent`
    Custom Plugin Schema Validation Error:

      ${validationError}

    Please review your plugin file ${filePath} configuration.`,
    );
  }
  logger.debug(`Custom plugin definition: ${JSON.stringify(result.data, null, 2)}`);
  return result.data;
}

export class CustomPlugin extends RedteamPluginBase {
  private definition: CustomPluginDefinition;
  static readonly canGenerateRemote = false;

  get id(): string {
    return this.definition.id || `promptfoo:redteam:custom`;
  }

  constructor(
    provider: ApiProvider,
    purpose: string,
    injectVar: string,
    filePath: string,
    config: PluginConfig = {},
  ) {
    super(provider, purpose, injectVar, config);
    this.definition = loadCustomPluginDefinition(filePath);
  }

  private getLanguage(): string | undefined {
    return typeof this.config?.language === 'string' ? this.config.language : undefined;
  }

  protected async getTemplate(): Promise<string> {
    if (this.getLanguage() === 'ko') {
      return dedent`
        중요: 아래 지침의 의도, 위험도, 형식을 유지하되 한국어 사용자 상황에 맞는 자연스러운 한국어로 작성하세요.
        영문 고정 키나 구조가 요구되는 경우 해당 구조는 유지하세요.

        ${this.definition.generator}
      `;
    }
    return this.definition.generator;
  }

  protected getMetricName(): string {
    return this.definition.metric ?? `custom`;
  }

  protected getAssertions(_prompt: string): Assertion[] {
    const nunjucks = getNunjucksEngine();
    const language = this.getLanguage();
    const graderTemplate =
      language === 'ko'
        ? dedent`
            중요: 아래 채점 지침의 의도와 엄격도를 유지하되, reason 등 자유 서술 값은 한국어 맥락으로 자연스럽게 작성하세요.

            ${this.definition.grader}
          `
        : this.definition.grader;
    const renderedGrader = nunjucks.renderString(graderTemplate, {
      purpose: this.purpose,
      language,
    });

    const assertion: Assertion = {
      type: 'llm-rubric',
      value: renderedGrader,
      metric: this.getMetricName(),
    };

    if (this.definition.threshold !== undefined) {
      assertion.threshold = this.definition.threshold;
    }

    return [assertion];
  }

  async generateTests(n: number, delayMs: number = 0): Promise<TestCase[]> {
    const tests = await super.generateTests(n, delayMs);
    return tests.map((test) => ({
      ...test,
      metadata: {
        purpose: this.purpose,
        ...(test.metadata ?? {}),
      },
    }));
  }
}
