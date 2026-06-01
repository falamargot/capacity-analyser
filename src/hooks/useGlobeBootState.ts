import { useCallback, useEffect, useState } from 'react';

const GLOBE_BOOT_PHASE_ORDER = {
  mounting: 0,
  'viewer-ready': 1,
  'imagery-ready': 2,
} as const;

export type GlobeBootPhase = keyof typeof GLOBE_BOOT_PHASE_ORDER;

type UseGlobeBootStateOptions = {
  loading: boolean;
};

export const useGlobeBootState = ({ loading }: UseGlobeBootStateOptions) => {
  const [hasSplashMinimumElapsed, setHasSplashMinimumElapsed] = useState(false);
  const [isSplashDismissed, setIsSplashDismissed] = useState(false);
  const [initialGlobeBootPhase, setInitialGlobeBootPhase] = useState<GlobeBootPhase>('mounting');
  const [isInitialGlobeReady, setIsInitialGlobeReady] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setHasSplashMinimumElapsed(true);
    }, 1400);

    return () => clearTimeout(timeout);
  }, []);

  const handleGlobeBootPhaseChange = useCallback((phase: GlobeBootPhase) => {
    setInitialGlobeBootPhase((current) => (
      GLOBE_BOOT_PHASE_ORDER[phase] > GLOBE_BOOT_PHASE_ORDER[current] ? phase : current
    ));
  }, []);

  const handleInitialGlobeReady = useCallback(() => {
    setIsInitialGlobeReady(true);
  }, []);

  const splashReady = !loading && hasSplashMinimumElapsed && isInitialGlobeReady;
  const splashMessage = loading
    ? 'Loading satellite data and coverage...'
    : initialGlobeBootPhase === 'mounting'
      ? 'Preparing application workspace...'
      : initialGlobeBootPhase === 'viewer-ready'
        ? 'Initializing 3D globe...'
        : splashReady
          ? 'Startup complete.'
          : 'Applying globe imagery...';
  const splashProgress = loading
    ? 52
    : initialGlobeBootPhase === 'mounting'
      ? 72
      : initialGlobeBootPhase === 'viewer-ready'
        ? 86
        : splashReady
          ? 100
          : 94;

  return {
    hasSplashMinimumElapsed,
    isSplashDismissed,
    initialGlobeBootPhase,
    isInitialGlobeReady,
    splashReady,
    splashMessage,
    splashProgress,
    setIsSplashDismissed,
    handleGlobeBootPhaseChange,
    handleInitialGlobeReady,
  };
};
