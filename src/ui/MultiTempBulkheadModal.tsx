import React, { useState, useMemo } from 'react';
import {
  calculateMultiTempBulkheads,
  inferTemperatureClassification,
  PerishableCargoItem,
  TempClassification,
  MultiTempPlanResult,
  STANDARD_53FT_REEFER,
} from '../engine/multiTempBulkhead';
import { CargoRow } from '../engine/types';

interface MultiTempBulkheadModalProps {
  cargoRows: CargoRow[];
  isOpen: boolean;
  onClose: () => void;
  onApply?: (bulkheadPosIn: number, zones: TempClassification[]) => void;
}

export const MultiTempBulkheadModal: React.FC<MultiTempBulkheadModalProps> = ({
  cargoRows,
  isOpen,
  onClose,
  onApply,
}) => {
  const [bulkheadPosIn, setBulkheadPosIn] = useState<number>(300);
  const [zone1Class, setZone1Class] = useState<TempClassification>('frozen');
  const [zone2Class, setZone2Class] = useState<TempClassification>('chilled');
  const [ambientTempF, setAmbientTempF] = useState<number>(85);

  // Convert cargo rows to perishable cargo items
  const perishableItems: PerishableCargoItem[] = useMemo(() => {
    return cargoRows.map((r, idx) => {
      const lengthIn = r.length ? (r.dimUnit === 'm' ? r.length * 39.37 : r.dimUnit === 'cm' ? r.length * 0.3937 : r.dimUnit === 'ft' ? r.length * 12 : r.length) : 48;
      const widthIn = r.width ? (r.dimUnit === 'm' ? r.width * 39.37 : r.dimUnit === 'cm' ? r.width * 0.3937 : r.dimUnit === 'ft' ? r.width * 12 : r.width) : 40;
      const heightIn = r.height ? (r.dimUnit === 'm' ? r.height * 39.37 : r.dimUnit === 'cm' ? r.height * 0.3937 : r.dimUnit === 'ft' ? r.height * 12 : r.height) : 60;
      const weightLb = r.weight ? (r.weightUnit === 'kg' ? r.weight * 2.20462 : r.weightUnit === 't' ? r.weight * 2204.62 : r.weight) : 1000;
      const qty = r.qty || 1;
      const requiredTempClass = inferTemperatureClassification(r.label);

      return {
        id: r.uid || `ITEM-${idx}`,
        description: r.label,
        qty,
        lengthIn,
        widthIn,
        heightIn,
        weightLb,
        requiredTempClass,
      };
    });
  }, [cargoRows]);

  // Compute multi-temp partition
  const planResult: MultiTempPlanResult = useMemo(() => {
    return calculateMultiTempBulkheads(
      [bulkheadPosIn],
      [zone1Class, zone2Class],
      perishableItems,
      ambientTempF
    );
  }, [bulkheadPosIn, zone1Class, zone2Class, perishableItems, ambientTempF]);

  // Auto-balance bulkhead position based on cargo volume ratio
  const handleAutoBalance = () => {
    const zone1Items = perishableItems.filter((i) => i.requiredTempClass === zone1Class);
    const zone2Items = perishableItems.filter((i) => i.requiredTempClass === zone2Class);

    const vol1 = zone1Items.reduce((acc, i) => acc + (i.lengthIn * i.widthIn * i.heightIn * i.qty) / 1728, 0);
    const vol2 = zone2Items.reduce((acc, i) => acc + (i.lengthIn * i.widthIn * i.heightIn * i.qty) / 1728, 0);
    const totalVol = vol1 + vol2;

    if (totalVol > 0) {
      const ratio = vol1 / totalVol;
      const rawPos = Math.round(STANDARD_53FT_REEFER.lengthIn * ratio);
      // Clamp between 96 and 534 inches
      const clampedPos = Math.max(96, Math.min(534, Math.round(rawPos / 12) * 12));
      setBulkheadPosIn(clampedPos);
    } else {
      setBulkheadPosIn(300); // 50/50 split
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="camera-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulkhead-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="camera-modal-content"
        style={{
          maxWidth: 680,
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
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h3 id="bulkhead-modal-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
              ❄️ 53-ft Multi-Temp Reefer Bulkhead Simulator
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
              Insulated moveable bulkhead (R-14) partitioning Frozen (-10°F), Chilled (34°F) & Ambient (65°F) zones.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.25rem',
              cursor: 'pointer',
              color: '#64748b',
              padding: '4px 8px',
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '20px', maxHeight: '72vh', overflowY: 'auto' }}>
          {/* Visual Reefer Schematic */}
          <div
            style={{
              background: '#0f172a',
              borderRadius: 8,
              padding: '16px',
              color: '#f8fafc',
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.75rem', color: '#94a3b8' }}>
              <span>⬅️ Nose (Primary Evaporator)</span>
              <span>Bulkhead at {bulkheadPosIn}" ({Math.round(bulkheadPosIn / 12)} ft)</span>
              <span>Tail Doors (Secondary Fan) ➡️</span>
            </div>

            <div
              style={{
                display: 'flex',
                height: 48,
                borderRadius: 6,
                overflow: 'hidden',
                border: '2px solid #334155',
                background: '#1e293b',
              }}
            >
              {/* Zone 1 */}
              <div
                style={{
                  width: `${(bulkheadPosIn / STANDARD_53FT_REEFER.lengthIn) * 100}%`,
                  background:
                    zone1Class === 'frozen'
                      ? 'linear-gradient(90deg, #1e3a8a, #3b82f6)'
                      : zone1Class === 'chilled'
                      ? 'linear-gradient(90deg, #065f46, #10b981)'
                      : 'linear-gradient(90deg, #78350f, #f59e0b)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#ffffff',
                  padding: '0 4px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {planResult.zones[0]?.name}
              </div>

              {/* Bulkhead Wall */}
              <div
                style={{
                  width: 8,
                  background: '#f1f5f9',
                  borderLeft: '1px solid #94a3b8',
                  borderRight: '1px solid #94a3b8',
                }}
                title={`Bulkhead R-14 (Pin Hole ${planResult.bulkheads[0]?.trackPinHole})`}
              />

              {/* Zone 2 */}
              <div
                style={{
                  flex: 1,
                  background:
                    zone2Class === 'frozen'
                      ? 'linear-gradient(90deg, #3b82f6, #1e3a8a)'
                      : zone2Class === 'chilled'
                      ? 'linear-gradient(90deg, #10b981, #065f46)'
                      : 'linear-gradient(90deg, #f59e0b, #78350f)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#ffffff',
                  padding: '0 4px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {planResult.zones[1]?.name}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: '0.75rem' }}>
              <div>
                <strong>Zone 1 Pallet Cap:</strong> {planResult.zones[0]?.estimatedGmaPalletCapacity} pallets (
                {planResult.zones[0]?.usableCuFt} cu ft)
              </div>
              <div>
                <strong>Zone 2 Pallet Cap:</strong> {planResult.zones[1]?.estimatedGmaPalletCapacity} pallets (
                {planResult.zones[1]?.usableCuFt} cu ft)
              </div>
            </div>
          </div>

          {/* Controls */}
          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label htmlFor="bulkhead-slider" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                Longitudinal Bulkhead Position: <strong>{bulkheadPosIn} inches</strong> ({Math.round(bulkheadPosIn / 12)} ft from front)
              </label>
              <button
                type="button"
                onClick={handleAutoBalance}
                style={{
                  padding: '4px 10px',
                  background: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ⚡ Auto-Balance by Manifest Ratio
              </button>
            </div>
            <input
              id="bulkhead-slider"
              type="range"
              min={96}
              max={534}
              step={12}
              value={bulkheadPosIn}
              onChange={(e) => setBulkheadPosIn(Number(e.target.value))}
              style={{ width: '100%', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748b', marginTop: 4 }}>
              <span>Min Nose (8 ft)</span>
              <span>Center Split (25 ft)</span>
              <span>Max Rear (44.5 ft)</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                  Zone 1 (Nose) Temp:
                </label>
                <select
                  value={zone1Class}
                  onChange={(e) => setZone1Class(e.target.value as TempClassification)}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                >
                  <option value="frozen">Deep Frozen (-10°F)</option>
                  <option value="chilled">Chilled (34°F)</option>
                  <option value="ambient">Controlled Ambient (65°F)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                  Zone 2 (Rear) Temp:
                </label>
                <select
                  value={zone2Class}
                  onChange={(e) => setZone2Class(e.target.value as TempClassification)}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                >
                  <option value="frozen">Deep Frozen (-10°F)</option>
                  <option value="chilled">Chilled (34°F)</option>
                  <option value="ambient">Controlled Ambient (65°F)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                  Outside Ambient (°F):
                </label>
                <input
                  type="number"
                  min={30}
                  max={115}
                  value={ambientTempF}
                  onChange={(e) => setAmbientTempF(Number(e.target.value))}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                />
              </div>
            </div>
          </div>

          {/* Violations / Warnings */}
          {planResult.violations.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {planResult.violations.map((v, i) => (
                <div
                  key={i}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 6,
                    fontSize: '0.8rem',
                    marginBottom: 6,
                    background: v.severity === 'CRITICAL_OOS' ? '#fef2f2' : '#fffbeb',
                    borderLeft: `4px solid ${v.severity === 'CRITICAL_OOS' ? '#ef4444' : '#f59e0b'}`,
                    color: v.severity === 'CRITICAL_OOS' ? '#991b1b' : '#92400e',
                  }}
                >
                  <strong>{v.severity === 'CRITICAL_OOS' ? '🚫 Out-of-Service Risk' : '⚠️ Airflow Warning'}:</strong> {v.message}
                </div>
              ))}
            </div>
          )}

          {/* Thermal Summary Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
            <div style={{ background: '#f1f5f9', padding: '10px', borderRadius: 6, textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Total Heat Infiltration</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                {planResult.totalHeatLoadBtuHr.toLocaleString()} BTU/hr
              </div>
            </div>
            <div style={{ background: '#f1f5f9', padding: '10px', borderRadius: 6, textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Cargo Volume Utilization</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                {planResult.overallVolumeUtilizationPct}%
              </div>
            </div>
            <div style={{ background: '#f1f5f9', padding: '10px', borderRadius: 6, textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>FSMA Food Safety Status</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: planResult.valid ? '#16a34a' : '#dc2626' }}>
                {planResult.valid ? '✅ COMPLIANT' : '❌ VIOLATIONS'}
              </div>
            </div>
          </div>

          {/* Recommendations */}
          {planResult.recommendations.length > 0 && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '10px 14px' }}>
              <strong style={{ fontSize: '0.75rem', color: '#166534', display: 'block', marginBottom: 4 }}>
                💡 Operational Best Practices:
              </strong>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.75rem', color: '#15803d' }}>
                {planResult.recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div
          style={{
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            padding: '14px 20px',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#475569',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
          <button
            type="button"
            disabled={!planResult.valid}
            onClick={() => {
              if (onApply) onApply(bulkheadPosIn, [zone1Class, zone2Class]);
              onClose();
            }}
            style={{
              padding: '8px 18px',
              borderRadius: 6,
              border: 'none',
              background: planResult.valid ? '#16a34a' : '#94a3b8',
              color: '#ffffff',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: planResult.valid ? 'pointer' : 'not-allowed',
            }}
          >
            Apply Bulkhead Plan ❄️
          </button>
        </div>
      </div>
    </div>
  );
};
