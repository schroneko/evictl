import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DEFAULT_TARGETS,
  type Identity,
  type InterfaceBinding,
  type Route,
  appendMemoryEvent,
  bindIdentityProcessorConfig,
  buildMigrationReport,
  claudeApiEnvContent,
  claudeCodeChannelPluginsFromScript,
  claudeCodeChannelsLaunchAgentPlist,
  claudeCodeChannelsLaunchPlan,
  claudeCodeChannelsStartScript,
  claudeCodeChannelsTelegramConfig,
  compileMemoryNotes,
  compileNetworkMemory,
  createFeedbackEvent,
  createTaskEvent,
  discoverFromPlistRecords,
  duplicatePrimaryRoutes,
  homebrewAutoupdateAgents,
  loadInventory,
  main,
  mergeConfigData,
  parseGlobalOptions,
  parseProcessPids,
  promoteMemoryEvents,
  queueTaskEvent,
  readMemoryEvents,
  resolveCharacterEngineEvi,
  resolveClaudeCodeChannelsAuthStatus,
  processorSelectorFromArgs,
  resolveProcessorEvi,
  resolveEviTarget,
  resolveProcessorTarget,
  resolveProvider,
  resolveTarget,
  runtimeEnvForEvi,
  runtimeInUse,
  searchMemory,
  setIdentityConfig,
  setInterfaceConfig,
  setRouteConfig,
  setTargetConfig,
  spawnEviConfig,
  switchIdentityProcessorConfig,
  targetHealthy,
  syncNetworkMemory,
  tmuxCaptureCommand,
  tmuxSendCommands,
  telegramEnvContent,
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
  test("resolves direct target names", () => {
    expect(resolveTarget("claude-code-channels", DEFAULT_TARGETS)).toBe("claude-code-channels");
    expect(resolveTarget("hermes-agent", DEFAULT_TARGETS)).toBe("hermes-agent");
    expect(resolveTarget("openclaw", DEFAULT_TARGETS)).toBe("openclaw");
  });

  test("rejects unknown target", () => {
    expect(() => resolveTarget("missing", DEFAULT_TARGETS)).toThrow("unknown target");
  });
});

describe("resolveProvider", () => {
  test("resolves direct provider names", () => {
    expect(resolveProvider("claude-code-channels")).toBe("claude-code-channels");
    expect(resolveProvider("hermes-agent")).toBe("hermes-agent");
    expect(resolveProvider("openclaw")).toBe("openclaw");
  });
});

describe("defaults", () => {
  test("supported targets", () => {
    expect(new Set(Object.keys(DEFAULT_TARGETS))).toEqual(
      new Set(["openclaw", "hermes-agent", "claude-code-channels"]),
    );
  });

  test("Claude Code Channels has a durable channel process health marker", () => {
    expect(DEFAULT_TARGETS["claude-code-channels"].healthProcessPatterns).toContain(
      "claude-plugins-official/(telegram|discord|fakechat)",
    );
  });

  test("legacy fallback names are not accepted", () => {
    expect(() => resolveTarget("ccc", DEFAULT_TARGETS)).toThrow("unknown target");
    expect(() => resolveTarget("hermes", DEFAULT_TARGETS)).toThrow("unknown target");
    expect(() => resolveProvider("open-claw")).toThrow("unknown provider");
  });

  test("removed command aliases are not accepted", () => {
    expect(() => main(["spawn", "hermes-agent"])).toThrow("unknown command: spawn");
    expect(() => main(["memory", "import"])).toThrow("unknown command: memory");
  });
});

describe("target health", () => {
  test("uses running state when no health marker is configured", () => {
    expect(targetHealthy(true, [], [])).toBe(true);
    expect(targetHealthy(false, [], [])).toBe(false);
  });

  test("requires a matched health marker when configured", () => {
    expect(targetHealthy(true, ["Listening for channel messages from:"], [])).toBe(false);
    expect(
      targetHealthy(true, ["Listening for channel messages from:"], [
        "Listening for channel messages from:",
      ]),
    ).toBe(true);
  });
});

describe("global options", () => {
  test("parses headless before or after the command", () => {
    expect(parseGlobalOptions(["--headless", "status"])).toEqual({
      command: "status",
      args: [],
      options: { headless: true },
    });
    expect(parseGlobalOptions(["status", "--headless", "claude-code-channels"])).toEqual({
      command: "status",
      args: ["claude-code-channels"],
      options: { headless: true },
    });
  });

  test("does not consume option values that look like global flags", () => {
    expect(parseGlobalOptions(["send", "evi-a", "--text", "--headless"])).toEqual({
      command: "send",
      args: ["evi-a", "--text", "--headless"],
      options: { headless: false },
    });
  });

  test("rejects open-ended monitor in headless mode", () => {
    expect(() => main(["--headless", "monitor"])).toThrow("monitor --headless requires --once");
  });
});

describe("tailscale protection", () => {
  test("targets both known Homebrew autoupdate launch agents", () => {
    expect(homebrewAutoupdateAgents("/tmp/home").map((agent) => agent.label)).toEqual([
      "com.homebrew.autoupdate",
      "com.github.domt4.homebrew-autoupdate",
    ]);
    expect(homebrewAutoupdateAgents("/tmp/home").map((agent) => agent.path)).toEqual([
      "/tmp/home/Library/LaunchAgents/com.homebrew.autoupdate.plist",
      "/tmp/home/Library/LaunchAgents/com.github.domt4.homebrew-autoupdate.plist",
    ]);
  });

  test("discovers custom Homebrew upgrade launch agents", () => {
    const root = mkdtempSync(join(tmpdir(), "evictl-homebrew-agent-test-"));
    try {
      const launchAgents = join(root, "Library", "LaunchAgents");
      mkdirSync(launchAgents, { recursive: true });
      writeFileSync(
        join(launchAgents, "com.example.homebrew-auto-upgrade.plist"),
        `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.example.homebrew-auto-upgrade</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/example/scripts/homebrew-auto-upgrade.sh</string>
  </array>
</dict>
</plist>
`,
      );

      expect(homebrewAutoupdateAgents(root)).toContainEqual({
        label: "com.example.homebrew-auto-upgrade",
        path: join(launchAgents, "com.example.homebrew-auto-upgrade.plist"),
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("inventory", () => {
  test("default evi inventory matches targets", () => {
    const root = mkdtempSync(join(tmpdir(), "evictl-test-empty-"));
    try {
      process.env.XDG_CONFIG_HOME = root;
      const inventory = loadInventory();
      expect(new Set(Object.keys(inventory.evis))).toEqual(
        new Set(["evi-openclaw", "evi-hermes-agent", "evi-claude-code-channels"]),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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

  test("loads identities and interface bindings", () => {
    const inventory = loadInventory({
      evis: {
        "evi-hermes-agent-grok": {
          runtime: "hermes-agent",
          provider: "hermes-agent",
        },
      },
      identities: {
        demo: {
          profile: "demo",
          memory_scope: "demo",
          active_evi: "evi-hermes-agent-grok",
        },
      },
      interfaces: {
        "telegram:main": {
          kind: "telegram",
          address: "main",
          identity_id: "demo",
        },
      },
    });
    expect(inventory.identities.demo.activeEvi).toBe("evi-hermes-agent-grok");
    expect(inventory.interfaces["telegram:main"].identityId).toBe("demo");
  });

  test("spawns configured evi inventory", () => {
    const next = spawnEviConfig(
      {},
      {
        eviId: "evi-claude-code-channels-research",
        runtime: "claude-code-channels",
        provider: "claude-code-channels",
        profile: "research",
        agentId: "research-agent",
        sessionId: "research-session",
        workspace: "/tmp/research",
        stateDir: "/tmp/research-state",
        networkId: "replicated-evi",
        replicaOf: "",
        role: "replica",
        modelProvider: "xai-oauth",
        model: "grok-4.3",
        baseUrl: "",
        env: {},
      },
    );
    const inventory = loadInventory(next);
    expect(inventory.evis["evi-claude-code-channels-research"].profile).toBe("research");
    expect(inventory.evis["evi-claude-code-channels-research"].provider).toBe(
      "claude-code-channels",
    );
    expect(inventory.evis["evi-claude-code-channels-research"].modelProvider).toBe("xai-oauth");
  });

  test("spawn rejects duplicate evi ids unless forced", () => {
    const data = {
      evis: {
        "evi-claude-code-channels-research": {
          runtime: "claude-code-channels",
        },
      },
    };
    const evi = {
      eviId: "evi-claude-code-channels-research",
      runtime: "claude-code-channels",
      provider: "claude-code-channels",
      profile: "research",
      agentId: "",
      sessionId: "",
      workspace: "",
      stateDir: "",
      networkId: "replicated-evi",
      replicaOf: "",
      role: "replica",
      modelProvider: "",
      model: "",
      baseUrl: "",
      env: {},
    };
    expect(() => spawnEviConfig(data, evi)).toThrow("evi already exists");
    expect(spawnEviConfig(data, evi, true).evis).toBeTruthy();
  });

  test("resolves an evi to its provider target", () => {
    const inventory = loadInventory({
      evis: {
        "evi-a": {
          runtime: "claude-code-channels",
          provider: "claude-code-channels",
        },
      },
    });
    const resolved = resolveEviTarget(inventory, "evi-a");
    expect(resolved.evi.eviId).toBe("evi-a");
    expect(resolved.target.name).toBe("claude-code-channels");
  });

  test("resolves an identity to its active processor", () => {
    const inventory = loadInventory({
      evis: {
        "evi-hermes-agent-grok": {
          runtime: "hermes-agent",
          provider: "hermes-agent",
        },
      },
      identities: {
        demo: {
          active_evi: "evi-hermes-agent-grok",
        },
      },
    });
    const resolved = resolveProcessorTarget(inventory, "demo");
    expect(resolved.identity?.identityId).toBe("demo");
    expect(resolved.evi.eviId).toBe("evi-hermes-agent-grok");
  });

  test("loads custom Hermes Agent targets and runtime model settings", () => {
    const inventory = loadInventory({
      targets: {
        "hermes-agent-grok": {
          provider: "hermes-agent",
          process_patterns: ["hermes_cli.main.*grok"],
        },
      },
      evis: {
        "evi-hermes-agent-grok": {
          runtime: "hermes-agent-grok",
          provider: "hermes-agent",
          profile: "grok",
          model_provider: "grok",
          model: "grok-4.3",
          env: {
            HERMES_HOME: "~/.hermes/profiles/grok",
          },
        },
      },
    });
    const evi = inventory.evis["evi-hermes-agent-grok"];
    expect(evi.runtime).toBe("hermes-agent-grok");
    expect(evi.modelProvider).toBe("xai-oauth");
    expect(runtimeEnvForEvi(evi)).toMatchObject({
      HERMES_HOME: "~/.hermes/profiles/grok",
      HERMES_INFERENCE_PROVIDER: "xai-oauth",
      HERMES_INFERENCE_MODEL: "grok-4.3",
      HERMES_MODEL: "grok-4.3",
    });
  });

  test("maps custom Hermes Agent base URLs into runtime env", () => {
    const inventory = loadInventory({
      evis: {
        "evi-hermes-agent-llama": {
          runtime: "hermes-agent",
          provider: "hermes-agent",
          profile: "llama",
          model_provider: "llama.cpp",
          model: "local-model",
          base_url: "http://127.0.0.1:8080/v1",
        },
      },
    });
    expect(runtimeEnvForEvi(inventory.evis["evi-hermes-agent-llama"])).toMatchObject({
      HERMES_INFERENCE_PROVIDER: "custom",
      HERMES_INFERENCE_MODEL: "local-model",
      OPENAI_BASE_URL: "http://127.0.0.1:8080/v1",
    });
  });

  test("adds custom provider targets", () => {
    const next = setTargetConfig(
      {},
      {
        name: "hermes-agent-grok",
        provider: "hermes-agent",
        label: "ai.hermes.gateway-grok",
        plist: "~/Library/LaunchAgents/ai.hermes.gateway-grok.plist",
        tmuxSessions: ["hermes-agent-grok"],
        processPatterns: ["hermes_cli.main.*grok"],
        healthPatterns: [],
      },
    );
    const inventory = loadInventory(next);
    expect(inventory.targets["hermes-agent-grok"].provider).toBe("hermes-agent");
    expect(inventory.evis["evi-hermes-agent-grok"].provider).toBe("hermes-agent");
    expect(() =>
      setTargetConfig(next, {
        name: "hermes-agent-grok",
        provider: "hermes-agent",
        tmuxSessions: [],
        processPatterns: [],
        healthPatterns: [],
      }),
    ).toThrow("target already exists");
  });
});

describe("routes", () => {
  test("duplicate primary routes detect same surface", () => {
    const routes: Record<string, Route> = {
      a: {
        key: "a",
        channel: "telegram",
        accountId: "main",
        peerId: "1",
        targetEvi: "evi-a",
        mode: "primary",
      },
      b: {
        key: "b",
        channel: "telegram",
        accountId: "main",
        peerId: "1",
        targetEvi: "evi-b",
        mode: "primary",
      },
      c: {
        key: "c",
        channel: "telegram",
        accountId: "main",
        peerId: "1",
        targetEvi: "evi-c",
        mode: "mirror",
      },
    };
    const conflicts = duplicatePrimaryRoutes(routes);
    expect([...conflicts.keys()]).toEqual(["telegram\u0000main\u00001"]);
  });

  test("sets a route in config data", () => {
    const next = setRouteConfig(
      {
        evis: {
          "evi-a": {
            runtime: "claude-code-channels",
          },
        },
      },
      {
        key: "telegram:main",
        channel: "telegram",
        accountId: "main",
        peerId: "",
        targetEvi: "evi-a",
        mode: "primary",
      },
    );
    expect(
      (next.routes as Record<string, Record<string, string>>)["telegram:main"].target_evi,
    ).toBe("evi-a");
  });

  test("rejects duplicate primary routes unless forced", () => {
    const data = {
      evis: {
        "evi-a": { runtime: "claude-code-channels" },
        "evi-b": { runtime: "hermes-agent" },
      },
      routes: {
        "telegram:a": {
          channel: "telegram",
          account_id: "main",
          target_evi: "evi-a",
          mode: "primary",
        },
      },
    };
    const route = {
      key: "telegram:b",
      channel: "telegram",
      accountId: "main",
      peerId: "",
      targetEvi: "evi-b",
      mode: "primary",
    };
    expect(() => setRouteConfig(data, route)).toThrow("duplicate primary route");
    expect(setRouteConfig(data, route, true).routes).toBeTruthy();
  });
});

describe("identity routing", () => {
  test("creates a character from the public create command", () => {
    const root = mkdtempSync(join(tmpdir(), "evictl-create-character-test-"));
    try {
      const config = join(root, "config.json");
      expect(main(["create", "demo", "--config", config])).toBe(0);
      const data = JSON.parse(readFileSync(config, "utf8"));
      expect(data.identities.demo).toEqual({
        profile: "demo",
        memory_scope: "demo",
        active_evi: "",
        description: "",
      });
      expect(() => main(["create", "demo", "--profile", "demo", "--config", config])).toThrow(
        "create does not accept --profile",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("resolves a character engine without profile input", () => {
    const inventory = loadInventory({
      evis: {
        "evi-claude-code-channels": {
          runtime: "claude-code-channels",
          provider: "claude-code-channels",
          profile: "default",
        },
        "evi-claude-code-channels-demo": {
          runtime: "claude-code-channels",
          provider: "claude-code-channels",
          profile: "demo",
        },
      },
      identities: {
        demo: {
          profile: "demo",
          active_evi: "evi-claude-code-channels-demo",
        },
      },
    });
    expect(resolveCharacterEngineEvi(inventory, "demo", "claude-code-channels").eviId).toBe(
      "evi-claude-code-channels-demo",
    );
    expect(() => main(["switch", "demo", "--engine", "claude-code-channels"])).toThrow(
      "switch requires --character",
    );
  });

  test("lists engines through the public engine command", () => {
    const root = mkdtempSync(join(tmpdir(), "evictl-engine-list-test-"));
    try {
      const config = join(root, "config.json");
      writeFileSync(
        config,
        JSON.stringify({
          evis: {
            "evi-claude-code-channels-demo": {
              runtime: "claude-code-channels",
              provider: "claude-code-channels",
              profile: "demo",
            },
          },
          identities: {
            demo: {
              active_evi: "evi-claude-code-channels-demo",
            },
          },
        }),
      );
      expect(main(["engine", "list", "--character", "demo", "--json", "--config", config])).toBe(0);
      expect(() => main(["engine", "list", "--config", config])).toThrow(
        "engine list requires --character",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("requires deployment when a character engine has multiple equal matches", () => {
    const inventory = loadInventory({
      evis: {
        "evi-claude-code-channels-alpha": {
          runtime: "claude-code-channels",
          provider: "claude-code-channels",
          profile: "alpha",
        },
        "evi-claude-code-channels-beta": {
          runtime: "claude-code-channels",
          provider: "claude-code-channels",
          profile: "beta",
        },
      },
      identities: {
        demo: {
          profile: "demo",
        },
      },
    });
    expect(() => resolveCharacterEngineEvi(inventory, "demo", "claude-code-channels")).toThrow(
      "ambiguous engine deployment",
    );
    expect(resolveCharacterEngineEvi(inventory, "demo", "claude-code-channels", "beta").eviId).toBe(
      "evi-claude-code-channels-beta",
    );
  });

  test("sets identity and interface config data", () => {
    const identity: Identity = {
      identityId: "demo",
      profile: "demo",
      memoryScope: "demo",
      activeEvi: "evi-hermes-agent-grok",
      description: "",
    };
    const binding: InterfaceBinding = {
      key: "telegram:main",
      kind: "telegram",
      address: "main",
      identityId: "demo",
      mode: "primary",
    };
    const withIdentity = setIdentityConfig(
      {
        evis: {
          "evi-hermes-agent-grok": {
            runtime: "hermes-agent",
            provider: "hermes-agent",
          },
        },
      },
      identity,
    );
    const next = setInterfaceConfig(withIdentity, binding);
    expect(
      (next.identities as Record<string, Record<string, string>>).demo.active_evi,
    ).toBe("evi-hermes-agent-grok");
    expect(
      (next.interfaces as Record<string, Record<string, string>>)["telegram:main"].identity_id,
    ).toBe("demo");
  });

  test("switches an identity active processor", () => {
    const next = bindIdentityProcessorConfig(
      {
        evis: {
          "evi-hermes-agent-grok": {
            runtime: "hermes-agent",
            provider: "hermes-agent",
          },
          "evi-hermes-agent-codex": {
            runtime: "hermes-agent",
            provider: "hermes-agent",
          },
        },
        identities: {
          demo: {
            active_evi: "evi-hermes-agent-grok",
          },
        },
      },
      "demo",
      "id:evi-hermes-agent-codex",
    );
    expect(
      (next.identities as Record<string, Record<string, string>>).demo.active_evi,
    ).toBe("evi-hermes-agent-codex");
  });

  test("requires explicit processor provider profiles or ids", () => {
    const inventory = loadInventory({
      evis: {
        "evi-hermes-agent": {
          runtime: "hermes-agent",
          provider: "hermes-agent",
          profile: "default",
        },
        "evi-hermes-agent-demo": {
          runtime: "hermes-agent",
          provider: "hermes-agent",
          profile: "demo",
        },
        "evi-claude-code-channels-telegram": {
          runtime: "claude-code-channels",
          provider: "claude-code-channels",
          profile: "telegram",
          agent_id: "demo-telegram",
        },
      },
      identities: {
        demo: {
          profile: "demo",
          active_evi: "evi-hermes-agent-demo",
        },
      },
    });
    expect(() => resolveProcessorEvi(inventory, "demo", "hermes-agent")).toThrow(
      "ambiguous processor provider",
    );
    expect(resolveProcessorEvi(inventory, "demo", "hermes-agent:demo").eviId).toBe(
      "evi-hermes-agent-demo",
    );
    expect(resolveProcessorEvi(inventory, "demo", "claude-code-channels:telegram").eviId).toBe(
      "evi-claude-code-channels-telegram",
    );
    expect(resolveProcessorEvi(inventory, "demo", "id:evi-claude-code-channels-telegram").eviId).toBe(
      "evi-claude-code-channels-telegram",
    );
  });

  test("parses explicit processor selector options", () => {
    expect(processorSelectorFromArgs(["demo", "--provider", "claude-code-channels"], "switch")).toBe(
      "claude-code-channels",
    );
    expect(
      processorSelectorFromArgs(
        ["demo", "--provider", "hermes-agent", "--profile", "demo"],
        "switch",
      ),
    ).toBe("hermes-agent:demo");
    expect(processorSelectorFromArgs(["demo", "--id", "evi-openclaw"], "switch")).toBe("id:evi-openclaw");
    expect(() => processorSelectorFromArgs(["demo", "claude-code-channels"], "switch")).toThrow(
      "requires explicit processor selection",
    );
    expect(() => processorSelectorFromArgs(["demo", "--processor", "claude-code-channels"], "switch")).toThrow(
      "requires explicit processor selection",
    );
  });

  test("switches an identity processor by explicit provider profile", () => {
    const next = bindIdentityProcessorConfig(
      {
        evis: {
          "evi-hermes-agent-demo": {
            runtime: "hermes-agent",
            provider: "hermes-agent",
            profile: "demo",
          },
          "evi-claude-code-channels-telegram": {
            runtime: "claude-code-channels",
            provider: "claude-code-channels",
            profile: "telegram",
            agent_id: "demo-telegram",
          },
        },
        identities: {
          demo: {
            profile: "demo",
            active_evi: "evi-hermes-agent-demo",
          },
        },
      },
      "demo",
      "claude-code-channels:telegram",
    );
    expect(
      (next.identities as Record<string, Record<string, string>>).demo.active_evi,
    ).toBe("evi-claude-code-channels-telegram");
  });

  test("keeps only the active processor route when switching an identity processor", () => {
    const result = switchIdentityProcessorConfig(
      {
        evis: {
          "evi-hermes-agent-demo": {
            runtime: "hermes-agent",
            provider: "hermes-agent",
          },
          "evi-claude-code-channels-telegram": {
            runtime: "claude-code-channels",
            provider: "claude-code-channels",
            profile: "telegram",
          },
        },
        identities: {
          demo: {
            active_evi: "evi-hermes-agent-demo",
          },
        },
        interfaces: {
          "telegram:main": {
            kind: "telegram",
            address: "default",
            identity_id: "demo",
            mode: "primary",
          },
        },
        routes: {
          "telegram:hermes-agent:demo": {
            channel: "telegram",
            account_id: "default",
            target_evi: "evi-hermes-agent-demo",
            mode: "primary",
          },
          "telegram:claude-code-channels:telegram": {
            channel: "telegram",
            account_id: "default",
            target_evi: "evi-claude-code-channels-telegram",
            mode: "standby",
          },
        },
      },
      "demo",
      "id:evi-claude-code-channels-telegram",
    );
    const routes = result.data.routes as Record<string, Record<string, string>>;
    expect(
      (result.data.identities as Record<string, Record<string, string>>).demo.active_evi,
    ).toBe("evi-claude-code-channels-telegram");
    expect(routes["telegram:hermes-agent:demo"]).toBeUndefined();
    expect(routes["telegram:claude-code-channels:telegram"].mode).toBe("primary");
    expect(result.previousRuntime).toBe("hermes-agent");
    expect(result.nextRuntime).toBe("claude-code-channels");
  });

  test("marks only active identity and primary route runtimes as in use", () => {
    const inventory = loadInventory({
      evis: {
        "evi-hermes-agent-demo": {
          runtime: "hermes-agent",
          provider: "hermes-agent",
        },
        "evi-claude-code-channels-telegram": {
          runtime: "claude-code-channels",
          provider: "claude-code-channels",
        },
      },
      identities: {
        demo: {
          active_evi: "evi-claude-code-channels-telegram",
        },
      },
      routes: {
        "telegram:claude-code-channels:telegram": {
          channel: "telegram",
          account_id: "default",
          target_evi: "evi-claude-code-channels-telegram",
          mode: "primary",
        },
        "telegram:hermes-agent:demo": {
          channel: "telegram",
          account_id: "default",
          target_evi: "evi-hermes-agent-demo",
          mode: "standby",
        },
      },
    });
    expect(runtimeInUse(inventory, "claude-code-channels")).toBe(true);
    expect(runtimeInUse(inventory, "hermes-agent")).toBe(false);
  });

  test("does not treat orphan primary routes as runtime usage", () => {
    const inventory = loadInventory({
      evis: {
        "evi-hermes-agent-hermes": {
          runtime: "hermes-agent",
          provider: "hermes-agent",
        },
      },
      routes: {
        "telegram:hermes-agent:hermes": {
          channel: "telegram",
          account_id: "default",
          target_evi: "evi-hermes-agent-hermes",
          mode: "primary",
        },
      },
    });
    expect(runtimeInUse(inventory, "hermes-agent")).toBe(false);
  });

  test("builds a Claude Code Channels launch plan from active interfaces", () => {
    const inventory = loadInventory({
      evis: {
        "evi-claude-code-channels-demo": {
          runtime: "claude-code-channels",
          provider: "claude-code-channels",
        },
      },
      identities: {
        demo: {
          active_evi: "evi-claude-code-channels-demo",
        },
      },
      interfaces: {
        "discord:main": {
          kind: "discord",
          identity_id: "demo",
        },
        "telegram:main": {
          kind: "telegram",
          identity_id: "demo",
        },
      },
    });
    const plan = claudeCodeChannelsLaunchPlan(inventory, "demo");
    expect(plan.args).toEqual([
      "--channels",
      "plugin:discord@claude-plugins-official",
      "--channels",
      "plugin:telegram@claude-plugins-official",
    ]);
    expect(plan.settings.allowedChannelPlugins.map((channel) => channel.plugin)).toEqual([
      "discord",
      "telegram",
    ]);
  });
});

describe("Claude Code Channels", () => {
  test("parses channel plugins from a start command", () => {
    const plugins = claudeCodeChannelPluginsFromScript(
      "claude --channels plugin:telegram@claude-plugins-official --channels plugin:discord@claude-plugins-official",
    );
    expect(plugins).toEqual([
      { plugin: "discord", marketplace: "claude-plugins-official" },
      { plugin: "telegram", marketplace: "claude-plugins-official" },
    ]);
  });

  test("builds a Telegram launch script for a durable tmux session", () => {
    const script = claudeCodeChannelsStartScript({
      identityId: "nukoevi",
      sessionName: "claude-code-channels-nukoevi",
      workspace: "/Users/example",
      channel: { plugin: "telegram", marketplace: "claude-plugins-official" },
      env: { ANTHROPIC_BASE_URL: "https://api.example.test" },
      envFile: "/Users/example/.local/share/claude-telegram-channel/claude.env",
      dangerouslySkipPermissions: false,
    });
    expect(script).toContain("session_name='claude-code-channels-nukoevi'");
    expect(script).toContain("env_file='/Users/example/.local/share/claude-telegram-channel/claude.env'");
    expect(script).toContain('telegram_env_file="$HOME/.claude/channels/telegram/.env"');
    expect(script).toContain("source \"$env_file\"");
    expect(script).toContain('source "$telegram_env_file"');
    expect(script).toContain("export ANTHROPIC_BASE_URL='https://api.example.test'");
    expect(script).toContain("claude_args+=('--bare')");
    expect(script).toContain("'ANTHROPIC_API_KEY'");
    expect(script).toContain("'TELEGRAM_BOT_TOKEN'");
    expect(script).toContain('tmux_env_args+=(-e "$key=${(P)key}")');
    expect(script).toContain('command="exec ${claude_args[*]}"');
    expect(script).toContain("'--name'");
    expect(script).toContain("'nukoevi-telegram'");
    expect(script).toContain("plugin:telegram@claude-plugins-official");
    expect(script).not.toContain("--dangerously-skip-permissions");
  });

  test("builds a launch agent plist for the channel start script", () => {
    const plist = claudeCodeChannelsLaunchAgentPlist({
      label: "com.local.claude-code-channels",
      startScript: "/Users/example/.local/share/claude-telegram-channel/start.sh",
      stdoutPath: "/Users/example/.local/share/claude-telegram-channel/launchd.out.log",
      stderrPath: "/Users/example/.local/share/claude-telegram-channel/launchd.err.log",
    });
    expect(plist).toContain("<string>com.local.claude-code-channels</string>");
    expect(plist).toContain("<string>/bin/zsh</string>");
    expect(plist).toContain("start.sh</string>");
  });

  test("stores Telegram tokens as shell-safe environment content", () => {
    expect(telegramEnvContent("abc'def")).toBe("TELEGRAM_BOT_TOKEN='abc'\\''def'\n");
  });

  test("stores Claude API keys as shell-safe environment content", () => {
    expect(claudeApiEnvContent("sk-ant-abc'def")).toBe(
      "ANTHROPIC_API_KEY='sk-ant-abc'\\''def'\n",
    );
  });

  test("prefers an Anthropic API key env var for channel auth", () => {
    const status = resolveClaudeCodeChannelsAuthStatus({
      envFile: "/tmp/missing-claude.env",
      env: { ANTHROPIC_API_KEY: "sk-ant-test" },
      claudeAuthStatus: { code: 1, stdout: "", stderr: "not logged in" },
    });
    expect(status).toEqual({
      authType: "anthropic-api-key",
      configured: true,
      source: "env:ANTHROPIC_API_KEY",
      envFile: "/tmp/missing-claude.env",
      notes: [],
    });
  });

  test("detects Claude Code OAuth when no API key is configured", () => {
    const status = resolveClaudeCodeChannelsAuthStatus({
      envFile: "/tmp/missing-claude.env",
      env: {},
      claudeAuthStatus: { code: 0, stdout: "Logged in with claude.ai", stderr: "" },
    });
    expect(status.authType).toBe("claude-code-oauth");
    expect(status.configured).toBe(true);
    expect(status.source).toBe("claude auth status");
  });

  test("detects an Anthropic API key in the launch env file", () => {
    const root = mkdtempSync(join(tmpdir(), "evictl-claude-auth-test-"));
    try {
      const envFile = join(root, "claude.env");
      writeFileSync(envFile, "ANTHROPIC_API_KEY='sk-ant-test'\n");
      const status = resolveClaudeCodeChannelsAuthStatus({
        envFile,
        env: {},
        claudeAuthStatus: { code: 1, stdout: "", stderr: "not logged in" },
      });
      expect(status.authType).toBe("anthropic-api-key");
      expect(status.configured).toBe(true);
      expect(status.source).toBe(envFile);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("creates evictl inventory for a Telegram-backed character", () => {
    const data = claudeCodeChannelsTelegramConfig(
      {},
      "nukoevi",
      "/Users/example",
      "/Users/example/.local/share/claude-telegram-channel",
      { ANTHROPIC_MODEL: "claude-sonnet-4-6" },
      true,
    );
    const inventory = loadInventory(data);
    expect(inventory.identities.nukoevi.activeEvi).toBe("evi-claude-code-channels-nukoevi");
    expect(inventory.evis["evi-claude-code-channels-nukoevi"].sessionId).toBe(
      "claude-code-channels-nukoevi",
    );
    expect(inventory.evis["evi-claude-code-channels-nukoevi"].env.ANTHROPIC_MODEL).toBe(
      "claude-sonnet-4-6",
    );
    expect(inventory.interfaces["telegram:main"].identityId).toBe("nukoevi");
    expect(inventory.routes["telegram:claude-code-channels:nukoevi"].mode).toBe("primary");
  });
});

describe("process parsing", () => {
  test("ignores pgrep self matches", () => {
    const pids = parseProcessPids(
      [
        "10 pgrep -af openclaw|ai.openclaw.gateway",
        "20 /opt/homebrew/bin/bun ./dist/evictl doctor",
        "25 grep -E openclaw|demo-telegram",
        "30 claude --channels plugin:telegram@claude-plugins-official --name demo-telegram",
      ].join("\n"),
      ["openclaw", "demo-telegram"],
      20,
    );
    expect(pids).toEqual([30]);
  });
});

describe("memory events", () => {
  test("creates and appends feedback events", () => {
    const root = mkdtempSync(join(tmpdir(), "evictl-memory-test-"));
    try {
      const inventory = loadInventory({
        evis: {
          "evi-a": {
            runtime: "claude-code-channels",
          },
        },
      });
      const event = createFeedbackEvent(
        inventory,
        "evi-a",
        {
          verdict: "remember",
          text: "Prefer explicit route ownership.",
          subject: "route",
          source: "user",
          confidence: 0.9,
        },
        "event-1",
        "2026-05-13T00:00:00.000Z",
      );
      const path = appendMemoryEvent(join(root, "events.jsonl"), event);
      const lines = readFileSync(path, "utf8").trim().split("\n");
      expect(lines.length).toBe(1);
      expect(JSON.parse(lines[0]).target_evi).toBe("evi-a");
      expect(readMemoryEvents(path)[0].text).toBe("Prefer explicit route ownership.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects feedback for unknown evi", () => {
    const inventory = loadInventory({});
    expect(() =>
      createFeedbackEvent(inventory, "evi-missing", { verdict: "remember", text: "x" }),
    ).toThrow("unknown evi");
  });

  test("creates task events for send", () => {
    const inventory = loadInventory({
      evis: {
        "evi-a": {
          runtime: "claude-code-channels",
        },
      },
    });
    const event = createTaskEvent(
      inventory,
      "evi-a",
      {
        text: "Run the check suite.",
        subject: "check",
        source: "user",
      },
      "task-1",
      "2026-05-13T00:00:00.000Z",
    );
    expect(event.type).toBe("task");
    expect(event.verdict).toBe("queued");
    expect(queueTaskEvent(inventory, "evi-a", "Follow up").text).toBe("Follow up");
  });

  test("promotes feedback events into compiled notes", () => {
    const root = mkdtempSync(join(tmpdir(), "evictl-promote-test-"));
    try {
      const eventLog = join(root, "events.jsonl");
      const compiledNotes = join(root, "memory");
      appendMemoryEvent(eventLog, {
        id: "event-1",
        timestamp: "2026-05-13T00:00:00.000Z",
        type: "feedback",
        source: "user",
        target_evi: "evi-a",
        subject: "route",
        verdict: "remember",
        confidence: 1,
        text: "Prefer explicit route ownership.",
      });
      const result = promoteMemoryEvents(eventLog, compiledNotes);
      const note = readFileSync(result.notePath, "utf8");
      expect(result.eventCount).toBe(1);
      expect(note).toContain("## evi-a");
      expect(note).toContain("Prefer explicit route ownership.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("compiles empty memory notes", () => {
    expect(compileMemoryNotes([])).toContain("No memory events promoted yet.");
  });

  test("syncs network memory into runtime-specific sinks", () => {
    const root = mkdtempSync(join(tmpdir(), "evictl-network-memory-test-"));
    try {
      const hermesState = join(root, "hermes-agent");
      const claudeCodeChannelsState = join(root, "claude-code-channels");
      const openclawWorkspace = join(root, "openclaw");
      mkdirSync(join(hermesState, "memories"), { recursive: true });
      mkdirSync(claudeCodeChannelsState, { recursive: true });
      mkdirSync(join(openclawWorkspace, "memory"), { recursive: true });
      writeFileSync(join(hermesState, "memories", "MEMORY.md"), "Hermes Agent durable fact\n");
      writeFileSync(join(openclawWorkspace, "MEMORY.md"), "OpenClaw durable fact\n");
      writeFileSync(join(openclawWorkspace, "USER.md"), "OpenClaw user profile\n");
      writeFileSync(join(openclawWorkspace, "memory", "2026-05-15.md"), "OpenClaw daily note\n");
      writeFileSync(
        join(claudeCodeChannelsState, "evictl-network-memory.md"),
        "Claude channel fact\n",
      );

      const inventory = loadInventory({
        memory: {
          compiled_notes: join(root, "compiled"),
        },
        evis: {
          "evi-hermes-agent-a": {
            runtime: "hermes-agent",
            provider: "hermes-agent",
            state_dir: hermesState,
            network_id: "replicated-evi",
          },
          "evi-openclaw-a": {
            runtime: "openclaw",
            provider: "openclaw",
            workspace: openclawWorkspace,
            network_id: "replicated-evi",
          },
          "evi-claude-code-channels-a": {
            runtime: "claude-code-channels",
            provider: "claude-code-channels",
            state_dir: claudeCodeChannelsState,
            network_id: "replicated-evi",
          },
        },
      });
      const compiled = compileNetworkMemory(inventory);
      expect(compiled).toContain("Hermes Agent durable fact");
      expect(compiled).toContain("OpenClaw durable fact");
      expect(compiled).toContain("OpenClaw user profile");
      expect(compiled).toContain("OpenClaw daily note");
      const result = syncNetworkMemory(inventory);
      expect(result.sources).toBe(5);
      expect(result.sinks).toBe(3);
      expect(readFileSync(join(root, "compiled", "network.md"), "utf8")).toContain(
        "evictl Replicated Evi Memory",
      );
      expect(readFileSync(join(hermesState, "memories", "MEMORY.md"), "utf8")).toContain(
        "evictl:network-memory begin",
      );
      expect(readFileSync(join(openclawWorkspace, "MEMORY.md"), "utf8")).toContain(
        "evictl:network-memory begin",
      );
      expect(
        readFileSync(join(claudeCodeChannelsState, "evictl-network-memory.md"), "utf8"),
      ).toContain("evictl:network-memory begin");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("searches events and compiled notes", () => {
    const root = mkdtempSync(join(tmpdir(), "evictl-memory-search-test-"));
    try {
      const eventLog = join(root, "events.jsonl");
      const compiledNotes = join(root, "memory");
      mkdirSync(compiledNotes, { recursive: true });
      appendMemoryEvent(eventLog, {
        id: "event-1",
        timestamp: "2026-05-13T00:00:00.000Z",
        type: "feedback",
        source: "user",
        target_evi: "evi-a",
        subject: "handoff",
        verdict: "remember",
        confidence: 1,
        text: "Prefer explicit route ownership.",
      });
      writeFileSync(join(compiledNotes, "feedback.md"), "A compiled route ownership note\n");
      const inventory = loadInventory({
        memory: {
          event_log: eventLog,
          compiled_notes: compiledNotes,
        },
      });
      const results = searchMemory(inventory, "ownership");
      expect(results.map((result) => result.kind)).toEqual(["feedback", "note"]);
      expect(results[0].targetEvi).toBe("evi-a");
      expect(results[1].line).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ignores malformed memory event lines", () => {
    const root = mkdtempSync(join(tmpdir(), "evictl-memory-malformed-test-"));
    try {
      const eventLog = join(root, "events.jsonl");
      writeFileSync(eventLog, "not-json\n");
      expect(readMemoryEvents(eventLog)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("tmux send", () => {
  test("sends text as literal keys with a separate Enter", () => {
    const commands = tmuxSendCommands("evi-session", "C-c rm -rf /");
    expect(commands).toEqual([
      ["tmux", "send-keys", "-t", "evi-session", "-l", "--", "C-c rm -rf /"],
      ["tmux", "send-keys", "-t", "evi-session", "Enter"],
    ]);
  });

  test("does not interpret tmux key names embedded in text", () => {
    const [literal] = tmuxSendCommands("s", "Enter PageDown -l");
    expect(literal).toContain("-l");
    expect(literal).toContain("--");
    expect(literal[literal.length - 1]).toBe("Enter PageDown -l");
  });

  test("builds bounded capture commands", () => {
    expect(tmuxCaptureCommand("evi-session", 25)).toEqual([
      "tmux",
      "capture-pane",
      "-pt",
      "evi-session",
      "-S",
      "-25",
    ]);
  });

  test("send requires a tmux session unless queue-only", () => {
    const root = mkdtempSync(join(tmpdir(), "evictl-send-tmux-test-"));
    try {
      const config = join(root, "config.json");
      writeFileSync(
        config,
        JSON.stringify({
          memory: {
            event_log: join(root, "events.jsonl"),
          },
          evis: {
            "evi-hermes-agent-grok": {
              runtime: "hermes-agent",
              provider: "hermes-agent",
              profile: "grok",
            },
          },
        }),
      );
      expect(main(["send", "evi-hermes-agent-grok", "--text", "Search X", "--config", config])).toBe(1);
      expect(
        main([
          "send",
          "evi-hermes-agent-grok",
          "--text",
          "Search X",
          "--queue-only",
          "--config",
          config,
        ]),
      ).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("send accepts an identity target and resolves the active processor", () => {
    const root = mkdtempSync(join(tmpdir(), "evictl-send-identity-test-"));
    try {
      const config = join(root, "config.json");
      const eventLog = join(root, "events.jsonl");
      writeFileSync(
        config,
        JSON.stringify({
          memory: {
            event_log: eventLog,
          },
          evis: {
            "evi-hermes-agent-grok": {
              runtime: "hermes-agent",
              provider: "hermes-agent",
              profile: "grok",
            },
          },
          identities: {
            demo: {
              active_evi: "evi-hermes-agent-grok",
            },
          },
        }),
      );
      expect(
        main(["send", "demo", "--text", "Search X", "--queue-only", "--config", config]),
      ).toBe(0);
      const [event] = readMemoryEvents(eventLog);
      expect(event.target_evi).toBe("evi-hermes-agent-grok");
      expect(event.subject).toBe("demo");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("discovery", () => {
  test("discovers Hermes Agent and Claude Code Channels launch agents", () => {
    const root = mkdtempSync(join(tmpdir(), "evictl-discover-test-"));
    try {
      const discovery = discoverFromPlistRecords(
        [
          {
            path: "~/Library/LaunchAgents/ai.hermes.gateway-demo.plist",
            data: {
              Label: "ai.hermes.gateway-demo",
              ProgramArguments: [
                "~/.hermes/hermes-agent/venv/bin/python",
                "-m",
                "hermes_cli.main",
                "--profile",
                "demo",
                "gateway",
                "run",
              ],
              EnvironmentVariables: {
                HERMES_HOME: "~/.hermes/profiles/demo",
              },
              WorkingDirectory: "~/.hermes/hermes-agent",
            },
          },
          {
            path: join(root, "com.local.claude-code-channels.plist"),
            data: {
              Label: "com.local.claude-code-channels",
              ProgramArguments: ["/bin/zsh", join(root, "start.sh")],
              WorkingDirectory: "~/Documents/Codex/claude-code-channels-demo",
            },
          },
        ],
        { "claude-code-channels": true, "hermes-agent": false },
      );
      expect(Object.keys(discovery.targets).sort()).toEqual([
        "claude-code-channels",
        "hermes-agent",
      ]);
      expect(discovery.evis["evi-hermes-agent-demo"].runtime).toBe("hermes-agent");
      expect(discovery.evis["evi-claude-code-channels-default"].runtime).toBe(
        "claude-code-channels",
      );
      expect(discovery.interfaces["telegram:main"].identityId).toBe("default");
      expect(discovery.routes["telegram:hermes-agent:demo"]).toBeUndefined();
      expect(discovery.routes["telegram:claude-code-channels:default"].mode).toBe("primary");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("discovers Discord and Telegram as interfaces for Claude Code Channels", () => {
    const root = mkdtempSync(join(tmpdir(), "evictl-discover-channels-test-"));
    try {
      const startScript = join(root, "start.sh");
      writeFileSync(
        startScript,
        [
          "session_name=\"claude-code-channels-demo\"",
          "exec tmux new-session -d -s \"${session_name}\" \"claude --channels plugin:telegram@claude-plugins-official --channels plugin:discord@claude-plugins-official --name demo-telegram\"",
        ].join("\n"),
      );
      const discovery = discoverFromPlistRecords(
        [
          {
            path: join(root, "com.local.claude-code-channels.plist"),
            data: {
              Label: "com.local.claude-code-channels",
              ProgramArguments: ["/bin/zsh", startScript],
              WorkingDirectory: "~/Documents/Codex/claude-code-channels-demo",
            },
          },
        ],
        { "claude-code-channels": true },
      );
      expect(discovery.evis["evi-claude-code-channels-demo"].profile).toBe("demo");
      expect(discovery.interfaces["discord:main"].identityId).toBe("demo");
      expect(discovery.interfaces["telegram:main"].identityId).toBe("demo");
      expect(discovery.routes["discord:claude-code-channels:demo"].mode).toBe("primary");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("merges discovered setup into config without dropping existing data", () => {
    const root = mkdtempSync(join(tmpdir(), "evictl-merge-discovery-test-"));
    try {
      const discovery = discoverFromPlistRecords(
        [
          {
            path: join(root, "com.local.claude-code-channels.plist"),
            data: {
              Label: "com.local.claude-code-channels",
              ProgramArguments: ["/bin/zsh", join(root, "start.sh")],
              WorkingDirectory: "~/Documents/Codex/claude-code-channels",
            },
          },
        ],
        { "claude-code-channels": true },
      );
      const merged = mergeConfigData(
        {
          routes: {
            "telegram:manual": {
              channel: "telegram",
              target_evi: "evi-manual",
            },
          },
          memory: {
            event_log: "/tmp/custom-events.jsonl",
          },
        },
        discovery,
      );
      expect(Object.keys(merged.routes as Record<string, unknown>).sort()).toEqual([
        "telegram:claude-code-channels:default",
        "telegram:manual",
      ]);
      expect((merged.memory as Record<string, unknown>).event_log).toBe("/tmp/custom-events.jsonl");
      expect(
        (merged.evis as Record<string, unknown>)["evi-claude-code-channels-default"],
      ).toBeTruthy();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("builds an adoption report for migration without deleting native runtime files", () => {
    const root = mkdtempSync(join(tmpdir(), "evictl-migration-report-test-"));
    try {
      const discovery = discoverFromPlistRecords(
        [
          {
            path: "~/Library/LaunchAgents/ai.hermes.gateway-demo.plist",
            data: {
              Label: "ai.hermes.gateway-demo",
              ProgramArguments: ["python", "-m", "hermes_cli.main", "--profile", "demo"],
              EnvironmentVariables: {
                HERMES_HOME: join(root, "hermes"),
              },
            },
          },
          {
            path: join(root, "ai.openclaw.gateway.plist"),
            data: {
              Label: "ai.openclaw.gateway",
              ProgramArguments: ["openclaw", "--profile", "demo"],
              WorkingDirectory: join(root, "openclaw", "agent"),
            },
          },
        ],
        { "hermes-agent": true, openclaw: false },
      );
      const report = buildMigrationReport(discovery, join(root, "config.json"));
      expect(report.willDelete).toEqual([]);
      expect(report.willWrite).toEqual([join(root, "config.json")]);
      expect(report.adoptions.map((item) => item.eviId).sort()).toEqual([
        "evi-hermes-agent-demo",
        "evi-openclaw-demo",
      ]);
      expect(report.adoptions.find((item) => item.runtime === "hermes-agent")?.adoption).toBe(
        "primary-route",
      );
      expect(report.adoptions.find((item) => item.runtime === "openclaw")?.adoption).toBe(
        "processor-candidate",
      );
      expect(
        report.adoptions.find((item) => item.runtime === "openclaw")?.memoryPolicy,
      ).toContain("stay native");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("skips duplicate primary routes during discovery", () => {
    const root = mkdtempSync(join(tmpdir(), "evictl-conflict-discovery-test-"));
    try {
      const discovery = discoverFromPlistRecords(
        [
          {
            path: "~/Library/LaunchAgents/ai.hermes.gateway-demo.plist",
            data: {
              Label: "ai.hermes.gateway-demo",
              ProgramArguments: ["python", "-m", "hermes_cli.main", "--profile", "demo"],
            },
          },
          {
            path: join(root, "com.local.claude-code-channels.plist"),
            data: {
              Label: "com.local.claude-code-channels",
              ProgramArguments: ["/bin/zsh", join(root, "start.sh")],
            },
          },
        ],
        { "claude-code-channels": true, "hermes-agent": true },
      );
      expect(discovery.routes["telegram:hermes-agent:demo"]).toBeUndefined();
      expect(discovery.routes["telegram:claude-code-channels:default"]).toBeUndefined();
      expect(discovery.warnings.some((warning) => warning.includes("route conflict"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
