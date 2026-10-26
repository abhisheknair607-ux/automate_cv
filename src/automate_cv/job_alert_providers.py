"""Conservative adapters for forwarded job-alert digests.

Only the observed 25 Oct 2026 Indeed plaintext template is enabled for Indeed.
IrishJobs and Jobs.ie are registered but intentionally require a reviewed sample
before automatic extraction. Never infer a job from an email subject alone.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from email.utils import parseaddr
from urllib.parse import parse_qs, urlsplit


@dataclass(frozen=True)
class AlertJob:
    provider: str
    external_id: str
    title: str
    company: str
    location: str
    url: str
    salary: str = ""

    @property
    def key(self) -> str:
        return self.provider.lower() + ":" + self.external_id


# Exact sender for mail templates verified against the connected mailbox.
VERIFIED_SENDERS = {
    "jobalerts-noreply@linkedin.com": "LinkedIn",
    "donotreply@jobalert.indeed.com": "Indeed",
}
# Register future adapters but DO NOT guess an IrishJobs/Jobs.ie HTML template.
# Match these domains only for manual review; they are not permitted to import.
REVIEW_DOMAINS = {"irishjobs.ie": "IrishJobs", "jobs.ie": "Jobs.ie"}

CITIES = (
    "dublin", "cork", "galway", "limerick", "waterford", "kilkenny",
    "athlone", "sligo", "tralee", "drogheda", "dundalk", "navan",
    "naas", "maynooth", "ashbourne", "letterkenny", "ennis", "bray",
    "wexford", "carlow", "tullamore", "portlaoise", "newbridge",
    "london", "manchester", "birmingham", "bristol", "liverpool",
    "leeds", "sheffield", "nottingham", "edinburgh", "glasgow",
    "belfast", "derry", "cardiff", "swansea", "oxford", "cambridge",
    "reading", "southampton", "brighton", "newcastle", "exeter",
    "coventry", "leicester", "aberdeen", "dundee", "york", "woking",
)
COUNTIES = (
    "antrim", "armagh", "carlow", "cavan", "clare", "cork", "derry",
    "donegal", "down", "dublin", "fermanagh", "galway", "kerry",
    "kildare", "kilkenny", "laois", "leitrim", "limerick",
    "longford", "louth", "mayo", "meath", "monaghan", "offaly",
    "roscommon", "sligo", "tipperary", "tyrone", "waterford",
    "westmeath", "wexford", "wicklow",
)
CITY_RE = re.compile(r"\b(?:" + "|".join(re.escape(c) for c in CITIES) + r")\b", re.I)
COUNTY_RE = re.compile(r"\b(?:county|co\.?)\s+(?:" + "|".join(COUNTIES) + r")\b", re.I)
OUTSIDE_GEO_RE = re.compile(
    r"\b(?:India|Mumbai|Bengaluru|Bangalore|Navi Mumbai|New Delhi|Pune|Hyderabad|Chennai|"
    r"Kolkata|Gurugram|Gurgaon|Pakistan|Lahore|Karachi|Canada|Australia|New York|"
    r"San Francisco|Singapore|Dubai|UAE|United States|USA)\b", re.I
)
GEO_COUNTRY = re.compile(r"\b(?:Ireland|Northern Ireland|United Kingdom|UK|England|"
                         r"Scotland|Wales)\b", re.I)
INDEED_LINK = re.compile(r"^https://(?:ie\.)?indeed\.com/(?:rc|pagead)/clk/dl\?", re.I)
JOB_HEADER = re.compile(r"^\s*Indeed Job Alert\b", re.I)
EURO_SALARY = re.compile(r"^€[\d,]+(?:\s*[–-]\s*€?[\d,]+)?\s+(?:a|per)\s+"
                         r"(?:year|hour|month|week|day)\b", re.I)


def provider_for(from_header: str) -> tuple[str | None, bool]:
    """Returns (provider, verified_parser_enabled)."""
    sender = parseaddr(from_header)[1].lower()
    if sender in VERIFIED_SENDERS:
        return VERIFIED_SENDERS[sender], True
    domain = sender.rsplit("@", 1)[-1]
    for root, name in REVIEW_DOMAINS.items():
        if domain == root or domain.endswith("." + root):
            return name, False
    return None, False


def eligible_location(location: str) -> bool:
    """Default geography: Ireland + UK. Unknown/overseas locations fail closed."""
    location = location.strip()
    if not location or OUTSIDE_GEO_RE.search(location):
        return False
    return bool(GEO_COUNTRY.search(location) or CITY_RE.search(location)
                or COUNTY_RE.search(location))


def indeed_job_key(url: str) -> str | None:
    """Return genuine Indeed job key. No tracking-based identifiers or fake URLs."""
    try:
        parts = urlsplit(url.strip())
        if (parts.scheme != "https" or (parts.hostname or "").lower()
                not in {"ie.indeed.com", "indeed.com", "www.indeed.com"}):
            return None
        if parts.path not in {"/rc/clk/dl", "/viewjob", "/m/viewjob"}:
            return None
        values = parse_qs(parts.query)
        key = values.get("jk", [""])[0].lower()
        return key if re.fullmatch(r"[0-9a-f]{16}", key) else None
    except ValueError:
        return None


def parse_indeed(plain: str) -> tuple[list[AlertJob], bool, int]:
    """Extract role, employer, location, salary and jk from real Indeed text/plain.

    Sponsored /pagead/ URLs without job key are excluded (unverifiable canonical
    links); no ad-click URLs or marketing parameters reach the Sheet.
    """
    plain = plain.replace("\r\n", "\n").replace("\r", "\n")
    if not JOB_HEADER.match(plain[:200].lstrip()):
        return [], True, 0
    jobs: dict[str, AlertJob] = {}
    uncertain = False
    excluded_ads = 0
    for block in re.split(r"\n\s*\n", plain):
        lines = [s.strip() for s in block.splitlines() if s.strip()]
        job_urls = [s for s in lines if INDEED_LINK.match(s)]
        if not job_urls:
            continue
        # The observed 25-Oct-2026 template is role, company - location,
        # optional salary, teaser, posting age, and a unique Indeed link.
        if len(job_urls) != 1 or len(lines) < 3:
            uncertain = True
            continue
        url = job_urls[0]
        job_key = indeed_job_key(url)
        if job_key is None:
            if "/pagead/" in url:
                excluded_ads += 1
                continue
            uncertain = True
            continue
        title = lines[0]
        employer_location = lines[1]
        if " - " not in employer_location:
            uncertain = True
            continue
        company, location = employer_location.rsplit(" - ", 1)
        company, location = company.strip(), location.strip()
        if (not title or not company or not location or title == company
                or len(title) > 250 or len(company) > 200 or len(location) > 180
                or title.lower() in {"jobs", "find jobs", "search jobs"}):
            uncertain = True
            continue
        salary = next((s for s in lines[2:-1] if EURO_SALARY.fullmatch(s)), "")
        jobs.setdefault(job_key, AlertJob(
            provider="Indeed", external_id=job_key, title=title,
            company=company, location=location,
            url="https://ie.indeed.com/viewjob?jk=" + job_key,
            salary=salary,
        ))
    return list(jobs.values()), uncertain, excluded_ads
