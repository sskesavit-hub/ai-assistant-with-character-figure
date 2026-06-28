import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm';

interface ThreeViewportProps {
  modelUrl: string;
  audioElement: HTMLAudioElement | null;
  emotion: string;
}

export const ThreeViewport: React.FC<ThreeViewportProps> = ({
  modelUrl,
  audioElement,
  emotion,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // References for Three.js objects to use in loop
  const vrmRef = useRef<VRM | null>(null);
  const currentEmotionRef = useRef<string>(emotion);
  const mouseRef = useRef({ x: 0, y: 0 });

  // Update current emotion reference
  useEffect(() => {
    currentEmotionRef.current = emotion;
  }, [emotion]);

  // Handle mouse move for tracking
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Normalize mouse coords (-1 to +1)
      mouseRef.current = {
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: -(e.clientY / window.innerHeight) * 2 + 1,
      };
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;

    // 1. Setup Scene, Camera, Renderer
    const scene = new THREE.Scene();
    
    // Add grid/background helper
    const gridHelper = new THREE.GridHelper(10, 20, 0x4f46e5, 0x1f2937);
    gridHelper.position.y = -0.8;
    scene.add(gridHelper);

    const camera = new THREE.PerspectiveCamera(
      35,
      container.clientWidth / container.clientHeight,
      0.1,
      20.0
    );
    // Position camera for a full-body view of the model (feet at y = -0.8, head at y = 0.6)
    // Zoomed out to z = 3.2 to prevent the hands/head from being cut off on smaller layouts.
    camera.position.set(0.0, 0.0, 3.2);
    camera.lookAt(0.0, -0.1, 0.0);

    // Setup interactive OrbitControls (allow drag to rotate, wheel to zoom/focus on face)
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    controls.minDistance = 0.4;  // Allow close zooming on the face
    controls.maxDistance = 6.0;  // Allow zooming out
    controls.target.set(0.0, -0.1, 0.0);
    controls.update();

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;

    // 2. Setup Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(2.0, 4.0, 2.0);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const fillLight = new THREE.PointLight(0xa855f7, 1.0, 10);
    fillLight.position.set(-2.0, 1.0, 1.0);
    scene.add(fillLight);

    // 3. Web Audio API Setup for Lip-Sync
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let dataArray = new Uint8Array(0);

    const setupAudioAnalysis = () => {
      if (!audioElement) return;
      try {
        if (!audioContext) {
          let cachedCtx = (window as any).__audioContext;
          let cachedAnal = (window as any).__audioAnalyser;
          
          if (!cachedCtx) {
            console.log("[Audio 3D] Creating new global AudioContext and connecting MediaElementSource...");
            const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
            cachedCtx = new AudioCtx();
            const source = cachedCtx.createMediaElementSource(audioElement);
            cachedAnal = cachedCtx.createAnalyser();
            cachedAnal.fftSize = 128;
            
            source.connect(cachedAnal);
            cachedAnal.connect(cachedCtx.destination);
            
            (window as any).__audioContext = cachedCtx;
            (window as any).__audioAnalyser = cachedAnal;
          } else {
            console.log("[Audio 3D] Reusing existing global AudioContext and Analyser...");
            cachedAnal.fftSize = 128;
          }
          
          audioContext = cachedCtx;
          analyser = cachedAnal;
          
          if (analyser) {
            const bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);
          }
        }
      } catch (err) {
        console.warn("Audio Context setup failed (likely user interaction policy):", err);
      }
    };

    if (audioElement) {
      setupAudioAnalysis();
    }

    // 4. Load VRM Model
    setLoading(true);
    setError(null);

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    let currentVrm: VRM | null = null;
    const clock = new THREE.Clock();

    loader.load(
      modelUrl,
      (gltf) => {
        const vrm = gltf.userData.vrm as VRM;
        if (!vrm) {
          setError("Loaded file is not a valid VRM model.");
          setLoading(false);
          return;
        }

        currentVrm = vrm;
        vrmRef.current = vrm;
        scene.add(vrm.scene);

        // Turn off scene rotation, orient model correctly
        vrm.scene.rotation.y = 0.0; // Face the camera
        vrm.scene.position.y = -0.8;

        // Auto look at camera
        if (vrm.lookAt) {
          vrm.lookAt.target = camera;
        }

        setLoading(false);
      },
      (xhr) => {
        if (xhr.total > 0) {
          setLoadingProgress(Math.round((xhr.loaded / xhr.total) * 100));
        }
      },
      (err) => {
        console.error("Error loading VRM:", err);
        setError("Error loading 3D model. Check backend connection.");
        setLoading(false);
      }
    );

    // 5. Animation Variables
    let blinkTimer = 0.0;
    let blinkDuration = 0.12;
    let timeSinceLastBlink = 0.0;
    let isBlinking = false;

    // Smooth emotion transitions values
    const emotionValues: Record<string, number> = {
      neutral: 1.0,
      happy: 0.0,
      sad: 0.0,
      angry: 0.0,
      surprised: 0.0,
      relaxed: 0.0,
    };

    // 6. Animation Render Loop
    let animationFrameId: number;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const deltaTime = clock.getDelta();
      const time = clock.getElapsedTime();

      if (currentVrm) {
        // Update VRM core (physics, lookat)
        currentVrm.update(deltaTime);

        // --- A. Idle Breathing & Micro-movement Animation ---
        const spine = currentVrm.humanoid?.getRawBone('spine');
        const leftShoulder = currentVrm.humanoid?.getRawBone('leftShoulder');
        const rightShoulder = currentVrm.humanoid?.getRawBone('rightShoulder');

        if (spine && spine.node) {
          // Subtle breathing (sine wave)
          spine.node.rotation.z = Math.sin(time * 1.5) * 0.015;
          spine.node.rotation.x = Math.sin(time * 0.8) * 0.01;
        }
        if (leftShoulder && leftShoulder.node && rightShoulder && rightShoulder.node) {
          leftShoulder.node.rotation.z = Math.sin(time * 1.5) * 0.01 + 0.05;
          rightShoulder.node.rotation.z = -Math.sin(time * 1.5) * 0.01 - 0.05;
        }

        // --- B. Random Eye Blinking ---
        timeSinceLastBlink += deltaTime;
        if (!isBlinking && timeSinceLastBlink > 2.0 + Math.random() * 4.0) {
          isBlinking = true;
          blinkTimer = 0.0;
          timeSinceLastBlink = 0.0;
        }

        if (isBlinking) {
          blinkTimer += deltaTime;
          let blinkValue = 0.0;
          if (blinkTimer < blinkDuration / 2) {
            // Closing eyes
            blinkValue = blinkTimer / (blinkDuration / 2);
          } else if (blinkTimer < blinkDuration) {
            // Opening eyes
            blinkValue = 1.0 - (blinkTimer - blinkDuration / 2) / (blinkDuration / 2);
          } else {
            isBlinking = false;
            blinkValue = 0.0;
          }
          currentVrm.expressionManager?.setValue('blink', blinkValue);
        }

        // --- C. Cursor Look-At / Head Tracking ---
        const head = currentVrm.humanoid?.getRawBone('head');
        const neck = currentVrm.humanoid?.getRawBone('neck');
        if (head && head.node && neck && neck.node) {
          // Lerp neck/head rotation to track mouse
          const targetNeckY = mouseRef.current.x * 0.35; // Neck rotation limit
          const targetNeckX = -mouseRef.current.y * 0.25;

          neck.node.rotation.y = THREE.MathUtils.lerp(neck.node.rotation.y, targetNeckY, 0.1);
          neck.node.rotation.x = THREE.MathUtils.lerp(neck.node.rotation.x, targetNeckX, 0.1);
          
          head.node.rotation.y = THREE.MathUtils.lerp(head.node.rotation.y, targetNeckY * 0.5, 0.1);
          head.node.rotation.x = THREE.MathUtils.lerp(head.node.rotation.x, targetNeckX * 0.5, 0.1);
        }

        // --- D. Lip-Sync (Audio Amplitude Driver) ---
        let mouthOpen = 0.0;
        if (analyser && dataArray.length > 0 && audioElement && !audioElement.paused) {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const average = sum / dataArray.length;
          // Drive the 'aa' blendshape based on volume
          mouthOpen = Math.min((average / 80.0) * 1.5, 1.0);
        }
        currentVrm.expressionManager?.setValue('aa', mouthOpen);

        // --- E. Smooth Emotion Blendshape Transition ---
        const activeEmotion = currentEmotionRef.current || 'neutral';
        const transitionSpeed = 5.0; // Lerp factor
        
        Object.keys(emotionValues).forEach((key) => {
          const target = key === activeEmotion ? 1.0 : 0.0;
          emotionValues[key] = THREE.MathUtils.lerp(emotionValues[key], target, deltaTime * transitionSpeed);
          
          // Set VRM expressions (excluding 'blink' and 'aa' which are set dynamically)
          if (key !== 'neutral') {
            // In VRM standard, keys are happy, sad, angry, surprised, relaxed
            let vrmKey: any = key;
            if (key === 'happy') vrmKey = 'happy';
            if (key === 'sad') vrmKey = 'sad';
            if (key === 'angry') vrmKey = 'angry';
            if (key === 'surprised') vrmKey = 'surprised';
            if (key === 'relaxed') vrmKey = 'relaxed';
            
            currentVrm?.expressionManager?.setValue(vrmKey, emotionValues[key]);
          }
        });

        // Apply all modifications
        currentVrm.expressionManager?.update();
      }

      controls.update(); // Update orbit controls with damping
      renderer.render(scene, camera);
    };

    animate();

    // 7. Handle Resize using ResizeObserver to ensure robust initialization and viewport resize
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          // Pass false to update buffer size only and let CSS handle the canvas dimensions,
          // which avoids triggering another ResizeObserver notification in an infinite loop.
          renderer.setSize(width, height, false);
        }
      }
    });
    
    resizeObserver.observe(container);

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      controls.dispose(); // Clean up controls listener bindings
      renderer.dispose();
      scene.clear();
    };
  }, [modelUrl, audioElement]);

  return (
    <div ref={containerRef} className="viewport-container glass-panel">
      {loading && (
        <div style={styles.overlay}>
          <div style={styles.spinner} className="pulse-glow" />
          <div style={styles.loadingText}>Initializing 3D Assistant ({loadingProgress}%)</div>
        </div>
      )}
      {error && (
        <div style={styles.overlay}>
          <div style={styles.errorText}>⚠️ {error}</div>
          <div style={styles.subErrorText}>Please ensure your local backend server is running.</div>
        </div>
      )}
      <canvas ref={canvasRef} style={styles.canvas} />
      
      {/* Decorative HUD Elements */}
      <div style={styles.hudOverlay}>
        <div style={styles.hudBadge}>
          <span style={styles.hudPulse} className="pulse-accent" />
          <span>SYSTEM ACTIVE</span>
        </div>
        <div style={styles.hudEmotion}>
          <span>MOOD: {emotion.toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
};

const styles = {
  canvas: {
    width: '100%',
    height: '100%',
    display: 'block',
  },
  overlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'center',
    alignItems: 'center',
    background: 'rgba(3, 7, 18, 0.85)',
    zIndex: 10,
    backdropFilter: 'blur(8px)',
  },
  spinner: {
    width: '50px',
    height: '50px',
    borderRadius: '50%',
    border: '3px solid transparent',
    borderTopColor: '#6366f1',
    borderBottomColor: '#a855f7',
    marginBottom: '20px',
  },
  loadingText: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#e2e8f0',
    letterSpacing: '1px',
  },
  errorText: {
    fontSize: '1.1rem',
    fontWeight: 700,
    color: '#ef4444',
    marginBottom: '8px',
  },
  subErrorText: {
    fontSize: '0.85rem',
    color: '#9ca3af',
  },
  hudOverlay: {
    position: 'absolute' as const,
    top: '16px',
    left: '16px',
    right: '16px',
    display: 'flex',
    justifyContent: 'space-between',
    pointerEvents: 'none' as const,
    zIndex: 5,
  },
  hudBadge: {
    background: 'rgba(0, 0, 0, 0.5)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '20px',
    padding: '6px 12px',
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '1px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#e2e8f0',
  },
  hudPulse: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#14b8a6',
    display: 'inline-block',
  },
  hudEmotion: {
    background: 'rgba(0, 0, 0, 0.5)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '20px',
    padding: '6px 12px',
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '1px',
    color: '#a855f7',
  }
};
