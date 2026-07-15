import { describe, expect, it } from 'vitest';
import { getNextRadioIndex } from '../shared/radioGroupKeyboard';

describe('radioGroupKeyboard', () => {
  it('wraps arrow navigation and supports Home/End', () => {
    expect(getNextRadioIndex('ArrowRight', 3, 4)).toBe(0);
    expect(getNextRadioIndex('ArrowDown', 0, 4)).toBe(1);
    expect(getNextRadioIndex('ArrowLeft', 0, 4)).toBe(3);
    expect(getNextRadioIndex('ArrowUp', 2, 4)).toBe(1);
    expect(getNextRadioIndex('Home', 2, 4)).toBe(0);
    expect(getNextRadioIndex('End', 1, 4)).toBe(3);
  });
});
