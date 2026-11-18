import test from 'node:test';
import assert from 'node:assert/strict';
import { mapKeyEventToSerial, SerialTerminalBuffer } from './serial-terminal';

test('SerialTerminalBuffer parses newlines, carriage returns, and backspaces', () => {
  const term = new SerialTerminalBuffer(100);
  term.write('booting...\rready!\nlogin: root\b\b\b\badmin');
  assert.equal(term.getPlainText(), 'ready!g...\nlogin: admin');
});

test('SerialTerminalBuffer handles ANSI SGR colors and reset', () => {
  const term = new SerialTerminalBuffer(100);
  term.write('\x1b[1;32mOK\x1b[0m plain');
  const spans = term.getLineSpans(0);
  assert.equal(spans.length, 2);
  assert.equal(spans[0].text, 'OK');
  assert.equal(spans[0].bold, true);
  assert.equal(spans[0].fg, '#4ADE80');
  assert.equal(spans[1].text, ' plain');
  assert.equal(spans[1].fg, null);
});

test('SerialTerminalBuffer handles clear screen and erase line', () => {
  const term = new SerialTerminalBuffer(100);
  term.write('old line\nsecond');
  term.write('\x1b[2J\x1b[Hfresh');
  assert.equal(term.getPlainText(), 'fresh');
});

test('mapKeyEventToSerial translates special keys and control sequences', () => {
  assert.equal(mapKeyEventToSerial({ key: 'Enter' }), '\r');
  assert.equal(mapKeyEventToSerial({ key: 'Backspace' }), '\x7f');
  assert.equal(mapKeyEventToSerial({ key: 'ArrowUp' }), '\x1b[A');
  assert.equal(mapKeyEventToSerial({ key: 'c', ctrlKey: true }), '\x03');
  assert.equal(mapKeyEventToSerial({ key: 'd', ctrlKey: true }), '\x04');
  assert.equal(mapKeyEventToSerial({ key: 'a' }), 'a');
  assert.equal(mapKeyEventToSerial({ key: 'Shift' }), null);
});
