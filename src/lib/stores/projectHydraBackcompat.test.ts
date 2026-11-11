import { beforeAll, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Projects saved by Ghost Arcade Studio 2.0.6 have to keep opening as they
 * were saved. The fixture was written by this release's own save path
 * (exportProjectJSON) and holds a Hydra layer next to a shader layer.
 */

let layers: typeof import('./layers');

const FIXTURE = join(process.cwd(), 'src/lib/stores/__fixtures__/hydra-project-studio-2.0.6.gha');

function installDomShim(): void {
  const storage = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, String(v)),
    removeItem: (k: string) => void storage.delete(k),
    clear: () => storage.clear(),
    key: () => null,
    length: 0,
  };
  (globalThis as any).document = {
    documentElement: { style: { setProperty() {}, removeProperty() {} } },
    addEventListener() {}, removeEventListener() {},
  };
  (globalThis as any).window = globalThis;
  (globalThis as any).matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
}

function readFixture(): any {
  return JSON.parse(readFileSync(FIXTURE, 'utf8'));
}

function layerById(id: string) {
  const layer = get(layers.project).layers.find((l) => l.id === id);
  if (!layer) throw new Error(`layer ${id} missing after open`);
  return layer;
}

beforeAll(async () => {
  installDomShim();
  layers = await import('./layers');
});

describe('opening a 2.0.6 project with a Hydra layer', () => {
  it('restores the Hydra layer and its sketch as saved', () => {
    const saved = readFixture();
    expect(layers.project.importProject(saved)).toBe(true);

    const project = get(layers.project);
    expect(project.name).toBe('Hydra fixture');
    expect(project.layers.map((l) => l.id)).toEqual(['layer-hydra', 'layer-shader']);

    const savedHydra = saved.project.layers.find((l: any) => l.id === 'layer-hydra').source;
    const hydra = layerById('layer-hydra').source as any;
    expect(hydra.type).toBe('effect');
    expect(hydra.src).toBe('plugin://hydra');
    expect(hydra.effectSource).toEqual(savedHydra.effectSource);

    const shader = layerById('layer-shader').source as any;
    expect(shader.type).toBe('shader');
    expect(shader.shaderValues).toEqual({ gridSize: 12 });
  });

  it('saves the Hydra layer back unchanged', () => {
    const saved = readFixture();
    expect(layers.project.importProject(saved)).toBe(true);
    const resaved = JSON.parse(layers.project.exportProjectJSON());
    const before = saved.project.layers.find((l: any) => l.id === 'layer-hydra').source.effectSource;
    const after = resaved.project.layers.find((l: any) => l.id === 'layer-hydra').source.effectSource;
    expect(after).toEqual(before);
  });

  it('opens a Hydra layer saved before the optional Hydra fields existed', () => {
    const saved = readFixture();
    const hydra = saved.project.layers.find((l: any) => l.id === 'layer-hydra');
    hydra.source.effectSource = { effectType: 'hydra' };
    expect(layers.project.importProject(saved)).toBe(true);
    expect((layerById('layer-hydra').source as any).effectSource).toEqual({ effectType: 'hydra' });
    expect(layerById('layer-shader')).toBeDefined();
  });
});
