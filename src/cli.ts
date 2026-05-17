#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

export type Target = {
  name: string;
  provider?: string;
  label?: string;
  plist?: string;
  tmuxSessions: string[];
  processPatterns: string[];
  healthPatterns: string[];
};

export type TargetStatus = {
  name: string;
  loaded: boolean;
  running: boolean;
  healthy: boolean;
  pids: number[];
  tmuxSessions: string[];
  notes: string[];
};

export type Evi = {
  eviId: string;
  runtime: string;
  provider: string;
  profile: string;
  agentId: string;
  sessionId: string;
  workspace: string;
  stateDir: string;
  networkId: string;
  replicaOf: string;
  role: string;
  modelProvider: string;
  model: string;
  baseUrl: string;
  env: Record<string, string>;
};

export type Identity = {
  identityId: string;
  profile: string;
  memoryScope: string;
  activeEvi: string;
  description: string;
};

export type InterfaceBinding = {
  key: string;
  kind: string;
  address: string;
  identityId: string;
  mode: string;
};

export type Route = {
  key: string;
  channel: string;
  targetEvi: string;
  accountId: string;
  peerId: string;
  mode: string;
};

export type Inventory = {
  targets: Record<string, Target>;
  evis: Record<string, Evi>;
  identities: Record<string, Identity>;
  interfaces: Record<string, InterfaceBinding>;
  routes: Record<string, Route>;
  memoryEventLog: string;
  memoryCompiledNotes: string;
};

export type MemoryEvent = {
  id: string;
  timestamp: string;
  type: string;
  source: string;
  target_evi: string;
  subject: string;
  verdict: string;
  confidence: number;
  text: string;
};

export type MemorySearchResult = {
  kind: string;
  path: string;
  line: number;
  targetEvi: string;
  timestamp: string;
  subject: string;
  verdict: string;
  text: string;
};

export type SendResult = {
  event: MemoryEvent;
  eventLog: string;
  delivered: boolean;
  method: string;
  detail: string;
};

export type ClaudeCodeChannelsLaunchPlan = {
  identityId: string;
  eviId: string;
  channels: ClaudeCodeChannelPlugin[];
  args: string[];
  settings: {
    channelsEnabled: true;
    allowedChannelPlugins: ClaudeCodeChannelPlugin[];
  };
};

export type DiscoverySource = {
  runtime: string;
  kind: string;
  path: string;
  label: string;
  status: string;
};

export type Discovery = {
  targets: Record<string, Target>;
  evis: Record<string, Evi>;
  identities: Record<string, Identity>;
  interfaces: Record<string, InterfaceBinding>;
  routes: Record<string, Route>;
  memory: {
    eventLog: string;
    compiledNotes: string;
  };
  sources: DiscoverySource[];
  warnings: string[];
};

export type PlistRecord = {
  path: string;
  data: Record<string, unknown>;
};

type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type DispatchTaskOptions = {
  queueOnly: boolean;
};

type DispatchTaskResult = {
  delivered: boolean;
  method: string;
  detail: string;
};

export type GlobalOptions = {
  headless: boolean;
};

export type ParsedCliArgs = {
  command: string | undefined;
  args: string[];
  options: GlobalOptions;
};

type Command = (args: string[], options: GlobalOptions) => number;

const DEFAULT_GLOBAL_OPTIONS: GlobalOptions = {
  headless: false,
};

const VALUE_OPTIONS = new Set([
  "--account",
  "--account-id",
  "--active-evi",
  "--active-processor",
  "--address",
  "--agent",
  "--agent-id",
  "--channel",
  "--config",
  "--confidence",
  "--description",
  "--id",
  "--identity",
  "--interval",
  "--health",
  "--kind",
  "--label",
  "--lines",
  "--limit",
  "--memory",
  "--memory-scope",
  "--mode",
  "--name",
  "--network",
  "--network-id",
  "--peer",
  "--peer-id",
  "--profile",
  "--provider",
  "--process",
  "--processor",
  "--query",
  "--replica-of",
  "--role",
  "--runtime",
  "--session",
  "--session-id",
  "--model",
  "--model-provider",
  "--base-url",
  "--env",
  "--source",
  "--state-dir",
  "--subject",
  "--target",
  "--target-evi",
  "--target-identity",
  "--text",
  "--tmux",
  "--verdict",
  "--workspace",
]);

export const DEFAULT_TARGETS: Record<string, Target> = {
  openclaw: {
    name: "openclaw",
    provider: "openclaw",
    label: "ai.openclaw.gateway",
    plist: "~/Library/LaunchAgents/ai.openclaw.gateway.plist",
    tmuxSessions: [],
    processPatterns: ["openclaw", "ai.openclaw.gateway", "com.clawdbot.gateway"],
    healthPatterns: [],
  },
  hermes: {
    name: "hermes",
    provider: "hermes-agent",
    label: "ai.hermes.gateway-nukoevi",
    plist: "~/Library/LaunchAgents/ai.hermes.gateway-nukoevi.plist",
    tmuxSessions: ["hermes-line-tunnel"],
    processPatterns: ["hermes_cli.main", "ai.hermes.gateway", "cloudflared.*\\.hermes"],
    healthPatterns: [],
  },
  "claude-code-channels": {
    name: "claude-code-channels",
    provider: "claude-code-channels",
    label: "com.local.claude-telegram-channel",
    plist: "~/Library/LaunchAgents/com.local.claude-telegram-channel.plist",
    tmuxSessions: ["claude-telegram-channel"],
    processPatterns: [
      "claude.*plugin:(telegram|discord|fakechat)",
      "nukoevi-(telegram|discord)",
      "claude-telegram-channel",
    ],
    healthPatterns: ["Listening for channel messages from:"],
  },
};

export const ALIASES: Record<string, string> = {
  ccc: "claude-code-channels",
  claude: "claude-code-channels",
  "claude-code-channels": "claude-code-channels",
  channels: "claude-code-channels",
  "hermes-agent": "hermes",
  "open-claw": "openclaw",
};

export const PROVIDERS: Record<string, string> = {
  ccc: "claude-code-channels",
  claude: "claude-code-channels",
  channels: "claude-code-channels",
  "claude-code-channels": "claude-code-channels",
  hermes: "hermes-agent",
  "hermes-agent": "hermes-agent",
  openclaw: "openclaw",
  "open-claw": "openclaw",
};

export const PROVIDER_RUNTIMES: Record<string, string> = {
  "claude-code-channels": "claude-code-channels",
  "hermes-agent": "hermes",
  openclaw: "openclaw",
};

export const HERMES_MODEL_PROVIDER_ALIASES: Record<string, string> = {
  grok: "xai-oauth",
  "grok-oauth": "xai-oauth",
  "x-ai-oauth": "xai-oauth",
  "xai-grok-oauth": "xai-oauth",
  supergrok: "xai-oauth",
  codex: "openai-codex",
  "codex-oauth": "openai-codex",
  llama: "custom",
  llamacpp: "custom",
  "llama.cpp": "custom",
  "llama-cpp": "custom",
};

export function resolveProvider(value: string): string {
  const provider = PROVIDERS[value];
  if (!provider) {
    const known = [...new Set(Object.values(PROVIDERS))].sort().join(", ");
    throw new Error(`unknown provider: ${value} (known: ${known})`);
  }
  return provider;
}

function providerForRuntime(runtime: string, targets?: Record<string, Target>): string {
  const targetProvider = targets?.[runtime]?.provider;
  if (targetProvider) return resolveProvider(targetProvider);
  return resolveProvider(runtime);
}

function runtimeForProvider(provider: string): string {
  return PROVIDER_RUNTIMES[resolveProvider(provider)];
}

export function normalizeHermesModelProvider(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  return HERMES_MODEL_PROVIDER_ALIASES[raw.toLowerCase()] ?? raw;
}

export function run(command: string[]): RunResult {
  const result = spawnSync(command[0], command.slice(1), { encoding: "utf8" });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function userDomain(): string {
  return `gui/${process.getuid?.() ?? 0}`;
}

export function expandPath(value?: string): string | undefined {
  if (!value) return undefined;
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return join(homedir(), value.slice(2));
  return value;
}

export function configPath(): string {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  if (xdgConfigHome) return join(xdgConfigHome, "evictl", "config.json");
  return join(homedir(), ".config", "evictl", "config.json");
}

export function loadConfigData(path = configPath()): Record<string, unknown> {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function writeConfigData(path: string, data: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function stringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return value.filter((item): item is string => typeof item === "string");
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringMap(value: unknown): Record<string, string> {
  const raw = objectValue(value);
  const entries = Object.entries(raw).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  return Object.fromEntries(entries);
}

export function loadTargets(data = loadConfigData()): Record<string, Target> {
  const targets = structuredClone(DEFAULT_TARGETS);
  const configuredTargets = objectValue(data.targets);
  for (const [name, rawTarget] of Object.entries(configuredTargets)) {
    const targetName = ALIASES[name] ?? name;
    const raw = objectValue(rawTarget);
    const base = targets[targetName] ?? {
      name: targetName,
      tmuxSessions: [],
      processPatterns: [],
      healthPatterns: [],
    };
    targets[targetName] = {
      name: targetName,
      provider: stringValue(raw.provider, base.provider ?? "") || undefined,
      label: stringValue(raw.label, base.label ?? "") || undefined,
      plist: stringValue(raw.plist, base.plist ?? "") || undefined,
      tmuxSessions: stringArray(raw.tmux_sessions ?? raw.tmuxSessions, base.tmuxSessions),
      processPatterns: stringArray(
        raw.process_patterns ?? raw.processPatterns,
        base.processPatterns,
      ),
      healthPatterns: stringArray(raw.health_patterns ?? raw.healthPatterns, base.healthPatterns),
    };
  }
  return targets;
}

function normalizeRuntimeName(runtime: string, targets: Record<string, Target>): string {
  return resolveTarget(runtime, targets);
}

export function loadInventory(data = loadConfigData()): Inventory {
  const targets = loadTargets(data);
  const evis: Record<string, Evi> = {};
  for (const name of Object.keys(targets).sort()) {
    evis[`evi-${name}`] = {
      eviId: `evi-${name}`,
      runtime: name,
      provider: providerForRuntime(name, targets),
      profile: "default",
      agentId: "",
      sessionId: "",
      workspace: "",
      stateDir: "",
      networkId: "default",
      replicaOf: "",
      role: "replica",
      modelProvider: "",
      model: "",
      baseUrl: "",
      env: {},
    };
  }
  const configuredEvis = objectValue(data.evis);
  for (const [eviId, rawEvi] of Object.entries(configuredEvis)) {
    const raw = objectValue(rawEvi);
    const rawRuntime = stringValue(raw.runtime);
    const rawProvider = stringValue(raw.provider);
    if (!rawRuntime && !rawProvider) throw new Error(`evi missing runtime/provider: ${eviId}`);
    const provider = rawProvider ? resolveProvider(rawProvider) : providerForRuntime(rawRuntime, targets);
    const runtime = normalizeRuntimeName(rawRuntime || runtimeForProvider(provider), targets);
    if (!runtime) throw new Error(`evi missing runtime: ${eviId}`);
    evis[eviId] = {
      eviId,
      runtime,
      provider,
      profile: stringValue(raw.profile, "default"),
      agentId: stringValue(raw.agent_id ?? raw.agentId),
      sessionId: stringValue(raw.session_id ?? raw.sessionId),
      workspace: stringValue(raw.workspace),
      stateDir: stringValue(raw.state_dir ?? raw.stateDir),
      networkId: stringValue(raw.network_id ?? raw.networkId, "default"),
      replicaOf: stringValue(raw.replica_of ?? raw.replicaOf),
      role: stringValue(raw.role, "replica"),
      modelProvider: normalizeHermesModelProvider(
        stringValue(raw.model_provider ?? raw.modelProvider ?? raw.inference_provider),
      ),
      model: stringValue(raw.model ?? raw.inference_model),
      baseUrl: stringValue(raw.base_url ?? raw.baseUrl),
      env: stringMap(raw.env),
    };
  }
  const identities: Record<string, Identity> = {};
  const configuredIdentities = objectValue(data.identities);
  for (const [identityId, rawIdentity] of Object.entries(configuredIdentities)) {
    const raw = objectValue(rawIdentity);
    const activeEvi = stringValue(
      raw.active_evi ?? raw.activeEvi ?? raw.active_processor ?? raw.activeProcessor,
    );
    if (activeEvi && !evis[activeEvi]) {
      const known = Object.keys(evis).sort().join(", ");
      throw new Error(`identity ${identityId} has unknown active evi: ${activeEvi} (known: ${known})`);
    }
    identities[identityId] = {
      identityId,
      profile: stringValue(raw.profile, identityId),
      memoryScope: stringValue(raw.memory_scope ?? raw.memoryScope, identityId),
      activeEvi,
      description: stringValue(raw.description),
    };
  }
  const interfaces: Record<string, InterfaceBinding> = {};
  const configuredInterfaces = objectValue(data.interfaces);
  for (const [key, rawInterface] of Object.entries(configuredInterfaces)) {
    const raw = objectValue(rawInterface);
    const kind = stringValue(raw.kind) || key.split(":", 1)[0] || "";
    const identityId = stringValue(raw.identity_id ?? raw.identityId ?? raw.target_identity ?? raw.targetIdentity);
    if (!kind || !identityId) throw new Error(`interface missing kind or identity_id: ${key}`);
    if (!identities[identityId]) {
      const known = Object.keys(identities).sort().join(", ");
      throw new Error(`interface ${key} has unknown identity: ${identityId} (known: ${known})`);
    }
    interfaces[key] = {
      key,
      kind,
      address: stringValue(raw.address),
      identityId,
      mode: stringValue(raw.mode, "primary"),
    };
  }
  const routes: Record<string, Route> = {};
  const configuredRoutes = objectValue(data.routes);
  for (const [key, rawRoute] of Object.entries(configuredRoutes)) {
    const raw = objectValue(rawRoute);
    const channel = stringValue(raw.channel);
    const targetEvi = stringValue(raw.target_evi ?? raw.targetEvi);
    if (!channel || !targetEvi) throw new Error(`route missing channel or target_evi: ${key}`);
    routes[key] = {
      key,
      channel,
      targetEvi,
      accountId: stringValue(raw.account_id ?? raw.accountId),
      peerId: stringValue(raw.peer_id ?? raw.peerId),
      mode: stringValue(raw.mode, "primary"),
    };
  }
  const memory = objectValue(data.memory);
  return {
    targets,
    evis,
    identities,
    interfaces,
    routes,
    memoryEventLog: stringValue(
      memory.event_log ?? memory.eventLog,
      "~/.local/share/evictl/events.jsonl",
    ),
    memoryCompiledNotes: stringValue(
      memory.compiled_notes ?? memory.compiledNotes,
      "~/.local/share/evictl/memory",
    ),
  };
}

function defaultDiscovery(): Discovery {
  return {
    targets: {},
    evis: {},
    identities: {},
    interfaces: {},
    routes: {},
    memory: {
      eventLog: "~/.local/share/evictl/events.jsonl",
      compiledNotes: "~/.local/share/evictl/memory",
    },
    sources: [],
    warnings: [],
  };
}

function slug(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "default";
}

function plistArgs(data: Record<string, unknown>): string[] {
  return stringArray(data.ProgramArguments, []);
}

function plistLabel(data: Record<string, unknown>): string {
  return stringValue(data.Label);
}

function plistWorkingDirectory(data: Record<string, unknown>): string {
  return stringValue(data.WorkingDirectory);
}

function profileFromArgs(args: string[]): string | undefined {
  const index = args.indexOf("--profile");
  if (index >= 0 && args[index + 1]) return args[index + 1];
  return undefined;
}

function routeMode(runningByRuntime: Record<string, boolean>, runtime: string): string {
  const legacyRuntime = runtime === "claude-code-channels" ? "ccc" : runtime;
  return runningByRuntime[runtime] || runningByRuntime[legacyRuntime] ? "primary" : "standby";
}

function readTextIfExists(path: string): string {
  const concrete = expandPath(path) ?? path;
  return existsSync(concrete) ? readFileSync(concrete, "utf8") : "";
}

function shellAssignedValue(script: string, name: string): string {
  const match = script.match(new RegExp(`${name}=["']([^"']+)["']`));
  return match?.[1] ?? "";
}

function shellFlagValue(script: string, name: string): string {
  const match = script.match(new RegExp(`${name}\\s+([^\\s"']+)`));
  return match?.[1] ?? "";
}

export type ClaudeCodeChannelPlugin = {
  plugin: string;
  marketplace: string;
};

export function claudeCodeChannelPluginsFromScript(script: string): ClaudeCodeChannelPlugin[] {
  const plugins = new Map<string, ClaudeCodeChannelPlugin>();
  const pattern = /plugin:([a-z0-9-]+)@([a-z0-9-]+)/gi;
  for (const match of script.matchAll(pattern)) {
    const plugin = match[1];
    const marketplace = match[2];
    plugins.set(`${plugin}@${marketplace}`, { plugin, marketplace });
  }
  return [...plugins.values()].sort((a, b) =>
    `${a.plugin}@${a.marketplace}`.localeCompare(`${b.plugin}@${b.marketplace}`),
  );
}

const CLAUDE_CODE_CHANNEL_MARKETPLACES: Record<string, string> = {
  discord: "claude-plugins-official",
  fakechat: "claude-plugins-official",
  imessage: "claude-plugins-official",
  telegram: "claude-plugins-official",
};

function claudeCodeChannelPluginForInterface(binding: InterfaceBinding): ClaudeCodeChannelPlugin | undefined {
  const plugin = binding.kind || binding.key.split(":", 1)[0] || "";
  const marketplace = CLAUDE_CODE_CHANNEL_MARKETPLACES[plugin];
  return marketplace ? { plugin, marketplace } : undefined;
}

export function claudeCodeChannelsLaunchPlan(
  inventory: Inventory,
  identityId: string,
): ClaudeCodeChannelsLaunchPlan {
  const identity = inventory.identities[identityId];
  if (!identity) {
    const known = Object.keys(inventory.identities).sort().join(", ");
    throw new Error(`unknown identity: ${identityId} (known: ${known})`);
  }
  const evi = inventory.evis[identity.activeEvi];
  if (!evi) throw new Error(`identity has no active evi: ${identityId}`);
  if (evi.provider !== "claude-code-channels") {
    throw new Error(`identity ${identityId} active processor is not Claude Code Channels`);
  }
  const channelsByKey = new Map<string, ClaudeCodeChannelPlugin>();
  for (const binding of Object.values(inventory.interfaces)) {
    if (binding.identityId !== identityId) continue;
    if (!["primary", "mirror"].includes(binding.mode)) continue;
    const channel = claudeCodeChannelPluginForInterface(binding);
    if (channel) channelsByKey.set(`${channel.plugin}@${channel.marketplace}`, channel);
  }
  const channels = [...channelsByKey.values()].sort((a, b) =>
    `${a.plugin}@${a.marketplace}`.localeCompare(`${b.plugin}@${b.marketplace}`),
  );
  if (channels.length === 0) {
    throw new Error(`identity ${identityId} has no Claude Code Channels-compatible interfaces`);
  }
  return {
    identityId,
    eviId: evi.eviId,
    channels,
    args: channels.flatMap((channel) => [
      "--channels",
      `plugin:${channel.plugin}@${channel.marketplace}`,
    ]),
    settings: {
      channelsEnabled: true,
      allowedChannelPlugins: channels,
    },
  };
}

function profileFromClaudeCodeChannels(agentName: string, plugins: ClaudeCodeChannelPlugin[]): string {
  let profile = agentName || "default";
  for (const plugin of plugins) {
    const suffix = `-${plugin.plugin}`;
    if (profile.endsWith(suffix)) profile = profile.slice(0, -suffix.length);
  }
  return profile || "default";
}

function targetWithPlist(runtime: string, data: Record<string, unknown>, path: string): Target {
  const base = DEFAULT_TARGETS[runtime] ?? {
    name: runtime,
    provider: providerForRuntime(runtime),
    tmuxSessions: [],
    processPatterns: [runtime],
    healthPatterns: [],
  };
  return {
    ...base,
    label: plistLabel(data) || base.label,
    plist: path,
  };
}

function addHermesDiscovery(
  discovery: Discovery,
  record: PlistRecord,
  runningByRuntime: Record<string, boolean>,
): void {
  const args = plistArgs(record.data);
  const env = stringMap(record.data.EnvironmentVariables);
  const home =
    env.HERMES_HOME || join(homedir(), ".hermes", "profiles", profileFromArgs(args) ?? "default");
  const profile = profileFromArgs(args) ?? basename(home) ?? "default";
  const eviId = `evi-hermes-${slug(profile)}`;
  discovery.targets.hermes = targetWithPlist("hermes", record.data, record.path);
  discovery.evis[eviId] = {
    eviId,
    runtime: "hermes",
    provider: "hermes-agent",
    profile,
    agentId: "",
    sessionId: "",
    workspace: plistWorkingDirectory(record.data) || join(homedir(), ".hermes", "hermes-agent"),
    stateDir: home,
    networkId: "default",
    replicaOf: "",
    role: "replica",
    modelProvider: "",
    model: "",
    baseUrl: "",
    env: {},
  };
  discovery.routes[`telegram:hermes:${slug(profile)}`] = {
    key: `telegram:hermes:${slug(profile)}`,
    channel: "telegram",
    accountId: "default",
    peerId: "",
    targetEvi: eviId,
    mode: routeMode(runningByRuntime, "hermes"),
  };
  discovery.sources.push({
    runtime: "hermes",
    kind: "launchd",
    path: record.path,
    label: plistLabel(record.data),
    status: routeMode(runningByRuntime, "hermes"),
  });
  const stateFiles = [
    ["channel-directory", "channel_directory.json"],
    ["gateway-state", "gateway_state.json"],
    ["sessions", "sessions/sessions.json"],
  ] as const;
  for (const [kind, file] of stateFiles) {
    const path = join(home, file);
    if (existsSync(path)) {
      discovery.sources.push({
        runtime: "hermes",
        kind,
        path,
        label: profile,
        status: "found",
      });
    }
  }
}

function setDiscoveredIdentity(
  discovery: Discovery,
  identityId: string,
  activeEvi: string,
  profile: string,
  memoryScope: string,
  preferred: boolean,
): void {
  const existing = discovery.identities[identityId];
  if (existing && existing.activeEvi && !preferred) return;
  discovery.identities[identityId] = {
    identityId,
    profile,
    memoryScope,
    activeEvi,
    description: existing?.description ?? "",
  };
}

function addClaudeCodeChannelsDiscovery(
  discovery: Discovery,
  record: PlistRecord,
  runningByRuntime: Record<string, boolean>,
): void {
  const args = plistArgs(record.data);
  const startScript =
    args.find(
      (arg) =>
        arg.includes("claude-telegram-channel") ||
        arg.includes("claude-code-channels") ||
        arg.endsWith("/start.sh"),
    ) ?? "";
  const stateDir = startScript
    ? dirname(startScript)
    : join(homedir(), ".local", "share", "claude-telegram-channel");
  const script = startScript ? readTextIfExists(startScript) : "";
  const sessionName = shellAssignedValue(script, "session_name");
  const agentName = shellFlagValue(script, "--name");
  const plugins = claudeCodeChannelPluginsFromScript(script);
  const activePlugins = plugins.length
    ? plugins
    : [{ plugin: "telegram", marketplace: "claude-plugins-official" }];
  const profile = profileFromClaudeCodeChannels(agentName, activePlugins);
  const eviId = `evi-claude-code-channels-${slug(profile)}`;
  const runtime = "claude-code-channels";
  const mode = routeMode(runningByRuntime, runtime);
  discovery.targets[runtime] = targetWithPlist(runtime, record.data, record.path);
  discovery.evis[eviId] = {
    eviId,
    runtime,
    provider: "claude-code-channels",
    profile,
    agentId: agentName,
    sessionId: sessionName,
    workspace: plistWorkingDirectory(record.data) || shellAssignedValue(script, "workdir"),
    stateDir,
    networkId: "default",
    replicaOf: "",
    role: "replica",
    modelProvider: "",
    model: "",
    baseUrl: "",
    env: {},
  };
  setDiscoveredIdentity(
    discovery,
    profile,
    eviId,
    profile,
    profile,
    mode === "primary",
  );
  for (const plugin of activePlugins) {
    const interfaceKey = `${plugin.plugin}:main`;
    discovery.interfaces[interfaceKey] = {
      key: interfaceKey,
      kind: plugin.plugin,
      address: "main",
      identityId: profile,
      mode,
    };
    const routeKey = `${plugin.plugin}:claude-code-channels:${slug(profile)}`;
    discovery.routes[routeKey] = {
      key: routeKey,
      channel: plugin.plugin,
      accountId: "default",
      peerId: "",
      targetEvi: eviId,
      mode,
    };
  }
  discovery.sources.push({
    runtime,
    kind: "launchd",
    path: record.path,
    label: plistLabel(record.data),
    status: mode,
  });
  const concreteStartScript = expandPath(startScript) ?? startScript;
  if (startScript && existsSync(concreteStartScript)) {
    discovery.sources.push({
      runtime,
      kind: "start-script",
      path: concreteStartScript,
      label: agentName || profile,
      status: sessionName || "found",
    });
  }
}

function addOpenClawDiscovery(
  discovery: Discovery,
  record: PlistRecord,
  runningByRuntime: Record<string, boolean>,
): void {
  const args = plistArgs(record.data);
  const profile = profileFromArgs(args) ?? "default";
  const eviId = `evi-openclaw-${slug(profile)}`;
  discovery.targets.openclaw = targetWithPlist("openclaw", record.data, record.path);
  discovery.evis[eviId] = {
    eviId,
    runtime: "openclaw",
    provider: "openclaw",
    profile,
    agentId: "",
    sessionId: "",
    workspace: plistWorkingDirectory(record.data),
    stateDir: join(homedir(), ".openclaw"),
    networkId: "default",
    replicaOf: "",
    role: "replica",
    modelProvider: "",
    model: "",
    baseUrl: "",
    env: {},
  };
  discovery.routes[`telegram:openclaw:${slug(profile)}`] = {
    key: `telegram:openclaw:${slug(profile)}`,
    channel: "telegram",
    accountId: "default",
    peerId: "",
    targetEvi: eviId,
    mode: routeMode(runningByRuntime, "openclaw"),
  };
  discovery.sources.push({
    runtime: "openclaw",
    kind: "launchd",
    path: record.path,
    label: plistLabel(record.data),
    status: routeMode(runningByRuntime, "openclaw"),
  });
}

function classifyPlist(
  record: PlistRecord,
): "hermes" | "claude-code-channels" | "openclaw" | undefined {
  const haystack = [
    record.path,
    plistLabel(record.data),
    ...plistArgs(record.data),
    plistWorkingDirectory(record.data),
  ]
    .join("\n")
    .toLowerCase();
  if (haystack.includes("claude-telegram-channel") || haystack.includes("claude-code-channels"))
    return "claude-code-channels";
  if (
    haystack.includes("hermes_cli.main") ||
    haystack.includes("hermes-agent") ||
    haystack.includes("ai.hermes")
  )
    return "hermes";
  if (haystack.includes("openclaw") || haystack.includes("open-claw")) return "openclaw";
  return undefined;
}

function demoteDuplicatePrimaryRoutes(discovery: Discovery): void {
  const conflicts = duplicatePrimaryRoutes(discovery.routes);
  for (const [owner, routes] of conflicts) {
    for (const route of routes) route.mode = "standby";
    discovery.warnings.push(
      `route conflict ${ownerLabel(owner)} imported as standby: ${routes.map((route) => route.key).join(", ")}`,
    );
  }
}

export function discoverFromPlistRecords(
  records: PlistRecord[],
  runningByRuntime: Record<string, boolean> = {},
): Discovery {
  const discovery = defaultDiscovery();
  for (const record of records) {
    const runtime = classifyPlist(record);
    if (runtime === "hermes") addHermesDiscovery(discovery, record, runningByRuntime);
    if (runtime === "claude-code-channels")
      addClaudeCodeChannelsDiscovery(discovery, record, runningByRuntime);
    if (runtime === "openclaw") addOpenClawDiscovery(discovery, record, runningByRuntime);
  }
  demoteDuplicatePrimaryRoutes(discovery);
  if (!discovery.targets.openclaw && !existsSync(join(homedir(), ".openclaw"))) {
    discovery.warnings.push("openclaw: no launch agent or ~/.openclaw directory found");
  }
  return discovery;
}

function readPlist(path: string): Record<string, unknown> | undefined {
  const result = run(["plutil", "-convert", "json", "-o", "-", path]);
  if (result.code !== 0) return undefined;
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

function launchAgentRecords(): PlistRecord[] {
  const dir = join(homedir(), "Library", "LaunchAgents");
  if (!existsSync(dir)) return [];
  const records: PlistRecord[] = [];
  for (const name of readdirSync(dir)
    .filter((item) => item.endsWith(".plist"))
    .sort()) {
    const path = join(dir, name);
    const data = readPlist(path);
    if (data) records.push({ path, data });
  }
  return records;
}

export function discoverLocalSetup(): Discovery {
  const runningByRuntime = Object.fromEntries(
    Object.entries(loadTargets()).map(([name, target]) => [name, statusFor(target).running]),
  );
  return discoverFromPlistRecords(launchAgentRecords(), runningByRuntime);
}

function targetToConfig(target: Target): Record<string, unknown> {
  return {
    provider: target.provider,
    label: target.label,
    plist: target.plist,
    tmux_sessions: target.tmuxSessions,
    process_patterns: target.processPatterns,
    health_patterns: target.healthPatterns,
  };
}

export function setTargetConfig(
  data: Record<string, unknown>,
  target: Target,
  force = false,
): Record<string, unknown> {
  const targetName = ALIASES[target.name] ?? target.name;
  const normalizedTarget = { ...target, name: targetName };
  const targets = objectValue(data.targets);
  if (!force && targets[targetName]) {
    throw new Error(`target already exists: ${targetName}`);
  }
  return {
    ...data,
    targets: {
      ...targets,
      [targetName]: targetToConfig(normalizedTarget),
    },
  };
}

function eviToConfig(evi: Evi): Record<string, unknown> {
  return {
    runtime: evi.runtime,
    provider: evi.provider,
    profile: evi.profile,
    agent_id: evi.agentId,
    session_id: evi.sessionId,
    workspace: evi.workspace,
    state_dir: evi.stateDir,
    network_id: evi.networkId,
    replica_of: evi.replicaOf,
    role: evi.role,
    model_provider: evi.modelProvider,
    model: evi.model,
    base_url: evi.baseUrl,
    env: evi.env,
  };
}

function identityToConfig(identity: Identity): Record<string, unknown> {
  return {
    profile: identity.profile,
    memory_scope: identity.memoryScope,
    active_evi: identity.activeEvi,
    description: identity.description,
  };
}

function mergeIdentityConfig(
  existing: Record<string, unknown>,
  discovered: Identity,
): Record<string, unknown> {
  const existingActive = stringValue(
    existing.active_evi ?? existing.activeEvi ?? existing.active_processor ?? existing.activeProcessor,
  );
  return {
    profile: stringValue(existing.profile, discovered.profile),
    memory_scope: stringValue(existing.memory_scope ?? existing.memoryScope, discovered.memoryScope),
    active_evi: existingActive || discovered.activeEvi,
    description: stringValue(existing.description, discovered.description),
  };
}

function interfaceToConfig(binding: InterfaceBinding): Record<string, unknown> {
  return {
    kind: binding.kind,
    address: binding.address,
    identity_id: binding.identityId,
    mode: binding.mode,
  };
}

function routeToConfig(route: Route): Record<string, unknown> {
  return {
    channel: route.channel,
    account_id: route.accountId,
    peer_id: route.peerId,
    target_evi: route.targetEvi,
    mode: route.mode,
  };
}

export function setIdentityConfig(
  data: Record<string, unknown>,
  identity: Identity,
  force = false,
): Record<string, unknown> {
  const inventory = loadInventory(data);
  const configuredIdentities = objectValue(data.identities);
  if (identity.activeEvi && !inventory.evis[identity.activeEvi]) {
    const known = Object.keys(inventory.evis).sort().join(", ");
    throw new Error(`unknown active evi: ${identity.activeEvi} (known: ${known})`);
  }
  if (!force && configuredIdentities[identity.identityId]) {
    throw new Error(`identity already exists: ${identity.identityId}`);
  }
  return {
    ...data,
    identities: {
      ...configuredIdentities,
      [identity.identityId]: identityToConfig(identity),
    },
  };
}

export function bindIdentityProcessorConfig(
  data: Record<string, unknown>,
  identityId: string,
  eviId: string,
): Record<string, unknown> {
  const inventory = loadInventory(data);
  const identity = inventory.identities[identityId];
  if (!identity) {
    const known = Object.keys(inventory.identities).sort().join(", ");
    throw new Error(`unknown identity: ${identityId} (known: ${known})`);
  }
  if (!inventory.evis[eviId]) {
    const known = Object.keys(inventory.evis).sort().join(", ");
    throw new Error(`unknown evi: ${eviId} (known: ${known})`);
  }
  return {
    ...data,
    identities: {
      ...objectValue(data.identities),
      [identityId]: identityToConfig({ ...identity, activeEvi: eviId }),
    },
  };
}

export function setInterfaceConfig(
  data: Record<string, unknown>,
  binding: InterfaceBinding,
  force = false,
): Record<string, unknown> {
  const inventory = loadInventory(data);
  const configuredInterfaces = objectValue(data.interfaces);
  if (!inventory.identities[binding.identityId]) {
    const known = Object.keys(inventory.identities).sort().join(", ");
    throw new Error(`unknown identity: ${binding.identityId} (known: ${known})`);
  }
  if (!force && configuredInterfaces[binding.key]) {
    throw new Error(`interface already exists: ${binding.key}`);
  }
  return {
    ...data,
    interfaces: {
      ...configuredInterfaces,
      [binding.key]: interfaceToConfig(binding),
    },
  };
}

export function setRouteConfig(
  data: Record<string, unknown>,
  route: Route,
  force = false,
): Record<string, unknown> {
  const inventory = loadInventory(data);
  if (!inventory.evis[route.targetEvi]) {
    const known = Object.keys(inventory.evis).sort().join(", ");
    throw new Error(`unknown target evi: ${route.targetEvi} (known: ${known})`);
  }
  const routes = {
    ...inventory.routes,
    [route.key]: route,
  };
  const conflicts = duplicatePrimaryRoutes(routes);
  if (!force && conflicts.size > 0) {
    for (const [owner, conflictRoutes] of conflicts) {
      if (conflictRoutes.some((item) => item.key === route.key)) {
        throw new Error(
          `duplicate primary route ${ownerLabel(owner)}: ${conflictRoutes.map((item) => item.key).join(", ")}`,
        );
      }
    }
  }
  return {
    ...data,
    routes: Object.fromEntries(
      Object.entries(routes).map(([key, value]) => [key, routeToConfig(value)]),
    ),
  };
}

function eviConfig(evi: Evi): Record<string, unknown> {
  return {
    runtime: evi.runtime,
    provider: evi.provider,
    profile: evi.profile,
    agent_id: evi.agentId,
    session_id: evi.sessionId,
    workspace: evi.workspace,
    state_dir: evi.stateDir,
    network_id: evi.networkId,
    replica_of: evi.replicaOf,
    role: evi.role,
    model_provider: evi.modelProvider,
    model: evi.model,
    base_url: evi.baseUrl,
    env: evi.env,
  };
}

export function spawnEviConfig(
  data: Record<string, unknown>,
  evi: Evi,
  force = false,
): Record<string, unknown> {
  const inventory = loadInventory(data);
  const normalizedRuntime = normalizeRuntimeName(evi.runtime, inventory.targets);
  const normalizedEvi = { ...evi, runtime: normalizedRuntime };
  const configuredEvis = objectValue(data.evis);
  if (!inventory.targets[normalizedEvi.runtime]) {
    const known = Object.keys(inventory.targets).sort().join(", ");
    throw new Error(`unknown runtime: ${evi.runtime} (known: ${known})`);
  }
  if (!force && configuredEvis[normalizedEvi.eviId]) {
    throw new Error(`evi already exists: ${normalizedEvi.eviId}`);
  }
  return {
    ...data,
    evis: {
      ...configuredEvis,
      [normalizedEvi.eviId]: eviConfig(normalizedEvi),
    },
  };
}

export function mergeConfigData(
  existing: Record<string, unknown>,
  discovery: Discovery,
): Record<string, unknown> {
  const targets = { ...objectValue(existing.targets) };
  for (const [name, target] of Object.entries(discovery.targets))
    targets[name] = targetToConfig(target);
  const evis = { ...objectValue(existing.evis) };
  for (const [eviId, evi] of Object.entries(discovery.evis)) evis[eviId] = eviToConfig(evi);
  const identities = { ...objectValue(existing.identities) };
  for (const [identityId, identity] of Object.entries(discovery.identities)) {
    identities[identityId] = mergeIdentityConfig(objectValue(identities[identityId]), identity);
  }
  const interfaces = { ...objectValue(existing.interfaces) };
  for (const [key, binding] of Object.entries(discovery.interfaces))
    interfaces[key] = interfaceToConfig(binding);
  const routes = { ...objectValue(existing.routes) };
  for (const [key, route] of Object.entries(discovery.routes)) routes[key] = routeToConfig(route);
  const memory = {
    event_log: discovery.memory.eventLog,
    compiled_notes: discovery.memory.compiledNotes,
    ...objectValue(existing.memory),
  };
  return {
    ...existing,
    targets,
    evis,
    identities,
    interfaces,
    routes,
    memory,
  };
}

export function resolveTarget(name: string, targets: Record<string, Target>): string {
  const key = ALIASES[name] ?? name;
  if (!(key in targets)) {
    const known = Object.keys(targets).sort().join(", ");
    throw new Error(`unknown target: ${name} (known: ${known})`);
  }
  return key;
}

function launchdLoaded(label?: string): boolean {
  if (!label) return false;
  return run(["launchctl", "print", `${userDomain()}/${label}`]).code === 0;
}

function launchdState(label?: string): string | undefined {
  if (!label) return undefined;
  const result = run(["launchctl", "print", `${userDomain()}/${label}`]);
  if (result.code !== 0) return undefined;
  return result.stdout.match(/state = ([^\n]+)/)?.[1]?.trim();
}

function pidsFor(patterns: string[]): number[] {
  if (patterns.length === 0) return [];
  const result = run(["ps", "-axo", "pid=,command="]);
  if (result.code !== 0) return [];
  return parseProcessPids(result.stdout, patterns, process.pid);
}

export function parseProcessPids(stdout: string, patterns: string[], currentPid = -1): number[] {
  const regex = new RegExp(patterns.join("|"));
  const pids = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const [pid, ...commandParts] = line.split(/\s+/);
      const command = commandParts.join(" ");
      if (!/^\d+$/.test(pid)) return [];
      if (Number(pid) === currentPid) return [];
      if (/\bpgrep\b/.test(command) && command.includes("-af")) return [];
      if (!regex.test(command)) return [];
      return [Number(pid)];
    });
  return [...new Set(pids)].sort((a, b) => a - b);
}

function tmuxExists(session: string): boolean {
  return run(["tmux", "has-session", "-t", session]).code === 0;
}

export function tmuxCaptureCommand(session: string, lines = 80): string[] {
  return ["tmux", "capture-pane", "-pt", session, "-S", `-${Math.max(1, lines)}`];
}

function tmuxCapture(session: string, lines = 80): string {
  const result = run(tmuxCaptureCommand(session, lines));
  return result.code === 0 ? result.stdout : "";
}

export function statusFor(target: Target): TargetStatus {
  const loaded = launchdLoaded(target.label);
  const state = launchdState(target.label);
  const tmuxSessions = target.tmuxSessions.filter(tmuxExists);
  const pids = pidsFor(target.processPatterns);
  const notes: string[] = [];
  const plist = expandPath(target.plist);
  if (plist && !existsSync(plist)) notes.push("plist-missing");
  if (state) notes.push(`launchd:${state}`);
  let healthy = pids.length > 0 || tmuxSessions.length > 0 || state === "running";
  for (const session of tmuxSessions) {
    const pane = tmuxCapture(session);
    for (const pattern of target.healthPatterns) {
      if (pane.includes(pattern)) {
        notes.push(`health:${pattern}`);
        healthy = true;
      }
    }
  }
  return {
    name: target.name,
    loaded,
    running: pids.length > 0 || tmuxSessions.length > 0 || state === "running",
    healthy,
    pids,
    tmuxSessions,
    notes,
  };
}

function bootstrap(target: Target): void {
  const plist = expandPath(target.plist);
  if (!plist || !existsSync(plist)) {
    console.error(`${target.name}: plist missing: ${plist ?? "-"}`);
    return;
  }
  if (target.label && !launchdLoaded(target.label)) {
    const result = run(["launchctl", "bootstrap", userDomain(), plist]);
    if (result.code !== 0 && !result.stderr.includes("already bootstrapped")) {
      console.error(result.stderr.trim());
    }
  }
  if (target.label) {
    run(["launchctl", "enable", `${userDomain()}/${target.label}`]);
    run(["launchctl", "kickstart", `${userDomain()}/${target.label}`]);
  }
}

function stopTarget(target: Target): void {
  for (const session of target.tmuxSessions) {
    if (tmuxExists(session)) run(["tmux", "kill-session", "-t", session]);
  }
  const plist = expandPath(target.plist);
  if (target.label && plist && existsSync(plist) && launchdLoaded(target.label)) {
    const result = run(["launchctl", "bootout", userDomain(), plist]);
    if (result.code !== 0 && !result.stderr.includes("Could not find service")) {
      console.error(result.stderr.trim());
    }
  }
}

function printStatuses(statuses: TargetStatus[]): void {
  const width = Math.max(...statuses.map((status) => status.name.length));
  for (const item of statuses) {
    const state = item.running ? "running" : "stopped";
    const health = item.healthy ? "healthy" : "unknown";
    const pids = item.pids.join(",") || "-";
    const tmux = item.tmuxSessions.join(",") || "-";
    const notes = item.notes.join(",") || "-";
    console.log(
      `${item.name.padEnd(width)}  ${state.padEnd(7)}  ${health.padEnd(7)}  pids=${pids}  tmux=${tmux}  notes=${notes}`,
    );
  }
}

export function routeOwnerKey(route: Route): string {
  return `${route.channel}\u0000${route.accountId || "-"}\u0000${route.peerId || "-"}`;
}

export function duplicatePrimaryRoutes(routes: Record<string, Route>): Map<string, Route[]> {
  const owners = new Map<string, Route[]>();
  for (const route of Object.values(routes)) {
    if (route.mode !== "primary") continue;
    const key = routeOwnerKey(route);
    owners.set(key, [...(owners.get(key) ?? []), route]);
  }
  for (const [key, value] of [...owners]) {
    if (value.length <= 1) owners.delete(key);
  }
  return owners;
}

function ownerLabel(key: string): string {
  return `(${key.split("\u0000").join(", ")})`;
}

export function resolveEviTarget(
  inventory: Inventory,
  eviId: string,
): { evi: Evi; target: Target } {
  const evi = inventory.evis[eviId];
  if (!evi) {
    const known = Object.keys(inventory.evis).sort().join(", ");
    throw new Error(`unknown evi: ${eviId} (known: ${known})`);
  }
  const target = inventory.targets[evi.runtime];
  if (!target) {
    const known = Object.keys(inventory.targets).sort().join(", ");
    throw new Error(`unknown runtime for evi ${eviId}: ${evi.runtime} (known: ${known})`);
  }
  return { evi, target };
}

export function resolveProcessorTarget(
  inventory: Inventory,
  targetId: string,
): { evi: Evi; target: Target; identity?: Identity } {
  if (inventory.evis[targetId]) return resolveEviTarget(inventory, targetId);
  const identity = inventory.identities[targetId];
  if (!identity) {
    const evis = Object.keys(inventory.evis).sort();
    const identities = Object.keys(inventory.identities).sort();
    const known = [...evis, ...identities].join(", ");
    throw new Error(`unknown evi or identity: ${targetId} (known: ${known})`);
  }
  if (!identity.activeEvi) {
    throw new Error(`identity has no active evi: ${targetId}`);
  }
  return { ...resolveEviTarget(inventory, identity.activeEvi), identity };
}

function displayPath(value: string): string {
  return expandPath(value) || value || "-";
}

function concretePath(value: string): string {
  return expandPath(value) ?? value;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function optionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function optionValues(args: string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) values.push(args[index + 1]);
  }
  return values;
}

function envFromArgs(args: string[], base: Record<string, string> = {}): Record<string, string> {
  const env = { ...base };
  for (const value of optionValues(args, "--env")) {
    const separator = value.indexOf("=");
    if (separator <= 0) throw new Error(`invalid --env value: ${value}`);
    env[value.slice(0, separator)] = value.slice(separator + 1);
  }
  return env;
}

function numberOption(args: string[], name: string, fallback: number): number {
  const raw = optionValue(args, name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`invalid number for ${name}: ${raw}`);
  return value;
}

export function runtimeEnvForEvi(evi: Evi): Record<string, string> {
  const env = { ...evi.env };
  if (evi.provider === "hermes-agent") {
    if (evi.modelProvider) env.HERMES_INFERENCE_PROVIDER = evi.modelProvider;
    if (evi.model) {
      env.HERMES_MODEL = evi.model;
      env.HERMES_INFERENCE_MODEL = evi.model;
    }
    if (evi.baseUrl && ["xai", "xai-oauth"].includes(evi.modelProvider)) {
      env.XAI_BASE_URL = evi.baseUrl;
    } else if (evi.baseUrl) {
      env.OPENAI_BASE_URL = evi.baseUrl;
    }
  }
  return env;
}

export function parseGlobalOptions(argv: string[]): ParsedCliArgs {
  const args: string[] = [];
  const options = { ...DEFAULT_GLOBAL_OPTIONS };
  let previousRequiresValue = false;
  let afterDoubleDash = false;
  for (const arg of argv) {
    if (afterDoubleDash) {
      args.push(arg);
      continue;
    }
    if (previousRequiresValue) {
      args.push(arg);
      previousRequiresValue = false;
      continue;
    }
    if (arg === "--") {
      args.push(arg);
      afterDoubleDash = true;
      continue;
    }
    if (arg === "--headless") {
      options.headless = true;
      continue;
    }
    args.push(arg);
    previousRequiresValue = VALUE_OPTIONS.has(arg);
  }
  const [command, ...commandArgs] = args;
  return { command, args: commandArgs, options };
}

export function createFeedbackEvent(
  inventory: Inventory,
  targetEvi: string,
  values: { verdict: string; text: string; subject?: string; source?: string; confidence?: number },
  id: string = randomUUID(),
  timestamp: string = new Date().toISOString(),
): MemoryEvent {
  if (!inventory.evis[targetEvi]) {
    const known = Object.keys(inventory.evis).sort().join(", ");
    throw new Error(`unknown evi: ${targetEvi} (known: ${known})`);
  }
  if (!["accept", "reject", "correct", "improve", "remember"].includes(values.verdict)) {
    throw new Error(`unsupported feedback verdict: ${values.verdict}`);
  }
  if (!values.text) throw new Error("feedback requires --text <text>");
  return {
    id,
    timestamp,
    type: "feedback",
    source: values.source ?? "user",
    target_evi: targetEvi,
    subject: values.subject ?? "",
    verdict: values.verdict,
    confidence: values.confidence ?? 1,
    text: values.text,
  };
}

export function createTaskEvent(
  inventory: Inventory,
  targetEvi: string,
  values: { text: string; subject?: string; source?: string },
  id: string = randomUUID(),
  timestamp: string = new Date().toISOString(),
): MemoryEvent {
  if (!inventory.evis[targetEvi]) {
    const known = Object.keys(inventory.evis).sort().join(", ");
    throw new Error(`unknown evi: ${targetEvi} (known: ${known})`);
  }
  if (!values.text) throw new Error("send requires --text <text>");
  return {
    id,
    timestamp,
    type: "task",
    source: values.source ?? "user",
    target_evi: targetEvi,
    subject: values.subject ?? "",
    verdict: "queued",
    confidence: 1,
    text: values.text,
  };
}

export function appendMemoryEvent(eventLog: string, event: MemoryEvent): string {
  const path = concretePath(eventLog);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(event)}\n`);
  return path;
}

function parseMemoryEvent(value: unknown): MemoryEvent | undefined {
  const raw = objectValue(value);
  const id = stringValue(raw.id);
  const timestamp = stringValue(raw.timestamp);
  const type = stringValue(raw.type);
  const targetEvi = stringValue(raw.target_evi ?? raw.targetEvi);
  const text = stringValue(raw.text);
  if (!id || !timestamp || !type || !targetEvi || !text) return undefined;
  return {
    id,
    timestamp,
    type,
    source: stringValue(raw.source, "unknown"),
    target_evi: targetEvi,
    subject: stringValue(raw.subject),
    verdict: stringValue(raw.verdict),
    confidence: typeof raw.confidence === "number" ? raw.confidence : Number(raw.confidence ?? 0),
    text,
  };
}

export function readMemoryEvents(eventLog: string): MemoryEvent[] {
  const path = concretePath(eventLog);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = parseMemoryEvent(JSON.parse(line));
        return parsed ? [parsed] : [];
      } catch {
        return [];
      }
    });
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function matchesQuery(value: string, query: string): boolean {
  return value.toLowerCase().includes(query.toLowerCase());
}

function compiledNoteFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir)
    .map((name) => join(dir, name))
    .sort();
  const files: string[] = [];
  for (const entry of entries) {
    const stat = statSync(entry);
    if (stat.isDirectory()) files.push(...compiledNoteFiles(entry));
    if (stat.isFile()) files.push(entry);
  }
  return files;
}

export function searchMemory(inventory: Inventory, query: string, limit = 20): MemorySearchResult[] {
  if (!query.trim()) throw new Error("memory search requires a query");
  const eventLog = concretePath(inventory.memoryEventLog);
  const eventResults = readMemoryEvents(inventory.memoryEventLog)
    .filter((event) =>
      matchesQuery(
        [
          event.id,
          event.timestamp,
          event.type,
          event.source,
          event.target_evi,
          event.subject,
          event.verdict,
          event.text,
        ].join("\n"),
        query,
      ),
    )
    .map((event) => ({
      kind: event.type,
      path: eventLog,
      line: 0,
      targetEvi: event.target_evi,
      timestamp: event.timestamp,
      subject: event.subject,
      verdict: event.verdict,
      text: event.text,
    }));
  const noteResults = compiledNoteFiles(concretePath(inventory.memoryCompiledNotes)).flatMap(
    (path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          matchesQuery(line, query)
            ? [
                {
                  kind: "note",
                  path,
                  line: index + 1,
                  targetEvi: "",
                  timestamp: "",
                  subject: "",
                  verdict: "",
                  text: line.trim(),
                },
              ]
            : [],
        ),
  );
  return [...eventResults, ...noteResults].slice(0, Math.max(1, limit));
}

export function compileMemoryNotes(events: MemoryEvent[], limit = 100): string {
  const selected = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp)).slice(-limit);
  const lines = ["# evictl Shared Memory", "", `Promoted events: ${selected.length}`, ""];
  if (selected.length === 0) {
    lines.push("No memory events promoted yet.", "");
    return lines.join("\n");
  }
  const byEvi = new Map<string, MemoryEvent[]>();
  for (const event of selected)
    byEvi.set(event.target_evi, [...(byEvi.get(event.target_evi) ?? []), event]);
  for (const [targetEvi, targetEvents] of [...byEvi].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`## ${targetEvi}`, "");
    for (const event of targetEvents) {
      const subject = event.subject ? ` subject=${event.subject}` : "";
      lines.push(
        `- ${event.timestamp} ${event.verdict || event.type} confidence=${event.confidence}${subject}: ${compactText(event.text)}`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function promoteMemoryEvents(
  eventLog: string,
  compiledNotes: string,
  limit = 100,
): { eventCount: number; notePath: string } {
  const events = readMemoryEvents(eventLog);
  const notesDir = concretePath(compiledNotes);
  mkdirSync(notesDir, { recursive: true });
  const notePath = join(notesDir, "feedback.md");
  writeFileSync(notePath, compileMemoryNotes(events, limit));
  return { eventCount: Math.min(events.length, limit), notePath };
}

const NETWORK_MEMORY_BEGIN = "<!-- evictl:network-memory begin -->";
const NETWORK_MEMORY_END = "<!-- evictl:network-memory end -->";
const HERMES_ENTRY_DELIMITER = "\n§\n";

type MemorySyncResult = {
  sources: number;
  sinks: number;
  networkPath: string;
};

function readExistingFile(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function existingFiles(paths: string[]): string[] {
  return paths.filter((path) => {
    try {
      return existsSync(path) && statSync(path).isFile();
    } catch {
      return false;
    }
  });
}

function markdownFilesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".openclaw-repair") continue;
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...markdownFilesUnder(entryPath));
    if (entry.isFile() && entry.name.endsWith(".md")) files.push(entryPath);
  }
  return files.sort();
}

function writeManagedBlock(path: string, block: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const previous = readExistingFile(path);
  const pattern = new RegExp(
    `${NETWORK_MEMORY_BEGIN}[\\s\\S]*?${NETWORK_MEMORY_END}`,
    "m",
  );
  const managed = `${NETWORK_MEMORY_BEGIN}\n${block.trim()}\n${NETWORK_MEMORY_END}`;
  const next = pattern.test(previous)
    ? previous.replace(pattern, managed)
    : [previous.trimEnd(), managed].filter(Boolean).join("\n\n");
  writeFileSync(path, `${next.trimEnd()}\n`);
}

function writeHermesMemoryEntry(path: string, block: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const previous = readExistingFile(path);
  const entries = previous
    .split(HERMES_ENTRY_DELIMITER)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => !entry.includes(NETWORK_MEMORY_BEGIN));
  entries.push(`${NETWORK_MEMORY_BEGIN}\n${block.trim()}\n${NETWORK_MEMORY_END}`);
  writeFileSync(path, `${entries.join(HERMES_ENTRY_DELIMITER)}\n`);
}

function providerMemorySources(evi: Evi): string[] {
  const workspace = concretePath(evi.workspace);
  const stateDir = concretePath(evi.stateDir);
  if (evi.provider === "hermes-agent") {
    if (!stateDir) return [];
    return [
      join(stateDir, "memories", "MEMORY.md"),
      join(stateDir, "memories", "USER.md"),
    ];
  }
  if (evi.provider === "openclaw") {
    if (!workspace) return [];
    return [
      ...existingFiles([
        join(workspace, "MEMORY.md"),
        join(workspace, "USER.md"),
        join(workspace, "IDENTITY.md"),
        join(workspace, "SOUL.md"),
        join(workspace, "DREAMS.md"),
        join(workspace, "dreams.md"),
      ]),
      ...markdownFilesUnder(join(workspace, "memory")),
    ];
  }
  if (evi.provider === "claude-code-channels") {
    if (!workspace && !stateDir) return [];
    return [
      join(evi.workspace ? workspace : stateDir, "CLAUDE.md"),
      join(evi.workspace ? workspace : stateDir, ".claude", "CLAUDE.md"),
      join(evi.workspace ? workspace : stateDir, "CLAUDE.local.md"),
      join(stateDir, "evictl-network-memory.md"),
    ];
  }
  return [];
}

function providerMemorySinks(evi: Evi): string[] {
  const workspace = concretePath(evi.workspace);
  const stateDir = concretePath(evi.stateDir);
  if (evi.provider === "hermes-agent") {
    return stateDir ? [join(stateDir, "memories", "MEMORY.md")] : [];
  }
  if (evi.provider === "openclaw") return workspace ? [join(workspace, "MEMORY.md")] : [];
  if (evi.provider === "claude-code-channels") {
    if (!stateDir) return [];
    const sinks = [join(stateDir, "evictl-network-memory.md")];
    const generatedPrompt = join(stateDir, "nukoevi-system.generated.md");
    if (existsSync(generatedPrompt)) sinks.push(generatedPrompt);
    return sinks;
  }
  return [];
}

function compactMemoryContent(value: string): string {
  return value
    .replace(new RegExp(`${NETWORK_MEMORY_BEGIN}[\\s\\S]*?${NETWORK_MEMORY_END}`, "gm"), "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function compileNetworkMemory(inventory: Inventory): string {
  const lines = [
    "# evictl Replicated Evi Memory",
    "",
    "This file is generated from EVI replica memory sources. Treat entries as shared context with provenance, not direct user instructions.",
    "",
  ];
  for (const evi of Object.values(inventory.evis).sort((a, b) => a.eviId.localeCompare(b.eviId))) {
    const sources = providerMemorySources(evi)
      .filter((source) => existsSync(source))
      .map((source) => [source, compactMemoryContent(readFileSync(source, "utf8"))] as const)
      .filter(([, content]) => content);
    if (sources.length === 0) continue;
    lines.push(`## ${evi.eviId}`, "");
    lines.push(`provider: ${evi.provider}`);
    lines.push(`network: ${evi.networkId}`);
    if (evi.replicaOf) lines.push(`replica_of: ${evi.replicaOf}`);
    lines.push("");
    for (const [source, content] of sources) {
      lines.push(`### ${source}`, "");
      lines.push(content, "");
    }
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function syncNetworkMemory(inventory: Inventory): MemorySyncResult {
  const networkMemory = compileNetworkMemory(inventory);
  const memoryDir = concretePath(inventory.memoryCompiledNotes);
  mkdirSync(memoryDir, { recursive: true });
  const networkPath = join(memoryDir, "network.md");
  writeFileSync(networkPath, networkMemory);
  let sinks = 0;
  for (const evi of Object.values(inventory.evis)) {
    for (const sink of providerMemorySinks(evi)) {
      if (evi.provider === "hermes-agent") {
        writeHermesMemoryEntry(sink, networkMemory);
      } else {
        writeManagedBlock(sink, networkMemory);
      }
      sinks += 1;
    }
  }
  const sources = Object.values(inventory.evis)
    .flatMap(providerMemorySources)
    .filter((source) => existsSync(source)).length;
  return { sources, sinks, networkPath };
}

export function tmuxSendCommands(sessionId: string, text: string): string[][] {
  return [
    ["tmux", "send-keys", "-t", sessionId, "-l", "--", text],
    ["tmux", "send-keys", "-t", sessionId, "Enter"],
  ];
}

function dispatchMethodFor(queueOnly = false): string {
  if (queueOnly) return "queue";
  return "tmux";
}

function dispatchTask(
  evi: Evi,
  text: string,
  options: DispatchTaskOptions,
): DispatchTaskResult {
  if (options.queueOnly)
    return { delivered: false, method: "queue", detail: "queue-only" };
  if (!evi.sessionId)
    return { delivered: false, method: "tmux", detail: "missing-session-id" };
  if (!tmuxExists(evi.sessionId))
    return { delivered: false, method: "tmux", detail: "session-missing" };
  for (const command of tmuxSendCommands(evi.sessionId, text)) {
    const result = run(command);
    if (result.code !== 0)
      return {
        delivered: false,
        method: "tmux",
        detail: result.stderr.trim() || "send-failed",
      };
  }
  return { delivered: true, method: "tmux", detail: evi.sessionId };
}

export function queueTaskEvent(
  inventory: Inventory,
  targetEvi: string,
  text: string,
  values: { subject?: string; source?: string } = {},
): MemoryEvent {
  return createTaskEvent(inventory, targetEvi, { ...values, text });
}

function printDiscovery(discovery: Discovery): void {
  const targets = Object.keys(discovery.targets).sort();
  console.log(`targets=${targets.length ? targets.join(",") : "-"}`);
  const evis = Object.values(discovery.evis).sort((a, b) => a.eviId.localeCompare(b.eviId));
  for (const evi of evis) {
    const modelProvider = evi.modelProvider ? ` model_provider=${evi.modelProvider}` : "";
    const model = evi.model ? ` model=${evi.model}` : "";
    console.log(
      `evi=${evi.eviId} runtime=${evi.runtime} profile=${evi.profile}${modelProvider}${model} workspace=${displayPath(evi.workspace)} state_dir=${displayPath(evi.stateDir)}`,
    );
  }
  const routes = Object.values(discovery.routes).sort((a, b) => a.key.localeCompare(b.key));
  for (const route of routes) {
    console.log(
      `route=${route.key} channel=${route.channel} account=${route.accountId || "-"} peer=${route.peerId || "-"} target=${route.targetEvi} mode=${route.mode}`,
    );
  }
  for (const source of discovery.sources) {
    console.log(
      `source=${source.runtime} kind=${source.kind} label=${source.label || "-"} status=${source.status} path=${source.path}`,
    );
  }
  for (const warning of discovery.warnings) console.error(`warning: ${warning}`);
}

function cmdDiscover(args: string[]): number {
  const discovery = discoverLocalSetup();
  if (hasFlag(args, "--json")) {
    console.log(JSON.stringify(discovery, null, 2));
    return 0;
  }
  printDiscovery(discovery);
  return 0;
}

function cmdImport(args: string[]): number {
  const path = optionValue(args, "--config") ?? configPath();
  const dryRun = hasFlag(args, "--dry-run");
  const asJson = hasFlag(args, "--json");
  const discovery = discoverLocalSetup();
  const merged = mergeConfigData(loadConfigData(path), discovery);
  if (dryRun) {
    if (asJson) {
      console.log(JSON.stringify(merged, null, 2));
    } else {
      printDiscovery(discovery);
      console.log(`dry_run_config=${path}`);
    }
    return 0;
  }
  writeConfigData(path, merged);
  if (asJson) {
    console.log(JSON.stringify({ config: path, imported: discovery }, null, 2));
  } else {
    console.log(`wrote ${path}`);
    printDiscovery(discovery);
  }
  return 0;
}

function cmdPs(): number {
  const inventory = loadInventory();
  const statuses = Object.fromEntries(
    Object.values(inventory.targets).map((target) => [target.name, statusFor(target)]),
  );
  const width = Math.max(...Object.values(inventory.evis).map((evi) => evi.eviId.length));
  for (const evi of Object.values(inventory.evis).sort((a, b) => a.eviId.localeCompare(b.eviId))) {
    const status = statuses[evi.runtime];
    const state = status ? (status.running ? "running" : "stopped") : "unknown";
    const health = status ? (status.healthy ? "healthy" : "unknown") : "unknown";
    const routes = Object.values(inventory.routes).filter(
      (route) => route.targetEvi === evi.eviId,
    ).length;
    const modelProvider = evi.modelProvider || "-";
    const model = evi.model || "-";
    console.log(
      `${evi.eviId.padEnd(width)}  provider=${evi.provider.padEnd(20)}  runtime=${evi.runtime.padEnd(8)}  profile=${evi.profile.padEnd(10)}  model_provider=${modelProvider.padEnd(13)}  model=${model.padEnd(12)}  state=${state.padEnd(7)}  health=${health.padEnd(7)}  routes=${routes}`,
    );
  }
  return 0;
}

function cmdSpawn(args: string[]): number {
  const runtimeArg = required(args[0], "spawn requires a runtime/provider");
  return addEviFromArgs(runtimeArg, args.slice(1));
}

function addEviFromArgs(providerArg: string, args: string[]): number {
  const path = optionValue(args, "--config") ?? configPath();
  const data = loadConfigData(path);
  const targets = loadTargets(data);
  const provider = resolveProvider(providerArg);
  const runtime = resolveTarget(
    optionValue(args, "--runtime") ?? optionValue(args, "--target") ?? runtimeForProvider(provider),
    targets,
  );
  const profile = optionValue(args, "--profile") ?? "default";
  const eviId =
    optionValue(args, "--id") ?? `evi-${slug(provider)}-${slug(profile)}`;
  const modelProvider = normalizeHermesModelProvider(optionValue(args, "--model-provider") ?? "");
  const evi: Evi = {
    eviId,
    runtime,
    provider,
    profile,
    agentId: optionValue(args, "--agent") ?? optionValue(args, "--agent-id") ?? "",
    sessionId: optionValue(args, "--session") ?? optionValue(args, "--session-id") ?? "",
    workspace: optionValue(args, "--workspace") ?? "",
    stateDir: optionValue(args, "--state-dir") ?? "",
    networkId: optionValue(args, "--network") ?? optionValue(args, "--network-id") ?? "default",
    replicaOf: optionValue(args, "--replica-of") ?? "",
    role: optionValue(args, "--role") ?? "replica",
    modelProvider,
    model: optionValue(args, "--model") ?? "",
    baseUrl: optionValue(args, "--base-url") ?? "",
    env: envFromArgs(args),
  };
  writeConfigData(path, spawnEviConfig(data, evi, hasFlag(args, "--force")));
  const model = evi.model ? ` model=${evi.model}` : "";
  const eviModelProvider = evi.modelProvider ? ` model_provider=${evi.modelProvider}` : "";
  console.log(
    `evi=${evi.eviId} provider=${evi.provider} runtime=${evi.runtime} profile=${evi.profile} network=${evi.networkId}${eviModelProvider}${model} workspace=${displayPath(evi.workspace)} state_dir=${displayPath(evi.stateDir)}`,
  );
  return 0;
}

function cmdEviAdd(args: string[]): number {
  const provider = optionValue(args, "--provider") ?? args[0];
  return addEviFromArgs(required(provider, "evi add requires --provider <provider>"), args);
}

function cmdEviClone(args: string[]): number {
  const sourceId = required(args[0], "evi clone requires a source evi");
  const path = optionValue(args, "--config") ?? configPath();
  const data = loadConfigData(path);
  const inventory = loadInventory(data);
  const source = inventory.evis[sourceId];
  if (!source) {
    const known = Object.keys(inventory.evis).sort().join(", ");
    throw new Error(`unknown source evi: ${sourceId} (known: ${known})`);
  }
  const provider = optionValue(args, "--provider") ?? source.provider;
  const runtime = resolveTarget(
    optionValue(args, "--runtime") ?? optionValue(args, "--target") ?? runtimeForProvider(provider),
    inventory.targets,
  );
  const profile = optionValue(args, "--profile") ?? `${source.profile}-clone`;
  const eviId = optionValue(args, "--id") ?? `evi-${slug(provider)}-${slug(profile)}`;
  const modelProvider = normalizeHermesModelProvider(
    optionValue(args, "--model-provider") ?? source.modelProvider,
  );
  const evi: Evi = {
    eviId,
    runtime,
    provider: resolveProvider(provider),
    profile,
    agentId: optionValue(args, "--agent") ?? optionValue(args, "--agent-id") ?? "",
    sessionId: optionValue(args, "--session") ?? optionValue(args, "--session-id") ?? "",
    workspace: optionValue(args, "--workspace") ?? "",
    stateDir: optionValue(args, "--state-dir") ?? "",
    networkId: optionValue(args, "--network") ?? optionValue(args, "--network-id") ?? source.networkId,
    replicaOf: source.eviId,
    role: optionValue(args, "--role") ?? "replica",
    modelProvider,
    model: optionValue(args, "--model") ?? source.model,
    baseUrl: optionValue(args, "--base-url") ?? source.baseUrl,
    env: envFromArgs(args, source.env),
  };
  writeConfigData(path, spawnEviConfig(data, evi, hasFlag(args, "--force")));
  const model = evi.model ? ` model=${evi.model}` : "";
  const eviModelProvider = evi.modelProvider ? ` model_provider=${evi.modelProvider}` : "";
  console.log(
    `evi=${evi.eviId} provider=${evi.provider} runtime=${evi.runtime} profile=${evi.profile} network=${evi.networkId}${eviModelProvider}${model} replica_of=${evi.replicaOf}`,
  );
  return 0;
}

function cmdEviStart(args: string[]): number {
  const eviId = required(args[0], "evi start requires an evi id");
  const path = optionValue(args, "--config") ?? configPath();
  const inventory = loadInventory(loadConfigData(path));
  const { target } = resolveEviTarget(inventory, eviId);
  bootstrap(target);
  printStatuses([statusFor(target)]);
  return 0;
}

function cmdEviStop(args: string[]): number {
  const eviId = required(args[0], "evi stop requires an evi id");
  const path = optionValue(args, "--config") ?? configPath();
  const inventory = loadInventory(loadConfigData(path));
  const { target } = resolveEviTarget(inventory, eviId);
  stopTarget(target);
  printStatuses([statusFor(target)]);
  return 0;
}

function cmdIdentityList(): number {
  const inventory = loadInventory();
  const identities = Object.values(inventory.identities);
  if (identities.length === 0) {
    console.log("no identities configured");
    return 0;
  }
  const width = Math.max(...identities.map((identity) => identity.identityId.length));
  for (const identity of identities.sort((a, b) => a.identityId.localeCompare(b.identityId))) {
    const active = identity.activeEvi || "-";
    const processor = active !== "-" && inventory.evis[active] ? inventory.evis[active].provider : "-";
    console.log(
      `${identity.identityId.padEnd(width)}  profile=${identity.profile}  memory=${identity.memoryScope || "-"}  active=${active}  processor=${processor}`,
    );
  }
  return 0;
}

function cmdIdentityShow(args: string[]): number {
  const identityId = required(args[0], "identity show requires an identity id");
  const inventory = loadInventory();
  const identity = inventory.identities[identityId];
  if (!identity) {
    const known = Object.keys(inventory.identities).sort().join(", ");
    throw new Error(`unknown identity: ${identityId} (known: ${known})`);
  }
  console.log(`identity=${identity.identityId}`);
  console.log(`profile=${identity.profile}`);
  console.log(`memory_scope=${identity.memoryScope || "-"}`);
  console.log(`active_evi=${identity.activeEvi || "-"}`);
  console.log(`description=${identity.description || "-"}`);
  const interfaces = Object.values(inventory.interfaces).filter(
    (binding) => binding.identityId === identity.identityId,
  );
  console.log(`interfaces=${interfaces.length}`);
  for (const binding of interfaces.sort((a, b) => a.key.localeCompare(b.key))) {
    console.log(`- ${binding.key}: ${binding.kind}/${binding.address || "-"} (${binding.mode})`);
  }
  return 0;
}

function cmdIdentityAdd(args: string[]): number {
  const identityId = required(args[0], "identity add requires an identity id");
  const path = optionValue(args, "--config") ?? configPath();
  const identity: Identity = {
    identityId,
    profile: optionValue(args, "--profile") ?? identityId,
    memoryScope: optionValue(args, "--memory-scope") ?? optionValue(args, "--memory") ?? identityId,
    activeEvi:
      optionValue(args, "--processor") ??
      optionValue(args, "--active-evi") ??
      optionValue(args, "--active-processor") ??
      "",
    description: optionValue(args, "--description") ?? "",
  };
  const next = setIdentityConfig(loadConfigData(path), identity, hasFlag(args, "--force"));
  writeConfigData(path, next);
  console.log(
    `identity=${identity.identityId} profile=${identity.profile} memory=${identity.memoryScope || "-"} active=${identity.activeEvi || "-"}`,
  );
  return 0;
}

function cmdIdentityBind(args: string[]): number {
  const identityId = required(args[0], "identity bind requires an identity id");
  const eviId = required(args[1], "identity bind requires an evi id");
  const path = optionValue(args, "--config") ?? configPath();
  const next = bindIdentityProcessorConfig(loadConfigData(path), identityId, eviId);
  writeConfigData(path, next);
  console.log(`identity=${identityId} active=${eviId}`);
  return 0;
}

function cmdProcessorList(): number {
  const inventory = loadInventory();
  const evis = Object.values(inventory.evis);
  const width = Math.max(...evis.map((evi) => evi.eviId.length));
  for (const evi of evis.sort((a, b) => a.eviId.localeCompare(b.eviId))) {
    const identities =
      Object.values(inventory.identities)
        .filter((identity) => identity.activeEvi === evi.eviId)
        .map((identity) => identity.identityId)
        .sort()
        .join(",") || "-";
    console.log(
      `${evi.eviId.padEnd(width)}  provider=${evi.provider}  runtime=${evi.runtime}  profile=${evi.profile}  identities=${identities}`,
    );
  }
  return 0;
}

function cmdProcessorBind(args: string[]): number {
  const identityId = required(args[0], "processor bind requires an identity id");
  const eviId = required(args[1], "processor bind requires an evi id");
  const path = optionValue(args, "--config") ?? configPath();
  const next = bindIdentityProcessorConfig(loadConfigData(path), identityId, eviId);
  writeConfigData(path, next);
  console.log(`identity=${identityId} processor=${eviId}`);
  return 0;
}

function cmdProcessorLaunchPlan(args: string[]): number {
  const identityId = required(args[0], "processor launch-plan requires an identity id");
  const path = optionValue(args, "--config") ?? configPath();
  const inventory = loadInventory(loadConfigData(path));
  const plan = claudeCodeChannelsLaunchPlan(inventory, identityId);
  if (hasFlag(args, "--json")) {
    console.log(JSON.stringify(plan, null, 2));
    return 0;
  }
  console.log(`identity=${plan.identityId} processor=${plan.eviId}`);
  console.log(`channels=${plan.channels.map((channel) => channel.plugin).join(",")}`);
  console.log(`args=${plan.args.join(" ")}`);
  console.log(`settings=${JSON.stringify(plan.settings)}`);
  return 0;
}

function cmdInterfaceList(): number {
  const inventory = loadInventory();
  const bindings = Object.values(inventory.interfaces);
  if (bindings.length === 0) {
    console.log("no interfaces configured");
    return 0;
  }
  const width = Math.max(...bindings.map((binding) => binding.key.length));
  for (const binding of bindings.sort((a, b) => a.key.localeCompare(b.key))) {
    const identity = inventory.identities[binding.identityId];
    const active = identity?.activeEvi || "-";
    console.log(
      `${binding.key.padEnd(width)}  kind=${binding.kind}  address=${binding.address || "-"}  identity=${binding.identityId}  active=${active}  mode=${binding.mode}`,
    );
  }
  return 0;
}

function cmdInterfaceBind(args: string[]): number {
  const key = required(args[0], "interface bind requires an interface key");
  const identityId =
    optionValue(args, "--identity") ??
    optionValue(args, "--target") ??
    optionValue(args, "--target-identity") ??
    args[1] ??
    "";
  if (!identityId) throw new Error("interface bind requires an identity id");
  const path = optionValue(args, "--config") ?? configPath();
  const kind = optionValue(args, "--kind") ?? key.split(":", 1)[0] ?? "";
  const binding: InterfaceBinding = {
    key,
    kind,
    address: optionValue(args, "--address") ?? "",
    identityId,
    mode: optionValue(args, "--mode") ?? "primary",
  };
  if (!["primary", "standby", "mirror", "shadow", "review", "rescue"].includes(binding.mode)) {
    throw new Error(`unsupported interface mode: ${binding.mode}`);
  }
  const next = setInterfaceConfig(loadConfigData(path), binding, hasFlag(args, "--force"));
  writeConfigData(path, next);
  console.log(
    `interface=${binding.key} kind=${binding.kind} address=${binding.address || "-"} identity=${binding.identityId} mode=${binding.mode}`,
  );
  return 0;
}

function cmdRouteList(): number {
  const inventory = loadInventory();
  const routes = Object.values(inventory.routes);
  if (routes.length === 0) {
    console.log("no routes configured");
    return 0;
  }
  const width = Math.max(...routes.map((route) => route.key.length));
  for (const route of routes.sort((a, b) => a.key.localeCompare(b.key))) {
    console.log(
      `${route.key.padEnd(width)}  channel=${route.channel}  account=${route.accountId || "-"}  peer=${route.peerId || "-"}  target=${route.targetEvi}  mode=${route.mode}`,
    );
  }
  return 0;
}

function cmdRouteSet(args: string[]): number {
  const key = required(args[0], "route set requires a route key");
  const path = optionValue(args, "--config") ?? configPath();
  const data = loadConfigData(path);
  const channel = optionValue(args, "--channel") ?? key.split(":", 1)[0] ?? "";
  const targetEvi = optionValue(args, "--target") ?? optionValue(args, "--target-evi") ?? "";
  const mode = optionValue(args, "--mode") ?? "primary";
  if (!channel) throw new Error("route set requires --channel or a key starting with the channel");
  if (!targetEvi) throw new Error("route set requires --target <evi>");
  if (!["primary", "standby", "mirror", "shadow", "review", "rescue"].includes(mode)) {
    throw new Error(`unsupported route mode: ${mode}`);
  }
  const route: Route = {
    key,
    channel,
    targetEvi,
    accountId: optionValue(args, "--account") ?? optionValue(args, "--account-id") ?? "",
    peerId: optionValue(args, "--peer") ?? optionValue(args, "--peer-id") ?? "",
    mode,
  };
  const next = setRouteConfig(data, route, hasFlag(args, "--force"));
  writeConfigData(path, next);
  console.log(
    `route=${route.key} channel=${route.channel} account=${route.accountId || "-"} peer=${route.peerId || "-"} target=${route.targetEvi} mode=${route.mode}`,
  );
  return 0;
}

function cmdMemoryStatus(): number {
  const inventory = loadInventory();
  console.log(`event_log=${expandPath(inventory.memoryEventLog) ?? inventory.memoryEventLog}`);
  console.log(
    `compiled_notes=${expandPath(inventory.memoryCompiledNotes) ?? inventory.memoryCompiledNotes}`,
  );
  return 0;
}

function cmdMemoryPromote(args: string[]): number {
  const path = optionValue(args, "--config") ?? configPath();
  const inventory = loadInventory(loadConfigData(path));
  const result = promoteMemoryEvents(
    inventory.memoryEventLog,
    inventory.memoryCompiledNotes,
    numberOption(args, "--limit", 100),
  );
  console.log(`promoted=${result.eventCount} notes=${result.notePath}`);
  return 0;
}

function cmdMemorySync(args: string[]): number {
  const path = optionValue(args, "--config") ?? configPath();
  const inventory = loadInventory(loadConfigData(path));
  const result = syncNetworkMemory(inventory);
  console.log(
    `sync=network sources=${result.sources} sinks=${result.sinks} notes=${result.networkPath}`,
  );
  return 0;
}

function printMemorySearchResults(results: MemorySearchResult[]): void {
  if (results.length === 0) {
    console.log("no memory results");
    return;
  }
  for (const result of results) {
    const location = result.line > 0 ? `${result.path}:${result.line}` : result.path;
    const target = result.targetEvi || "-";
    const timestamp = result.timestamp || "-";
    const subject = result.subject ? ` subject=${result.subject}` : "";
    const verdict = result.verdict ? ` verdict=${result.verdict}` : "";
    console.log(
      `${result.kind} target=${target} timestamp=${timestamp}${subject}${verdict} path=${location} text=${compactText(result.text)}`,
    );
  }
}

function cmdMemorySearch(args: string[]): number {
  const query = optionValue(args, "--query") ?? args[0] ?? "";
  const path = optionValue(args, "--config") ?? configPath();
  const inventory = loadInventory(loadConfigData(path));
  const results = searchMemory(inventory, query, numberOption(args, "--limit", 20));
  if (hasFlag(args, "--json")) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    printMemorySearchResults(results);
  }
  return results.length > 0 ? 0 : 1;
}

function cmdMemoryExport(args: string[]): number {
  const path = optionValue(args, "--config") ?? configPath();
  const inventory = loadInventory(loadConfigData(path));
  const memory = compileNetworkMemory(inventory);
  if (hasFlag(args, "--json")) {
    console.log(JSON.stringify({ memory }, null, 2));
  } else {
    process.stdout.write(memory);
  }
  return 0;
}

function cmdSync(args: string[]): number {
  const path = optionValue(args, "--config") ?? configPath();
  const inventory = loadInventory(loadConfigData(path));
  const result = promoteMemoryEvents(
    inventory.memoryEventLog,
    inventory.memoryCompiledNotes,
    numberOption(args, "--limit", 100),
  );
  const network = syncNetworkMemory(inventory);
  console.log(`sync=memory promoted=${result.eventCount} notes=${result.notePath}`);
  console.log(
    `sync=network sources=${network.sources} sinks=${network.sinks} notes=${network.networkPath}`,
  );
  return 0;
}

function cmdSend(args: string[]): number {
  const requestedTarget = required(args[0], "send requires a target evi or identity");
  const path = optionValue(args, "--config") ?? configPath();
  const inventory = loadInventory(loadConfigData(path));
  const resolved = resolveProcessorTarget(inventory, requestedTarget);
  const targetEvi = resolved.evi.eviId;
  const text = optionValue(args, "--text") ?? "";
  const event = createTaskEvent(inventory, targetEvi, {
    text,
    subject: optionValue(args, "--subject") ?? resolved.identity?.identityId,
    source: optionValue(args, "--source"),
  });
  const queueOnly = hasFlag(args, "--queue-only");
  if (hasFlag(args, "--dry-run")) {
    const identity = resolved.identity ? ` identity=${resolved.identity.identityId}` : "";
    console.log(
      `dry_run=send target=${targetEvi}${identity} method=${dispatchMethodFor(queueOnly)} text=${compactText(text)}`,
    );
    return 0;
  }
  const eventLog = appendMemoryEvent(inventory.memoryEventLog, event);
  const result = dispatchTask(resolved.evi, text, { queueOnly });
  const identity = resolved.identity ? ` identity=${resolved.identity.identityId}` : "";
  console.log(
    `event=${event.id} type=${event.type} target=${event.target_evi}${identity} delivered=${result.delivered} method=${result.method} detail=${result.detail} log=${eventLog}`,
  );
  return result.method === "tmux" && !result.delivered ? 1 : 0;
}

function cmdFeedback(args: string[]): number {
  const targetEvi = required(args[0], "feedback requires a target evi");
  const path = optionValue(args, "--config") ?? configPath();
  const inventory = loadInventory(loadConfigData(path));
  const event = createFeedbackEvent(inventory, targetEvi, {
    verdict: optionValue(args, "--verdict") ?? "remember",
    text: optionValue(args, "--text") ?? "",
    subject: optionValue(args, "--subject"),
    source: optionValue(args, "--source"),
    confidence: numberOption(args, "--confidence", 1),
  });
  const eventLog = appendMemoryEvent(inventory.memoryEventLog, event);
  console.log(
    `event=${event.id} type=${event.type} target=${event.target_evi} verdict=${event.verdict} log=${eventLog}`,
  );
  return 0;
}

function cmdInspect(args: string[]): number {
  const path = optionValue(args, "--config") ?? configPath();
  const inventory = loadInventory(loadConfigData(path));
  const eviId = args[0];
  if (!eviId) throw new Error("inspect requires an evi id");
  const evi = inventory.evis[eviId];
  if (!evi) {
    const known = Object.keys(inventory.evis).sort().join(", ");
    throw new Error(`unknown evi: ${eviId} (known: ${known})`);
  }
  console.log(`evi_id=${evi.eviId}`);
  console.log(`provider=${evi.provider}`);
  console.log(`runtime=${evi.runtime}`);
  console.log(`profile=${evi.profile}`);
  console.log(`network=${evi.networkId}`);
  console.log(`replica_of=${evi.replicaOf || "-"}`);
  console.log(`role=${evi.role || "-"}`);
  console.log(`model_provider=${evi.modelProvider || "-"}`);
  console.log(`model=${evi.model || "-"}`);
  console.log(`base_url=${evi.baseUrl || "-"}`);
  console.log(`agent_id=${evi.agentId || "-"}`);
  console.log(`session_id=${evi.sessionId || "-"}`);
  console.log(`workspace=${displayPath(evi.workspace)}`);
  console.log(`state_dir=${displayPath(evi.stateDir)}`);
  const env = runtimeEnvForEvi(evi);
  console.log(`env=${Object.keys(env).length}`);
  for (const [key, value] of Object.entries(env).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`- ${key}=${value}`);
  }
  const routes = Object.values(inventory.routes).filter((route) => route.targetEvi === evi.eviId);
  console.log(`routes=${routes.length}`);
  for (const route of routes.sort((a, b) => a.key.localeCompare(b.key))) {
    console.log(
      `- ${route.key}: ${route.channel}/${route.accountId || "-"}/${route.peerId || "-"} (${route.mode})`,
    );
  }
  return 0;
}

function cmdStatus(args: string[]): number {
  const targets = loadTargets();
  const selected = args[0] ? [targets[resolveTarget(args[0], targets)]] : Object.values(targets);
  printStatuses(selected.map(statusFor));
  return 0;
}

function cmdTargets(): number {
  const targets = loadTargets();
  for (const name of Object.keys(targets).sort()) {
    const target = targets[name];
    console.log(
      `${name}\tprovider=${target.provider ?? "-"}\tlabel=${target.label ?? "-"}\tplist=${expandPath(target.plist) ?? "-"}`,
    );
  }
  return 0;
}

function cmdTargetAdd(args: string[]): number {
  const name = optionValue(args, "--name") ?? args[0];
  if (!name) throw new Error("target add requires a target name");
  const path = optionValue(args, "--config") ?? configPath();
  const data = loadConfigData(path);
  const provider = resolveProvider(optionValue(args, "--provider") ?? name);
  const base = loadTargets(data)[name] ?? {
    name,
    provider,
    tmuxSessions: [],
    processPatterns: [],
    healthPatterns: [],
  };
  const target: Target = {
    name,
    provider,
    label: optionValue(args, "--label") ?? base.label,
    plist: optionValue(args, "--plist") ?? base.plist,
    tmuxSessions: optionValues(args, "--tmux").length
      ? optionValues(args, "--tmux")
      : base.tmuxSessions,
    processPatterns: optionValues(args, "--process").length
      ? optionValues(args, "--process")
      : base.processPatterns,
    healthPatterns: optionValues(args, "--health").length
      ? optionValues(args, "--health")
      : base.healthPatterns,
  };
  writeConfigData(path, setTargetConfig(data, target, hasFlag(args, "--force")));
  console.log(
    `target=${target.name} provider=${target.provider} label=${target.label ?? "-"} plist=${displayPath(target.plist ?? "")}`,
  );
  return 0;
}

function tailSessionsFor(subject: string, inventory: Inventory): string[] {
  const evi = inventory.evis[subject];
  if (evi) {
    if (evi.sessionId) return [evi.sessionId];
    return inventory.targets[evi.runtime]?.tmuxSessions ?? [];
  }
  const target = inventory.targets[resolveTarget(subject, inventory.targets)];
  return target.tmuxSessions;
}

function cmdTail(args: string[]): number {
  const subject = required(args[0], "tail requires a target or evi id");
  const path = optionValue(args, "--config") ?? configPath();
  const inventory = loadInventory(loadConfigData(path));
  const lines = numberOption(args, "--lines", 80);
  const sessions = tailSessionsFor(subject, inventory);
  if (sessions.length === 0) throw new Error(`no tmux sessions configured for ${subject}`);
  for (const session of sessions) {
    if (sessions.length > 1) console.log(`==> ${session} <==`);
    const output = tmuxCapture(session, lines).trimEnd();
    if (output) console.log(output);
  }
  return 0;
}

function cmdStart(args: string[]): number {
  const targets = loadTargets();
  const key = resolveTarget(required(args[0], "start requires a target"), targets);
  bootstrap(targets[key]);
  printStatuses([statusFor(targets[key])]);
  return 0;
}

function cmdStop(args: string[]): number {
  const targets = loadTargets();
  const key = resolveTarget(required(args[0], "stop requires a target"), targets);
  stopTarget(targets[key]);
  printStatuses([statusFor(targets[key])]);
  return 0;
}

function cmdStopAll(): number {
  const targets = loadTargets();
  for (const target of Object.values(targets)) stopTarget(target);
  printStatuses(Object.values(targets).map(statusFor));
  return 0;
}

function cmdUse(args: string[]): number {
  const targets = loadTargets();
  const key = resolveTarget(required(args[0], "use requires a target"), targets);
  for (const [name, target] of Object.entries(targets)) {
    if (name !== key) stopTarget(target);
  }
  bootstrap(targets[key]);
  printStatuses(Object.values(targets).map(statusFor));
  return 0;
}

function ensureTargets(targets: Record<string, Target>): TargetStatus[] {
  const nextStatuses: TargetStatus[] = [];
  for (const target of Object.values(targets)) {
    const status = statusFor(target);
    if (!status.running) bootstrap(target);
    nextStatuses.push(statusFor(target));
  }
  return nextStatuses;
}

function cmdMonitor(args: string[], options: GlobalOptions): number {
  const once = hasFlag(args, "--once");
  if (options.headless && !once) throw new Error("monitor --headless requires --once");
  const interval = numberOption(args, "--interval", 60);
  const targets = loadTargets();
  const runOnce = () => {
    const statuses = ensureTargets(targets);
    printStatuses(statuses);
    try {
      const inventory = loadInventory();
      const result = syncNetworkMemory(inventory);
      console.log(
        `sync=network sources=${result.sources} sinks=${result.sinks} notes=${result.networkPath}`,
      );
    } catch (error) {
      console.error(`sync=network error=${error instanceof Error ? error.message : String(error)}`);
    }
  };
  runOnce();
  if (once) return 0;
  setInterval(runOnce, Math.max(5, interval) * 1000);
  return 0;
}

function cmdDoctor(): number {
  const targets = loadTargets();
  const statuses = Object.values(targets).map(statusFor);
  printStatuses(statuses);
  const conflicts = duplicatePrimaryRoutes(loadInventory().routes);
  if (conflicts.size > 0) {
    for (const [owner, routes] of conflicts) {
      console.error(
        `conflict: duplicate primary route ${ownerLabel(owner)}: ${routes.map((route) => route.key).join(", ")}`,
      );
    }
    return 2;
  }
  const running = statuses.filter((status) => status.running).map((status) => status.name);
  if (running.length === 0) {
    console.error("warning: no target running");
    return 1;
  }
  console.log(`running: ${running.join(", ")}`);
  return 0;
}

function required(value: string | undefined, message: string): string {
  if (!value) throw new Error(message);
  return value;
}

function printHelp(): void {
  console.log(`Usage: evictl <command>

Global options:
  --headless  Run without interactive UI or open-ended waits. Long-running commands must opt into a one-shot form.

Commands:
  ps
  discover [--json]
  import [--dry-run] [--json] [--config <path>]
  status [target]
  targets
  target add <name> --provider <provider> [--label <launchd-label>] [--plist <path>] [--tmux <session>] [--process <regex>] [--health <text>] [--force]
  evi add --provider <provider> [--runtime <target>] [--id <evi>] [--profile <profile>] [--workspace <path>] [--state-dir <path>] [--model-provider <provider>] [--model <model>] [--base-url <url>] [--env KEY=VALUE] [--network <id>] [--force]
  evi clone <source-evi> [--provider <provider>] [--runtime <target>] [--id <evi>] [--profile <profile>] [--workspace <path>] [--state-dir <path>] [--model-provider <provider>] [--model <model>] [--base-url <url>] [--env KEY=VALUE] [--force]
  evi start <evi>
  evi stop <evi>
  identity list
  identity show <identity>
  identity add <identity> [--profile <profile>] [--memory-scope <scope>] [--processor <evi>] [--description <text>] [--force]
  identity bind <identity> <evi>
  identity switch <identity> <evi>
  interface list
  interface bind <key> <identity> [--kind <kind>] [--address <address>] [--mode <mode>] [--force]
  processor list
  processor bind <identity> <evi>
  processor switch <identity> <evi>
  processor launch-plan <identity> [--json]
  spawn <provider> [--runtime <target>] [--id <evi>] [--profile <profile>] [--workspace <path>] [--state-dir <path>] [--model-provider <provider>] [--model <model>] [--base-url <url>] [--env KEY=VALUE] [--force]
  start <target>
  stop <target>
  stop-all
  use <target>
  monitor [--once] [--interval <seconds>]
  tail <target-or-evi> [--lines <n>]
  doctor
  route list
  route set <key> --target <evi> [--channel <channel>] [--account <id>] [--peer <id>] [--mode <mode>] [--force]
  memory status
  memory promote [--limit <n>]
  memory search <query> [--limit <n>] [--json]
  memory export [--json]
  memory import
  memory sync
  sync [--limit <n>]
  send <evi-or-identity> --text <text> [--subject <id>] [--source <source>] [--queue-only] [--dry-run]
  feedback <evi> --text <text> [--verdict <verdict>] [--subject <id>] [--source <source>] [--confidence <n>]
  inspect <evi>
`);
}

export function main(argv = process.argv.slice(2)): number {
  const { command, args, options } = parseGlobalOptions(argv);
  const commands: Record<string, Command> = {
    ps: () => cmdPs(),
    discover: cmdDiscover,
    import: cmdImport,
    status: cmdStatus,
    targets: () => cmdTargets(),
    spawn: cmdSpawn,
    start: cmdStart,
    stop: cmdStop,
    "stop-all": () => cmdStopAll(),
    use: cmdUse,
    monitor: cmdMonitor,
    tail: cmdTail,
    doctor: () => cmdDoctor(),
    sync: cmdSync,
    send: cmdSend,
    inspect: cmdInspect,
    feedback: cmdFeedback,
  };
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return command ? 0 : 1;
  }
  if (command === "route" && args[0] === "list") return cmdRouteList();
  if (command === "route" && args[0] === "set") return cmdRouteSet(args.slice(1));
  if (command === "target" && args[0] === "add") return cmdTargetAdd(args.slice(1));
  if (command === "evi" && args[0] === "add") return cmdEviAdd(args.slice(1));
  if (command === "evi" && args[0] === "clone") return cmdEviClone(args.slice(1));
  if (command === "evi" && args[0] === "start") return cmdEviStart(args.slice(1));
  if (command === "evi" && args[0] === "stop") return cmdEviStop(args.slice(1));
  if (command === "identity" && args[0] === "list") return cmdIdentityList();
  if (command === "identity" && args[0] === "show") return cmdIdentityShow(args.slice(1));
  if (command === "identity" && args[0] === "add") return cmdIdentityAdd(args.slice(1));
  if (command === "identity" && args[0] === "bind") return cmdIdentityBind(args.slice(1));
  if (command === "identity" && args[0] === "switch") return cmdIdentityBind(args.slice(1));
  if (command === "interface" && args[0] === "list") return cmdInterfaceList();
  if (command === "interface" && args[0] === "bind") return cmdInterfaceBind(args.slice(1));
  if (command === "processor" && args[0] === "list") return cmdProcessorList();
  if (command === "processor" && args[0] === "bind") return cmdProcessorBind(args.slice(1));
  if (command === "processor" && args[0] === "switch") return cmdProcessorBind(args.slice(1));
  if (command === "processor" && args[0] === "launch-plan")
    return cmdProcessorLaunchPlan(args.slice(1));
  if (command === "memory" && args[0] === "status") return cmdMemoryStatus();
  if (command === "memory" && args[0] === "promote") return cmdMemoryPromote(args.slice(1));
  if (command === "memory" && args[0] === "search") return cmdMemorySearch(args.slice(1));
  if (command === "memory" && args[0] === "export") return cmdMemoryExport(args.slice(1));
  if (command === "memory" && args[0] === "import") return cmdMemorySync(args.slice(1));
  if (command === "memory" && args[0] === "sync") return cmdMemorySync(args.slice(1));
  const handler = commands[command];
  if (!handler) throw new Error(`unknown command: ${command}`);
  return handler(args, options);
}

if (import.meta.main) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
