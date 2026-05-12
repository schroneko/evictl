import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ALIASES,
  DEFAULT_TARGETS,
  type Route,
  duplicatePrimaryRoutes,
  loadInventory,
  resolveTarget,
} from "../src/cli.ts";

const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;

afterEach(() => {
  if (originalXdgConfigHome === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
  }
});

describe("resolveTarget", () => {
  test("resolves alias", () => {
    expect(resolveTarget("claude-code-channels", DEFAULT_TARGETS)).toBe("ccc");
  });

  test("resolves direct target", () => {
    expect(resolveTarget("hermes", DEFAULT_TARGETS)).toBe("hermes");
  });

  test("rejects unknown target", () => {
    expect(() => resolveTarget("missing", DEFAULT_TARGETS)).toThrow("unknown target");
  });
});

describe("defaults", () => {
  test("supported targets", () => {
    expect(new Set(Object.keys(DEFAULT_TARGETS))).toEqual(new Set(["openclaw", "hermes", "ccc"]));
  });

  test("aliases do not shadow targets", () => {
    for (const value of Object.values(ALIASES)) {
      expect(value in DEFAULT_TARGETS).toBe(true);
    }
  });
});

describe("inventory", () => {
  test("default evi inventory matches targets", () => {
    delete process.env.XDG_CONFIG_HOME;
    const inventory = loadInventory();
    expect(new Set(Object.keys(inventory.evis))).toEqual(new Set(["evi-openclaw", "evi-hermes", "evi-ccc"]));
  });

  test("loads configured routes", () => {
    const root = mkdtempSync(join(tmpdir(), "evictl-test-"));
    try {
      mkdirSync(join(root, "evictl"));
      writeFileSync(
        join(root, "evictl", "config.json"),
        JSON.stringify({
          routes: {
            "telegram:main": {
              channel: "telegram",
              account_id: "main",
              target_evi: "evi-openclaw",
            },
          },
        }),
      );
      process.env.XDG_CONFIG_HOME = root;
      const inventory = loadInventory();
      expect(inventory.routes["telegram:main"].targetEvi).toBe("evi-openclaw");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("routes", () => {
  test("duplicate primary routes detect same surface", () => {
    const routes: Record<string, Route> = {
      a: { key: "a", channel: "telegram", accountId: "main", peerId: "1", targetEvi: "evi-a", mode: "primary" },
      b: { key: "b", channel: "telegram", accountId: "main", peerId: "1", targetEvi: "evi-b", mode: "primary" },
      c: { key: "c", channel: "telegram", accountId: "main", peerId: "1", targetEvi: "evi-c", mode: "mirror" },
    };
    const conflicts = duplicatePrimaryRoutes(routes);
    expect([...conflicts.keys()]).toEqual(["telegram\u0000main\u00001"]);
  });
});
