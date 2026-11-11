import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A stand-in for hydra-synth that records how the wrapper drives it.
const hydraInstances: any[] = [];
vi.mock('hydra-synth', () => {
  class FakeHydra {
    opts: any;
    tick = vi.fn();
    hush = vi.fn();
    setResolution = vi.fn();
    loseContext = vi.fn();
    regl = {
      destroy: vi.fn(),
      _gl: { getExtension: (name: string) => (name === 'WEBGL_lose_context' ? { loseContext: this.loseContext } : null) },
    };
    synth: Record<string, unknown> = { time: 0, osc: () => ({ out: () => {} }) };
    constructor(opts: any) {
      this.opts = opts;
      hydraInstances.push(this);
    }
  }
  return { default: FakeHydra };
});

function fakeElement(): any {
  return { style: {}, width: 0, height: 0, appendChild: () => {}, remove: () => {} };
}

describe('HydraVisualizer lifetime', () => {
  beforeEach(() => {
    hydraInstances.length = 0;
    vi.stubGlobal('document', { createElement: fakeElement, body: { appendChild: () => {} } });
    // The fake synth cannot run real sketches; their warnings are expected.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('runs no loop of its own and ticks hydra from step()', async () => {
    const { HydraVisualizer } = await import('./hydraVisualizer');
    const viz = new HydraVisualizer(64, 32);
    const hydra = hydraInstances[0];
    expect(hydra.opts.autoLoop).toBe(false);

    viz.step(0.016, null);
    expect(hydra.tick).toHaveBeenCalledTimes(1);
    expect(hydra.tick.mock.calls[0][0]).toBeCloseTo(16);
  });

  it('frees regl and the WebGL context on dispose, then stops ticking', async () => {
    const { HydraVisualizer } = await import('./hydraVisualizer');
    const viz = new HydraVisualizer(64, 32);
    const hydra = hydraInstances[0];

    viz.dispose();
    expect(hydra.regl.destroy).toHaveBeenCalledTimes(1);
    expect(hydra.loseContext).toHaveBeenCalledTimes(1);

    hydra.tick.mockClear();
    viz.step(0.016, null);
    expect(hydra.tick).not.toHaveBeenCalled();
  });

  it('loads the default preset and reports a notice for unknown code', async () => {
    const { HydraVisualizer } = await import('./hydraVisualizer');
    const { getDefaultHydraPreset } = await import('./hydraPresets');
    const viz = new HydraVisualizer(64, 32);
    const hostile = "fetch('https://example.invalid/'); osc().out()";
    viz.setParams({ sketchName: 'Custom Hostile', sketchCode: hostile });

    const notice = viz.consumeFallbackNotice();
    expect(notice).not.toBeNull();
    expect(notice!.usedDefault).toBe(true);
    expect(notice!.safeName).toBe(getDefaultHydraPreset().name);
    expect(notice!.safeCode).toBe(getDefaultHydraPreset().code);
    expect(viz.getActiveSketchName()).toBe(getDefaultHydraPreset().name);
    expect(viz.consumeFallbackNotice()).toBeNull();
  });

  it('retunes to the bundled sketch of the same name when code drifted', async () => {
    const { HydraVisualizer } = await import('./hydraVisualizer');
    const { HYDRA_PRESETS } = await import('./hydraPresets');
    const viz = new HydraVisualizer(64, 32);
    const welcome = HYDRA_PRESETS.find(p => p.name === 'Welcome')!;
    viz.setParams({
      sketchName: 'Welcome',
      sketchCode: `${welcome.code}; /* drifted */`,
    });

    const notice = viz.consumeFallbackNotice();
    expect(notice).not.toBeNull();
    expect(notice!.usedDefault).toBe(false);
    expect(notice!.safeName).toBe('Welcome');
    expect(notice!.safeCode).toBe(welcome.code);
  });
});
