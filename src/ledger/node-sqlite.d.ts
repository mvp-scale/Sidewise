/**
 * Minimal ambient types for node:sqlite (stable since Node 22.13), only what ledger/index.ts calls. The pinned
 * devDependency @types/node (22.19.18) ships its own, fuller node:sqlite types now too; this file's declarations
 * merge with theirs harmlessly (tsconfig's skipLibCheck) and stay as a floor in case @types/node is ever pinned
 * back below 22.5 — this file exists so `import('node:sqlite')` type-checks either way, not to model the whole API.
 */
declare module 'node:sqlite' {
  export interface DatabaseSyncOptions {
    open?: boolean;
    readOnly?: boolean;
    [key: string]: unknown;
  }

  export interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  export class StatementSync {
    run(...params: unknown[]): StatementResultingChanges;
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  }

  export class DatabaseSync {
    constructor(location: string, options?: DatabaseSyncOptions);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
