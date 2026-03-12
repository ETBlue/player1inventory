import { useState } from 'react'
import {
  DATA_MODE_STORAGE_KEY,
  type DataMode,
  DEFAULT_DATA_MODE,
} from '@/lib/dataMode'

function getInitialMode(): DataMode {
  const stored = localStorage.getItem(DATA_MODE_STORAGE_KEY)
  if (stored === 'local' || stored === 'cloud') return stored
  return DEFAULT_DATA_MODE
}

export function useDataMode() {
  const [mode, setModeState] = useState<DataMode>(getInitialMode)

  const setMode = (next: DataMode) => {
    localStorage.setItem(DATA_MODE_STORAGE_KEY, next)
    setModeState(next)
  }

  return { mode, setMode }
}
