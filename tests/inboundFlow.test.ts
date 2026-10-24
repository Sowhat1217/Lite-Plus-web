import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/pages/admin/nodemgt/index.tsx", import.meta.url), "utf8");

test("existing inbound keeps empty flow instead of filling vision", () => {
  assert.match(source, /flow: str\(row\?\.flow, existing \? "" : defaultInboundFlow\(protocol, transport, security, core\)\)/);
});

test("tls inbound defaults to empty flow, reality still defaults to vision", () => {
  assert.match(source, /return security === "reality" \? "xtls-rprx-vision" : ""/);
  assert.match(
    source,
    /flow: defaultInboundFlow\(sheet\.form\.protocol, value === "reality" \? "tcp" : sheet\.form\.transport, value, sheet\.form\.core\)/,
  );
});

test("sing-box inbounds cannot use vision flow", () => {
  assert.match(source, /if \(core === "sing-box"\) return false;/);
});

test("choosing reality fills a short id instead of leaving the field blank", () => {
  assert.match(source, /value === "reality" \? sheet\.form\.reality_short_id \|\| randomRealityShortID\(\) : ""/);
});

test("new outbound copies uuid from the inbound's granted user", () => {
  assert.match(source, /const uuid = uuidForInbound\(inbound, users\) \|\| sheet\?\.form\.uuid \|\| ""/);
});
