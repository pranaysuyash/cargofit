declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding?: string): string;
  export function writeFileSync(path: string | URL, data: string, encoding?: string): void;
}

declare module 'node:path' {
  export function resolve(...paths: string[]): string;
}
