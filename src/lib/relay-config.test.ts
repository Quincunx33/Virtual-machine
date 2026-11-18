import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RELAY_URL,
  formatRelayHost,
  resolveRelayUrl,
  validateRelayUrl,
} from './relay-config';

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
