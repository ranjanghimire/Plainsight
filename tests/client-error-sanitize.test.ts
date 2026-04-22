import { describe, expect, it } from 'vitest';
import {
  compressStack,
  sanitizeTelemetryText,
  telemetryFingerprint,
} from '../src/telemetry/sanitizeClientError';

describe('sanitizeTelemetryText', () => {
  it('redacts email and uuid', () => {
    const s = sanitizeTelemetryText('User a@b.co failed id 550e8400-e29b-41d4-a716-446655440000', 500);
    expect(s).toContain('[email]');
    expect(s).toContain('[uuid]');
    expect(s).not.toContain('a@b.co');
  });

  it('caps length', () => {
    const long = 'x'.repeat(5000);
    expect(sanitizeTelemetryText(long, 120).length).toBeLessThanOrEqual(120);
  });
});

describe('compressStack', () => {
  it('limits lines and strips long urls', () => {
    const stack = `Error: boom
  at https://example.com/path?token=secret&x=1 (main.js:1:1)
  at file:///Users/me/app/note.txt:2:2
line4`;
    const out = compressStack(stack, 3);
    expect(out.split('\n').length).toBe(3);
    expect(out).not.toContain('secret');
  });
});

describe('telemetryFingerprint', () => {
  it('is stable for dedupe key', () => {
    expect(telemetryFingerprint('t', 'hello')).toBe('t|hello');
  });
});
