import { afterEach, describe, expect, it, vi } from 'vitest';
import { HYDRA_PRESETS, pickNextHydraPreset } from './hydraPresets';
import { getPlugin } from '../plugins/registry';

/**
 * The bundled Hydra sketches are the only code a Hydra layer is meant to
 * run, so each one has to work against the names hydra-synth puts in scope.
 * The fake synth below is chainable: every generator returns an object whose
 * methods return it again, and `.out()` records that the chain was output.
 */

const HYDRA_SCOPE = [
  'osc', 'noise', 'voronoi', 'shape', 'gradient', 'solid', 'src', 'prev',
  'o0', 'o1', 'o2', 'o3', 's0', 's1', 's2', 's3',
  'a', 'time', 'mouse', 'width', 'height', 'bpm', 'speed',
  'render', 'hush', 'setResolution', 'update',
] as const;

function makeFakeSynth() {
  const outs: string[] = [];
  const arrows: Array<() => unknown> = [];
  const call = (...args: unknown[]) => {
    for (const arg of args) if (typeof arg === 'function') arrows.push(arg as () => unknown);
    return chain;
  };
  const chain: any = new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === 'out') return (target?: unknown) => { outs.push(String(target ?? 'o0')); };
      return call;
    },
    apply(_target, _this, args) { return call(...args); },
  });
  const output = (name: string) => ({ name, toString: () => name });
  const scope: Record<string, unknown> = {
    a: { fft: [0.1, 0.2, 0.3, 0.4], vol: 0, setBins() {}, setSmooth() {}, setCutoff() {}, setScale() {} },
    time: 1.5,
    mouse: { x: 0, y: 0 },
    width: 640,
    height: 360,
    bpm: 120,
    speed: 1,
    render() {}, hush() {}, setResolution() {}, update() {},
    o0: output('o0'), o1: output('o1'), o2: output('o2'), o3: output('o3'),
    s0: output('s0'), s1: output('s1'), s2: output('s2'), s3: output('s3'),
  };
  for (const name of HYDRA_SCOPE) {
    if (!(name in scope)) scope[name] = call;
  }
  return { scope, outs, arrows };
}

/** Run a sketch the way HydraVisualizer does, then evaluate every
 *  `() => …` argument once so a typo inside a modulator surfaces too. */
function runSketch(code: string) {
  const { scope, outs, arrows } = makeFakeSynth();
  const keys = Object.keys(scope);
  const fn = new Function(...keys, `"use strict";\n${code}`);
  fn(...keys.map((k) => scope[k]));
  for (const arrow of arrows) arrow();
  return outs;
}

describe('bundled Hydra presets', () => {
  afterEach(() => vi.restoreAllMocks());

  it('have unique, non-empty names and code', () => {
    const names = HYDRA_PRESETS.map((p) => p.name);
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
    for (const preset of HYDRA_PRESETS) {
      expect(preset.name.trim(), 'preset name').not.toBe('');
      expect(preset.code.trim(), `${preset.name} code`).not.toBe('');
    }
  });

  it.each(HYDRA_PRESETS.map((p) => [p.name, p.code]))('%s runs against the hydra scope and outputs', (_name, code) => {
    const outs = runSketch(code);
    expect(outs.length).toBeGreaterThan(0);
  });

  it('the plugin default sketch is a bundled preset', () => {
    const plugin = getPlugin('hydra');
    expect(plugin?.effectType).toBe('hydra');
    const defaults = plugin!.defaultSourceParams;
    const match = HYDRA_PRESETS.find((p) => p.name === defaults.hydraSketchName);
    expect(match, 'default sketch name is bundled').toBeDefined();
    expect(defaults.hydraSketchCode).toBe(match!.code);
  });

  it('pickNextHydraPreset avoids the current preset', () => {
    const current = HYDRA_PRESETS[0].name;
    const random = vi.spyOn(Math, 'random');
    random.mockReturnValueOnce(0).mockReturnValueOnce(0.99);
    const next = pickNextHydraPreset(current);
    expect(next.name).not.toBe(current);
  });
});
