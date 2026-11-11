declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding?: string): string;
  export function writeFileSync(path: string | URL, data: string, encoding?: string): void;
  export function mkdtempSync(prefix: string): string;
  export function rmSync(path: string, options: { recursive: boolean; force: boolean }): void;
}

declare module 'node:path' {
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:child_process' {
  export function spawnSync(command: string, args: string[], options: { encoding: string }): { status: number | null; stdout: string; stderr: string };
}
