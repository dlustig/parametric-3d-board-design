// Shell spec §3: after the pre-paint script, keep <html data-theme> and
// color-scheme equal to the resolved preference, following the OS setting
// live while the preference is 'system'.

import { useEffect } from 'react'
import { resolveTheme, useLayout } from '@/editor/layout'

export function useThemeSync(): void {
  const pref = useLayout((s) => s.theme)
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const theme = resolveTheme(pref, media.matches)
      document.documentElement.dataset.theme = theme
      document.documentElement.style.colorScheme = theme
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [pref])
}
