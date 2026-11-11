import { useEffect } from 'react'
import { TOAST_DURATION, useNotify } from './Notifications'

export const SIGN_IN_BANNER_DURATION = TOAST_DURATION

export function showSignInBanner() {
  window.dispatchEvent(new Event('app:signed-in'))
}

export default function SignInBanner() {
  const notify = useNotify()
  useEffect(() => {
    const show = () => notify({ tone: 'success', text: 'Successfully signed in!' })
    window.addEventListener('app:signed-in', show)
    return () => window.removeEventListener('app:signed-in', show)
  }, [notify])
  return null
}
