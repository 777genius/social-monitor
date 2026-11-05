import type { Readable } from 'node:stream';
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Manifest {
  readonly sha: string; readonly ci_run_id: string;
  readonly archive_sha256: string; readonly image_id: string;
  readonly archive_bytes: number; readonly migrations: readonly Json[];
  readonly image_graph: Readonly<Record<string, Json>>;
}
export interface RunnerConfig {
  readonly host: string; readonly port: number; readonly user: 'sm-release';
  readonly private_key: string; readonly known_hosts: string;
}
export interface TransportResult { code: number; stdout: Buffer }
export type Source = () => Readable | AsyncIterable<Uint8Array>;
export type Transport = (wire: string, source?: Source) => Promise<TransportResult>;
export class ClientError extends Error { readonly code: string; constructor(code: string) }
export function validateManifest(value: unknown, sha: string, run: string): Manifest;
export function runnerConfig(path: string): Promise<RunnerConfig>;
export function command(verb: string, args?: readonly string[]): string;
export function sshTransport(config: RunnerConfig): Transport;
export function receipt(value: unknown, manifest: Manifest, admission: unknown): Record<string, Json>;
export function deliver(options: {
  manifest: string; archive: string; sha: string; run: string; phases: string;
}, transport: Transport): Promise<{ phase: string }>;
