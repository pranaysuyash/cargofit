import React, { useState, useMemo } from 'react';
import {
  classifyFreightDensity,
  NMFC_STANDARD_TIERS,
  NmfcClassificationInput,
} from '../engine/nmfcClassification';
import { IconX } from './icons';

interface NmfcClassificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialWeightLbs: number;
  initialVolumeCuFt: number;
  onApplyClassification?: (summary: {
    primaryClass: string;
    densityLbsCuFt: number;
    dimWeightPenaltyLbs?: number;
    assumptions: { weightLbs: number; volumeCuFt: number; dimFactor: number };
  }) => void;
}

export const NmfcClassificationModal: React.FC<NmfcClassificationModalProps> = ({
  isOpen,
  onClose,
  initialWeightLbs,
  initialVolumeCuFt,
  onApplyClassification,
}) => {
  const [weightLbs, setWeightLbs] = useState<number>(initialWeightLbs);
  const [volumeCuFt, setVolumeCuFt] = useState<number>(initialVolumeCuFt);
  const [dimFactor, setDimFactor] = useState<number>(166);
  const validInputs = Number.isFinite(weightLbs) && weightLbs > 0 && Number.isFinite(volumeCuFt) && volumeCuFt > 0;

  const result = useMemo(() => {
    const input: NmfcClassificationInput = {
      totalWeightLbs: weightLbs,
      totalVolumeCuFt: volumeCuFt,
      dimFactor,
    };
    return classifyFreightDensity(input);
  }, [weightLbs, volumeCuFt, dimFactor]);

  const handleApply = () => {
    if (!validInputs) return;
    const summary = {
      primaryClass: String(result.recommendedNmfcClass),
      densityLbsCuFt: result.densityPcf,
      dimWeightPenaltyLbs: result.isDimWeightPenaltyActive ? result.dimWeightOverageLbs : undefined,
      assumptions: { weightLbs, volumeCuFt, dimFactor },
    };
    if (onApplyClassification) {
      onApplyClassification(summary);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nmfc-modal-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1050,
        padding: '20px',
      }}
    >
      <div
        className="modal-container"
        style={{
          background: '#ffffff',
          borderRadius: 12,
          maxWidth: 920,
          width: '100%',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #cbd5e1',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f8fafc',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 id="nmfc-modal-title" style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
                NMFC Freight Density &amp; LTL Classification Engine
              </h2>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  padding: '3px 10px',
                  borderRadius: 9999,
                  background: '#e0f2fe',
                  color: '#0369a1',
                  border: '1px solid #bae6fd',
                }}
              >
                {validInputs ? `MODEL CLASS ${result.recommendedNmfcClass}` : 'INPUTS NEEDED'}
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
              Illustrative density estimate only. Actual classification and carrier charges require independent confirmation.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 22,
              cursor: 'pointer',
              color: '#64748b',
              padding: 4,
              lineHeight: 1,
            }}
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {!validInputs && <p role="status">Enter a positive cargo weight and volume to calculate an illustrative estimate.</p>}
          {/* Key Metric Highlights */}
          {validInputs && <><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Cargo Density</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
                {result.densityPcf} <span style={{ fontSize: 12, fontWeight: 500 }}>lbs/ft³</span>
              </div>
              <div style={{ fontSize: 11, color: '#0284c7' }}>{result.tier.description}</div>
            </div>

            <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Entered Weight</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
                {result.actualWeightLbs.toLocaleString()} <span style={{ fontSize: 12, fontWeight: 500 }}>lbs</span>
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Cube: {result.volumeCuFt.toLocaleString()} ft³</div>
            </div>

            <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Dimensional (DIM) Weight</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: result.isDimWeightPenaltyActive ? '#dc2626' : '#16a34a' }}>
                {result.dimWeightLbs.toLocaleString()} <span style={{ fontSize: 12, fontWeight: 500 }}>lbs</span>
              </div>
              <div style={{ fontSize: 11, color: result.isDimWeightPenaltyActive ? '#dc2626' : '#64748b' }}>
                DIM Factor: {result.dimFactor}
              </div>
            </div>

            <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Modeled Weight</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
                {result.billableWeightLbs.toLocaleString()} <span style={{ fontSize: 12, fontWeight: 500 }}>lbs</span>
              </div>
              <div style={{ fontSize: 11, color: result.isDimWeightPenaltyActive ? '#dc2626' : '#16a34a' }}>
                {result.isDimWeightPenaltyActive ? 'Cube-out governed' : 'Actual weight governed'}
              </div>
            </div>
          </div>

          {/* Audit Explanation Banner */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: result.isDimWeightPenaltyActive ? '#fef2f2' : '#f0fdf4',
              border: `1px solid ${result.isDimWeightPenaltyActive ? '#f87171' : '#86efac'}`,
              fontSize: 13,
              color: result.isDimWeightPenaltyActive ? '#991b1b' : '#166534',
              fontWeight: 500,
            }}
          >
            Density {result.densityPcf.toFixed(1)} lbs/ft³ maps to illustrative class {result.recommendedNmfcClass}. Actual classification and carrier billing are unverified.
          </div></>}

          {/* Interactive Calculation Controls */}
          <div style={{ background: '#f8fafc', padding: '14px 18px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>
              Adjust Manifest Weight &amp; Cube Parameters
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                  Manifest Weight (lbs):
                </label>
                <input
                  type="number"
                  min={10}
                  max={60000}
                  value={weightLbs}
                  onChange={(e) => setWeightLbs(Number(e.target.value))}
                  style={{ width: '100%', padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #cbd5e1' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                  Manifest Volume (Cubic Feet):
                </label>
                <input
                  type="number"
                  min={1}
                  max={4000}
                  value={volumeCuFt}
                  onChange={(e) => setVolumeCuFt(Number(e.target.value))}
                  style={{ width: '100%', padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #cbd5e1' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                  DIM Factor Divisor:
                </label>
                <select
                  value={dimFactor}
                  onChange={(e) => setDimFactor(Number(e.target.value))}
                  style={{ width: '100%', padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #cbd5e1' }}
                >
                  <option value={166}>166 (Domestic Ground Freight / Standard)</option>
                  <option value={139}>139 (Air &amp; Express Cargo)</option>
                  <option value={250}>250 (Low-Density LTL Commodity Tariffs)</option>
                </select>
              </div>
            </div>
          </div>

          {/* NMFC Standard Tier Reference Grid */}
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
              Illustrative Density Tiers (Density Range &amp; Commodities)
            </h3>
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', color: '#475569', textAlign: 'left', borderBottom: '1px solid #cbd5e1' }}>
                    <th style={{ padding: '6px 10px' }}>Class</th>
                    <th style={{ padding: '6px 10px' }}>Density Range (pcf)</th>
                    <th style={{ padding: '6px 10px' }}>Freight Description</th>
                    <th style={{ padding: '6px 10px' }}>Representative Commodities</th>
                  </tr>
                </thead>
                <tbody>
                  {NMFC_STANDARD_TIERS.map((tier) => {
                    const isCurrent = validInputs && tier.classNumber === result.recommendedNmfcClass;
                    return (
                      <tr
                        key={tier.classNumber}
                        style={{
                          background: isCurrent ? '#e0f2fe' : '#ffffff',
                          borderBottom: '1px solid #f1f5f9',
                          fontWeight: isCurrent ? 700 : 400,
                        }}
                      >
                        <td style={{ padding: '6px 10px', color: isCurrent ? '#0369a1' : '#0f172a' }}>
                          Class {tier.classNumber} {isCurrent && '◀ CURRENT'}
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          {tier.minDensityPcf} to {tier.maxDensityPcf === Infinity ? 'Over' : `${tier.maxDensityPcf}`} lbs/ft³
                        </td>
                        <td style={{ padding: '6px 10px' }}>{tier.description}</td>
                        <td style={{ padding: '6px 10px', color: '#64748b' }}>{tier.representativeGoods}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f8fafc',
          }}
        >
          <span style={{ fontSize: 11, color: '#64748b' }}>
            {validInputs ? <>Illustrative Class: <b>Class {result.recommendedNmfcClass}</b> · Modeled Weight: <b>{result.billableWeightLbs.toLocaleString()} lbs</b></> : 'Estimate unavailable until inputs are provided.'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: '6px 14px',
                background: '#ffffff',
                color: '#475569',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              disabled={!validInputs}
              onClick={handleApply}
              style={{
                padding: '6px 16px',
                background: '#0284c7',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Include estimate in plan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
