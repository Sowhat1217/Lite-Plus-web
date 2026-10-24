import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const require = createRequire(import.meta.url);
const ts = require(path.join(webRoot, "node_modules/typescript"));
const prefetchSource = readFileSync(path.join(webRoot, "src/pages/admin/nodemgt/prefetch.ts"), "utf8");
const securitySource = readFileSync(path.join(webRoot, "src/utils/security.ts"), "utf8");

test("prefetch does not cache a failed RPC batch as a fresh snapshot", () => {
  assert.match(prefetchSource, /errors\.set\(request\.method, error\)/);
  assert.match(prefetchSource, /rememberNodemgtSnapshot\(next, rest\.length === 0 && errors\.size === 0\)/);
  assert.match(prefetchSource, /rememberNodemgtSnapshot\(next, errors\.size === 0\)/);
  assert.match(prefetchSource, /throwPrimaryRPCErrors/);
  assert.match(prefetchSource, /if \(error\) throw error/);
  assert.match(prefetchSource, /throwPrimaryRPCErrors\(options\?\.primary, batch\.errors\)/);
  assert.doesNotMatch(prefetchSource, /return rememberNodemgtSnapshot\(next, true\)/);
  assert.doesNotMatch(prefetchSource, /return await pending/);
});

function loadPrefetch(mode: string, userGate?: Promise<void>) {
  const requests: string[] = [];
  const context = vm.createContext({
    fetch: async (_url: string, init: { body: string }) => {
      const { method } = JSON.parse(init.body);
      requests.push(method);
      if (userGate && method === "admin:nodemgt.user.list") await userGate;
      const failed =
        mode === "all_fail" ||
        (mode === "primary_users_fail" && method === "admin:nodemgt.user.list") ||
        (mode === "certs_fail" && method === "admin:nodemgt.cert.list");
      return {
        ok: !failed,
        status: failed ? 503 : 200,
        json: async () =>
          failed
            ? { error: { message: `audit temporary RPC failure: ${method}` } }
            : {
                result:
                  method === "admin:nodemgt.user.list"
                    ? [{ id: "audit-user" }]
                    : method === "admin:nodemgt.cert.list"
                      ? [{ id: "audit-cert" }]
                      : method.includes("settings") || method.includes("diag")
                        ? {}
                        : [],
              },
      };
    },
  });
  function load(text: string, resolver: (id: string) => unknown = () => {
    throw new Error("unexpected import");
  }) {
    const js = ts.transpileModule(text, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} as any };
    new vm.Script(`(function(require,module,exports){\n${js}\n})`).runInContext(context)(
      resolver,
      module,
      module.exports,
    );
    return module.exports;
  }
  const security = load(securitySource);
  return {
    api: load(prefetchSource, (id) => {
      if (id === "@/utils/security") return security;
      throw new Error(`unexpected import: ${id}`);
    }),
    requests,
  };
}

async function outcome(promise: Promise<any>) {
  try {
    const value = await promise;
    return { rejected: false, users: value.users.length, certs: value.certs.length };
  } catch (error) {
    return { rejected: true, error: String((error as Error).message) };
  }
}

test("prefetch throws later caller's primary errors on a shared in-flight batch", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { api, requests } = loadPrefetch("certs_fail", gate);
  const users = outcome(api.prefetchNodemgtAdmin({ force: true, primary: api.nodemgtPrimaryMethods("users") }));
  const certs = outcome(api.prefetchNodemgtAdmin({ force: true, primary: api.nodemgtPrimaryMethods("certs") }));
  release();
  const [usersResult, certsResult] = await Promise.all([users, certs]);
  assert.equal(usersResult.rejected, false);
  assert.equal(certsResult.rejected, true);
  assert.match(String(certsResult.error), /admin:nodemgt\.cert\.list/);
  assert.equal(requests.length, 11);
  assert.equal(api.getNodemgtSnapshot()?.at > 0, false);
});

test("prefetch still throws a lone certs primary failure", async () => {
  const { api } = loadPrefetch("certs_fail");
  const result = await outcome(api.prefetchNodemgtAdmin({ force: true, primary: api.nodemgtPrimaryMethods("certs") }));
  assert.equal(result.rejected, true);
  assert.match(String(result.error), /admin:nodemgt\.cert\.list/);
  assert.equal(api.getNodemgtSnapshot()?.at > 0, false);
});
