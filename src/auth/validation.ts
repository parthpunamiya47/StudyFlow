/**
 * Client-side form validation and error wording for the auth screens.
 *
 * Provider-specific errors are already mapped to plain language in the
 * auth gateways; this module covers format checks before a request is
 * sent and converts transport failures into messages a person can act on.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim())
}

/** Minimum password length enforced by the UI (superseded by stricter provider rules if any). */
export const MIN_PASSWORD_LENGTH = 8

/** Returns a message when the password does not meet policy, otherwise null. */
export function passwordIssue(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  return null
}

function isNetworkError(message: string): boolean {
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|http error/i.test(
    message,
  )
}

/**
 * Convert an unknown thrown value into a human-readable message.
 * Network problems and unexpected server failures get actionable wording;
 * anything the gateway already phrased for a person is kept as-is.
 */
export function friendlyAuthError(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    if (isNetworkError(err.message)) {
      return 'Could not reach the server. Check your internet connection and try again.'
    }
    if (/^\s*$/.test(err.message)) return fallback
    return err.message
  }
  return fallback
}
