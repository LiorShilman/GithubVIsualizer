export type AIProvider = 'claude' | 'openai';

export type AIModel =
  // Claude
  | 'claude-opus-4-6'
  | 'claude-sonnet-4-6'
  // OpenAI
  | 'gpt-5.4'
  | 'gpt-5.4-mini'
  | 'gpt-5.4-nano'
  | 'gpt-5.3-codex';

export interface AIModelOption {
  id: AIModel;
  label: string;
  provider: AIProvider;
}

export const AI_MODELS: AIModelOption[] = [
  // Claude
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', provider: 'claude' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'claude' },
  // OpenAI
  { id: 'gpt-5.4', label: 'GPT-5.4', provider: 'openai' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', provider: 'openai' },
  { id: 'gpt-5.4-nano', label: 'GPT-5.4 Nano', provider: 'openai' },
  { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex', provider: 'openai' },
];

export function getProviderForModel(model: AIModel): AIProvider {
  return AI_MODELS.find((m) => m.id === model)?.provider || 'claude';
}

function buildPrompt(code: string, sectionName: string, sectionType: string, filePath: string): string {
  return `You are a code analysis expert. Analyze the following code section and explain it in a clear, educational way that helps a developer understand it quickly.

**File:** \`${filePath}\`
**Section:** ${sectionName} (${sectionType})

\`\`\`
${code}
\`\`\`

Provide your analysis in this structure:
1. **Summary** — What does this code do? (1-2 sentences)
2. **How it works** — Step-by-step explanation of the logic
3. **Key concepts** — Important patterns, techniques, or APIs used
4. **Dependencies** — What this code depends on and what depends on it
5. **Potential issues** — Any edge cases, performance concerns, or improvements

Keep the explanation concise but thorough. Use simple language. If there are complex patterns, explain them with analogies.`;
}

async function callClaude(
  apiKey: string,
  model: AIModel,
  prompt: string,
  onChunk: (text: string) => void
): Promise<void> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error (${response.status}): ${err}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            onChunk(parsed.delta.text);
          }
        } catch {
          // skip non-JSON lines
        }
      }
    }
  }
}

async function callOpenAI(
  apiKey: string,
  model: AIModel,
  prompt: string,
  onChunk: (text: string) => void
): Promise<void> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${err}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onChunk(content);
        } catch {
          // skip
        }
      }
    }
  }
}

export async function analyzeCode(
  code: string,
  sectionName: string,
  sectionType: string,
  filePath: string,
  apiKey: string,
  model: AIModel,
  onChunk: (text: string) => void
): Promise<void> {
  const prompt = buildPrompt(code, sectionName, sectionType, filePath);
  const provider = getProviderForModel(model);

  if (provider === 'claude') {
    await callClaude(apiKey, model, prompt, onChunk);
  } else {
    await callOpenAI(apiKey, model, prompt, onChunk);
  }
}
