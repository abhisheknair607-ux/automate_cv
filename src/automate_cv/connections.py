"""Opt-in verified networking research and scoped Google Sheets persistence."""
import json
import re
from datetime import datetime, timezone
from urllib.parse import quote, urlsplit, urlunsplit, urlencode, parse_qsl

import httpx
from googleapiclient.discovery import build
from .google_retry import retry_google

TAB = "Connections"
HEADERS = ["Company","Contact Name","Direct LinkedIn Profile","LinkedIn Search",
           "Applied-for Role","Candidate","Freshmaal Row","Vacancy Link",
           "Person's Position","Verification / Evidence","Outreach Message","Research Date (UTC)"]

def canonical_url(value):
    try:
        p = urlsplit(str(value or "").strip())
        if p.scheme.lower() not in ("https", "http") or not p.hostname:
            return ""
        path = p.path.rstrip("/") or "/"
        ignore = ("utm_", "fbclid", "gclid", "msclkid", "igshid", "ref_src", "source", "trk", "tracking")
        query = urlencode(sorted((k,v) for k,v in parse_qsl(p.query)
                                  if not any(k.lower().startswith(i) for i in ignore)))
        return urlunsplit(("https",p.hostname.lower().removeprefix("www."),path,query,""))
    except ValueError:
        return ""

def matching_rows(rows, app):
    result, seen = [], set()
    for r in rows:
        a = list(r) + [""] * max(0,12-len(r))
        if (str(a[0]).strip().casefold()!=app.company.strip().casefold()
            or str(a[5]).strip().casefold()!=app.candidate_name.strip().casefold()
            or str(a[6]).strip()!=str(app.row_number)
            or canonical_url(a[7])!=canonical_url(app.application_link)):
            continue
        name=str(a[1]).strip().casefold()
        if name and name not in seen:
            seen.add(name)
            result.append(a)
    return result

def linkedin_invitation(candidate, recipient, company, position, team):
    """Warm candidate-specific three-paragraph invitation, strictly below 300 chars.

    Personalisation is restricted to the researched person's verified team/title.
    Abhishek's EY, UCD and ACCA facts come from his professional Summary Doc.
    Another applicant never inherits those credentials.
    """
    first = re.split(r"\s+", str(recipient or "").strip())[0][:32]
    first = re.sub(r"[^\w'-]", "", first, flags=re.UNICODE) or "there"
    def words(value, limit):
        value = re.sub(r"\s+", " ", str(value or "").strip())
        if len(value) <= limit:
            return value
        return value[:limit].rsplit(" ", 1)[0] or value[:limit]

    firm = words(company, 48)
    function = words(team, 54)
    role = words(position, 54)
    person = str(candidate or "").strip()
    intro = (
        "I'm Abhishek Nair, an ACCA member with EY experience and a UCD MSc."
        if person == "Abhishek Nair" else f"I'm {person}."
    )
    observed = (
        f"Your work in {function} at {firm}" if function else
        f"Your role as {role} at {firm}" if role else
        f"Your experience at {firm}"
    )
    ending = "\n\nThank you — I'd be grateful to connect."
    messages = [
        f"Hi {first},\n\n{intro} {observed} caught my attention, "
        f"and I'd value learning from your experience.{ending}",
        f"Hi {first},\n\n{intro} Your experience at {firm} caught my attention. "
        f"I'd value learning from you.{ending}",
        f"Hi {first},\n\n{intro} I'd value connecting and learning from your experience.{ending}",
    ]
    for message in messages:
        if len(message) < 300:
            return message
    raise ValueError("LinkedIn invitation exceeds the 300-character limit")


def parse_contacts(text):
    text=str(text or "").strip()
    text=re.sub(r"^\x60{3}(?:json)?\s*", "", text, flags=re.I)
    text=re.sub(r"\s*\x60{3}\s*$", "", text)
    try:
        obj=json.loads(text)
    except json.JSONDecodeError:
        a,b=text.find("{"),text.rfind("}")
        if a<0 or b<a:
            raise ValueError("No valid networking JSON returned")
        obj=json.loads(text[a:b+1])
    if not isinstance(obj,dict) or not isinstance(obj.get("contacts"),list):
        raise ValueError("Networking response has no contacts list")
    return obj["contacts"]

def confirmed_bios(name, urls, client, company, position, team):
    """Require an HTTP 200 public bio explicitly naming the person."""
    words=name.casefold().split()
    if len(words)<2:
        return []
    found=[]
    for url in urls[:5]:
        if not isinstance(url,str):
            continue
        p=urlsplit(url.strip())
        if (p.scheme!="https" or not p.hostname or p.username
            or p.hostname.lower() in ("localhost","127.0.0.1","0.0.0.0")
            or p.hostname.lower().endswith((".local",".internal"))
            or "linkedin.com" in p.hostname):
            continue
        try:
            res=client.get(url,follow_redirects=True,timeout=10)
            if res.status_code!=200:
                continue
            content=re.sub(r"<[^>]*>", " ",res.text[:600000]).casefold()
            # The page must identify the PERSON and the EMPLOYER and describe
            # either their relevant function or a key title word. Failing these
            # checks results in no saved row, not an invented verification.
            firm = company.casefold().split()[0]
            technical = [x.casefold() for x in re.findall(r"[A-Za-z]{4,}", team+" "+position)
                         if x.casefold() not in ("head","director","manager","senior","partner","associate")]
            if (words[0] in content and words[-1] in content and firm in content
                and (not technical or any(word in content for word in technical))):
                found.append(url.strip())
        except (httpx.HTTPError, ValueError):
            continue
    return found

class Connections:
    def __init__(self,credentials,settings):
        self.settings=settings
        self.sheets=build("sheets","v4",credentials=credentials,cache_discovery=False).spreadsheets()

    def _ensure(self):
        ident=self.settings.freshmal_spreadsheet_id
        meta=retry_google(lambda:self.sheets.get(spreadsheetId=ident,fields="sheets(properties(title))").execute())
        if not any(s.get("properties",{}).get("title")==TAB for s in meta.get("sheets",[])):
            retry_google(lambda:self.sheets.batchUpdate(spreadsheetId=ident,body={"requests":[{"addSheet":{"properties":{
                "title":TAB,"gridProperties":{"columnCount":12,"frozenRowCount":1}
            }}}]}).execute())
            retry_google(lambda:self.sheets.values().update(spreadsheetId=ident,
                range="'Connections'!A1:L1",valueInputOption="RAW",body={"values":[HEADERS]}).execute())
        headers=retry_google(lambda:self.sheets.values().get(spreadsheetId=ident,
            range="'Connections'!A1:L1").execute()).get("values",[[]])[0]
        if headers!=HEADERS:
            raise RuntimeError("Connections A:L headers conflict; refusing to write")

    def _rows(self):
        return retry_google(lambda:self.sheets.values().get(
            spreadsheetId=self.settings.freshmal_spreadsheet_id,
            range="'Connections'!A2:L").execute()).get("values",[])

    def research(self,ai,app,summary,focused=False):
        instruction=(
            "Use web_search to verify 5-10 REAL people near the hiring team at the exact "
            "company/office. Seek managers, senior managers, directors, partners and recruiters "
            "for the actual vacancy function, excluding irrelevant executives. Return JSON only: "
            '{"contacts":[{"name":"","position":"","team":"","location":"",'
            '"confidence":"High","evidence_urls":["https://..."],"message":""}]}. '
            "Do not invent people, team, office, responsibility, role or URLs. "
            "For every person give at least one CURRENT public official firm/team biography "
            "or reputable published personnel bio that identifies their current job and location. "
            "Connection invitations are generated locally from verified candidate facts and "
            "the recipient's verified team/title, with blank lines before the body and closing; "
            "do not make unsupported claims about the recipient or request a referral. "
            "Only use facts from the candidate Summary Doc. If fewer people can be verified return fewer. "
            "Prioritise verifiable official company press releases, current service-team contact pages "
            "and public management announcements, which can confirm multiple people and roles; "
            "do not rely exclusively on LinkedIn biographies, which can block direct verification. "
            "Accept actual valuation leaders, relevant Deals Advisory senior people, and team recruiters. "
            "Each person must have at least one full publicly accessible HTTPS company news or bio "
            "URL that names them, identifies their current employer affiliation and team or role. "
            + ("FOCUSED SECOND SEARCH: the first search produced zero independently verifiable contacts. "
               "Search ONLY recent official company people/news pages for names and workgroups. "
               "Return 3-8 high-confidence names with precise working company evidence links, "
               "even when direct LinkedIn profiles are unavailable. " if focused else "")
        )
        payload=json.dumps({"company":app.company,"role":app.designation,"vacancy":app.application_link,
                            "location":app.location,"candidate":app.candidate_name,
                            "summary_doc":summary[:13000],
                            "research_strategy":"Find current official employer service team and news people for the exact team; include adjacent local deals leaders and local recruiters. Do not fabricate."})
        response=ai.client.responses.create(model=self.settings.stage2_model,
            instructions=instruction,input=payload,tools=[{"type":"web_search"}],
            reasoning={"effort":"low"},max_output_tokens=5000)
        return parse_contacts(response.output_text)

    def run(self,ai,app,summary):
        """Opt-in post-CV research. At most two bounded searches if none verify.

        A zero-contact outcome is explicit and diagnostic. It never reverses a
        completed CV or silently accepts invented people or dead source URLs.
        """
        self._ensure()
        before=matching_rows(self._rows(),app)
        if len(before)>=5:
            return {"status":"already_saved","count":len(before),"added":0}
        names={str(r[1]).strip().casefold() for r in before}
        new=[]
        stats={"candidates":0,"invalid_candidates":0,"unverifiable_sources":0,"research_calls":0}
        date=datetime.now(timezone.utc).isoformat()

        def collect(contacts,client):
            for c in contacts[:15]:
                stats["candidates"]+=1
                if not isinstance(c,dict):
                    stats["invalid_candidates"]+=1
                    continue
                name=str(c.get("name") or "").strip()
                title=str(c.get("position") or "").strip()
                team=str(c.get("team") or "").strip()
                loc=str(c.get("location") or "").strip()
                urls=c.get("evidence_urls") or []
                if not name or not title or not team or not isinstance(urls,list) or name.casefold() in names:
                    stats["invalid_candidates"]+=1
                    continue
                # Reject invented titles and non-public URLs, but allow a source
                # to be a current official corporate announcement rather than
                # requiring a dedicated one-person biography.
                verified=confirmed_bios(name,urls,client,app.company,title,team)
                if not verified:
                    stats["unverifiable_sources"]+=1
                    continue
                note=linkedin_invitation(app.candidate_name,name,app.company,title,team)
                names.add(name.casefold())
                search="https://www.linkedin.com/search/results/people/?keywords="+quote(
                    name+" "+app.company+" "+title,safe="")
                evidence=("Confidence: "+str(c.get("confidence") or "Medium")+
                          "; Team: "+team+"; Location: "+loc+
                          "; Hiring authority not confirmed. Sources: "+" | ".join(verified))
                new.append([app.company,name,"",search,app.designation,app.candidate_name,
                            str(app.row_number),app.application_link,title,evidence,note,date])
                if len(new)+len(before)>=10:
                    break

        with httpx.Client(headers={"User-Agent":"Mozilla/5.0"}) as client:
            first=self.research(ai,app,summary)
            stats["research_calls"]+=1
            collect(first,client)
            if not new and not before:
                # Exactly ONE focused fallback call, only on total failure.
                print(f"[connections] zero verified on first search for row {app.row_number}; "
                      f"candidates={stats['candidates']} source_rejections={stats['unverifiable_sources']}. "
                      "Trying one bounded official-source search.",flush=True)
                focused=self.research(ai,app,summary,focused=True)
                stats["research_calls"]+=1
                collect(focused,client)

        # Independently reread before appending to protect concurrent ChatGPT
        # and web research writers from duplicates.
        latest=matching_rows(self._rows(),app)
        current_names={str(r[1]).strip().casefold() for r in latest}
        to_insert=[r for r in new if r[1].casefold() not in current_names]
        if to_insert:
            retry_google(lambda:self.sheets.values().append(
                spreadsheetId=self.settings.freshmal_spreadsheet_id,
                range="'Connections'!A:L",valueInputOption="RAW",
                insertDataOption="INSERT_ROWS",body={"values":to_insert}).execute())
        after=matching_rows(self._rows(),app)
        after_names={str(r[1]).strip().casefold() for r in after}
        if any(r[1].casefold() not in after_names for r in to_insert):
            raise RuntimeError("Networking write did not pass read-back verification")
        status=("saved" if to_insert else
                "existing" if after else
                "no_verified_contacts")
        result={"status":status,"count":len(after),"added":len(to_insert),**stats}
        print(f"[connections] verification summary row {app.row_number}: "
              f"candidate_names={stats['candidates']}, "
              f"unverifiable_sources={stats['unverifiable_sources']}, "
              f"invalid={stats['invalid_candidates']}, "
              f"saved={len(to_insert)}, total={len(after)}",flush=True)
        return result
