/**
 * Real-Time Camera Barcode & QR Scanner Component.
 * Utilizes HTML5 Video Stream and Web BarcodeDetector API
 * for hands-free pallet tag scanning on the loading dock.
 */

import { useEffect, useRef, useState } from 'react';

interface CameraScannerProps {
  targetUnitId: string;
  targetSkuLabel: string;
  onScan: (code: string) => void;
  onClose: () => void;
}

export function CameraScanner({ targetUnitId, targetSkuLabel, onScan, onClose }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(false);

  // Play audio confirmation tone via Web Audio API
  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // 880 Hz (A5)
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      // AudioContext unavailable or blocked by browser policy
    }
  };

  useEffect(() => {
    let unmounted = false;

    async function startCamera() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setError('Camera API is not supported in this browser environment.');
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' }, // Back camera on phones/tablets
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (unmounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setActive(true);
        }
      } catch (err: any) {
        setError(err.message || 'Camera access was denied or is unavailable.');
      }
    }

    startCamera();

    return () => {
      unmounted = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Continuous Barcode Scanning Loop
  useEffect(() => {
    if (!active) return;
    let animId: number;

    const hasBarcodeDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;
    const detector = hasBarcodeDetector
      ? new (window as any).BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'upc_a'] })
      : null;

    async function scanFrame() {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        animId = requestAnimationFrame(scanFrame);
        return;
      }

      if (detector) {
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0) {
            const rawVal = barcodes[0].rawValue;
            playBeep();
            onScan(rawVal);
            return; // Stop scan loop on match
          }
        } catch {
          // Frame detect skipped
        }
      }

      animId = requestAnimationFrame(scanFrame);
    }

    animId = requestAnimationFrame(scanFrame);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [active, onScan]);

  return (
    <div className="camera-modal-backdrop" role="dialog" aria-modal="true" aria-label="Camera Pallet Scanner">
      <div className="camera-modal-content">
        <div className="camera-modal-head">
          <div className="camera-target-info">
            <span className="camera-lbl">SCANNING FOR DOCK TASK</span>
            <b>{targetUnitId} · {targetSkuLabel}</b>
          </div>
          <button className="btn sm ghost" onClick={onClose}>✕ Close</button>
        </div>

        <div className="camera-viewport">
          {error ? (
            <div className="camera-error-banner">
              <p>📷 {error}</p>
              <p className="small muted">You can still enter barcodes manually using the keyboard input field.</p>
            </div>
          ) : (
            <>
              <video ref={videoRef} className="camera-video" playsInline muted />
              {/* Tactical Scanning Laser HUD Overlay */}
              <div className="camera-reticle">
                <div className="reticle-corners top-left" />
                <div className="reticle-corners top-right" />
                <div className="reticle-corners bottom-left" />
                <div className="reticle-corners bottom-right" />
                <div className="camera-laser" />
              </div>
            </>
          )}
        </div>

        <div className="camera-modal-footer">
          <span className="small muted">
            Aim camera at barcode or QR code label. Auto-advances to target bay position on match.
          </span>
          <button
            className="btn sm"
            onClick={() => {
              // Simulate quick barcode test match for desktop environments without webcam
              playBeep();
              onScan(targetUnitId);
            }}
          >
            ⚡ Test Scan Target ID
          </button>
        </div>
      </div>
    </div>
  );
}
