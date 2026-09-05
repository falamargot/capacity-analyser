import React, { useEffect, useRef, useState } from 'react';
import { CapacityAnalyzerSignature } from './brand/CapacityAnalyzerSignature';

interface SplashScreenProps {
    message: string;
    progress: number;
    ready?: boolean;
    onComplete: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({
    message,
    progress,
    ready = false,
    onComplete,
}) => {
    const [fadeOut, setFadeOut] = useState(false);
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;

    useEffect(() => {
        if (!ready) {
            setFadeOut(false);
            return undefined;
        }

        setFadeOut(true);
        const timeout = setTimeout(() => onCompleteRef.current(), 500);
        return () => clearTimeout(timeout);
    }, [ready]);

    return (
        <div
            className={`ui-global-topmost fixed inset-0 flex items-center justify-center transition-opacity duration-500 ${
                fadeOut ? 'pointer-events-none opacity-0' : 'opacity-100'
            }`}
            style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0f172a 100%)',
            }}
        >
            <div className="flex w-full max-w-sm flex-col items-center gap-6 px-6">
                <div className="relative">
                    <div
                        className="absolute inset-0 animate-ping rounded-full bg-blue-500/20"
                        style={{ animationDuration: '2s' }}
                    />
                    <div className="relative flex h-24 w-20 items-center justify-center">
                        <CapacityAnalyzerSignature
                            variant="icon"
                            className="h-20 w-16 drop-shadow-[0_18px_34px_rgba(56,189,248,0.28)]"
                        />
                    </div>
                </div>

                <div className="text-center">
                    <h1 className="text-2xl font-bold tracking-tight text-white">
                        ETL Capacity Analyzer
                    </h1>
                    <p className="mt-1 text-sm text-slate-400">LEO / GEO connectivity decision support</p>
                </div>

                <div className="w-full">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
                        <div
                            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500 ease-out"
                            style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }}
                        />
                    </div>
                    <p className="mt-3 h-4 text-center text-xs text-slate-400 transition-opacity duration-300">
                        {message}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default SplashScreen;
