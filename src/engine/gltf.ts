/**
 * glTF 2.0 Standard 3D CAD/Scene Export Engine.
 * Converts 3D cargo arrangements into Khronos glTF 2.0 specifications
 * for direct ingestion into Blender, Three.js, Unity, or digital twin viewers.
 */

import type { NormalizedEquipment, Placement, Unit } from './types';

export interface GltfExportOptions {
  includeEquipmentWireframe?: boolean;
  colorScheme?: 'stop' | 'item' | 'density';
}

/**
 * Builds a unit cube [0..1, 0..1, 0..1] with standard 8 vertices and 36 indices (12 triangles).
 */
function createUnitCubeBuffer(): {
  bufferBase64: string;
  byteLength: number;
} {
  // 24 vertices (4 per face for flat normals)
  // Position (Float32, 3 floats = 12 bytes), Normal (Float32, 3 floats = 12 bytes)
  // Total 24 bytes per vertex * 24 vertices = 576 bytes
  // Indices: 36 * Uint16 (2 bytes) = 72 bytes. Total ~648 bytes.
  // To keep glTF compact and fully compliant, we create a standard 8-vertex position-only indexed cube.
  // 8 vertices * 3 floats * 4 bytes = 96 bytes.
  // 36 indices * 2 bytes (UNSIGNED_SHORT) = 72 bytes.
  // Total buffer length = 168 bytes.

  const vertices = new Float32Array([
    // 0..7 cube vertices [x, y, z] in [0..1]
    0, 0, 0,
    1, 0, 0,
    1, 1, 0,
    0, 1, 0,
    0, 0, 1,
    1, 0, 1,
    1, 1, 1,
    0, 1, 1,
  ]);

  const indices = new Uint16Array([
    // Front face (z=1)
    4, 5, 6, 4, 6, 7,
    // Back face (z=0)
    1, 0, 3, 1, 3, 2,
    // Top face (y=1)
    3, 2, 6, 3, 6, 7,
    // Bottom face (y=0)
    0, 1, 5, 0, 5, 4,
    // Right face (x=1)
    1, 2, 6, 1, 6, 5,
    // Left face (x=0)
    0, 4, 7, 0, 7, 3,
  ]);

  const totalBytes = vertices.byteLength + indices.byteLength;
  const combined = new Uint8Array(totalBytes);
  combined.set(new Uint8Array(vertices.buffer), 0);
  combined.set(new Uint8Array(indices.buffer), vertices.byteLength);

  // Convert to Base64 in standard JS/TS (browser & node compatible)
  let binary = '';
  for (let i = 0; i < combined.length; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  const hasBuffer = typeof (globalThis as unknown as { Buffer?: { from: (a: Uint8Array) => { toString: (e: string) => string } } }).Buffer !== 'undefined';
  const bufferBase64 = typeof btoa !== 'undefined'
    ? btoa(binary)
    : hasBuffer
    ? (globalThis as unknown as { Buffer: { from: (a: Uint8Array) => { toString: (e: string) => string } } }).Buffer.from(combined).toString('base64')
    : '';

  return { bufferBase64, byteLength: totalBytes };
}

/**
 * Generates a standard Khronos glTF 2.0 JSON string.
 */
export function exportToGltf(
  equipment: NormalizedEquipment,
  placements: Placement[],
  units: Unit[],
  _options?: GltfExportOptions
): string {
  const { bufferBase64, byteLength } = createUnitCubeBuffer();
  const unitMap = new Map<string, Unit>();
  for (const u of units) unitMap.set(u.id, u);

  // glTF materials palette
  const materials = [
    { name: 'TrailerBoundary', pbrMetallicRoughness: { baseColorFactor: [0.3, 0.4, 0.5, 0.25], metallicFactor: 0.1, roughnessFactor: 0.8 } },
    { name: 'CargoBlue', pbrMetallicRoughness: { baseColorFactor: [0.18, 0.49, 0.86, 1.0], metallicFactor: 0.1, roughnessFactor: 0.6 } },
    { name: 'CargoAmber', pbrMetallicRoughness: { baseColorFactor: [0.93, 0.60, 0.0, 1.0], metallicFactor: 0.1, roughnessFactor: 0.6 } },
    { name: 'CargoEmerald', pbrMetallicRoughness: { baseColorFactor: [0.16, 0.65, 0.38, 1.0], metallicFactor: 0.1, roughnessFactor: 0.6 } },
    { name: 'CargoViolet', pbrMetallicRoughness: { baseColorFactor: [0.55, 0.36, 0.86, 1.0], metallicFactor: 0.1, roughnessFactor: 0.6 } },
    { name: 'CargoRose', pbrMetallicRoughness: { baseColorFactor: [0.88, 0.24, 0.44, 1.0], metallicFactor: 0.1, roughnessFactor: 0.6 } },
  ];

  // glTF scenes and nodes
  const nodes: any[] = [];
  const sceneNodes: number[] = [];

  // Node 0: Equipment Enclosure (Interior Dimensions in meters)
  const equipLenM = equipment.L / 1000;
  const equipWidM = equipment.W / 1000;
  const equipHgtM = equipment.H / 1000;

  nodes.push({
    name: `Equipment: ${equipment.id}`,
    mesh: 0,
    translation: [0, 0, 0],
    scale: [equipLenM, equipHgtM, equipWidM], // glTF is Y-up: [X-len, Y-height, Z-width]
  });
  sceneNodes.push(0);

  // Nodes 1..N: Cargo items
  placements.forEach((pl, idx) => {
    const u = unitMap.get(pl.unitId);
    const stop = pl.stop ?? u?.stop ?? 1;
    const matIdx = 1 + ((stop - 1) % (materials.length - 1));

    // Convert mm to meters; glTF coordinate frame (X = length, Y = height, Z = width)
    const tx = pl.x / 1000;
    const ty = pl.z / 1000; // z in our engine is elevation (height)
    const tz = pl.y / 1000; // y in our engine is lateral (width)

    const sx = pl.dx / 1000;
    const sy = pl.dz / 1000;
    const sz = pl.dy / 1000;

    const nodeIdx = nodes.length;
    nodes.push({
      name: `Cargo_${idx + 1}: ${u?.label ?? pl.unitId} (Stop ${stop})`,
      mesh: 1 + (matIdx - 1),
      translation: [tx, ty, tz],
      scale: [sx, sy, sz],
    });
    sceneNodes.push(nodeIdx);
  });

  // glTF Meshes
  // Mesh 0 uses material 0 (boundary); Mesh 1..5 use material 1..5
  const meshes: any[] = [];
  materials.forEach((_, matIdx) => {
    meshes.push({
      primitives: [
        {
          attributes: { POSITION: 0 },
          indices: 1,
          material: matIdx,
        },
      ],
    });
  });

  const gltfDoc = {
    asset: {
      version: '2.0',
      generator: 'CargoFit Product 01 glTF 2.0 Exporter',
    },
    scene: 0,
    scenes: [
      {
        name: 'Cargo Fit Loading Plan',
        nodes: sceneNodes,
      },
    ],
    nodes,
    meshes,
    materials,
    accessors: [
      {
        // Accessor 0: Positions (8 vertices)
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: 8,
        type: 'VEC3',
        max: [1, 1, 1],
        min: [0, 0, 0],
      },
      {
        // Accessor 1: Indices (36 indices)
        bufferView: 1,
        byteOffset: 0,
        componentType: 5123, // UNSIGNED_SHORT
        count: 36,
        type: 'SCALAR',
        max: [7],
        min: [0],
      },
    ],
    bufferViews: [
      {
        // BufferView 0: Vertex positions (96 bytes)
        buffer: 0,
        byteOffset: 0,
        byteLength: 96,
        target: 34962, // ARRAY_BUFFER
      },
      {
        // BufferView 1: Indices (72 bytes)
        buffer: 0,
        byteOffset: 96,
        byteLength: 72,
        target: 34963, // ELEMENT_ARRAY_BUFFER
      },
    ],
    buffers: [
      {
        uri: `data:application/octet-stream;base64,${bufferBase64}`,
        byteLength,
      },
    ],
  };

  return JSON.stringify(gltfDoc, null, 2);
}
