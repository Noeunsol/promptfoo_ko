import logger from '../../../logger';
import invariant from '../../../util/invariant';
import { HARM_PLUGINS } from '../../constants';
import { extractMaterializedVariablesFromJsonWithMetadata, getShortPluginId } from '../../util';
import { RedteamPluginBase } from '../base';
import { getHarmfulAssertions } from './common';
import { REDTEAM_MODEL_CATEGORIES, REDTEAM_MODEL_CATEGORIES_KO } from './constants';

import type { ApiProvider, Assertion, PluginConfig, TestCase } from '../../../types/index';
import type { HarmfulCategory } from './constants';

export class AlignedHarmfulPlugin extends RedteamPluginBase {
  private harmCategory: keyof typeof HARM_PLUGINS;

  get id(): string {
    return `promptfoo:redteam:${this.harmCategory}`;
  }

  constructor(
    provider: ApiProvider,
    purpose: string,
    injectVar: string,
    harmCategory: keyof typeof HARM_PLUGINS,
    config: PluginConfig = {},
  ) {
    super(provider, purpose, injectVar, config);
    this.harmCategory = harmCategory;
  }

  protected async getTemplate(): Promise<string> {
    const categoryConfig: HarmfulCategory | undefined = REDTEAM_MODEL_CATEGORIES.find(
      (c) => c.key === this.harmCategory,
    );
    invariant(categoryConfig, `Harmful category ${this.harmCategory} not found`);

    // Inject default examples (Korean if language === 'ko', otherwise English)
    // when the user has not provided their own examples. The base class renders
    // {{examples}} from this.config.examples in the prompt template.
    if (!this.config.examples) {
      // REDTEAM_MODEL_CATEGORIES_KO only covers a subset of harmful categories
      // (intellectual-property, privacy). Cast keyof so we can index safely.
      const koExamples =
        this.config.language === 'ko'
          ? REDTEAM_MODEL_CATEGORIES_KO[
              this.harmCategory as keyof typeof REDTEAM_MODEL_CATEGORIES_KO
            ]
          : undefined;
      this.config.examples = [koExamples ?? categoryConfig.examples];
    }

    return categoryConfig.prompt;
  }

  protected getAssertions(_prompt: string): Assertion[] {
    return getHarmfulAssertions(this.harmCategory);
  }

  protected async promptsToTestCases(prompts: { __prompt: string }[]): Promise<TestCase[]> {
    const hasMultipleInputs = this.config.inputs && Object.keys(this.config.inputs).length > 0;
    const harmCategoryLabel = HARM_PLUGINS[this.harmCategory] || this.harmCategory;
    const pluginId = getShortPluginId(this.harmCategory);

    return Promise.all(
      [...prompts]
        .sort((a, b) => a.__prompt.localeCompare(b.__prompt))
        .map(async ({ __prompt }, materializationIndex) => {
          // Base vars with the primary injectVar
          const vars: Record<string, string> = {
            [this.injectVar]: __prompt,
          };
          let inputMaterialization: Awaited<
            ReturnType<typeof extractMaterializedVariablesFromJsonWithMetadata>
          >['metadata'];

          // If inputs is defined, extract individual keys from the JSON into vars
          if (hasMultipleInputs) {
            let parsed: Record<string, unknown> | undefined;
            try {
              parsed = JSON.parse(__prompt);
            } catch (error) {
              logger.debug('[AlignedHarmful] Could not parse prompt as JSON for multi-input mode', {
                error,
              });
            }

            if (parsed) {
              try {
                const materializedVars = await extractMaterializedVariablesFromJsonWithMetadata(
                  parsed,
                  this.config.inputs!,
                  {
                    materializationIndex,
                    pluginId,
                    provider: this.provider,
                    purpose: this.purpose,
                  },
                );
                Object.assign(vars, materializedVars.vars);
                inputMaterialization = materializedVars.metadata;
              } catch (error) {
                logger.debug('[AlignedHarmful] Failed to materialize prompt inputs', { error });
                throw error;
              }
            }
          }

          return {
            vars,
            metadata: {
              harmCategory: harmCategoryLabel,
              pluginId,
              pluginConfig: this.config,
              ...(inputMaterialization ? { inputMaterialization } : {}),
            },
            assert: getHarmfulAssertions(this.harmCategory),
          };
        }),
    );
  }
}
