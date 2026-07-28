import React, { useEffect, useMemo, useState } from 'react';
import { Entity, LabelGraphics, PointGraphics, useCesium } from 'resium';
import { CallbackProperty, Cartesian2, Cartesian3, Color, HorizontalOrigin, JulianDate, LabelStyle, VerticalOrigin } from 'cesium';
import type { CameraMetricsSnapshot } from './utils';
import { requestGlobeRender } from '../../utils/globeRenderRequest';

export type PathSegmentType = 'USER_LINK' | 'FEEDER_LINK' | 'BACKBONE' | 'GEO_RF';

export interface PathSegment {
    id: string;
    type: PathSegmentType;
    positions: CallbackProperty;
    color: Color;
    durationSeconds?: number;
    phaseOffset?: number;
}

interface PathFlowAnimationProps {
    segments: PathSegment[];
    enabled?: boolean;
    cameraMetricsRef?: React.RefObject<CameraMetricsSnapshot>;
}

const FLOW_EPOCH = JulianDate.fromDate(new Date(0));
const FLOW_PHASES = [0, 0.5] as const;
const ZOOMED_OUT_HEIGHT_METERS = 8_000_000;

const segmentSpeedByType: Record<PathSegmentType, number> = {
    USER_LINK: 1.85,
    FEEDER_LINK: 1.65,
    BACKBONE: 2.4,
    GEO_RF: 2.15,
};

const pixelSizeByType: Record<PathSegmentType, number> = {
    USER_LINK: 5,
    FEEDER_LINK: 5,
    BACKBONE: 5.5,
    GEO_RF: 5.5,
};

const readPositions = (segment: PathSegment, time?: JulianDate): Cartesian3[] => {
    if (!time) return [];
    const value = segment.positions.getValue(time);
    return Array.isArray(value) ? value.filter(Boolean) : [];
};

const PathFlowAnimation: React.FC<PathFlowAnimationProps> = ({
    segments,
    enabled = true,
    cameraMetricsRef,
}) => {
    const { viewer } = useCesium();
    const [reducedMotion, setReducedMotion] = useState(() => (
        typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ));

    useEffect(() => {
        const query = window.matchMedia('(prefers-reduced-motion: reduce)');
        const handleChange = () => setReducedMotion(query.matches);
        query.addEventListener('change', handleChange);
        return () => query.removeEventListener('change', handleChange);
    }, []);

    const particles = useMemo(() => {
        if (!enabled || segments.length === 0) return [];
        const phases = reducedMotion ? [0] as const : FLOW_PHASES;

        return segments.flatMap((segment, segmentIndex) => (
            phases.map((phase, phaseIndex) => {
                const scratch = new Cartesian3();
                const durationSeconds = segment.durationSeconds ?? segmentSpeedByType[segment.type];
                const phaseOffset = segment.phaseOffset ?? segmentIndex * 0.17;
                const position = new CallbackProperty((time?: JulianDate) => {
                    const positions = readPositions(segment, time);
                    if (positions.length < 2) return undefined;

                    const start = positions[0];
                    const end = positions[positions.length - 1];
                    const seconds = JulianDate.secondsDifference(time!, FLOW_EPOCH);
                    const t = reducedMotion
                        ? 0.58
                        : ((seconds / durationSeconds + phase + phaseOffset) % 1 + 1) % 1;
                    return Cartesian3.lerp(start, end, t, scratch);
                }, false);
                const show = new CallbackProperty(() => (
                    phaseIndex === 0 || (cameraMetricsRef?.current.height ?? 0) < ZOOMED_OUT_HEIGHT_METERS
                ), false);

                return {
                    key: `${segment.id}-flow-${phaseIndex}`,
                    name: `${segment.id} flow ${phaseIndex + 1}`,
                    position,
                    show,
                    pixelSize: pixelSizeByType[segment.type],
                    color: segment.color,
                    reducedMotion,
                };
            })
        ));
    }, [cameraMetricsRef, enabled, reducedMotion, segments]);

    // ── requestRenderMode wiring, step 2b.3 (Group C: genuine animation) ──────
    //
    // BEHAVIOUR-NEUTRAL: requestRender() is a no-op while scene.requestRenderMode
    // is false, which is the current configuration.
    //
    // This is the ONE layer in the readiness inventory that is continuously
    // animated in its own right: each particle's position is derived from
    // `JulianDate.secondsDifference(time, FLOW_EPOCH)`, so it advances on every
    // frame independently of any data update. Under requestRenderMode it must
    // therefore drive frames itself, or the particles freeze.
    //
    // The settle condition is explicit rather than open-ended: frames are only
    // requested while there is something to animate, and the loop stops when
    // `enabled` goes false, no particles exist, or the user prefers reduced
    // motion (in which case `t` is pinned to 0.58 and the flow is static).
    const isAnimating = enabled && particles.length > 0 && !reducedMotion;
    useEffect(() => {
        if (!isAnimating) return;
        let rafId = requestAnimationFrame(function tick() {
            requestGlobeRender(viewer);
            rafId = requestAnimationFrame(tick);
        });
        return () => cancelAnimationFrame(rafId);
    }, [isAnimating, viewer]);

    if (!enabled || particles.length === 0) return null;

    return (
        <>
            {particles.map((particle) => (
                <React.Fragment key={particle.key}>
                    <Entity
                        name={`${particle.name} glow`}
                        position={particle.position}
                        show={particle.show}
                    >
                        <PointGraphics
                            pixelSize={particle.pixelSize + 6}
                            color={particle.color.withAlpha(0.22)}
                            outlineColor={particle.color.withAlpha(0.12)}
                            outlineWidth={1}
                            disableDepthTestDistance={Number.POSITIVE_INFINITY}
                        />
                    </Entity>
                    <Entity
                        name={particle.name}
                        position={particle.position}
                        show={particle.show}
                    >
                        {particle.reducedMotion ? (
                            <LabelGraphics
                                text="→"
                                font="700 18px sans-serif"
                                fillColor={Color.WHITE.withAlpha(0.98)}
                                outlineColor={particle.color.withAlpha(0.98)}
                                outlineWidth={3}
                                style={LabelStyle.FILL_AND_OUTLINE}
                                horizontalOrigin={HorizontalOrigin.CENTER}
                                verticalOrigin={VerticalOrigin.CENTER}
                                pixelOffset={new Cartesian2(0, 0)}
                                disableDepthTestDistance={Number.POSITIVE_INFINITY}
                            />
                        ) : (
                            <PointGraphics
                                pixelSize={particle.pixelSize}
                                color={Color.WHITE.withAlpha(0.96)}
                                outlineColor={particle.color.withAlpha(0.98)}
                                outlineWidth={2}
                                disableDepthTestDistance={Number.POSITIVE_INFINITY}
                            />
                        )}
                    </Entity>
                </React.Fragment>
            ))}
        </>
    );
};

export default React.memo(PathFlowAnimation);
