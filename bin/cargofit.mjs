#!/usr/bin/env node
import { readFileSync as Fe, writeFileSync as ue } from "node:fs";
import { resolve as re } from "node:path";
const Ae = { mm: 1, cm: 10, m: 1e3, in: 25.4, ft: 304.8 }, Pe = { kg: 1, lb: 0.45359237, t: 1e3 }, Ue = (t) => Math.round(t * 100) / 100, W = (t, e) => Ue(t * Ae[e]), xe = (t, e) => Math.round(t * Pe[e] * 1e4) / 1e4;
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
let Ne = 0;
const Te = (t = "r") => `${t}${Date.now().toString(36)}${(Ne++).toString(36)}`;
function We(t) {
  const e = t.split(/\r?\n/).find((o) => o.trim()) ?? "", n = [",", ";", "	"].map((o) => [o, e.split(o).length - 1]);
  return n.sort((o, a) => a[1] - o[1]), n[0][1] > 0 ? n[0][0] : ",";
}
function Oe(t, e) {
  const n = [];
  let o = [], a = "", u = !1;
  const s = t.replace(/^\uFEFF/, "");
  for (let r = 0; r < s.length; r++) {
    const d = s[r];
    u ? d === '"' ? s[r + 1] === '"' ? (a += '"', r++) : u = !1 : a += d : d === '"' ? u = !0 : d === e ? (o.push(a), a = "") : d === `
` || d === "\r" ? (d === "\r" && s[r + 1] === `
` && r++, o.push(a), a = "", o.some((i) => i.trim() !== "") && n.push(o), o = []) : a += d;
  }
  return o.push(a), o.some((r) => r.trim() !== "") && n.push(o), n;
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
function Re(t) {
  const e = t.trim();
  if (e === "") return null;
  const n = e.replace(/,(?=\d{3}(\D|$))/g, "").replace(",", "."), o = Number(n);
  return Number.isFinite(o) ? o : "bad";
}
function Ke(t, e = ",") {
  const n = [];
  if (t.length === 0)
    return { rows: [], issues: [{ line: 0, field: "file", severity: "error", message: "File is empty." }], delimiter: e, totalLines: 0 };
  const o = t[0], a = /* @__PURE__ */ new Map();
  let u = null, s = null;
  o.forEach((i, l) => {
    const p = pe(i);
    for (const f of Object.keys(he))
      !a.has(f) && he[f].includes(p) && a.set(f, l);
    const g = /\(([^)]+)\)/.exec(i)?.[1];
    if (g) {
      const f = pe(i);
      ["length", "width", "height", "l", "w", "h"].includes(f) && (u ??= ge(g)), ["weight", "wt", "mass"].includes(f) && (s ??= me(g));
    }
  });
  for (const i of ["label", "length", "width", "height"])
    a.has(i) || n.push({ line: 1, field: i, severity: "error", message: `Required column "${i}" not found. Headers seen: ${o.join(", ")}` });
  if (n.some((i) => i.severity === "error")) return { rows: [], issues: n, delimiter: e, totalLines: t.length - 1 };
  a.has("qty") || n.push({ line: 1, field: "qty", severity: "info", message: "No quantity column — each row counted as 1." }), !a.has("unit") && !u && n.push({ line: 1, field: "unit", severity: "warning", message: "No dimension unit column — assuming millimetres. Check each row." }), a.has("weight") && !a.has("wunit") && !s && n.push({ line: 1, field: "weight", severity: "warning", message: "No weight unit column — assuming kilograms. Check each row." });
  const r = (i, l) => a.has(l) ? i[a.get(l)] ?? "" : "", d = [];
  for (let i = 1; i < t.length; i++) {
    const l = t[i], p = i + 1;
    l.length > o.length && l.slice(o.length).some((m) => m.trim()) && n.push({ line: p, field: "row", severity: "warning", message: `Row has ${l.length} cells but header has ${o.length}; extra cells ignored.` });
    const g = (m) => {
      const S = Re(r(l, m));
      return S === "bad" ? (n.push({ line: p, field: m, severity: "error", message: `Could not read "${r(l, m).trim()}" as a number — left empty for you to repair.` }), null) : S;
    };
    let f = u ?? "mm";
    const L = r(l, "unit").trim();
    if (L) {
      const m = ge(L);
      m ? f = m : n.push({ line: p, field: "unit", severity: "error", message: `Unknown dimension unit "${L}" — assumed ${f}; please confirm.` });
    }
    let x = s ?? "kg";
    const C = r(l, "wunit").trim();
    if (C) {
      const m = me(C);
      m ? x = m : n.push({ line: p, field: "wunit", severity: "error", message: `Unknown weight unit "${C}" — assumed ${x}; please confirm.` });
    }
    const k = a.has("qty") ? g("qty") : 1;
    let b = "upright";
    const h = r(l, "rotation").trim().toLowerCase();
    h ? ["any", "free", "all", "yes", "y", "true", "6"].includes(h) ? b = "any" : ["upright", "yaw", "tsu", "this side up", "flat", "2"].includes(h) ? b = "upright" : ["fixed", "none", "no", "n", "false", "1", "locked"].includes(h) ? b = "fixed" : n.push({ line: p, field: "rotation", severity: "warning", message: `Unknown rotation "${h}" — using upright (yaw only).` }) : a.has("rotation") && n.push({ line: p, field: "rotation", severity: "info", message: "Blank rotation — defaulted to upright (conservative)." });
    let y = !1;
    const c = r(l, "stackable").trim().toLowerCase();
    c ? ["yes", "y", "true", "1", "stackable"].includes(c) ? y = !0 : ["no", "n", "false", "0", "no-stack", "nostack", "fragile"].includes(c) ? y = !1 : n.push({ line: p, field: "stackable", severity: "warning", message: `Unknown stackable value "${c}" — treated as no-stack.` }) : a.has("stackable") && n.push({ line: p, field: "stackable", severity: "info", message: "Blank stackable — treated as no-stack (conservative)." });
    const I = a.has("stop") ? g("stop") : null, M = I !== null && I > 0 ? Math.round(I) : null;
    d.push({
      uid: Te(),
      label: r(l, "label").trim(),
      qty: k,
      length: g("length"),
      width: g("width"),
      height: g("height"),
      dimUnit: f,
      weight: a.has("weight") ? g("weight") : null,
      weightUnit: x,
      rotation: b,
      stackable: y,
      stop: M
    });
  }
  return { rows: d, issues: n, delimiter: e, totalLines: t.length - 1 };
}
function ze(t) {
  const e = We(t), n = Oe(t, e);
  return Ke(n, e);
}
const le = 5e3, K = (t) => t !== null && Number.isFinite(t) && t > 0;
function He(t) {
  const e = [], n = /* @__PURE__ */ new Map(), o = /* @__PURE__ */ new Set(), a = (s, r, d, i, l) => e.push({ severity: r, scope: "cargo", rowUid: s.uid, field: d, code: i, message: l });
  let u = 0;
  for (const s of t) {
    const r = s.label.trim();
    if (!r) a(s, "error", "label", "LABEL_MISSING", "Identifier is required.");
    else if (s.physicalUnitId === void 0) {
      const d = r.toLowerCase();
      n.has(d) ? a(s, "error", "label", "DUPLICATE_LABEL", `Duplicate identifier "${r}" — merge the rows or rename one.`) : n.set(d, s.uid);
    }
    if (s.physicalUnitId !== void 0 && (s.physicalUnitId.trim() ? o.has(s.physicalUnitId) && a(s, "error", "physicalUnitId", "DUPLICATE_PHYSICAL_ID", "Each registered physical unit must appear exactly once.") : a(s, "error", "physicalUnitId", "PHYSICAL_ID_MISSING", "A registered physical unit needs its original manifest identity."), o.add(s.physicalUnitId), s.qty !== 1 && a(s, "error", "qty", "PHYSICAL_QTY_INVALID", "A registered physical unit must have quantity 1. Register additional identities in the manifest workflow.")), s.qty === null || !Number.isInteger(s.qty) || s.qty < 1 ? a(s, "error", "qty", "QTY_INVALID", "Quantity must be a whole number ≥ 1.") : u += s.qty, ["length", "width", "height"].forEach((d) => {
      const i = s[d];
      i === null ? a(s, "error", d, "DIM_MISSING", `${d} is missing — never guessed. Enter or measure it.`) : (!Number.isFinite(i) || i <= 0) && a(s, "error", d, "DIM_NONPOSITIVE", `${d} must be > 0 (got ${i}).`);
    }), s.weight === null ? a(s, "warning", "weight", "WEIGHT_UNKNOWN", "Weight unknown — payload checks cannot be completed for this row.") : (!Number.isFinite(s.weight) || s.weight <= 0) && a(s, "error", "weight", "WEIGHT_NONPOSITIVE", `weight must be > 0 (got ${s.weight}); leave empty if unknown.`), K(s.length) && K(s.width) && K(s.height)) {
      const d = [W(s.length, s.dimUnit), W(s.width, s.dimUnit), W(s.height, s.dimUnit)];
      Math.max(...d) > 2e4 && a(s, "warning", "length", "DIM_IMPLAUSIBLE", `Longest side is ${Math.round(Math.max(...d))} mm — check the unit.`), Math.min(...d) < 5 && a(s, "warning", "length", "DIM_IMPLAUSIBLE", "Shortest side is under 5 mm — check the unit.");
    }
  }
  return t.length === 0 && e.push({ severity: "error", scope: "cargo", rowUid: "", field: "rows", code: "NO_CARGO", message: "Add at least one cargo row." }), u > le && e.push({ severity: "error", scope: "cargo", rowUid: "", field: "qty", code: "TOO_MANY_UNITS", message: `Total ${u} units exceeds the ${le} unit limit.` }), e;
}
function Be(t) {
  const e = [];
  for (const n of t) {
    const o = (a, u, s, r) => e.push({ severity: a, scope: "equipment", rowUid: n.id, field: u, code: s, message: r });
    ["length", "width", "height"].forEach((a) => {
      K(n[a]) || o("error", a, "DIM_INVALID", `Internal ${a} must be a number > 0.`);
    }), n.payload === null ? o("warning", "payload", "PAYLOAD_NOT_DECLARED", "No payload declared — weight limit is not modeled.") : n.payload <= 0 && o("error", "payload", "PAYLOAD_INVALID", "Payload must be > 0."), n.doorWidth === null || n.doorHeight === null ? o("warning", "door", "DOOR_NOT_DECLARED", "No door opening declared — door fit is not modeled.") : (n.doorWidth <= 0 || n.doorHeight <= 0) && o("error", "door", "DOOR_INVALID", "Door dimensions must be > 0."), n.cost !== null && n.cost < 0 && o("error", "cost", "COST_INVALID", "Cost cannot be negative.");
  }
  return e;
}
function Me(t) {
  const e = [];
  for (const n of t) {
    if (!K(n.length) || !K(n.width) || !K(n.height) || n.qty === null || n.qty < 1) continue;
    const o = [
      W(n.length, n.dimUnit),
      W(n.width, n.dimUnit),
      W(n.height, n.dimUnit)
    ], a = n.weight !== null && n.weight > 0 ? xe(n.weight, n.weightUnit) : null;
    for (let u = 1; u <= n.qty; u++)
      if (e.push({
        id: n.physicalUnitId ?? (n.qty === 1 ? n.label.trim() : `${n.label.trim()}#${u}`),
        ...n.barcode !== void 0 ? { barcode: n.barcode } : {},
        rowUid: n.uid,
        label: n.label.trim(),
        dims: o,
        weightKg: a,
        rotation: n.rotation,
        stackable: n.stackable,
        stop: n.stop ?? null
      }), e.length > le) return e;
  }
  return e;
}
function ve(t) {
  if (!K(t.length) || !K(t.width) || !K(t.height)) return null;
  const e = t.doorWidth !== null && t.doorHeight !== null && t.doorWidth > 0 && t.doorHeight > 0;
  return {
    id: t.id,
    name: t.name,
    L: W(t.length, t.unit),
    W: W(t.width, t.unit),
    H: W(t.height, t.unit),
    doorW: e ? W(t.doorWidth, t.unit) : null,
    doorH: e ? W(t.doorHeight, t.unit) : null,
    payloadKg: t.payload !== null && t.payload > 0 ? xe(t.payload, t.massUnit) : null
  };
}
const w = 0.01, fe = (t) => [...t].sort((e, n) => e - n), R = (t, e) => Math.abs(t - e) <= w;
function Ge(t, e, n, o) {
  const [a, u, s] = t.dims;
  if (t.rotation === "fixed") return R(e, a) && R(n, u) && R(o, s);
  if (t.rotation === "upright")
    return R(o, s) && (R(e, a) && R(n, u) || R(e, u) && R(n, a));
  const r = fe([a, u, s]), d = fe([e, n, o]);
  return r.every((i, l) => R(i, d[l]));
}
function Ve(t, e, n, o) {
  const a = [], u = new Map(t.map((i) => [i.id, i])), s = /* @__PURE__ */ new Set(), r = o.minSupportPct / 100;
  for (const i of n) {
    const l = u.get(i.unitId);
    if (!l) {
      a.push({ code: "UNKNOWN_UNIT", unitIds: [i.unitId], message: `Placement refers to unknown unit ${i.unitId}.` });
      continue;
    }
    s.has(i.unitId) && a.push({ code: "DUPLICATE_PLACEMENT", unitIds: [i.unitId], message: `${i.unitId} is placed more than once.` }), s.add(i.unitId), (i.x < -w || i.y < -w || i.z < -w || i.x + i.dx > e.L + w || i.y + i.dy > e.W + w || i.z + i.dz > e.H + w) && a.push({ code: "OUT_OF_BOUNDS", unitIds: [i.unitId], message: `${i.unitId} extends outside the ${e.name} interior.` }), Ge(l, i.dx, i.dy, i.dz) || a.push({ code: "ORIENTATION_NOT_ALLOWED", unitIds: [i.unitId], message: `${i.unitId} is in an orientation its rotation rule (${l.rotation}) does not allow.` }), e.doorW !== null && e.doorH !== null && (i.dy > e.doorW + w || i.dz > e.doorH + w) && a.push({ code: "DOOR_BLOCKED", unitIds: [i.unitId], message: `${i.unitId} cross-section ${Math.round(i.dy)}×${Math.round(i.dz)} mm exceeds the door opening ${Math.round(e.doorW)}×${Math.round(e.doorH)} mm in its placed orientation.` });
  }
  const d = n.filter((i) => u.has(i.unitId)).slice().sort((i, l) => i.x - l.x);
  for (let i = 0; i < d.length; i++) {
    const l = d[i];
    for (let p = i + 1; p < d.length; p++) {
      const g = d[p];
      if (g.x >= l.x + l.dx - w) break;
      g.y < l.y + l.dy - w && l.y < g.y + g.dy - w && g.z < l.z + l.dz - w && l.z < g.z + g.dz - w && a.push({ code: "OVERLAP", unitIds: [l.unitId, g.unitId], message: `${l.unitId} and ${g.unitId} occupy the same space.` });
    }
  }
  for (const i of d) {
    if (i.z <= w) continue;
    const l = i.dx * i.dy;
    let p = 0;
    for (const g of d) {
      if (g === i || !R(g.z + g.dz, i.z)) continue;
      const f = Math.min(i.x + i.dx, g.x + g.dx) - Math.max(i.x, g.x), L = Math.min(i.y + i.dy, g.y + g.dy) - Math.max(i.y, g.y);
      f > w && L > w && (p += f * L, u.get(g.unitId).stackable || a.push({ code: "ON_NO_STACK_ITEM", unitIds: [i.unitId, g.unitId], message: `${i.unitId} rests on no-stack item ${g.unitId}.` }));
    }
    p / l < r - 1e-6 && a.push({ code: "UNSUPPORTED", unitIds: [i.unitId], message: `${i.unitId} base is only ${(100 * p / l).toFixed(0)}% supported (minimum ${o.minSupportPct}%).` });
  }
  if (e.payloadKg !== null) {
    const i = n.reduce((l, p) => l + (u.get(p.unitId)?.weightKg ?? 0), 0);
    i > e.payloadKg + 1e-6 && a.push({ code: "PAYLOAD_EXCEEDED", unitIds: [], message: `Known loaded weight ${i.toFixed(1)} kg exceeds declared payload ${e.payloadKg.toFixed(1)} kg.` });
  }
  for (let i = 0; i < d.length; i++) {
    const l = d[i], p = u.get(l.unitId);
    if (!(!p || p.stop === null || p.stop === void 0))
      for (let g = 0; g < d.length; g++) {
        if (i === g) continue;
        const f = d[g], L = u.get(f.unitId);
        if (!(!L || L.stop === null || L.stop === void 0) && p.stop < L.stop && f.x >= l.x + l.dx - w) {
          const x = Math.min(l.y + l.dy, f.y + f.dy) - Math.max(l.y, f.y), C = Math.min(l.z + l.dz, f.z + f.dz) - Math.max(l.z, f.z);
          if (x > w && C > w) {
            a.push({
              code: "STOP_ACCESS_BLOCKED",
              unitIds: [l.unitId, f.unitId],
              message: `${l.unitId} (Stop ${p.stop}) is blocked from rear door egress by ${f.unitId} (Stop ${L.stop}) placed behind it.`
            });
            break;
          }
        }
      }
  }
  return a;
}
function Se(t) {
  const [e, n, o] = t.dims;
  let a;
  t.rotation === "fixed" ? a = [[e, n, o]] : t.rotation === "upright" ? a = [[e, n, o], [n, e, o]] : a = [[e, n, o], [n, e, o], [e, o, n], [o, e, n], [n, o, e], [o, n, e]];
  const u = /* @__PURE__ */ new Set();
  return a.filter((s) => {
    const r = s.join("|");
    return u.has(r) ? !1 : (u.add(r), !0);
  });
}
function Ce(t, e) {
  return Se(t).filter(([n, o, a]) => n <= e.L + w && o <= e.W + w && a <= e.H + w && (e.doorW === null || e.doorH === null || o <= e.doorW + w && a <= e.doorH + w));
}
function Xe(t) {
  let e = t >>> 0;
  return () => {
    e = e + 1831565813 >>> 0;
    let n = e;
    return n = Math.imul(n ^ n >>> 15, n | 1), n ^= n + Math.imul(n ^ n >>> 7, n | 61), ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}
const H = (t) => t.dims[0] * t.dims[1] * t.dims[2], Ye = [
  { name: "Volume ↓", key: (t) => [-H(t)] },
  { name: "Longest edge ↓", key: (t) => [-Math.max(...t.dims), -H(t)] },
  { name: "Footprint ↓", key: (t) => [-([...t.dims].sort((e, n) => n - e)[0] * [...t.dims].sort((e, n) => n - e)[1]), -H(t)] },
  { name: "Heavy first", key: (t) => [-(t.weightKg ?? 0), -H(t)] },
  { name: "Tallest first", key: (t) => [-t.dims[2], -H(t)] },
  { name: "No-stack first", key: (t) => [t.stackable ? 1 : 0, -H(t)] },
  { name: "Reverse drop (LIFO)", key: (t) => [-(t.stop ?? 0), -H(t)] },
  { name: "Input order", key: (t, e) => [e] }
];
function je(t, e, n, o, a, u) {
  const s = [], d = /* @__PURE__ */ new Map(), i = [];
  let l = 0;
  const p = (c, I) => c * 100003 + I, g = (c) => {
    const I = s[c];
    for (let M = Math.floor(I.x / 250); M <= Math.floor((I.x + I.dx - w) / 250); M++)
      for (let m = Math.floor(I.y / 250); m <= Math.floor((I.y + I.dy - w) / 250); m++) {
        const S = p(M, m), v = d.get(S);
        v ? v.push(c) : d.set(S, [c]);
      }
  }, f = (c, I, M, m) => {
    l++;
    const S = [];
    for (let v = Math.floor(c / 250); v <= Math.floor((c + M - w) / 250); v++)
      for (let F = Math.floor(I / 250); F <= Math.floor((I + m - w) / 250); F++) {
        const E = d.get(p(v, F));
        if (E)
          for (const $ of E) i[$] !== l && (i[$] = l, S.push($));
      }
    return S;
  }, L = [[0, 0]], x = /* @__PURE__ */ new Set(["0|0"]), C = [], k = [];
  let b = 0, h = "";
  const y = (c, I) => {
    if (c > e.L + w || I > e.W + w) return;
    const M = `${Math.round(c * 100)}|${Math.round(I * 100)}`;
    if (x.has(M)) return;
    x.add(M);
    let m = 0, S = L.length;
    for (; m < S; ) {
      const v = m + S >> 1;
      L[v][0] < c || L[v][0] === c && L[v][1] < I ? m = v + 1 : S = v;
    }
    L.splice(m, 0, [c, I]);
  };
  for (const c of t) {
    if (u() || Date.now() > a) {
      k.push(c.id);
      continue;
    }
    if (e.payloadKg !== null && c.weightKg !== null && b + c.weightKg > e.payloadKg + 1e-6) {
      k.push(c.id);
      continue;
    }
    const I = `${c.dims.join("x")}|${c.rotation}|${c.stackable}`;
    if (I === h) {
      k.push(c.id);
      continue;
    }
    const M = Ce(c, e);
    let m = null;
    for (const [E, $] of L) {
      if (m && E > m.x + w && (n === "front-first" || m.z <= w)) break;
      for (const P of M) {
        const [U, _, O] = P;
        if (E + U > e.L + w || $ + _ > e.W + w) continue;
        const N = f(E, $, U, _);
        let D = 0;
        for (const z of N) {
          const A = s[z];
          E < A.x + A.dx - w && A.x < E + U - w && $ < A.y + A.dy - w && A.y < $ + _ - w && A.top > D && (D = A.top);
        }
        if (D + O > e.H + w) continue;
        if (D > w) {
          let z = 0, A = !0;
          for (const J of N) {
            const T = s[J];
            if (Math.abs(T.top - D) > w) continue;
            const G = Math.min(E + U, T.x + T.dx) - Math.max(E, T.x), Q = Math.min($ + _, T.y + T.dy) - Math.max($, T.y);
            if (G > w && Q > w) {
              if (!T.stackable) {
                A = !1;
                break;
              }
              z += G * Q;
            }
          }
          if (!A || z / (U * _) < o - 1e-6) continue;
        }
        const q = n === "front-first" ? [E, D, $, O] : [D, E, $, O];
        (!m || ke(q, m.score) < 0) && (m = { score: q, x: E, y: $, z: D, d: P });
      }
    }
    if (!m) {
      k.push(c.id), h = I;
      continue;
    }
    h = "";
    const [S, v, F] = m.d;
    s.push({ x: m.x, y: m.y, z: m.z, dx: S, dy: v, dz: F, top: m.z + F, stackable: c.stackable }), g(s.length - 1), C.push({ unitId: c.id, rowUid: c.rowUid, label: c.label, x: m.x, y: m.y, z: m.z, dx: S, dy: v, dz: F, order: C.length + 1, stop: c.stop ?? null }), c.weightKg !== null && (b += c.weightKg), y(m.x + S, m.y), y(m.x, m.y + v), y(m.x, m.y), y(m.x + S, 0), y(0, m.y + v);
  }
  return { placements: C, unplacedIds: k };
}
function ke(t, e) {
  for (let n = 0; n < t.length; n++) if (t[n] !== e[n]) return t[n] - e[n];
  return 0;
}
const qe = (t) => t.map((e) => `${e.unitId}@${e.x},${e.y},${e.z},${e.dx},${e.dy},${e.dz}`).sort().join(";");
function Je(t, e, n, o = {}) {
  const a = o.shouldCancel ?? (() => !1), s = Date.now() + n.maxMs, r = n.minSupportPct / 100, d = Xe(n.seed), i = [];
  let l = 0, p = !1;
  const g = o.quick ? Math.min(2, n.maxAttempts) : n.maxAttempts, f = ["front-first", "floor-first"], L = (y, c, I) => {
    l++;
    const M = je(c, e, I, r, s, a);
    i.push({ name: `${y} · ${I === "front-first" ? "front-first" : "floor-first"}`, r: M }), M.unplacedIds.length === 0 && (p = !0);
  };
  e: for (const y of Ye) {
    const c = new Map(t.map((M, m) => [M.id, m])), I = [...t].sort((M, m) => ke(y.key(M, c.get(M.id)), y.key(m, c.get(m.id))) || c.get(M.id) - c.get(m.id));
    for (const M of f) {
      if (l >= g || a() || Date.now() > s) break e;
      L(y.name, I, M);
    }
  }
  let x = 0;
  for (; !p && l < g && !a() && Date.now() <= s; ) {
    const y = t.map((c) => ({ u: c, k: -H(c) * (0.6 + 0.8 * d()) }));
    y.sort((c, I) => c.k - I.k), L(`Seeded shuffle ${++x}`, y.map((c) => c.u), d() < 0.5 ? "front-first" : "floor-first");
  }
  const C = a() ? "cancelled" : p ? "all_placed" : Date.now() > s ? "time_cap" : "attempts_exhausted", k = (y) => y.reduce((c, I) => Math.max(c, I.x + I.dx), 0);
  i.sort((y, c) => y.r.unplacedIds.length - c.r.unplacedIds.length || k(y.r.placements) - k(c.r.placements));
  const b = /* @__PURE__ */ new Set(), h = [];
  for (const y of i) {
    const c = qe(y.r.placements);
    if (!b.has(c) && (b.add(c), h.push({ name: y.name, placements: y.r.placements, unplacedIds: y.r.unplacedIds }), h.length >= 3))
      break;
  }
  return { arrangements: h, attempts: l, stopReason: C };
}
const be = "ep-heuristic-1.0";
function ce(t, e, n) {
  const o = new Map(t.map((h) => [h.id, h]));
  let a = 0, u = 0, s = 0, r = 0, d = 0, i = 0;
  for (const h of n) {
    a += h.dx * h.dy * h.dz;
    const y = o.get(h.unitId)?.weightKg ?? 0;
    u += y, s += y * (h.x + h.dx / 2), r += y * (h.y + h.dy / 2), d += y * (h.z + h.dz / 2), i = Math.max(i, h.x + h.dx);
  }
  const l = new Set(n.map((h) => h.unitId)), p = t.filter((h) => h.weightKg === null).length, g = t.filter((h) => h.weightKg === null && l.has(h.id)).length, f = u > 0 && g === 0, L = f ? s / u : null, x = f ? r / u : null, C = f ? d / u : null, k = f && e.L > 0 ? 100 * s / u / e.L : null;
  let b = null;
  if (f && L !== null && e.L > 3e3) {
    const h = 0.08 * e.L, y = 0.8 * e.L, c = Math.max(1, y - h), I = Math.max(0, Math.min(1, (L - h) / c)), M = 1 - I, m = Math.round(u * I), S = Math.round(u * M * 0.2), v = Math.round(u * M * 0.8), F = 5443, E = 15422, $ = 15422, P = e.L / 304.8, U = Math.min(8e4, 500 * (1.25 * P + 96)), _ = Math.round(U * 0.45359237), O = u <= _ && v <= E && m <= $ && S <= F;
    b = {
      steerKg: S,
      driveKg: v,
      trailerKg: m,
      steerPct: Math.round(S / F * 100),
      drivePct: Math.round(v / E * 100),
      trailerPct: Math.round(m / $ * 100),
      bridgeFormulaCompliant: O,
      bridgeFormulaLimitKg: _
    };
  }
  return {
    totalUnits: t.length,
    placedUnits: n.length,
    occupiedVolumePct: 100 * a / (e.L * e.W * e.H),
    loadedWeightKg: u,
    unknownWeightUnits: p,
    payloadKg: e.payloadKg,
    payloadRemainingKg: e.payloadKg === null ? null : e.payloadKg - u,
    usedLengthMm: i,
    cogXPct: k,
    cogX: L,
    cogY: x,
    cogZ: C,
    axleEst: b
  };
}
function Qe(t, e, n) {
  const o = Array.from(new Set(t.map((r) => r.stop).filter((r) => typeof r == "number" && r > 0))).sort((r, d) => r - d);
  if (o.length < 2) return [];
  const a = [], u = new Map(t.map((r) => [r.id, r])), s = ce(t, e, n);
  a.push({
    stage: 0,
    stop: 0,
    label: "Depart Origin (Full Load)",
    remainingUnits: n.length,
    remainingWeightKg: s.loadedWeightKg,
    cogX: s.cogX ?? null,
    cogXPct: s.cogXPct ?? null,
    axleEst: s.axleEst ?? null,
    warning: null
  });
  for (let r = 0; r < o.length; r++) {
    const d = o[r], i = n.filter((g) => {
      const L = u.get(g.unitId)?.stop ?? g.stop ?? null;
      return L === null || L > d;
    }), l = ce(t, e, i);
    let p = null;
    l.axleEst && (l.axleEst.drivePct > 100 ? p = `Drive tandem overloaded (${l.axleEst.drivePct}% rating) after Stop ${d} drop.` : l.axleEst.steerPct > 100 ? p = `Steer axle overloaded (${l.axleEst.steerPct}% rating) after Stop ${d} drop.` : l.cogXPct !== null && l.cogXPct < 40 && (p = `Forward weight bias (CoG at ${Math.round(l.cogXPct)}% L) after rear cargo drop.`)), a.push({
      stage: r + 1,
      stop: d,
      label: r === o.length - 1 ? "Final Destination (Empty)" : `En route to Stop ${o[r + 1]} (Post-Stop ${d} Drop)`,
      remainingUnits: i.length,
      remainingWeightKg: l.loadedWeightKg,
      cogX: l.cogX ?? null,
      cogXPct: l.cogXPct ?? null,
      axleEst: l.axleEst ?? null,
      warning: p
    });
  }
  return a;
}
function we(t, e, n) {
  const o = (a, u, s) => ({
    id: a,
    label: u,
    note: s,
    state: n ? "verified" : "unknown"
  });
  return [
    o("bounds", "Inside interior dimensions", "Every box lies within L × W × H of the declared interior."),
    o("overlap", "No overlapping items", "Pairwise axis-aligned box test by an independent validator."),
    o("orientation", "Allowed orientations only", "Each item uses an orientation permitted by its rotation rule."),
    o("support", "Base support & no-stack", "Each raised item rests on surfaces at its exact base height, none marked no-stack."),
    t.payloadKg === null ? { id: "payload", label: "Declared payload", state: "not_declared", note: "No payload declared, so weight is not checked." } : e > 0 ? { id: "payload", label: "Declared payload", state: "unknown", note: `${e} unit(s) have unknown weight; total cannot be confirmed.` } : { id: "payload", label: "Declared payload", state: n ? "verified" : "unknown", note: "Sum of declared unit weights vs the declared payload figure." },
    t.doorW === null ? { id: "door", label: "Door opening", state: "not_declared", note: "No door opening declared, so door fit is not checked." } : { id: "door", label: "Door opening", state: n ? "verified" : "unknown", note: "Each item's cross-section in its placed orientation fits the declared opening. Interior path and handling equipment are NOT modeled." },
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
  unknownWeightUnits: t.filter((n) => n.weightKg === null).length,
  payloadKg: e?.payloadKg ?? null,
  payloadRemainingKg: e?.payloadKg ?? null,
  usedLengthMm: 0,
  cogXPct: null,
  cogX: null,
  cogY: null,
  cogZ: null,
  axleEst: null
});
function Ze(t, e) {
  const n = [], o = /* @__PURE__ */ new Map();
  for (const s of t) o.has(s.rowUid) || o.set(s.rowUid, s);
  for (const s of o.values()) {
    const [r, d, i] = s.dims, l = Le(s).some(([L, x, C]) => L <= e.L + w && x <= e.W + w && C <= e.H + w), p = Le(s).some((L) => et(L, e)), g = Ce(s, e).length > 0, f = `${Math.round(r)}×${Math.round(d)}×${Math.round(i)} mm`;
    g || (l ? p ? n.push({
      code: "ROTATION_FORBIDDEN_WOULD_FIT",
      severity: "error",
      labels: [s.label],
      message: `${s.label} (${f}) would fit if rotated further, but its rotation rule (${s.rotation}) forbids that orientation.`,
      action: "If the item may be tilted or laid on its side, relax the rotation rule — the plan will update."
    }) : n.push({
      code: "ITEM_EXCEEDS_DOOR",
      severity: "error",
      labels: [s.label],
      message: `${s.label} (${f}) fits inside but cannot pass the ${Math.round(e.doorW)}×${Math.round(e.doorH)} mm door opening in any orientation.`,
      action: "Use equipment with a larger opening, or split/tilt the item if it can be dismantled."
    }) : n.push({
      code: "ITEM_EXCEEDS_INTERIOR",
      severity: "error",
      labels: [s.label],
      message: `${s.label} (${f}) cannot fit inside ${Math.round(e.L)}×${Math.round(e.W)}×${Math.round(e.H)} mm in any orientation.`,
      action: "Choose larger equipment, or re-check the item dimensions."
    }));
  }
  const a = t.reduce((s, r) => s + (r.weightKg ?? 0), 0);
  e.payloadKg !== null && a > e.payloadKg + 1e-6 && n.push({
    code: "PAYLOAD_EXCEEDED",
    severity: "error",
    labels: [],
    message: `Declared weights total ${a.toFixed(0)} kg, above the declared payload of ${e.payloadKg.toFixed(0)} kg${t.some((s) => s.weightKg === null) ? " (and some weights are still unknown)" : ""}.`,
    action: "Split the shipment across vehicles or use equipment with higher declared payload."
  });
  const u = t.reduce((s, r) => s + r.dims[0] * r.dims[1] * r.dims[2], 0);
  return u > e.L * e.W * e.H + 1 && n.push({
    code: "VOLUME_EXCEEDED",
    severity: "error",
    labels: [],
    message: `Item bounding-box volume (${(u / 1e9).toFixed(2)} m³) exceeds interior volume (${(e.L * e.W * e.H / 1e9).toFixed(2)} m³).`,
    action: "Use larger equipment or reduce the shipment."
  }), n;
}
const Le = (t) => Se({ ...t, rotation: "any" }), et = (t, e) => t[0] <= e.L + w && t[1] <= e.W + w && t[2] <= e.H + w && (e.doorW === null || e.doorH === null || t[1] <= e.doorW + w && t[2] <= e.doorH + w);
function tt(t, e, n, o, a) {
  const u = Date.now(), s = {
    equipmentId: e?.id ?? "",
    equipmentName: n,
    arrangements: [],
    best: 0,
    violations: [],
    solver: { version: be, seed: o.seed, attempts: 0, budget: o.maxAttempts, stopReason: "no_solve", ms: 0 }
  };
  if (!e)
    return {
      ...s,
      status: "INCOMPLETE_INPUT",
      geometryFeasible: !1,
      metrics: ye(t, null),
      checks: [],
      reasons: [{ code: "PROFILE_INVALID", severity: "error", labels: [], message: "Equipment profile has missing or invalid internal dimensions.", action: "Enter positive internal length, width and height." }]
    };
  if (!a.cargoValid || t.length === 0)
    return {
      ...s,
      status: "INCOMPLETE_INPUT",
      geometryFeasible: !1,
      metrics: ye(t, e),
      checks: we(e, 0, !1),
      reasons: [{ code: "INPUT_INVALID", severity: "error", labels: [], message: "Cargo input has errors, so no plan was attempted.", action: "Open the Cargo step and repair the flagged cells." }]
    };
  const r = Ze(t, e), d = r.length > 0, i = Je(t, e, o, { quick: d, shouldCancel: a.shouldCancel }), l = [], p = [];
  for (const c of i.arrangements)
    Ve(t, e, c.placements, o).length === 0 ? l.push(c) : p.push(c.name);
  const g = l[0] ?? { placements: [], unplacedIds: t.map((c) => c.id) }, f = ce(t, e, g.placements), L = t.filter((c) => c.weightKg === null).length, x = g.unplacedIds.length === 0 && g.placements.length === t.length, C = new Set(g.placements.map((c) => c.unitId)), k = [...new Set(t.filter((c) => !C.has(c.id)).map((c) => c.label))];
  let b, h = i.stopReason;
  d ? (b = "PROVEN_INFEASIBLE_UNDER_MODELED_CONSTRAINTS", h = "proven_bound") : x ? L > 0 && e.payloadKg !== null ? (b = "INCOMPLETE_INPUT", r.push({
    code: "WEIGHT_UNKNOWN",
    severity: "warning",
    labels: [...new Set(t.filter((c) => c.weightKg === null).map((c) => c.label))],
    message: `Geometry fits, but ${L} unit(s) have unknown weight, so the payload check cannot be completed.`,
    action: "Enter or measure the missing weights."
  })) : e.payloadKg === null || e.doorW === null ? (b = "NEEDS_PHYSICAL_REVIEW", e.payloadKg === null && r.push({ code: "PAYLOAD_NOT_DECLARED", severity: "warning", labels: [], message: "Geometry fits, but no payload is declared for this equipment.", action: "Add the declared payload from the vehicle plate or carrier." }), e.doorW === null && r.push({ code: "DOOR_NOT_DECLARED", severity: "warning", labels: [], message: "Geometry fits, but no door opening is declared, so door fit was not checked.", action: "Add the door opening size." })) : b = "FEASIBLE_UNDER_MODELED_CONSTRAINTS" : (b = "NOT_FOUND_WITHIN_SEARCH_BUDGET", r.push({
    code: "UNPLACED_ITEMS",
    severity: "warning",
    labels: k,
    message: `${t.length - g.placements.length} of ${t.length} units were not placed by the heuristic.`,
    action: "This is NOT proof of impossibility. Raise the attempt budget, relax rules (rotation, stacking, support), or try other equipment."
  }), r.push({
    code: "SEARCH_BUDGET_EXHAUSTED",
    severity: "warning",
    labels: [],
    message: `Search stopped (${i.stopReason.replace("_", " ")}) after ${i.attempts} attempt(s) without a complete plan.`,
    action: "Increase attempts in Settings, or review the placed partial plan."
  })), p.length && r.push({ code: "UNPLACED_ITEMS", severity: "warning", labels: [], message: `Internal check discarded ${p.length} candidate arrangement(s) that failed independent validation.`, action: "Report this scenario — solver/validator disagreement." });
  const y = Qe(t, e, g.placements);
  return {
    ...s,
    status: b,
    geometryFeasible: x,
    reasons: r,
    arrangements: l,
    best: 0,
    metrics: f,
    violations: [],
    checks: we(e, L, l.length > 0),
    multiStopStages: y,
    solver: { version: be, seed: o.seed, attempts: i.attempts, budget: o.maxAttempts, stopReason: h, ms: Date.now() - u }
  };
}
const nt = { seed: 42, maxAttempts: 40, maxMs: 6e3, minSupportPct: 100 };
function ot(t) {
  const e = JSON.stringify({
    r: t.rows.map((o) => [o.uid, o.label, o.qty, o.length, o.width, o.height, o.dimUnit, o.weight, o.weightUnit, o.rotation, o.stackable, o.physicalUnitId, o.barcode, o.stop]),
    e: t.equipment.filter((o) => o.included).map((o) => [o.id, o.name, o.length, o.width, o.height, o.unit, o.doorWidth, o.doorHeight, o.payload, o.massUnit, o.cost, o.costSource]),
    s: [t.settings.seed, t.settings.maxAttempts, t.settings.maxMs, t.settings.minSupportPct]
  });
  let n = 2166136261;
  for (let o = 0; o < e.length; o++)
    n ^= e.charCodeAt(o), n = Math.imul(n, 16777619) >>> 0;
  return n.toString(16).padStart(8, "0");
}
function it(t, e = {}) {
  const n = [...He(t.rows), ...Be(t.equipment.filter((r) => r.included))], o = !n.some((r) => r.scope === "cargo" && r.severity === "error"), a = Me(t.rows), u = t.equipment.filter((r) => r.included), s = [];
  for (const r of u) {
    if (e.shouldCancel?.()) break;
    const d = tt(a, ve(r), r.name, t.settings, { cargoValid: o, shouldCancel: e.shouldCancel });
    d.equipmentId = r.id, s.push(d), e.onResult?.(d, s.length, u.length);
  }
  return { hash: ot(t), issues: n, units: a, results: s, cargoValid: o };
}
function ie(t, e) {
  if (e < 2) return 2e4;
  const n = 500 * (t * e / (e - 1) + 12 * e + 36);
  return Math.round(n / 500) * 500;
}
const st = 2.2046226218;
function at(t) {
  const e = t.cargoWeightKg * st, n = t.equipmentLengthMm / 1e3 * 3.28084, o = t.cargoCogXMm / 1e3 * 3.28084;
  if (!(n >= 40)) {
    const ae = t.tareSteerLbs ?? 8e3, $e = t.tareDriveLbs ?? 9e3, de = Math.max(0, Math.min(1, o / (n || 24))), _e = e * de, De = e * (1 - de), Z = Math.round(ae + De), ee = Math.round($e + _e), V = Z + ee, X = 2e4, Y = 2e4, j = 33e3, te = {
      id: "steer",
      name: "Steer Axle (1 axle)",
      axleCount: 1,
      spacingFt: 0,
      actualWeightLbs: Z,
      statutoryCapLbs: X,
      bridgeFormulaAllowedLbs: X,
      maxLegalWeightLbs: X,
      compliant: Z <= X,
      marginLbs: X - Z,
      utilizationPct: Math.round(Z / X * 100)
    }, ne = {
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
    }, oe = [];
    return te.compliant || oe.push(`Steer axle overloaded by ${Math.abs(te.marginLbs).toLocaleString()} lbs.`), ne.compliant || oe.push(`Drive axle overloaded by ${Math.abs(ne.marginLbs).toLocaleString()} lbs.`), V > j && oe.push(`Gross Vehicle Weight (${V.toLocaleString()} lbs) exceeds maximum allowable ${j.toLocaleString()} lbs.`), {
      overallGvwLbs: V,
      maxLegalGvwLbs: j,
      gvwCompliant: V <= j,
      gvwMarginLbs: j - V,
      groups: [te, ne],
      allCompliant: te.compliant && ne.compliant && V <= j,
      kpraFt: null,
      kpraCompliant: !0,
      kpraMaxFt: 40,
      reasons: oe
    };
  }
  const u = t.tareSteerLbs ?? 10500, s = t.tareDriveLbs ?? 14e3, r = t.tareTrailerLbs ?? 10500, d = (t.trailerWheelbaseIn ?? 456) / 12, i = 4.33, l = 4.08, p = 36, g = 51, f = Math.max(0, Math.min(d, o)), L = e * (f / d), x = e * ((d - f) / d), C = x * 0.95, k = x * 0.05, b = Math.round(u + k), h = Math.round(s + C), y = Math.round(r + L), c = b + h + y, M = {
    id: "steer",
    name: "Steering Axle (Single)",
    axleCount: 1,
    spacingFt: 0,
    actualWeightLbs: b,
    statutoryCapLbs: 12500,
    // Practical fleet tire rating limit
    bridgeFormulaAllowedLbs: 2e4,
    maxLegalWeightLbs: 12500,
    compliant: b <= 12500,
    marginLbs: 12500 - b,
    utilizationPct: Math.round(b / 12500 * 100)
  }, m = ie(i, 2), S = 34e3, v = Math.min(S, m), F = {
    id: "drive_tandem",
    name: "Tractor Drive Tandem (2 axles)",
    axleCount: 2,
    spacingFt: i,
    actualWeightLbs: h,
    statutoryCapLbs: S,
    bridgeFormulaAllowedLbs: m,
    maxLegalWeightLbs: v,
    compliant: h <= v,
    marginLbs: v - h,
    utilizationPct: Math.round(h / v * 100)
  }, E = ie(l, 2), $ = 34e3, P = Math.min($, E), U = {
    id: "trailer_tandem",
    name: "Trailer Tandem (2 axles)",
    axleCount: 2,
    spacingFt: l,
    actualWeightLbs: y,
    statutoryCapLbs: $,
    bridgeFormulaAllowedLbs: E,
    maxLegalWeightLbs: P,
    compliant: y <= P,
    marginLbs: P - y,
    utilizationPct: Math.round(y / P * 100)
  }, _ = h + y, O = ie(p, 4), N = Math.min(68e3, O), D = {
    id: "inner_bridge",
    name: "Inner Bridge (Drive to Trailer, 4 axles)",
    axleCount: 4,
    spacingFt: p,
    actualWeightLbs: _,
    statutoryCapLbs: 68e3,
    bridgeFormulaAllowedLbs: O,
    maxLegalWeightLbs: N,
    compliant: _ <= N,
    marginLbs: N - _,
    utilizationPct: Math.round(_ / N * 100)
  }, q = ie(g, 5), z = Math.min(8e4, q), A = {
    id: "outer_bridge",
    name: "Outer Bridge (Steer to Rear, 5 axles)",
    axleCount: 5,
    spacingFt: g,
    actualWeightLbs: c,
    statutoryCapLbs: 8e4,
    bridgeFormulaAllowedLbs: q,
    maxLegalWeightLbs: z,
    compliant: c <= z,
    marginLbs: z - c,
    utilizationPct: Math.round(c / z * 100)
  }, J = t.kpraIn ? t.kpraIn / 12 : 39.5, T = 40, G = J <= T, Q = [M, F, U, D, A], Ee = Q.every((ae) => ae.compliant), se = c <= 8e4, B = [];
  return M.compliant || B.push(`Steer axle overloaded: ${b.toLocaleString()} lbs exceeds ${M.maxLegalWeightLbs.toLocaleString()} lbs limit.`), F.compliant || B.push(`Drive tandem overloaded: ${h.toLocaleString()} lbs exceeds statutory 34,000 lbs limit.`), U.compliant || B.push(`Trailer tandem overloaded: ${y.toLocaleString()} lbs exceeds statutory 34,000 lbs limit.`), D.compliant || B.push(`Inner bridge group violation: ${_.toLocaleString()} lbs exceeds Bridge Formula B limit (${N.toLocaleString()} lbs for 4 axles at ${p}ft).`), (!A.compliant || !se) && B.push(`Gross Vehicle Weight violation: ${c.toLocaleString()} lbs exceeds statutory 80,000 lbs federal cap.`), G || B.push(`California STAA Kingpin-to-Rear-Axle (KPRA) violation: ${J.toFixed(1)} ft exceeds 40.0 ft legal maximum.`), {
    overallGvwLbs: c,
    maxLegalGvwLbs: 8e4,
    gvwCompliant: se,
    gvwMarginLbs: 8e4 - c,
    groups: Q,
    allCompliant: Ee && se && G,
    kpraFt: J,
    kpraCompliant: G,
    kpraMaxFt: T,
    reasons: B
  };
}
const Ie = {
  wood_hardwood: { label: "Clean Hardwood Deck", mu: 0.4 },
  smooth_steel: { label: "Smooth Clean Steel", mu: 0.2 },
  diamond_plate_steel: { label: "Diamond Plate Steel", mu: 0.3 },
  anti_slip_rubber: { label: "High-Friction Rubber Mats (≥0.6μ)", mu: 0.6 }
}, rt = {
  strap_2in: { label: "2-inch Synthetic Web Strap", wllLbs: 3333, wllKg: 1512 },
  strap_4in: { label: "4-inch Heavy Winch Strap", wllLbs: 5400, wllKg: 2449 },
  chain_5_16_g70: { label: '5/16" Grade 70 Transport Chain', wllLbs: 4700, wllKg: 2132 },
  chain_3_8_g70: { label: '3/8" Grade 70 Transport Chain', wllLbs: 6600, wllKg: 2994 }
}, lt = 2.2046226218;
function ct(t, e, n) {
  const o = "wood_hardwood", a = "strap_2in", u = Ie[o].mu, s = rt[a], r = /* @__PURE__ */ new Map();
  for (const b of e)
    r.set(b.unitId, b);
  const d = [], i = [], l = new Set(t.map((b) => b.id)), p = e.filter((b) => !l.has(b.unitId)).map((b) => b.unitId), g = {
    strap_2in: 0,
    strap_4in: 0,
    chain_5_16_g70: 0,
    chain_3_8_g70: 0
  };
  let f = 0;
  for (const b of t) {
    const h = r.get(b.id);
    if (!h) continue;
    if (b.weightKg === null || !Number.isFinite(b.weightKg) || b.weightKg <= 0) {
      i.push(b.id);
      continue;
    }
    const y = b.weightKg, c = y * lt, I = (h ? h.dx : b.dims[0]) / 1e3, M = I * 3.28084, m = h ? h.x <= 50 : !1;
    m || f++;
    const S = c * 0.8, v = c * 0.5, F = c * 0.5, E = c * 0.2, $ = c * u, P = c * 0.5, U = y * 0.5;
    let _ = 1;
    M <= 5 ? _ = c > 1100 ? 2 : 1 : M <= 10 ? _ = 2 : _ = 2 + Math.ceil((M - 10) / 10), !m && _ < 2 && (_ = 2);
    const O = Math.ceil(P / s.wllLbs), N = Math.max(_, O);
    g[a] = (g[a] ?? 0) + N;
    const D = [];
    m ? D.push("Model places the unit near the front bulkhead; actual blocking strength and restraint are not verified.") : D.push("Uncontained forward motion; requires cross-strapping, chocking, or friction matting."), c >= 1e4 && D.push("Heavy cargo (≥10,000 lbs): commodity-specific securement requirements may apply; verify the cargo type and actual hardware with qualified personnel."), d.push({
      unitId: b.id,
      label: b.label,
      weightKg: y,
      weightLbs: Math.round(c),
      lengthM: I,
      lengthFt: M,
      blockedForward: m,
      minTieDownsCount: N,
      requiredAggregateWllLbs: Math.round(P),
      requiredAggregateWllKg: Math.round(U),
      recommendedHardware: a,
      hardwareCount: N,
      forwardRestraintRequiredLbs: Math.round(S),
      rearRestraintRequiredLbs: Math.round(v),
      lateralRestraintRequiredLbs: Math.round(F),
      verticalRestraintRequiredLbs: Math.round(E),
      frictionRestraintLbs: Math.round($),
      notes: D
    });
  }
  const L = d.reduce((b, h) => b + h.hardwareCount, 0), x = d.reduce((b, h) => b + h.requiredAggregateWllLbs, 0), C = d.reduce((b, h) => b + h.requiredAggregateWllKg, 0), k = [
    `Deck Friction Rating: ${Ie[o].label} (μ=${u}).`,
    `Illustrative hardware count: ${L} tie-downs across ${d.length} modeled cargo articles.`,
    `Illustrative working load limit estimate: ${x.toLocaleString()} lbs (${Math.round(C).toLocaleString()} kg).`
  ];
  return f > 0 && k.push(
    `${f} cargo unit(s) are not flush against the front bulkhead in the model. Qualified personnel must assess actual blocking and restraint.`
  ), {
    complete: e.length > 0 && i.length === 0 && p.length === 0,
    unknownWeightUnitIds: i,
    unmatchedPlacementUnitIds: p,
    deckMaterial: o,
    deckFrictionMu: u,
    articles: d,
    totalTieDownsCount: L,
    totalRequiredWllLbs: x,
    totalRequiredWllKg: C,
    summaryHardware: g,
    unblockedForwardCount: f,
    recommendations: k
  };
}
function dt() {
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
  ]), n = t.byteLength + e.byteLength, o = new Uint8Array(n);
  o.set(new Uint8Array(t.buffer), 0), o.set(new Uint8Array(e.buffer), t.byteLength);
  let a = "";
  for (let r = 0; r < o.length; r++)
    a += String.fromCharCode(o[r]);
  const u = typeof globalThis.Buffer < "u";
  return { bufferBase64: typeof btoa < "u" ? btoa(a) : u ? globalThis.Buffer.from(o).toString("base64") : "", byteLength: n };
}
function ut(t, e, n, o) {
  const { bufferBase64: a, byteLength: u } = dt(), s = /* @__PURE__ */ new Map();
  for (const x of n) s.set(x.id, x);
  const r = [
    { name: "TrailerBoundary", pbrMetallicRoughness: { baseColorFactor: [0.3, 0.4, 0.5, 0.25], metallicFactor: 0.1, roughnessFactor: 0.8 } },
    { name: "CargoBlue", pbrMetallicRoughness: { baseColorFactor: [0.18, 0.49, 0.86, 1], metallicFactor: 0.1, roughnessFactor: 0.6 } },
    { name: "CargoAmber", pbrMetallicRoughness: { baseColorFactor: [0.93, 0.6, 0, 1], metallicFactor: 0.1, roughnessFactor: 0.6 } },
    { name: "CargoEmerald", pbrMetallicRoughness: { baseColorFactor: [0.16, 0.65, 0.38, 1], metallicFactor: 0.1, roughnessFactor: 0.6 } },
    { name: "CargoViolet", pbrMetallicRoughness: { baseColorFactor: [0.55, 0.36, 0.86, 1], metallicFactor: 0.1, roughnessFactor: 0.6 } },
    { name: "CargoRose", pbrMetallicRoughness: { baseColorFactor: [0.88, 0.24, 0.44, 1], metallicFactor: 0.1, roughnessFactor: 0.6 } }
  ], d = [], i = [], l = t.L / 1e3, p = t.W / 1e3, g = t.H / 1e3;
  d.push({
    name: `Equipment: ${t.id}`,
    mesh: 0,
    translation: [0, 0, 0],
    scale: [l, g, p]
    // glTF is Y-up: [X-len, Y-height, Z-width]
  }), i.push(0), e.forEach((x, C) => {
    const k = s.get(x.unitId), b = x.stop ?? k?.stop ?? 1, h = 1 + (b - 1) % (r.length - 1), y = x.x / 1e3, c = x.z / 1e3, I = x.y / 1e3, M = x.dx / 1e3, m = x.dz / 1e3, S = x.dy / 1e3, v = d.length;
    d.push({
      name: `Cargo_${C + 1}: ${k?.label ?? x.unitId} (Stop ${b})`,
      mesh: 1 + (h - 1),
      translation: [y, c, I],
      scale: [M, m, S]
    }), i.push(v);
  });
  const f = [];
  r.forEach((x, C) => {
    f.push({
      primitives: [
        {
          attributes: { POSITION: 0 },
          indices: 1,
          material: C
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
        nodes: i
      }
    ],
    nodes: d,
    meshes: f,
    materials: r,
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
        uri: `data:application/octet-stream;base64,${a}`,
        byteLength: u
      }
    ]
  };
  return JSON.stringify(L, null, 2);
}
function gt(t) {
  const e = {};
  for (let n = 2; n < t.length; n++) {
    const o = t[n];
    o === "solve" || o === "help" || o === "version" ? e.command = o : o === "--manifest" || o === "-m" ? e.manifestPath = t[++n] : o === "--equipment" || o === "-e" ? e.equipmentId = t[++n] : o === "--out" || o === "-o" ? e.outputPath = t[++n] : o === "--gltf" ? e.gltfPath = t[++n] : o === "--report" && (e.reportPath = t[++n]);
  }
  return e;
}
function mt(t) {
  const e = gt(t);
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
    const n = Fe(re(e.manifestPath), "utf-8"), o = ze(n), a = o.issues.filter((p) => p.severity === "error");
    if (a.length > 0) {
      console.error("Manifest parsing errors:");
      for (const p of a) console.error(`  - Line ${p.line}: ${p.message}`);
      return 1;
    }
    const u = Me(o.rows);
    console.log(`Loaded manifest: ${o.rows.length} row(s), ${u.length} total piece(s).`);
    const s = {
      id: e.equipmentId || "53ft-trailer",
      name: "53ft Dry Van Trailer",
      source: "preset",
      length: 16150,
      width: 2480,
      height: 2790,
      unit: "mm",
      payload: 20400,
      massUnit: "kg",
      doorWidth: 2430,
      doorHeight: 2740,
      included: !0,
      cost: 1850,
      currency: "USD",
      costSource: "user"
    }, r = ve(s);
    if (!r)
      return console.error("Error: Equipment profile normalization failed."), 1;
    const d = {
      rows: o.rows,
      equipment: [s],
      settings: nt
    };
    console.log(`Solving packing plan for ${r.name} (${r.L}×${r.W}×${r.H} mm)...`);
    const { results: i } = it(d), l = i[0];
    if (console.log(`Status: ${l.status}`), console.log(`Placed: ${l.metrics.placedUnits} of ${l.metrics.totalUnits} pieces`), console.log(`Volume Utilization: ${l.metrics.occupiedVolumePct.toFixed(1)}%`), console.log(`Loaded Weight: ${l.metrics.loadedWeightKg.toLocaleString()} kg`), l.arrangements.length > 0) {
      const p = l.arrangements[0], g = l.metrics.cogX == null ? null : at({
        equipmentLengthMm: r.L,
        cargoWeightKg: l.metrics.loadedWeightKg,
        cargoCogXMm: l.metrics.cogX
      });
      g ? (console.log(`Illustrative bridge estimate: ${g.allCompliant ? "within assumed benchmarks" : "assumed benchmark exceeded"}; actual axle and legal status unverified`), console.log(`Estimated GVW: ${g.overallGvwLbs.toLocaleString()} lbs (assumed benchmark: ${g.maxLegalGvwLbs.toLocaleString()} lbs)`)) : console.log("Illustrative bridge estimate unavailable: placed weight or center of gravity is unknown.");
      const f = ct(u, p.placements);
      if (console.log(f.complete ? `Illustrative restraint estimate: ${f.totalTieDownsCount} tie-downs (modeled WLL: ${f.totalRequiredWllLbs.toLocaleString()} lbs); actual securement unverified` : "Illustrative restraint estimate unavailable: placed units or weights are missing or unknown."), e.outputPath) {
        const L = {
          result: l,
          bridge: g,
          securement: f
        };
        ue(re(e.outputPath), JSON.stringify(L, null, 2), "utf-8"), console.log(`Saved plan JSON to ${e.outputPath}`);
      }
      if (e.gltfPath) {
        const L = ut(r, p.placements, u);
        ue(re(e.gltfPath), L, "utf-8"), console.log(`Saved 3D CAD glTF to ${e.gltfPath}`);
      }
    }
    return 0;
  }
  return 0;
}
process.exitCode = mt(process.argv);
export {
  gt as parseArgs,
  mt as runCli
};
