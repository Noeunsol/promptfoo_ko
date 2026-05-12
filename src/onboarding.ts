import fs from 'fs';
import path from 'path';

import confirm from '@inquirer/confirm';
import { AbortPromptError, ExitPromptError } from '@inquirer/core';
import select from '@inquirer/select';
import chalk from 'chalk';
import dedent from 'dedent';
import { getEnvString } from './envars';
import logger from './logger';
import { redteamInit } from './redteam/commands/init';
import telemetry, { type EventProperties } from './telemetry';
import { promptfooCommand } from './util/promptfooCommand';
import { getNunjucksEngine } from './util/templates';

import type { EnvOverrides } from './types/env';
import type { ProviderOptions } from './types/providers';

export type InitLocale = 'en' | 'ko';

type InitAction = 'compare' | 'rag' | 'agent';
type InitActionSelectionValue = InitAction | 'redteam';
type InitDevelopmentLanguage = 'not_sure' | 'python' | 'javascript';
type InitProviderChoiceKey =
  | 'later'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'huggingface'
  | 'python'
  | 'javascript'
  | 'exec'
  | 'http'
  | 'azure'
  | 'bedrock'
  | 'cohere'
  | 'ollama'
  | 'watsonx';

interface InitActionSelectionChoice {
  name: string;
  value: InitActionSelectionValue;
  description: string;
}

interface InitDevelopmentLanguageSelectionChoice {
  name: string;
  value: InitDevelopmentLanguage;
}

interface InitTemplateRegistryEntry {
  prompts: Record<InitAction, string[]>;
  configTemplate: string;
  actionSelection: {
    message: string;
    choices: InitActionSelectionChoice[];
  };
  developmentLanguageSelection: {
    message: string;
    choices: InitDevelopmentLanguageSelectionChoice[];
  };
  providerSelection: {
    message: string;
    names: Record<InitProviderChoiceKey, string>;
    descriptions?: Partial<Record<InitProviderChoiceKey, string>>;
  };
  readmeTemplate(action?: string): string;
}

const CONFIG_TEMPLATE_EN = `# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json

# Learn more about building a configuration: https://promptfoo.dev/docs/configuration/guide

description: "My eval"

prompts:
  {% for prompt in prompts -%}
  - {{prompt | dump }}
  {% endfor %}

providers:
  {% for provider in providers -%}
  - {{provider | dump }}
  {% endfor %}

tests:
{%- if type == 'rag' or type == 'agent' %}
  - vars:
      inquiry: "I have a problem with my order"
      {% if devLanguage == 'python' -%}
      context: file://context.py
      {%- elif devLanguage == 'javascript' -%}
      context: file://context.js
      {%- else -%}
      context: file://context.py
      {%- endif %}

  - vars:
      inquiry: "I want to return my widget"
      # See how to use dynamic context to e.g. use a vector store https://promptfoo.dev/docs/guides/evaluate-rag/#using-dynamic-context
      {% if devLanguage == 'javascript' -%}
      context: file://context.js
      {%- else -%}
      context: file://context.py
      {%- endif %}
    assert:
      # For more information on assertions, see https://promptfoo.dev/docs/configuration/expected-outputs

      # Make sure output contains the phrase "return label"
      - type: icontains
        value: "return label"

      # Prefer shorter outputs
      {% if devLanguage == 'python' -%}
      - type: python
        value: 1 / (len(output) + 1)
      {%- else -%}
      - type: javascript
        value: 1 / (output.length + 1)
      {%- endif %}

  - vars:
      inquiry: "I need help with my account"
      context: |
        You can also hardcode context directly in the configuration.
        Username: Foobar
        Account ID: 123456
    assert:
      # For more information on model-graded evals, see https://promptfoo.dev/docs/configuration/expected-outputs/model-graded
      - type: llm-rubric
        value: ensure that the output is friendly and empathetic
{%- else %}
  - vars:
      topic: bananas

  - vars:
      topic: avocado toast
    assert:
      # For more information on assertions, see https://promptfoo.dev/docs/configuration/expected-outputs

      # Make sure output contains the word "avocado"
      - type: icontains
        value: avocado

      # Prefer shorter outputs
      - type: javascript
        value: 1 / (output.length + 1)

  - vars:
      topic: new york city
    assert:
      # For more information on model-graded evals, see https://promptfoo.dev/docs/configuration/expected-outputs/model-graded
      - type: llm-rubric
        value: ensure that the output is funny
{% endif %}
`;

/**
 * Promptfoo 초기화 시 한국어 사용자를 위해 제공되는 맞춤형 설정 템플릿입니다.
 * 단순 번역을 넘어 한국어 특유의 문법적 특성과 실무 활용 사례를 반영했습니다.
 */
export const CONFIG_TEMPLATE_KO = `# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json

# 구성 작성 가이드: https://promptfoo.dev/docs/configuration/guide

description: "나의 LLM 평가 프로젝트"

prompts:
  {% for prompt in prompts -%}
  - {{prompt | dump }}
  {% endfor %}

providers:
  {% for provider in providers -%}
  - {{provider | dump }}
  {% endfor %}

tests:
{%- if type == 'rag' or type == 'agent' %}
  - vars:
      inquiry: "배송이 너무 늦어지는데, 현재 위치 확인이 가능한가요?"
      {% if devLanguage == 'python' -%}
      context: file://context.py
      {%- elif devLanguage == 'javascript' -%}
      context: file://context.js
      {%- else -%}
      context: file://context.py
      {%- endif %}

  - vars:
      inquiry: "상품이 파손되어 배송되었습니다. 환불 절차를 알려주세요."
      # RAG/벡터 스토어 연결 가이드: https://promptfoo.dev/docs/guides/evaluate-rag/#using-dynamic-context
      {% if devLanguage == 'javascript' -%}
      context: file://context.js
      {%- else -%}
      context: file://context.py
      {%- endif %}
    assert:
      # Assertion 상세 문법: https://promptfoo.dev/docs/configuration/expected-outputs

      # 핵심 키워드가 포함되어 있는지 확인 (icontains는 조사가 붙어도 감지 가능)
      - type: icontains
        value: "반품"

      # 한국어 특성을 고려한 답변 길이 제한 (너무 길지 않게 설정)
      {% if devLanguage == 'python' -%}
      - type: python
        value: 1 / (len(output) + 1)
      {%- else -%}
      - type: javascript
        value: 1 / (output.length + 1)
      {%- endif %}

  - vars:
      inquiry: "아이디를 잊어버렸어요. 계정 복구를 도와주세요."
      context: |
        여기에 지식 베이스(KB)나 문서 내용을 직접 입력할 수 있습니다.
        사용자 이름: 홍길동
        가입 이메일: support@example.com
    assert:
      # LLM 기반 채점 (모델이 문맥과 톤앤매너를 이해하여 평가)
      # 한국어 맥락 이해도가 높은 GPT-4o나 Claude 3.5 모델 사용을 권장합니다.
      - type: llm-rubric
        value: "답변이 정중한 격식체(하십시오체나 해요체)를 사용하고 있으며, 고객의 문제를 해결하려는 의지가 느껴지는지 확인해줘"
{%- else %}
  - vars:
      topic: "K-POP의 세계적 영향력"

  - vars:
      topic: "제주도 2박 3일 여행 코스 추천"
    assert:
      # 단순 키워드 포함 확인
      - type: icontains
        value: "제주"

      # 답변의 간결성 평가
      - type: javascript
        value: 1 / (output.length + 1)

  - vars:
      topic: "직장인 점심 메뉴 고르기"
    assert:
      # 유머나 창의성 등 주관적인 지표 평가
      - type: llm-rubric
        value: "직장인들이 공감할 만한 애환이 담겨 있으면서도 재치 있게 답변했는지 평가해줘"
{% endif %}
`;

const PYTHON_PROVIDER = `# Learn more about building a Python provider: https://promptfoo.dev/docs/providers/python/

def call_api(prompt, options, context):
    # The 'options' parameter contains additional configuration for the API call.
    config = options.get('config', None)
    additional_option = config.get('additionalOption', None)

    # The 'context' parameter provides info about which vars were used to create the final prompt.
    user_variable = context['vars'].get('userVariable', None)

    # The prompt is the final prompt string after the variables have been processed.
    # Custom logic to process the prompt goes here.
    # For instance, you might call an external API or run some computations.
    # TODO: Replace with actual LLM API implementation.
    def call_llm(prompt):
        return f"Stub response for prompt: {prompt}"
    output = call_llm(prompt)

    # The result should be a dictionary with at least an 'output' field.
    result = {
        "output": output,
    }

    # Optionally include error information:
    # result['error'] = "An error occurred during processing"

    # Optionally report token usage:
    # result['tokenUsage'] = {"total": 100, "prompt": 50, "completion": 50}

    # Optionally flag guardrail violations:
    # result['guardrails'] = {"flagged": True}

    return result
`;

const JAVASCRIPT_PROVIDER = `// Learn more about building a JavaScript provider: https://promptfoo.dev/docs/providers/custom-api
// customApiProvider.js

class CustomApiProvider {
  constructor(options) {
    // Provider ID can be overridden by the config file (e.g. when using multiple of the same provider)
    this.providerId = options.id || 'custom provider';

    // options.config contains any custom options passed to the provider
    this.config = options.config;
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context) {
    // Add your custom API logic here
    // Use options like: \`this.config.temperature\`, \`this.config.max_tokens\`, etc.

    console.log('Vars for this test case:', JSON.stringify(context.vars));

    return {
      // Required
      output: 'Model output',

      // Optional
      tokenUsage: {
        total: 10,
        prompt: 5,
        completion: 5,
      },
    };
  }
}

module.exports = CustomApiProvider;
`;

const BASH_PROVIDER = `# Learn more about building any generic provider: https://promptfoo.dev/docs/providers/custom-script

# Anything printed to standard output will be captured as the output of the provider

echo "This is the LLM output"

# You can also call external scripts or executables
php my_script.php
`;

const WINDOWS_PROVIDER = `@echo off
REM Learn more about building any generic provider: https://promptfoo.dev/docs/providers/custom-script

REM Anything printed to standard output will be captured as the output of the provider

echo This is the LLM output

REM You can also call external scripts or executables
REM php my_script.php
`;

const PYTHON_VAR = `# Learn more about using dynamic variables: https://promptfoo.dev/docs/configuration/guide/#import-vars-from-separate-files
def get_var(var_name, prompt, other_vars):
    # This is where you can fetch documents from a database, call an API, etc.
    # ...

    if var_name == 'context':
        # Return value based on the variable name and test context
        return {
            'output': f"... Documents for {other_vars['inquiry']} in prompt: {prompt} ..."
        }

    # Default variable value
    return {'output': 'Document A, Document B, Document C, ...'}

    # Handle potential errors
    # return { 'error': 'Error message' }
`;

const JAVASCRIPT_VAR = `// Learn more about using dynamic variables: https://promptfoo.dev/docs/configuration/guide/#import-vars-from-separate-files
module.exports = function (varName, prompt, otherVars) {
  // This is where you can fetch documents from a database, call an API, etc.
  // ...

  if (varName === 'context') {
    // Return value based on the variable name and test context
    return {
      output: \`... Documents for \${otherVars.inquiry} for prompt: \${prompt} ...\`
    };
  }

  // Default variable value
  return {
    output: 'Document A, Document B, Document C, ...',
  };

  // Handle potential errors
  // return { error: 'Error message' }
};
`;

const INIT_TEMPLATE_REGISTRY: Record<InitLocale, InitTemplateRegistryEntry> = {
  en: {
    prompts: {
      compare: ['Write a tweet about {{topic}}', 'Write a concise, funny tweet about {{topic}}'],
      rag: [
        'Write a customer service response to:\n\n{{inquiry}}\n\nUse these documents:\n\n{{context}}',
      ],
      agent: ['Fulfill this user helpdesk ticket: {{inquiry}}'],
    },
    configTemplate: CONFIG_TEMPLATE_EN,
    actionSelection: {
      message: 'What would you like to do?',
      choices: [
        {
          name: 'Not sure yet',
          value: 'compare',
          description: 'Get started with a basic prompt comparison',
        },
        {
          name: 'Compare prompts and models',
          value: 'compare',
          description: 'Test different prompts, models, or parameters side by side',
        },
        {
          name: 'Improve RAG performance',
          value: 'rag',
          description: 'Evaluate retrieval-augmented generation pipelines',
        },
        {
          name: 'Improve agent/chain of thought performance',
          value: 'agent',
          description: 'Test agent workflows and tool-calling behavior',
        },
        {
          name: 'Run a red team evaluation',
          value: 'redteam',
          description: 'Scan for security vulnerabilities and compliance risks',
        },
      ],
    },
    developmentLanguageSelection: {
      message: 'What programming language are you developing the app in?',
      choices: [
        { name: 'Not sure yet', value: 'not_sure' },
        { name: 'Python', value: 'python' },
        { name: 'JavaScript', value: 'javascript' },
      ],
    },
    providerSelection: {
      message: 'Which model provider would you like to use?',
      names: {
        later: `I'll choose later`,
        openai: '[OpenAI] GPT 4.1, GPT 4o, ...',
        anthropic: '[Anthropic] Claude Opus, Sonnet, Haiku, ...',
        google: '[Google] Gemini 3.1 Pro, ...',
        huggingface: '[HuggingFace] Llama, Phi, Gemma, ...',
        python: 'Local Python script',
        javascript: 'Local JavaScript script',
        exec: 'Local executable',
        http: 'HTTP endpoint',
        azure: '[Azure] OpenAI, DeepSeek, Llama, ...',
        bedrock: '[AWS Bedrock] Claude, Llama, Titan, ...',
        cohere: '[Cohere] Command R, Command R+, ...',
        ollama: '[Ollama] Llama, Qwen, Phi, ...',
        watsonx: '[WatsonX] Llama, IBM Granite, ...',
      },
    },
    readmeTemplate(action?: string) {
      const useCase =
        action === 'rag'
          ? 'RAG evaluation'
          : action === 'agent'
            ? 'agent evaluation'
            : 'prompt evaluation';

      return `# Promptfoo ${useCase}

## Quick start

1. Set your API key (if using a cloud provider):

\`\`\`bash
export OPENAI_API_KEY=sk-...
# Or for other providers:
# export ANTHROPIC_API_KEY=sk-ant-...
# export GOOGLE_API_KEY=...
\`\`\`

2. Edit \`promptfooconfig.yaml\` to customize prompts, providers, and test cases.

3. Run the evaluation:

\`\`\`bash
${promptfooCommand('eval')}
\`\`\`

4. View results in your browser:

\`\`\`bash
${promptfooCommand('view')}
\`\`\`

## Learn more

- Configuration guide: https://promptfoo.dev/docs/configuration/guide
- All providers: https://promptfoo.dev/docs/providers
- Assertions & metrics: https://promptfoo.dev/docs/configuration/expected-outputs
- Examples: https://github.com/promptfoo/promptfoo/tree/main/examples
`;
    },
  },
  ko: {
    prompts: {
      compare: ['{{topic}}에 대한 트윗을 작성해줘', '{{topic}}에 대한 짧고 재밌는 트윗을 작성해줘'],
      rag: [
        '다음 참고 문서를 바탕으로 고객의 문의에 답변해줘:\n\n문서: {{context}}\n\n문의: {{inquiry}}',
      ],
      agent: [
        '당신은 헬프데스크 전문가입니다. 다음 티켓 내용을 분석하고 해결 방안을 제시해줘: {{inquiry}}',
      ],
    },
    configTemplate: CONFIG_TEMPLATE_KO,
    actionSelection: {
      message: '무엇을 해보고 싶나요?',
      choices: [
        {
          name: '아직 잘 모르겠어요',
          value: 'compare',
          description: '기본적인 프롬프트 비교부터 시작해보기',
        },
        {
          name: '프롬프트 및 모델 비교',
          value: 'compare',
          description: '서로 다른 프롬프트, 모델, 파라미터의 성능을 나란히 비교 테스트',
        },
        {
          name: 'RAG 성능 향상 (검색 증강 생성)',
          value: 'rag',
          description: '문서 검색 기반 생성(RAG) 파이프라인의 정확도와 신뢰성 평가',
        },
        {
          name: 'AI 에이전트 및 추론 성능 향상',
          value: 'agent',
          description: '에이전트 워크플로우와 도구 호출(Tool-calling)의 논리적 동작 테스트',
        },
        {
          name: '레드팀 보안 평가 실행',
          value: 'redteam',
          description: '보안 취약점 스캔 및 유해 콘텐츠 생성 등의 컴플라이언스 리스크 점검',
        },
      ],
    },
    developmentLanguageSelection: {
      message: '어떤 프로그래밍 언어로 앱을 개발하고 있나요?',
      choices: [
        { name: '아직 잘 모르겠어요', value: 'not_sure' },
        { name: 'Python', value: 'python' },
        { name: 'JavaScript', value: 'javascript' },
      ],
    },
    providerSelection: {
      message: '어떤 모델 제공자(Provider)를 사용하여 테스트를 시작하시겠습니까?',
      names: {
        later: '나중에 선택하기 (기본 설정 사용)',
        openai: '[OpenAI] GPT 4o, GPT 4o-mini 등',
        anthropic: '[Anthropic] Claude 3.5 Sonnet, Opus 등',
        google: '[Google] Gemini 3 Flash, Pro 등',
        huggingface: '[HuggingFace] Llama, Phi, Gemma 등',
        python: '로컬 Python 스크립트',
        javascript: '로컬 JavaScript 스크립트',
        exec: '로컬 실행 파일',
        http: 'HTTP 엔드포인트',
        azure: '[Azure] OpenAI, DeepSeek, Llama 등',
        bedrock: '[AWS Bedrock] Claude, Llama, Titan 등',
        cohere: '[Cohere] Command R, Command R+ 등',
        ollama: '[Ollama] Llama, Qwen, Phi (로컬 모델)',
        watsonx: '[WatsonX] Llama, IBM Granite 등',
      },
      descriptions: {
        later: '설정 파일에서 나중에 직접 모델을 추가할 수 있습니다.',
        python: '직접 작성한 Python 코드를 모델 인터페이스로 사용합니다.',
        http: '커스텀 API 서버나 특정 URL로 요청을 보냅니다.',
        ollama: '내 컴퓨터에서 실행 중인 Ollama 모델을 사용합니다.',
      },
    },
    readmeTemplate(action?: string) {
      const useCase =
        action === 'rag'
          ? 'RAG 성능 평가'
          : action === 'agent'
            ? '에이전트 평가'
            : '프롬프트 및 모델 비교 평가';

      return `# Promptfoo ${useCase}

## 빠른 시작

1. API 키를 설정하세요 (클라우드 제공자 사용 시):

\`\`\`bash
export OPENAI_API_KEY=sk-...
# 또는 다른 제공자:
# export ANTHROPIC_API_KEY=sk-ant-...
# export GOOGLE_API_KEY=...
\`\`\`

2. \`promptfooconfig.yaml\`에서 프롬프트, 제공자, 테스트 케이스를 수정하세요.

3. 평가를 실행하세요:

\`\`\`bash
${promptfooCommand('eval')}
\`\`\`

4. 브라우저에서 결과를 확인하세요:

\`\`\`bash
${promptfooCommand('view')}
\`\`\`

## 더 알아보기

- 구성 가이드: https://promptfoo.dev/docs/configuration/guide
- 전체 제공자: https://promptfoo.dev/docs/providers
- Assertions & metrics: https://promptfoo.dev/docs/configuration/expected-outputs
- 예제: https://github.com/promptfoo/promptfoo/tree/main/examples
`;
    },
  },
};

const INIT_LOCALE_MESSAGES: Record<
  InitLocale,
  {
    requiredLabel: string;
    optionalLabel: string;
    overwritePrompt(relativePath: string, requiredText: string): string;
    apiKeyWarning(key: keyof EnvOverrides): string;
    apiKeyInstruction(key: keyof EnvOverrides): string;
  }
> = {
  en: {
    requiredLabel: '(required)',
    optionalLabel: '(optional)',
    overwritePrompt(relativePath, requiredText) {
      return `${relativePath} ${requiredText} already exists. Do you want to overwrite it?`;
    },
    apiKeyWarning(key) {
      return `Warning: ${key} environment variable is not set.`;
    },
    apiKeyInstruction(key) {
      return `Please set this environment variable like: export ${key}=<my-api-key>`;
    },
  },
  ko: {
    requiredLabel: '(필수)',
    optionalLabel: '(선택)',
    overwritePrompt(relativePath, requiredText) {
      return `${relativePath} ${requiredText} 파일이 이미 존재합니다. 덮어쓸까요?`;
    },
    apiKeyWarning(key) {
      return `경고: ${key} 환경 변수가 설정되어 있지 않습니다.`;
    },
    apiKeyInstruction(key) {
      return `다음과 같이 환경 변수를 설정하세요: export ${key}=<my-api-key>`;
    },
  },
};

export function resolveInitLocale(locale: string | undefined): InitLocale {
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

function recordOnboardingStep(step: string, properties: EventProperties = {}) {
  telemetry.record('funnel', {
    type: 'eval onboarding',
    step,
    ...properties,
  });
}

/**
 * Iterate through user choices and determine if the user has selected a provider that needs an API key
 * but has not set and API key in their environment.
 */
export function reportProviderAPIKeyWarnings(
  providerChoices: (string | ProviderOptions)[],
  locale: InitLocale = 'en',
): string[] {
  const ids = providerChoices.map((c) => (typeof c === 'object' ? (c.id ?? '') : c));
  const localeMessages = INIT_LOCALE_MESSAGES[locale];

  const map: Record<string, keyof EnvOverrides> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    vertex: 'GOOGLE_API_KEY',
    google: 'GOOGLE_API_KEY',
    cohere: 'COHERE_API_KEY',
  };

  return Object.entries(map)
    .filter(([prefix, key]) => ids.some((id) => id.startsWith(prefix)) && !getEnvString(key))
    .map(
      ([_prefix, key]) => dedent`
    ${chalk.bold(localeMessages.apiKeyWarning(key))}
    ${localeMessages.apiKeyInstruction(key)}
  `,
    );
}

async function askForPermissionToOverwrite({
  absolutePath,
  relativePath,
  required,
  locale,
}: {
  absolutePath: string;
  relativePath: string;
  required: boolean;
  locale: InitLocale;
}): Promise<boolean> {
  if (!fs.existsSync(absolutePath)) {
    return true;
  }

  const localeMessages = INIT_LOCALE_MESSAGES[locale];
  const requiredText = required ? localeMessages.requiredLabel : localeMessages.optionalLabel;
  const hasPermissionToWrite = await confirm({
    message: localeMessages.overwritePrompt(relativePath, requiredText),
    default: false,
  });

  return hasPermissionToWrite;
}

function buildProviderChoices(
  action: string,
  selection: InitTemplateRegistryEntry['providerSelection'],
): { name: string; value: (string | ProviderOptions)[]; description?: string }[] {
  const openAiProviders: (string | ProviderOptions)[] =
    action === 'agent'
      ? [
          {
            id: 'openai:gpt-4.1-mini',
            config: {
              tools: [
                {
                  type: 'function',
                  function: {
                    name: 'get_current_weather',
                    description: 'Get the current weather in a given location',
                    parameters: {
                      type: 'object',
                      properties: {
                        location: {
                          type: 'string',
                          description: 'The city and state, e.g. San Francisco, CA',
                        },
                      },
                      required: ['location'],
                    },
                  },
                },
              ],
            },
          },
        ]
      : ['openai:gpt-4o-mini', 'openai:gpt-4.1-mini'];

  return [
    {
      name: selection.names.later,
      value: ['openai:gpt-4o-mini', 'openai:gpt-4.1-mini'],
      description: selection.descriptions?.later,
    },
    {
      name: selection.names.openai,
      value: openAiProviders,
    },
    {
      name: selection.names.anthropic,
      value: [
        'anthropic:messages:claude-opus-4-6',
        'anthropic:messages:claude-sonnet-4-5-20250929',
        'anthropic:messages:claude-opus-4-1-20250805',
        'anthropic:messages:claude-3-7-sonnet-20250219',
      ],
    },
    {
      name: selection.names.google,
      value: ['vertex:gemini-3.1-pro-preview', 'vertex:gemini-2.5-pro'],
    },
    {
      name: selection.names.huggingface,
      value: [
        'huggingface:text-generation:meta-llama/Meta-Llama-3.1-8B-Instruct',
        'huggingface:text-generation:microsoft/Phi-4-mini-instruct',
        'huggingface:text-generation:google/gemma-3-4b-it',
      ],
    },
    {
      name: selection.names.python,
      value: ['file://provider.py'],
      description: selection.descriptions?.python,
    },
    {
      name: selection.names.javascript,
      value: ['file://provider.js'],
      description: selection.descriptions?.javascript,
    },
    {
      name: selection.names.exec,
      value: [process.platform === 'win32' ? 'exec:provider.bat' : 'exec:provider.sh'],
      description: selection.descriptions?.exec,
    },
    {
      name: selection.names.http,
      value: ['https://example.com/api/generate'],
      description: selection.descriptions?.http,
    },
    {
      name: selection.names.azure,
      value: [
        {
          id: 'azure:chat:deploymentNameHere',
          config: {
            apiHost: 'xxxxxxxx.openai.azure.com',
          },
        },
      ],
      description: selection.descriptions?.azure,
    },
    {
      name: selection.names.bedrock,
      value: ['bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0'],
      description: selection.descriptions?.bedrock,
    },
    {
      name: selection.names.cohere,
      value: ['cohere:command-r', 'cohere:command-r-plus'],
      description: selection.descriptions?.cohere,
    },
    {
      name: selection.names.ollama,
      value: ['ollama:chat:llama3.3', 'ollama:chat:phi4'],
      description: selection.descriptions?.ollama,
    },
    {
      name: selection.names.watsonx,
      value: [
        'watsonx:meta-llama/llama-3-2-11b-vision-instruct',
        'watsonx:ibm/granite-3-3-8b-instruct',
      ],
      description: selection.descriptions?.watsonx,
    },
  ];
}

/**
 * Context passed to file-writing helpers. Holds the minimum needed to resolve
 * target paths and decide whether an overwrite prompt should run.
 */
interface OnboardingContext {
  interactive: boolean;
  locale: InitLocale;
  outDirectory: string;
  outDirAbsolute: string;
}

/**
 * Onboarding state collected from either the interactive flow or the
 * non-interactive default builder. Downstream config rendering uses this
 * regardless of how it was produced.
 */
interface OnboardingState {
  action: string;
  devLanguage: InitDevelopmentLanguage;
  prompts: string[];
  providers: (string | object)[];
  /**
   * Set when the interactive flow short-circuits to the redteam initializer;
   * createDummyFiles uses this to return early without rendering a standard
   * config.
   */
  redteamEarlyReturn?: {
    numPrompts: number;
    providerPrefixes: string[];
    action: 'redteam';
    language: 'not_applicable';
    locale: InitLocale;
    outDirectory: string;
  };
}

/**
 * Writes a file, optionally prompting the user to confirm an overwrite when
 * the context is interactive and the target already exists. Previously an
 * inner closure inside createDummyFiles; extracted to a free function so the
 * sub-flows below can call it directly.
 */
async function writeOnboardingFile(
  ctx: OnboardingContext,
  { file, contents, required }: { file: string; contents: string; required: boolean },
): Promise<void> {
  const relativePath = path.join(ctx.outDirectory, file);
  const absolutePath = path.join(ctx.outDirAbsolute, file);

  if (ctx.interactive) {
    const hasPermissionToWrite = await askForPermissionToOverwrite({
      absolutePath,
      relativePath,
      required,
      locale: ctx.locale,
    });

    if (!hasPermissionToWrite) {
      if (required) {
        logger.warn(`⚠️ Skipping required file ${relativePath} - configuration may be incomplete`);
      } else {
        logger.info(`⏩ Skipping ${relativePath}`);
      }
      return;
    }
  }

  fs.writeFileSync(absolutePath, contents);
  logger.info(`📝 Wrote ${relativePath}`);
}

/**
 * Writes provider scaffolding scripts (provider.js / provider.py / provider.sh
 * or provider.bat) for any file:// or exec: provider the user selected.
 */
async function writeProviderScripts(
  ctx: OnboardingContext,
  providerChoices: (string | ProviderOptions)[],
): Promise<void> {
  const hasJsProvider = providerChoices.some(
    (choice) =>
      typeof choice === 'string' && choice.startsWith('file://') && choice.endsWith('.js'),
  );
  if (hasJsProvider) {
    await writeOnboardingFile(ctx, {
      file: 'provider.js',
      contents: JAVASCRIPT_PROVIDER,
      required: true,
    });
  }

  const hasExecProvider = providerChoices.some(
    (choice) => typeof choice === 'string' && choice.startsWith('exec:'),
  );
  if (hasExecProvider) {
    const isWindows = process.platform === 'win32';
    await writeOnboardingFile(ctx, {
      file: isWindows ? 'provider.bat' : 'provider.sh',
      contents: isWindows ? WINDOWS_PROVIDER : BASH_PROVIDER,
      required: true,
    });
  }

  const hasPyProvider = providerChoices.some(
    (choice) =>
      typeof choice === 'string' &&
      (choice.startsWith('python:') || (choice.startsWith('file://') && choice.endsWith('.py'))),
  );
  if (hasPyProvider) {
    await writeOnboardingFile(ctx, {
      file: 'provider.py',
      contents: PYTHON_PROVIDER,
      required: true,
    });
  }
}

/**
 * Populates `prompts` with the action-specific default prompt(s). The compare
 * flow may push a second prompt when provider count is low (see original
 * logic).
 */
function pushPromptsForAction(
  action: string,
  templates: InitTemplateRegistryEntry,
  providers: (string | object)[],
  prompts: string[],
): void {
  if (action === 'compare') {
    prompts.push(templates.prompts.compare[0]);
    if (providers.length < 3) {
      prompts.push(templates.prompts.compare[1]);
    }
  } else if (action === 'rag') {
    prompts.push(templates.prompts.rag[0]);
  } else if (action === 'agent') {
    prompts.push(templates.prompts.agent[0]);
  }
}

/**
 * Writes context.js / context.py when the action is rag or agent. The dev
 * language selection determines which file extension is generated.
 */
async function maybeWriteContextFile(
  ctx: OnboardingContext,
  action: string,
  devLanguage: InitDevelopmentLanguage,
): Promise<void> {
  if (action !== 'rag' && action !== 'agent') {
    return;
  }
  if (devLanguage === 'javascript') {
    await writeOnboardingFile(ctx, {
      file: 'context.js',
      contents: JAVASCRIPT_VAR,
      required: true,
    });
  } else {
    await writeOnboardingFile(ctx, { file: 'context.py', contents: PYTHON_VAR, required: true });
  }
}

/**
 * Interactive onboarding flow. Prompts the user for action / dev language /
 * provider, writes any provider scaffolding scripts and a context file when
 * relevant, and returns the assembled state. If the user selects redteam,
 * delegates to redteamInit and returns a state whose `redteamEarlyReturn`
 * field tells the caller to short-circuit.
 */
async function runInteractiveOnboarding(
  ctx: OnboardingContext,
  templates: InitTemplateRegistryEntry,
): Promise<OnboardingState> {
  recordOnboardingStep('start');

  logger.info(
    chalk.bold('\nWelcome to Promptfoo!\n') +
      chalk.gray("We'll set up a configuration file to get you started.\n"),
  );

  const action: string = await select({
    message: templates.actionSelection.message,
    choices: templates.actionSelection.choices,
  });
  recordOnboardingStep('choose app type', { value: action });

  if (action === 'redteam') {
    await redteamInit(ctx.outDirectory);
    return {
      action: 'redteam',
      devLanguage: 'not_sure',
      prompts: [],
      providers: [],
      redteamEarlyReturn: {
        numPrompts: 0,
        providerPrefixes: [],
        action: 'redteam',
        language: 'not_applicable',
        locale: ctx.locale,
        outDirectory: ctx.outDirectory,
      },
    };
  }

  let devLanguage: InitDevelopmentLanguage = 'not_sure';
  if (action === 'rag' || action === 'agent') {
    devLanguage = await select({
      message: templates.developmentLanguageSelection.message,
      choices: templates.developmentLanguageSelection.choices,
    });
    recordOnboardingStep('choose language', { value: devLanguage });
  }

  const providerChoice = await select({
    message: templates.providerSelection.message,
    choices: buildProviderChoices(action, templates.providerSelection),
    loop: false,
    pageSize: process.stdout.rows - 6,
  });
  const providerChoices: (string | ProviderOptions)[] = Array.isArray(providerChoice)
    ? providerChoice
    : [providerChoice];

  recordOnboardingStep('choose providers', {
    value: providerChoices.map((choice) =>
      typeof choice === 'string' ? choice : JSON.stringify(choice),
    ),
  });

  reportProviderAPIKeyWarnings(providerChoices, ctx.locale).forEach((warningText) =>
    logger.warn(warningText),
  );

  const providers: (string | object)[] = [];
  if (providerChoices.length > 0) {
    if (providerChoices.length > 3) {
      providers.push(
        ...providerChoices.map((choice) => (Array.isArray(choice) ? choice[0] : choice)),
      );
    } else {
      providers.push(...providerChoices);
    }
    await writeProviderScripts(ctx, providerChoices);
  } else {
    providers.push('openai:gpt-4o-mini');
    providers.push('openai:gpt-4.1-mini');
  }

  const prompts: string[] = [];
  pushPromptsForAction(action, templates, providers, prompts);
  await maybeWriteContextFile(ctx, action, devLanguage);

  recordOnboardingStep('complete');

  return { action, devLanguage, prompts, providers };
}

/**
 * Non-interactive defaults used when --no-interactive is passed. Mirrors the
 * values that the interactive flow would produce for the compare action.
 */
function buildNonInteractiveDefaults(templates: InitTemplateRegistryEntry): OnboardingState {
  return {
    action: 'compare',
    devLanguage: 'not_sure',
    prompts: [templates.prompts.compare[0], templates.prompts.compare[1]],
    providers: ['openai:gpt-4o-mini', 'openai:gpt-4.1-mini'],
  };
}

export async function createDummyFiles(
  directory: string | null,
  interactive: boolean = true,
  locale: string | undefined = undefined,
) {
  const outDirectory = directory || '.';
  const outDirAbsolute = path.join(process.cwd(), outDirectory);
  const resolvedLocale = resolveInitLocale(locale);
  const templates = INIT_TEMPLATE_REGISTRY[resolvedLocale];

  if (!fs.existsSync(outDirAbsolute)) {
    fs.mkdirSync(outDirAbsolute, { recursive: true });
  }

  const ctx: OnboardingContext = {
    interactive,
    locale: resolvedLocale,
    outDirectory,
    outDirAbsolute,
  };

  const state = interactive
    ? await runInteractiveOnboarding(ctx, templates)
    : buildNonInteractiveDefaults(templates);

  if (state.redteamEarlyReturn) {
    return state.redteamEarlyReturn;
  }

  const nunjucks = getNunjucksEngine();
  const config = nunjucks.renderString(templates.configTemplate, {
    prompts: state.prompts,
    providers: state.providers,
    type: state.action,
    devLanguage: state.devLanguage,
  });

  await writeOnboardingFile(ctx, {
    file: 'README.md',
    contents: templates.readmeTemplate(state.action),
    required: false,
  });

  await writeOnboardingFile(ctx, {
    file: 'promptfooconfig.yaml',
    contents: config,
    required: true,
  });

  return {
    numPrompts: state.prompts.length,
    providerPrefixes: state.providers.map((p) =>
      typeof p === 'string' ? p.split(':')[0] : 'unknown',
    ),
    action: state.action,
    language: state.devLanguage,
    locale: resolvedLocale,
    outDirectory,
  };
}

export async function initializeProject(
  directory: string | null,
  interactive: boolean = true,
  locale: string | undefined = undefined,
) {
  try {
    const result = await createDummyFiles(directory, interactive, locale);
    const { outDirectory, ...telemetryDetails } = result;

    const runCommand = promptfooCommand('eval');
    const viewCommand = promptfooCommand('view');

    logger.info('');
    if (outDirectory === '.') {
      logger.info(chalk.green(`✅ Setup complete! Next steps:\n`));
      logger.info(`  ${chalk.bold('1.')} Run ${chalk.cyan(runCommand)} to evaluate your prompts`);
      logger.info(
        `  ${chalk.bold('2.')} Run ${chalk.cyan(viewCommand)} to view results in your browser`,
      );
    } else {
      logger.info(chalk.green(`✅ Wrote promptfooconfig.yaml to ./${outDirectory}\n`));
      logger.info(`  ${chalk.bold('1.')} Run ${chalk.cyan(`cd ${outDirectory}`)}`);
      logger.info(`  ${chalk.bold('2.')} Run ${chalk.cyan(runCommand)} to evaluate your prompts`);
      logger.info(
        `  ${chalk.bold('3.')} Run ${chalk.cyan(viewCommand)} to view results in your browser`,
      );
    }
    logger.info('');
    logger.info(chalk.gray(`  Docs: https://promptfoo.dev/docs/configuration/guide`));

    return telemetryDetails;
  } catch (err) {
    if (err instanceof ExitPromptError || err instanceof AbortPromptError) {
      const runCommand = promptfooCommand('init');
      logger.info(
        '\n' +
          chalk.blue('Initialization paused. To continue setup later, use the command: ') +
          chalk.bold(runCommand),
      );
      logger.info(
        chalk.blue('For help or feedback, visit ') +
          chalk.green('https://www.promptfoo.dev/contact/'),
      );
      await recordOnboardingStep('early exit');
      process.exitCode = 130;
      return;
    } else {
      throw err;
    }
  }
}
