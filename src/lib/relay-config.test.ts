import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RELAY_URL,
  RELAY_PRESETS,
  formatRelayHost,
  isWebSocketRelayUrl,
  normalizeNetDeviceType,
  resolveRelayUrl,
  toProbeWebSocketUrl,
  validateRelayUrl,
} from './relay-config.ts';

test('RELAY_PRESETS provides 1 built-in default WebSocket', () => {
  assert.equal(RELAY_PRESETS.length, 1);
  assert.equal(RELAY_PRESETS[0].url, DEFAULT_RELAY_URL);
});

test('validateRelayUrl accepts empty input as default relay', () => {
  const res = validateRelayUrl('   ');
  assert.equal(res.valid, true);
  assert.equal(res.normalized, DEFAULT_RELAY_URL);
});

test('validateRelayUrl accepts wss, ws, wisp, wisps, and special modes', () => {
  assert.equal(validateRelayUrl('wss://relay.example.com/').valid, true);
  assert.equal(validateRelayUrl('ws://localhost:8080/').valid, true);
  assert.equal(validateRelayUrl('wisps://wisp.mercurywork.shop/').valid, true);
  assert.equal(validateRelayUrl('wisp://localhost:6001/').valid, true);
  assert.equal(validateRelayUrl('inbrowser').normalized, 'inbrowser');
  assert.equal(validateRelayUrl('FETCH').normalized, 'fetch');
});

test('validateRelayUrl warns on insecure ws:// from https page except localhost', () => {
  const remoteWs = validateRelayUrl('ws://relay.example.com:8080/', { pageProtocol: 'https:' });
  assert.equal(remoteWs.valid, true);
  assert.ok(remoteWs.warning && remoteWs.warning.includes('mixed-content'));

  const localWs = validateRelayUrl('ws://localhost:8080/', { pageProtocol: 'https:' });
  assert.equal(localWs.valid, true);
  assert.equal(localWs.warning, undefined);
});

test('validateRelayUrl rejects http/https/javascript and invalid strings', () => {
  assert.equal(validateRelayUrl('https://example.com').valid, false);
  assert.equal(validateRelayUrl('http://localhost:8080').valid, false);
  assert.equal(validateRelayUrl('javascript:alert(1)').valid, false);
  assert.equal(validateRelayUrl('not a url').valid, false);
});

test('resolveRelayUrl falls back to default on invalid URL', () => {
  assert.equal(resolveRelayUrl('http://invalid'), DEFAULT_RELAY_URL);
  assert.equal(resolveRelayUrl('wss://custom.relay.net:9000/ws'), 'wss://custom.relay.net:9000/ws');
});

test('formatRelayHost extracts host cleanly', () => {
  assert.equal(formatRelayHost('wss://relay.widgetry.org/'), 'relay.widgetry.org');
  assert.equal(formatRelayHost('ws://localhost:8080/'), 'localhost:8080');
  assert.equal(formatRelayHost('inbrowser'), 'inbrowser');
});

test('toProbeWebSocketUrl converts wisp/wisps to ws/wss and excludes special modes', () => {
  assert.equal(toProbeWebSocketUrl('wisps://wisp.example.com/'), 'wss://wisp.example.com/');
  assert.equal(toProbeWebSocketUrl('wisp://localhost:6001/'), 'ws://localhost:6001/');
  assert.equal(toProbeWebSocketUrl('wss://relay.example.com/'), 'wss://relay.example.com/');
  assert.equal(toProbeWebSocketUrl('inbrowser'), null);
  assert.equal(isWebSocketRelayUrl('inbrowser'), false);
  assert.equal(isWebSocketRelayUrl('wss://relay.example.com/'), true);
});

test('normalizeNetDeviceType defaults to ne2k and accepts virtio', () => {
  assert.equal(normalizeNetDeviceType('virtio'), 'virtio');
  assert.equal(normalizeNetDeviceType('ne2k'), 'ne2k');
  assert.equal(normalizeNetDeviceType(undefined), 'ne2k');
});
