import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { runCli } from '../src/cli';

describe('CLI scenario integrity', () => {
  it('runs the distributed CLI exactly once', () => {
    const result = spawnSync('node', ['bin/cargofit.mjs', 'help'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout.match(/CargoFit Product 01/g)).toHaveLength(1);
    const invalid = spawnSync('node', ['bin/cargofit.mjs', 'solve'], { encoding: 'utf8' });
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain('--manifest');
  });
  it('uses the intended millimeter trailer dimensions and qualifies model results', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cargo-cli-'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const manifest = path.join(dir, 'manifest.csv');
      writeFileSync(manifest, 'label,qty,length,width,height,unit,weight,weightunit\nPallet,1,1200,1000,1000,mm,500,kg\n');
      expect(runCli(['node', 'cargofit', 'solve', '--manifest', manifest])).toBe(0);
      const output = log.mock.calls.map(args => args.join(' ')).join('\n');
      expect(output).toContain('16150×2480×2790 mm');
      expect(output).toContain('actual axle and legal status unverified');
      expect(output).not.toContain('Bridge Formula B Compliant:');
      const executable = spawnSync('node', ['bin/cargofit.mjs', 'solve', '--manifest', manifest], { encoding: 'utf8' });
      expect(executable.status).toBe(0);
      expect(executable.stdout).toContain('16150×2480×2790 mm');
      expect(executable.stdout).toContain('actual axle and legal status unverified');
      expect(executable.stdout.match(/Solving packing plan/g)).toHaveLength(1);
    } finally {
      log.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('withholds axle and restraint estimates when placed weight is unknown', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cargo-cli-unknown-'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const manifest = path.join(dir, 'manifest.csv');
      writeFileSync(manifest, 'label,qty,length,width,height,unit,weight,weightunit\nPallet,1,1200,1000,1000,mm,,kg\n');
      expect(runCli(['node', 'cargofit', 'solve', '--manifest', manifest])).toBe(0);
      const output = log.mock.calls.map(args => args.join(' ')).join('\n');
      expect(output).toContain('Illustrative bridge estimate unavailable');
      expect(output).toContain('Illustrative restraint estimate unavailable');
    } finally {
      log.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
