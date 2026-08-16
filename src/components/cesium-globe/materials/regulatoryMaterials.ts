import {
  Color,
  Event,
  JulianDate,
  Material,
} from 'cesium';

type AlphaRef = { current: number };

const MATERIAL_EPOCH = JulianDate.fromDate(new Date('2026-01-01T00:00:00.000Z'));
const REGULATORY_TINT_MATERIAL = 'RegulatoryTintOverlay';
const REGULATORY_BLOCKED_MATERIAL = 'RegulatoryBlockedOverlay';
const REGULATORY_BLOCKED_PATH_MATERIAL = 'RegulatoryBlockedPathOverlay';

let materialsRegistered = false;

const ensureRegulatoryMaterialsRegistered = () => {
  if (materialsRegistered) return;
  materialsRegistered = true;

  (Material as any)._materialCache.addMaterial(REGULATORY_TINT_MATERIAL, {
    fabric: {
      type: REGULATORY_TINT_MATERIAL,
      uniforms: {
        color: Color.WHITE,
        alphaMultiplier: 1,
        edgeSoftness: 0.14,
        pulse: 0,
        time: 0,
      },
      source: `
        czm_material czm_getMaterial(czm_materialInput materialInput)
        {
          czm_material material = czm_getDefaultMaterial(materialInput);
          vec2 st = materialInput.st;
          float edgeDistance = min(min(st.s, st.t), min(1.0 - st.s, 1.0 - st.t));
          float edgeFade = smoothstep(0.0, edgeSoftness, edgeDistance);
          float pulseMix = pulse > 0.5 ? (0.92 + 0.08 * sin(time * 0.8)) : 1.0;
          material.diffuse = color.rgb;
          material.alpha = color.a * alphaMultiplier * edgeFade * pulseMix;
          return material;
        }
      `,
    },
    translucent: true,
  });

  (Material as any)._materialCache.addMaterial(REGULATORY_BLOCKED_MATERIAL, {
    fabric: {
      type: REGULATORY_BLOCKED_MATERIAL,
      uniforms: {
        color: Color.fromCssColorString('#f87171'),
        stripeColor: Color.fromCssColorString('#7f1d1d'),
        alphaMultiplier: 1,
        edgeSoftness: 0.18,
        stripeDensity: 14,
        stripeSpeed: 0.025,
        time: 0,
      },
      source: `
        czm_material czm_getMaterial(czm_materialInput materialInput)
        {
          czm_material material = czm_getDefaultMaterial(materialInput);
          vec2 st = materialInput.st;
          float edgeDistance = min(min(st.s, st.t), min(1.0 - st.s, 1.0 - st.t));
          float edgeFade = smoothstep(0.0, edgeSoftness, edgeDistance);
          float stripePhase = fract((st.s + st.t * 1.15) * stripeDensity - time * stripeSpeed);
          float stripeMask = step(0.55, stripePhase);
          float pulse = 0.84 + 0.12 * sin(time * 1.1);
          vec3 shaded = mix(color.rgb, stripeColor.rgb, stripeMask * 0.42);
          material.diffuse = shaded;
          material.alpha = color.a * alphaMultiplier * edgeFade * pulse;
          return material;
        }
      `,
    },
    translucent: true,
  });

  (Material as any)._materialCache.addMaterial(REGULATORY_BLOCKED_PATH_MATERIAL, {
    fabric: {
      type: REGULATORY_BLOCKED_PATH_MATERIAL,
      uniforms: {
        color: Color.fromCssColorString('#fb7185'),
        stopColor: Color.fromCssColorString('#fecdd3'),
        alphaMultiplier: 1,
        dashDensity: 18,
        dashSpeed: 0.2,
        time: 0,
      },
      source: `
        czm_material czm_getMaterial(czm_materialInput materialInput)
        {
          czm_material material = czm_getDefaultMaterial(materialInput);
          vec2 st = materialInput.st;
          float dashMask = step(0.45, fract(st.s * dashDensity - time * dashSpeed));
          float pathFade = 1.0 - smoothstep(0.52, 0.98, st.s);
          float stopPulse = exp(-pow((st.s - 0.07) * 18.0, 2.0)) * (0.55 + 0.45 * sin(time * 1.6));
          float alpha = alphaMultiplier * ((0.22 + 0.78 * dashMask) * pathFade + stopPulse * 0.8);
          vec3 diffuse = mix(color.rgb, stopColor.rgb, clamp(stopPulse, 0.0, 1.0));
          material.diffuse = diffuse;
          material.emission = diffuse * (0.3 + stopPulse * 0.9);
          material.alpha = clamp(alpha, 0.0, 1.0);
          return material;
        }
      `,
    },
    translucent: true,
  });
};

const secondsSinceEpoch = (time?: JulianDate) =>
  time ? JulianDate.secondsDifference(time, MATERIAL_EPOCH) : 0;

interface TintMaterialOptions {
  color: Color;
  alphaRef: AlphaRef;
  pulse?: boolean;
  edgeSoftness?: number;
  opacity?: number;
}

export class RegulatoryTintMaterialProperty {
  readonly isConstant = false;
  readonly definitionChanged = new Event();

  constructor(private readonly options: TintMaterialOptions) {
    ensureRegulatoryMaterialsRegistered();
  }

  getType() {
    return REGULATORY_TINT_MATERIAL;
  }

  getValue(time?: JulianDate, result?: Record<string, unknown>) {
    const next = result ?? {};
    next.color = this.options.color;
    next.alphaMultiplier = (this.options.alphaRef.current ?? 0) * (this.options.opacity ?? 1);
    next.edgeSoftness = this.options.edgeSoftness ?? 0.14;
    next.pulse = this.options.pulse ? 1 : 0;
    next.time = secondsSinceEpoch(time);
    return next;
  }

  equals(other?: RegulatoryTintMaterialProperty) {
    return other === this;
  }
}

interface BlockedMaterialOptions {
  color: Color;
  stripeColor: Color;
  alphaRef: AlphaRef;
  edgeSoftness?: number;
  opacity?: number;
}

export class RegulatoryBlockedMaterialProperty {
  readonly isConstant = false;
  readonly definitionChanged = new Event();

  constructor(private readonly options: BlockedMaterialOptions) {
    ensureRegulatoryMaterialsRegistered();
  }

  getType() {
    return REGULATORY_BLOCKED_MATERIAL;
  }

  getValue(time?: JulianDate, result?: Record<string, unknown>) {
    const next = result ?? {};
    next.color = this.options.color;
    next.stripeColor = this.options.stripeColor;
    next.alphaMultiplier = (this.options.alphaRef.current ?? 0) * (this.options.opacity ?? 1);
    next.edgeSoftness = this.options.edgeSoftness ?? 0.18;
    next.stripeDensity = 14;
    next.stripeSpeed = 0.025;
    next.time = secondsSinceEpoch(time);
    return next;
  }

  equals(other?: RegulatoryBlockedMaterialProperty) {
    return other === this;
  }
}

interface BlockedPathMaterialOptions {
  color: Color;
  stopColor: Color;
  alphaMultiplier?: number;
}

export class RegulatoryBlockedPathMaterialProperty {
  readonly isConstant = false;
  readonly definitionChanged = new Event();

  constructor(private readonly options: BlockedPathMaterialOptions) {
    ensureRegulatoryMaterialsRegistered();
  }

  getType() {
    return REGULATORY_BLOCKED_PATH_MATERIAL;
  }

  getValue(time?: JulianDate, result?: Record<string, unknown>) {
    const next = result ?? {};
    next.color = this.options.color;
    next.stopColor = this.options.stopColor;
    next.alphaMultiplier = this.options.alphaMultiplier ?? 0.95;
    next.dashDensity = 18;
    next.dashSpeed = 0.2;
    next.time = secondsSinceEpoch(time);
    return next;
  }

  equals(other?: RegulatoryBlockedPathMaterialProperty) {
    return other === this;
  }
}

export const getRegulatoryOverlayState = (status?: string | null) => {
  if (status === 'ALLOWED' || status === 'ALLOWED_CONFIRMED') return 'ALLOWED_CONFIRMED' as const;
  if (status === 'ALLOWED_ESTIMATED') return 'ALLOWED_ESTIMATED' as const;
  if (status === 'RESTRICTED') return 'RESTRICTED' as const;
  if (status === 'BLOCKED') return 'BLOCKED' as const;
  return 'UNKNOWN' as const;
};
