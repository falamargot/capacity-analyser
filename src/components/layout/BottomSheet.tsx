import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type SnapIndex = 0 | 1 | 2;

type SnapPoints = [number, number, number];

interface BottomSheetProps {
    snap: SnapIndex;
    onSnapChange: (snap: SnapIndex) => void;
    snapPoints?: SnapPoints;
    header: React.ReactNode;
    children: React.ReactNode;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const BottomSheet: React.FC<BottomSheetProps> = ({
    snap,
    onSnapChange,
    snapPoints = [0.2, 0.5, 0.98],
    header,
    children,
}) => {
    const sheetRef = useRef<HTMLDivElement | null>(null);
    const [sheetHeight, setSheetHeight] = useState(0);
    const [translateY, setTranslateY] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

    const dragStateRef = useRef<{ startY: number; startTranslate: number } | null>(null);

    useEffect(() => {
        const el = sheetRef.current;
        if (!el) return;

        const update = () => {
            const h = el.getBoundingClientRect().height;
            setSheetHeight(h);
        };

        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);

    const translateForSnap = useCallback(
        (idx: SnapIndex) => {
            if (!sheetHeight) return 0;
            const visibleRatio = snapPoints[idx];
            return sheetHeight * (1 - visibleRatio);
        },
        [sheetHeight, snapPoints]
    );

    const minTranslate = useMemo(() => translateForSnap(2), [translateForSnap]);
    const maxTranslate = useMemo(() => translateForSnap(0), [translateForSnap]);

    useEffect(() => {
        setTranslateY(clamp(translateForSnap(snap), minTranslate, maxTranslate));
    }, [snap, minTranslate, maxTranslate, translateForSnap]);

    const handlePointerDown = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (!sheetHeight) return;
            dragStateRef.current = { startY: e.clientY, startTranslate: translateY };
            setIsDragging(true);
            (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        },
        [sheetHeight, translateY]
    );

    const handlePointerMove = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            const drag = dragStateRef.current;
            if (!drag) return;

            const delta = e.clientY - drag.startY;
            const next = clamp(drag.startTranslate + delta, minTranslate, maxTranslate);
            setTranslateY(next);
        },
        [minTranslate, maxTranslate]
    );

    const handlePointerUp = useCallback(
        () => {
            const t0 = translateForSnap(0);
            const t1 = translateForSnap(1);
            const t2 = translateForSnap(2);

            const distances: Array<{ idx: SnapIndex; d: number }> = [
                { idx: 0, d: Math.abs(translateY - t0) },
                { idx: 1, d: Math.abs(translateY - t1) },
                { idx: 2, d: Math.abs(translateY - t2) },
            ];

            distances.sort((a, b) => a.d - b.d);
            onSnapChange(distances[0].idx);

            dragStateRef.current = null;
            setIsDragging(false);
        },
        [onSnapChange, translateForSnap, translateY]
    );

    return (
        <div
            ref={sheetRef}
            className="absolute inset-x-0 bottom-0 z-50 pointer-events-none"
            style={{ height: '90vh' }}
        >
            <div
                className="h-full w-full rounded-t-2xl bg-white shadow-2xl border border-gray-200 flex flex-col pointer-events-auto"
                style={{
                    transform: `translateY(${translateY}px)`,
                    transition: isDragging ? undefined : 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                    willChange: 'transform',
                }}
            >
                <div
                    className="pt-2 pb-2 px-4 flex flex-col gap-2"
                >
                    <div
                        className="w-full flex items-center justify-center"
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                        style={{ touchAction: 'none' }}
                    >
                        <div className="h-1.5 w-12 rounded-full bg-gray-300" />
                    </div>
                    {header}
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default React.memo(BottomSheet);
