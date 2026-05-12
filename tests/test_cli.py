import tempfile
import unittest
from pathlib import Path
from unittest import mock

from evictl.cli import (
    ALIASES,
    DEFAULT_TARGETS,
    Route,
    duplicate_primary_routes,
    load_inventory,
    resolve,
)


class ResolveTest(unittest.TestCase):
    def test_resolves_alias(self):
        self.assertEqual(resolve("claude-code-channels", DEFAULT_TARGETS), "ccc")

    def test_resolves_direct_target(self):
        self.assertEqual(resolve("hermes", DEFAULT_TARGETS), "hermes")

    def test_rejects_unknown_target(self):
        with self.assertRaises(SystemExit):
            resolve("missing", DEFAULT_TARGETS)


class DefaultsTest(unittest.TestCase):
    def test_supported_targets(self):
        self.assertEqual(set(DEFAULT_TARGETS), {"openclaw", "hermes", "ccc"})

    def test_aliases_do_not_shadow_targets(self):
        self.assertTrue(set(ALIASES.values()).issubset(DEFAULT_TARGETS))


class InventoryTest(unittest.TestCase):
    def test_default_evi_inventory_matches_targets(self):
        inventory = load_inventory()
        self.assertEqual(set(inventory.evis), {"evi-openclaw", "evi-hermes", "evi-ccc"})

    def test_loads_configured_routes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / "evictl"
            config.mkdir()
            (config / "config.json").write_text(
                '{"routes":{"telegram:main":{"channel":"telegram","account_id":"main","target_evi":"evi-openclaw"}}}'
            )
            with mock.patch.dict("os.environ", {"XDG_CONFIG_HOME": str(root)}):
                inventory = load_inventory()
        self.assertEqual(inventory.routes["telegram:main"].target_evi, "evi-openclaw")


class RouteTest(unittest.TestCase):
    def test_duplicate_primary_routes_detect_same_surface(self):
        routes = {
            "a": Route(key="a", channel="telegram", account_id="main", peer_id="1", target_evi="evi-a"),
            "b": Route(key="b", channel="telegram", account_id="main", peer_id="1", target_evi="evi-b"),
            "c": Route(
                key="c",
                channel="telegram",
                account_id="main",
                peer_id="1",
                target_evi="evi-c",
                mode="mirror",
            ),
        }
        conflicts = duplicate_primary_routes(routes)
        self.assertEqual(list(conflicts), [("telegram", "main", "1")])


if __name__ == "__main__":
    unittest.main()
