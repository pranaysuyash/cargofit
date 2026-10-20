/**
 * Zero-dependency, standards-based XLSX parser using browser-native
 * DecompressionStream('deflate-raw') and pure TypeScript.
 * Parses multi-sheet Excel workbooks into tabular string grids.
 */

export interface XlsxSheet {
  name: string;
  data: string[][];
}

export interface XlsxWorkbook {
  sheets: XlsxSheet[];
}

function unescapeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function colNameToIndex(name: string): number {
  let col = 0;
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      col = col * 26 + (code - 64);
    } else if (code >= 97 && code <= 122) {
      col = col * 26 + (code - 96);
    }
  }
  return Math.max(0, col - 1);
}

function parseCellRef(ref: string): [number, number] {
  const m = /^([A-Za-z]+)(\d+)$/.exec(ref);
  if (!m) return [0, 0];
  const col = colNameToIndex(m[1]);
  const row = Math.max(0, parseInt(m[2], 10) - 1);
  return [col, row];
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
  const ds = new DecompressionStream('deflate-raw');
  const decompressedStream = stream.pipeThrough(ds);
  const reader = decompressedStream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      totalLength += value.length;
    }
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/** Unpack standard PKZIP entries */
async function unzipEntries(buffer: ArrayBuffer): Promise<Map<string, string>> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();
  const files = new Map<string, string>();
  let offset = 0;

  while (offset + 30 <= buffer.byteLength) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) {
      // Seek to next byte or stop if Central Directory starts (0x02014b50)
      if (sig === 0x02014b50 || sig === 0x06054b50) break;
      offset++;
      continue;
    }

    const method = view.getUint16(offset + 8, true);
    let compSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const flags = view.getUint16(offset + 6, true);

    const name = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLen));
    const dataStart = offset + 30 + nameLen + extraLen;

    // Handle data descriptor (flag bit 3) where size is 0 in local header
    if ((flags & 0x08) !== 0 && compSize === 0) {
      // Search for next signature or data descriptor 0x08074b50
      let nextSig = dataStart;
      while (nextSig + 4 <= buffer.byteLength) {
        const s = view.getUint32(nextSig, true);
        if (s === 0x08074b50 || s === 0x04034b50 || s === 0x02014b50) break;
        nextSig++;
      }
      compSize = nextSig - dataStart;
    }

    const compressed = bytes.subarray(dataStart, dataStart + compSize);
    let uncompressed: Uint8Array;

    try {
      if (method === 0) {
        uncompressed = compressed;
      } else if (method === 8) {
        uncompressed = await inflateRaw(compressed);
      } else {
        // Unsupported compression
        offset = dataStart + compSize;
        continue;
      }
      files.set(name, decoder.decode(uncompressed));
    } catch {
      // Ignore corrupted subfiles
    }

    offset = dataStart + compSize;
  }

  return files;
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;
  while ((match = siRegex.exec(xml)) !== null) {
    const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let tMatch: RegExpExecArray | null;
    let str = '';
    while ((tMatch = tRegex.exec(match[1])) !== null) {
      str += tMatch[1];
    }
    strings.push(unescapeXml(str));
  }
  return strings;
}

function parseWorkbookSheetNames(xml: string): { id: string; name: string }[] {
  const sheets: { id: string; name: string }[] = [];
  const sheetRegex = /<sheet\b[^>]*name="([^"]+)"[^>]*sheetId="([^"]+)"[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = sheetRegex.exec(xml)) !== null) {
    sheets.push({ name: unescapeXml(match[1]), id: match[2] });
  }
  if (sheets.length === 0) {
    // Fallback pattern if attributes are ordered differently
    const altRegex = /<sheet\b[^>]*>/g;
    let m: RegExpExecArray | null;
    while ((m = altRegex.exec(xml)) !== null) {
      const nameM = /name="([^"]+)"/.exec(m[0]);
      const idM = /sheetId="([^"]+)"/.exec(m[0]);
      if (nameM) {
        sheets.push({ name: unescapeXml(nameM[1]), id: idM ? idM[1] : String(sheets.length + 1) });
      }
    }
  }
  return sheets;
}

function parseSheetXml(xml: string, sharedStrings: string[]): string[][] {
  const rows: Map<number, Map<number, string>> = new Map();
  let maxCol = 0;
  let maxRow = 0;

  const rowRegex = /<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(xml)) !== null) {
    const rowIdx = Math.max(0, parseInt(rowMatch[1], 10) - 1);
    maxRow = Math.max(maxRow, rowIdx);
    const rowContent = rowMatch[2];

    const cellRegex = /<c\b[^>]*r="([A-Za-z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch: RegExpExecArray | null;

    let colMap = rows.get(rowIdx);
    if (!colMap) {
      colMap = new Map<number, string>();
      rows.set(rowIdx, colMap);
    }

    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      const ref = cellMatch[1];
      const attrs = cellMatch[2];
      const content = cellMatch[3];
      const [colIdx] = parseCellRef(ref);
      maxCol = Math.max(maxCol, colIdx);

      const isString = /t="s"/.test(attrs);
      const isInline = /t="inlineStr"/.test(attrs);

      let val = '';
      if (isString) {
        const vMatch = /<v>(\d+)<\/v>/.exec(content);
        if (vMatch) {
          const sIdx = parseInt(vMatch[1], 10);
          val = sharedStrings[sIdx] ?? '';
        }
      } else if (isInline) {
        const tMatch = /<t\b[^>]*>([\s\S]*?)<\/t>/.exec(content);
        val = tMatch ? unescapeXml(tMatch[1]) : '';
      } else {
        const vMatch = /<v>([\s\S]*?)<\/v>/.exec(content);
        val = vMatch ? unescapeXml(vMatch[1]) : '';
      }

      colMap.set(colIdx, val);
    }
  }

  // Materialize into dense 2D array
  const table: string[][] = [];
  for (let r = 0; r <= maxRow; r++) {
    const colMap = rows.get(r);
    const rowVals: string[] = [];
    for (let c = 0; c <= maxCol; c++) {
      rowVals.push(colMap?.get(c) ?? '');
    }
    // Only push if row has at least one non-empty value
    if (rowVals.some((v) => v.trim() !== '')) {
      table.push(rowVals);
    }
  }

  return table;
}

export async function parseXlsx(buffer: ArrayBuffer): Promise<XlsxWorkbook> {
  const files = await unzipEntries(buffer);
  
  // Parse shared strings
  const ssXml = files.get('xl/sharedStrings.xml') ?? files.get('xl/sharedstrings.xml') ?? '';
  const sharedStrings = ssXml ? parseSharedStrings(ssXml) : [];

  // Parse workbook sheet list
  const wbXml = files.get('xl/workbook.xml') ?? '';
  const sheetMeta = wbXml ? parseWorkbookSheetNames(wbXml) : [];

  const sheets: XlsxSheet[] = [];

  // Find all worksheets
  let idx = 1;
  while (true) {
    const path = `xl/worksheets/sheet${idx}.xml`;
    const xml = files.get(path);
    if (!xml) break;

    const sheetName = sheetMeta[idx - 1]?.name ?? `Sheet ${idx}`;
    const data = parseSheetXml(xml, sharedStrings);
    sheets.push({ name: sheetName, data });
    idx++;
  }

  // Fallback: if sheet1..N didn't match, search any file under xl/worksheets/
  if (sheets.length === 0) {
    for (const [path, xml] of files.entries()) {
      if (path.startsWith('xl/worksheets/') && path.endsWith('.xml')) {
        const sheetName = path.replace('xl/worksheets/', '').replace('.xml', '');
        const data = parseSheetXml(xml, sharedStrings);
        sheets.push({ name: sheetName, data });
      }
    }
  }

  return { sheets };
}
