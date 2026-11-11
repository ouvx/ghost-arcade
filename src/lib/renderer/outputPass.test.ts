import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The editor canvas is what the output window, recordings and texture
 * sharing read. Every frame drawn to it has to go through the output pass
 * (outputScene) so final-stage controls — brightness/contrast/gamma today,
 * the output safety stage later — cannot be bypassed by a new draw path.
 */

const ENGINE = readFileSync(join(process.cwd(), 'src/lib/renderer/engine.ts'), 'utf8');

/** Scenes rendered while the render target is the screen (null). */
function scenesDrawnToScreen(source: string): string[] {
  const drawn: string[] = [];
  let toScreen = false;
  const re = /this\.renderer\.setRenderTarget\(([^)]*)\)|this\.renderer\.render\(\s*([^,]+),/g;
  for (const m of source.matchAll(re)) {
    if (m[1] !== undefined) {
      toScreen = m[1].trim() === 'null';
    } else if (toScreen) {
      drawn.push(m[2].trim());
    }
  }
  return drawn;
}

describe('final output pass', () => {
  it('is the only scene drawn to the screen by the render engine', () => {
    const drawn = scenesDrawnToScreen(ENGINE);
    expect(drawn.length).toBeGreaterThan(0);
    expect(new Set(drawn)).toEqual(new Set(['this.outputScene']));
  });

  it('closes the normal, transition and show-timeline transition paths', () => {
    const render = ENGINE.slice(ENGINE.indexOf('// Render final composite to screen'));
    const branch = render.slice(0, render.indexOf('this.reapStaleGpuEffects()'));
    expect(branch).toContain('this.applyDrivenTransition()');
    expect(branch).toContain('this.applyTransition()');
    expect(branch).toContain('this.renderer.render(this.outputScene, this.camera)');
    for (const method of ['private applyTransition(', 'private applyDrivenTransition(']) {
      const start = ENGINE.indexOf(method);
      expect(start, method).toBeGreaterThan(-1);
      const body = ENGINE.slice(start, ENGINE.indexOf('\n  }\n', start));
      expect(body, method).toContain('this.renderer.render(this.outputScene, this.camera)');
    }
  });

  it('keeps the output shader adjustable at the final stage', () => {
    const setup = ENGINE.slice(ENGINE.indexOf('this.outputScene = new THREE.Scene()'));
    const uniforms = setup.slice(0, setup.indexOf('this.outputQuad = new THREE.Mesh'));
    for (const name of ['uTexture', 'uBrightness', 'uContrast', 'uGamma']) {
      expect(uniforms, name).toContain(`${name}:`);
    }
  });
});
