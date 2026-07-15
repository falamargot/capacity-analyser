import type { KeyboardEvent } from 'react';

export function getNextRadioIndex(
  key: string,
  currentIndex: number,
  radioCount: number,
): number {
  if (radioCount <= 0) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return radioCount - 1;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (currentIndex + 1) % radioCount;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (currentIndex - 1 + radioCount) % radioCount;
  return currentIndex;
}

/** Roving-focus keyboard behavior shared by button-based radio groups. */
export function handleRadioGroupKeyDown(event: KeyboardEvent<HTMLElement>): void {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  const radios = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not([aria-disabled="true"]):not(:disabled)'),
  );
  if (radios.length === 0) return;

  event.preventDefault();
  const currentIndex = Math.max(0, radios.indexOf(document.activeElement as HTMLElement));
  const nextIndex = getNextRadioIndex(event.key, currentIndex, radios.length);
  radios[nextIndex]?.focus();
  radios[nextIndex]?.click();
}
