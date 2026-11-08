// Oprawy LED w 3D (punktowe i profil wzdłuż biegu) oraz rozmieszczenie świateł sceny dla każdego trybu.
import * as THREE from 'three';
import { flightLed, ledModeOf, spotSteps } from '../../engine/led';
import type { Config, Solved } from '../../engine/types';
import { Parts, cyl, extrudeZY, flightMatrix, type P2 } from './primitives';

/** Oprawy punktowe / profil wzdłuż biegu (taśma pod noskami powstaje razem ze stopnicami). */
export function buildLedFixtures(P: Parts, c: Config, s: Solved, t: number): void {
  const mode = ledModeOf(c);
  for (const f of s.layout.flights) {
    const m = flightMatrix(f);
    const led = flightLed(c, f, t);
    const sd = led.side;
    const k = f.rise / f.going;
    if (mode === 'spots') {
      const r = led.nearWall ? 0.032 : 0.011;
      for (const i of spotSteps(f.treads)) {
        const z = (i - 0.5) * f.going;
        const y = led.spotY(i);
        // w ścianie: wystaje ku schodom; w czole stopnicy: na zewnątrz
        const [xa, xb] = led.nearWall ? [led.spotX, led.spotX - 0.006] : [led.spotX - 0.002, led.spotX + 0.003];
        const a = new THREE.Vector3(sd * xa, y, z).applyMatrix4(m);
        const b = new THREE.Vector3(sd * xb, y, z).applyMatrix4(m);
        P.add('led', cyl(a, b, r, 20), undefined, 'ledSpot');
      }
    } else if (mode === 'along') {
      const hh = led.nearWall ? 0.008 : 0.005;
      const yl = (z: number) => k * z + led.alongC;
      const poly: P2[] = [[led.z0, yl(led.z0) - hh], [led.z1, yl(led.z1) - hh], [led.z1, yl(led.z1) + hh], [led.z0, yl(led.z0) + hh]];
      const th = 0.005;
      const x0 = led.nearWall ? (sd > 0 ? led.alongX - th : -led.alongX) : (sd > 0 ? led.alongX - 0.001 : -led.alongX - th + 0.001);
      P.add('led', extrudeZY(poly, x0, th), m, 'ledAlong');
    }
  }
}

/** Pozycje świateł punktowych symulujących LED — rozłożone wzdłuż biegu, nie jedno źródło. */
export function ledLightPositions(c: Config, s: Solved, t: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  const sp = s.layout.spiral;
  if (sp) {
    const H = c.room.height;
    for (const fr of [0.2, 0.5, 0.8]) {
      const a = sp.phi0 + sp.sense * sp.sweep * fr;
      out.push([sp.center.x + Math.cos(a) * sp.walkRadius, H * fr - 0.2, sp.center.z + Math.sin(a) * sp.walkRadius]);
    }
    return out;
  }
  const mode = ledModeOf(c);
  for (const f of s.layout.flights) {
    const m = flightMatrix(f);
    const k = f.rise / f.going;
    const L = f.length;
    const push = (x: number, y: number, z: number) => { const v = new THREE.Vector3(x, y, z).applyMatrix4(m); out.push([v.x, v.y, v.z]); };
    if (mode === 'nosing') {
      for (const fr of [0.2, 0.5, 0.8]) push(0, k * L * fr - 0.15, L * fr);
      continue;
    }
    const led = flightLed(c, f, t);
    const inward = led.nearWall ? -0.25 : 0.2; // ze ściany świeci na stopnie, z boku konstrukcji — na zewnątrz
    if (mode === 'spots') {
      const steps = spotSteps(f.treads);
      const pick = steps.length <= 3 ? steps : [steps[0], steps[Math.floor(steps.length / 2)], steps[steps.length - 1]];
      for (const i of pick) push(led.side * (led.spotX + inward), led.spotY(i) - (led.nearWall ? 0.1 : 0), (i - 0.5) * f.going);
    } else {
      for (const fr of [0.2, 0.5, 0.8]) {
        const z = led.z0 + (led.z1 - led.z0) * fr;
        push(led.side * (led.alongX + inward), k * z + led.alongC, z);
      }
    }
  }
  return out;
}
