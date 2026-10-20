import { useMemo } from 'react';
import { analyzeScenario } from '../engine/scenario';
import { normalizeEquipment } from '../engine/normalize';
import { renderIso, rowColors } from '../engine/viz';
import { SAMPLES, sampleScenario } from './samples';

export function Landing(props: { onSample: (id: string) => void; onBlank: () => void; hasSaved: boolean; onOpenSaved: () => void }) {
  // The hero graphic is the real solver output for the bundled sample, not an illustration.
  const hero = useMemo(() => {
    const s = sampleScenario('mixed');
    const a = analyzeScenario(s);
    const r = a.results.find((x) => x.equipmentName.startsWith('7.5 t'))!;
    const eq = normalizeEquipment(s.equipment.find((e) => e.id === r.equipmentId)!)!;
    const svg = renderIso({ eq, placements: r.arrangements[r.best].placements, colors: rowColors(s.rows), rotation: 0 });
    return { svg, placed: r.metrics.placedUnits, total: r.metrics.totalUnits, name: r.equipmentName, ms: r.solver.ms };
  }, []);

  return (
    <div className="landing">
      <header className="l-nav">
        <span className="brand"><span className="mark" aria-hidden="true" />Cargo Fit<span className="tag">working title</span></span>
        <nav aria-label="Primary">
          <a href="#how">How it decides</a>
          <a href="#samples">Try a scenario</a>
          {props.hasSaved && <button className="linkbtn" onClick={props.onOpenSaved}>Saved scenarios</button>}
          <button className="btn primary sm" onClick={() => props.onSample('mixed')}>Open sample job</button>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Load planning for mixed cargo</p>
          <h1>Know what fits — and exactly what that answer rests on.</h1>
          <p className="lede">
            Enter or import a manifest, describe the trucks, trailers or containers you could use, and get a computed arrangement
            with reasons for every “no”. Each result says which constraints were modeled, which were not, and whether the engine
            proved a limit or simply ran out of search.
          </p>
          <div className="cta">
            <button className="btn primary lg" onClick={() => props.onSample('mixed')}>Open the sample job →</button>
            <button className="btn lg" onClick={props.onBlank}>Start with my own CSV</button>
          </div>
          <p className="fine">No account, no hardware, no sales call. Data stays in this browser.</p>
        </div>
        <figure className="hero-fig">
          <div className="paper" dangerouslySetInnerHTML={{ __html: hero.svg }} />
          <figcaption>
            Live engine output: {hero.placed} of {hero.total} sample units arranged in an illustrative {hero.name} profile
            (solved in this page load in {hero.ms} ms). Every box is a validated placement.
          </figcaption>
        </figure>
      </section>

      <section id="how" className="l-section">
        <h2>Five honest outcomes, never a bare percentage</h2>
        <div className="grid5">
          {[
            ['✓', 'Fits under modeled constraints', 'A complete arrangement exists and an independent validator confirmed bounds, overlap, orientation, support, payload and door.'],
            ['✕', 'Proven not to fit', 'A sound bound trips: item larger than the interior, door too small, declared weight over payload, or volume over capacity.'],
            ['?', 'No plan found', 'The heuristic ran out of budget. That is not proof of impossibility, and the UI says so.'],
            ['…', 'Incomplete input', 'A missing dimension or unknown weight stops the claim. Unknown stays unknown — nothing is guessed.'],
            ['!', 'Needs physical review', 'Geometry fits, but a limit such as payload or door was never declared for this equipment.'],
          ].map(([g, t, d]) => (
            <article key={t} className="card"><span className="glyph-lg" aria-hidden="true">{g}</span><h3>{t}</h3><p>{d}</p></article>
          ))}
        </div>
      </section>

      <section className="l-section two">
        <div>
          <h2>The picture is the data</h2>
          <p>Top, side and isometric views and the loading sequence are drawn from the same placements the validator checks and the export contains. Move or rotate an item by hand and it is re-validated immediately — collisions and unsupported boxes are flagged, not hidden.</p>
        </div>
        <div>
          <h2>What it does not claim</h2>
          <p>Axle and axle-group loads, legal limits, securement, forklift access, unload order and centre-of-gravity height are <b>not modeled</b> and are listed as such on every result and export. Scales and qualified loaders override this tool.</p>
        </div>
      </section>

      <section id="samples" className="l-section">
        <h2>Try a scenario</h2>
        <div className="grid4">
          {SAMPLES.map((s) => (
            <article className="card" key={s.id}>
              <h3>{s.title}</h3>
              <p>{s.blurb}</p>
              <button className="btn" onClick={() => props.onSample(s.id)}>Open in workspace</button>
            </article>
          ))}
        </div>
      </section>

      <footer className="l-foot">
        Equipment presets are illustrative nominal values, not certified specifications. Costs are only what you enter. Cargo Fit is a working title for an internal Product 01 build.
      </footer>
    </div>
  );
}
