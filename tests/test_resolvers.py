"""Pure normalization tests, with no simulated consensus advertised as chain evidence."""
import importlib.util
import json
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest

sdk = ModuleType("genlayer")
sdk.Address, sdk.TreeMap, sdk.u256 = str, dict, int
sdk.gl = SimpleNamespace(Contract=object, public=SimpleNamespace(write=lambda f: f, view=lambda f: f))
sys.modules["genlayer"] = sdk
spec = importlib.util.spec_from_file_location("zone_switch", Path(__file__).resolve().parents[1] / "contracts/zone_switch.py")
contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contract)


class ResolverTests(unittest.TestCase):
    def setUp(self):
        self.name = "cloudflare.com"
        self.response = {
            "Status": 0, "AD": True, "CD": False,
            "Question": [{"name": self.name + ".", "type": 1}],
            "Answer": [{"name": self.name + ".", "type": 1, "data": "104.16.132.229"}],
        }

    def test_authenticated_and_unauthenticated(self):
        self.assertEqual(contract.classify(self.response, self.name), "AUTHENTICATED")
        self.response["AD"] = False
        self.assertEqual(contract.classify(self.response, self.name), "UNAUTHENTICATED")

    def test_missing_answer_wrong_owner_and_truncation(self):
        for response in ({**self.response, "Answer": []},
                         {**self.response, "Answer": [{"name": "example.org.", "type": 1}]}):
            self.assertEqual(contract.classify(response, self.name), "NO_DIRECT_A")
        self.assertEqual(contract.classify({**self.response, "TC": True}, self.name), "UNAVAILABLE")

    def test_resolvers_disagree_and_source_failure(self):
        original = sdk.gl.__dict__.get("nondet")
        def request(url, **kwargs):
            if url.startswith("https://cloudflare-dns.com/"):
                raise TimeoutError()
            return SimpleNamespace(body=json.dumps(self.response).encode())
        sdk.gl.nondet = SimpleNamespace(web=SimpleNamespace(request=request))
        try:
            self.assertEqual(json.loads(contract.observe(self.name)),
                             {"google": "AUTHENTICATED", "cloudflare": "UNAVAILABLE"})
        finally:
            if original is None:
                del sdk.gl.nondet
            else:
                sdk.gl.nondet = original


if __name__ == "__main__":
    unittest.main()
