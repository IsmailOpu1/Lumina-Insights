/**
 * The password rules, the same as the live Supabase Auth settings
 * (`supabase/config.toml`: minimum_password_length = 8,
 * password_requirements = "lower_upper_letters_digits_symbols").
 * Checked before anything is sent, so a weak password is never turned down
 * by the server after a one-time reset code has already been used up.
 */
export const PASSWORD_RULE =
  'Use at least 8 characters, with an uppercase letter, a lowercase letter, a number and a symbol.';

/** The rule's message (an i18n key) if the password breaks it, or null. */
export function passwordProblem(password: string): string | null {
  const ok =
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password);
  return ok ? null : PASSWORD_RULE;
}
