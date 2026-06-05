export interface JsonCompletionOptions {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  timeoutMs?: number;
}

export async function completeJson<T>({
  apiKey,
  model,
  system,
  user,
  timeoutMs = 60_000,
}: JsonCompletionOptions): Promise<T> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI JSON completion failed: ${response.status} ${body}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI JSON completion did not return message content.');
  }
  return JSON.parse(content) as T;
}
