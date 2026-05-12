import fs from 'fs/promises';
import * as path from 'path';

import checkbox, { Separator } from '@inquirer/checkbox';
import confirm from '@inquirer/confirm';
import { AbortPromptError, ExitPromptError } from '@inquirer/core';
import editor from '@inquirer/editor';
import input from '@inquirer/input';
import select from '@inquirer/select';
import chalk from 'chalk';
import dedent from 'dedent';
import { getDefaultPort } from '../../constants';
import { getEnvString } from '../../envars';
import { getUserEmail, setUserEmail } from '../../globalConfig/accounts';
import { readGlobalConfig, writeGlobalConfigPartial } from '../../globalConfig/globalConfig';
import logger from '../../logger';
import { startServer } from '../../server/server';
import telemetry, { type EventProperties } from '../../telemetry';
import { setupEnv } from '../../util/index';
import { promptfooCommand } from '../../util/promptfooCommand';
import { BrowserBehavior, checkServerRunning, openBrowser } from '../../util/server';
import { extractVariablesFromTemplate, getNunjucksEngine } from '../../util/templates';
import {
  ADDITIONAL_STRATEGIES,
  ALL_PLUGINS,
  DEFAULT_PLUGINS,
  DEFAULT_STRATEGIES,
  HARM_PLUGINS,
  type Plugin,
  type Strategy,
  subCategoryDescriptions,
} from '../constants';
import { ProbeLimitExceededError } from '../types';
import { doGenerateRedteam } from './generate';
import type { Command } from 'commander';

import type { ProviderOptions, RedteamPluginObject } from '../../types/index';

export type RedteamInitLocale = 'en' | 'ko';

interface RedteamInitTemplate {
  title: string;
  targetNameMessage: string;
  appTypeMessage: string;
  appTypeChoices: {
    notSure: string;
    httpEndpoint: string;
    promptModelChatbot: string;
    rag: string;
    agent: string;
  };
  purposeMessage(defaultPurpose: string): string;
  promptTimingMessage: string;
  promptTimingChoices: {
    now: string;
    later: string;
  };
  chooseModelMessage: string;
  chooseLaterModel: string;
  pluginTitle: string;
  pluginSubtitle: string;
  pluginConfigMessage: string;
  useDefaultsChoice: string;
  manualChoice: string;
  pluginSelectMessage: string;
  mustSelectPluginMessage: string;
  policyPromptMessage: string;
  intentPromptMessage: string;
  indirectPromptInjectionTitle: string;
  indirectNoPromptWarning: string;
  indirectMissingVariablesWarning: string;
  indirectPromptVariableMessage: string;
  strategyTitle: string;
  strategySubtitle: string;
  strategyConfigMessage: string;
  strategySelectMessage: string;
  harmfulConsentMessage1: string;
  harmfulConsentMessage2: string;
  workEmailMessage: string;
  validEmailMessage: string;
  createdConfigMessage(configPath: string): string;
  deferGenerationMessage: string;
  readyToGenerateMessage: string;
  generateLaterMessage: string;
  pausedMessage: string;
  contactMessage: string;
  systemPromptNote: string;
  systemPromptDefault: string;
  systemPromptEditorMessage: string;
  systemPromptVariableError(variableCount: number): string;
  defaultPrompt: string;
  defaultPurpose: string;
  noDescriptionLabel: string;
  defaultLanguage: string;
}

const REDTEAM_INIT_TEMPLATES: Record<RedteamInitLocale, RedteamInitTemplate> = {
  en: {
    title: 'Red Team Configuration\n',
    targetNameMessage:
      "What's the name of the target you want to red team? (e.g. 'helpdesk-agent', 'customer-service-chatbot')\n",
    appTypeMessage: 'What would you like to do?',
    appTypeChoices: {
      notSure: 'Not sure yet',
      httpEndpoint: 'Red team an HTTP endpoint',
      promptModelChatbot: 'Red team a model + prompt',
      rag: 'Red team a RAG',
      agent: 'Red team an Agent',
    },
    purposeMessage(defaultPurpose) {
      return dedent`What is the purpose of your application? This is used to tailor the attacks. Be as specific as possible. Include information about who the user of the system is and what information and actions they should be able to access.
        (e.g. "${defaultPurpose}")\n`;
    },
    promptTimingMessage: 'Do you want to enter a prompt now or later?',
    promptTimingChoices: {
      now: 'Enter prompt now',
      later: 'Enter prompt later',
    },
    chooseModelMessage: 'Choose a model to target:',
    chooseLaterModel: `I'll choose later`,
    pluginTitle: 'Plugin Configuration',
    pluginSubtitle: 'Plugins generate adversarial inputs.\n',
    pluginConfigMessage: 'How would you like to configure plugins?',
    useDefaultsChoice: 'Use the defaults (configure later)',
    manualChoice: 'Manually select',
    pluginSelectMessage: `Select the plugins you want to use. Don't worry, you can change this later:`,
    mustSelectPluginMessage: 'You must select at least one plugin.',
    policyPromptMessage:
      'You selected the `policy` plugin. Please enter your custom policy description, or leave empty to skip.\n(e.g. "Never talk about the weather")',
    intentPromptMessage: dedent`You selected the 'intent' plugin. Please enter the behavior you want to test for, or leave empty to skip.
      (e.g. "express hatred towards a specific group" or "provide instructions for illegal activities")\n`,
    indirectPromptInjectionTitle: 'Indirect Prompt Injection Configuration\n',
    indirectNoPromptWarning: dedent`${chalk.bold('Warning:')} Skipping indirect prompt injection plugin because no prompt is specified.
        You can re-add this plugin after adding a prompt in your redteam config.

        Learn more: https://www.promptfoo.dev/docs/red-team/plugins/indirect-prompt-injection`,
    indirectMissingVariablesWarning: dedent`${chalk.bold('Warning:')} Skipping indirect prompt injection plugin because it requires at least two {{variables}} in the prompt.

          Learn more: https://www.promptfoo.dev/docs/red-team/plugins/indirect-prompt-injection`,
    indirectPromptVariableMessage:
      'Which variable would you like to test for indirect prompt injection?',
    strategyTitle: 'Strategy Configuration',
    strategySubtitle: 'Strategies are attack methods.',
    strategyConfigMessage: 'How would you like to configure strategies?',
    strategySelectMessage: `Select the ones you want to use. Don't worry, you can change this later:`,
    harmfulConsentMessage1:
      'You have selected one or more plugins that generate potentially harmful content.',
    harmfulConsentMessage2:
      'This content is intended solely for adversarial testing and evaluation purposes.',
    workEmailMessage: 'Please enter your work email address',
    validEmailMessage: 'Please enter a valid email address',
    createdConfigMessage(configPath) {
      return `\nCreated red teaming configuration file at ${chalk.bold(configPath)}\n`;
    },
    deferGenerationMessage: dedent`
          To generate test cases and run your red team, use the command:

              ${chalk.bold(promptfooCommand('redteam run'))}
        `,
    readyToGenerateMessage: 'Are you ready to generate adversarial test cases?',
    generateLaterMessage:
      'To generate test cases and run your red team later, use the command: ' +
      chalk.bold(promptfooCommand('redteam run')),
    pausedMessage: 'Red team initialization paused. To continue setup later, use the command: ',
    contactMessage: 'For help or feedback, visit ',
    systemPromptNote:
      'NOTE: your prompt must include one or more injectable variables like {{prompt}} or {{name}} as a placeholder for user input (REMOVE THIS LINE)',
    systemPromptDefault: dedent`You are a helpful and concise assistant.

  User query: {{prompt}}`,
    systemPromptEditorMessage: 'Enter the prompt you want to test against:',
    systemPromptVariableError(variableCount) {
      return `Your prompt must include ${variableCount} ${
        variableCount === 1 ? 'variable' : 'variables'
      } like "{{prompt}}" as a placeholder for user input.`;
    },
    defaultPrompt:
      'You are a travel agent specialized in budget trips to Europe\n\nUser query: {{prompt}}',
    defaultPurpose:
      'Travel agent specializing in budget trips to Europe. The user is anonymous and should not be able to access any information about the system or other users.',
    noDescriptionLabel: 'No description',
    defaultLanguage: 'en',
  },
  ko: {
    title: '레드팀 설정\n',
    targetNameMessage:
      "레드팀 테스트할 대상 이름을 입력하세요. (예: 'helpdesk-agent', 'customer-service-chatbot')\n",
    appTypeMessage: '무엇을 해보고 싶나요?',
    appTypeChoices: {
      notSure: '아직 잘 모르겠어요',
      httpEndpoint: 'HTTP 엔드포인트 레드팀 테스트',
      promptModelChatbot: '모델 + 프롬프트 레드팀 테스트',
      rag: 'RAG 레드팀 테스트',
      agent: '에이전트 레드팀 테스트',
    },
    purposeMessage(defaultPurpose) {
      return dedent`애플리케이션의 목적을 입력해주세요. 공격 시나리오를 맞춤 생성할 때 사용됩니다. 시스템 사용자가 누구인지, 어떤 정보/작업에 접근 가능해야 하는지도 구체적으로 적어주세요.
        (예: "${defaultPurpose}")\n`;
    },
    promptTimingMessage: '프롬프트를 지금 입력할까요, 나중에 입력할까요?',
    promptTimingChoices: {
      now: '지금 입력',
      later: '나중에 입력',
    },
    chooseModelMessage: '테스트 대상 모델을 선택하세요:',
    chooseLaterModel: '나중에 선택할게요',
    pluginTitle: '플러그인 설정',
    pluginSubtitle: '플러그인은 공격용 입력(테스트 케이스)을 생성합니다.\n',
    pluginConfigMessage: '플러그인 설정 방식을 선택하세요.',
    useDefaultsChoice: '기본값 사용 (나중에 수정)',
    manualChoice: '직접 선택',
    pluginSelectMessage: '사용할 플러그인을 선택하세요. 나중에 변경할 수 있습니다:',
    mustSelectPluginMessage: '플러그인을 최소 1개 이상 선택해야 합니다.',
    policyPromptMessage:
      '`policy` 플러그인을 선택했습니다. 커스텀 정책 설명을 입력하세요. (비워두면 건너뜀)\n(예: "날씨에 대해서는 절대 답변하지 마라")',
    intentPromptMessage: dedent`'intent' 플러그인을 선택했습니다. 테스트할 의도를 입력하세요. (비워두면 건너뜀)
      (예: "특정 집단에 대한 혐오 표현 유도" 또는 "불법 행위 지시 요청")\n`,
    indirectPromptInjectionTitle: '간접 프롬프트 인젝션 설정\n',
    indirectNoPromptWarning: dedent`${chalk.bold('경고:')} 프롬프트가 없어 간접 프롬프트 인젝션 플러그인을 건너뜁니다.
        redteam 설정에 프롬프트를 추가한 뒤 다시 플러그인을 넣을 수 있습니다.

        자세히 보기: https://www.promptfoo.dev/docs/red-team/plugins/indirect-prompt-injection`,
    indirectMissingVariablesWarning: dedent`${chalk.bold('경고:')} 간접 프롬프트 인젝션 플러그인은 프롬프트에 {{변수}}가 최소 2개 필요하여 건너뜁니다.

          자세히 보기: https://www.promptfoo.dev/docs/red-team/plugins/indirect-prompt-injection`,
    indirectPromptVariableMessage: '간접 프롬프트 인젝션 대상으로 사용할 변수를 선택하세요:',
    strategyTitle: '전략 설정',
    strategySubtitle: '전략은 공격 방식입니다.',
    strategyConfigMessage: '전략 설정 방식을 선택하세요.',
    strategySelectMessage: '사용할 전략을 선택하세요. 나중에 변경할 수 있습니다:',
    harmfulConsentMessage1: '잠재적으로 유해한 콘텐츠를 생성할 수 있는 플러그인을 선택했습니다.',
    harmfulConsentMessage2:
      '해당 콘텐츠는 오직 공격적인 테스트 및 보안 평가 목적에서만 사용되어야 합니다.',
    workEmailMessage: '동의 확인을 위해 회사 이메일을 입력해주세요',
    validEmailMessage: '유효한 이메일 주소를 입력해주세요',
    createdConfigMessage(configPath) {
      return `\n레드팀 설정 파일을 생성했습니다: ${chalk.bold(configPath)}\n`;
    },
    deferGenerationMessage: dedent`
          테스트 케이스 생성 및 레드팀 실행은 아래 명령으로 진행하세요:

              ${chalk.bold(promptfooCommand('redteam run'))}
        `,
    readyToGenerateMessage: '공격적인 테스트 케이스를 지금 생성할까요?',
    generateLaterMessage:
      '나중에 테스트 케이스 생성 및 레드팀 실행을 하려면 다음 명령을 사용하세요: ' +
      chalk.bold(promptfooCommand('redteam run')),
    pausedMessage: '레드팀 초기화가 중단되었습니다. 이어서 진행하려면 다음 명령을 실행하세요: ',
    contactMessage: '문의/피드백: ',
    systemPromptNote:
      '참고: 프롬프트에는 사용자 입력 치환용 변수(예: {{prompt}}, {{name}})를 하나 이상 포함해야 합니다. (이 문구는 삭제하세요)',
    systemPromptDefault: dedent`당신은 간결하고 도움이 되는 어시스턴트입니다.

  사용자 질문: {{prompt}}`,
    systemPromptEditorMessage: '테스트할 프롬프트를 입력하세요:',
    systemPromptVariableError(variableCount) {
      return `프롬프트에는 "{{prompt}}" 같은 변수가 ${
        variableCount === 1 ? '최소 1개' : `${variableCount}개`
      } 이상 필요합니다.`;
    },
    defaultPrompt: '당신은 유럽 저예산 여행 전문 상담사입니다.\n\n사용자 질문: {{prompt}}',
    defaultPurpose:
      '유럽 저예산 여행 상담 애플리케이션입니다. 사용자는 익명이며 시스템 내부 정보나 다른 사용자 정보에는 접근할 수 없어야 합니다.',
    noDescriptionLabel: '설명 없음',
    defaultLanguage: 'ko',
  },
};

const REDTEAM_CONFIG_TEMPLATE_EN = `# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json

# Red teaming configuration

# Docs: https://promptfoo.dev/docs/red-team/configuration
description: "My first red team"

{% if prompts.length > 0 -%}
prompts:
  {% for prompt in prompts -%}
  - {{ prompt | dump }}
  {% endfor -%}
  {% if prompts.length > 0 and not prompts[0].startsWith('file://') -%}
  # You can also reference external prompts, e.g.
  # - file:///path/to/prompt.json
  # Learn more: https://promptfoo.dev/docs/configuration/prompts/
  {% endif %}
{% endif -%}

targets:
  # Red team targets. To talk directly to your application, use a custom provider.
  # See https://promptfoo.dev/docs/red-team/configuration/#providers
  {% for provider in providers -%}
  {% if provider is string -%}
  - {{ provider }}
  {% else -%}
  - id: {{ provider.id }}
    label: {{ provider.label }}
    config:
      {% for k, v in provider.config -%}
      {{ k }}: {{ v | dump }}
      {% endfor -%}
  {% endif -%}
  {% endfor %}

# Other redteam settings
redteam:
  {% if purpose is defined -%}
  purpose: {{ purpose | dump }}
  {% endif %}
  {% if language is defined -%}
  language: {{ language | dump }}
  {% endif %}
  # Default number of inputs to generate for each plugin.
  # The total number of tests will be (numTests * plugins.length * (1 + strategies.length) * languages.length)
  # Languages.length is 1 by default, but is added when the multilingual strategy is used.
  numTests: {{numTests}}

  {% if plugins.length > 0 -%}
  # Each plugin generates {{numTests}} adversarial inputs.
  # To control the number of tests for each plugin, use:
  # - id: plugin-name
  #   numTests: 10
  plugins:
    {% for plugin in plugins -%}
    {% if plugin is string -%}
    - {{plugin}}  # {{descriptions[plugin]}}
    {% else -%}
    - id: {{plugin.id}}  # {{descriptions[plugin.id]}}
      {% if plugin.numTests is defined -%}
      numTests: {{plugin.numTests}}
      {% endif -%}
      {%- if plugin.config is defined -%}
      config:
        {%- for k, v in plugin.config %}
        {{k}}: {{v | dump}}
        {%- endfor -%}
      {%- endif %}
    {% endif -%}
    {%- endfor %}
  {% endif -%}

  {% if strategies.length > 0 -%}
  # Attack methods for applying adversarial inputs
  strategies:
    {% for strategy in strategies -%}
    - {{strategy}} # {{descriptions[strategy]}}
    {% endfor %}
  {% endif -%}
`;

const REDTEAM_CONFIG_TEMPLATE_KO = `# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json

# 레드팀 설정 파일

# 문서: https://promptfoo.dev/docs/red-team/configuration
description: "나의 첫 레드팀"

{% if prompts.length > 0 -%}
prompts:
  {% for prompt in prompts -%}
  - {{ prompt | dump }}
  {% endfor -%}
  {% if prompts.length > 0 and not prompts[0].startsWith('file://') -%}
  # 외부 프롬프트 파일도 참조할 수 있습니다. 예:
  # - file:///path/to/prompt.json
  # 참고: https://promptfoo.dev/docs/configuration/prompts/
  {% endif %}
{% endif -%}

targets:
  # 레드팀 테스트 대상입니다. 애플리케이션과 직접 통신하려면 커스텀 provider를 사용하세요.
  # 참고: https://promptfoo.dev/docs/red-team/configuration/#providers
  {% for provider in providers -%}
  {% if provider is string -%}
  - {{ provider }}
  {% else -%}
  - id: {{ provider.id }}
    label: {{ provider.label }}
    config:
      {% for k, v in provider.config -%}
      {{ k }}: {{ v | dump }}
      {% endfor -%}
  {% endif -%}
  {% endfor %}

# 기타 레드팀 설정
redteam:
  {% if purpose is defined -%}
  purpose: {{ purpose | dump }}
  {% endif %}
  {% if language is defined -%}
  language: {{ language | dump }}
  {% endif %}
  # 각 플러그인마다 생성할 기본 입력 수
  # 전체 테스트 수 = numTests * plugins.length * (1 + strategies.length) * languages.length
  # multilingual 전략을 사용하지 않으면 languages.length는 기본 1입니다.
  numTests: {{numTests}}

  {% if plugins.length > 0 -%}
  # 각 플러그인은 {{numTests}}개의 적대적 입력을 생성합니다.
  # 플러그인별 생성 개수를 다르게 하려면:
  # - id: plugin-name
  #   numTests: 10
  plugins:
    {% for plugin in plugins -%}
    {% if plugin is string -%}
    - {{plugin}}  # {{descriptions[plugin]}}
    {% else -%}
    - id: {{plugin.id}}  # {{descriptions[plugin.id]}}
      {% if plugin.numTests is defined -%}
      numTests: {{plugin.numTests}}
      {% endif -%}
      {%- if plugin.config is defined -%}
      config:
        {%- for k, v in plugin.config %}
        {{k}}: {{v | dump}}
        {%- endfor -%}
      {%- endif %}
    {% endif -%}
    {%- endfor %}
  {% endif -%}

  {% if strategies.length > 0 -%}
  # 적대적 입력에 적용할 공격 전략
  strategies:
    {% for strategy in strategies -%}
    - {{strategy}} # {{descriptions[strategy]}}
    {% endfor %}
  {% endif -%}
`;

const REDTEAM_CONFIG_TEMPLATES: Record<RedteamInitLocale, string> = {
  en: REDTEAM_CONFIG_TEMPLATE_EN,
  ko: REDTEAM_CONFIG_TEMPLATE_KO,
};

const CUSTOM_PROVIDER_TEMPLATE = `# Custom provider for red teaming
# Docs: https://promptfoo.dev/docs/red-team/configuration/#providers

import http.client
import urllib.parse
import json

def call_api(prompt, options, context):
    parsed_url = urllib.parse.urlparse('https://example.com/api/chat)
    conn = http.client.HTTPSConnection(parsed_url.netloc)

    headers = {'Content-Type': 'application/json'}
    payload = json.dumps({'user_chat': prompt})

    conn.request("POST", parsed_url.path or "/", body=payload, headers=headers)
    response = conn.getresponse()

    return {
      "output": response.read().decode()
    }
`;

function recordOnboardingStep(step: string, properties: EventProperties = {}) {
  telemetry.record('funnel', {
    type: 'redteam onboarding',
    step,
    ...properties,
  });
}

export function resolveRedteamInitLocale(locale: string | undefined): RedteamInitLocale {
  if (typeof locale !== 'string') {
    return 'en';
  }
  const normalized = locale.trim().toLowerCase();
  if (
    normalized === 'ko' ||
    normalized.startsWith('ko-') ||
    normalized === 'kor' ||
    normalized === 'korean'
  ) {
    return 'ko';
  }
  return 'en';
}

async function getSystemPrompt(
  template: RedteamInitTemplate,
  numVariablesRequired: number = 1,
): Promise<string> {
  let prompt = `${template.systemPromptDefault}\n\n${template.systemPromptNote}`;
  prompt = await editor({
    message: template.systemPromptEditorMessage,
    default: prompt,
  });
  prompt = prompt.replace(template.systemPromptNote, '');
  const variables = extractVariablesFromTemplate(prompt);
  if (variables.length < numVariablesRequired) {
    // Give the user another chance to edit their prompt
    logger.info(chalk.red(template.systemPromptVariableError(numVariablesRequired)));
    prompt = await editor({
      message: template.systemPromptEditorMessage,
      default: prompt,
    });
  }

  return prompt;
}

export function renderRedteamConfig({
  descriptions,
  language,
  locale = 'en',
  numTests,
  plugins,
  prompts,
  providers,
  purpose,
  strategies,
}: {
  descriptions: Record<string, string>;
  language?: string | string[];
  locale?: RedteamInitLocale;
  numTests: number;
  plugins: (Plugin | RedteamPluginObject)[];
  prompts: string[];
  providers: (string | ProviderOptions)[];
  purpose: string | undefined;
  strategies: Strategy[];
}): string {
  const nunjucks = getNunjucksEngine();
  return nunjucks.renderString(REDTEAM_CONFIG_TEMPLATES[locale], {
    descriptions,
    language,
    numTests,
    plugins,
    prompts,
    providers,
    purpose,
    strategies,
  });
}

export async function redteamInit(
  directory: string | undefined,
  locale: string | undefined = undefined,
) {
  telemetry.record('redteam init', { phase: 'started' });
  recordOnboardingStep('start');
  const resolvedLocale = resolveRedteamInitLocale(locale);
  const template = REDTEAM_INIT_TEMPLATES[resolvedLocale];

  const projectDir = directory || '.';
  if (projectDir !== '.') {
    await fs.mkdir(projectDir, { recursive: true });
  }

  const configPath = path.join(projectDir, 'promptfooconfig.yaml');

  console.clear();
  logger.info(chalk.bold(template.title));

  const label = await input({
    message: template.targetNameMessage,
  });

  const redTeamChoice = await select({
    message: template.appTypeMessage,
    choices: [
      { name: template.appTypeChoices.notSure, value: 'not_sure' },
      { name: template.appTypeChoices.httpEndpoint, value: 'http_endpoint' },
      { name: template.appTypeChoices.promptModelChatbot, value: 'prompt_model_chatbot' },
      { name: template.appTypeChoices.rag, value: 'rag' },
      { name: template.appTypeChoices.agent, value: 'agent' },
    ],
    pageSize: process.stdout.rows - 6,
  });

  recordOnboardingStep('choose app type', { value: redTeamChoice });

  const prompts: string[] = [];
  let purpose: string | undefined;

  const useCustomProvider =
    redTeamChoice === 'rag' ||
    redTeamChoice === 'agent' ||
    redTeamChoice === 'http_endpoint' ||
    redTeamChoice === 'not_sure';
  let deferGeneration = useCustomProvider;
  const defaultPrompt = template.defaultPrompt;
  const defaultPurpose = template.defaultPurpose;
  if (useCustomProvider) {
    purpose =
      (await input({
        message: template.purposeMessage(defaultPurpose),
      })) || defaultPurpose;

    recordOnboardingStep('choose purpose', { value: purpose });
  } else if (redTeamChoice === 'prompt_model_chatbot') {
    const promptChoice = await select({
      message: template.promptTimingMessage,
      choices: [
        { name: template.promptTimingChoices.now, value: 'now' },
        { name: template.promptTimingChoices.later, value: 'later' },
      ],
    });

    recordOnboardingStep('choose prompt', { value: promptChoice });

    let prompt: string;
    if (promptChoice === 'now') {
      prompt = await getSystemPrompt(template);
    } else {
      prompt = defaultPrompt;
      deferGeneration = true;
    }
    prompts.push(prompt);
  } else {
    prompts.push(defaultPrompt);
  }

  let providers: (string | ProviderOptions)[];
  let writeChatPy = false;
  if (useCustomProvider) {
    if (redTeamChoice === 'http_endpoint' || redTeamChoice === 'not_sure') {
      providers = [
        {
          id: 'https',
          label,
          config: {
            url: 'https://example.com/generate',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: {
              myPrompt: '{{prompt}}',
            },
          },
        },
      ];
    } else {
      providers = ['file://chat.py'];
      writeChatPy = true;
    }
  } else {
    const providerChoices = [
      { name: template.chooseLaterModel, value: 'Other' },
      { name: 'openai:gpt-4o-mini', value: 'openai:gpt-4o-mini' },
      { name: 'openai:gpt-4o', value: 'openai:gpt-4o' },
      {
        name: 'anthropic:claude-opus-4-6',
        value: 'anthropic:messages:claude-opus-4-6',
      },
      {
        name: 'anthropic:claude-opus-4-5-20251101',
        value: 'anthropic:messages:claude-opus-4-5-20251101',
      },
      {
        name: 'anthropic:claude-sonnet-4-5-20250929',
        value: 'anthropic:messages:claude-sonnet-4-5-20250929',
      },
      {
        name: 'anthropic:claude-opus-4-1-20250805',
        value: 'anthropic:messages:claude-opus-4-1-20250805',
      },
      {
        name: 'anthropic:claude-3-7-sonnet-20250219',
        value: 'anthropic:messages:claude-3-7-sonnet-20250219',
      },
      {
        name: 'Google Vertex Gemini 2.5 Pro',
        value: 'vertex:gemini-2.5-pro',
      },
    ];

    const selectedProvider = await select({
      message: template.chooseModelMessage,
      choices: providerChoices,
      pageSize: process.stdout.rows - 6,
    });

    recordOnboardingStep('choose provider', { value: selectedProvider });

    if (selectedProvider === 'Other') {
      providers = [{ id: 'openai:gpt-4o-mini', label }];
    } else {
      providers = [{ id: selectedProvider, label }];
    }
  }

  console.clear();

  recordOnboardingStep('begin plugin & strategy selection');

  logger.info(chalk.bold(template.pluginTitle));
  logger.info(template.pluginSubtitle);

  const pluginConfigChoice = await select({
    message: template.pluginConfigMessage,
    choices: [
      { name: template.useDefaultsChoice, value: 'default' },
      { name: template.manualChoice, value: 'manual' },
    ],
  });

  recordOnboardingStep('choose plugin config method', { value: pluginConfigChoice });

  let plugins: (Plugin | RedteamPluginObject)[];

  if (pluginConfigChoice === 'default') {
    if (redTeamChoice === 'rag') {
      plugins = Array.from(DEFAULT_PLUGINS);
    } else if (redTeamChoice === 'agent') {
      plugins = [...DEFAULT_PLUGINS, 'rbac', 'bola', 'bfla', 'ssrf'];
    } else {
      plugins = Array.from(DEFAULT_PLUGINS);
    }
  } else {
    const pluginChoices = Array.from(ALL_PLUGINS)
      .sort()
      .map((plugin) => ({
        name: `${plugin} - ${subCategoryDescriptions[plugin] || template.noDescriptionLabel}`,
        value: plugin,
        checked: DEFAULT_PLUGINS.has(plugin),
      }));

    plugins = await checkbox({
      message: template.pluginSelectMessage,
      choices: pluginChoices,
      pageSize: process.stdout.rows - 6,
      loop: false,
      validate: (answer) => answer.length > 0 || template.mustSelectPluginMessage,
    });

    recordOnboardingStep('choose plugins', {
      value: plugins.map((p) => (typeof p === 'string' ? p : p.id)),
    });
  }

  // Plugins that require additional configuration

  if (plugins.includes('policy')) {
    const policyIndex = plugins.indexOf('policy');
    if (policyIndex !== -1) {
      plugins.splice(policyIndex, 1);
    }

    recordOnboardingStep('collect policy');
    const policyDescription = await input({
      message: template.policyPromptMessage,
    });
    recordOnboardingStep('choose policy', { value: policyDescription.length });

    if (policyDescription.trim() !== '') {
      plugins.push({
        id: 'policy',
        config: { policy: policyDescription.trim() },
      } as RedteamPluginObject);
    }
  }

  if (plugins.includes('intent')) {
    const intentIndex = plugins.indexOf('intent');
    if (intentIndex !== -1) {
      plugins.splice(intentIndex, 1);
    }

    recordOnboardingStep('collect intent');
    const intentDescription = await input({
      message: template.intentPromptMessage,
    });
    recordOnboardingStep('choose intent', { value: intentDescription.length });

    if (intentDescription.trim() !== '') {
      plugins.push({
        id: 'intent',
        config: { intent: intentDescription.trim() },
      } as RedteamPluginObject);
    }
  }

  if (plugins.includes('prompt-extraction')) {
    plugins = plugins.filter((p) => p !== 'prompt-extraction');
    plugins.push({
      id: 'prompt-extraction',
      config: { systemPrompt: prompts[0] },
    } as RedteamPluginObject);
  }

  if (plugins.includes('indirect-prompt-injection')) {
    recordOnboardingStep('choose indirect prompt injection variable');
    logger.info(chalk.bold(template.indirectPromptInjectionTitle));
    if (prompts.length === 0) {
      plugins = plugins.filter((p) => p !== 'indirect-prompt-injection');
      recordOnboardingStep('skip indirect prompt injection');
      logger.warn(template.indirectNoPromptWarning);
    } else {
      const variables = extractVariablesFromTemplate(prompts[0]);
      if (variables.length > 1) {
        const indirectInjectionVar = await select({
          message: template.indirectPromptVariableMessage,
          choices: variables.sort().map((variable) => ({
            name: variable,
            value: variable,
          })),
        });
        recordOnboardingStep('chose indirect prompt injection variable');
        plugins = plugins.filter((p) => p !== 'indirect-prompt-injection');
        plugins.push({
          id: 'indirect-prompt-injection',
          config: {
            indirectInjectionVar,
          },
        } as RedteamPluginObject);
      } else {
        plugins = plugins.filter((p) => p !== 'indirect-prompt-injection');
        recordOnboardingStep('skip indirect prompt injection');
        logger.warn(template.indirectMissingVariablesWarning);
      }
    }
  }

  console.clear();

  logger.info(
    dedent`
    ${chalk.bold(template.strategyTitle)}
    ${template.strategySubtitle}
  `,
  );

  const strategyConfigChoice = await select({
    message: template.strategyConfigMessage,
    choices: [
      { name: template.useDefaultsChoice, value: 'default' },
      { name: template.manualChoice, value: 'manual' },
    ],
  });

  recordOnboardingStep('choose strategy config method', { value: strategyConfigChoice });

  let strategies: Strategy[];

  if (strategyConfigChoice === 'default') {
    // TODO(ian): Differentiate strategies
    if (redTeamChoice === 'rag') {
      strategies = Array.from(DEFAULT_STRATEGIES);
    } else if (redTeamChoice === 'agent') {
      strategies = Array.from(DEFAULT_STRATEGIES);
    } else {
      strategies = Array.from(DEFAULT_STRATEGIES);
    }
  } else {
    const strategyChoices = [
      ...Array.from(DEFAULT_STRATEGIES).sort(),
      new Separator(),
      ...Array.from(ADDITIONAL_STRATEGIES).sort(),
    ].map((strategy) =>
      typeof strategy === 'string'
        ? {
            name: `${strategy} - ${subCategoryDescriptions[strategy] || template.noDescriptionLabel}`,
            value: strategy,
            checked: DEFAULT_STRATEGIES.includes(strategy as any),
          }
        : strategy,
    );

    strategies = await checkbox({
      message: template.strategySelectMessage,
      choices: strategyChoices,
      pageSize: process.stdout.rows - 6,
      loop: false,
    });
  }

  recordOnboardingStep('choose strategies', {
    value: strategies,
  });

  const hasHarmfulPlugin = plugins.some(
    (plugin) => typeof plugin === 'string' && plugin.startsWith('harmful'),
  );
  if (hasHarmfulPlugin) {
    recordOnboardingStep('collect email');
    const { hasHarmfulRedteamConsent } = readGlobalConfig();
    if (!hasHarmfulRedteamConsent) {
      const existingEmail = getUserEmail();
      let email = existingEmail;
      if (!existingEmail) {
        logger.info(template.harmfulConsentMessage1);
        logger.info(template.harmfulConsentMessage2);

        email = await input({
          message: `${chalk.bold(template.workEmailMessage)}:`,
          validate: (value) => {
            return value.includes('@') || template.validEmailMessage;
          },
        });
        setUserEmail(email);
      }

      if (email) {
        try {
          await telemetry.saveConsent(email, {
            source: 'redteam init',
          });
          writeGlobalConfigPartial({ hasHarmfulRedteamConsent: true });
        } catch (err) {
          logger.debug(`Failed to save consent: ${(err as Error).message}`);
        }
      }
    }
  }

  // Remove harmful plugin collection if all harmful plugins are already selected
  if (
    plugins
      .map((plugin) => (typeof plugin === 'string' ? plugin : plugin.id))
      .includes('harmful') &&
    Object.keys(HARM_PLUGINS).every((plugin: string) =>
      plugins.map((plugin) => (typeof plugin === 'string' ? plugin : plugin.id)).includes(plugin),
    )
  ) {
    plugins = plugins.filter((plugin) =>
      typeof plugin === 'string' ? plugin !== 'harmful' : plugin.id !== 'harmful',
    );
  }

  const numTests = 5;

  const redteamConfig = renderRedteamConfig({
    purpose,
    language: template.defaultLanguage,
    locale: resolvedLocale,
    numTests,
    plugins,
    strategies,
    prompts,
    providers,
    descriptions: subCategoryDescriptions,
  });
  await fs.writeFile(configPath, redteamConfig, 'utf8');

  if (writeChatPy) {
    await fs.writeFile(path.join(projectDir, 'chat.py'), CUSTOM_PROVIDER_TEMPLATE, 'utf8');
  }

  console.clear();
  logger.info(chalk.green(template.createdConfigMessage(configPath)));

  telemetry.record('command_used', { name: 'redteam init' });
  telemetry.record('redteam init', { phase: 'completed' });
  await recordOnboardingStep('finish');

  if (deferGeneration) {
    logger.info('\n' + chalk.green(template.deferGenerationMessage));
    return;
  } else {
    recordOnboardingStep('offer generate');
    const readyToGenerate = await confirm({
      message: template.readyToGenerateMessage,
      default: true,
    });
    recordOnboardingStep('choose generate', { value: readyToGenerate });

    if (readyToGenerate) {
      try {
        await doGenerateRedteam({
          purpose,
          plugins: plugins.map((plugin) => (typeof plugin === 'string' ? { id: plugin } : plugin)),
          cache: false,
          write: false,
          output: 'redteam.yaml',
          defaultConfig: {},
          defaultConfigPath: configPath,
          numTests,
        });
      } catch (error) {
        if (error instanceof ProbeLimitExceededError) {
          // doGenerateRedteam already logged the user-facing quota message.
          process.exitCode = 1;
          return;
        }
        throw error;
      }
    } else {
      logger.info('\n' + chalk.blue(template.generateLaterMessage));
    }
  }
}

export function initCommand(program: Command) {
  program
    .command('init [directory]')
    .description('Initialize red teaming project')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .option('--locale <locale>', 'Locale for interactive prompt content (e.g. en, ko)')
    .option('--no-gui', 'Do not open the browser UI')
    .action(
      async (
        directory: string | undefined,
        opts: { envPath: string | undefined; gui: boolean; locale: string | undefined },
      ) => {
        setupEnv(opts.envPath);
        const resolvedLocale = resolveRedteamInitLocale(opts.locale);
        const template = REDTEAM_INIT_TEMPLATES[resolvedLocale];
        try {
          // Check if we're in a non-GUI environment
          const isGUI =
            getEnvString('DISPLAY') ||
            process.platform === 'win32' ||
            process.platform === 'darwin';
          const useGui = opts.gui && isGUI;

          if (useGui) {
            const isRunning = await checkServerRunning();

            if (isRunning) {
              await openBrowser(BrowserBehavior.OPEN_TO_REDTEAM_CREATE);
            } else {
              await startServer(getDefaultPort(), BrowserBehavior.OPEN_TO_REDTEAM_CREATE);
            }
          } else {
            await redteamInit(directory, opts.locale);
          }
        } catch (err) {
          if (err instanceof AbortPromptError || err instanceof ExitPromptError) {
            logger.info(
              '\n' +
                chalk.blue(template.pausedMessage) +
                chalk.bold(promptfooCommand('redteam init')),
            );
            logger.info(
              chalk.blue(template.contactMessage) +
                chalk.green('https://www.promptfoo.dev/contact/'),
            );
            await recordOnboardingStep('early exit');
            process.exitCode = 130;
            return;
          } else {
            throw err;
          }
        }
      },
    );
}
