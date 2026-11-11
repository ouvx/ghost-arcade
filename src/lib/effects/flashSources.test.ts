import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STAGE_EFFECT_CATALOG } from '../stores/stageEffects';
import { effectParamLabels } from './effectUX';
import { TRANSITIONS } from '../renderer/crossfadeTransitions';

/**
 * Inventory of everything that can flash the output, with its fastest
 * setting. Several go well past 3 flashes per second (the W3C general
 * flash threshold), which the output safety stage has to cover.
 *
 * This pins the current state on purpose: adding a flash source or raising
 * a rate fails here, so the change has to be checked against the output
 * safety stage and the inventory updated deliberately.
 */

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('flash source inventory', () => {
  it('stage effects with a rate control', () => {
    const rates: Record<string, number> = {};
    for (const def of STAGE_EFFECT_CATALOG) {
      for (const spec of def.paramSpecs) {
        if (spec.key === 'rate') rates[def.type] = spec.max;
      }
    }
    expect(rates).toEqual({
      strobe: 20,
      'random-hits': 20,
      checker: 8,
      'split-flash': 8,
    });
  });

  it('layer and composition effects with a flash rate or tempo', () => {
    const rates: Record<string, number> = {};
    for (const [effect, params] of Object.entries(effectParamLabels)) {
      for (const [key, meta] of Object.entries(params ?? {})) {
        if (/hz/i.test(meta.label ?? '') || /strobe.*rate|flash.*rate|bpm/i.test(key)) {
          rates[`${effect}.${key}`] = meta.max;
        }
      }
    }
    expect(rates).toEqual({
      'eulerianMagnify.eulerianLowHz': 8,
      'eulerianMagnify.eulerianHighHz': 12,
      'invert.invertStrobeRate': 10,
      'strobeFlash.strobeRate': 30,
      'strobeSequencer.ssBPM': 240,
    });
  });

  it('the Strobe Mix crossfade peaks at about 24 Hz', () => {
    const strobe = TRANSITIONS.find((t) => t.name === 'strobe');
    expect(strobe).toBeDefined();
    expect(read('src/lib/renderer/crossfadeTransitions.ts')).toContain('float rate = 2.0 + intensity * 22.0;');
  });

  it('the performance pad FLASH trigger toggles opacity for 100 ms', () => {
    const source = read('src/lib/audio/performanceEngine.ts');
    expect(source).toContain("action: { type: 'strobe', duration: 100 }");
    expect(source).toContain('const flash = Math.sin(now * 0.06) > 0;');
  });

  it('the Performer strobe and white controls', () => {
    const source = read('src/lib/stores/synthVision.ts');
    expect(source).toContain("case 'strobe': return { ...base, fxStrobe: 1 };");
    expect(source).toContain("case 'flash': return { ...base, whiteout: 1 };");
  });

  it('bundled ISF strobe shaders', () => {
    const manifest = read('public/ISF/manifest.json');
    const strobeShaders = [...manifest.matchAll(/"([^"]*Strobe[^"]*\.fs)"/gi)].map((m) => m[1]).sort();
    expect(strobeShaders).toEqual(['DM-Strobe.fs', 'STAGE-Strobe.fs', 'StrobeFlash.fs']);
  });
});
