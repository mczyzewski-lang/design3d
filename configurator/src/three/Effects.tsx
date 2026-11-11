// Postprodukcja: cieniowanie kontaktowe (ambient occlusion), mapowanie tonów i — nocą — poświata LED.
// Renderuje scenę przez EffectComposer (MSAA w buforze HDR). Gdy urządzenie nie nadąża, AO wyłącza się samo;
// gdy kompozytora nie da się utworzyć — scena renderuje się zwykłą ścieżką.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BloomEffect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { capture } from './capture';

/** ?fx=0 wyłącza postprodukcję, ?fx=1 wymusza pełną (bez automatycznego wyłączania AO) — do diagnostyki i testów. */
const FX = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('fx') : null;
export const fxEnabled = FX !== '0';

function softwareRenderer(gl: THREE.WebGLRenderer): boolean {
  try {
    const c = gl.getContext();
    const ext = c.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER));
    return /swiftshader|llvmpipe|software|softpipe/i.test(name);
  } catch { return false; }
}

interface Rig { composer: EffectComposer; ao: N8AOPostPass; bloom: BloomEffect; bloomPass: EffectPass }

export function Effects({ hq, night, glow }: { hq: boolean; night: boolean; glow: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);

  // awaria w trakcie renderu (np. sterownik bez wymaganych formatów) → trwały powrót do zwykłego renderu
  const [broken, setBroken] = useState(false);
  const built = useMemo<Rig | null>(() => {
    try {
      // render programowy (brak GPU: SwiftShader, llvmpipe) — postprodukcja byłaby tam zbyt wolna
      if (FX !== '1' && softwareRenderer(gl)) return null;
      const composer = new EffectComposer(gl, { multisampling: Math.min(4, gl.capabilities.maxSamples), frameBufferType: THREE.HalfFloatType });
      composer.addPass(new RenderPass(scene, camera));
      const ao = new N8AOPostPass(scene, camera);
      const c = ao.configuration;
      c.aoRadius = 0.6;          // metry: styk stopnia z belką, ściany z posadzką, tralki z pochwytem
      c.distanceFalloff = 0.8;
      c.intensity = 3.4;
      c.color = new THREE.Color('#1c130b'); // ciepły cień zamiast szarego „brudu”
      c.halfRes = false; // tryb połówkowy n8ao nie działa z three r187 (wielokrotne cele renderowania) — na telefonie niższa jakość próbkowania
      c.transparencyAware = false; // szkło nie zapisuje głębi — nie rzuca AO
      ao.setQualityMode(hq ? 'Medium' : 'Performance');
      composer.addPass(ao);
      const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 1.1, luminanceSmoothing: 0.25, intensity: 0.9, radius: 0.7 });
      const bloomPass = new EffectPass(camera, bloom);
      composer.addPass(bloomPass);
      composer.addPass(new EffectPass(camera, new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL })));
      return { composer, ao, bloom, bloomPass };
    } catch (e) {
      console.warn('Postprodukcja niedostępna — zwykły render', e);
      return null;
    }
  }, [gl, scene, camera, hq]);

  const rig = broken ? null : built;
  useEffect(() => () => built?.composer.dispose(), [built]);
  useEffect(() => { rig?.composer.setSize(size.width, size.height, false); }, [rig, size.width, size.height, dpr]);
  // poświata tylko nocą przy włączonych LED — w dzień ściany w słońcu przekraczają próg i „świeciłyby”
  useEffect(() => { if (rig) rig.bloomPass.enabled = night && glow; }, [rig, night, glow]);

  // tonowanie robi kompozytor — renderer zostawia bufor liniowy
  useEffect(() => {
    if (!rig) return;
    const prev = gl.toneMapping;
    gl.toneMapping = THREE.NoToneMapping;
    return () => { gl.toneMapping = prev; };
  }, [gl, rig]);

  // zrzut PNG (miniatura projektu) tą samą ścieżką co ekran
  useEffect(() => {
    if (!rig) return;
    const prev = capture.fn;
    capture.fn = () => { rig.composer.render(); return gl.domElement.toDataURL('image/png'); };
    return () => { capture.fn = prev; };
  }, [gl, rig]);

  // strażnik płynności: jeśli średnio wychodzi < ~30 kl./s, wyłącz AO (największy koszt)
  const perf = useRef({ n: 0, sum: 0, off: false });
  // rzuty (z góry / z boku) to widoki techniczne — bez AO, czysty rysunek
  const ortho = (camera as THREE.OrthographicCamera).isOrthographicCamera === true;
  useEffect(() => { perf.current = { n: 0, sum: 0, off: ortho }; if (rig) rig.ao.enabled = !ortho; }, [rig, ortho]);

  useFrame((_, dt) => {
    if (!rig) { gl.render(scene, camera); return; }
    const p = perf.current;
    if (FX !== '1' && !p.off && document.visibilityState === 'visible' && dt < 0.5) {
      p.n++;
      if (p.n > 20) p.sum += dt; // pomiń rozgrzewkę (kompilacja shaderów)
      // szybka decyzja przy wyraźnie wolnym renderze, potem ocena co ~90 klatek
      if (p.n === 40 && p.sum / 20 > 0.08) { rig.ao.enabled = false; p.off = true; }
      if (p.n === 110) {
        if (p.sum / 90 > 0.032) { rig.ao.enabled = false; p.off = true; }
        else { p.n = 20; p.sum = 0; }
      }
    }
    try {
      rig.composer.render(dt);
    } catch (e) {
      console.warn('Postprodukcja wyłączona po błędzie renderu', e);
      gl.setRenderTarget(null);
      setBroken(true);
    }
  }, 1);
  return null;
}
