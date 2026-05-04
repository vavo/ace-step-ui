import { config } from '../config/index.js';

export function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function configuredSuperadminEmails(): Set<string> {
  const raw = [
    config.auth.superadminEmail,
    process.env.SUPERADMIN_EMAILS,
  ]
    .filter(Boolean)
    .join(',');

  return new Set(
    raw
      .split(/[,;\s]+/)
      .map(normalizeEmail)
      .filter(Boolean)
  );
}

export function isSuperadminEmail(email: unknown): boolean {
  const normalizedEmail = normalizeEmail(email);
  return Boolean(normalizedEmail && configuredSuperadminEmails().has(normalizedEmail));
}
