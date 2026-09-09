// Synthetic fixtures adapted from reviewed source 22db9bb; no real CLI is spawned.
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const expect = (actual) => ({ toEqual: (expected) => assert.deepEqual(actual, expected), toBe: (expected) => assert.equal(actual, expected), toBeGreaterThan: (expected) => assert.ok(actual > expected) });
export async function verifyNativeQuota(packageRoot) {
    const { CodexEphemeralSessionMaterializer } = await import(pathToFileURL(join(packageRoot, 'dist/provider-codex/codex-session-materializer.js')).href);
    const { CodexQuotaSnapshotObservation } = await import(pathToFileURL(join(packageRoot, 'dist/worker-codex/adapters/codex-quota-snapshot-observation.js')).href);
    const { CodexSnapshotObservationStatus: Status } = await import(pathToFileURL(join(packageRoot, 'dist/worker-codex/application/codex-account-capacity-rechecker.js')).href);
    const now = new Date("2026-09-09T00:00:00Z");
    function auth(accountId = "A", rotation = "first") {
        const jwt = ["e30", Buffer.from(JSON.stringify({
                exp: rotation === "first" ? 2_000_000_000 : 2_000_000_001, email: "same@example.invalid",
                "https://api.openai.com/auth": { chatgpt_account_id: accountId, chatgpt_user_id: "user-a" },
            })).toString("base64url"), "c2ln"].join(".");
        return { auth_mode: "chatgpt", OPENAI_API_KEY: null, last_refresh: now.toISOString(),
            tokens: { account_id: accountId, id_token: jwt, access_token: jwt, refresh_token: rotation } };
    }
    const quota = () => ({ rateLimits: { limitId: "codex", planType: "plus", spendControlReached: false,
            primary: { usedPercent: 20, windowDurationMins: 300, resetsAt: now.getTime() / 1000 + 3600 },
            secondary: { usedPercent: 30, windowDurationMins: 10080, resetsAt: now.getTime() / 1000 + 86400 } } });
    async function setup(hooks = {}) {
        const root = await mkdtemp(join(tmpdir(), "native-quota-test-"));
        const source = join(root, "synthetic-auth.json");
        const sourceAuth = auth(hooks.initialAccount);
        if (hooks.initialMode === "omitted")
            delete sourceAuth.auth_mode;
        if (hooks.initialMode === null)
            sourceAuth.auth_mode = null;
        await writeFile(source, JSON.stringify(sourceAuth, null, 2));
        const calls = [];
        const homes = [];
        const fakeSpawn = ((_command, args, options) => {
            const env = options.env;
            expect(Object.keys(env).sort()).toEqual(["CODEX_HOME", "HOME", "LANG", "PATH"]);
            expect(options.cwd).toBe(env.HOME);
            expect(args.slice(-3)).toEqual(["app-server", "--strict-config", "--stdio"]);
            homes.push(env.CODEX_HOME);
            const config = {};
            for (let i = 0; i < args.length - 3; i += 2) {
                const override = args[i + 1];
                const at = override.indexOf("=");
                const path = override.slice(0, at).split(".");
                let obj = config;
                for (const key of path.slice(0, -1))
                    obj = obj[key] ??= {};
                obj[path.at(-1)] = JSON.parse(override.slice(at + 1));
            }
            // be6e8 ConfigToml rejects reserved IDs and serializes only configured
            // providers; it never expands the built-in OpenAI provider into this map.
            if (["openai", "ollama", "lmstudio"].some((id) => id in (config.model_providers ?? {}))) {
                throw new Error("reserved built-in provider override");
            }
            config.model_providers ??= {};
            const stdout = new PassThrough();
            const stderr = new PassThrough();
            const child = Object.assign(new EventEmitter(), {
                pid: 12345, stdout, stderr, exitCode: null, signalCode: null,
                kill(signal) {
                    if (!hooks.stopFails) {
                        this.signalCode = signal;
                        child.emit("exit", null, signal);
                        child.emit("close", null, signal);
                    }
                    return true;
                },
            });
            const stdin = new Writable({
                write(chunk, _encoding, callback) {
                    callback();
                    void (async () => {
                        const message = JSON.parse(String(chunk));
                        calls.push(message.method);
                        if (hooks.hangInitialize && message.method === "initialize")
                            return;
                        let result = {};
                        if (message.method === "initialize") {
                            const fileConfig = await readFile(join(env.CODEX_HOME, "config.toml"), "utf8");
                            expect(fileConfig.includes("model_providers.openai")).toBe(false);
                            const privateAuth = JSON.parse(await readFile(join(env.CODEX_HOME, "auth.json"), "utf8"));
                            expect(privateAuth.auth_mode).toBe("chatgpt");
                            const catalog = JSON.parse(await readFile(config.model_catalog_json, "utf8"));
                            assert.deepEqual(catalog, nativeQuotaStaticCatalog);
                        }
                        if (hooks.effectiveConfigConflict)
                            config.model_providers.openai = { env_key: "SYNTHETIC_ALTERNATE_KEY" };
                        if (message.method === "config/read")
                            result = { config };
                        if (message.method === "account/read") {
                            expect(message.params).toEqual({ refreshToken: false });
                            result = hooks.account === undefined ? { requiresOpenaiAuth: true, account: { type: "chatgpt", email: "same@example.invalid", planType: "plus" } } : hooks.account;
                        }
                        if (message.method === "account/rateLimits/read") {
                            if (hooks.mutate)
                                await hooks.mutate(env.CODEX_HOME, source);
                            if (hooks.signal)
                                stdout.write(JSON.stringify({ id: message.id, ...hooks.signal }) + "\n");
                            result = hooks.quota === undefined ? quota() : hooks.quota;
                        }
                        stdout.write(JSON.stringify(message.method === "account/rateLimits/read" && hooks.rpcError
                            ? { id: message.id, error: { message: "synthetic-secret-rpc-error" } }
                            : { id: message.id, result }) + "\n");
                    })().catch((error) => child.emit("error", error));
                },
                final(callback) {
                    callback();
                    if (hooks.lateSignal)
                        stdout.write(JSON.stringify(hooks.lateSignal) + "\n");
                    if (!hooks.stopFails) {
                        child.signalCode = "SIGTERM";
                        child.emit("exit", null, "SIGTERM");
                        child.emit("close", null, "SIGTERM");
                    }
                },
            });
            return Object.assign(child, { stdin });
        });
        const adapter = new CodexQuotaSnapshotObservation({ authJsonPath: source,
            codexBinaryPath: process.execPath, spawnProcess: fakeSpawn, appServerLaunchMinIntervalMs: 0,
            materializer: { mode: "ephemeral", materialize: async (input) => {
                    const materialized = await new CodexEphemeralSessionMaterializer().materialize(input);
                    if (hooks.profileConflict) {
                        homes.push(materialized.codexHome);
                        await mkdir(join(materialized.home, ".codex"));
                        await writeFile(join(materialized.home, ".codex", "config.toml"), "model_provider='other'");
                    }
                    return { ...materialized, release: hooks.cleanupFails
                            ? async () => { throw new Error("synthetic-secret-cleanup-error"); } : materialized.release };
                } },
        });
        return { adapter, source, homes, calls, async cleanup() {
                await rm(root, { recursive: true, force: true });
                for (const home of homes)
                    await rm(dirname(home), { recursive: true, force: true });
            } };
    }
    const { nativeQuotaStaticCatalog } = await import(pathToFileURL(join(packageRoot,
        "dist/worker-codex/adapters/codex-quota-snapshot-observation-catalog.js")).href);
    assert.equal(nativeQuotaStaticCatalog.models.length, 1);
    assert.equal(nativeQuotaStaticCatalog.models[0].slug, "gpt-5.4-mini");
    const { CodexAccountCapacityRechecker } = await import(pathToFileURL(join(packageRoot,
        "dist/worker-codex/application/codex-account-capacity-rechecker.js")).href);
    const a = await setup();
    const b = await setup({ initialAccount: "B" });
    try {
        const boundA = await a.adapter.read({ now, demand: null });
        const boundB = await b.adapter.read({ now, demand: null });
        assert.equal(boundA.status, Status.Bound);
        assert.equal(boundB.status, Status.Bound);
        assert.notEqual(boundA.independentAccountKeyHash, boundB.independentAccountKeyHash);
        const previous = { availability: "quota_exhausted", reason: "quota_limited",
            cooldownUntil: new Date(now.getTime() + 86_400_000) };
        const input = { accountId: `codex-provider:${boundA.independentAccountKeyHash}`,
            now, previous, demand: null };
        const checker = (result) => new CodexAccountCapacityRechecker({ observation: {
            read: async () => result,
        } });
        assert.equal((await checker(boundA).recheck(input)).availability, "available");
        for (const result of [boundB, { status: Status.Rejected, reason: "native_snapshot_invalid" }]) {
            const capacity = await checker(result).recheck(input);
            assert.equal(capacity.availability, previous.availability);
            assert.deepEqual(capacity.cooldownUntil, previous.cooldownUntil);
        }
    } finally { await a.cleanup(); await b.cleanup(); }
    for (const initialMode of [undefined, 'omitted', null]) {
        for (const rotation of [undefined, 'A', 'B']) {
            const fixture = await setup({ initialMode, ...(rotation ? { mutate: async (home) => {
                        const rotated = auth(rotation, 'rotated');
                        delete rotated.OPENAI_API_KEY;
                        rotated.auth_mode = null;
                        await writeFile(join(home, 'auth.json'), JSON.stringify(rotated));
                    } } : {}) });
            try {
                const baseline = await readFile(fixture.source, 'utf8');
                assert.equal((await fixture.adapter.read({ now, demand: null })).status, rotation === 'B' ? Status.Rejected : Status.Bound);
                assert.equal(await readFile(fixture.source, 'utf8'), baseline);
                assert.deepEqual(fixture.calls, ['initialize', 'config/read', 'account/read', 'account/rateLimits/read']);
            }
            finally {
                await fixture.cleanup();
            }
        }
    }
    for (const hooks of [{ effectiveConfigConflict: true }, { rpcError: true }, { lateSignal: { method: 'account/updated', params: { authMode: 'apikey' } } }]) {
        const fixture = await setup(hooks);
        try {
            assert.equal((await fixture.adapter.read({ now, demand: null })).status, Status.Rejected);
        }
        finally {
            await fixture.cleanup();
        }
    }
    const { JsonRpcLineClient } = await import(pathToFileURL(join(packageRoot, 'node_modules/@vioxen/agent-account-observability/dist/infrastructure/JsonRpcLineClient.js')).href);
    for (const partial of ['', '{"method":']) {
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        let failed = false;
        const child = Object.assign(new EventEmitter(), { stdout, stderr, exitCode: null, signalCode: null,
            kill() { this.signalCode = 'SIGTERM'; globalThis.queueMicrotask(() => { this.emit('exit', null, 'SIGTERM'); this.emit('close', null, 'SIGTERM'); }); return true; }
        });
        child.stdin = new Writable({ write(chunk, _encoding, callback) { callback(); const request = JSON.parse(String(chunk)); globalThis.queueMicrotask(() => stdout.write(JSON.stringify({ id: request.id, result: {} }) + '\n')); } });
        const client = new JsonRpcLineClient({ command: 'synthetic-never-spawned', args: [], cwd: tmpdir(), env: {}, spawnProcess: () => child, onTransportFailure: () => { failed = true; } });
        await client.start();
        stdout.write(partial);
        await client.close();
        assert.equal(failed, partial.length > 0);
        assert.equal(client.isStopped(), true);
    }
    process.stdout.write('Native synthetic checks passed: 9 managed-mode/rotation cases, corrected config, independent identities, future-block preservation, static catalog, RPC/late auth rejection, complete/partial final frames.\n');
}
