import { useEffect, useState } from 'react'

export function useTheme(initialDark = true) {
  const [dark, setDark] = useState(initialDark)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (meta) meta.content = dark ? '#0b0b0b' : '#f9fafb'
  }, [dark])

  return [dark, setDark] as const
}

