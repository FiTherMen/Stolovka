import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { isConfigured, supabase } from '../lib/supabase'
import { DEFAULT_SETTINGS } from '../lib/time'
import type { Settings } from '../types'

const SettingsContext = createContext<{ settings: Settings; reload: () => Promise<void> }>({
  settings: DEFAULT_SETTINGS,
  reload: async () => {},
})

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  const reload = useCallback(async () => {
    if (!isConfigured) return
    const { data } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle()
    if (data) setSettings({ ...DEFAULT_SETTINGS, ...data, platform_fee_percent: Number(data.platform_fee_percent) })
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return <SettingsContext.Provider value={{ settings, reload }}>{children}</SettingsContext.Provider>
}

export const useSettings = () => useContext(SettingsContext)
