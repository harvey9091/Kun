import { useTranslation } from 'react-i18next'
import { useChatStore } from '../../store/chat-store'

/**
 * Actions for terminal turn runtime errors. The Continue prompt differs by
 * error code: output truncation asks the model to resume with smaller pieces,
 * while restart interrupts ask it to verify state and finish the original task.
 */
export function useTurnRuntimeErrorActions(): {
  continueInterruptedTask: (code?: string) => void
  retryTurn: (turnId?: string) => void
  openProviderSettings: () => void
  openAgentSettings: () => void
} {
  const { t } = useTranslation('common')
  const sendMessage = useChatStore((s) => s.sendMessage)
  const openSettings = useChatStore((s) => s.openSettings)
  return {
    continueInterruptedTask: (code) => {
      void sendMessage(
        t(
          code === 'output_truncated'
            ? 'continueTruncatedTaskPrompt'
            : 'continueInterruptedTaskPrompt'
        )
      )
    },
    // Re-run the exact request that failed. For a transient provider failure
    // (busy / rate limited) the failed turn produced no answer, so rewinding to
    // its user message and resending it is a faithful retry without a file
    // reset. The turn id comes from the error block itself.
    retryTurn: (turnId) => {
      if (!turnId) return
      const state = useChatStore.getState()
      let target: (typeof state.blocks)[number] | undefined
      for (const block of state.blocks) {
        if (block.kind === 'user' && block.meta?.turnId === turnId) target = block
      }
      if (!target || target.kind !== 'user') return
      void state.rewindAndResend(target.id, target.text)
    },
    openProviderSettings: () => openSettings('providers'),
    openAgentSettings: () => openSettings('agentsHarnesses')
  }
}
