// Small shared input-validation helpers for the auth routes.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A practical (not full RFC 5322) email format check: local@domain.tld, no spaces. */
export function isValidEmail(email) {
    return typeof email === "string" && EMAIL_PATTERN.test(email.trim());
}