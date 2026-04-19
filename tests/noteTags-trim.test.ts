import { describe, expect, it } from 'vitest';
import { composeNoteWithTags, trimTrailingBlankLines } from '../src/utils/noteTags';

describe('trimTrailingBlankLines', () => {
  it('removes trailing empty lines', () => {
    expect(trimTrailingBlankLines('a\nb\n\n\n')).toBe('a\nb');
  });

  it('removes lines that are only whitespace', () => {
    expect(trimTrailingBlankLines('x\n  \n \t\n')).toBe('x');
  });

  it('trims trailing spaces on last line', () => {
    expect(trimTrailingBlankLines('hello   ')).toBe('hello');
  });

  it('returns empty for all-blank', () => {
    expect(trimTrailingBlankLines('\n\n')).toBe('');
  });
});

describe('composeNoteWithTags + trim', () => {
  it('drops trailing blank lines in stored note', () => {
    const t = composeNoteWithTags(['t'], 'body\n\n\n');
    expect(t).toBe('#t\nbody');
  });
});
