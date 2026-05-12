#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

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

export function loadConfigData(): Record<string, unknown> {
  const path = configPath();
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
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

export function loadTargets(): Record<string, Target> {
  const targets = structuredClone(DEFAULT_TARGETS);
  const data = loadConfigData();
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

export function loadInventory(): Inventory {
  const data = loadConfigData();
  const targets = loadTargets();
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
  const result = run(["pgrep", "-af", patterns.join("|")]);
  if (result.code !== 0) return [];
  const pids = result.stdout
    .split("\n")
    .map((line) => line.trim().split(/\s+/, 1)[0])
    .filter((value) => /^\d+$/.test(value))
    .map(Number);
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

function cmdMemoryStatus(): number {
  const inventory = loadInventory();
  console.log(`event_log=${expandPath(inventory.memoryEventLog) ?? inventory.memoryEventLog}`);
  console.log(`compiled_notes=${expandPath(inventory.memoryCompiledNotes) ?? inventory.memoryCompiledNotes}`);
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
  status [target]
  targets
  start <target>
  stop <target>
  stop-all
  use <target>
  doctor
  route list
  memory status
  inspect <evi>
`);
}

export function main(argv = process.argv.slice(2)): number {
  const [command, ...args] = argv;
  const commands: Record<string, Command> = {
    ps: () => cmdPs(),
    status: cmdStatus,
    targets: () => cmdTargets(),
    start: cmdStart,
    stop: cmdStop,
    "stop-all": () => cmdStopAll(),
    use: cmdUse,
    doctor: () => cmdDoctor(),
    inspect: cmdInspect,
  };
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return command ? 0 : 1;
  }
  if (command === "route" && args[0] === "list") return cmdRouteList();
  if (command === "memory" && args[0] === "status") return cmdMemoryStatus();
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
