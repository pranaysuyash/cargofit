/**
 * Standalone Headless CLI Engine for Cargo Fit & Load Planning.
 * Usage:
 *   node bin/cargofit.mjs solve --manifest manifest.csv --equipment 53ft-trailer --out plan.json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { importCargoCsv } from './engine/csv';
import { expandUnits, normalizeEquipment } from './engine/normalize';
import { analyzeScenario, DEFAULT_SETTINGS } from './engine/scenario';
import { evaluateBridgeCompliance } from './engine/bridge';
import { computeSecurementPlan } from './engine/securement';
import { exportToGltf } from './engine/gltf';
import type { EquipmentProfile, Scenario } from './engine/types';

export interface CliArgs {
  command?: string;
  manifestPath?: string;
  equipmentId?: string;
  outputPath?: string;
  gltfPath?: string;
  reportPath?: string;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === 'solve' || a === 'help' || a === 'version') {
      args.command = a;
    } else if (a === '--manifest' || a === '-m') {
      args.manifestPath = argv[++i];
    } else if (a === '--equipment' || a === '-e') {
      args.equipmentId = argv[++i];
    } else if (a === '--out' || a === '-o') {
      args.outputPath = argv[++i];
    } else if (a === '--gltf') {
      args.gltfPath = argv[++i];
    } else if (a === '--report') {
      args.reportPath = argv[++i];
    }
  }
  return args;
}

export function runCli(argv: string[]): number {
  const args = parseArgs(argv);
  if (!args.command || args.command === 'help') {
    console.log(`
CargoFit Product 01 — Explainable Cargo Fit & Load Planning CLI

Usage:
  cargofit solve --manifest <path.csv> [--equipment <id>] [--out <plan.json>] [--gltf <model.gltf>]

Options:
  --manifest, -m   Path to CSV or manifest file
  --equipment, -e  Equipment preset ID (default: 53ft-trailer)
  --out, -o        Output path for JSON plan result
  --gltf           Output path for Khronos glTF 2.0 3D scene
  --report         Output path for standalone HTML report
`);
    return 0;
  }

  if (args.command === 'version') {
    console.log('cargofit v0.1.0 (Product 01 Cargo Fit & Load Planning)');
    return 0;
  }

  if (args.command === 'solve') {
    if (!args.manifestPath) {
      console.error('Error: --manifest argument is required.');
      return 1;
    }

    const manifestRaw = readFileSync(resolve(args.manifestPath), 'utf-8');
    const parsed = importCargoCsv(manifestRaw);
    const errors = parsed.issues.filter((i) => i.severity === 'error');
    if (errors.length > 0) {
      console.error('Manifest parsing errors:');
      for (const err of errors) console.error(`  - Line ${err.line}: ${err.message}`);
      return 1;
    }

    const units = expandUnits(parsed.rows);
    console.log(`Loaded manifest: ${parsed.rows.length} row(s), ${units.length} total piece(s).`);

    const equipment: EquipmentProfile = {
      id: args.equipmentId || '53ft-trailer',
      name: '53ft Dry Van Trailer',
      source: 'preset',
      length: 16150,
      width: 2480,
      height: 2790,
      unit: 'm',
      payload: 20400,
      massUnit: 'kg',
      doorWidth: 2430,
      doorHeight: 2740,
      included: true,
      cost: 1850,
      currency: 'USD',
      costSource: 'user',
    };

    const norm = normalizeEquipment(equipment);
    if (!norm) {
      console.error('Error: Equipment profile normalization failed.');
      return 1;
    }

    const scenario: Scenario = {
      name: 'CLI Scenario',
      rows: parsed.rows,
      equipment: [equipment],
      settings: DEFAULT_SETTINGS,
    };

    console.log(`Solving packing plan for ${norm.name} (${norm.L}×${norm.W}×${norm.H} mm)...`);
    const { results } = analyzeScenario(scenario);
    const result = results[0];

    console.log(`Status: ${result.status}`);
    console.log(`Placed: ${result.metrics.placedUnits} of ${result.metrics.totalUnits} pieces`);
    console.log(`Volume Utilization: ${result.metrics.occupiedVolumePct.toFixed(1)}%`);
    console.log(`Loaded Weight: ${result.metrics.loadedWeightKg.toLocaleString()} kg`);

    if (result.arrangements.length > 0) {
      const bestArr = result.arrangements[0];

      const bridge = evaluateBridgeCompliance({
        equipmentLengthMm: norm.L,
        cargoWeightKg: result.metrics.loadedWeightKg,
        cargoCogXMm: result.metrics.cogX ?? (norm.L / 2),
      });
      console.log(`Bridge Formula B Compliant: ${bridge.allCompliant ? 'YES' : 'NO'}`);
      console.log(`Overall GVW: ${bridge.overallGvwLbs.toLocaleString()} lbs (Legal Max: ${bridge.maxLegalGvwLbs.toLocaleString()} lbs)`);

      const securement = computeSecurementPlan(units, bestArr.placements);
      console.log(`Required Tie-Downs: ${securement.totalTieDownsCount} straps/chains (Min WLL: ${securement.totalRequiredWllLbs.toLocaleString()} lbs)`);

      if (args.outputPath) {
        const outData = {
          result,
          bridge,
          securement,
        };
        writeFileSync(resolve(args.outputPath), JSON.stringify(outData, null, 2), 'utf-8');
        console.log(`Saved plan JSON to ${args.outputPath}`);
      }

      if (args.gltfPath) {
        const gltf = exportToGltf(norm, bestArr.placements, units);
        writeFileSync(resolve(args.gltfPath), gltf, 'utf-8');
        console.log(`Saved 3D CAD glTF to ${args.gltfPath}`);
      }
    }

    return 0;
  }

  return 0;
}
