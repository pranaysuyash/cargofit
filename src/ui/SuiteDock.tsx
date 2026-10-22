import React, { useState, useEffect } from 'react';
import {
  ProductIcon,
  IconBuilding,
  IconGlobe,
  IconPackage,
  IconX,
  IconLock,
  IconSparkles,
  IconExternalLink,
  IconTruck,
  IconFileText,
  IconShieldAlert,
} from './icons';

export type ProductId =
  | 'command-center-portal'
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
    icon: 'P01',
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
    icon: 'P02',
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
    icon: 'P03',
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
    icon: 'P04',
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
    icon: 'P05',
    description: 'SAE J1939 CAN-bus telemetry stream, reefer cold chain data logger, corridor GPS geofencing, and DTC alert diagnostics.',
    category: 'Telematics',
    routes: { dev: 'http://localhost:5177', cloud: 'https://fleet-telematics.pages.dev' },
    pricingTier: {
      tierName: 'CAN-Bus Telematics Mesh',
      monthlyPriceUsd: 299,
      description: 'Real-time J1939 telemetry, Reefer excursions, live corridor tracking, and instant cross-product bridges.',
    },
  },
  {
    id: 'command-center-portal',
    name: 'Unified Freight Command Center',
    shortName: 'Command Center',
    code: 'P00',
    port: 5170,
    icon: 'P00',
    description: 'Top-level freight lifecycle stepper bringing all 5 subproducts under a unified single pane of glass.',
    category: 'Orchestration',
    routes: { dev: 'http://localhost:5170', cloud: 'https://trucking-command-center.pages.dev' },
    pricingTier: {
      tierName: 'Enterprise Command Seat',
      monthlyPriceUsd: 499,
      description: 'Complete 5-stage lifecycle stepper: Asset Studio → 3D Packing → Pricing → HOS → Live Telematics.',
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

const STORAGE_KEY = 'trucking_tenant_profile';

export interface TenantProfile {
  tenantId: string;
  tenantName: string;
  mode: 'standalone' | 'suite';
  licensedProducts: string[];
  userRole: 'owner_operator' | 'dispatcher' | 'safety_officer' | 'fleet_manager' | 'enterprise_admin';
  userName: string;
}

export function getTenantProfile(): TenantProfile {
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
    userName: 'Alex Chen',
  };
}

export function isProductLicensed(productId: string): boolean {
  const profile = getTenantProfile();
  return profile.licensedProducts.includes(productId);
}

export interface SuiteDockProps {
  currentProductId: ProductId;
}

export const SuiteDock: React.FC<SuiteDockProps> = ({ currentProductId }) => {
  const [profile, setProfile] = useState<TenantProfile>(getTenantProfile);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [upsellProduct, setUpsellProduct] = useState<SubproductManifest | null>(null);
  const [trialToast, setTrialToast] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      window.dispatchEvent(new CustomEvent('trucking_profile_changed', { detail: profile }));
    }
  }, [profile]);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try { setProfile(JSON.parse(e.newValue)); } catch {}
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const currentProduct = CANONICAL_PRODUCTS.find((p) => p.id === currentProductId) || {
    id: currentProductId,
    name: 'Logistics Subproduct',
    shortName: 'Subproduct',
    code: 'PX',
    icon: 'P04',
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
    setTrialToast(`14-Day Free Trial Activated for ${p.name}!`);
    setUpsellProduct(null);
    setTimeout(() => setTrialToast(null), 4000);
  };

  // Plan Preset Switchers
  const applyPreset = (preset: 'solo' | 'broker' | 'safety' | 'enterprise') => {
    switch (preset) {
      case 'solo':
        setProfile((prev) => ({
          ...prev,
          tenantName: 'Miller Heavy Haul (Owner-Operator)',
          mode: 'standalone',
          userRole: 'owner_operator',
          licensedProducts: [currentProductId],
        }));
        setTrialToast(`Switched to Solo Owner-Operator Plan (Standalone ${currentProduct.shortName})`);
        break;
      case 'broker':
        setProfile((prev) => ({
          ...prev,
          tenantName: 'Keystone Logistics Brokerage',
          mode: 'suite',
          userRole: 'dispatcher',
          licensedProducts: ['product-01-cargo-fit', 'product-02-freight-pricing'],
        }));
        setTrialToast(`Switched to Brokerage & Dispatcher Bundle (P01 + P02)`);
        break;
      case 'safety':
        setProfile((prev) => ({
          ...prev,
          tenantName: 'Interstate Carrier Safety Ops',
          mode: 'suite',
          userRole: 'safety_officer',
          licensedProducts: ['product-03-hos-planner', 'product-05-fleet-telematics'],
        }));
        setTrialToast(`Switched to Compliance & Telematics Bundle (P03 + P05)`);
        break;
      case 'enterprise':
        setProfile((prev) => ({
          ...prev,
          tenantName: 'Apex Global Logistics & Fleet',
          mode: 'suite',
          userRole: 'enterprise_admin',
          licensedProducts: CANONICAL_PRODUCTS.map((p) => p.id),
        }));
        setTrialToast(`Switched to Full Enterprise Command Suite (All 6 Tools)`);
        break;
    }
    setTimeout(() => setTrialToast(null), 3500);
  };

  const toggleProductLicense = (pId: string) => {
    setProfile((prev) => {
      const exists = prev.licensedProducts.includes(pId);
      const nextList = exists
        ? prev.licensedProducts.filter((id) => id !== pId)
        : [...prev.licensedProducts, pId];
      return { ...prev, licensedProducts: nextList };
    });
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
        zIndex: 1000,
        position: 'relative',
        minHeight: '44px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* 9-Dots App Switcher Button */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Open Trucking Platform Suite Switcher"
            aria-expanded={isMenuOpen}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: isMenuOpen ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              border: isMenuOpen ? '1px solid #38bdf8' : '1px solid #334155',
              color: isMenuOpen ? '#38bdf8' : '#f8fafc',
              padding: '6px 12px',
              minHeight: '36px',
              borderRadius: '5px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '11px',
              letterSpacing: '0.05em',
            }}
            title="Open Trucking Platform Suite Switcher"
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 3px)', gap: '2px' }} aria-hidden="true">
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
            <span style={{ display: 'inline-flex', alignItems: 'center' }}><ProductIcon productId={currentProduct.id} size={15} /></span>
            <strong style={{ color: '#fff' }}>{currentProduct.shortName}</strong>
            <span style={{ fontSize: '9px', fontWeight: 800, background: '#38bdf8', color: '#000', padding: '1px 4px', borderRadius: '3px' }}>
              {currentProduct.code}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Tenant Profile / Plan Badge */}
          <button
            onClick={() => setIsPlanModalOpen(true)}
            aria-label={`Tenant profile: ${profile.tenantName}, ${profile.licensedProducts.length} licensed modules`}
            style={{
              background: 'transparent',
              border: '1px dashed #334155',
              padding: '6px 12px',
              minHeight: '36px',
              borderRadius: '4px',
              color: '#94a3b8',
              fontSize: '11px',
              fontFamily: 'monospace',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Click to manage subscription plan & test client personas"
          >
            <IconBuilding size={13} style={{ color: '#38bdf8' }} />
            <span>{profile.tenantName}</span>
            <span style={{ background: '#1e293b', color: '#38bdf8', fontSize: '9px', padding: '1px 4px', borderRadius: '3px' }}>
              {profile.licensedProducts.length} Licensed
            </span>
          </button>

          {/* Quick Mode Toggle */}
          <button
            onClick={toggleMode}
            aria-label={`View mode: ${profile.mode}. Click to toggle between Suite and Standalone view.`}
            style={{
              background: profile.mode === 'suite' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
              border: profile.mode === 'suite' ? '1px solid #10b981' : '1px solid #f59e0b',
              color: profile.mode === 'suite' ? '#10b981' : '#f59e0b',
              padding: '6px 12px',
              minHeight: '36px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
            title={profile.mode === 'suite' ? 'Click to simulate Standalone Tool Client' : 'Click to simulate Multi-Product Suite Client'}
          >
            {profile.mode === 'suite' ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <IconGlobe size={11} /> Suite View
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <IconPackage size={11} /> Standalone View
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Floating 9-Dot App Switcher Dropdown */}
      {isMenuOpen && (
        <div
          onClick={() => setIsMenuOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Trucking Platform Suite Switcher"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            zIndex: 1050,
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
              maxWidth: '920px',
              padding: '24px',
              boxShadow: '0 25px 50px rgba(0,0,0,0.9), 0 0 25px rgba(56, 189, 248, 0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px', borderBottom: '1px solid #1e293b', paddingBottom: '12px' }}>
              <div>
                <h4 style={{ color: '#fff', fontSize: '16px', fontWeight: 800 }}>TRUCKING PLATFORM SUITE</h4>
                <p style={{ color: '#94a3b8', fontSize: '12px', marginTop: '4px' }}>
                  {profile.mode === 'suite'
                    ? `Unified access active for ${profile.tenantName}. Navigate licensed tools below.`
                    : `Operating in Single Client mode. Only ${currentProduct.shortName} is active for this client.`}
                </p>
              </div>
              <button
                onClick={() => setIsMenuOpen(false)}
                aria-label="Close suite switcher menu"
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer', minHeight: '36px', minWidth: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <IconX size={16} />
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
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${prod.name} on port ${prod.port}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleProductClick(prod);
                      }
                    }}
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
                        <span style={{ display: 'inline-flex', alignItems: 'center', color: isCurrent ? '#38bdf8' : '#cbd5e1' }}><ProductIcon productId={prod.id} size={24} /></span>
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
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          1-Click Launch <IconExternalLink size={10} />
                        </span>
                        </span>
                      ) : (
                        <span style={{ fontSize: '10px', fontWeight: 700, background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '2px 6px', borderRadius: '4px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <IconLock size={10} /> Upgrade to Unlock
                        </span>
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

      {/* Client Account & Subscription Plan Modal */}
      {isPlanModalOpen && (
        <div
          onClick={() => setIsPlanModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Manage Subscription & Client Tier"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(5px)',
            zIndex: 1050,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0f172a',
              border: '1px solid #38bdf8',
              borderRadius: '12px',
              width: '90%',
              maxWidth: '560px',
              padding: '24px',
              boxShadow: '0 25px 50px rgba(0,0,0,0.9), 0 0 30px rgba(56, 189, 248, 0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <span style={{ fontSize: '10px', fontWeight: 900, color: '#38bdf8', letterSpacing: '0.1em' }}>
                  MULTI-TENANT CLIENT ENTITLEMENT SIMULATOR
                </span>
                <h3 style={{ color: '#fff', fontSize: '18px', fontWeight: 800, marginTop: '2px' }}>
                  Manage Subscription & Client Tier
                </h3>
              </div>
              <button
                onClick={() => setIsPlanModalOpen(false)}
                aria-label="Close client tier dialog"
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer', minHeight: '36px', minWidth: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <IconX size={16} />
              </button>
            </div>

            <p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '16px', lineHeight: 1.5 }}>
              Test how this application behaves when a client signs up for only 1 tool vs. a customized bundle vs. the full enterprise suite.
            </p>

            {/* Quick Persona Presets */}
            <div style={{ marginBottom: '20px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '8px' }}>
                1-CLICK CLIENT PERSONA PRESETS:
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                <button
                  onClick={() => applyPreset('solo')}
                  style={{
                    background: '#131d31',
                    border: '1px solid #1e293b',
                    color: '#f8fafc',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f59e0b' }}><IconTruck size={14} /> Solo Owner-Operator</strong>
                  <span style={{ fontSize: '10px', color: '#94a3b8' }}>Only 1 product licensed (Standalone)</span>
                </button>

                <button
                  onClick={() => applyPreset('broker')}
                  style={{
                    background: '#131d31',
                    border: '1px solid #1e293b',
                    color: '#f8fafc',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981' }}><IconFileText size={14} /> Broker & Dispatcher</strong>
                  <span style={{ fontSize: '10px', color: '#94a3b8' }}>P01 Cargo Fit + P02 Pricing</span>
                </button>

                <button
                  onClick={() => applyPreset('safety')}
                  style={{
                    background: '#131d31',
                    border: '1px solid #1e293b',
                    color: '#f8fafc',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#818cf8' }}><IconShieldAlert size={14} /> Safety & Telematics</strong>
                  <span style={{ fontSize: '10px', color: '#94a3b8' }}>P03 HOS Planner + P05 Telematics</span>
                </button>

                <button
                  onClick={() => applyPreset('enterprise')}
                  style={{
                    background: '#131d31',
                    border: '1px solid #1e293b',
                    color: '#f8fafc',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8' }}><IconGlobe size={14} /> Enterprise Fleet Suite</strong>
                  <span style={{ fontSize: '10px', color: '#94a3b8' }}>All 6 platform products unlocked</span>
                </button>
              </div>
            </div>

            {/* Custom Matrix Checkboxes */}
            <div style={{ marginBottom: '20px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '8px' }}>
                CUSTOM SUBSCRIBED MODULES:
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#090d16', padding: '10px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                {CANONICAL_PRODUCTS.map((prod) => {
                  const checked = profile.licensedProducts.includes(prod.id);
                  return (
                    <label key={prod.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', cursor: 'pointer', padding: '4px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleProductLicense(prod.id)}
                        />
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><ProductIcon productId={prod.id} size={14} /> {prod.name}</span>
                      </span>
                      <span style={{ color: checked ? '#10b981' : '#64748b', fontSize: '11px', fontWeight: 600 }}>
                        {checked ? 'Licensed' : 'Locked'}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setIsPlanModalOpen(false)}
                style={{
                  background: '#38bdf8',
                  color: '#000',
                  fontWeight: 800,
                  border: 'none',
                  padding: '8px 18px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Save & Apply Plan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upsell Modal */}
      {upsellProduct && (
        <div
          onClick={() => setUpsellProduct(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Product Upgrade Gateway"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(5px)',
            zIndex: 1050,
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '10px', fontWeight: 900, color: '#f59e0b', letterSpacing: '0.1em' }}>
                PRODUCT UPSELL GATEWAY
              </span>
              <button
                onClick={() => setUpsellProduct(null)}
                aria-label="Close upgrade dialog"
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer', minHeight: '36px', minWidth: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <IconX size={16} />
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '10px 0 14px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', color: '#38bdf8' }}><ProductIcon productId={upsellProduct.id} size={32} /></span>
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
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <IconSparkles size={16} /> Activate 14-Day Free Trial
                </span>
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
