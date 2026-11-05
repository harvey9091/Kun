import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelRequest, ModelStreamChunk } from '../../ports/model-client.js'
import { CompatModelClient } from './compat-model-client.js'

// A free-tier proxy that owns its own model routing answers a concrete model it
// cannot serve with HTTP 503 / `no_providers_configured` and `failoverAllowed:
// true`. The composer sometimes pins a specific model (e.g. "agnes 2.0 flash"),
// which the proxy rejects while its default "auto" route works. The client must
// re-issue exactly once on the provider default instead of surfacing the 503.
function unavailable503(): Response {
  return Response.json(
    { error: { code: 'no_providers_configured', message: 'no usable provider key configured' } },
    { status: 503, headers: { 'retry-after': '29' } }
  )
}

function okChat(content: string): Response {
  return Response.json({
    id: 'c', object: 'chat.completion',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
  })
}

function request(model: string): ModelRequest {
  return {
    threadId: 'fixture-thread', turnId: 'fixture-turn', model,
    providerId: 'freellm-proxy', systemPrompt: 'Fixture', prefix: [],
    history: [], tools: [], abortSignal: new AbortController().signal,
    stream: false, maxRetryAttempts: 0
  }
}

function client(fetchImpl: typeof fetch): CompatModelClient {
  return new CompatModelClient({
    baseUrl: 'https://proxy.invalid/v1', apiKey: 'fixture-credential',
    providerId: 'freellm-proxy', model: 'agnes 2.0 flash',
    endpointFormat: 'chat_completions', nonStreaming: true, fetchImpl
  })
}

async function collect(req: ModelRequest, fetchImpl: typeof fetch): Promise<ModelStreamChunk[]> {
  const chunks: ModelStreamChunk[] = []
  for await (const chunk of client(fetchImpl).stream(req)) chunks.push(chunk)
  return chunks
}

afterEach(() => vi.restoreAllMocks())

describe('CompatModelClient provider-default auto failover', () => {
  it('re-issues once with model "auto" when a concrete model gets no_providers_configured', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const models: unknown[] = []
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      models.push(body.model)
      return models.length === 1 ? unavailable503() : okChat('recovered')
    }) as unknown as typeof fetch

    const chunks = await collect(request('agnes 2.0 flash'), fetchImpl)

    expect(models).toEqual(['agnes 2.0 flash', 'auto'])
    expect(chunks.some((chunk) => chunk.kind === 'error')).toBe(false)
    const text = chunks
      .filter((chunk): chunk is Extract<ModelStreamChunk, { kind: 'assistant_text_delta' }> => chunk.kind === 'assistant_text_delta')
      .map((chunk) => chunk.text)
      .join('')
    expect(text).toContain('recovered')
  })

  it('surfaces the original error and stops after a single failover when "auto" also fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchImpl = vi.fn(async () => unavailable503()) as unknown as typeof fetch

    const chunks = await collect(request('agnes 2.0 flash'), fetchImpl)

    // One concrete attempt + exactly one "auto" re-issue; no runaway recursion.
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const error = chunks.find((chunk) => chunk.kind === 'error') as
      Extract<ModelStreamChunk, { kind: 'error' }> | undefined
    expect(error?.code).toBe('no_providers_configured')
  })

  it('does not fail over when the request already used the provider default', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchImpl = vi.fn(async () => unavailable503()) as unknown as typeof fetch

    await collect(request('auto'), fetchImpl)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
