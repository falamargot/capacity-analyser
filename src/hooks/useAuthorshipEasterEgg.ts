import { useCallback, useEffect, useRef, useState } from 'react';

const AUTHORSHIP_LONG_PRESS_MS = 1200;
const AUTHORSHIP_TOAST_MS = 3600;
const AUTHORSHIP_CLICK_COUNT = 5;
const AUTHORSHIP_CLICK_WINDOW_MS = 1400;

export const useAuthorshipEasterEgg = () => {
  const [authorshipToastVisible, setAuthorshipToastVisible] = useState(false);
  const authorshipLongPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authorshipToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authorshipClickCountRef = useRef(0);
  const authorshipClickResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAuthorshipLongPress = useCallback(() => {
    if (authorshipLongPressTimeoutRef.current) {
      clearTimeout(authorshipLongPressTimeoutRef.current);
      authorshipLongPressTimeoutRef.current = null;
    }
  }, []);

  const showAuthorshipSignature = useCallback(() => {
    setAuthorshipToastVisible(true);
    if (authorshipToastTimeoutRef.current) {
      clearTimeout(authorshipToastTimeoutRef.current);
    }
    authorshipToastTimeoutRef.current = setTimeout(() => {
      setAuthorshipToastVisible(false);
      authorshipToastTimeoutRef.current = null;
    }, AUTHORSHIP_TOAST_MS);
  }, []);

  const handleLogoPressStart = useCallback(() => {
    clearAuthorshipLongPress();
    authorshipLongPressTimeoutRef.current = setTimeout(() => {
      authorshipLongPressTimeoutRef.current = null;
      showAuthorshipSignature();
    }, AUTHORSHIP_LONG_PRESS_MS);
  }, [clearAuthorshipLongPress, showAuthorshipSignature]);

  const handleLogoClick = useCallback(() => {
    authorshipClickCountRef.current += 1;
    if (authorshipClickResetTimeoutRef.current) {
      clearTimeout(authorshipClickResetTimeoutRef.current);
    }

    if (authorshipClickCountRef.current >= AUTHORSHIP_CLICK_COUNT) {
      authorshipClickCountRef.current = 0;
      showAuthorshipSignature();
      return;
    }

    authorshipClickResetTimeoutRef.current = setTimeout(() => {
      authorshipClickCountRef.current = 0;
      authorshipClickResetTimeoutRef.current = null;
    }, AUTHORSHIP_CLICK_WINDOW_MS);
  }, [showAuthorshipSignature]);

  useEffect(() => () => {
    clearAuthorshipLongPress();
    if (authorshipToastTimeoutRef.current) clearTimeout(authorshipToastTimeoutRef.current);
    if (authorshipClickResetTimeoutRef.current) clearTimeout(authorshipClickResetTimeoutRef.current);
  }, [clearAuthorshipLongPress]);

  return {
    authorshipToastVisible,
    handleLogoPressStart,
    handleLogoClick,
    clearAuthorshipLongPress,
  };
};
