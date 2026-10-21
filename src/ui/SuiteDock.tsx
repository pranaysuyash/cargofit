import React, { useState, useEffect } from 'react';

export type ProductId =
  | 'product-01-cargo-fit'
  | 'product-02-freight-pricing'
  | 'product-03-hos-planner'
  | 'product-04-asset-studio'
  | 'product-05-fleet-telematics'
  | string;

export interface SubproductManifest {
  id: ProductId;
  name: string;
  shortName: string;
  code: string;
  port: number;
  icon: string;
  description: string;
  category: string;
  routes: {
    dev: string;
    cloud: string;
  };
  pricingTier: {
    tierName: string;
    monthlyPriceUsd: number;
    description: string;
  };
}

export const CANONICAL_PRODUCTS: SubproductManifest[] = [
  {
    id: 'product-01-cargo-fit',
    name: 'Cargo Fit & 3D Load Optimization',
    shortName: 'Cargo Fit',
    code: 'P01',
    port: 5173,
    icon: '📦',
    description: '3D heuristic cargo packing, Federal Bridge Formula axle distribution, and securement compliance.',
    category: 'Optimization',
    routes: { dev: 'http://localhost:5173', cloud: 'https://cargofit.pages.dev' },
    pricingTier: {
      tierName: 'Single Vehicle Pro',
      monthlyPriceUsd: 149,
      description: 'Unlimited 3D load solves, optical camera scanner, and EDI/VICS BOL exports.',
    },
  },
  {
    id: 'product-02-freight-pricing',
    name: 'Freight Pricing & Tactical Dispatch HUD',
    shortName: 'Freight Pricing',
    code: 'P02',
    port: 5174,
    icon: '💰',
    description: 'Carrier cost waterfall, EIA diesel index pegging, 3D digital twins, and broker rate confirmations.',
    category: 'Pricing',
    routes: { dev: 'http://localhost:5174', cloud: 'https://freightpricing.pages.dev' },
    pricingTier: {
      tierName: 'Tactical Dispatcher HUD',
      monthlyPriceUsd: 199,
      description: 'Real-time diesel index escalation, operating ratio speedometer, and instant PDF rate confirmations.',
    },
  },
  {
    id: 'product-03-hos-planner',
    name: 'HOS Compliance & Interstate Corridor Legality Planner',
    shortName: 'HOS Planner',
    code: 'P03',
    port: 5175,
    icon: '⏱️',
    description: 'FMCSA Part 395 statutory hours of service engine, 24-hr ELD logbooks, and corridor simulations.',
    category: 'Compliance',
    routes: { dev: 'http://localhost:5175', cloud: 'https://hosdispatch.pages.dev' },
    pricingTier: {
      tierName: 'Safety & Compliance Suite',
      monthlyPriceUsd: 129,
      description: 'Statutory 11/14/70-hr engine, stepped ELD graph, and team transit simulation.',
    },
  },
  {
    id: 'product-04-asset-studio',
    name: 'Fleet & Cargo Asset Studio',
    shortName: 'Asset Studio',
    code: 'P04',
    port: 5176,
    icon: '🚛',
    description: 'Commercial vehicle & cargo packaging digital twin catalog, 3D WebGL, 2.5D Isometric, and 2D CAD blueprints.',
    category: 'Asset Studio',
    routes: { dev: 'http://localhost:5176', cloud: 'https://trucking-asset-studio.pages.dev' },
    pricingTier: {
      tierName: 'Digital Twin Studio',
      monthlyPriceUsd: 249,
      description: '20+ vehicle CAD models, 23 packaging twins, dynamic CG axle load shift, and Open Logistics Asset schema export.',
    },
  },
  {
    id: 'product-05-fleet-telematics',
    name: 'Fleet Telematics & Real-Time Tracking HUD',
    shortName: 'Telematics',
    code: 'P05',
    port: 5177,
    icon: '📡',
    description: 'SAE J1939 CAN-bus telemetry stream, reefer cold chain data logger, corridor GPS geofencing, and DTC alert diagnostics.',
    category: 'Telematics',
    routes: { dev: 'http://localhost:5177', cloud: 'https://fleet-telematics.pages.dev' },
    pricingTier: {
      tierName: 'CAN-Bus Telematics Mesh',
      monthlyPriceUsd: 299,
      description: 'Real-time J1939 telemetry, Reefer excursions, live corridor tracking, and instant cross-product bridges.',
    },
  },
];

export function resolveProductUrl(manifest: SubproductManifest): string {
  if (typeof window !== 'undefined') {
    const isCloud = window.location.hostname.includes('pages.dev') || window.location.hostname.includes('trucking.io');
    if (isCloud) return manifest.routes.cloud;
  }
  return manifest.routes.dev;
}

export interface SuiteDockProps {
  currentProductId: ProductId;
}

const STORAGE_KEY = 'trucking_tenant_profile';

export const SuiteDock: React.FC<SuiteDockProps> = ({ currentProductId }) => {
  const [profile, setProfile] = useState<{
    tenantId: string;
    tenantName: string;
    mode: 'standalone' | 'suite';
    licensedProducts: string[];
    userRole: string;
  }>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return JSON.parse(stored);
      } catch {}
    }
    return {
      tenantId: 'tenant_apex_freight',
      tenantName: 'Apex Logistics & Freight',
      mode: 'suite',
      licensedProducts: [
        'product-01-cargo-fit',
        'product-02-freight-pricing',
        'product-04-asset-studio',
      ],
      userRole: 'fleet_manager',
    };
  });

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [upsellProduct, setUpsellProduct] = useState<SubproductManifest | null>(null);
  const [trialToast, setTrialToast] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    }
  }, [profile]);

  const currentProduct = CANONICAL_PRODUCTS.find((p) => p.id === currentProductId) || {
    id: currentProductId,
    name: 'Logistics Subproduct',
    shortName: 'Subproduct',
    code: 'PX',
    icon: '🚛',
    port: 5173,
    description: '',
    category: '',
    routes: { dev: '', cloud: '' },
    pricingTier: { tierName: '', monthlyPriceUsd: 0, description: '' },
  };

  const toggleMode = () => {
    setProfile((prev) => ({
      ...prev,
      mode: prev.mode === 'suite' ? 'standalone' : 'suite',
    }));
  };

  const handleProductClick = (manifest: SubproductManifest) => {
    const isLicensed = profile.licensedProducts.includes(manifest.id);
    if (isLicensed) {
      window.open(resolveProductUrl(manifest), '_blank', 'noopener,noreferrer');
      setIsMenuOpen(false);
    } else {
      setUpsellProduct(manifest);
    }
  };

  const handleTrialRequest = (p: SubproductManifest) => {
    setProfile((prev) => ({
      ...prev,
      licensedProducts: [...prev.licensedProducts, p.id],
    }));
    setTrialToast(`🎉 14-Day Free Trial Activated for ${p.name}!`);
    setUpsellProduct(null);
    setTimeout(() => setTrialToast(null), 4000);
  };

  return (
    <>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '5px 16px',
        backgroundColor: '#090d16',
        borderBottom: '1px solid #1e293b',
        fontSize: '12px',
        color: '#f8fafc',
        zIndex: 9999,
        position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* 9-Dots App Switcher Button */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: isMenuOpen ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              border: isMenuOpen ? '1px solid #38bdf8' : '1px solid #334155',
              color: isMenuOpen ? '#38bdf8' : '#f8fafc',
              padding: '3px 8px',
              borderRadius: '5px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '11px',
              letterSpacing: '0.05em',
            }}
            title="Open Trucking Platform Suite Switcher"
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 3px)', gap: '2px' }}>
              <span style={{ width: 3, height: 3, background: 'currentColor', borderRadius: '50%' }} />
              <span style={{ width: 3, height: 3, background: 'currentColor', borderRadius: '50%' }} />
              <span style={{ width: 3, height: 3, background: 'currentColor', borderRadius: '50%' }} />
              <span style={{ width: 3, height: 3, background: 'currentColor', borderRadius: '50%' }} />
              <span style={{ width: 3, height: 3, background: 'currentColor', borderRadius: '50%' }} />
              <span style={{ width: 3, height: 3, background: 'currentColor', borderRadius: '50%' }} />
              <span style={{ width: 3, height: 3, background: 'currentColor', borderRadius: '50%' }} />
              <span style={{ width: 3, height: 3, background: 'currentColor', borderRadius: '50%' }} />
              <span style={{ width: 3, height: 3, background: 'currentColor', borderRadius: '50%' }} />
            </div>
            <span>Apps</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(15, 23, 42, 0.8)', padding: '2px 8px', borderRadius: '4px', border: '1px solid #1e293b' }}>
            <span>{currentProduct.icon}</span>
            <strong style={{ color: '#fff' }}>{currentProduct.shortName}</strong>
            <span style={{ fontSize: '9px', fontWeight: 800, background: '#38bdf8', color: '#000', padding: '1px 4px', borderRadius: '3px' }}>
              {currentProduct.code}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: '#94a3b8', fontSize: '11px', fontFamily: 'monospace' }}>
            🏢 {profile.mode === 'suite' ? profile.tenantName : 'Single Client Mode'}
          </span>
          <button
            onClick={toggleMode}
            style={{
              background: profile.mode === 'suite' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
              border: profile.mode === 'suite' ? '1px solid #10b981' : '1px solid #f59e0b',
              color: profile.mode === 'suite' ? '#10b981' : '#f59e0b',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
            title={profile.mode === 'suite' ? 'Click to simulate Standalone Tool Client' : 'Click to simulate Multi-Product Suite Client'}
          >
            {profile.mode === 'suite' ? '🌐 Suite View' : '📦 Standalone View'}
          </button>
        </div>
      </div>

      {/* Floating 9-Dot App Switcher Dropdown */}
      {isMenuOpen && (
        <div
          onClick={() => setIsMenuOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            zIndex: 10000,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            paddingTop: '60px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '12px',
              width: '90%',
              maxWidth: '900px',
              padding: '24px',
              boxShadow: '0 25px 50px rgba(0,0,0,0.9), 0 0 25px rgba(56, 189, 248, 0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px', borderBottom: '1px solid #1e293b', paddingBottom: '12px' }}>
              <div>
                <h4 style={{ color: '#fff', fontSize: '16px', fontWeight: 800 }}>TRUCKING PLATFORM SUITE</h4>
                <p style={{ color: '#94a3b8', fontSize: '12px', marginTop: '4px' }}>
                  {profile.mode === 'suite'
                    ? 'Navigate licensed commercial logistics tools or test cross-product workflows.'
                    : 'Independent single-product license active. Upgrade to unlock the full fleet suite.'}
                </p>
              </div>
              <button
                onClick={() => setIsMenuOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
              {CANONICAL_PRODUCTS.map((prod) => {
                const isCurrent = prod.id === currentProductId;
                const isLicensed = profile.licensedProducts.includes(prod.id);

                return (
                  <div
                    key={prod.id}
                    onClick={() => handleProductClick(prod)}
                    style={{
                      background: isCurrent ? 'rgba(56, 189, 248, 0.08)' : '#131d31',
                      border: isCurrent ? '1px solid #38bdf8' : '1px solid #1e293b',
                      borderRadius: '8px',
                      padding: '14px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '24px' }}>{prod.icon}</span>
                        <span style={{ fontSize: '10px', color: '#64748b', background: '#090d16', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>
                          Port {prod.port}
                        </span>
                      </div>
                      <h5 style={{ color: '#fff', fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>{prod.name}</h5>
                      <p style={{ color: '#94a3b8', fontSize: '11px', lineHeight: 1.4, marginBottom: '12px' }}>{prod.description}</p>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                      {isCurrent ? (
                        <span style={{ fontSize: '10px', fontWeight: 800, background: '#38bdf8', color: '#000', padding: '2px 6px', borderRadius: '4px' }}>
                          ACTIVE NOW
                        </span>
                      ) : isLicensed ? (
                        <span style={{ fontSize: '10px', fontWeight: 700, background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '2px 6px', borderRadius: '4px' }}>
                          1-Click Launch ↗
                        </span>
                      ) : (
                        <span style={{ fontSize: '10px', fontWeight: 700, background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '2px 6px', borderRadius: '4px' }}>
                          🔒 Upgrade to Unlock
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Upsell Modal */}
      {upsellProduct && (
        <div
          onClick={() => setUpsellProduct(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(5px)',
            zIndex: 10001,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0f172a',
              border: '1px solid #f59e0b',
              borderRadius: '12px',
              width: '90%',
              maxWidth: '480px',
              padding: '24px',
              boxShadow: '0 25px 50px rgba(0,0,0,0.9), 0 0 30px rgba(245, 158, 11, 0.2)',
            }}
          >
            <span style={{ fontSize: '10px', fontWeight: 900, color: '#f59e0b', letterSpacing: '0.1em' }}>
              PRODUCT UPSELL GATEWAY
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '10px 0 14px' }}>
              <span style={{ fontSize: '32px' }}>{upsellProduct.icon}</span>
              <div>
                <h3 style={{ color: '#fff', fontSize: '18px', fontWeight: 800 }}>{upsellProduct.name}</h3>
                <span style={{ color: '#94a3b8', fontSize: '11px' }}>{upsellProduct.category.toUpperCase()} MODULE</span>
              </div>
            </div>

            <p style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: 1.5, marginBottom: '16px' }}>
              {upsellProduct.description}
            </p>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#131d31', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px' }}>
              <div>
                <strong style={{ color: '#fff', fontSize: '13px', display: 'block' }}>{upsellProduct.pricingTier.tierName}</strong>
                <span style={{ color: '#94a3b8', fontSize: '11px' }}>{upsellProduct.pricingTier.description}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '20px', fontWeight: 900, color: '#38bdf8', fontFamily: 'monospace' }}>
                  ${upsellProduct.pricingTier.monthlyPriceUsd}
                </span>
                <span style={{ color: '#94a3b8', fontSize: '10px', display: 'block' }}>/ mo</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setUpsellProduct(null)}
                style={{ background: 'transparent', border: '1px solid #334155', color: '#94a3b8', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer' }}
              >
                Dismiss
              </button>
              <button
                onClick={() => handleTrialRequest(upsellProduct)}
                style={{
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  border: 'none',
                  color: '#000',
                  fontWeight: 800,
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                🚀 Activate 14-Day Free Trial
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trial Toast */}
      {trialToast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: '#10b981',
          color: '#000',
          fontWeight: 800,
          padding: '12px 20px',
          borderRadius: '8px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          zIndex: 99999,
        }}>
          {trialToast}
        </div>
      )}
    </>
  );
};
