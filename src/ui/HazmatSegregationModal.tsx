import React, { useMemo } from 'react';
import {
  auditHazmatManifest,
  HazmatManifestItem,
  HazmatAuditReport,
} from '../engine/hazmatSegregation';

interface HazmatSegregationModalProps {
  hazmatItems: HazmatManifestItem[];
  isOpen: boolean;
  onClose: () => void;
}

export const HazmatSegregationModal: React.FC<HazmatSegregationModalProps> = ({
  hazmatItems,
  isOpen,
  onClose,
}) => {
  const auditReport: HazmatAuditReport = useMemo(() => {
    return auditHazmatManifest(hazmatItems);
  }, [hazmatItems]);

  if (!isOpen) return null;

  return (
    <div
      className="camera-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hazmat-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="camera-modal-content"
        style={{
          maxWidth: 640,
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
            <h2 id="hazmat-modal-title" style={{ fontSize: 16, margin: 0, fontWeight: 700, color: '#0f172a' }}>
              Hazardous Materials Segregation Audit
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
              49 CFR § 177.848 Highway Transport Co-Loading Compatibility Matrix
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
            ✕
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Status Verdict Strip */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              background: auditReport.compliant ? '#f0fdf4' : auditReport.hasProhibitedCoLoading ? '#fef2f2' : '#fffbeb',
              border: `1px solid ${auditReport.compliant ? '#86efac' : auditReport.hasProhibitedCoLoading ? '#fca5a5' : '#fde68a'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
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
                  background: auditReport.compliant ? '#15803d' : auditReport.hasProhibitedCoLoading ? '#b91c1c' : '#d97706',
                  color: '#ffffff',
                  marginRight: 8,
                }}
              >
                {auditReport.compliant ? 'COMPLIANT (PERMITTED)' : auditReport.hasProhibitedCoLoading ? 'PROHIBITED CO-LOADING' : 'SEPARATION REQUIRED'}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
                {auditReport.totalHazmatItems} Hazmat Commodity Line(s) Audited
              </span>
            </div>
          </div>

          <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5 }}>
            {auditReport.summaryMessage}
          </div>

          {/* Conflict Warnings List */}
          {auditReport.conflicts.length > 0 && (
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px 0', color: '#1e293b' }}>
                Identified Conflicts &amp; Regulatory Guidance
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {auditReport.conflicts.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      border: `1px solid ${c.verdict === 'PROHIBITED' ? '#fca5a5' : '#fde68a'}`,
                      background: c.verdict === 'PROHIBITED' ? '#fff1f2' : '#fffdf5',
                      borderRadius: 8,
                      padding: '12px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 12, color: c.verdict === 'PROHIBITED' ? '#991b1b' : '#92400e' }}>
                        [{c.verdict}] Class {c.classA} vs Class {c.classB}
                      </span>
                      <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748b' }}>
                        {c.cfrCitation}
                      </span>
                    </div>
                    <p style={{ margin: '0 0 6px 0', fontSize: 12, color: '#334155' }}>
                      {c.description}
                    </p>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>
                      <strong>Action:</strong> {c.recommendedAction}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detected Hazmat Manifest Items Table */}
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px 0', color: '#1e293b' }}>
              Manifest Hazmat Commodities
            </h3>
            {hazmatItems.length === 0 ? (
              <p style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', margin: 0 }}>
                No hazardous materials declared on the current load manifest.
              </p>
            ) : (
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                    <th style={{ padding: '6px 8px' }}>UN Number / ID</th>
                    <th style={{ padding: '6px 8px' }}>DOT Class</th>
                    <th style={{ padding: '6px 8px' }}>Description</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {hazmatItems.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 600 }}>{item.unNumber || item.id}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <span style={{ padding: '2px 6px', borderRadius: 4, background: '#fee2e2', color: '#991b1b', fontWeight: 700, fontSize: 11 }}>
                          Class {item.classCode}
                        </span>
                      </td>
                      <td style={{ padding: '6px 8px' }}>{item.description}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{item.weightLbs.toLocaleString()} lbs</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div
          style={{
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            padding: '12px 20px',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#0284c7',
              color: '#ffffff',
              border: 'none',
              borderRadius: 6,
              padding: '10px 20px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              minHeight: 44,
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
