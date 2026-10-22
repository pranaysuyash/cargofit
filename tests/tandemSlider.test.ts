import { describe, it, expect } from 'vitest';
import { simulateTandemSlide, solveOptimalTandemPosition } from '../src/engine/tandemSlider';
import { VehicleGeometryInput } from '../src/engine/bridge';

describe('P01 Trailer Tandem & Fifth Wheel Pin Slider Engine', () => {
  const baseTrailerInput: VehicleGeometryInput = {
    equipmentLengthMm: 16154, // 53 ft (53 * 12 * 25.4)
    cargoWeightKg: 19958, // ~44,000 lbs cargo
    cargoCogXMm: 8077, // Center of trailer (approx 26.5 ft)
    tareSteerLbs: 10500,
    tareDriveLbs: 14000,
    tareTrailerLbs: 10500,
    trailerWheelbaseIn: 456, // 38 ft base (hole 6)
  };

  it('shifts weight between drive tandem and trailer tandem as pin hole changes', () => {
    // Hole 2 = Tandem slid rearward (longer wheelbase) -> more weight on drive tandem
    const rearward = simulateTandemSlide(baseTrailerInput, { tandemHole: 2, fifthWheelPosition: 0 });
    // Hole 10 = Tandem slid forward (shorter wheelbase) -> more weight on trailer tandem
    const forward = simulateTandemSlide(baseTrailerInput, { tandemHole: 10, fifthWheelPosition: 0 });

    expect(rearward.driveWeightLbs).toBeGreaterThan(forward.driveWeightLbs);
    expect(forward.trailerWeightLbs).toBeGreaterThan(rearward.trailerWeightLbs);
    expect(rearward.kpraFt).toBeGreaterThan(forward.kpraFt);
  });

  it('enforces California statutory 40-ft KPRA limit on extended tandem positions', () => {
    // Hole 1 (fully extended rearward)
    const hole1 = simulateTandemSlide(baseTrailerInput, { tandemHole: 1, fifthWheelPosition: 0 });
    expect(hole1.kpraFt).toBeGreaterThan(40.0);
    expect(hole1.kpraCompliant).toBe(false);
    expect(hole1.allAxlesLegal).toBe(false);
    expect(hole1.recommendation).toContain('KPRA');

    // Hole 8 (slid forward)
    const hole8 = simulateTandemSlide(baseTrailerInput, { tandemHole: 8, fifthWheelPosition: 0 });
    expect(hole8.kpraFt).toBeLessThanOrEqual(40.0);
    expect(hole8.kpraCompliant).toBe(true);
  });

  it('shifts weight between steer and drive tandem when fifth wheel position is adjusted', () => {
    const centeredFw = simulateTandemSlide(baseTrailerInput, { tandemHole: 6, fifthWheelPosition: 0 });
    const forwardFw = simulateTandemSlide(baseTrailerInput, { tandemHole: 6, fifthWheelPosition: 2 });

    expect(forwardFw.steerWeightLbs).toBeGreaterThan(centeredFw.steerWeightLbs);
    expect(forwardFw.driveWeightLbs).toBeLessThan(centeredFw.driveWeightLbs);
  });

  it('solves for an optimal legal pin position automatically', () => {
    // 34,000 lbs cargo load with balanced center of gravity (approx 24.5 ft / 7468 mm from nose)
    const solvableInput: VehicleGeometryInput = {
      ...baseTrailerInput,
      cargoWeightKg: 15422, // ~34,000 lbs
      cargoCogXMm: 7468, // 24.5 ft from nose
    };
    const optimization = solveOptimalTandemPosition(solvableInput);
    if (!optimization.feasible) {
      console.log('OPTIMIZATION FAILED REASONS AT HOLE 7:', optimization.allHoleResults[6].bridgeReport.reasons);
    }
    expect(optimization.feasible).toBe(true);
    expect(optimization.optimalHole).toBeGreaterThanOrEqual(1);
    expect(optimization.optimalHole).toBeLessThanOrEqual(12);
    expect(optimization.bestResult.allAxlesLegal).toBe(true);
    expect(optimization.bestResult.kpraCompliant).toBe(true);
  });
});
