import React, { useState } from 'react';
import {
  STANDARD_BOARD_GRADES,
  CorrugatedBoardSpec,
  PackagingStackEnvironment,
  analyzeCartonStacking,
} from '../engine/cartonCompression';

export interface CartonCompressionModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialWeightLbs?: number;
  initialDimsIn?: [number, number, number];
  onApplyLimit?: (maxSafeTiers: number) => void;
}

export const CartonCompressionModal: React.FC<CartonCompressionModalProps> = ({
  isOpen,
  onClose,
  initialWeightLbs = 35,
  initialDimsIn = [18, 14, 12],
  onApplyLimit,
}) => {
  const [lengthIn, setLengthIn] = useState<number>(initialDimsIn[0]);
  const [widthIn, setWidthIn] = useState<number>(initialDimsIn[1]);
  const [heightIn, setHeightIn] = useState<number>(initialDimsIn[2]);
  const [cartonWeightLbs, setCartonWeightLbs] = useState<number>(initialWeightLbs);
  const [tierCount, setTierCount] = useState<number>(6);
  const [selectedGradeKey, setSelectedGradeKey] = useState<string>('32_ECT_C');
  const [env, setEnv] = useState<PackagingStackEnvironment>({
    relativeHumidityPct: 65,
    storageDurationDays: 14,
    stackPattern: 'COLUMN_ALIGNED',
    palletOverhangInches: 0,
  });

  if (!isOpen) return null;

  const board: CorrugatedBoardSpec = STANDARD_BOARD_GRADES[selectedGradeKey] || STANDARD_BOARD_GRADES['32_ECT_C'];
  const analysis = analyzeCartonStacking(lengthIn, widthIn, heightIn, cartonWeightLbs, tierCount, board, env);

  const handleApply = () => {
    if (onApplyLimit) {
      onApplyLimit(analysis.maxSafeTierCount);
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="carton-compression-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(2, 6, 23, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '720px',
          backgroundColor: '#0b1329',
          border: '1px solid #1e293b',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflow: 'hidden',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: '#f8fafc',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(90deg, #0b1329 0%, #111e38 100%)',
          }}
        >
          <div>
            <h3
              id="carton-compression-title"
              style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#38bdf8', letterSpacing: '0.02em' }}
            >
              📦 Carton Compressive Strength & Stacking Crush Limits
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#94a3b8' }}>
              McKee Box Compression Test (BCT) & ASTM D4169 / ISTA 3A Degradation Factor
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Top Row: Board Grade & Carton Dims */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginBottom: '6px' }}>
                CORRUGATED BOARD GRADE:
              </label>
              <select
                value={selectedGradeKey}
                onChange={(e) => setSelectedGradeKey(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '12px',
                }}
              >
                {Object.entries(STANDARD_BOARD_GRADES).map(([key, g]) => (
                  <option key={key} value={key}>
                    {g.gradeName} ({g.ectRatingLbsPerIn} ECT)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginBottom: '6px' }}>
                SINGLE CARTON WEIGHT (LBS):
              </label>
              <input
                type="number"
                min="5"
                max="250"
                value={cartonWeightLbs}
                onChange={(e) => setCartonWeightLbs(Math.max(1, parseFloat(e.target.value) || 1))}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '12px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Dims and Tiers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '11px', color: '#94a3b8' }}>LENGTH (IN):</label>
              <input
                type="number"
                min="4"
                max="60"
                value={lengthIn}
                onChange={(e) => setLengthIn(Math.max(4, parseFloat(e.target.value) || 4))}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '12px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#94a3b8' }}>WIDTH (IN):</label>
              <input
                type="number"
                min="4"
                max="60"
                value={widthIn}
                onChange={(e) => setWidthIn(Math.max(4, parseFloat(e.target.value) || 4))}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '12px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#94a3b8' }}>HEIGHT (IN):</label>
              <input
                type="number"
                min="4"
                max="60"
                value={heightIn}
                onChange={(e) => setHeightIn(Math.max(4, parseFloat(e.target.value) || 4))}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '12px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#94a3b8' }}>TIERS HIGH:</label>
              <input
                type="number"
                min="1"
                max="12"
                value={tierCount}
                onChange={(e) => setTierCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '12px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Environmental Factors */}
          <div
            style={{
              background: '#0f172a',
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid #1e293b',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '12px',
            }}
          >
            <div>
              <label style={{ fontSize: '10px', color: '#94a3b8' }}>HUMIDITY (%):</label>
              <input
                type="number"
                min="20"
                max="95"
                value={env.relativeHumidityPct}
                onChange={(e) =>
                  setEnv({ ...env, relativeHumidityPct: Math.min(99, Math.max(10, parseInt(e.target.value, 10) || 50)) })
                }
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #475569',
                  borderRadius: '4px',
                  color: '#f8fafc',
                  fontSize: '11px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '10px', color: '#94a3b8' }}>STORAGE DURATION:</label>
              <select
                value={env.storageDurationDays}
                onChange={(e) => setEnv({ ...env, storageDurationDays: parseInt(e.target.value, 10) })}
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #475569',
                  borderRadius: '4px',
                  color: '#f8fafc',
                  fontSize: '11px',
                }}
              >
                <option value={5}>&lt; 10 Days (Fast transit)</option>
                <option value={20}>10 - 30 Days (Standard DC)</option>
                <option value={60}>&gt; 30 Days (Extended)</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '10px', color: '#94a3b8' }}>STACKING PATTERN:</label>
              <select
                value={env.stackPattern}
                onChange={(e) =>
                  setEnv({ ...env, stackPattern: e.target.value as PackagingStackEnvironment['stackPattern'] })
                }
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #475569',
                  borderRadius: '4px',
                  color: '#f8fafc',
                  fontSize: '11px',
                }}
              >
                <option value="COLUMN_ALIGNED">Column Aligned (100% Strength)</option>
                <option value="INTERLOCKED_BRICK">Interlocked Brick (-40% Strength)</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '10px', color: '#94a3b8' }}>PALLET OVERHANG:</label>
              <select
                value={env.palletOverhangInches}
                onChange={(e) => setEnv({ ...env, palletOverhangInches: parseFloat(e.target.value) })}
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #475569',
                  borderRadius: '4px',
                  color: '#f8fafc',
                  fontSize: '11px',
                }}
              >
                <option value={0}>Flush (0.0" Overhang)</option>
                <option value={0.5}>0.5" Minor Overhang</option>
                <option value={1.0}>1.0" Severe Overhang</option>
              </select>
            </div>
          </div>

          {/* Results Analysis HUD */}
          <div
            style={{
              padding: '14px',
              borderRadius: '8px',
              backgroundColor:
                analysis.status === 'CRUSH_HAZARD'
                  ? 'rgba(239, 68, 68, 0.12)'
                  : analysis.status === 'ELEVATED'
                  ? 'rgba(245, 158, 11, 0.12)'
                  : 'rgba(16, 185, 129, 0.12)',
              border: `1px solid ${
                analysis.status === 'CRUSH_HAZARD'
                  ? '#ef4444'
                  : analysis.status === 'ELEVATED'
                  ? '#f59e0b'
                  : '#10b981'
              }`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 800,
                  fontFamily: 'monospace',
                  color:
                    analysis.status === 'CRUSH_HAZARD'
                      ? '#ef4444'
                      : analysis.status === 'ELEVATED'
                      ? '#f59e0b'
                      : '#10b981',
                }}
              >
                STATUS: {analysis.status.replace('_', ' ')}
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                Utilization: <strong>{analysis.utilizationPct}%</strong>
              </span>
            </div>

            {analysis.warningMessage && (
              <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#fca5a5', lineHeight: 1.4 }}>
                ⚠️ {analysis.warningMessage}
              </p>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '8px',
                marginTop: '12px',
                paddingTop: '10px',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <div>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>McKee BCT:</span>
                <div style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'monospace' }}>
                  {analysis.mckeeBctLbs} lbs
                </div>
              </div>
              <div>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>Safety Factor:</span>
                <div style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'monospace' }}>
                  {analysis.environmentalSafetyFactor}x
                </div>
              </div>
              <div>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>Safe Working BCT:</span>
                <div style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'monospace', color: '#38bdf8' }}>
                  {analysis.safeWorkingBctLbs} lbs
                </div>
              </div>
              <div>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>Bottom Load:</span>
                <div style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'monospace' }}>
                  {analysis.bottomCartonLoadLbs} lbs
                </div>
              </div>
              <div>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>Max Safe Tiers:</span>
                <div style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'monospace', color: '#10b981' }}>
                  {analysis.maxSafeTierCount} tiers
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            background: '#090d1c',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: '#1e293b',
              border: 'none',
              borderRadius: '6px',
              color: '#94a3b8',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            style={{
              padding: '8px 16px',
              backgroundColor: '#0284c7',
              border: 'none',
              borderRadius: '6px',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Apply Stacking Limit ({analysis.maxSafeTierCount} Max Tiers)
          </button>
        </div>
      </div>
    </div>
  );
};
