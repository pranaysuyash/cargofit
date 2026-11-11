import React, { useState, useMemo } from 'react';
import {
  simulateTandemSlide,
  solveOptimalTandemPosition,
  TandemSliderConfig,
} from '../engine/tandemSlider';
import { VehicleGeometryInput } from '../engine/bridge';
import { IconX, IconZap } from './icons';

interface TandemSliderModalProps {
  geometryInput: VehicleGeometryInput;
  isOpen: boolean;
  onClose: () => void;
  onApplyConfig?: (config: TandemSliderConfig) => void;
}

export const TandemSliderModal: React.FC<TandemSliderModalProps> = ({
  geometryInput,
  isOpen,
  onClose,
  onApplyConfig,
}) => {
  const [tandemHole, setTandemHole] = useState<number>(6); // Default hole 6 (~40ft KPRA)
  const [fifthWheelPosition, setFifthWheelPosition] = useState<number>(0); // Centered over drives

  const currentResult = useMemo(() => {
    return simulateTandemSlide(geometryInput, {
      tandemHole,
      fifthWheelPosition,
    });
  }, [geometryInput, tandemHole, fifthWheelPosition]);

  const optimalSolution = useMemo(() => {
    return solveOptimalTandemPosition(geometryInput);
  }, [geometryInput]);

  if (!isOpen) return null;

  const handleAutoBalance = () => {
    if (optimalSolution.feasible && optimalSolution.optimalHole !== null) {
      setTandemHole(optimalSolution.optimalHole);
      if (optimalSolution.optimalFifthWheel !== null) {
        setFifthWheelPosition(optimalSolution.optimalFifthWheel);
      }
    }
  };

  const handleApply = () => {
    if (onApplyConfig) {
      onApplyConfig({ tandemHole, fifthWheelPosition });
    }
    onClose();
  };

  const steerGroup = currentResult.bridgeReport.groups.find((g) => g.id.includes('steer'));
  const driveGroup = currentResult.bridgeReport.groups.find((g) => g.id.includes('drive'));
  const trailerGroup = currentResult.bridgeReport.groups.find((g) => g.id.includes('trailer'));

  const steerMax = steerGroup?.maxLegalWeightLbs ?? 12000;
  const driveMax = driveGroup?.maxLegalWeightLbs ?? 34000;
  const trailerMax = trailerGroup?.maxLegalWeightLbs ?? 34000;

  return (
    <div
      className="camera-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tandem-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="camera-modal-content"
        style={{
          maxWidth: 620,
          background: '#ffffff',
          color: '#0f172a',
          border: '1px solid #cbd5e1',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
        }}
      >
        <div
          className="camera-modal-head"
          style={{
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            padding: '14px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2 id="tandem-modal-title" style={{ fontSize: 16, margin: 0, fontWeight: 700, color: '#0f172a' }}>
              Trailer Tandem &amp; Fifth Wheel Pin Slider
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
              Redistribute axle tare and validate Kingpin-to-Rear-Axle (KPRA) statutory compliance
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 20,
              cursor: 'pointer',
              color: '#64748b',
              minWidth: 44,
              minHeight: 44,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Close modal"
          >
            <IconX size={18} />
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Statutory Status Strip */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              background: currentResult.allAxlesLegal ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${currentResult.allAxlesLegal ? '#86efac' : '#fca5a5'}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div>
              <span
                style={{
                  display: 'inline-block',
                  fontWeight: 800,
                  fontSize: 12,
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: currentResult.allAxlesLegal ? '#15803d' : '#b91c1c',
                  color: '#ffffff',
                  marginRight: 8,
                }}
              >
                {currentResult.allAxlesLegal ? 'Within assumed benchmarks; actual status unknown' : 'Assumed benchmark exceeded; actual status unknown'}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
                Estimated GVW (assumed tare and geometry): {currentResult.totalGvwLbs.toLocaleString()} lbs
              </span>
            </div>
            <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700 }}>
              KPRA: {currentResult.kpraFt} ft{' '}
              <span style={{ color: currentResult.kpraCompliant ? '#15803d' : '#b91c1c' }}>
                ({currentResult.kpraCompliant ? 'within assumed benchmark' : 'above assumed benchmark'})
              </span>
            </div>
          </div>

          {/* Axle Weights Breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '10px 12px',
                background: currentResult.steerWeightLbs <= steerMax ? '#f8fafc' : '#fff1f2',
              }}
            >
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>STEER AXLE</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>
                {currentResult.steerWeightLbs.toLocaleString()} lbs
              </div>
              <div style={{ fontSize: 11, color: currentResult.steerWeightLbs <= steerMax ? '#16a34a' : '#dc2626' }}>
                Rating: {steerMax.toLocaleString()} lbs
              </div>
            </div>

            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '10px 12px',
                background: currentResult.driveWeightLbs <= driveMax ? '#f8fafc' : '#fff1f2',
              }}
            >
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>DRIVE TANDEM</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>
                {currentResult.driveWeightLbs.toLocaleString()} lbs
              </div>
              <div style={{ fontSize: 11, color: currentResult.driveWeightLbs <= driveMax ? '#16a34a' : '#dc2626' }}>
                Rating: {driveMax.toLocaleString()} lbs
              </div>
            </div>

            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '10px 12px',
                background: currentResult.trailerWeightLbs <= trailerMax ? '#f8fafc' : '#fff1f2',
              }}
            >
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>TRAILER TANDEM</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>
                {currentResult.trailerWeightLbs.toLocaleString()} lbs
              </div>
              <div style={{ fontSize: 11, color: currentResult.trailerWeightLbs <= trailerMax ? '#16a34a' : '#dc2626' }}>
                Rating: {trailerMax.toLocaleString()} lbs
              </div>
            </div>
          </div>

          {/* Interactive Tandem Bogie Pin Slider */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label htmlFor="tandem-hole-slider" style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                Trailer Tandem Pin Position: Hole {tandemHole} of 12
              </label>
              <span style={{ fontSize: 11, color: '#64748b' }}>
                {tandemHole <= 3 ? 'Rearward (Heavy Drives)' : tandemHole >= 9 ? 'Forward (Heavy Trailer)' : 'Center Balanced'}
              </span>
            </div>
            <input
              id="tandem-hole-slider"
              type="range"
              min={1}
              max={12}
              step={1}
              value={tandemHole}
              onChange={(e) => setTandemHole(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#0284c7', height: 6 }}
              aria-label="Trailer Tandem Pin Hole Slider"
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
              <span>Hole 1 (Rearmost · 43.5ft KPRA)</span>
              <span>Hole 6 (~40ft KPRA)</span>
              <span>Hole 12 (Forward · 36ft KPRA)</span>
            </div>
          </div>

          {/* Interactive Fifth Wheel Offset Slider */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label htmlFor="fifth-wheel-slider" style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                Fifth Wheel Offset: {fifthWheelPosition === 0 ? 'Centered (0)' : fifthWheelPosition > 0 ? `+${fifthWheelPosition} Forward (Heavy Steer)` : `${fifthWheelPosition} Rearward`}
              </label>
              <span style={{ fontSize: 11, color: '#64748b' }}>
                ~250 lbs steer/drive shift per notch
              </span>
            </div>
            <input
              id="fifth-wheel-slider"
              type="range"
              min={-3}
              max={3}
              step={1}
              value={fifthWheelPosition}
              onChange={(e) => setFifthWheelPosition(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#0284c7', height: 6 }}
              aria-label="Tractor Fifth Wheel Pin Position Slider"
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
              <span>-3 (Rearward)</span>
              <span>0 (Center on Drive Tandem)</span>
              <span>+3 (Forward toward Steer)</span>
            </div>
          </div>

          {/* Recommendation / Feedback Note */}
          <div style={{ fontSize: 12, color: '#475569', background: '#f8fafc', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0' }}>
            <strong>Recommendation:</strong> {currentResult.recommendation}
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div
          style={{
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            padding: '12px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            onClick={handleAutoBalance}
            disabled={!optimalSolution.feasible}
            style={{
              background: optimalSolution.feasible ? '#0284c7' : '#94a3b8',
              color: '#ffffff',
              border: 'none',
              borderRadius: 6,
              padding: '10px 16px',
              fontSize: 12,
              fontWeight: 700,
              cursor: optimalSolution.feasible ? 'pointer' : 'not-allowed',
              minHeight: 44,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <IconZap size={14} /> Auto-Solve Legal Pin Position
          </button>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                padding: '10px 16px',
                fontSize: 12,
                fontWeight: 600,
                color: '#475569',
                cursor: 'pointer',
                minHeight: 44,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              style={{
                background: '#15803d',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                padding: '10px 18px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                minHeight: 44,
              }}
            >
              Apply Pin Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
