#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

export type Target = {
  name: string;
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
  profile: string;
  agentId: string;
  sessionId: string;
  workspace: string;
  stateDir: string;
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

export type SendResult = {
  event: MemoryEvent;
  eventLog: string;
  delivered: boolean;
  method: string;
  detail: string;
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

type Command = (args: string[]) => number;

export const DEFAULT_TARGETS: Record<string, Target> = {
  openclaw: {
    name: "openclaw",
    label: "ai.openclaw.gateway",
    plist: "~/Library/LaunchAgents/ai.openclaw.gateway.plist",
    tmuxSessions: [],
    processPatterns: ["openclaw", "ai.openclaw.gateway", "com.clawdbot.gateway"],
    healthPatterns: [],
  },
  hermes: {
    name: "hermes",
    label: "ai.hermes.gateway-nukoevi",
    plist: "~/Library/LaunchAgents/ai.hermes.gateway-nukoevi.plist",
    tmuxSessions: ["hermes-line-tunnel"],
    processPatterns: ["hermes_cli.main", "ai.hermes.gateway", "cloudflared.*\\.hermes"],
    healthPatterns: [],
  },
  ccc: {
    name: "ccc",
    label: "com.local.claude-telegram-channel",
    plist: "~/Library/LaunchAgents/com.local.claude-telegram-channel.plist",
    tmuxSessions: ["claude-telegram-channel"],
    processPatterns: ["claude.*plugin:telegram", "nukoevi-telegram", "claude-telegram-channel"],
    healthPatterns: ["Listening for channel messages from:"],
  },
};

export const ALIASES: Record<string, string> = {
  claude: "ccc",
  "claude-code-channels": "ccc",
  channels: "ccc",
  "hermes-agent": "hermes",
  "open-claw": "openclaw",
};

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
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringMap(value: unknown): Record<string, string> {
  const raw = objectValue(value);
  const entries = Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string");
  return Object.fromEntries(entries);
}

export function loadTargets(data = loadConfigData()): Record<string, Target> {
  const targets = structuredClone(DEFAULT_TARGETS);
  const configuredTargets = objectValue(data.targets);
  for (const [name, rawTarget] of Object.entries(configuredTargets)) {
    const raw = objectValue(rawTarget);
    const base = targets[name] ?? {
      name,
      tmuxSessions: [],
      processPatterns: [],
      healthPatterns: [],
    };
    targets[name] = {
      name,
      label: stringValue(raw.label, base.label ?? "") || undefined,
      plist: stringValue(raw.plist, base.plist ?? "") || undefined,
      tmuxSessions: stringArray(raw.tmux_sessions ?? raw.tmuxSessions, base.tmuxSessions),
      processPatterns: stringArray(raw.process_patterns ?? raw.processPatterns, base.processPatterns),
      healthPatterns: stringArray(raw.health_patterns ?? raw.healthPatterns, base.healthPatterns),
    };
  }
  return targets;
}

export function loadInventory(data = loadConfigData()): Inventory {
  const targets = loadTargets(data);
  const evis: Record<string, Evi> = {};
  for (const name of Object.keys(targets).sort()) {
    evis[`evi-${name}`] = {
      eviId: `evi-${name}`,
      runtime: name,
      profile: "default",
      agentId: "",
      sessionId: "",
      workspace: "",
      stateDir: "",
    };
  }
  const configuredEvis = objectValue(data.evis);
  for (const [eviId, rawEvi] of Object.entries(configuredEvis)) {
    const raw = objectValue(rawEvi);
    const runtime = stringValue(raw.runtime);
    if (!runtime) throw new Error(`evi missing runtime: ${eviId}`);
    evis[eviId] = {
      eviId,
      runtime,
      profile: stringValue(raw.profile, "default"),
      agentId: stringValue(raw.agent_id ?? raw.agentId),
      sessionId: stringValue(raw.session_id ?? raw.sessionId),
      workspace: stringValue(raw.workspace),
      stateDir: stringValue(raw.state_dir ?? raw.stateDir),
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
    routes,
    memoryEventLog: stringValue(memory.event_log ?? memory.eventLog, "~/.local/share/evictl/events.jsonl"),
    memoryCompiledNotes: stringValue(memory.compiled_notes ?? memory.compiledNotes, "~/.local/share/evictl/memory"),
  };
}

function defaultDiscovery(): Discovery {
  return {
    targets: {},
    evis: {},
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
  return runningByRuntime[runtime] ? "primary" : "standby";
}

function readTextIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function shellAssignedValue(script: string, name: string): string {
  const match = script.match(new RegExp(`${name}=["']([^"']+)["']`));
  return match?.[1] ?? "";
}

function shellFlagValue(script: string, name: string): string {
  const match = script.match(new RegExp(`${name}\\s+([^\\s"']+)`));
  return match?.[1] ?? "";
}

function targetWithPlist(runtime: string, data: Record<string, unknown>, path: string): Target {
  const base = DEFAULT_TARGETS[runtime] ?? {
    name: runtime,
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

function addHermesDiscovery(discovery: Discovery, record: PlistRecord, runningByRuntime: Record<string, boolean>): void {
  const args = plistArgs(record.data);
  const env = stringMap(record.data.EnvironmentVariables);
  const home = env.HERMES_HOME || join(homedir(), ".hermes", "profiles", profileFromArgs(args) ?? "default");
  const profile = profileFromArgs(args) ?? basename(home) ?? "default";
  const eviId = `evi-hermes-${slug(profile)}`;
  discovery.targets.hermes = targetWithPlist("hermes", record.data, record.path);
  discovery.evis[eviId] = {
    eviId,
    runtime: "hermes",
    profile,
    agentId: "",
    sessionId: "",
    workspace: plistWorkingDirectory(record.data) || join(homedir(), ".hermes", "hermes-agent"),
    stateDir: home,
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

function addCccDiscovery(discovery: Discovery, record: PlistRecord, runningByRuntime: Record<string, boolean>): void {
  const args = plistArgs(record.data);
  const startScript = args.find((arg) => arg.includes("claude-telegram-channel")) ?? "";
  const stateDir = startScript ? dirname(startScript) : join(homedir(), ".local", "share", "claude-telegram-channel");
  const script = startScript ? readTextIfExists(startScript) : "";
  const sessionName = shellAssignedValue(script, "session_name");
  const agentName = shellFlagValue(script, "--name");
  const eviId = "evi-ccc-telegram";
  discovery.targets.ccc = targetWithPlist("ccc", record.data, record.path);
  discovery.evis[eviId] = {
    eviId,
    runtime: "ccc",
    profile: "telegram",
    agentId: agentName,
    sessionId: sessionName,
    workspace: plistWorkingDirectory(record.data) || shellAssignedValue(script, "workdir"),
    stateDir,
  };
  discovery.routes["telegram:ccc:default"] = {
    key: "telegram:ccc:default",
    channel: "telegram",
    accountId: "default",
    peerId: "",
    targetEvi: eviId,
    mode: routeMode(runningByRuntime, "ccc"),
  };
  discovery.sources.push({
    runtime: "ccc",
    kind: "launchd",
    path: record.path,
    label: plistLabel(record.data),
    status: routeMode(runningByRuntime, "ccc"),
  });
  if (startScript && existsSync(startScript)) {
    discovery.sources.push({
      runtime: "ccc",
      kind: "start-script",
      path: startScript,
      label: agentName || "telegram",
      status: sessionName || "found",
    });
  }
}

function addOpenClawDiscovery(discovery: Discovery, record: PlistRecord, runningByRuntime: Record<string, boolean>): void {
  const args = plistArgs(record.data);
  const profile = profileFromArgs(args) ?? "default";
  const eviId = `evi-openclaw-${slug(profile)}`;
  discovery.targets.openclaw = targetWithPlist("openclaw", record.data, record.path);
  discovery.evis[eviId] = {
    eviId,
    runtime: "openclaw",
    profile,
    agentId: "",
    sessionId: "",
    workspace: plistWorkingDirectory(record.data),
    stateDir: join(homedir(), ".openclaw"),
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

function classifyPlist(record: PlistRecord): "hermes" | "ccc" | "openclaw" | undefined {
  const haystack = [record.path, plistLabel(record.data), ...plistArgs(record.data), plistWorkingDirectory(record.data)].join("\n").toLowerCase();
  if (haystack.includes("claude-telegram-channel") || haystack.includes("claude-code-channels")) return "ccc";
  if (haystack.includes("hermes_cli.main") || haystack.includes("hermes-agent") || haystack.includes("ai.hermes")) return "hermes";
  if (haystack.includes("openclaw") || haystack.includes("open-claw")) return "openclaw";
  return undefined;
}

function demoteDuplicatePrimaryRoutes(discovery: Discovery): void {
  const conflicts = duplicatePrimaryRoutes(discovery.routes);
  for (const [owner, routes] of conflicts) {
    for (const route of routes) route.mode = "standby";
    discovery.warnings.push(`route conflict ${ownerLabel(owner)} imported as standby: ${routes.map((route) => route.key).join(", ")}`);
  }
}

export function discoverFromPlistRecords(records: PlistRecord[], runningByRuntime: Record<string, boolean> = {}): Discovery {
  const discovery = defaultDiscovery();
  for (const record of records) {
    const runtime = classifyPlist(record);
    if (runtime === "hermes") addHermesDiscovery(discovery, record, runningByRuntime);
    if (runtime === "ccc") addCccDiscovery(discovery, record, runningByRuntime);
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
  for (const name of readdirSync(dir).filter((item) => item.endsWith(".plist")).sort()) {
    const path = join(dir, name);
    const data = readPlist(path);
    if (data) records.push({ path, data });
  }
  return records;
}

export function discoverLocalSetup(): Discovery {
  const runningByRuntime = Object.fromEntries(Object.entries(loadTargets()).map(([name, target]) => [name, statusFor(target).running]));
  return discoverFromPlistRecords(launchAgentRecords(), runningByRuntime);
}

function targetToConfig(target: Target): Record<string, unknown> {
  return {
    label: target.label,
    plist: target.plist,
    tmux_sessions: target.tmuxSessions,
    process_patterns: target.processPatterns,
    health_patterns: target.healthPatterns,
  };
}

function eviToConfig(evi: Evi): Record<string, unknown> {
  return {
    runtime: evi.runtime,
    profile: evi.profile,
    agent_id: evi.agentId,
    session_id: evi.sessionId,
    workspace: evi.workspace,
    state_dir: evi.stateDir,
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

export function setRouteConfig(data: Record<string, unknown>, route: Route, force = false): Record<string, unknown> {
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
        throw new Error(`duplicate primary route ${ownerLabel(owner)}: ${conflictRoutes.map((item) => item.key).join(", ")}`);
      }
    }
  }
  return {
    ...data,
    routes: Object.fromEntries(Object.entries(routes).map(([key, value]) => [key, routeToConfig(value)])),
  };
}

function eviConfig(evi: Evi): Record<string, unknown> {
  return {
    runtime: evi.runtime,
    profile: evi.profile,
    agent_id: evi.agentId,
    session_id: evi.sessionId,
    workspace: evi.workspace,
    state_dir: evi.stateDir,
  };
}

export function spawnEviConfig(data: Record<string, unknown>, evi: Evi, force = false): Record<string, unknown> {
  const inventory = loadInventory(data);
  if (!inventory.targets[evi.runtime]) {
    const known = Object.keys(inventory.targets).sort().join(", ");
    throw new Error(`unknown runtime: ${evi.runtime} (known: ${known})`);
  }
  if (!force && inventory.evis[evi.eviId]) {
    throw new Error(`evi already exists: ${evi.eviId}`);
  }
  return {
    ...data,
    evis: {
      ...objectValue(data.evis),
      [evi.eviId]: eviConfig(evi),
    },
  };
}

export function mergeConfigData(existing: Record<string, unknown>, discovery: Discovery): Record<string, unknown> {
  const targets = { ...objectValue(existing.targets) };
  for (const [name, target] of Object.entries(discovery.targets)) targets[name] = targetToConfig(target);
  const evis = { ...objectValue(existing.evis) };
  for (const [eviId, evi] of Object.entries(discovery.evis)) evis[eviId] = eviToConfig(evi);
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

function tmuxCapture(session: string): string {
  const result = run(["tmux", "capture-pane", "-pt", session, "-S", "-80"]);
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
    console.log(`${item.name.padEnd(width)}  ${state.padEnd(7)}  ${health.padEnd(7)}  pids=${pids}  tmux=${tmux}  notes=${notes}`);
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

function numberOption(args: string[], name: string, fallback: number): number {
  const raw = optionValue(args, name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`invalid number for ${name}: ${raw}`);
  return value;
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

export function compileMemoryNotes(events: MemoryEvent[], limit = 100): string {
  const selected = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp)).slice(-limit);
  const lines = ["# evictl Shared Memory", "", `Promoted events: ${selected.length}`, ""];
  if (selected.length === 0) {
    lines.push("No memory events promoted yet.", "");
    return lines.join("\n");
  }
  const byEvi = new Map<string, MemoryEvent[]>();
  for (const event of selected) byEvi.set(event.target_evi, [...(byEvi.get(event.target_evi) ?? []), event]);
  for (const [targetEvi, targetEvents] of [...byEvi].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`## ${targetEvi}`, "");
    for (const event of targetEvents) {
      const subject = event.subject ? ` subject=${event.subject}` : "";
      lines.push(`- ${event.timestamp} ${event.verdict || event.type} confidence=${event.confidence}${subject}: ${compactText(event.text)}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function promoteMemoryEvents(eventLog: string, compiledNotes: string, limit = 100): { eventCount: number; notePath: string } {
  const events = readMemoryEvents(eventLog);
  const notesDir = concretePath(compiledNotes);
  mkdirSync(notesDir, { recursive: true });
  const notePath = join(notesDir, "feedback.md");
  writeFileSync(notePath, compileMemoryNotes(events, limit));
  return { eventCount: Math.min(events.length, limit), notePath };
}

function dispatchTask(evi: Evi, text: string, queueOnly: boolean): { delivered: boolean; method: string; detail: string } {
  if (queueOnly) return { delivered: false, method: "queue", detail: "queue-only" };
  if (!evi.sessionId) return { delivered: false, method: "queue", detail: "missing-session" };
  if (!tmuxExists(evi.sessionId)) return { delivered: false, method: "tmux", detail: "session-missing" };
  const result = run(["tmux", "send-keys", "-t", evi.sessionId, text, "Enter"]);
  if (result.code !== 0) return { delivered: false, method: "tmux", detail: result.stderr.trim() || "send-failed" };
  return { delivered: true, method: "tmux", detail: evi.sessionId };
}

export function queueTaskEvent(inventory: Inventory, targetEvi: string, text: string, values: { subject?: string; source?: string } = {}): MemoryEvent {
  return createTaskEvent(inventory, targetEvi, { ...values, text });
}

function printDiscovery(discovery: Discovery): void {
  const targets = Object.keys(discovery.targets).sort();
  console.log(`targets=${targets.length ? targets.join(",") : "-"}`);
  const evis = Object.values(discovery.evis).sort((a, b) => a.eviId.localeCompare(b.eviId));
  for (const evi of evis) {
    console.log(`evi=${evi.eviId} runtime=${evi.runtime} profile=${evi.profile} workspace=${displayPath(evi.workspace)} state_dir=${displayPath(evi.stateDir)}`);
  }
  const routes = Object.values(discovery.routes).sort((a, b) => a.key.localeCompare(b.key));
  for (const route of routes) {
    console.log(`route=${route.key} channel=${route.channel} account=${route.accountId || "-"} peer=${route.peerId || "-"} target=${route.targetEvi} mode=${route.mode}`);
  }
  for (const source of discovery.sources) {
    console.log(`source=${source.runtime} kind=${source.kind} label=${source.label || "-"} status=${source.status} path=${source.path}`);
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
  const statuses = Object.fromEntries(Object.values(inventory.targets).map((target) => [target.name, statusFor(target)]));
  const width = Math.max(...Object.values(inventory.evis).map((evi) => evi.eviId.length));
  for (const evi of Object.values(inventory.evis).sort((a, b) => a.eviId.localeCompare(b.eviId))) {
    const status = statuses[evi.runtime];
    const state = status ? (status.running ? "running" : "stopped") : "unknown";
    const health = status ? (status.healthy ? "healthy" : "unknown") : "unknown";
    const routes = Object.values(inventory.routes).filter((route) => route.targetEvi === evi.eviId).length;
    console.log(`${evi.eviId.padEnd(width)}  runtime=${evi.runtime.padEnd(20)}  profile=${evi.profile.padEnd(10)}  state=${state.padEnd(7)}  health=${health.padEnd(7)}  routes=${routes}`);
  }
  return 0;
}

function cmdSpawn(args: string[]): number {
  const runtimeArg = required(args[0], "spawn requires a runtime");
  const path = optionValue(args, "--config") ?? configPath();
  const data = loadConfigData(path);
  const targets = loadTargets(data);
  const runtime = resolveTarget(runtimeArg, targets);
  const eviId = optionValue(args, "--id") ?? `evi-${runtime}-${optionValue(args, "--profile") ?? "default"}`;
  const evi: Evi = {
    eviId,
    runtime,
    profile: optionValue(args, "--profile") ?? "default",
    agentId: optionValue(args, "--agent") ?? optionValue(args, "--agent-id") ?? "",
    sessionId: optionValue(args, "--session") ?? optionValue(args, "--session-id") ?? "",
    workspace: optionValue(args, "--workspace") ?? "",
    stateDir: optionValue(args, "--state-dir") ?? "",
  };
  writeConfigData(path, spawnEviConfig(data, evi, hasFlag(args, "--force")));
  console.log(`evi=${evi.eviId} runtime=${evi.runtime} profile=${evi.profile} workspace=${displayPath(evi.workspace)} state_dir=${displayPath(evi.stateDir)}`);
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
    console.log(`${route.key.padEnd(width)}  channel=${route.channel}  account=${route.accountId || "-"}  peer=${route.peerId || "-"}  target=${route.targetEvi}  mode=${route.mode}`);
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
  console.log(`route=${route.key} channel=${route.channel} account=${route.accountId || "-"} peer=${route.peerId || "-"} target=${route.targetEvi} mode=${route.mode}`);
  return 0;
}

function cmdMemoryStatus(): number {
  const inventory = loadInventory();
  console.log(`event_log=${expandPath(inventory.memoryEventLog) ?? inventory.memoryEventLog}`);
  console.log(`compiled_notes=${expandPath(inventory.memoryCompiledNotes) ?? inventory.memoryCompiledNotes}`);
  return 0;
}

function cmdMemoryPromote(args: string[]): number {
  const path = optionValue(args, "--config") ?? configPath();
  const inventory = loadInventory(loadConfigData(path));
  const result = promoteMemoryEvents(inventory.memoryEventLog, inventory.memoryCompiledNotes, numberOption(args, "--limit", 100));
  console.log(`promoted=${result.eventCount} notes=${result.notePath}`);
  return 0;
}

function cmdSync(args: string[]): number {
  const path = optionValue(args, "--config") ?? configPath();
  const inventory = loadInventory(loadConfigData(path));
  const result = promoteMemoryEvents(inventory.memoryEventLog, inventory.memoryCompiledNotes, numberOption(args, "--limit", 100));
  console.log(`sync=memory promoted=${result.eventCount} notes=${result.notePath}`);
  return 0;
}

function cmdSend(args: string[]): number {
  const targetEvi = required(args[0], "send requires a target evi");
  const path = optionValue(args, "--config") ?? configPath();
  const inventory = loadInventory(loadConfigData(path));
  const evi = inventory.evis[targetEvi];
  if (!evi) {
    const known = Object.keys(inventory.evis).sort().join(", ");
    throw new Error(`unknown evi: ${targetEvi} (known: ${known})`);
  }
  const text = optionValue(args, "--text") ?? "";
  const event = createTaskEvent(inventory, targetEvi, {
    text,
    subject: optionValue(args, "--subject"),
    source: optionValue(args, "--source"),
  });
  if (hasFlag(args, "--dry-run")) {
    console.log(`dry_run=send target=${targetEvi} method=${evi.sessionId ? "tmux" : "queue"} text=${compactText(text)}`);
    return 0;
  }
  const eventLog = appendMemoryEvent(inventory.memoryEventLog, event);
  const result = dispatchTask(evi, text, hasFlag(args, "--queue-only"));
  console.log(`event=${event.id} type=${event.type} target=${event.target_evi} delivered=${result.delivered} method=${result.method} detail=${result.detail} log=${eventLog}`);
  return result.method === "tmux" && !result.delivered && result.detail !== "session-missing" ? 1 : 0;
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
  console.log(`event=${event.id} type=${event.type} target=${event.target_evi} verdict=${event.verdict} log=${eventLog}`);
  return 0;
}

function cmdInspect(args: string[]): number {
  const inventory = loadInventory();
  const eviId = args[0];
  if (!eviId) throw new Error("inspect requires an evi id");
  const evi = inventory.evis[eviId];
  if (!evi) {
    const known = Object.keys(inventory.evis).sort().join(", ");
    throw new Error(`unknown evi: ${eviId} (known: ${known})`);
  }
  console.log(`evi_id=${evi.eviId}`);
  console.log(`runtime=${evi.runtime}`);
  console.log(`profile=${evi.profile}`);
  console.log(`agent_id=${evi.agentId || "-"}`);
  console.log(`session_id=${evi.sessionId || "-"}`);
  console.log(`workspace=${displayPath(evi.workspace)}`);
  console.log(`state_dir=${displayPath(evi.stateDir)}`);
  const routes = Object.values(inventory.routes).filter((route) => route.targetEvi === evi.eviId);
  console.log(`routes=${routes.length}`);
  for (const route of routes.sort((a, b) => a.key.localeCompare(b.key))) {
    console.log(`- ${route.key}: ${route.channel}/${route.accountId || "-"}/${route.peerId || "-"} (${route.mode})`);
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
    console.log(`${name}\tlabel=${target.label ?? "-"}\tplist=${expandPath(target.plist) ?? "-"}`);
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

function cmdDoctor(): number {
  const targets = loadTargets();
  const statuses = Object.values(targets).map(statusFor);
  printStatuses(statuses);
  const conflicts = duplicatePrimaryRoutes(loadInventory().routes);
  if (conflicts.size > 0) {
    for (const [owner, routes] of conflicts) {
      console.error(`conflict: duplicate primary route ${ownerLabel(owner)}: ${routes.map((route) => route.key).join(", ")}`);
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

Commands:
  ps
  discover [--json]
  import [--dry-run] [--json] [--config <path>]
  status [target]
  targets
  spawn <runtime> [--id <evi>] [--profile <profile>] [--workspace <path>] [--state-dir <path>] [--force]
  start <target>
  stop <target>
  stop-all
  use <target>
  doctor
  route list
  route set <key> --target <evi> [--channel <channel>] [--account <id>] [--peer <id>] [--mode <mode>] [--force]
  memory status
  memory promote [--limit <n>]
  sync [--limit <n>]
  send <evi> --text <text> [--subject <id>] [--source <source>] [--queue-only] [--dry-run]
  feedback <evi> --text <text> [--verdict <verdict>] [--subject <id>] [--source <source>] [--confidence <n>]
  inspect <evi>
`);
}

export function main(argv = process.argv.slice(2)): number {
  const [command, ...args] = argv;
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
  if (command === "memory" && args[0] === "status") return cmdMemoryStatus();
  if (command === "memory" && args[0] === "promote") return cmdMemoryPromote(args.slice(1));
  const handler = commands[command];
  if (!handler) throw new Error(`unknown command: ${command}`);
  return handler(args);
}

if (import.meta.main) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
