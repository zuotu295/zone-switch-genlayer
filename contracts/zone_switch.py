# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
import re
from genlayer import Address, TreeMap, gl, u256

DOMAIN = re.compile(r"(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}")
RESOLVERS = (
    ("google", "https://dns.google/resolve?name="),
    ("cloudflare", "https://cloudflare-dns.com/dns-query?name="),
)


def classify(data, hostname):
    question = data.get("Question")
    if not isinstance(question, list) or len(question) != 1:
        return "UNAVAILABLE"
    if question[0]["name"].rstrip(".").lower() != hostname or question[0]["type"] != 1:
        return "UNAVAILABLE"
    status = data.get("Status")
    if status == 2:
        return "SERVFAIL"
    if status == 3:
        return "NOT_FOUND"
    if status != 0 or data.get("CD") is True or data.get("TC") is True:
        return "UNAVAILABLE"
    has_address = any(row.get("type") == 1 and row.get("name", "").rstrip(".").lower() == hostname
                      for row in data.get("Answer", []))
    if not has_address:
        return "NO_DIRECT_A"
    return "AUTHENTICATED" if data.get("AD") is True else "UNAUTHENTICATED"


def observe(hostname):
    verdicts = {}
    for name, endpoint in RESOLVERS:
        try:
            # Cloudflare requires JSON content negotiation for its DNS-over-HTTPS endpoint.
            response = gl.nondet.web.request(endpoint + hostname + "&type=A", method="GET",
                                             headers={"Accept": "application/dns-json"})
            verdicts[name] = classify(json.loads(response.body.decode("utf-8")), hostname)
        except Exception:
            verdicts[name] = "UNAVAILABLE"
    return json.dumps(verdicts, sort_keys=True, separators=(",", ":"))


class ZoneSwitch(gl.Contract):
    owner: Address
    title: str
    hostname: str
    revision: u256
    count: u256
    attempts: TreeMap[u256, str]

    def __init__(self, title: str):
        title = title.strip()
        if not 3 <= len(title) <= 64:
            raise gl.vm.UserError("Use a title of 3–64 characters")
        self.owner = gl.message.sender_address
        self.title = title
        self.hostname = ""
        self.revision = u256(0)
        self.count = u256(0)

    @gl.public.write
    def switch(self, candidate: str, expected_revision: u256) -> str:
        if self.owner != gl.message.sender_address:
            raise gl.vm.UserError("Only the route maintainer may switch")
        if expected_revision != self.revision:
            raise gl.vm.UserError("Active revision changed; reload and review")
        if not DOMAIN.fullmatch(candidate) or candidate == self.hostname:
            raise gl.vm.UserError("Enter a different lowercase public hostname")
        # Validators repeat both queries and compare only the routing-relevant verdicts.
        checks = json.loads(gl.eq_principle.strict_eq(lambda: observe(candidate)))
        previous = self.hostname
        switched = all(value == "AUTHENTICATED" for value in checks.values())
        if switched:
            self.hostname = candidate
            self.revision = u256(self.revision + 1)
        self.count = u256(self.count + 1)
        event = json.dumps({
            "id": int(self.count), "actor": str(self.owner), "candidate": candidate,
            "previous": previous, "active": self.hostname, "revision": int(self.revision),
            "decision": "SWITCHED" if switched else "BLOCKED", "checks": checks,
            "utc": gl.message_raw["datetime"],
        }, separators=(",", ":"))
        self.attempts[self.count] = event
        return event

    @gl.public.view
    def route(self) -> str:
        return json.dumps({"title": self.title, "owner": str(self.owner), "hostname": self.hostname,
                           "revision": int(self.revision), "count": int(self.count)}, separators=(",", ":"))

    @gl.public.view
    def history(self, before: u256) -> str:
        end = int(self.count) if before == 0 else min(int(self.count), int(before) - 1)
        return "[" + ",".join(self.attempts[u256(i)] for i in range(end, max(0, end - 12), -1)) + "]"
