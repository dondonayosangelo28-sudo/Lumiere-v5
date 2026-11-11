// Shared policy for account activation, password reset, and password changes.
export interface PasswordPolicy {
  minLength: number
  maxLength: number
}

export const passwordPolicy: PasswordPolicy = { minLength: 8, maxLength: 128 }

// Count Unicode code points so emoji or accented characters are not double-counted.
export const passwordLength = (value: string) => [...value].length

export function passwordChecks(value: string, confirm: string, policy = passwordPolicy) {
  const length = passwordLength(value)
  return [
    { id: 'min', label: `At least ${policy.minLength} characters`, met: length >= policy.minLength },
    { id: 'max', label: `No more than ${policy.maxLength} characters`, met: length > 0 && length <= policy.maxLength },
    { id: 'match', label: 'Both passwords match', met: value.length > 0 && value === confirm },
  ]
}

export function passwordError(value: string, policy = passwordPolicy) {
  const length = passwordLength(value)
  if (!length) return 'Enter a password.'
  if (length < policy.minLength) return `Use at least ${policy.minLength} characters.`
  if (length > policy.maxLength) return `Use no more than ${policy.maxLength} characters.`
  return ''
}

// Guidance only; validation is passwordError above.
export function passwordStrength(value: string) {
  const length = passwordLength(value)
  if (length >= 24) return { label: 'Strong', level: 3 }
  if (length >= passwordPolicy.minLength) return { label: 'Good', level: 2 }
  if (length >= Math.ceil(passwordPolicy.minLength / 2)) return { label: 'Too short', level: 1 }
  return { label: length ? 'Too short' : '', level: 0 }
}
