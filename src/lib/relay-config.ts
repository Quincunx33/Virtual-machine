export const DEFAULT_RELAY_URL = 'wss://relay.widgetry.org/';

export const RELAY_PRESETS = [
  { label: 'Widgetry (Default)', url: 'wss://relay.widgetry.org/' },
  { label: 'Localhost (:8080)', url: 'ws://localhost:8080/' },
  { label: 'In-Browser Switch', url: 'inbrowser' },
] as const;

export interface RelayValidationResult {
  valid: boolean;
  normalized: string;
  error?: string;
}

const SPECIAL_MODES = new Set(['fetch', 'inbrowser']);

export function validateRelayUrl(rawInput: string | null | undefined): RelayValidationResult {
  const trimmed = (rawInput ?? '').trim();
  if (!trimmed) {
    return { valid: true, normalized: DEFAULT_RELAY_URL };
  }

  const lower = trimmed.toLowerCase();
  if (SPECIAL_MODES.has(lower)) {
    return { valid: true, normalized: lower };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Enter a valid WebSocket URL (wss://, ws://, wisps://, wisp://) or "inbrowser".',
    };
  }

  const allowedProtocols = new Set(['ws:', 'wss:', 'wisp:', 'wisps:']);
  if (!allowedProtocols.has(parsed.protocol)) {
    return {
      valid: false,
      normalized: trimmed,
      error: `Unsupported protocol "${parsed.protocol}". Use wss://, ws://, wisps://, or wisp://.`,
    };
  }

  if (!parsed.hostname) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Relay URL must include a valid host.',
    };
  }

  return { valid: true, normalized: trimmed };
}

export function resolveRelayUrl(rawInput: string | null | undefined): string {
  const res = validateRelayUrl(rawInput);
  return res.valid ? res.normalized : DEFAULT_RELAY_URL;
}

export function formatRelayHost(rawInput: string | null | undefined): string {
  const resolved = resolveRelayUrl(rawInput);
  if (resolved === 'inbrowser') return 'inbrowser';
  if (resolved === 'fetch') return 'fetch';
  try {
    const parsed = new URL(resolved);
    return parsed.host || resolved;
  } catch {
    return resolved;
  }
}
