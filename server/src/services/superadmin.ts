import { config } from '../config/index.js';

export function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export function isSuperadminEmail(email: unknown): boolean {
  const configuredEmail = normalizeEmail(config.auth.superadminEmail);
  return Boolean(configuredEmail && normalizeEmail(email) === configuredEmail);
}
