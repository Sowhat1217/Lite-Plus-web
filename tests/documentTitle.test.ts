import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/DocumentTitle.tsx", "utf8");
const mainSource = readFileSync("src/main.tsx", "utf8");

test("admin and public pages use the expected browser titles", () => {
  const brandSource = readFileSync("src/theme/brand.ts", "utf8");
  assert.match(brandSource, /export const LITE_NAME = "Lite-Plus"/);
  assert.match(brandSource, /export const LITE_ADMIN_TITLE = `\$\{LITE_NAME\} Monitor`/);
  assert.match(source, /const ADMIN_TITLE = LITE_ADMIN_TITLE/);
  assert.match(source, /const PUBLIC_TITLE = LITE_NAME/);
  assert.match(source, /publicInfo\?\.sitename\?\.trim\(\) \|\| PUBLIC_TITLE/);
  assert.match(source, /pathname\.startsWith\("\/admin\/"\)/);
});

test("document title handling is mounted for every application route", () => {
  assert.equal(mainSource.match(/<DocumentTitle \/>/g)?.length, 2);
});
