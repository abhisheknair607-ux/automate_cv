"""Read-only, deterministic deduplication of vacancies in Taaza Videsi Maal.

Stage 1 design contract:
- Pure Python standard library; no Gmail, Sheets, GitHub or paid AI calls.
- NEVER writes, merges, hides or deletes a spreadsheet row.
- Different rows in MASTER 'Jobs' are compared; a mirrored row in a regional
  source tab is NOT evidence that the master has a redundant row.
- Equal verified job IDs / canonical URLs are exact. Similar descriptions,
  titles, locations and employer names are only *possible* duplicates.
- Manual 'Not Dup' decisions are kept out of this module; a later stage will
  persist overrides and apply them before status changes.

Usage:
  from automate_cv.job_dedupe import Job, analyze, matches_for
  report = analyze([Job("Jobs", 2, "Example", "Finance Analyst",
                        "Dublin, Ireland", "https://example.com/123")])
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from difflib import SequenceMatcher
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit

TRACKING_KEYS = {
    "fbclid", "gclid", "msclkid", "igshid", "source", "ref_src",
    "trk", "tracking", "trackingid", "refid", "utm_source",
    "utm_medium", "utm_campaign", "utm_content", "utm_term",
    "from", "fromage", "vjs", "advn", "attributionid",
}
JOB_LINKEDIN = re.compile(r"^/(?:comm/)?jobs/view/([0-9]{7,15})/?$", re.I)
INDEED_ID = re.compile(r"^[a-f0-9]{16}$", re.I)
COMPANY_SUFFIXES = {"ltd", "limited", "plc", "inc", "llc", "co"}
ALIASES = {
    "ernst and young": "ey",
    "ernst young": "ey",
    "ey": "ey",
    "jpmorgan chase": "jpmorganchase",
    "jp morgan chase": "jpmorganchase",
    "jpmorganchase": "jpmorganchase",
    "cpl recruitment": "cpl",
    "cpl": "cpl",
}
ROLE_MAP = {"sr": "senior", "jr": "junior", "mgr": "manager", "assoc": "associate"}
LOCATION_COUNTRY_ONLY = {
    "ireland", "united kingdom", "uk", "england", "scotland", "wales",
    "northern ireland", "remote", "hybrid", "onsite", "on site",
}
CITIES = {
    "dublin", "cork", "galway", "limerick", "waterford", "kilkenny",
    "ashbourne", "maynooth", "navan", "naas", "athlone", "sligo",
    "london", "manchester", "birmingham", "bristol", "leeds",
    "belfast", "glasgow", "edinburgh", "liverpool", "cardiff",
    "oxford", "cambridge", "reading", "brighton", "newcastle",
    "sheffield", "nottingham", "derry", "drogheda", "dundalk",
    "wexford", "wicklow", "bray", "newbridge",
}


@dataclass(frozen=True)
class Job:
    sheet: str
    row: int
    company: str
    title: str
    location: str
    url: str
    # Data with application/CV history cannot be presumed safe to discard.
    has_jd: bool = False
    protected: bool = False

    @property
    def row_ref(self) -> str:
        return f"{self.sheet}!{self.row}"


@dataclass(frozen=True)
class Match:
    left: str
    right: str
    kind: str                 # EXACT_ID | EXACT_URL | POSSIBLE
    score: int                # deterministic heuristic, NOT probability
    reason: str
    auto_delete: bool = False # ALWAYS false in Stage 1


@dataclass
class Audit:
    records: int
    exact_pairs: list[Match] = field(default_factory=list)
    possible_pairs: list[Match] = field(default_factory=list)
    groups: list[list[str]] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def simplify(value: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", str(value or ""))
    ascii_text = "".join(c for c in ascii_text if not unicodedata.combining(c))
    ascii_text = ascii_text.casefold().replace("&", " and ")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", ascii_text)).strip()


def company_key(value: str) -> str:
    words = simplify(value).split()
    while words and words[-1] in COMPANY_SUFFIXES:
        words.pop()
    return ALIASES.get(" ".join(words), " ".join(words))


def title_key(value: str) -> str:
    words = [ROLE_MAP.get(w, w) for w in simplify(value).split()]
    # Normalize only harmless abbreviations; preserve level, team and speciality.
    return " ".join(words)


def level(value: str) -> str:
    """Different management grades must not be fuzzy-merged.

    Words like 'Finance' can appear between 'Senior' and 'Manager',
    so checking for the literal phrase 'senior manager' is not sufficient.
    """
    words = set(title_key(value).split())
    if "partner" in words:
        return "partner"
    if "director" in words:
        return "senior director" if "senior" in words else "director"
    if "manager" in words:
        if "assistant" in words:
            return "assistant manager"
        if "senior" in words:
            return "senior manager"
        return "manager"
    if "intern" in words:
        return "intern"
    if "graduate" in words:
        return "graduate"
    if "senior" in words:
        return "senior"
    return ""


def location_key(value: str) -> str:
    value = simplify(value)
    if not value:
        return ""
    # Same city can appear as "Dublin, Ireland" or "Dublin, County Dublin";
    # never infer an exact location from a country-only, remote or hybrid tag.
    words = value.split()
    city = next((x for x in CITIES if re.search(r"\b" + re.escape(x) + r"\b", value)), "")
    if city:
        return city
    first = " ".join(words[:2])
    if value in LOCATION_COUNTRY_ONLY or first in LOCATION_COUNTRY_ONLY:
        return ""
    # Unknown cities are intentionally not fuzzy-matched; manual review first.
    return ""


def identity(url: str) -> tuple[str, str]:
    """Return ('id', verified provider key) or ('url', normalized URL).

    A missing or malformed URL returns ('', ''). Do not equate lookalike
    domains or collapse distinct job IDs merely because their titles match.
    """
    try:
        url = str(url or "").strip()
        p = urlsplit(url)
        if p.scheme.lower() not in {"http", "https"} or not p.hostname:
            return "", ""
        host = p.hostname.lower().removeprefix("www.")
        path = re.sub(r"/+$", "", p.path) or "/"
        query = dict(parse_qsl(p.query, keep_blank_values=True))
        if host == "linkedin.com":
            m = JOB_LINKEDIN.fullmatch(path)
            if m:
                return "id", "linkedin:" + m.group(1)
        if host == "indeed.com" or host.endswith(".indeed.com"):
            jk = next((v for k, v in query.items() if k.lower() == "jk"), "")
            if path in {"/viewjob", "/m/viewjob", "/rc/clk/dl"} and INDEED_ID.fullmatch(jk):
                return "id", "indeed:" + jk.casefold()
        # Unknown-site URLs are compared only against the same actual URL.
        filtered = sorted((k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
                          if k.lower() not in TRACKING_KEYS
                          and not k.lower().startswith("utm_"))
        normalized = "https://" + host + path
        if filtered:
            normalized += "?" + urlencode(filtered)
        return "url", normalized
    except (ValueError, TypeError):
        return "", ""


def title_similarity(a: str, b: str) -> float:
    a, b = title_key(a), title_key(b)
    if not a or not b:
        return 0.0
    order = SequenceMatcher(None, a, b, autojunk=False).ratio()
    tokens_a, tokens_b = set(a.split()), set(b.split())
    overlap = len(tokens_a & tokens_b) / len(tokens_a | tokens_b)
    return (order * 0.65) + (overlap * 0.35)


def compare(a: Job, b: Job) -> Match | None:
    if a.row_ref == b.row_ref:
        return None
    kind_a, id_a = identity(a.url)
    kind_b, id_b = identity(b.url)
    pair = (a.row_ref, b.row_ref)
    if id_a and id_b and kind_a == kind_b and id_a == id_b:
        label = "EXACT_ID" if kind_a == "id" else "EXACT_URL"
        inconsistent = (company_key(a.company) != company_key(b.company)
                        or bool(a.title and b.title and title_similarity(a.title, b.title) < .50))
        suffix = " (metadata conflict: review before any cleanup)" if inconsistent else ""
        return Match(*pair, label, 100, "Same validated job identity" + suffix)
    # Different verified requisitions are not safe to call exact; they can
    # still be a possible match, e.g. a cross-posted or renewed vacancy.
    comp_a, comp_b = company_key(a.company), company_key(b.company)
    loc_a, loc_b = location_key(a.location), location_key(b.location)
    if not comp_a or comp_a != comp_b or not loc_a or loc_a != loc_b:
        return None
    la, lb = level(a.title), level(b.title)
    if la and lb and la != lb:
        return None
    similarity = title_similarity(a.title, b.title)
    if similarity < .78:
        return None
    score = round(100 * similarity)
    return Match(*pair, "POSSIBLE", score,
                 f"Same normalized employer and city; title similarity {score}/100")


def analyze(jobs: list[Job]) -> Audit:
    """Read-only audit; pass MASTER Jobs rows only to avoid source-tab mirrors."""
    if len({j.row_ref for j in jobs}) != len(jobs):
        raise ValueError("Duplicate input row references: check source data")
    if any(not isinstance(j.row, int) or j.row < 2 or not j.sheet for j in jobs):
        raise ValueError("Each record needs a valid sheet and row >= 2")
    audit = Audit(records=len(jobs))
    identity_index: dict[tuple[str, str], list[int]] = defaultdict(list)
    company_city_index: dict[tuple[str, str], list[int]] = defaultdict(list)
    pair_keys: set[tuple[int, int]] = set()

    def add(a_idx: int, b_idx: int):
        pair_key = (min(a_idx, b_idx), max(a_idx, b_idx))
        if pair_key in pair_keys:
            return
        pair_keys.add(pair_key)
        match = compare(jobs[pair_key[0]], jobs[pair_key[1]])
        if match:
            (audit.possible_pairs if match.kind == "POSSIBLE" else audit.exact_pairs).append(match)

    for i, job in enumerate(jobs):
        key = identity(job.url)
        if key[1]:
            for earlier in identity_index[key]:
                add(earlier, i)
            identity_index[key].append(i)
        region = (company_key(job.company), location_key(job.location))
        if region[0] and region[1]:
            # For a moderate personal jobs workbook this avoids global O(n²).
            # No separate pair scanning across unrelated employers and cities.
            for earlier in company_city_index[region]:
                add(earlier, i)
            company_city_index[region].append(i)

    # Groups aid review UI only. A chain of possible matches does not mean
    # every member is certainly the same vacancy.
    parent = {j.row_ref: j.row_ref for j in jobs}

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for match in audit.exact_pairs + audit.possible_pairs:
        left, right = find(match.left), find(match.right)
        if left != right:
            parent[max(left, right)] = min(left, right)
    groups: dict[str, list[str]] = defaultdict(list)
    for job in jobs:
        groups[find(job.row_ref)].append(job.row_ref)
    audit.groups = sorted((sorted(refs) for refs in groups.values() if len(refs) > 1),
                          key=lambda g: (g[0], len(g)))
    audit.exact_pairs.sort(key=lambda m: (m.left, m.right))
    audit.possible_pairs.sort(key=lambda m: (-m.score, m.left, m.right))
    return audit


def matches_for(new_job: Job, existing: list[Job]) -> list[Match]:
    """Dry-run recommendation for an incoming job; never insert or discard it."""
    return [m for prior in existing if (m := compare(prior, new_job)) is not None]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only Taaza vacancy duplicate audit")
    parser.add_argument("--input", type=Path, required=True,
                        help="Local JSON array of Jobs records; NO Sheets connection")
    parser.add_argument("--output", type=Path,
                        help="Optional local JSON report path, otherwise stdout")
    args = parser.parse_args(argv)
    data = json.loads(args.input.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        parser.error("Expected a JSON array of job records")
    rows = [Job(**row) for row in data]
    report = json.dumps(analyze(rows).to_dict(), indent=2, ensure_ascii=False)
    if args.output:
        args.output.write_text(report + "\n", encoding="utf-8")
    else:
        print(report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
