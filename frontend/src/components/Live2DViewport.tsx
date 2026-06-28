import React, { useEffect, useRef, useState } from 'react';

interface Live2DViewportProps {
  modelUrl: string;
  audioElement: HTMLAudioElement | null;
  emotion?: string;
  jingliuOpenEye?: boolean;
  isMiniMode?: boolean;
  miniZoom?: number;
  miniYOffset?: number;
}

export const Live2DViewport: React.FC<Live2DViewportProps> = ({
  modelUrl,
  audioElement,
  emotion,
  jingliuOpenEye,
  isMiniMode,
  miniZoom = 1.6,
  miniYOffset = 0,
}) => {
  const containerRef   = useRef<HTMLDivElement>(null);
  const modelRef        = useRef<any>(null);
  const mouthOpenRef    = useRef<number>(0);
  const isSpeakingRef   = useRef<boolean>(false);   // true while audio is playing
  const speakBlendRef   = useRef<number>(0);         // 0=idle, 1=speaking (smooth blend)
  const jingliuEyeRef   = useRef(jingliuOpenEye);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [debugLines, setDebugLines] = useState<string[]>([]);

  // Keep a mutable ref of the latest config so the PIXI ticker loop and resize observers always use fresh values
  const configRefs = useRef({ miniZoom, miniYOffset, isMiniMode });
  useEffect(() => {
    configRefs.current = { miniZoom, miniYOffset, isMiniMode };
  }, [miniZoom, miniYOffset, isMiniMode]);

  // Expose a live update effect so sliding the UI immediately moves the character
  useEffect(() => {
    if (!modelRef.current || !containerRef.current) return;
    const model = modelRef.current;
    const cw = containerRef.current.clientWidth;
    const currentConfig = configRefs.current;
    
    if (currentConfig.isMiniMode) {
      const rawW = (model as any)._initialRawW || (model.width / model.scale.x);
      const s = (cw * currentConfig.miniZoom) / rawW;
      model.scale.set(s);
      model.x = (cw - model.width) / 2;
      model.y = currentConfig.miniYOffset;
    }
  }, [miniZoom, miniYOffset, isMiniMode]);

  const addDebug = (line: string) => {
    console.log('[Live2D Debug]', line);
    setDebugLines(prev => [...prev.slice(-8), line]);
  };

  // Sync prop to ref so the callback always sees the latest value
  useEffect(() => {
    jingliuEyeRef.current = jingliuOpenEye;
  }, [jingliuOpenEye]);

  // ─── MODEL LOAD ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const PIXI = (window as any).PIXI;
    const Live2DModel =
      PIXI?.live2d?.Live2DModel ||
      (window as any).PIXI_LIVE2D_DISPLAY?.Live2DModel ||
      (window as any).Live2DModel;

    if (!PIXI || !Live2DModel) {
      setError('SDK not loaded');
      setLoading(false);
      return;
    }

    const container = containerRef.current;
    const app = new PIXI.Application({
      width: container.clientWidth,
      height: container.clientHeight,
      backgroundAlpha: 0,
      autoStart: true,
      resizeTo: container,
    });

    app.view.style.cssText = 'width:100%;height:100%;display:block;position:absolute;top:0;left:0;';
    container.appendChild(app.view);

    let isMounted = true;
    let model: any = null;
    let idleTimer: any = null;

    addDebug('Loading model...');

    Live2DModel.from(modelUrl).then((loaded: any) => {
      if (!isMounted) { loaded.destroy(); return; }

      model = loaded;
      modelRef.current = loaded;

      // ── Fit ────────────────────────────────────────────────────────────────
      const fit = () => {
        if (!model) return;
        const cw = container.clientWidth, ch = container.clientHeight;
        
        // Cache the initial raw dimensions on the model object if they don't exist yet.
        // This prevents dynamic mesh changes during animations from randomly changing the zoom scale!
        if (!(model as any)._initialRawW) {
          (model as any)._initialRawW = model.internalModel?.width ?? model.internalModel?.settings?.layout?.width ?? model.internalModel?.originalWidth ?? (model.width / model.scale.x);
          (model as any)._initialRawH = model.internalModel?.height ?? model.internalModel?.settings?.layout?.height ?? model.internalModel?.originalHeight ?? (model.height / model.scale.y);
        }
        
        const rawW = (model as any)._initialRawW;
        const rawH = (model as any)._initialRawH;
        
        let s = Math.min((cw * 0.9) / rawW, (ch * 0.9) / rawH);
        addDebug(`fit: cw=${cw} ch=${ch} rawW=${rawW.toFixed(0)} rawH=${rawH.toFixed(0)} scale=${s.toFixed(2)} mini=${!!isMiniMode}`);
        
        const currentConfig = configRefs.current;
        
        if (currentConfig.isMiniMode) {
          // Allow the user to fine-tune the calibration via Settings Panel!
          s = (cw * currentConfig.miniZoom) / rawW; 
          model.scale.set(s);
          model.x = (cw - model.width) / 2;
          
          // Apply user-defined Y offset calibration
          model.y = currentConfig.miniYOffset;
        } else {
          model.scale.set(s);
          model.x = (cw - model.width) / 2;
          model.y = ch - model.height;
        }
      };

      app.stage.addChild(model);
      fit();
      window.addEventListener('resize', fit);
      setLoading(false);
      addDebug('Model loaded OK');

      // ── Inspect motionManager ──────────────────────────────────────────────
      const mgr = model.internalModel?.motionManager;
      if (mgr) {
        const defs = mgr.definitions ?? {};
        const groups = Object.keys(defs);
        addDebug(`Motion groups: [${groups.map(g => `"${g}"(${defs[g]?.length ?? 0})`).join(', ')}]`);
        addDebug(`startMotion exists: ${typeof mgr.startMotion}`);
      } else {
        addDebug('ERROR: no motionManager!');
      }

      // ── Inspect expressions ────────────────────────────────────────────────
      const expList = model.internalModel?.settings?.expressions ?? [];
      addDebug(`Expressions: ${expList.length} found`);

      // Trigger initial idle motion
      if (mgr) {
        const groups = Object.keys(mgr.definitions ?? {});
        const idleGrp = groups.find(g => g.includes('Scene1') || g.includes('idle')) || groups[0];
        if (idleGrp) {
          mgr.startMotion(idleGrp, 0, 2);
        }
      }

      // ── Check beforeModelUpdate event ──────────────────────────────────────
      model.internalModel.once('beforeModelUpdate', () => {
        addDebug('beforeModelUpdate event FIRED ✓');
      });

      // ── Wheel zoom ──────────────────────────────────────────────────────────
      container.addEventListener('wheel', (e: WheelEvent) => {
        e.preventDefault();
        if (!model) return;
        model.scale.set(Math.max(0.05, model.scale.x * (e.deltaY > 0 ? 0.95 : 1.05)));
        model.x = (container.clientWidth - model.width) / 2;
      }, { passive: false });

      // ── Autonomous idle head-bob (makes character visibly alive) ────────────
      // Writes to coreModel params in beforeModelUpdate so it composes correctly
      // with the running motion. Uses sin/cos waves for organic-looking motion.
      let idleTime = 0;
      app.ticker.add((delta: number) => {
        idleTime += delta * 0.012; // slow drift
      });

      model.internalModel.on('beforeModelUpdate', () => {
        const core = model.internalModel.coreModel;
        if (!core) return;

        // ── Lip-sync ─────────────────────────────────────────────────────────
        // Find correct mouth ID once
        let mouthParamId = 'ParamMouthOpenY';
        const lipIds = model.internalModel.settings?.getLipSyncParameters?.() ?? 
                       model.internalModel.settings?.groups?.find((g: any) => g.Name === 'LipSync')?.Ids ?? [];
        if (lipIds.length > 0) mouthParamId = lipIds[0];

        try {
          core.setParameterValueById?.(mouthParamId, mouthOpenRef.current, 1.0);
          core.setParameterValueById?.('ParamMouthForm', 1.0, 1.0);
        } catch {}

        // Log parameters once so we can find hand parameter names
        if (!(window as any)._loggedParams) {
          (window as any)._loggedParams = true;
          console.log('[Live2D] Available Parameters:', core.getParameterIds?.() ?? []);
        }

        // ── Blend factor: 0 = full idle, 1 = full speaking ────────────────────
        const targetBlend = isSpeakingRef.current ? 1 : 0;
        speakBlendRef.current += (targetBlend - speakBlendRef.current) * 0.04;
        const blend = speakBlendRef.current;
        const iBlend = 1 - blend;  // idle weight
        const t = idleTime;

        // Safe helper to add parameter values by ID natively via SDK
        const tryAdd = (id: string, value: number) => {
          try {
            core.addParameterValueById?.(id, value, 1.0);
          } catch {}
        };

        // Safe helper to set parameter values by ID natively via SDK
        const trySet = (id: string, value: number) => {
          try {
            core.setParameterValueById?.(id, value, 1.0);
          } catch {}
        };

        // ── IDLE animations (gentle breathing sway) ──────────────────────────
        tryAdd('ParamAngleX', Math.sin(t * 1.7) * 5  * iBlend);  
        tryAdd('ParamAngleY', Math.sin(t * 1.1) * 3  * iBlend);  
        tryAdd('ParamAngleZ', Math.sin(t * 0.8) * 2  * iBlend);  
        tryAdd('ParamBodyAngleX', Math.sin(t * 1.3) * 3 * iBlend);  
        trySet('ParamBreath', (Math.sin(t * 3.5) + 1) / 2 * iBlend + (Math.sin(t * 7.0) + 1) / 2 * blend * 0.5);

        // ── Custom Accessories (Jingliu Blindfold) ────────────────────────────
        if (modelUrl.includes('jingliu')) {
          // Param100 controls the blindfold (1.0 = Blindfold On, 0.0 = Open Eyes)
          trySet('Param100', jingliuEyeRef.current ? 0.0 : 1.0);
        }

        // ── SPEAKING animations (expressive, energetic) ───────────────────────
        // ── Custom Mathematical Animations (Created purely via Script!) ──────
        const emo = (emotion || '').toLowerCase();
        
        // Base Y position depends on if we are in Mini Mode or not
        const currentConfig = configRefs.current;
        let baseY = container.clientHeight - model.height;
        if (currentConfig.isMiniMode) {
          baseY = currentConfig.miniYOffset;
        }

        if (emo.includes('excited') || emo.includes('jump')) {
          // Jump up and down
          const jumpHeight = Math.abs(Math.sin(t * 8.0)) * 30;
          model.y = baseY - jumpHeight;
          tryAdd('ParamAngleX', Math.sin(t * 15.0) * 5); // Shake slightly while jumping
        } else if (emo.includes('dizzy') || emo.includes('confused') || emo.includes('spin')) {
          // Dizzy head spinning
          trySet('ParamAngleX', Math.sin(t * 5.0) * 30);
          trySet('ParamAngleY', Math.cos(t * 5.0) * 30);
          trySet('ParamAngleZ', Math.sin(t * 3.0) * 20);
          model.y = baseY; // Ensure stable Y
        } else if (emo.includes('angry')) {
          // Angry shaking and leaning forward
          trySet('ParamAngleX', Math.sin(t * 20.0) * 10); // rapid head shake
          trySet('ParamBodyAngleZ', Math.cos(t * 20.0) * 5); // rapid body shake
          trySet('ParamAngleY', -20); // tilt head down slightly
          model.y = baseY;
        } else if (emo.includes('yaotou') || emo.includes('disagree') || emo.includes('no')) {
          // Yaotou (Shake head side to side)
          trySet('ParamAngleX', Math.sin(t * 12.0) * 30); // smooth but fast head shake left/right
          trySet('ParamBodyAngleX', Math.sin(t * 12.0) * -10); // slight counter body movement
          trySet('ParamEyeLOpen', 0.8); // slight squint
          trySet('ParamEyeROpen', 0.8);
          model.y = baseY;
        } else if (emo.includes('sad') || emo.includes('cry')) {
          // Sad looking down and shrinking slightly
          trySet('ParamAngleY', -30); // Look down
          trySet('ParamBodyAngleY', -10); // slump shoulders
          trySet('ParamEyeLOpen', 0.5); // half-closed sad eyes
          trySet('ParamEyeROpen', 0.5); 
          model.y = baseY + 10; // sink down slightly from baseY
        } else {
          // Reset position if not jumping/shrinking
          model.y = baseY;
        }

        // ── Debug Stats Update ────────────────────────────────────────────────
        const statsEl = document.getElementById('live2d-debug-stats');
        if (statsEl) {
          statsEl.innerText = `Speaking: ${isSpeakingRef.current} | Blend: ${blend.toFixed(2)} | Mouth: ${mouthOpenRef.current.toFixed(2)} | MouthID: ${mouthParamId}`;
        }
      });

      // Removed the 5-second random setInterval here because it was playing 
      // unwanted random animations that ignored the semantic meaning of the speech.

    }).catch((err: any) => {
      addDebug(`LOAD ERROR: ${err?.message ?? String(err)}`);
      if (isMounted) { setError(String(err)); setLoading(false); }
    });

    return () => {
      isMounted = false;
      modelRef.current = null;
      clearInterval(idleTimer);
      if (container.contains(app.view)) container.removeChild(app.view);
      try { app.destroy(true, { children: true }); } catch {}
    };
  }, [modelUrl]);

  // ─── LIP SYNC ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!audioElement) return;

    let rafId = 0;

    // Build a fresh analyser for THIS audio element each time
    let ctx: AudioContext;
    let analyser: AnalyserNode;
    let data: Uint8Array;

    try {
      // Reuse one global AudioContext (browser allows only one per page)
      if (!(window as any).__liveAudioCtx) {
        (window as any).__liveAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      ctx = (window as any).__liveAudioCtx as AudioContext;

      // Create a FRESH analyser for this specific audio element
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;           // more resolution
      analyser.smoothingTimeConstant = 0.6;
      data = new Uint8Array(analyser.frequencyBinCount);

      // Connect: audioElement → source → analyser → speakers
      const source = ctx.createMediaElementSource(audioElement);
      source.connect(analyser);
      analyser.connect(ctx.destination);

      addDebug('Audio pipeline: connected ✓');
    } catch (err: any) {
      addDebug(`Audio connect ERROR: ${err?.message}`);
      // If createMediaElementSource fails (element already used), fall back
      analyser = (window as any).__liveAudioAnalyser;
      data = analyser ? new Uint8Array(analyser.frequencyBinCount) : new Uint8Array(0);
    }

    const analyse = () => {
      if (!analyser || audioElement.paused || audioElement.ended) {
        mouthOpenRef.current = 0;
        return;
      }
      if (ctx.state === 'suspended') ctx.resume();

      analyser.getByteFrequencyData(data as Uint8Array<ArrayBuffer>);

      // Sum vocal frequency range (bins 2–16 of 1024-point FFT = ~85Hz–680Hz)
      let sum = 0;
      for (let i = 2; i <= 16; i++) sum += data[i];
      const avg = sum / 15;

      // Normalise — TTS audio is usually loud, threshold 10, max around 120
      const target = avg > 10 ? Math.min(avg / 100, 1.0) : 0;
      mouthOpenRef.current += (target - mouthOpenRef.current) * 0.4;

      rafId = requestAnimationFrame(analyse);
    };

    const triggerSpeakMotion = () => {
      const m = modelRef.current;
      if (!m?.internalModel?.motionManager) return;
      const mgr = m.internalModel.motionManager;
      const groups = Object.keys(mgr.definitions ?? {});
      if (!groups.length) return;
      
      let grp = '';
      const emo = (emotion || '').toLowerCase();
      
      addDebug(`Semantic matching emotion: "${emo}" against ${groups.length} groups`);

      // Semantic mapping for Huohuo's full animation suite
      if (emo.includes('happy') || emo.includes('excited') || emo.includes('hello') || emo.includes('hi')) {
        grp = groups.find(g => g.includes('qizi')) || ''; // Flag wave
      } else if (emo.includes('relaxed') || emo.includes('greeting')) {
        grp = groups.find(g => g.includes('haoqi')) || ''; // Curious look
      } else if (emo.includes('sad') || emo.includes('shy') || emo.includes('cry')) {
        grp = groups.find(g => g.includes('yaotou')) || ''; // Shake head
      } else if (emo.includes('tired')) {
        grp = groups.find(g => g.includes('keshui')) || ''; // Sleepy / nodding off
      } else if (emo.includes('angry') || emo.includes('blush')) {
        grp = groups.find(g => g.includes('zhentou')) || ''; // Pillow defense
      } else if (emo.includes('scared') || emo.includes('shocked') || emo.includes('surprised')) {
        grp = groups.find(g => g.includes('linghun')) || ''; // Soul/Ghost jump scare
      }
      
      // Fallback to idle if no match found
      if (!grp) {
        grp = groups.find(g => g.includes('Scene1') || g.includes('idle')) || groups[0];
      }

      const list = mgr.definitions[grp];
      if (!list?.length) return;
      
      addDebug(`Triggering motion: ${grp} for emotion: ${emo}`);
      mgr.startMotion(grp, Math.floor(Math.random() * list.length), 3); // 3 = PRIORITY_FORCE
    };

    const triggerIdleMotion = () => {
      const m = modelRef.current;
      if (!m?.internalModel?.motionManager) return;
      const mgr = m.internalModel.motionManager;
      const groups = Object.keys(mgr.definitions ?? {});
      if (!groups.length) return;
      const grp = groups.find(g => g.includes('Scene1') || g.includes('idle')) || groups[0];
      const list = mgr.definitions[grp];
      if (!list?.length) return;
      mgr.startMotion(grp, 0, 2); // 2 = PRIORITY_NORMAL
    };

    const onPlay = () => {
      addDebug('Audio: play event fired');
      isSpeakingRef.current = true;
      if (ctx.state === 'suspended') ctx.resume();
      cancelAnimationFrame(rafId);
      analyse();
      
      // Trigger the semantic motion EXACTLY once at the start of the audio
      triggerSpeakMotion();
    };

    const onStop = () => {
      addDebug('Audio: stop/ended');
      isSpeakingRef.current = false;
      cancelAnimationFrame(rafId);
      mouthOpenRef.current = 0;
      // Reset back to the clean idle state so props like pillows are hidden
      triggerIdleMotion();
    };

    audioElement.addEventListener('play', onPlay);
    audioElement.addEventListener('pause', onStop);
    audioElement.addEventListener('ended', onStop);
    if (!audioElement.paused) onPlay();

    return () => {
      audioElement.removeEventListener('play', onPlay);
      audioElement.removeEventListener('pause', onStop);
      audioElement.removeEventListener('ended', onStop);
      cancelAnimationFrame(rafId);
      mouthOpenRef.current = 0;
    };
  }, [audioElement]);

  // ─── EMOTION → EXPRESSION ───────────────────────────────────────────────────
  useEffect(() => {
    const m = modelRef.current;
    if (!m?.internalModel) return;
    const expList: any[] = m.internalModel.settings?.expressions ?? m.internalModel.settings?.Expressions ?? [];
    if (!expList.length) return;
    const e = (emotion ?? 'neutral').toLowerCase();
    const matchers: Record<string, (n: string, f: string) => boolean> = {
      happy:    (n, f) => /ga|xinxin|happy/.test(n) || /exp_0|exp_1/.test(f),
      angry:    (n, f) => /sq|angry/.test(n)         || /exp_2/.test(f),
      sad:      (n, f) => /ku|sad|cry/.test(n)        || /exp_3/.test(f),
      surprise: (n, f) => /zs|surprise|shock/.test(n) || /exp_4|exp_5/.test(f),
      shy:      (n, f) => /st|shy|blush/.test(n)      || /exp_6/.test(f),
    };
    let key = '';
    if (/happy|smile|joy|excited/.test(e)) key = 'happy';
    else if (/angry|mad/.test(e))          key = 'angry';
    else if (/sad|cry|weep/.test(e))       key = 'sad';
    else if (/surprise|shock/.test(e))     key = 'surprise';
    else if (/shy|blush|tired/.test(e))    key = 'shy';
    const idx = key ? expList.findIndex((ex: any) => matchers[key]((ex.name ?? ex.Name ?? '').toLowerCase(), (ex.file ?? ex.File ?? '').toLowerCase())) : -1;
    m.expression(idx >= 0 ? idx : -1);
  }, [emotion]);

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="viewport-container glass-panel"
      style={{ background: 'transparent', position: 'relative' }}>

      {loading && (
        <div style={styles.overlay}>
          <div style={styles.spinner} className="pulse-glow" />
          <div style={styles.loadingText}>Loading Live2D Character…</div>
        </div>
      )}
      {error && (
        <div style={styles.overlay}>
          <div style={styles.errorText}>⚠️ {error}</div>
        </div>
      )}

      {/* Live debug overlay — visible on screen */}
      {!isMiniMode && debugLines.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 8, left: 8, right: 8,
          background: 'rgba(0,0,0,0.75)', borderRadius: 8, padding: '6px 10px',
          zIndex: 20, pointerEvents: 'none',
          fontFamily: 'monospace', fontSize: '10px', color: '#00ff88',
          lineHeight: 1.6,
        }}>
          {debugLines.map((l, i) => <div key={i}>{l}</div>)}
          <div id="live2d-debug-stats" style={{ marginTop: 4, color: '#ffeb3b', fontWeight: 'bold' }}>
            Waiting for stats...
          </div>
        </div>
      )}

      {!isMiniMode && (
        <div style={styles.hudOverlay}>
          <div style={styles.cornerTL} /><div style={styles.cornerTR} />
          <div style={styles.cornerBL} /><div style={styles.cornerBR} />
        </div>
      )}
    </div>
  );
};

const styles = {
  overlay: { position: 'absolute' as const, inset: 0, background: 'rgba(3,7,18,0.85)', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', zIndex: 10, borderRadius: '16px' },
  spinner: { width: 50, height: 50, border: '3px solid rgba(99,102,241,0.15)', borderTop: '3px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: 20 },
  loadingText: { color: '#e2e8f0', fontFamily: 'Outfit, sans-serif', fontSize: '1rem' },
  errorText:   { color: '#ef4444', fontFamily: 'Outfit, sans-serif', fontSize: '1rem', fontWeight: 600 },
  hudOverlay: { position: 'absolute' as const, inset: 0, pointerEvents: 'none' as const, zIndex: 5, borderRadius: '16px', border: '1px solid rgba(255,255,255,0.03)', overflow: 'hidden' },
  cornerTL: { position: 'absolute' as const, top: 12, left: 12,    width: 16, height: 16, borderTop:    '2px solid rgba(99,102,241,0.4)', borderLeft:  '2px solid rgba(99,102,241,0.4)' },
  cornerTR: { position: 'absolute' as const, top: 12, right: 12,   width: 16, height: 16, borderTop:    '2px solid rgba(99,102,241,0.4)', borderRight: '2px solid rgba(99,102,241,0.4)' },
  cornerBL: { position: 'absolute' as const, bottom: 12, left: 12,  width: 16, height: 16, borderBottom: '2px solid rgba(99,102,241,0.4)', borderLeft:  '2px solid rgba(99,102,241,0.4)' },
  cornerBR: { position: 'absolute' as const, bottom: 12, right: 12, width: 16, height: 16, borderBottom: '2px solid rgba(99,102,241,0.4)', borderRight: '2px solid rgba(99,102,241,0.4)' },
};
