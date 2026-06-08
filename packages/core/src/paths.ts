// packages/core/src/paths.ts
export const tmpPath = (file: string) => `${file}.${process.pid}.tmp`;
export const lockPath = (file: string) => `${file}.lock`;
