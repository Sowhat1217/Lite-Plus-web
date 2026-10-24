import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const storageSource = readFileSync(
  new URL("../src/pages/admin/update_storage_v4.tsx", import.meta.url),
  "utf8",
);
const shellSource = readFileSync(
  new URL("../src/components/install/MigrationGuideShell.tsx", import.meta.url),
  "utf8",
);

test("storage migration page uses the shared MUI guide shell with progress", () => {
  assert.match(storageSource, /<MigrationGuideShell/);
  assert.match(storageSource, /progress=\{progress\}/);
  assert.doesNotMatch(storageSource, /GuideHeader/);
  assert.doesNotMatch(storageSource, /@radix-ui\/themes/);
  assert.doesNotMatch(storageSource, /from "@\/components\/admin\/ui"/);
  assert.match(shellSource, /data-testid="migration-guide"/);
  assert.match(shellSource, /LinearProgress/);
  assert.match(shellSource, /LanguageMenu/);
  assert.match(shellSource, /ThemeMenu/);
  assert.match(shellSource, /LITE_NAME/);
  assert.match(shellSource, /LITE_BLUE/);
  assert.match(shellSource, /textTransform: "none"/);
  assert.match(
    shellSource,
    /\{subtitle \? \([\s\S]*\{showProgress \? \([\s\S]*LinearProgress/,
  );
});

test("storage migration page does not overlay a login dialog", () => {
  assert.doesNotMatch(storageSource, /RestrictedLoginDialog/);
  assert.doesNotMatch(storageSource, /logged_in/);
});

test("storage migration page supports URL preview without calling the real APIs", () => {
  assert.match(storageSource, /isGuidePreview/);
  assert.match(storageSource, /if \(preview\) return/);
});
