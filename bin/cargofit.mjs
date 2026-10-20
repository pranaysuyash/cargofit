#!/usr/bin/env node
import { readFileSync as Ae, writeFileSync as ue } from "node:fs";
import { resolve as re } from "node:path";
const Te = { mm: 1, cm: 10, m: 1e3, in: 25.4, ft: 304.8 }, We = { kg: 1, lb: 0.45359237, t: 1e3 }, Ne = (t) => Math.round(t * 100) / 100, P = (t, e) => Ne(t * Te[e]), Me = (t, e) => Math.round(t * We[e] * 1e4) / 1e4;
function ge(t) {
  const e = t.trim().toLowerCase().replace(/\./g, "");
  return {
    mm: "mm",
    millimeter: "mm",
    millimetre: "mm",
    millimeters: "mm",
    millimetres: "mm",
    cm: "cm",
    centimeter: "cm",
    centimetre: "cm",
    centimeters: "cm",
    centimetres: "cm",
    m: "m",
    meter: "m",
    metre: "m",
    meters: "m",
    metres: "m",
    in: "in",
    inch: "in",
    inches: "in",
    '"': "in",
    ft: "ft",
    foot: "ft",
    feet: "ft",
    "'": "ft"
  }[e] ?? null;
}
function me(t) {
  const e = t.trim().toLowerCase().replace(/\./g, "");
  return {
    kg: "kg",
    kgs: "kg",
    kilogram: "kg",
    kilograms: "kg",
    lb: "lb",
    lbs: "lb",
    pound: "lb",
    pounds: "lb",
    t: "t",
    tonne: "t",
    tonnes: "t",
    ton: "t",
    mt: "t"
  }[e] ?? null;
}
let Oe = 0;
const Pe = (t = "r") => `${t}${Date.now().toString(36)}${(Oe++).toString(36)}`;
function Re(t) {
  const e = t.split(/\r?\n/).find((n) => n.trim()) ?? "", o = [",", ";", "	"].map((n) => [n, e.split(n).length - 1]);
  return o.sort((n, l) => l[1] - n[1]), o[0][1] > 0 ? o[0][0] : ",";
}
function Ue(t, e) {
  const o = [];
  let n = [], l = "", r = !1;
  const d = t.replace(/^\uFEFF/, "");
  for (let i = 0; i < d.length; i++) {
    const u = d[i];
    r ? u === '"' ? d[i + 1] === '"' ? (l += '"', i++) : r = !1 : l += u : u === '"' ? r = !0 : u === e ? (n.push(l), l = "") : u === `
` || u === "\r" ? (u === "\r" && d[i + 1] === `
` && i++, n.push(l), l = "", n.some((s) => s.trim() !== "") && o.push(n), n = []) : l += u;
  }
  return n.push(l), n.some((i) => i.trim() !== "") && o.push(n), o;
}
const he = {
  label: ["label", "id", "name", "sku", "item", "identifier", "description", "itemid"],
  qty: ["qty", "quantity", "count", "pcs", "pieces", "units"],
  length: ["length", "l", "len"],
  width: ["width", "w", "wid"],
  height: ["height", "h", "hgt"],
  unit: ["unit", "dimunit", "dimensionunit", "uom", "dimensionsunit", "sizeunit"],
  weight: ["weight", "wt", "mass", "weighteach", "unitweight", "weightperunit"],
  wunit: ["weightunit", "wunit", "massunit", "wtunit"],
  rotation: ["rotation", "orientation", "rotate", "rotationrule"],
  stackable: ["stackable", "stack", "canstack"],
  stop: ["stop", "drop", "destination", "droporder", "unloadorder", "stopnum", "stopnumber"]
}, pe = (t) => t.toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]/g, "");
function Ke(t) {
  const e = t.trim();
  if (e === "") return null;
  const o = e.replace(/,(?=\d{3}(\D|$))/g, "").replace(",", "."), n = Number(o);
  return Number.isFinite(n) ? n : "bad";
}
function ze(t, e = ",") {
  const o = [];
  if (t.length === 0)
    return { rows: [], issues: [{ line: 0, field: "file", severity: "error", message: "File is empty." }], delimiter: e, totalLines: 0 };
  const n = t[0], l = /* @__PURE__ */ new Map();
  let r = null, d = null;
  n.forEach((s, a) => {
    const m = pe(s);
    for (const f of Object.keys(he))
      !l.has(f) && he[f].includes(m) && l.set(f, a);
    const g = /\(([^)]+)\)/.exec(s)?.[1];
    if (g) {
      const f = pe(s);
      ["length", "width", "height", "l", "w", "h"].includes(f) && (r ??= ge(g)), ["weight", "wt", "mass"].includes(f) && (d ??= me(g));
    }
  });
  for (const s of ["label", "length", "width", "height"])
    l.has(s) || o.push({ line: 1, field: s, severity: "error", message: `Required column "${s}" not found. Headers seen: ${n.join(", ")}` });
  if (o.some((s) => s.severity === "error")) return { rows: [], issues: o, delimiter: e, totalLines: t.length - 1 };
  l.has("qty") || o.push({ line: 1, field: "qty", severity: "info", message: "No quantity column — each row counted as 1." }), !l.has("unit") && !r && o.push({ line: 1, field: "unit", severity: "warning", message: "No dimension unit column — assuming millimetres. Check each row." }), l.has("weight") && !l.has("wunit") && !d && o.push({ line: 1, field: "weight", severity: "warning", message: "No weight unit column — assuming kilograms. Check each row." });
  const i = (s, a) => l.has(a) ? s[l.get(a)] ?? "" : "", u = [];
  for (let s = 1; s < t.length; s++) {
    const a = t[s], m = s + 1;
    a.length > n.length && a.slice(n.length).some((h) => h.trim()) && o.push({ line: m, field: "row", severity: "warning", message: `Row has ${a.length} cells but header has ${n.length}; extra cells ignored.` });
    const g = (h) => {
      const C = Ke(i(a, h));
      return C === "bad" ? (o.push({ line: m, field: h, severity: "error", message: `Could not read "${i(a, h).trim()}" as a number — left empty for you to repair.` }), null) : C;
    };
    let f = r ?? "mm";
    const L = i(a, "unit").trim();
    if (L) {
      const h = ge(L);
      h ? f = h : o.push({ line: m, field: "unit", severity: "error", message: `Unknown dimension unit "${L}" — assumed ${f}; please confirm.` });
    }
    let y = d ?? "kg";
    const I = i(a, "wunit").trim();
    if (I) {
      const h = me(I);
      h ? y = h : o.push({ line: m, field: "wunit", severity: "error", message: `Unknown weight unit "${I}" — assumed ${y}; please confirm.` });
    }
    const $ = l.has("qty") ? g("qty") : 1;
    let M = "upright";
    const p = i(a, "rotation").trim().toLowerCase();
    p ? ["any", "free", "all", "yes", "y", "true", "6"].includes(p) ? M = "any" : ["upright", "yaw", "tsu", "this side up", "flat", "2"].includes(p) ? M = "upright" : ["fixed", "none", "no", "n", "false", "1", "locked"].includes(p) ? M = "fixed" : o.push({ line: m, field: "rotation", severity: "warning", message: `Unknown rotation "${p}" — using upright (yaw only).` }) : l.has("rotation") && o.push({ line: m, field: "rotation", severity: "info", message: "Blank rotation — defaulted to upright (conservative)." });
    let b = !1;
    const c = i(a, "stackable").trim().toLowerCase();
    c ? ["yes", "y", "true", "1", "stackable"].includes(c) ? b = !0 : ["no", "n", "false", "0", "no-stack", "nostack", "fragile"].includes(c) ? b = !1 : o.push({ line: m, field: "stackable", severity: "warning", message: `Unknown stackable value "${c}" — treated as no-stack.` }) : l.has("stackable") && o.push({ line: m, field: "stackable", severity: "info", message: "Blank stackable — treated as no-stack (conservative)." });
    const x = l.has("stop") ? g("stop") : null, v = x !== null && x > 0 ? Math.round(x) : null;
    u.push({
      uid: Pe(),
      label: i(a, "label").trim(),
      qty: $,
      length: g("length"),
      width: g("width"),
      height: g("height"),
      dimUnit: f,
      weight: l.has("weight") ? g("weight") : null,
      weightUnit: y,
      rotation: M,
      stackable: b,
      stop: v
    });
  }
  return { rows: u, issues: o, delimiter: e, totalLines: t.length - 1 };
}
function He(t) {
  const e = Re(t), o = Ue(t, e);
  return ze(o, e);
}
const le = 5e3, U = (t) => t !== null && Number.isFinite(t) && t > 0;
function Be(t) {
  const e = [], o = /* @__PURE__ */ new Map(), n = (r, d, i, u, s) => e.push({ severity: d, scope: "cargo", rowUid: r.uid, field: i, code: u, message: s });
  let l = 0;
  for (const r of t) {
    const d = r.label.trim();
    if (!d) n(r, "error", "label", "LABEL_MISSING", "Identifier is required.");
    else {
      const i = d.toLowerCase();
      o.has(i) ? n(r, "error", "label", "DUPLICATE_LABEL", `Duplicate identifier "${d}" — merge the rows or rename one.`) : o.set(i, r.uid);
    }
    if (r.qty === null || !Number.isInteger(r.qty) || r.qty < 1 ? n(r, "error", "qty", "QTY_INVALID", "Quantity must be a whole number ≥ 1.") : l += r.qty, ["length", "width", "height"].forEach((i) => {
      const u = r[i];
      u === null ? n(r, "error", i, "DIM_MISSING", `${i} is missing — never guessed. Enter or measure it.`) : (!Number.isFinite(u) || u <= 0) && n(r, "error", i, "DIM_NONPOSITIVE", `${i} must be > 0 (got ${u}).`);
    }), r.weight === null ? n(r, "warning", "weight", "WEIGHT_UNKNOWN", "Weight unknown — payload checks cannot be completed for this row.") : (!Number.isFinite(r.weight) || r.weight <= 0) && n(r, "error", "weight", "WEIGHT_NONPOSITIVE", `weight must be > 0 (got ${r.weight}); leave empty if unknown.`), U(r.length) && U(r.width) && U(r.height)) {
      const i = [P(r.length, r.dimUnit), P(r.width, r.dimUnit), P(r.height, r.dimUnit)];
      Math.max(...i) > 2e4 && n(r, "warning", "length", "DIM_IMPLAUSIBLE", `Longest side is ${Math.round(Math.max(...i))} mm — check the unit.`), Math.min(...i) < 5 && n(r, "warning", "length", "DIM_IMPLAUSIBLE", "Shortest side is under 5 mm — check the unit.");
    }
  }
  return t.length === 0 && e.push({ severity: "error", scope: "cargo", rowUid: "", field: "rows", code: "NO_CARGO", message: "Add at least one cargo row." }), l > le && e.push({ severity: "error", scope: "cargo", rowUid: "", field: "qty", code: "TOO_MANY_UNITS", message: `Total ${l} units exceeds the ${le} unit limit.` }), e;
}
function Ge(t) {
  const e = [];
  for (const o of t) {
    const n = (l, r, d, i) => e.push({ severity: l, scope: "equipment", rowUid: o.id, field: r, code: d, message: i });
    ["length", "width", "height"].forEach((l) => {
      U(o[l]) || n("error", l, "DIM_INVALID", `Internal ${l} must be a number > 0.`);
    }), o.payload === null ? n("warning", "payload", "PAYLOAD_NOT_DECLARED", "No payload declared — weight limit is not modeled.") : o.payload <= 0 && n("error", "payload", "PAYLOAD_INVALID", "Payload must be > 0."), o.doorWidth === null || o.doorHeight === null ? n("warning", "door", "DOOR_NOT_DECLARED", "No door opening declared — door fit is not modeled.") : (o.doorWidth <= 0 || o.doorHeight <= 0) && n("error", "door", "DOOR_INVALID", "Door dimensions must be > 0."), o.cost !== null && o.cost < 0 && n("error", "cost", "COST_INVALID", "Cost cannot be negative.");
  }
  return e;
}
function Ie(t) {
  const e = [];
  for (const o of t) {
    if (!U(o.length) || !U(o.width) || !U(o.height) || o.qty === null || o.qty < 1) continue;
    const n = [
      P(o.length, o.dimUnit),
      P(o.width, o.dimUnit),
      P(o.height, o.dimUnit)
    ], l = o.weight !== null && o.weight > 0 ? Me(o.weight, o.weightUnit) : null;
    for (let r = 1; r <= o.qty; r++)
      if (e.push({
        id: o.qty === 1 ? o.label.trim() : `${o.label.trim()}#${r}`,
        rowUid: o.uid,
        label: o.label.trim(),
        dims: n,
        weightKg: l,
        rotation: o.rotation,
        stackable: o.stackable,
        stop: o.stop ?? null
      }), e.length > le) return e;
  }
  return e;
}
function ve(t) {
  if (!U(t.length) || !U(t.width) || !U(t.height)) return null;
  const e = t.doorWidth !== null && t.doorHeight !== null && t.doorWidth > 0 && t.doorHeight > 0;
  return {
    id: t.id,
    name: t.name,
    L: P(t.length, t.unit),
    W: P(t.width, t.unit),
    H: P(t.height, t.unit),
    doorW: e ? P(t.doorWidth, t.unit) : null,
    doorH: e ? P(t.doorHeight, t.unit) : null,
    payloadKg: t.payload !== null && t.payload > 0 ? Me(t.payload, t.massUnit) : null
  };
}
const w = 0.01, fe = (t) => [...t].sort((e, o) => e - o), R = (t, e) => Math.abs(t - e) <= w;
function Ve(t, e, o, n) {
  const [l, r, d] = t.dims;
  if (t.rotation === "fixed") return R(e, l) && R(o, r) && R(n, d);
  if (t.rotation === "upright")
    return R(n, d) && (R(e, l) && R(o, r) || R(e, r) && R(o, l));
  const i = fe([l, r, d]), u = fe([e, o, n]);
  return i.every((s, a) => R(s, u[a]));
}
function Xe(t, e, o, n) {
  const l = [], r = new Map(t.map((s) => [s.id, s])), d = /* @__PURE__ */ new Set(), i = n.minSupportPct / 100;
  for (const s of o) {
    const a = r.get(s.unitId);
    if (!a) {
      l.push({ code: "UNKNOWN_UNIT", unitIds: [s.unitId], message: `Placement refers to unknown unit ${s.unitId}.` });
      continue;
    }
    d.has(s.unitId) && l.push({ code: "DUPLICATE_PLACEMENT", unitIds: [s.unitId], message: `${s.unitId} is placed more than once.` }), d.add(s.unitId), (s.x < -w || s.y < -w || s.z < -w || s.x + s.dx > e.L + w || s.y + s.dy > e.W + w || s.z + s.dz > e.H + w) && l.push({ code: "OUT_OF_BOUNDS", unitIds: [s.unitId], message: `${s.unitId} extends outside the ${e.name} interior.` }), Ve(a, s.dx, s.dy, s.dz) || l.push({ code: "ORIENTATION_NOT_ALLOWED", unitIds: [s.unitId], message: `${s.unitId} is in an orientation its rotation rule (${a.rotation}) does not allow.` }), e.doorW !== null && e.doorH !== null && (s.dy > e.doorW + w || s.dz > e.doorH + w) && l.push({ code: "DOOR_BLOCKED", unitIds: [s.unitId], message: `${s.unitId} cross-section ${Math.round(s.dy)}×${Math.round(s.dz)} mm exceeds the door opening ${Math.round(e.doorW)}×${Math.round(e.doorH)} mm in its placed orientation.` });
  }
  const u = o.filter((s) => r.has(s.unitId)).slice().sort((s, a) => s.x - a.x);
  for (let s = 0; s < u.length; s++) {
    const a = u[s];
    for (let m = s + 1; m < u.length; m++) {
      const g = u[m];
      if (g.x >= a.x + a.dx - w) break;
      g.y < a.y + a.dy - w && a.y < g.y + g.dy - w && g.z < a.z + a.dz - w && a.z < g.z + g.dz - w && l.push({ code: "OVERLAP", unitIds: [a.unitId, g.unitId], message: `${a.unitId} and ${g.unitId} occupy the same space.` });
    }
  }
  for (const s of u) {
    if (s.z <= w) continue;
    const a = s.dx * s.dy;
    let m = 0;
    for (const g of u) {
      if (g === s || !R(g.z + g.dz, s.z)) continue;
      const f = Math.min(s.x + s.dx, g.x + g.dx) - Math.max(s.x, g.x), L = Math.min(s.y + s.dy, g.y + g.dy) - Math.max(s.y, g.y);
      f > w && L > w && (m += f * L, r.get(g.unitId).stackable || l.push({ code: "ON_NO_STACK_ITEM", unitIds: [s.unitId, g.unitId], message: `${s.unitId} rests on no-stack item ${g.unitId}.` }));
    }
    m / a < i - 1e-6 && l.push({ code: "UNSUPPORTED", unitIds: [s.unitId], message: `${s.unitId} base is only ${(100 * m / a).toFixed(0)}% supported (minimum ${n.minSupportPct}%).` });
  }
  if (e.payloadKg !== null) {
    const s = o.reduce((a, m) => a + (r.get(m.unitId)?.weightKg ?? 0), 0);
    s > e.payloadKg + 1e-6 && l.push({ code: "PAYLOAD_EXCEEDED", unitIds: [], message: `Known loaded weight ${s.toFixed(1)} kg exceeds declared payload ${e.payloadKg.toFixed(1)} kg.` });
  }
  for (let s = 0; s < u.length; s++) {
    const a = u[s], m = r.get(a.unitId);
    if (!(!m || m.stop === null || m.stop === void 0))
      for (let g = 0; g < u.length; g++) {
        if (s === g) continue;
        const f = u[g], L = r.get(f.unitId);
        if (!(!L || L.stop === null || L.stop === void 0) && m.stop < L.stop && f.x >= a.x + a.dx - w) {
          const y = Math.min(a.y + a.dy, f.y + f.dy) - Math.max(a.y, f.y), I = Math.min(a.z + a.dz, f.z + f.dz) - Math.max(a.z, f.z);
          if (y > w && I > w) {
            l.push({
              code: "STOP_ACCESS_BLOCKED",
              unitIds: [a.unitId, f.unitId],
              message: `${a.unitId} (Stop ${m.stop}) is blocked from rear door egress by ${f.unitId} (Stop ${L.stop}) placed behind it.`
            });
            break;
          }
        }
      }
  }
  return l;
}
function Se(t) {
  const [e, o, n] = t.dims;
  let l;
  t.rotation === "fixed" ? l = [[e, o, n]] : t.rotation === "upright" ? l = [[e, o, n], [o, e, n]] : l = [[e, o, n], [o, e, n], [e, n, o], [n, e, o], [o, n, e], [n, o, e]];
  const r = /* @__PURE__ */ new Set();
  return l.filter((d) => {
    const i = d.join("|");
    return r.has(i) ? !1 : (r.add(i), !0);
  });
}
function Ce(t, e) {
  return Se(t).filter(([o, n, l]) => o <= e.L + w && n <= e.W + w && l <= e.H + w && (e.doorW === null || e.doorH === null || n <= e.doorW + w && l <= e.doorH + w));
}
function Ye(t) {
  let e = t >>> 0;
  return () => {
    e = e + 1831565813 >>> 0;
    let o = e;
    return o = Math.imul(o ^ o >>> 15, o | 1), o ^= o + Math.imul(o ^ o >>> 7, o | 61), ((o ^ o >>> 14) >>> 0) / 4294967296;
  };
}
const H = (t) => t.dims[0] * t.dims[1] * t.dims[2], je = [
  { name: "Volume ↓", key: (t) => [-H(t)] },
  { name: "Longest edge ↓", key: (t) => [-Math.max(...t.dims), -H(t)] },
  { name: "Footprint ↓", key: (t) => [-([...t.dims].sort((e, o) => o - e)[0] * [...t.dims].sort((e, o) => o - e)[1]), -H(t)] },
  { name: "Heavy first", key: (t) => [-(t.weightKg ?? 0), -H(t)] },
  { name: "Tallest first", key: (t) => [-t.dims[2], -H(t)] },
  { name: "No-stack first", key: (t) => [t.stackable ? 1 : 0, -H(t)] },
  { name: "Reverse drop (LIFO)", key: (t) => [-(t.stop ?? 0), -H(t)] },
  { name: "Input order", key: (t, e) => [e] }
];
function qe(t, e, o, n, l, r) {
  const d = [], u = /* @__PURE__ */ new Map(), s = [];
  let a = 0;
  const m = (c, x) => c * 100003 + x, g = (c) => {
    const x = d[c];
    for (let v = Math.floor(x.x / 250); v <= Math.floor((x.x + x.dx - w) / 250); v++)
      for (let h = Math.floor(x.y / 250); h <= Math.floor((x.y + x.dy - w) / 250); h++) {
        const C = m(v, h), S = u.get(C);
        S ? S.push(c) : u.set(C, [c]);
      }
  }, f = (c, x, v, h) => {
    a++;
    const C = [];
    for (let S = Math.floor(c / 250); S <= Math.floor((c + v - w) / 250); S++)
      for (let D = Math.floor(x / 250); D <= Math.floor((x + h - w) / 250); D++) {
        const k = u.get(m(S, D));
        if (k)
          for (const E of k) s[E] !== a && (s[E] = a, C.push(E));
      }
    return C;
  }, L = [[0, 0]], y = /* @__PURE__ */ new Set(["0|0"]), I = [], $ = [];
  let M = 0, p = "";
  const b = (c, x) => {
    if (c > e.L + w || x > e.W + w) return;
    const v = `${Math.round(c * 100)}|${Math.round(x * 100)}`;
    if (y.has(v)) return;
    y.add(v);
    let h = 0, C = L.length;
    for (; h < C; ) {
      const S = h + C >> 1;
      L[S][0] < c || L[S][0] === c && L[S][1] < x ? h = S + 1 : C = S;
    }
    L.splice(h, 0, [c, x]);
  };
  for (const c of t) {
    if (r() || Date.now() > l) {
      $.push(c.id);
      continue;
    }
    if (e.payloadKg !== null && c.weightKg !== null && M + c.weightKg > e.payloadKg + 1e-6) {
      $.push(c.id);
      continue;
    }
    const x = `${c.dims.join("x")}|${c.rotation}|${c.stackable}`;
    if (x === p) {
      $.push(c.id);
      continue;
    }
    const v = Ce(c, e);
    let h = null;
    for (const [k, E] of L) {
      if (h && k > h.x + w && (o === "front-first" || h.z <= w)) break;
      for (const W of v) {
        const [F, _, T] = W;
        if (k + F > e.L + w || E + _ > e.W + w) continue;
        const z = f(k, E, F, _);
        let N = 0;
        for (const K of z) {
          const A = d[K];
          k < A.x + A.dx - w && A.x < k + F - w && E < A.y + A.dy - w && A.y < E + _ - w && A.top > N && (N = A.top);
        }
        if (N + T > e.H + w) continue;
        if (N > w) {
          let K = 0, A = !0;
          for (const J of z) {
            const O = d[J];
            if (Math.abs(O.top - N) > w) continue;
            const G = Math.min(k + F, O.x + O.dx) - Math.max(k, O.x), Z = Math.min(E + _, O.y + O.dy) - Math.max(E, O.y);
            if (G > w && Z > w) {
              if (!O.stackable) {
                A = !1;
                break;
              }
              K += G * Z;
            }
          }
          if (!A || K / (F * _) < n - 1e-6) continue;
        }
        const q = o === "front-first" ? [k, N, E, T] : [N, k, E, T];
        (!h || Ee(q, h.score) < 0) && (h = { score: q, x: k, y: E, z: N, d: W });
      }
    }
    if (!h) {
      $.push(c.id), p = x;
      continue;
    }
    p = "";
    const [C, S, D] = h.d;
    d.push({ x: h.x, y: h.y, z: h.z, dx: C, dy: S, dz: D, top: h.z + D, stackable: c.stackable }), g(d.length - 1), I.push({ unitId: c.id, rowUid: c.rowUid, label: c.label, x: h.x, y: h.y, z: h.z, dx: C, dy: S, dz: D, order: I.length + 1, stop: c.stop ?? null }), c.weightKg !== null && (M += c.weightKg), b(h.x + C, h.y), b(h.x, h.y + S), b(h.x, h.y), b(h.x + C, 0), b(0, h.y + S);
  }
  return { placements: I, unplacedIds: $ };
}
function Ee(t, e) {
  for (let o = 0; o < t.length; o++) if (t[o] !== e[o]) return t[o] - e[o];
  return 0;
}
const Je = (t) => t.map((e) => `${e.unitId}@${e.x},${e.y},${e.z},${e.dx},${e.dy},${e.dz}`).sort().join(";");
function Ze(t, e, o, n = {}) {
  const l = n.shouldCancel ?? (() => !1), d = Date.now() + o.maxMs, i = o.minSupportPct / 100, u = Ye(o.seed), s = [];
  let a = 0, m = !1;
  const g = n.quick ? Math.min(2, o.maxAttempts) : o.maxAttempts, f = ["front-first", "floor-first"], L = (b, c, x) => {
    a++;
    const v = qe(c, e, x, i, d, l);
    s.push({ name: `${b} · ${x === "front-first" ? "front-first" : "floor-first"}`, r: v }), v.unplacedIds.length === 0 && (m = !0);
  };
  e: for (const b of je) {
    const c = new Map(t.map((v, h) => [v.id, h])), x = [...t].sort((v, h) => Ee(b.key(v, c.get(v.id)), b.key(h, c.get(h.id))) || c.get(v.id) - c.get(h.id));
    for (const v of f) {
      if (a >= g || l() || Date.now() > d) break e;
      L(b.name, x, v);
    }
  }
  let y = 0;
  for (; !m && a < g && !l() && Date.now() <= d; ) {
    const b = t.map((c) => ({ u: c, k: -H(c) * (0.6 + 0.8 * u()) }));
    b.sort((c, x) => c.k - x.k), L(`Seeded shuffle ${++y}`, b.map((c) => c.u), u() < 0.5 ? "front-first" : "floor-first");
  }
  const I = l() ? "cancelled" : m ? "all_placed" : Date.now() > d ? "time_cap" : "attempts_exhausted", $ = (b) => b.reduce((c, x) => Math.max(c, x.x + x.dx), 0);
  s.sort((b, c) => b.r.unplacedIds.length - c.r.unplacedIds.length || $(b.r.placements) - $(c.r.placements));
  const M = /* @__PURE__ */ new Set(), p = [];
  for (const b of s) {
    const c = Je(b.r.placements);
    if (!M.has(c) && (M.add(c), p.push({ name: b.name, placements: b.r.placements, unplacedIds: b.r.unplacedIds }), p.length >= 3))
      break;
  }
  return { arrangements: p, attempts: a, stopReason: I };
}
const be = "ep-heuristic-1.0";
function ce(t, e, o) {
  const n = new Map(t.map((p) => [p.id, p]));
  let l = 0, r = 0, d = 0, i = 0, u = 0, s = 0;
  for (const p of o) {
    l += p.dx * p.dy * p.dz;
    const b = n.get(p.unitId)?.weightKg ?? 0;
    r += b, d += b * (p.x + p.dx / 2), i += b * (p.y + p.dy / 2), u += b * (p.z + p.dz / 2), s = Math.max(s, p.x + p.dx);
  }
  const a = new Set(o.map((p) => p.unitId)), m = t.filter((p) => p.weightKg === null).length, g = t.filter((p) => p.weightKg === null && a.has(p.id)).length, f = r > 0 && g === 0, L = f ? d / r : null, y = f ? i / r : null, I = f ? u / r : null, $ = f && e.L > 0 ? 100 * d / r / e.L : null;
  let M = null;
  if (f && L !== null && e.L > 3e3) {
    const p = 0.08 * e.L, b = 0.8 * e.L, c = Math.max(1, b - p), x = Math.max(0, Math.min(1, (L - p) / c)), v = 1 - x, h = Math.round(r * x), C = Math.round(r * v * 0.2), S = Math.round(r * v * 0.8), D = 5443, k = 15422, E = 15422, W = e.L / 304.8, F = Math.min(8e4, 500 * (1.25 * W + 96)), _ = Math.round(F * 0.45359237), T = r <= _ && S <= k && h <= E && C <= D;
    M = {
      steerKg: C,
      driveKg: S,
      trailerKg: h,
      steerPct: Math.round(C / D * 100),
      drivePct: Math.round(S / k * 100),
      trailerPct: Math.round(h / E * 100),
      bridgeFormulaCompliant: T,
      bridgeFormulaLimitKg: _
    };
  }
  return {
    totalUnits: t.length,
    placedUnits: o.length,
    occupiedVolumePct: 100 * l / (e.L * e.W * e.H),
    loadedWeightKg: r,
    unknownWeightUnits: m,
    payloadKg: e.payloadKg,
    payloadRemainingKg: e.payloadKg === null ? null : e.payloadKg - r,
    usedLengthMm: s,
    cogXPct: $,
    cogX: L,
    cogY: y,
    cogZ: I,
    axleEst: M
  };
}
function Qe(t, e, o) {
  const n = Array.from(new Set(t.map((i) => i.stop).filter((i) => typeof i == "number" && i > 0))).sort((i, u) => i - u);
  if (n.length < 2) return [];
  const l = [], r = new Map(t.map((i) => [i.id, i])), d = ce(t, e, o);
  l.push({
    stage: 0,
    stop: 0,
    label: "Depart Origin (Full Load)",
    remainingUnits: o.length,
    remainingWeightKg: d.loadedWeightKg,
    cogX: d.cogX ?? null,
    cogXPct: d.cogXPct ?? null,
    axleEst: d.axleEst ?? null,
    warning: null
  });
  for (let i = 0; i < n.length; i++) {
    const u = n[i], s = o.filter((g) => {
      const L = r.get(g.unitId)?.stop ?? g.stop ?? null;
      return L === null || L > u;
    }), a = ce(t, e, s);
    let m = null;
    a.axleEst && (a.axleEst.drivePct > 100 ? m = `Drive tandem overloaded (${a.axleEst.drivePct}% rating) after Stop ${u} drop.` : a.axleEst.steerPct > 100 ? m = `Steer axle overloaded (${a.axleEst.steerPct}% rating) after Stop ${u} drop.` : a.cogXPct !== null && a.cogXPct < 40 && (m = `Forward weight bias (CoG at ${Math.round(a.cogXPct)}% L) after rear cargo drop.`)), l.push({
      stage: i + 1,
      stop: u,
      label: i === n.length - 1 ? "Final Destination (Empty)" : `En route to Stop ${n[i + 1]} (Post-Stop ${u} Drop)`,
      remainingUnits: s.length,
      remainingWeightKg: a.loadedWeightKg,
      cogX: a.cogX ?? null,
      cogXPct: a.cogXPct ?? null,
      axleEst: a.axleEst ?? null,
      warning: m
    });
  }
  return l;
}
function we(t, e, o) {
  const n = (l, r, d) => ({
    id: l,
    label: r,
    note: d,
    state: o ? "verified" : "unknown"
  });
  return [
    n("bounds", "Inside interior dimensions", "Every box lies within L × W × H of the declared interior."),
    n("overlap", "No overlapping items", "Pairwise axis-aligned box test by an independent validator."),
    n("orientation", "Allowed orientations only", "Each item uses an orientation permitted by its rotation rule."),
    n("support", "Base support & no-stack", "Each raised item rests on surfaces at its exact base height, none marked no-stack."),
    t.payloadKg === null ? { id: "payload", label: "Declared payload", state: "not_declared", note: "No payload declared, so weight is not checked." } : e > 0 ? { id: "payload", label: "Declared payload", state: "unknown", note: `${e} unit(s) have unknown weight; total cannot be confirmed.` } : { id: "payload", label: "Declared payload", state: o ? "verified" : "unknown", note: "Sum of declared unit weights vs the declared payload figure." },
    t.doorW === null ? { id: "door", label: "Door opening", state: "not_declared", note: "No door opening declared, so door fit is not checked." } : { id: "door", label: "Door opening", state: o ? "verified" : "unknown", note: "Each item's cross-section in its placed orientation fits the declared opening. Interior path and handling equipment are NOT modeled." },
    { id: "axle", label: "Axle / axle-group loads & legal limits", state: "not_modeled", note: "Needs vehicle configuration, tare and jurisdiction. Verify with scales and a qualified person." },
    { id: "securement", label: "Load securement", state: "not_modeled", note: "Depends on restraint equipment and applicable rules, not on box geometry." },
    { id: "handling", label: "Forklift / manual handling access", state: "not_modeled", note: "Loading order, aisle and reach are not simulated." },
    { id: "stops", label: "Multi-stop access order", state: "not_modeled", note: "Unload sequence is not modeled." },
    { id: "cog", label: "Centre of gravity (height & lateral)", state: "not_modeled", note: "Longitudinal centroid is shown as information only." }
  ];
}
const ye = (t, e) => ({
  totalUnits: t.length,
  placedUnits: 0,
  occupiedVolumePct: 0,
  loadedWeightKg: 0,
  unknownWeightUnits: t.filter((o) => o.weightKg === null).length,
  payloadKg: e?.payloadKg ?? null,
  payloadRemainingKg: e?.payloadKg ?? null,
  usedLengthMm: 0,
  cogXPct: null,
  cogX: null,
  cogY: null,
  cogZ: null,
  axleEst: null
});
function et(t, e) {
  const o = [], n = /* @__PURE__ */ new Map();
  for (const d of t) n.has(d.rowUid) || n.set(d.rowUid, d);
  for (const d of n.values()) {
    const [i, u, s] = d.dims, a = Le(d).some(([L, y, I]) => L <= e.L + w && y <= e.W + w && I <= e.H + w), m = Le(d).some((L) => tt(L, e)), g = Ce(d, e).length > 0, f = `${Math.round(i)}×${Math.round(u)}×${Math.round(s)} mm`;
    g || (a ? m ? o.push({
      code: "ROTATION_FORBIDDEN_WOULD_FIT",
      severity: "error",
      labels: [d.label],
      message: `${d.label} (${f}) would fit if rotated further, but its rotation rule (${d.rotation}) forbids that orientation.`,
      action: "If the item may be tilted or laid on its side, relax the rotation rule — the plan will update."
    }) : o.push({
      code: "ITEM_EXCEEDS_DOOR",
      severity: "error",
      labels: [d.label],
      message: `${d.label} (${f}) fits inside but cannot pass the ${Math.round(e.doorW)}×${Math.round(e.doorH)} mm door opening in any orientation.`,
      action: "Use equipment with a larger opening, or split/tilt the item if it can be dismantled."
    }) : o.push({
      code: "ITEM_EXCEEDS_INTERIOR",
      severity: "error",
      labels: [d.label],
      message: `${d.label} (${f}) cannot fit inside ${Math.round(e.L)}×${Math.round(e.W)}×${Math.round(e.H)} mm in any orientation.`,
      action: "Choose larger equipment, or re-check the item dimensions."
    }));
  }
  const l = t.reduce((d, i) => d + (i.weightKg ?? 0), 0);
  e.payloadKg !== null && l > e.payloadKg + 1e-6 && o.push({
    code: "PAYLOAD_EXCEEDED",
    severity: "error",
    labels: [],
    message: `Declared weights total ${l.toFixed(0)} kg, above the declared payload of ${e.payloadKg.toFixed(0)} kg${t.some((d) => d.weightKg === null) ? " (and some weights are still unknown)" : ""}.`,
    action: "Split the shipment across vehicles or use equipment with higher declared payload."
  });
  const r = t.reduce((d, i) => d + i.dims[0] * i.dims[1] * i.dims[2], 0);
  return r > e.L * e.W * e.H + 1 && o.push({
    code: "VOLUME_EXCEEDED",
    severity: "error",
    labels: [],
    message: `Item bounding-box volume (${(r / 1e9).toFixed(2)} m³) exceeds interior volume (${(e.L * e.W * e.H / 1e9).toFixed(2)} m³).`,
    action: "Use larger equipment or reduce the shipment."
  }), o;
}
const Le = (t) => Se({ ...t, rotation: "any" }), tt = (t, e) => t[0] <= e.L + w && t[1] <= e.W + w && t[2] <= e.H + w && (e.doorW === null || e.doorH === null || t[1] <= e.doorW + w && t[2] <= e.doorH + w);
function ot(t, e, o, n, l) {
  const r = Date.now(), d = {
    equipmentId: e?.id ?? "",
    equipmentName: o,
    arrangements: [],
    best: 0,
    violations: [],
    solver: { version: be, seed: n.seed, attempts: 0, budget: n.maxAttempts, stopReason: "no_solve", ms: 0 }
  };
  if (!e)
    return {
      ...d,
      status: "INCOMPLETE_INPUT",
      geometryFeasible: !1,
      metrics: ye(t, null),
      checks: [],
      reasons: [{ code: "PROFILE_INVALID", severity: "error", labels: [], message: "Equipment profile has missing or invalid internal dimensions.", action: "Enter positive internal length, width and height." }]
    };
  if (!l.cargoValid || t.length === 0)
    return {
      ...d,
      status: "INCOMPLETE_INPUT",
      geometryFeasible: !1,
      metrics: ye(t, e),
      checks: we(e, 0, !1),
      reasons: [{ code: "INPUT_INVALID", severity: "error", labels: [], message: "Cargo input has errors, so no plan was attempted.", action: "Open the Cargo step and repair the flagged cells." }]
    };
  const i = et(t, e), u = i.length > 0, s = Ze(t, e, n, { quick: u, shouldCancel: l.shouldCancel }), a = [], m = [];
  for (const c of s.arrangements)
    Xe(t, e, c.placements, n).length === 0 ? a.push(c) : m.push(c.name);
  const g = a[0] ?? { placements: [], unplacedIds: t.map((c) => c.id) }, f = ce(t, e, g.placements), L = t.filter((c) => c.weightKg === null).length, y = g.unplacedIds.length === 0 && g.placements.length === t.length, I = new Set(g.placements.map((c) => c.unitId)), $ = [...new Set(t.filter((c) => !I.has(c.id)).map((c) => c.label))];
  let M, p = s.stopReason;
  u ? (M = "PROVEN_INFEASIBLE_UNDER_MODELED_CONSTRAINTS", p = "proven_bound") : y ? L > 0 && e.payloadKg !== null ? (M = "INCOMPLETE_INPUT", i.push({
    code: "WEIGHT_UNKNOWN",
    severity: "warning",
    labels: [...new Set(t.filter((c) => c.weightKg === null).map((c) => c.label))],
    message: `Geometry fits, but ${L} unit(s) have unknown weight, so the payload check cannot be completed.`,
    action: "Enter or measure the missing weights."
  })) : e.payloadKg === null || e.doorW === null ? (M = "NEEDS_PHYSICAL_REVIEW", e.payloadKg === null && i.push({ code: "PAYLOAD_NOT_DECLARED", severity: "warning", labels: [], message: "Geometry fits, but no payload is declared for this equipment.", action: "Add the declared payload from the vehicle plate or carrier." }), e.doorW === null && i.push({ code: "DOOR_NOT_DECLARED", severity: "warning", labels: [], message: "Geometry fits, but no door opening is declared, so door fit was not checked.", action: "Add the door opening size." })) : M = "FEASIBLE_UNDER_MODELED_CONSTRAINTS" : (M = "NOT_FOUND_WITHIN_SEARCH_BUDGET", i.push({
    code: "UNPLACED_ITEMS",
    severity: "warning",
    labels: $,
    message: `${t.length - g.placements.length} of ${t.length} units were not placed by the heuristic.`,
    action: "This is NOT proof of impossibility. Raise the attempt budget, relax rules (rotation, stacking, support), or try other equipment."
  }), i.push({
    code: "SEARCH_BUDGET_EXHAUSTED",
    severity: "warning",
    labels: [],
    message: `Search stopped (${s.stopReason.replace("_", " ")}) after ${s.attempts} attempt(s) without a complete plan.`,
    action: "Increase attempts in Settings, or review the placed partial plan."
  })), m.length && i.push({ code: "UNPLACED_ITEMS", severity: "warning", labels: [], message: `Internal check discarded ${m.length} candidate arrangement(s) that failed independent validation.`, action: "Report this scenario — solver/validator disagreement." });
  const b = Qe(t, e, g.placements);
  return {
    ...d,
    status: M,
    geometryFeasible: y,
    reasons: i,
    arrangements: a,
    best: 0,
    metrics: f,
    violations: [],
    checks: we(e, L, a.length > 0),
    multiStopStages: b,
    solver: { version: be, seed: n.seed, attempts: s.attempts, budget: n.maxAttempts, stopReason: p, ms: Date.now() - r }
  };
}
const nt = { seed: 42, maxAttempts: 40, maxMs: 6e3, minSupportPct: 100 };
function st(t) {
  const e = JSON.stringify({
    r: t.rows.map((n) => [n.uid, n.label, n.qty, n.length, n.width, n.height, n.dimUnit, n.weight, n.weightUnit, n.rotation, n.stackable]),
    e: t.equipment.filter((n) => n.included).map((n) => [n.id, n.name, n.length, n.width, n.height, n.unit, n.doorWidth, n.doorHeight, n.payload, n.massUnit, n.cost, n.costSource]),
    s: [t.settings.seed, t.settings.maxAttempts, t.settings.minSupportPct]
  });
  let o = 2166136261;
  for (let n = 0; n < e.length; n++)
    o ^= e.charCodeAt(n), o = Math.imul(o, 16777619) >>> 0;
  return o.toString(16).padStart(8, "0");
}
function it(t, e = {}) {
  const o = [...Be(t.rows), ...Ge(t.equipment.filter((i) => i.included))], n = !o.some((i) => i.scope === "cargo" && i.severity === "error"), l = Ie(t.rows), r = t.equipment.filter((i) => i.included), d = [];
  for (const i of r) {
    if (e.shouldCancel?.()) break;
    const u = ot(l, ve(i), i.name, t.settings, { cargoValid: n, shouldCancel: e.shouldCancel });
    u.equipmentId = i.id, d.push(u), e.onResult?.(u, d.length, r.length);
  }
  return { hash: st(t), issues: o, units: l, results: d, cargoValid: n };
}
function se(t, e) {
  if (e < 2) return 2e4;
  const o = 500 * (t * e / (e - 1) + 12 * e + 36);
  return Math.round(o / 500) * 500;
}
const at = 2.2046226218;
function rt(t) {
  const e = t.cargoWeightKg * at, o = t.equipmentLengthMm / 1e3 * 3.28084, n = t.cargoCogXMm / 1e3 * 3.28084;
  if (!(o >= 40)) {
    const ae = t.tareSteerLbs ?? 8e3, _e = t.tareDriveLbs ?? 9e3, de = Math.max(0, Math.min(1, n / (o || 24))), De = e * de, Fe = e * (1 - de), Q = Math.round(ae + Fe), ee = Math.round(_e + De), V = Q + ee, X = 2e4, Y = 2e4, j = 33e3, te = {
      id: "steer",
      name: "Steer Axle (1 axle)",
      axleCount: 1,
      spacingFt: 0,
      actualWeightLbs: Q,
      statutoryCapLbs: X,
      bridgeFormulaAllowedLbs: X,
      maxLegalWeightLbs: X,
      compliant: Q <= X,
      marginLbs: X - Q,
      utilizationPct: Math.round(Q / X * 100)
    }, oe = {
      id: "drive",
      name: "Drive Axle (Single)",
      axleCount: 1,
      spacingFt: 0,
      actualWeightLbs: ee,
      statutoryCapLbs: Y,
      bridgeFormulaAllowedLbs: Y,
      maxLegalWeightLbs: Y,
      compliant: ee <= Y,
      marginLbs: Y - ee,
      utilizationPct: Math.round(ee / Y * 100)
    }, ne = [];
    return te.compliant || ne.push(`Steer axle overloaded by ${Math.abs(te.marginLbs).toLocaleString()} lbs.`), oe.compliant || ne.push(`Drive axle overloaded by ${Math.abs(oe.marginLbs).toLocaleString()} lbs.`), V > j && ne.push(`Gross Vehicle Weight (${V.toLocaleString()} lbs) exceeds maximum allowable ${j.toLocaleString()} lbs.`), {
      overallGvwLbs: V,
      maxLegalGvwLbs: j,
      gvwCompliant: V <= j,
      gvwMarginLbs: j - V,
      groups: [te, oe],
      allCompliant: te.compliant && oe.compliant && V <= j,
      kpraFt: null,
      kpraCompliant: !0,
      kpraMaxFt: 40,
      reasons: ne
    };
  }
  const r = t.tareSteerLbs ?? 10500, d = t.tareDriveLbs ?? 14e3, i = t.tareTrailerLbs ?? 10500, u = (t.trailerWheelbaseIn ?? 456) / 12, s = 4.33, a = 4.08, m = 36, g = 51, f = Math.max(0, Math.min(u, n)), L = e * (f / u), y = e * ((u - f) / u), I = y * 0.95, $ = y * 0.05, M = Math.round(r + $), p = Math.round(d + I), b = Math.round(i + L), c = M + p + b, v = {
    id: "steer",
    name: "Steering Axle (Single)",
    axleCount: 1,
    spacingFt: 0,
    actualWeightLbs: M,
    statutoryCapLbs: 12500,
    // Practical fleet tire rating limit
    bridgeFormulaAllowedLbs: 2e4,
    maxLegalWeightLbs: 12500,
    compliant: M <= 12500,
    marginLbs: 12500 - M,
    utilizationPct: Math.round(M / 12500 * 100)
  }, h = se(s, 2), C = 34e3, S = Math.min(C, h), D = {
    id: "drive_tandem",
    name: "Tractor Drive Tandem (2 axles)",
    axleCount: 2,
    spacingFt: s,
    actualWeightLbs: p,
    statutoryCapLbs: C,
    bridgeFormulaAllowedLbs: h,
    maxLegalWeightLbs: S,
    compliant: p <= S,
    marginLbs: S - p,
    utilizationPct: Math.round(p / S * 100)
  }, k = se(a, 2), E = 34e3, W = Math.min(E, k), F = {
    id: "trailer_tandem",
    name: "Trailer Tandem (2 axles)",
    axleCount: 2,
    spacingFt: a,
    actualWeightLbs: b,
    statutoryCapLbs: E,
    bridgeFormulaAllowedLbs: k,
    maxLegalWeightLbs: W,
    compliant: b <= W,
    marginLbs: W - b,
    utilizationPct: Math.round(b / W * 100)
  }, _ = p + b, T = se(m, 4), z = Math.min(68e3, T), N = {
    id: "inner_bridge",
    name: "Inner Bridge (Drive to Trailer, 4 axles)",
    axleCount: 4,
    spacingFt: m,
    actualWeightLbs: _,
    statutoryCapLbs: 68e3,
    bridgeFormulaAllowedLbs: T,
    maxLegalWeightLbs: z,
    compliant: _ <= z,
    marginLbs: z - _,
    utilizationPct: Math.round(_ / z * 100)
  }, q = se(g, 5), K = Math.min(8e4, q), A = {
    id: "outer_bridge",
    name: "Outer Bridge (Steer to Rear, 5 axles)",
    axleCount: 5,
    spacingFt: g,
    actualWeightLbs: c,
    statutoryCapLbs: 8e4,
    bridgeFormulaAllowedLbs: q,
    maxLegalWeightLbs: K,
    compliant: c <= K,
    marginLbs: K - c,
    utilizationPct: Math.round(c / K * 100)
  }, J = t.kpraIn ? t.kpraIn / 12 : 39.5, O = 40, G = J <= O, Z = [v, D, F, N, A], ke = Z.every((ae) => ae.compliant), ie = c <= 8e4, B = [];
  return v.compliant || B.push(`Steer axle overloaded: ${M.toLocaleString()} lbs exceeds ${v.maxLegalWeightLbs.toLocaleString()} lbs limit.`), D.compliant || B.push(`Drive tandem overloaded: ${p.toLocaleString()} lbs exceeds statutory 34,000 lbs limit.`), F.compliant || B.push(`Trailer tandem overloaded: ${b.toLocaleString()} lbs exceeds statutory 34,000 lbs limit.`), N.compliant || B.push(`Inner bridge group violation: ${_.toLocaleString()} lbs exceeds Bridge Formula B limit (${z.toLocaleString()} lbs for 4 axles at ${m}ft).`), (!A.compliant || !ie) && B.push(`Gross Vehicle Weight violation: ${c.toLocaleString()} lbs exceeds statutory 80,000 lbs federal cap.`), G || B.push(`California STAA Kingpin-to-Rear-Axle (KPRA) violation: ${J.toFixed(1)} ft exceeds 40.0 ft legal maximum.`), {
    overallGvwLbs: c,
    maxLegalGvwLbs: 8e4,
    gvwCompliant: ie,
    gvwMarginLbs: 8e4 - c,
    groups: Z,
    allCompliant: ke && ie && G,
    kpraFt: J,
    kpraCompliant: G,
    kpraMaxFt: O,
    reasons: B
  };
}
const xe = {
  wood_hardwood: { label: "Clean Hardwood Deck", mu: 0.4 },
  smooth_steel: { label: "Smooth Clean Steel", mu: 0.2 },
  diamond_plate_steel: { label: "Diamond Plate Steel", mu: 0.3 },
  anti_slip_rubber: { label: "High-Friction Rubber Mats (≥0.6μ)", mu: 0.6 }
}, lt = {
  strap_2in: { label: "2-inch Synthetic Web Strap", wllLbs: 3333, wllKg: 1512 },
  strap_4in: { label: "4-inch Heavy Winch Strap", wllLbs: 5400, wllKg: 2449 },
  chain_5_16_g70: { label: '5/16" Grade 70 Transport Chain', wllLbs: 4700, wllKg: 2132 },
  chain_3_8_g70: { label: '3/8" Grade 70 Transport Chain', wllLbs: 6600, wllKg: 2994 }
}, ct = 2.2046226218;
function dt(t, e, o) {
  const n = "wood_hardwood", l = "strap_2in", r = xe[n].mu, d = lt[l], i = /* @__PURE__ */ new Map();
  for (const y of e)
    i.set(y.unitId, y);
  const u = [], s = {
    strap_2in: 0,
    strap_4in: 0,
    chain_5_16_g70: 0,
    chain_3_8_g70: 0
  };
  let a = 0;
  for (const y of t) {
    const I = i.get(y.id), $ = y.weightKg ?? 100, M = $ * ct, p = (I ? I.dx : y.dims[0]) / 1e3, b = p * 3.28084, c = I ? I.x <= 50 : !1;
    c || a++;
    const x = M * 0.8, v = M * 0.5, h = M * 0.5, C = M * 0.2, S = M * r, D = M * 0.5, k = $ * 0.5;
    let E = 1;
    b <= 5 ? E = M > 1100 ? 2 : 1 : b <= 10 ? E = 2 : E = 2 + Math.ceil((b - 10) / 10), !c && E < 2 && (E = 2);
    const W = Math.ceil(D / d.wllLbs), F = Math.max(E, W);
    let _ = l;
    M >= 1e4 && !l.startsWith("chain") && (_ = "chain_3_8_g70"), s[_] = (s[_] ?? 0) + F;
    const T = [];
    c ? T.push("Resting against front bulkhead / forward block (0.8g deceleration supported).") : T.push("Uncontained forward motion; requires cross-strapping, chocking, or friction matting."), M >= 1e4 && T.push("Heavy cargo (≥10,000 lbs): Grade 70 transport chain direct tie-downs mandated under § 393.126."), u.push({
      unitId: y.id,
      label: y.label,
      weightKg: $,
      weightLbs: Math.round(M),
      lengthM: p,
      lengthFt: b,
      blockedForward: c,
      minTieDownsCount: F,
      requiredAggregateWllLbs: Math.round(D),
      requiredAggregateWllKg: Math.round(k),
      recommendedHardware: _,
      hardwareCount: F,
      forwardRestraintRequiredLbs: Math.round(x),
      rearRestraintRequiredLbs: Math.round(v),
      lateralRestraintRequiredLbs: Math.round(h),
      verticalRestraintRequiredLbs: Math.round(C),
      frictionRestraintLbs: Math.round(S),
      notes: T
    });
  }
  const m = u.reduce((y, I) => y + I.hardwareCount, 0), g = u.reduce((y, I) => y + I.requiredAggregateWllLbs, 0), f = u.reduce((y, I) => y + I.requiredAggregateWllKg, 0), L = [
    `Deck Friction Rating: ${xe[n].label} (μ=${r}).`,
    `Total Required Restraint Hardware: ${m} tie-downs across ${u.length} cargo articles.`,
    `Total Minimum Working Load Limit: ${g.toLocaleString()} lbs (${Math.round(f).toLocaleString()} kg).`
  ];
  return a > 0 && L.push(
    `${a} cargo unit(s) are not flush against the front bulkhead. Install forward dunnage, friction mats, or x-brace ratchet straps to counteract 0.8g forward emergency braking forces.`
  ), {
    deckMaterial: n,
    deckFrictionMu: r,
    articles: u,
    totalTieDownsCount: m,
    totalRequiredWllLbs: g,
    totalRequiredWllKg: f,
    summaryHardware: s,
    unblockedForwardCount: a,
    recommendations: L
  };
}
function ut() {
  const t = new Float32Array([
    // 0..7 cube vertices [x, y, z] in [0..1]
    0,
    0,
    0,
    1,
    0,
    0,
    1,
    1,
    0,
    0,
    1,
    0,
    0,
    0,
    1,
    1,
    0,
    1,
    1,
    1,
    1,
    0,
    1,
    1
  ]), e = new Uint16Array([
    // Front face (z=1)
    4,
    5,
    6,
    4,
    6,
    7,
    // Back face (z=0)
    1,
    0,
    3,
    1,
    3,
    2,
    // Top face (y=1)
    3,
    2,
    6,
    3,
    6,
    7,
    // Bottom face (y=0)
    0,
    1,
    5,
    0,
    5,
    4,
    // Right face (x=1)
    1,
    2,
    6,
    1,
    6,
    5,
    // Left face (x=0)
    0,
    4,
    7,
    0,
    7,
    3
  ]), o = t.byteLength + e.byteLength, n = new Uint8Array(o);
  n.set(new Uint8Array(t.buffer), 0), n.set(new Uint8Array(e.buffer), t.byteLength);
  let l = "";
  for (let i = 0; i < n.length; i++)
    l += String.fromCharCode(n[i]);
  const r = typeof globalThis.Buffer < "u";
  return { bufferBase64: typeof btoa < "u" ? btoa(l) : r ? globalThis.Buffer.from(n).toString("base64") : "", byteLength: o };
}
function gt(t, e, o, n) {
  const { bufferBase64: l, byteLength: r } = ut(), d = /* @__PURE__ */ new Map();
  for (const y of o) d.set(y.id, y);
  const i = [
    { name: "TrailerBoundary", pbrMetallicRoughness: { baseColorFactor: [0.3, 0.4, 0.5, 0.25], metallicFactor: 0.1, roughnessFactor: 0.8 } },
    { name: "CargoBlue", pbrMetallicRoughness: { baseColorFactor: [0.18, 0.49, 0.86, 1], metallicFactor: 0.1, roughnessFactor: 0.6 } },
    { name: "CargoAmber", pbrMetallicRoughness: { baseColorFactor: [0.93, 0.6, 0, 1], metallicFactor: 0.1, roughnessFactor: 0.6 } },
    { name: "CargoEmerald", pbrMetallicRoughness: { baseColorFactor: [0.16, 0.65, 0.38, 1], metallicFactor: 0.1, roughnessFactor: 0.6 } },
    { name: "CargoViolet", pbrMetallicRoughness: { baseColorFactor: [0.55, 0.36, 0.86, 1], metallicFactor: 0.1, roughnessFactor: 0.6 } },
    { name: "CargoRose", pbrMetallicRoughness: { baseColorFactor: [0.88, 0.24, 0.44, 1], metallicFactor: 0.1, roughnessFactor: 0.6 } }
  ], u = [], s = [], a = t.L / 1e3, m = t.W / 1e3, g = t.H / 1e3;
  u.push({
    name: `Equipment: ${t.id}`,
    mesh: 0,
    translation: [0, 0, 0],
    scale: [a, g, m]
    // glTF is Y-up: [X-len, Y-height, Z-width]
  }), s.push(0), e.forEach((y, I) => {
    const $ = d.get(y.unitId), M = y.stop ?? $?.stop ?? 1, p = 1 + (M - 1) % (i.length - 1), b = y.x / 1e3, c = y.z / 1e3, x = y.y / 1e3, v = y.dx / 1e3, h = y.dz / 1e3, C = y.dy / 1e3, S = u.length;
    u.push({
      name: `Cargo_${I + 1}: ${$?.label ?? y.unitId} (Stop ${M})`,
      mesh: 1 + (p - 1),
      translation: [b, c, x],
      scale: [v, h, C]
    }), s.push(S);
  });
  const f = [];
  i.forEach((y, I) => {
    f.push({
      primitives: [
        {
          attributes: { POSITION: 0 },
          indices: 1,
          material: I
        }
      ]
    });
  });
  const L = {
    asset: {
      version: "2.0",
      generator: "CargoFit Product 01 glTF 2.0 Exporter"
    },
    scene: 0,
    scenes: [
      {
        name: "Cargo Fit Loading Plan",
        nodes: s
      }
    ],
    nodes: u,
    meshes: f,
    materials: i,
    accessors: [
      {
        // Accessor 0: Positions (8 vertices)
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126,
        // FLOAT
        count: 8,
        type: "VEC3",
        max: [1, 1, 1],
        min: [0, 0, 0]
      },
      {
        // Accessor 1: Indices (36 indices)
        bufferView: 1,
        byteOffset: 0,
        componentType: 5123,
        // UNSIGNED_SHORT
        count: 36,
        type: "SCALAR",
        max: [7],
        min: [0]
      }
    ],
    bufferViews: [
      {
        // BufferView 0: Vertex positions (96 bytes)
        buffer: 0,
        byteOffset: 0,
        byteLength: 96,
        target: 34962
        // ARRAY_BUFFER
      },
      {
        // BufferView 1: Indices (72 bytes)
        buffer: 0,
        byteOffset: 96,
        byteLength: 72,
        target: 34963
        // ELEMENT_ARRAY_BUFFER
      }
    ],
    buffers: [
      {
        uri: `data:application/octet-stream;base64,${l}`,
        byteLength: r
      }
    ]
  };
  return JSON.stringify(L, null, 2);
}
function mt(t) {
  const e = {};
  for (let o = 2; o < t.length; o++) {
    const n = t[o];
    n === "solve" || n === "help" || n === "version" ? e.command = n : n === "--manifest" || n === "-m" ? e.manifestPath = t[++o] : n === "--equipment" || n === "-e" ? e.equipmentId = t[++o] : n === "--out" || n === "-o" ? e.outputPath = t[++o] : n === "--gltf" ? e.gltfPath = t[++o] : n === "--report" && (e.reportPath = t[++o]);
  }
  return e;
}
function $e(t) {
  const e = mt(t);
  if (!e.command || e.command === "help")
    return console.log(`
CargoFit Product 01 — Explainable Cargo Fit & Load Planning CLI

Usage:
  cargofit solve --manifest <path.csv> [--equipment <id>] [--out <plan.json>] [--gltf <model.gltf>]

Options:
  --manifest, -m   Path to CSV or manifest file
  --equipment, -e  Equipment preset ID (default: 53ft-trailer)
  --out, -o        Output path for JSON plan result
  --gltf           Output path for Khronos glTF 2.0 3D scene
  --report         Output path for standalone HTML report
`), 0;
  if (e.command === "version")
    return console.log("cargofit v0.1.0 (Product 01 Cargo Fit & Load Planning)"), 0;
  if (e.command === "solve") {
    if (!e.manifestPath)
      return console.error("Error: --manifest argument is required."), 1;
    const o = Ae(re(e.manifestPath), "utf-8"), n = He(o), l = n.issues.filter((m) => m.severity === "error");
    if (l.length > 0) {
      console.error("Manifest parsing errors:");
      for (const m of l) console.error(`  - Line ${m.line}: ${m.message}`);
      return 1;
    }
    const r = Ie(n.rows);
    console.log(`Loaded manifest: ${n.rows.length} row(s), ${r.length} total piece(s).`);
    const d = {
      id: e.equipmentId || "53ft-trailer",
      name: "53ft Dry Van Trailer",
      source: "preset",
      length: 16150,
      width: 2480,
      height: 2790,
      unit: "m",
      payload: 20400,
      massUnit: "kg",
      doorWidth: 2430,
      doorHeight: 2740,
      included: !0,
      cost: 1850,
      currency: "USD",
      costSource: "user"
    }, i = ve(d);
    if (!i)
      return console.error("Error: Equipment profile normalization failed."), 1;
    const u = {
      rows: n.rows,
      equipment: [d],
      settings: nt
    };
    console.log(`Solving packing plan for ${i.name} (${i.L}×${i.W}×${i.H} mm)...`);
    const { results: s } = it(u), a = s[0];
    if (console.log(`Status: ${a.status}`), console.log(`Placed: ${a.metrics.placedUnits} of ${a.metrics.totalUnits} pieces`), console.log(`Volume Utilization: ${a.metrics.occupiedVolumePct.toFixed(1)}%`), console.log(`Loaded Weight: ${a.metrics.loadedWeightKg.toLocaleString()} kg`), a.arrangements.length > 0) {
      const m = a.arrangements[0], g = rt({
        equipmentLengthMm: i.L,
        cargoWeightKg: a.metrics.loadedWeightKg,
        cargoCogXMm: a.metrics.cogX ?? i.L / 2
      });
      console.log(`Bridge Formula B Compliant: ${g.allCompliant ? "YES" : "NO"}`), console.log(`Overall GVW: ${g.overallGvwLbs.toLocaleString()} lbs (Legal Max: ${g.maxLegalGvwLbs.toLocaleString()} lbs)`);
      const f = dt(r, m.placements);
      if (console.log(`Required Tie-Downs: ${f.totalTieDownsCount} straps/chains (Min WLL: ${f.totalRequiredWllLbs.toLocaleString()} lbs)`), e.outputPath) {
        const L = {
          result: a,
          bridge: g,
          securement: f
        };
        ue(re(e.outputPath), JSON.stringify(L, null, 2), "utf-8"), console.log(`Saved plan JSON to ${e.outputPath}`);
      }
      if (e.gltfPath) {
        const L = gt(i, m.placements, r);
        ue(re(e.gltfPath), L, "utf-8"), console.log(`Saved 3D CAD glTF to ${e.gltfPath}`);
      }
    }
    return 0;
  }
  return 0;
}
if (typeof process < "u" && process.argv && process.argv[1]?.includes("cargofit")) {
  const t = $e(process.argv);
  t !== 0 && process.exit(t);
}
$e(process.argv);
export {
  mt as parseArgs,
  $e as runCli
};
