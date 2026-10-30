// Shared boundary sanity check, independent of Cargo Fit's solver/validator.
// Declared dimensions use Cargo Fit's two-decimal millimetre normalization.
export function reviewedGeometryIssue(units, placements, envelope) {
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const positive = n => finite(n) && n > 0;
  if (!envelope || !['L', 'W', 'H'].every(k => positive(envelope[k]))) return 'A complete declared equipment envelope is required.';
  if (!Array.isArray(placements) || placements.length !== units.length) return 'Every identified unit needs exactly one placement.';
  const seen = new Set();
  for (const p of placements) {
    const unit = units.find(u => u.id === p?.unitId);
    if (!unit || seen.has(unit.id) || !['x', 'y', 'z'].every(k => finite(p[k]) && p[k] >= 0) || !['dx', 'dy', 'dz'].every(k => positive(p[k]))) return 'Placement identity or finite geometry is invalid.';
    seen.add(unit.id);
    const mm = [unit.lengthIn, unit.widthIn, unit.heightIn].map(n => Math.round(n * 25.4 * 100) / 100);
    const close = (a, b) => Math.abs(a - b) <= 0.02;
    if (!close(p.dz, mm[2]) || !(close(p.dx, mm[0]) && close(p.dy, mm[1]) || close(p.dx, mm[1]) && close(p.dy, mm[0]))) return 'Placement dimensions or orientation differ from the declared upright unit.';
    if (p.x + p.dx > envelope.L + 0.02 || p.y + p.dy > envelope.W + 0.02 || p.z + p.dz > envelope.H + 0.02) return 'Placement exceeds the declared equipment envelope.';
  }
  for (let i = 0; i < placements.length; i++) for (let j = i + 1; j < placements.length; j++) {
    const a = placements[i], b = placements[j];
    if ([['x', 'dx'], ['y', 'dy'], ['z', 'dz']].every(([axis, size]) => Math.min(a[axis] + a[size], b[axis] + b[size]) - Math.max(a[axis], b[axis]) > 1e-6)) return 'Reviewed units have positive-volume overlap.';
  }
  return null;
}
