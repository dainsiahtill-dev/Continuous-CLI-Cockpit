import { useCallback, useEffect, useState } from 'react'
import type { RuntimeHealth } from '../types/electron'

export type RuntimeHealthController = {
  health: RuntimeHealth | null
  isChecking: boolean
  refresh: () => Promise<void>
}

/**
 * Loads local runtime readiness for optional backends such as WSL and tmux.
 */
export function useRuntimeHealth(): RuntimeHealthController {
  const [health, setHealth] = useState<RuntimeHealth | null>(null)
  const [isChecking, setIsChecking] = useState(true)

  const refresh = useCallback(async () => {
    setIsChecking(true)
    try {
      setHealth(await window.cliAPI.getHealth())
    } finally {
      setIsChecking(false)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    window.cliAPI
      .getHealth()
      .then((value) => {
        if (mounted) setHealth(value)
      })
      .finally(() => {
        if (mounted) setIsChecking(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  return { health, isChecking, refresh }
}
