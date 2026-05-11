import React, { useMemo } from 'react';
import { Entity, PointGraphics } from 'resium';
import { CallbackProperty, Cartesian3, Color, JulianDate } from 'cesium';
import type { CameraMetricsSnapshot } from './utils';

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
    const particles = useMemo(() => {
        if (!enabled || segments.length === 0) return [];

        return segments.flatMap((segment, segmentIndex) => (
            FLOW_PHASES.map((phase, phaseIndex) => {
                const scratch = new Cartesian3();
                const durationSeconds = segment.durationSeconds ?? segmentSpeedByType[segment.type];
                const phaseOffset = segment.phaseOffset ?? segmentIndex * 0.17;
                const position = new CallbackProperty((time?: JulianDate) => {
                    const positions = readPositions(segment, time);
                    if (positions.length < 2) return undefined;

                    const start = positions[0];
                    const end = positions[positions.length - 1];
                    const seconds = JulianDate.secondsDifference(time!, FLOW_EPOCH);
                    const t = ((seconds / durationSeconds + phase + phaseOffset) % 1 + 1) % 1;
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
                };
            })
        ));
    }, [cameraMetricsRef, enabled, segments]);

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
                        <PointGraphics
                            pixelSize={particle.pixelSize}
                            color={Color.WHITE.withAlpha(0.96)}
                            outlineColor={particle.color.withAlpha(0.98)}
                            outlineWidth={2}
                            disableDepthTestDistance={Number.POSITIVE_INFINITY}
                        />
                    </Entity>
                </React.Fragment>
            ))}
        </>
    );
};

export default React.memo(PathFlowAnimation);
