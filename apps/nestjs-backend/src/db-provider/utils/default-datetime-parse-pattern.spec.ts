import { describe, expect, it } from 'vitest';

import { getDefaultDatetimeParsePattern } from './default-datetime-parse-pattern';

describe('default datetime parse pattern', () => {
  it('accepts 1-digit hour in ISO-like datetimes', () => {
    const pattern = new RegExp(getDefaultDatetimeParsePattern());
    expect(pattern.test('2025-11-01 8:40')).toBe(true);
    expect(pattern.test('2025-11-01 08:40')).toBe(true);
  });

  it('treats blank strings as invalid', () => {
    const pattern = new RegExp(getDefaultDatetimeParsePattern());
    expect(pattern.test('')).toBe(false);
    expect(pattern.test(' ')).toBe(false);
  });
});
