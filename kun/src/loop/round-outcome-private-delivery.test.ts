import { describe, expect, it } from 'vitest'
import type { ToolHostContext } from '../ports/tool-host.js'
import type { ModelRoundStreamResult } from '../loop/model-round-engine.js'
import type { TurnItem } from '../contracts/items.js'
import type { ModelRequest } from '../ports/model-client.js'
import {
  makeAssistantTextItem,
  makeToolCallItem,
  makeToolResultItem,
  makeUserItem
} from '../domain/item.js'
import { projectCompatMessages } from '../adapters/model/compat-message-projector.js'
import { completed, harness, input, prepared, threadId, turnId } from '../../tests/loop-cases/round-outcome-support.cases.js'

const roomContext = { roomStepKind: 'conversation', roomAgent: true } as ToolHostContext
const delivery = (phase: 'start' | 'progress' | 'none', overrides: Record<string, unknown> = {}) => prepared({
  toolDiscoveryContext: roomContext,
  privateDelivery: { gate: phase, communicationRequired: true, published: phase !== 'start',
    finalResponseRequired: true, waitingOnUser: false, finalCurrent: false, workSinceVisible: 0, ...overrides }
})

describe('private Room public response boundary', () => {
  it('suppresses 44 work calls and dispatches only the first public response', async () => {
    const h = harness({ ordinaryResults: [{ output: { accepted: true, phase: 'start' }, isError: false }] })
    const business = Array.from({ length: 44 }, (_, n) => ({ callId: `bash-${n}`, toolName: 'bash',
      arguments: { command: 'echo work' } }))
    const message = { callId: 'say', toolName: 'send_im_message', arguments: { text: 'I will inspect the logs.', phase: 'start' } }
    await expect(h.coordinator.resolve(input(completed({ toolCalls: [...business, message] }), {
      prepared: delivery('start')
    }))).resolves.toBe('continue')
    expect(h.suppressToolCalls).toHaveBeenCalledOnce()
    const [suppressed] = h.suppressToolCalls.mock.lastCall as unknown as [{ calls: unknown[] }]
    expect(suppressed.calls).toHaveLength(44)
    expect(h.dispatches.map((entry) => entry.calls.map((call) => call.toolName))).toEqual([['send_im_message']])
  })

  it('attempts the plain-text fallback on the first clean answer, not after a nudge', async () => {
    // No accepted result configured: the publish is attempted on the FIRST completion
    // and fails because the tool host never accepts it. No nudge model calls precede it.
    const h = harness()
    const request = input(completed({ text: 'I will start now.' }), {
      prepared: delivery('start'), toolKinds: new Map([['send_im_message', 'tool_call']])
    })
    expect(await h.coordinator.resolve(request)).toBe('failed')
    expect(h.dispatches.map((entry) => entry.calls.map((call) => call.toolName))).toEqual([['send_im_message']])
    expect(h.failures).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'im_final_missing' })]))
  })

  it('bounds retries when the publication tool itself fails', async () => {
    const h = harness({ ordinaryResults: Array.from({ length: 3 }, () => ({ output: { error: 'persistence failed' }, isError: true })) })
    const request = input(completed({ toolCalls: [{ callId: 'say', toolName: 'send_im_message', arguments: { text: 'Starting' } }] }), {
      prepared: delivery('start')
    })
    expect(await h.coordinator.resolve(request)).toBe('continue')
    expect(await h.coordinator.resolve(request)).toBe('continue')
    expect(await h.coordinator.resolve(request)).toBe('failed')
    expect(h.dispatches.every((entry) => entry.calls.every((call) => call.toolName === 'send_im_message'))).toBe(true)
  })

  it('does not mistake an already connected app for a visible connection card', async () => {
    const h = harness({ ordinaryResults: [{ output: { connected: true, serverId: 'gmail' }, isError: false }] })
    const request = input(completed({ toolCalls: [{ callId: 'app', toolName: 'request_app_connection',
      arguments: { serverId: 'gmail' } }] }), { prepared: delivery('start') })
    expect(await h.coordinator.resolve(request)).toBe('continue')
    expect(h.coordinator.imPublicationRecoverySteps(request.turnId)).toBe(1)
  })

  it('does not treat a start update as a final answer', async () => {
    const h = harness()
    const request = input(completed(), {
      prepared: delivery('none', { published: true, lastPhase: 'start' }),
      toolKinds: new Map([['send_im_message', 'tool_call']])
    })
    expect(await h.coordinator.resolve(request)).toBe('continue')
    expect(h.coordinator.imPublicationRecoverySteps(request.turnId)).toBe(1)
    expect(await h.coordinator.resolve(input(completed(), {
      prepared: delivery('none', { published: true, lastPhase: 'final', finalCurrent: true }),
      toolKinds: new Map([['send_im_message', 'tool_call']])
    }))).toBe('stop')
  })

  it('runs checks after a final answer and then ends without republishing or failing', async () => {
    const h = harness({ ordinaryResults: [{ output: { stdout: '51G available' }, isError: false }] })
    const afterFinal = delivery('none', { published: true, lastPhase: 'final', finalCurrent: true, workSinceVisible: 7 })
    const tools = new Map([['send_im_message', 'tool_call' as const]])
    expect(await h.coordinator.resolve(input(completed({ toolCalls: [{ callId: 'check', toolName: 'bash',
      arguments: { command: 'df -h' } }] }), { prepared: afterFinal, toolKinds: tools }))).toBe('continue')
    expect(h.suppressToolCalls).not.toHaveBeenCalled()
    expect(await h.coordinator.resolve(input(completed({ text: 'Verified.' }), { prepared: afterFinal, toolKinds: tools })))
      .toBe('stop')
    expect(h.coordinator.imPublicationRecoverySteps(turnId)).toBe(0)
    expect(h.failures).toEqual([])
  })

  it('requires a final result after an app-connection continuation without requiring a new start', async () => {
    const h = harness()
    const request = input(completed(), { prepared: delivery('none', { communicationRequired: false,
      finalResponseRequired: true, published: false }), toolKinds: new Map([['send_im_message', 'tool_call']]) })
    expect(await h.coordinator.resolve(request)).toBe('continue')
  })

  it('publishes a plain-text answer as final on the first clean completion', async () => {
    const h = harness({ ordinaryResults: [{ output: { accepted: true }, isError: false }] })
    const request = input(completed({ text: 'Here is the answer.' }), {
      prepared: delivery('start'), toolKinds: new Map([['send_im_message', 'tool_call']])
    })
    // No prior nudge: one clean completion is enough to publish the answer.
    expect(await h.coordinator.resolve(request)).toBe('stop')
    expect(h.dispatches.map((entry) => entry.calls.map((call) => call.toolName))).toEqual([['send_im_message']])
    expect(h.failures).toEqual([])
    expect(h.coordinator.imPublicationRecoverySteps(turnId)).toBe(0)
  })

  it('still fails im_final_missing when the plain-text answer is empty', async () => {
    const h = harness()
    const request = input(completed({ text: '   ' }), {
      prepared: delivery('start'), toolKinds: new Map([['send_im_message', 'tool_call']])
    })
    expect(await h.coordinator.resolve(request)).toBe('continue')
    expect(await h.coordinator.resolve(request)).toBe('continue')
    expect(await h.coordinator.resolve(request)).toBe('failed')
    expect(h.dispatches).toHaveLength(0)
    expect(h.failures).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'im_final_missing' })]))
  })

  it('does not publish a final answer when the stream failed after text', async () => {
    const h = harness({ ordinaryResults: [{ output: { accepted: true }, isError: false }] })
    const request = input({ kind: 'failed' } as ModelRoundStreamResult, {
      prepared: delivery('start'), toolKinds: new Map([['send_im_message', 'tool_call']])
    })
    expect(await h.coordinator.resolve(request)).toBe('failed')
    expect(h.dispatches).toHaveLength(0)
  })

  it('records a paired assistant tool_call so the next-turn request stays valid', async () => {
    const answer = 'Here is the answer.'
    const h = harness({ ordinaryResults: [{ output: { accepted: true }, isError: false }] })
    const request = input(completed({ text: answer }), {
      prepared: delivery('start'), toolKinds: new Map([['send_im_message', 'tool_call']])
    })
    expect(await h.coordinator.resolve(request)).toBe('stop')

    const callId = h.dispatches[0]?.calls[0]?.callId
    expect(callId).toBeTruthy()
    // The publish appends a matching assistant tool_call (recorded by the coordinator)
    // and a tool_result (produced by the dispatcher) sharing the same call id.
    const recordedCall = h.items.find((item) => item.kind === 'tool_call' && item.callId === callId)
    expect(recordedCall).toBeTruthy()
    const recordedResult = h.sessionItems.find(
      (item) => item.kind === 'tool_result' && item.callId === callId)
    expect(recordedResult).toBeTruthy()
    if (!recordedCall || !recordedResult) return

    // Build the next-turn request from the resulting history and project it.
    const nextTurnId = 'turn_next'
    const history: TurnItem[] = [
      makeAssistantTextItem({ id: 'a1', threadId, turnId, text: answer }),
      makeToolCallItem({
        id: `item_tool_${turnId}_${callId}`, threadId, turnId, callId: callId!,
        toolName: 'send_im_message', arguments: { text: answer, phase: 'final' }, status: 'completed'
      }),
      makeToolResultItem({
        id: `item_${callId}`, threadId, turnId, callId: callId!,
        toolName: 'send_im_message', output: { accepted: true }, isError: false
      }),
      makeUserItem({ id: 'u2', threadId, turnId: nextTurnId, text: 'next question' })
    ]
    const messages = projectCompatMessages({
      threadId, turnId: nextTurnId, model: 'test-model', prefix: [], history,
      tools: [], abortSignal: new AbortController().signal
    } as ModelRequest, { thinkingMode: false, supportsImages: false })

    // The assistant message carries the synthetic tool call, immediately followed by
    // a tool result bound to the same id — no orphan tool message reaches the provider.
    const callIds = new Set<string>()
    messages.forEach((message, index) => {
      if (message.role === 'assistant' && message.tool_calls?.length) {
        message.tool_calls.forEach((call) => callIds.add(call.id))
      }
      if (message.role === 'tool') {
        expect(message.tool_call_id).toBeTruthy()
        expect(callIds.has(message.tool_call_id!)).toBe(true)
        // Every tool result directly follows its assistant tool_call block.
        expect(messages[index - 1]?.role).toBe('assistant')
      }
    })
    expect([...callIds]).toEqual([callId])
    const pairedTool = messages.find((message) => message.role === 'tool')
    expect(pairedTool).toMatchObject({ role: 'tool', tool_call_id: callId })

    // The published answer appears exactly once (no duplicate final message).
    const answerCount = messages.filter(
      (message) => message.role === 'assistant' &&
      typeof message.content === 'string' && message.content.includes(answer)).length
    expect(answerCount).toBe(1)
  })
})
