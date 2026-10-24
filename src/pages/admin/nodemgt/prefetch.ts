import { sameOriginApiPath, sameOriginFetchInit } from "@/utils/security";

export type NodemgtSnapshot = {
  inbounds: any[];
  users: any[];
  plans: any[];
  certs: any[];
  subs: any[];
  outbounds: any[];
  routes: any[];
  audit: any[];
  diag: Record<string, any>;
  settings: Record<string, any>;
  delivery: any[];
  at: number;
};

type NodemgtRequest = {
  key: keyof Omit<NodemgtSnapshot, "at">;
  method: string;
  params?: Record<string, unknown>;
};

const NODEMGT_REQUESTS: NodemgtRequest[] = [
  { key: "inbounds", method: "admin:nodemgt.inbound.list" },
  { key: "users", method: "admin:nodemgt.user.list" },
  { key: "plans", method: "admin:nodemgt.plan.list" },
  { key: "certs", method: "admin:nodemgt.cert.list" },
  { key: "subs", method: "admin:nodemgt.subscription.list" },
  { key: "outbounds", method: "admin:nodemgt.outbound.list" },
  { key: "routes", method: "admin:nodemgt.route.list" },
  { key: "audit", method: "admin:nodemgt.audit.list", params: { limit: 80 } },
  { key: "diag", method: "admin:nodemgt.diag.status" },
  { key: "settings", method: "admin:nodemgt.settings.get" },
  { key: "delivery", method: "admin:nodemgt.control.status" },
];

const SNAPSHOT_TTL_MS = 12_000;

type InflightPrefetch = {
  run: Promise<NodemgtSnapshot>;
  errors: Map<string, Error>;
};

let snapshot: NodemgtSnapshot | null = null;
let inflight: InflightPrefetch | null = null;
let rpcSeq = 1;
const partialListeners = new Set<(snap: NodemgtSnapshot) => void>();

export function emptyNodemgtSnapshot(): NodemgtSnapshot {
  return {
    inbounds: [],
    users: [],
    plans: [],
    certs: [],
    subs: [],
    outbounds: [],
    routes: [],
    audit: [],
    diag: {},
    settings: {},
    delivery: [],
    at: 0,
  };
}

export function getNodemgtSnapshot(): NodemgtSnapshot | null {
  return snapshot;
}

export function nodemgtPrimaryMethods(tab: string): string[] {
  switch (tab) {
    case "inbounds":
      return ["admin:nodemgt.inbound.list", "admin:nodemgt.control.status"];
    case "outbounds":
      return ["admin:nodemgt.outbound.list", "admin:nodemgt.control.status"];
    case "routes":
      return ["admin:nodemgt.route.list", "admin:nodemgt.control.status"];
    case "users":
      return ["admin:nodemgt.user.list", "admin:nodemgt.control.status"];
    case "plans":
      return ["admin:nodemgt.plan.list", "admin:nodemgt.user.list"];
    case "certs":
      return ["admin:nodemgt.cert.list", "admin:nodemgt.settings.get"];
    case "subscriptions":
      return ["admin:nodemgt.settings.get", "admin:nodemgt.subscription.list"];
    case "audit":
      return ["admin:nodemgt.audit.list"];
    default:
      return [
        "admin:nodemgt.inbound.list",
        "admin:nodemgt.user.list",
        "admin:nodemgt.cert.list",
        "admin:nodemgt.control.status",
        "admin:nodemgt.diag.status",
      ];
  }
}

export function rememberNodemgtSnapshot(next: NodemgtSnapshot, done = true): NodemgtSnapshot {
  snapshot = { ...next, at: done ? Date.now() : 0 };
  partialListeners.forEach((fn) => fn(snapshot!));
  return snapshot;
}

export function resetNodemgtSnapshot() {
  snapshot = null;
  inflight = null;
  rpcSeq = 1;
}

function throwPrimaryRPCErrors(primary: readonly string[] | undefined, errors: Map<string, Error>) {
  const methods = primary?.length
    ? primary
    : NODEMGT_REQUESTS.map((request) => request.method);
  for (const method of methods) {
    const error = errors.get(method);
    if (error) throw error;
  }
}

export async function prefetchNodemgtAdmin(options?: {
  force?: boolean;
  primary?: readonly string[];
  onPartial?: (snap: NodemgtSnapshot) => void;
}): Promise<NodemgtSnapshot> {
  const fresh = Boolean(snapshot?.at) && Date.now() - snapshot!.at < SNAPSHOT_TTL_MS;
  if (!options?.force && fresh && snapshot) return snapshot;
  if (options?.onPartial) partialListeners.add(options.onPartial);
  try {
    if (inflight) {
      if (snapshot) options?.onPartial?.(snapshot);
      const batch = inflight;
      await batch.run;
      throwPrimaryRPCErrors(options?.primary, batch.errors);
      return snapshot ?? emptyNodemgtSnapshot();
    }
    const errors = new Map<string, Error>();
    const batch: InflightPrefetch = {
      errors,
      run: fetchNodemgtAdmin(options, errors).finally(() => {
        if (inflight === batch) inflight = null;
      }),
    };
    inflight = batch;
    const snap = await batch.run;
    throwPrimaryRPCErrors(options?.primary, batch.errors);
    return snap;
  } finally {
    if (options?.onPartial) partialListeners.delete(options.onPartial);
  }
}

async function fetchNodemgtAdmin(
  options: { primary?: readonly string[] } | undefined,
  errors: Map<string, Error>,
): Promise<NodemgtSnapshot> {
  const next = snapshot ? { ...snapshot } : emptyNodemgtSnapshot();
  const primary = new Set(options?.primary ?? []);
  const run = async (request: NodemgtRequest) => {
    try {
      const value = await rpcCall(request.method, request.params);
      assignSnapshotValue(next, request.key, value);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      errors.set(request.method, error);
    }
  };
  const first = primary.size
    ? NODEMGT_REQUESTS.filter((request) => primary.has(request.method))
    : NODEMGT_REQUESTS;
  const rest = primary.size
    ? NODEMGT_REQUESTS.filter((request) => !primary.has(request.method))
    : [];
  await Promise.all(first.map((request) => run(request)));
  rememberNodemgtSnapshot(next, rest.length === 0 && errors.size === 0);
  if (rest.length) {
    await Promise.all(rest.map((request) => run(request)));
    rememberNodemgtSnapshot(next, errors.size === 0);
  }
  return snapshot ?? next;
}

function assignSnapshotValue(
  target: NodemgtSnapshot,
  key: NodemgtRequest["key"],
  value: unknown,
) {
  if (key === "diag" || key === "settings") {
    target[key] = value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, any>)
      : {};
    return;
  }
  target[key] = asList(value);
}

async function rpcCall(method: string, params?: Record<string, unknown>) {
  const response = await fetch(
    sameOriginApiPath("/api/rpc2"),
    sameOriginFetchInit({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method,
        params: params ?? {},
        id: rpcSeq++,
      }),
    }),
  );
  const payload = (await response.json().catch(() => null)) as
    | { result?: unknown; error?: { message?: string } }
    | null;
  if (!response.ok || !payload || payload.error) {
    throw new Error(payload?.error?.message || `HTTP ${response.status}`);
  }
  return payload.result;
}

function asList(data: unknown): any[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return [data];
  return [];
}
