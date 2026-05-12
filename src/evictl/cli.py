from __future__ import annotations

import argparse
import json
import os
import plistlib
import re
import subprocess
import sys
from dataclasses import dataclass, field, replace
from pathlib import Path


@dataclass(frozen=True)
class Target:
    name: str
    label: str | None = None
    plist: str | None = None
    tmux_sessions: tuple[str, ...] = ()
    process_patterns: tuple[str, ...] = ()
    health_patterns: tuple[str, ...] = ()


@dataclass(frozen=True)
class TargetStatus:
    name: str
    loaded: bool
    running: bool
    healthy: bool
    pids: tuple[int, ...] = ()
    tmux_sessions: tuple[str, ...] = ()
    notes: tuple[str, ...] = ()


@dataclass(frozen=True)
class Evi:
    evi_id: str
    runtime: str
    profile: str = "default"
    agent_id: str = ""
    session_id: str = ""
    workspace: str = ""
    state_dir: str = ""


@dataclass(frozen=True)
class Route:
    key: str
    channel: str
    target_evi: str
    account_id: str = ""
    peer_id: str = ""
    mode: str = "primary"


@dataclass(frozen=True)
class Inventory:
    targets: dict[str, Target]
    evis: dict[str, Evi]
    routes: dict[str, Route]
    memory_event_log: str
    memory_compiled_notes: str


DEFAULT_TARGETS: dict[str, Target] = {
    "openclaw": Target(
        name="openclaw",
        label="ai.openclaw.gateway",
        plist="~/Library/LaunchAgents/ai.openclaw.gateway.plist",
        process_patterns=("openclaw", "ai.openclaw.gateway", "com.clawdbot.gateway"),
    ),
    "hermes": Target(
        name="hermes",
        label="ai.hermes.gateway-nukoevi",
        plist="~/Library/LaunchAgents/ai.hermes.gateway-nukoevi.plist",
        tmux_sessions=("hermes-line-tunnel",),
        process_patterns=("hermes_cli.main", "ai.hermes.gateway", "cloudflared.*\\.hermes"),
    ),
    "ccc": Target(
        name="ccc",
        label="com.local.claude-telegram-channel",
        plist="~/Library/LaunchAgents/com.local.claude-telegram-channel.plist",
        tmux_sessions=("claude-telegram-channel",),
        process_patterns=("claude.*plugin:telegram", "nukoevi-telegram", "claude-telegram-channel"),
        health_patterns=("Listening for channel messages from:",),
    ),
}


ALIASES = {
    "claude": "ccc",
    "claude-code-channels": "ccc",
    "channels": "ccc",
    "hermes-agent": "hermes",
    "open-claw": "openclaw",
}


def run(args: list[str], check: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, check=check, text=True, capture_output=True)


def user_domain() -> str:
    return f"gui/{os.getuid()}"


def expand(path: str | None) -> str | None:
    if not path:
        return None
    return str(Path(path).expanduser())


def config_path() -> Path:
    base = os.environ.get("XDG_CONFIG_HOME")
    if base:
        return Path(base).expanduser() / "evictl" / "config.json"
    return Path.home() / ".config" / "evictl" / "config.json"


def load_targets() -> dict[str, Target]:
    targets = dict(DEFAULT_TARGETS)
    data = load_config_data()
    if not data:
        return targets
    for name, raw in data.get("targets", {}).items():
        base = targets.get(name, Target(name=name))
        targets[name] = replace(
            base,
            label=raw.get("label", base.label),
            plist=raw.get("plist", base.plist),
            tmux_sessions=tuple(raw.get("tmux_sessions", base.tmux_sessions)),
            process_patterns=tuple(raw.get("process_patterns", base.process_patterns)),
            health_patterns=tuple(raw.get("health_patterns", base.health_patterns)),
        )
    return targets


def load_config_data() -> dict:
    path = config_path()
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def load_inventory() -> Inventory:
    data = load_config_data()
    targets = load_targets()
    evis: dict[str, Evi] = {}
    for name in sorted(targets):
        evis[f"evi-{name}"] = Evi(evi_id=f"evi-{name}", runtime=name)
    for evi_id, raw in data.get("evis", {}).items():
        runtime = raw.get("runtime")
        if not runtime:
            raise SystemExit(f"evi missing runtime: {evi_id}")
        evis[evi_id] = Evi(
            evi_id=evi_id,
            runtime=runtime,
            profile=raw.get("profile", "default"),
            agent_id=raw.get("agent_id", ""),
            session_id=raw.get("session_id", ""),
            workspace=raw.get("workspace", ""),
            state_dir=raw.get("state_dir", ""),
        )
    routes: dict[str, Route] = {}
    for key, raw in data.get("routes", {}).items():
        channel = raw.get("channel")
        target_evi = raw.get("target_evi")
        if not channel or not target_evi:
            raise SystemExit(f"route missing channel or target_evi: {key}")
        routes[key] = Route(
            key=key,
            channel=channel,
            target_evi=target_evi,
            account_id=raw.get("account_id", ""),
            peer_id=raw.get("peer_id", ""),
            mode=raw.get("mode", "primary"),
        )
    memory = data.get("memory", {})
    return Inventory(
        targets=targets,
        evis=evis,
        routes=routes,
        memory_event_log=memory.get("event_log", "~/.local/share/evictl/events.jsonl"),
        memory_compiled_notes=memory.get("compiled_notes", "~/.local/share/evictl/memory"),
    )


def resolve(name: str, targets: dict[str, Target]) -> str:
    key = ALIASES.get(name, name)
    if key not in targets:
        known = ", ".join(sorted(targets))
        raise SystemExit(f"unknown target: {name} (known: {known})")
    return key


def launchd_loaded(label: str | None) -> bool:
    if not label:
        return False
    result = run(["launchctl", "print", f"{user_domain()}/{label}"])
    return result.returncode == 0


def launchd_state(label: str | None) -> str | None:
    if not label:
        return None
    result = run(["launchctl", "print", f"{user_domain()}/{label}"])
    if result.returncode != 0:
        return None
    match = re.search(r"state = ([^\n]+)", result.stdout)
    return match.group(1).strip() if match else None


def plist_label(path: str) -> str | None:
    try:
        with open(path, "rb") as fh:
            data = plistlib.load(fh)
    except OSError:
        return None
    return data.get("Label")


def pids_for(patterns: tuple[str, ...]) -> tuple[int, ...]:
    if not patterns:
        return ()
    joined = "|".join(patterns)
    result = run(["pgrep", "-af", joined])
    if result.returncode != 0:
        return ()
    pids: list[int] = []
    for line in result.stdout.splitlines():
        first = line.split(maxsplit=1)[0]
        if first.isdigit():
            pids.append(int(first))
    return tuple(sorted(set(pids)))


def tmux_exists(session: str) -> bool:
    result = run(["tmux", "has-session", "-t", session])
    return result.returncode == 0


def tmux_capture(session: str) -> str:
    result = run(["tmux", "capture-pane", "-pt", session, "-S", "-80"])
    return result.stdout if result.returncode == 0 else ""


def status_for(target: Target) -> TargetStatus:
    loaded = launchd_loaded(target.label)
    state = launchd_state(target.label)
    sessions = tuple(session for session in target.tmux_sessions if tmux_exists(session))
    pids = pids_for(target.process_patterns)
    notes: list[str] = []
    if target.plist and not Path(expand(target.plist) or "").exists():
        notes.append("plist-missing")
    if state:
        notes.append(f"launchd:{state}")
    healthy = bool(pids or sessions or state == "running")
    for session in sessions:
        pane = tmux_capture(session)
        for pattern in target.health_patterns:
            if pattern in pane:
                notes.append(f"health:{pattern}")
                healthy = True
    return TargetStatus(
        name=target.name,
        loaded=loaded,
        running=bool(pids or sessions or state == "running"),
        healthy=healthy,
        pids=pids,
        tmux_sessions=sessions,
        notes=tuple(notes),
    )


def bootstrap(target: Target) -> None:
    plist = expand(target.plist)
    if not plist or not Path(plist).exists():
        print(f"{target.name}: plist missing: {plist or '-'}", file=sys.stderr)
        return
    if target.label and not launchd_loaded(target.label):
        result = run(["launchctl", "bootstrap", user_domain(), plist])
        if result.returncode != 0 and "already bootstrapped" not in result.stderr:
            print(result.stderr.strip(), file=sys.stderr)
    if target.label:
        run(["launchctl", "enable", f"{user_domain()}/{target.label}"])
        run(["launchctl", "kickstart", f"{user_domain()}/{target.label}"])


def stop_target(target: Target) -> None:
    for session in target.tmux_sessions:
        if tmux_exists(session):
            run(["tmux", "kill-session", "-t", session])
    plist = expand(target.plist)
    if target.label and plist and Path(plist).exists() and launchd_loaded(target.label):
        result = run(["launchctl", "bootout", user_domain(), plist])
        if result.returncode != 0 and "Could not find service" not in result.stderr:
            print(result.stderr.strip(), file=sys.stderr)


def print_status(statuses: list[TargetStatus]) -> None:
    width = max(len(status.name) for status in statuses)
    for item in statuses:
        state = "running" if item.running else "stopped"
        health = "healthy" if item.healthy else "unknown"
        pids = ",".join(str(pid) for pid in item.pids) or "-"
        sessions = ",".join(item.tmux_sessions) or "-"
        notes = ",".join(item.notes) or "-"
        print(f"{item.name:<{width}}  {state:<7}  {health:<7}  pids={pids}  tmux={sessions}  notes={notes}")


def route_owner_key(route: Route) -> tuple[str, str, str]:
    return (route.channel, route.account_id or "-", route.peer_id or "-")


def duplicate_primary_routes(routes: dict[str, Route]) -> dict[tuple[str, str, str], list[Route]]:
    owners: dict[tuple[str, str, str], list[Route]] = {}
    for route in routes.values():
        if route.mode != "primary":
            continue
        owners.setdefault(route_owner_key(route), []).append(route)
    return {key: value for key, value in owners.items() if len(value) > 1}


def cmd_ps(args: argparse.Namespace, inventory: Inventory) -> int:
    statuses = {status.name: status for status in [status_for(target) for target in inventory.targets.values()]}
    width = max(len(evi.evi_id) for evi in inventory.evis.values())
    for evi in sorted(inventory.evis.values(), key=lambda item: item.evi_id):
        status = statuses.get(evi.runtime)
        state = "unknown"
        health = "unknown"
        if status:
            state = "running" if status.running else "stopped"
            health = "healthy" if status.healthy else "unknown"
        routes = sum(1 for route in inventory.routes.values() if route.target_evi == evi.evi_id)
        print(
            f"{evi.evi_id:<{width}}  runtime={evi.runtime:<20}  profile={evi.profile:<10}  "
            f"state={state:<7}  health={health:<7}  routes={routes}"
        )
    return 0


def cmd_route_list(args: argparse.Namespace, inventory: Inventory) -> int:
    if not inventory.routes:
        print("no routes configured")
        return 0
    width = max(len(route.key) for route in inventory.routes.values())
    for route in sorted(inventory.routes.values(), key=lambda item: item.key):
        account = route.account_id or "-"
        peer = route.peer_id or "-"
        print(
            f"{route.key:<{width}}  channel={route.channel}  account={account}  "
            f"peer={peer}  target={route.target_evi}  mode={route.mode}"
        )
    return 0


def cmd_memory_status(args: argparse.Namespace, inventory: Inventory) -> int:
    print(f"event_log={expand(inventory.memory_event_log) or inventory.memory_event_log}")
    print(f"compiled_notes={expand(inventory.memory_compiled_notes) or inventory.memory_compiled_notes}")
    return 0


def cmd_inspect(args: argparse.Namespace, inventory: Inventory) -> int:
    if args.evi not in inventory.evis:
        known = ", ".join(sorted(inventory.evis))
        raise SystemExit(f"unknown evi: {args.evi} (known: {known})")
    evi = inventory.evis[args.evi]
    print(f"evi_id={evi.evi_id}")
    print(f"runtime={evi.runtime}")
    print(f"profile={evi.profile}")
    print(f"agent_id={evi.agent_id or '-'}")
    print(f"session_id={evi.session_id or '-'}")
    print(f"workspace={expand(evi.workspace) or evi.workspace or '-'}")
    print(f"state_dir={expand(evi.state_dir) or evi.state_dir or '-'}")
    owned_routes = [route for route in inventory.routes.values() if route.target_evi == evi.evi_id]
    print(f"routes={len(owned_routes)}")
    for route in sorted(owned_routes, key=lambda item: item.key):
        print(f"- {route.key}: {route.channel}/{route.account_id or '-'}/{route.peer_id or '-'} ({route.mode})")
    return 0


def cmd_status(args: argparse.Namespace, targets: dict[str, Target]) -> int:
    selected = [targets[resolve(args.target, targets)]] if args.target else list(targets.values())
    print_status([status_for(target) for target in selected])
    return 0


def cmd_targets(args: argparse.Namespace, targets: dict[str, Target]) -> int:
    for name in sorted(targets):
        target = targets[name]
        print(f"{name}\tlabel={target.label or '-'}\tplist={expand(target.plist) or '-'}")
    return 0


def cmd_start(args: argparse.Namespace, targets: dict[str, Target]) -> int:
    target = targets[resolve(args.target, targets)]
    bootstrap(target)
    print_status([status_for(target)])
    return 0


def cmd_stop(args: argparse.Namespace, targets: dict[str, Target]) -> int:
    target = targets[resolve(args.target, targets)]
    stop_target(target)
    print_status([status_for(target)])
    return 0


def cmd_stop_all(args: argparse.Namespace, targets: dict[str, Target]) -> int:
    for target in targets.values():
        stop_target(target)
    print_status([status_for(target) for target in targets.values()])
    return 0


def cmd_use(args: argparse.Namespace, targets: dict[str, Target]) -> int:
    key = resolve(args.target, targets)
    for name, target in targets.items():
        if name != key:
            stop_target(target)
    bootstrap(targets[key])
    print_status([status_for(target) for target in targets.values()])
    return 0


def cmd_doctor(args: argparse.Namespace, targets: dict[str, Target]) -> int:
    statuses = [status_for(target) for target in targets.values()]
    print_status(statuses)
    running = [item.name for item in statuses if item.running]
    inventory = load_inventory()
    conflicts = duplicate_primary_routes(inventory.routes)
    if conflicts:
        for owner, routes in conflicts.items():
            names = ", ".join(route.key for route in routes)
            print(f"conflict: duplicate primary route {owner}: {names}", file=sys.stderr)
        return 2
    if not running:
        print("warning: no target running", file=sys.stderr)
        return 1
    print(f"running: {', '.join(running)}")
    return 0


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="evictl")
    sub = root.add_subparsers(dest="command", required=True)
    ps = sub.add_parser("ps")
    ps.set_defaults(func=cmd_ps, inventory=True)
    status = sub.add_parser("status")
    status.add_argument("target", nargs="?")
    status.set_defaults(func=cmd_status)
    targets = sub.add_parser("targets")
    targets.set_defaults(func=cmd_targets)
    start = sub.add_parser("start")
    start.add_argument("target")
    start.set_defaults(func=cmd_start)
    stop = sub.add_parser("stop")
    stop.add_argument("target")
    stop.set_defaults(func=cmd_stop)
    stop_all = sub.add_parser("stop-all")
    stop_all.set_defaults(func=cmd_stop_all)
    use = sub.add_parser("use")
    use.add_argument("target")
    use.set_defaults(func=cmd_use)
    doctor = sub.add_parser("doctor")
    doctor.set_defaults(func=cmd_doctor)
    route = sub.add_parser("route")
    route_sub = route.add_subparsers(dest="route_command", required=True)
    route_list = route_sub.add_parser("list")
    route_list.set_defaults(func=cmd_route_list, inventory=True)
    memory = sub.add_parser("memory")
    memory_sub = memory.add_subparsers(dest="memory_command", required=True)
    memory_status = memory_sub.add_parser("status")
    memory_status.set_defaults(func=cmd_memory_status, inventory=True)
    inspect = sub.add_parser("inspect")
    inspect.add_argument("evi")
    inspect.set_defaults(func=cmd_inspect, inventory=True)
    return root


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    if getattr(args, "inventory", False):
        return args.func(args, load_inventory())
    targets = load_targets()
    return args.func(args, targets)


if __name__ == "__main__":
    raise SystemExit(main())
