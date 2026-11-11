import React from 'react';
import { DunnageComplianceReport } from '../engine/dunnageVoidCalculator';

interface DunnageAirbagModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: DunnageComplianceReport;
}

export const DunnageAirbagModal: React.FC<DunnageAirbagModalProps> = ({
  isOpen,
  onClose,
  report,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dunnage-modal-title"
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
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-container"
        style={{
          background: '#ffffff',
          color: '#0f172a',
          borderRadius: 12,
          maxWidth: 680,
          width: '100%',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          border: '1px solid #cbd5e1',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #e2e8f0',
            background: '#f8fafc',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2 id="dunnage-modal-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              49 CFR § 393.106 Cargo Void &amp; Inflatable Dunnage Airbag Advisor
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
              Illustrative geometric screening only. The six-inch threshold and dunnage choices are model assumptions, not a legal or physical assessment.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 20,
              cursor: 'pointer',
              color: '#64748b',
              minWidth: 44,
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {/* Statutory Status Banner */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              background: '#fffbeb',
              border: '1px solid #fde68a',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#92400e' }}>
                {report.statutoryCompliant ? 'No modeled void alert; actual securement unknown' : 'Modeled voids require physical review'}
              </div>
              <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                Geometry and assumed friction are illustrative. Qualified personnel must inspect actual voids and choose appropriate restraints.
              </div>
            </div>
            <div
              style={{
                background: '#b45309',
                color: '#fff',
                fontSize: 11,
                fontWeight: 800,
                padding: '4px 8px',
                borderRadius: 4,
                textTransform: 'uppercase',
              }}
            >
              {report.unsecuredVoidsCount} Void Gap(s) &gt; 6"
            </div>
          </div>

          {/* Dunnage Deployment Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Level 1 Airbags (36×48)</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0284c7', margin: '4px 0' }}>{report.airbagSummary.level1AirbagsCount}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Lateral voids (2.5–3.0 PSI)</div>
            </div>
            <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Level 2 Airbags (48×84)</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#8b5cf6', margin: '4px 0' }}>{report.airbagSummary.level2AirbagsCount}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Rear drop voids (4.5 PSI)</div>
            </div>
            <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Rubber Friction Mats</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: report.requiresFrictionMats ? '#d97706' : '#10b981', margin: '4px 0' }}>
                {report.airbagSummary.frictionMatsCount}
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Floor μ = {report.deckFrictionMu} (Req ≥ 0.5μ)</div>
            </div>
          </div>

          {/* Detected Void Breakdown */}
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 10px', color: '#0f172a' }}>
            Detected Spatial Void Regions &amp; Placement Instructions
          </h3>
          {report.voidRegions.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: 12, background: '#f8fafc', borderRadius: 8 }}>
              No void gaps exceeding 6 inches detected in current loading configuration.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {report.voidRegions.map((v) => (
                <div
                  key={v.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                    background: '#ffffff',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12, color: '#0f172a' }}>
                      {v.locationDescription}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      Gap Size: <b>{v.gapInches}" ({Math.round(v.gapMm)} mm)</b> · Suggested model option: <b>{v.recommendedDunnage.sizeDescription}</b>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span
                      style={{
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      QTY: {v.recommendedDunnage.quantity} @ {v.recommendedDunnage.targetPressurePsi} PSI
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid #e2e8f0',
            background: '#f8fafc',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              background: '#0f172a',
              color: '#ffffff',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: 44,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
