import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ALIASES,
  DEFAULT_TARGETS,
  type Route,
  appendMemoryEvent,
  compileMemoryNotes,
  compileNetworkMemory,
  createFeedbackEvent,
  createTaskEvent,
  discoverFromPlistRecords,
  duplicatePrimaryRoutes,
  loadInventory,
  mergeConfigData,
  parseProcessPids,
  promoteMemoryEvents,
  queueTaskEvent,
  readMemoryEvents,
  resolveProvider,
  resolveTarget,
  setRouteConfig,
  spawnEviConfig,
  syncNetworkMemory,
  tmuxSendCommands,
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

describe("resolveProvider", () => {
  test("resolves provider aliases", () => {
    expect(resolveProvider("claude-code-channels")).toBe("claude-code-channels");
    expect(resolveProvider("hermes")).toBe("hermes-agent");
    expect(resolveProvider("open-claw")).toBe("openclaw");
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
    const root = mkdtempSync(join(tmpdir(), "evictl-test-empty-"));
    try {
      process.env.XDG_CONFIG_HOME = root;
      const inventory = loadInventory();
      expect(new Set(Object.keys(inventory.evis))).toEqual(
        new Set(["evi-openclaw", "evi-hermes", "evi-ccc"]),
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

  test("spawns configured evi inventory", () => {
    const next = spawnEviConfig(
      {},
      {
        eviId: "evi-ccc-research",
        runtime: "ccc",
        provider: "claude-code-channels",
        profile: "research",
        agentId: "research-agent",
        sessionId: "research-session",
        workspace: "/tmp/research",
        stateDir: "/tmp/research-state",
        networkId: "replicated-evi",
        replicaOf: "",
        role: "replica",
      },
    );
    const inventory = loadInventory(next);
    expect(inventory.evis["evi-ccc-research"].profile).toBe("research");
    expect(inventory.evis["evi-ccc-research"].provider).toBe("claude-code-channels");
  });

  test("spawn rejects duplicate evi ids unless forced", () => {
    const data = {
      evis: {
        "evi-ccc-research": {
          runtime: "ccc",
        },
      },
    };
    const evi = {
      eviId: "evi-ccc-research",
      runtime: "ccc",
      provider: "claude-code-channels",
      profile: "research",
      agentId: "",
      sessionId: "",
      workspace: "",
      stateDir: "",
      networkId: "replicated-evi",
      replicaOf: "",
      role: "replica",
    };
    expect(() => spawnEviConfig(data, evi)).toThrow("evi already exists");
    expect(spawnEviConfig(data, evi, true).evis).toBeTruthy();
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
            runtime: "ccc",
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
        "evi-a": { runtime: "ccc" },
        "evi-b": { runtime: "hermes" },
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

describe("process parsing", () => {
  test("ignores pgrep self matches", () => {
    const pids = parseProcessPids(
      [
        "10 pgrep -af openclaw|ai.openclaw.gateway",
        "20 /opt/homebrew/bin/bun ./dist/evictl doctor",
        "30 claude --channels plugin:telegram@claude-plugins-official --name nukoevi-telegram",
      ].join("\n"),
      ["openclaw", "nukoevi-telegram"],
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
            runtime: "ccc",
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
          runtime: "ccc",
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
      const hermesState = join(root, "hermes");
      const cccState = join(root, "ccc");
      const openclawWorkspace = join(root, "openclaw");
      mkdirSync(join(hermesState, "memories"), { recursive: true });
      mkdirSync(cccState, { recursive: true });
      mkdirSync(openclawWorkspace, { recursive: true });
      writeFileSync(join(hermesState, "memories", "MEMORY.md"), "Hermes durable fact\n");
      writeFileSync(join(openclawWorkspace, "MEMORY.md"), "OpenClaw durable fact\n");
      writeFileSync(join(cccState, "evictl-network-memory.md"), "Claude channel fact\n");

      const inventory = loadInventory({
        memory: {
          compiled_notes: join(root, "compiled"),
        },
        evis: {
          "evi-hermes-a": {
            runtime: "hermes",
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
          "evi-ccc-a": {
            runtime: "ccc",
            provider: "claude-code-channels",
            state_dir: cccState,
            network_id: "replicated-evi",
          },
        },
      });
      const compiled = compileNetworkMemory(inventory);
      expect(compiled).toContain("Hermes durable fact");
      expect(compiled).toContain("OpenClaw durable fact");
      const result = syncNetworkMemory(inventory);
      expect(result.sources).toBe(3);
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
      expect(readFileSync(join(cccState, "evictl-network-memory.md"), "utf8")).toContain(
        "evictl:network-memory begin",
      );
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
});

describe("discovery", () => {
  test("discovers Hermes and Claude Code Channels launch agents", () => {
    const discovery = discoverFromPlistRecords(
      [
        {
          path: "~/Library/LaunchAgents/ai.hermes.gateway-nukoevi.plist",
          data: {
            Label: "ai.hermes.gateway-nukoevi",
            ProgramArguments: [
              "~/.hermes/hermes-agent/venv/bin/python",
              "-m",
              "hermes_cli.main",
              "--profile",
              "nukoevi",
              "gateway",
              "run",
            ],
            EnvironmentVariables: {
              HERMES_HOME: "~/.hermes/profiles/nukoevi",
            },
            WorkingDirectory: "~/.hermes/hermes-agent",
          },
        },
        {
          path: "~/Library/LaunchAgents/com.local.claude-telegram-channel.plist",
          data: {
            Label: "com.local.claude-telegram-channel",
            ProgramArguments: ["/bin/zsh", "~/.local/share/claude-telegram-channel/start.sh"],
            WorkingDirectory: "~/Documents/Codex/hermes-agent-claude-code-channels",
          },
        },
      ],
      { ccc: true, hermes: false },
    );
    expect(Object.keys(discovery.targets).sort()).toEqual(["ccc", "hermes"]);
    expect(discovery.evis["evi-hermes-nukoevi"].runtime).toBe("hermes");
    expect(discovery.evis["evi-ccc-telegram"].runtime).toBe("ccc");
    expect(discovery.routes["telegram:hermes:nukoevi"].mode).toBe("standby");
    expect(discovery.routes["telegram:ccc:default"].mode).toBe("primary");
  });

  test("merges discovered setup into config without dropping existing data", () => {
    const discovery = discoverFromPlistRecords(
      [
        {
          path: "/tmp/com.local.claude-telegram-channel.plist",
          data: {
            Label: "com.local.claude-telegram-channel",
            ProgramArguments: ["/bin/zsh", "~/.local/share/claude-telegram-channel/start.sh"],
            WorkingDirectory: "~/Documents/Codex/claude-code-channels",
          },
        },
      ],
      { ccc: true },
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
      "telegram:ccc:default",
      "telegram:manual",
    ]);
    expect((merged.memory as Record<string, unknown>).event_log).toBe("/tmp/custom-events.jsonl");
    expect((merged.evis as Record<string, unknown>)["evi-ccc-telegram"]).toBeTruthy();
  });

  test("demotes duplicate primary routes during discovery", () => {
    const discovery = discoverFromPlistRecords(
      [
        {
          path: "~/Library/LaunchAgents/ai.hermes.gateway-nukoevi.plist",
          data: {
            Label: "ai.hermes.gateway-nukoevi",
            ProgramArguments: ["python", "-m", "hermes_cli.main", "--profile", "nukoevi"],
          },
        },
        {
          path: "~/Library/LaunchAgents/com.local.claude-telegram-channel.plist",
          data: {
            Label: "com.local.claude-telegram-channel",
            ProgramArguments: ["/bin/zsh", "~/.local/share/claude-telegram-channel/start.sh"],
          },
        },
      ],
      { ccc: true, hermes: true },
    );
    expect(discovery.routes["telegram:hermes:nukoevi"].mode).toBe("standby");
    expect(discovery.routes["telegram:ccc:default"].mode).toBe("standby");
    expect(discovery.warnings.some((warning) => warning.includes("route conflict"))).toBe(true);
  });
});
