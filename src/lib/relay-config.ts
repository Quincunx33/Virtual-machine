export const DEFAULT_RELAY_URL = 'wss://relay.widgetry.org/';

export const RELAY_PRESETS = [
  { id: 'preset-default', label: 'Default', url: 'wss://relay.widgetry.org/' },
] as const;

export type NetDeviceType = 'ne2k' | 'virtio';

export interface CustomRelayProfile {
  id: string;
  label: string;
  url: string;
  createdAt: number;
}

export interface RelayOptionItem {
  id: string;
  label: string;
  url: string;
  isPreset: boolean;
  isDefault: boolean;
}

export interface RelayValidationOptions {
  pageProtocol?: string;
}

export interface RelayValidationResult {
  valid: boolean;
  normalized: string;
  error?: string;
  warning?: string;
  protocolType?: 'ws' | 'wisp' | 'special';
}

export interface RelayProbeResult {
  ok: boolean;
  status: 'connected' | 'virtual' | 'timeout' | 'error' | 'invalid';
  latencyMs?: number;
  message: string;
}

const SPECIAL_MODES = new Set(['fetch', 'inbrowser']);
const CUSTOM_RELAYS_STORAGE_KEY = 'webvm_custom_relays';
const DEFAULT_RELAY_STORAGE_KEY = 'webvm_default_relay';

function isLocalhostHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}

export function normalizeNetDeviceType(raw: string | null | undefined): NetDeviceType {
  return raw === 'virtio' ? 'virtio' : 'ne2k';
}

export function validateRelayUrl(
  rawInput: string | null | undefined,
  options?: RelayValidationOptions
): RelayValidationResult {
  const trimmed = (rawInput ?? '').trim();
  if (!trimmed) {
    return { valid: true, normalized: DEFAULT_RELAY_URL, protocolType: 'ws' };
  }

  const lower = trimmed.toLowerCase();
  if (SPECIAL_MODES.has(lower)) {
    return { valid: true, normalized: lower, protocolType: 'special' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Enter a valid WebSocket URL (e.g. wss://... or ws://...).',
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

  const protocolType = parsed.protocol === 'wisp:' || parsed.protocol === 'wisps:' ? 'wisp' : 'ws';

  const pageProto =
    options?.pageProtocol ??
    (typeof window !== 'undefined' && window.location ? window.location.protocol : undefined);

  let warning: string | undefined;
  if (
    pageProto === 'https:' &&
    (parsed.protocol === 'ws:' || parsed.protocol === 'wisp:') &&
    !isLocalhostHost(parsed.hostname)
  ) {
    warning =
      'Insecure ws:// on an HTTPS page may be blocked by browser mixed-content rules. Prefer wss:// or localhost.';
  }

  return { valid: true, normalized: trimmed, warning, protocolType };
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

export function isWebSocketRelayUrl(rawInput: string | null | undefined): boolean {
  const res = validateRelayUrl(rawInput);
  return res.valid && res.protocolType !== 'special';
}

export function toProbeWebSocketUrl(rawInput: string | null | undefined): string | null {
  const res = validateRelayUrl(rawInput);
  if (!res.valid || res.protocolType === 'special') return null;
  if (res.normalized.startsWith('wisps://')) {
    return 'wss://' + res.normalized.slice('wisps://'.length);
  }
  if (res.normalized.startsWith('wisp://')) {
    return 'ws://' + res.normalized.slice('wisp://'.length);
  }
  return res.normalized;
}

export async function probeRelayConnection(
  rawInput: string | null | undefined,
  timeoutMs = 4500
): Promise<RelayProbeResult> {
  const check = validateRelayUrl(rawInput);
  if (!check.valid) {
    return {
      ok: false,
      status: 'invalid',
      message: check.error || 'Invalid WebSocket server URL.',
    };
  }

  if (check.protocolType === 'special') {
    return {
      ok: true,
      status: 'virtual',
      message:
        check.normalized === 'inbrowser'
          ? 'In-Browser virtual switch active (no external server needed).'
          : 'Browser fetch proxy mode active.',
    };
  }

  const wsUrl = toProbeWebSocketUrl(check.normalized);
  if (!wsUrl || typeof WebSocket === 'undefined') {
    return {
      ok: false,
      status: 'error',
      message: 'WebSocket API is unavailable in this environment.',
    };
  }

  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

  return new Promise<RelayProbeResult>((resolve) => {
    let settled = false;
    let socket: WebSocket | null = null;

    const finish = (result: RelayProbeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (socket) {
        try {
          socket.onopen = null;
          socket.onerror = null;
          socket.onclose = null;
          if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close();
          }
        } catch {
        }
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({
        ok: false,
        status: 'timeout',
        message: `Connection timed out after ${Math.round(timeoutMs / 1000)}s.`,
      });
    }, timeoutMs);

    try {
      socket = new WebSocket(wsUrl);
      socket.onopen = () => {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const latencyMs = Math.max(1, Math.round(now - startedAt));
        finish({
          ok: true,
          status: 'connected',
          latencyMs,
          message: `Connected (${latencyMs} ms)`,
        });
      };
      socket.onerror = () => {
        finish({
          ok: false,
          status: 'error',
          message: check.warning || 'Could not reach WebSocket server (handshake failed or blocked).',
        });
      };
      socket.onclose = (ev) => {
        if (!settled) {
          finish({
            ok: false,
            status: 'error',
            message: `Closed before handshake completed (code ${ev?.code || 1006}).`,
          });
        }
      };
    } catch (err) {
      finish({
        ok: false,
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to open WebSocket connection.',
      });
    }
  });
}

function getSafeStorage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
  }
  return null;
}

export function loadSavedRelays(): CustomRelayProfile[] {
  const storage = getSafeStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(CUSTOM_RELAYS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.url === 'string' && validateRelayUrl(item.url).valid)
      .map((item) => ({
        id: String(item.id || `relay-${Date.now()}`),
        label: String(item.label || formatRelayHost(item.url)).trim() || formatRelayHost(item.url),
        url: validateRelayUrl(item.url).normalized,
        createdAt: Number(item.createdAt) || Date.now(),
      }));
  } catch {
    return [];
  }
}

function persistSavedRelays(relays: CustomRelayProfile[]): void {
  const storage = getSafeStorage();
  if (!storage) return;
  try {
    storage.setItem(CUSTOM_RELAYS_STORAGE_KEY, JSON.stringify(relays));
  } catch {
  }
}

export function saveCustomRelay(
  rawLabel: string | null | undefined,
  rawUrl: string | null | undefined
): { ok: boolean; relay?: CustomRelayProfile; error?: string; relays: CustomRelayProfile[] } {
  const check = validateRelayUrl(rawUrl);
  if (!check.valid) {
    return {
      ok: false,
      error: check.error || 'Invalid WebSocket server URL.',
      relays: loadSavedRelays(),
    };
  }

  const normalizedUrl = check.normalized;
  const label = (rawLabel ?? '').trim() || formatRelayHost(normalizedUrl);
  const existing = loadSavedRelays();
  const duplicate = existing.find((item) => item.url === normalizedUrl);

  if (duplicate) {
    duplicate.label = label;
    persistSavedRelays(existing);
    return { ok: true, relay: duplicate, relays: existing };
  }

  const profile: CustomRelayProfile = {
    id: `relay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label,
    url: normalizedUrl,
    createdAt: Date.now(),
  };

  const next = [profile, ...existing].slice(0, 20);
  persistSavedRelays(next);
  return { ok: true, relay: profile, relays: next };
}

export function deleteCustomRelay(id: string): CustomRelayProfile[] {
  const existing = loadSavedRelays();
  const removed = existing.find((r) => r.id === id);
  const next = existing.filter((r) => r.id !== id);
  persistSavedRelays(next);

  if (removed && getDefaultRelayUrl() === removed.url) {
    setDefaultRelayUrl(DEFAULT_RELAY_URL);
  }
  return next;
}

export function getDefaultRelayUrl(): string {
  const storage = getSafeStorage();
  if (!storage) return DEFAULT_RELAY_URL;
  try {
    const saved = storage.getItem(DEFAULT_RELAY_STORAGE_KEY);
    if (!saved) return DEFAULT_RELAY_URL;
    return resolveRelayUrl(saved);
  } catch {
    return DEFAULT_RELAY_URL;
  }
}

export function setDefaultRelayUrl(rawUrl: string | null | undefined): {
  ok: boolean;
  url: string;
  error?: string;
} {
  const check = validateRelayUrl(rawUrl);
  if (!check.valid) {
    return { ok: false, url: getDefaultRelayUrl(), error: check.error };
  }
  const storage = getSafeStorage();
  if (storage) {
    try {
      storage.setItem(DEFAULT_RELAY_STORAGE_KEY, check.normalized);
    } catch {
    }
  }
  return { ok: true, url: check.normalized };
}

export function getAllRelayOptions(): RelayOptionItem[] {
  const defaultUrl = getDefaultRelayUrl();
  const saved = loadSavedRelays();
  const seen = new Set<string>();
  const items: RelayOptionItem[] = [];

  for (const s of saved) {
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    items.push({
      id: s.id,
      label: s.label,
      url: s.url,
      isPreset: false,
      isDefault: s.url === defaultUrl,
    });
  }

  for (const p of RELAY_PRESETS) {
    if (seen.has(p.url)) continue;
    seen.add(p.url);
    items.push({
      id: p.id,
      label: p.label,
      url: p.url,
      isPreset: true,
      isDefault: p.url === defaultUrl,
    });
  }

  return items;
}
