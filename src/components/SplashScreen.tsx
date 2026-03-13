import React, { useState, useEffect, useRef } from 'react';
import { Satellite } from 'lucide-react';

interface SplashScreenProps {
    onComplete: () => void;
}

const LOADING_MESSAGES = [
    'Fetching orbital data from CelesTrak…',
    'Parsing TLE ephemerides…',
    'Computing beam footprints…',
    'Initializing 3D globe…',
];

const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
    const [progress, setProgress] = useState(0);
    const [messageIndex, setMessageIndex] = useState(0);
    const [fadeOut, setFadeOut] = useState(false);
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;

    useEffect(() => {
        // Advance progress in steps matching the messages
        const step = 100 / LOADING_MESSAGES.length;
        let current = 0;
        let msgIdx = 0;

        const interval = setInterval(() => {
            msgIdx += 1;
            current += step;

            if (msgIdx >= LOADING_MESSAGES.length) {
                setProgress(100);
                setMessageIndex(LOADING_MESSAGES.length - 1);
                clearInterval(interval);

                // Trigger fade-out then complete
                setTimeout(() => setFadeOut(true), 300);
                setTimeout(() => onCompleteRef.current(), 800);
            } else {
                setProgress(current);
                setMessageIndex(msgIdx);
            }
        }, 600);

        return () => clearInterval(interval);
    }, []);

    return (
        <div
            className={`fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-500 ${fadeOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
                }`}
            style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0f172a 100%)',
            }}
        >
            <div className="flex flex-col items-center gap-6 max-w-sm w-full px-6">
                {/* Animated logo */}
                <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" style={{ animationDuration: '2s' }} />
                    <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                        <Satellite
                            className="h-10 w-10 text-white"
                            style={{ animation: 'spin 3s linear infinite' }}
                        />
                    </div>
                </div>

                {/* Title */}
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-white tracking-tight">
                        ETL Capacity Analyzer
                    </h1>
                    <p className="text-sm text-slate-400 mt-1">Satellite Link Performance Tool</p>
                </div>

                {/* Progress bar */}
                <div className="w-full">
                    <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <p className="text-xs text-slate-400 mt-3 text-center h-4 transition-opacity duration-300">
                        {LOADING_MESSAGES[messageIndex]}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default SplashScreen;
