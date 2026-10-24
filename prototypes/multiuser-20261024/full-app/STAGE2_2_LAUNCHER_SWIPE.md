# Garamaal — Stage 2.2 Action-First Mobile Navigation & Job Swipe Concept

**Date:** 24 October 2026  
**Status:** New HTML/CSS design revision in the **isolated prototype branch**; **no production deployment**  
**Reference:** User-supplied phone design showing black backdrop, oversized white/purple hand-lettered question, four rounded colorful action tiles and “START YOUR JOURNEY”.

## 1 | Mobile Home — new first screen

\`\`\`text
┌────────────────────────────────────┐
│ ✦  GARAMAAL                  [A]  │  ← compact top, account icon
│                                    │
│ WHAT DO                            │
│ YOU WANT                           │
│ TO DO today?                      │
│                                    │
│ ◎ Targets  ◷ Reminders  ▥ Stats    │  ← tiny chips only
│                                    │
│ [ ◉  UPDATE PROFILE         ✎ ]  │  ← lime
│ [ ↗  APPLY JOBS             ✦ ]  │  ← white
│ [ ⇄  NETWORK                ◎ ]  │  ← purple
│ [ ▥  STATISTICS    GOAL GETTER! ] │  ← white
│                                    │
│ START YOUR JOURNEY           ⟶    │
└────────────────────────────────────┘
\`\`\`

- Retains the reference's **question**, four large playful cards and **START YOUR JOURNEY** affordance. The copy/images/assets themselves are original CSS/HTML styling rather than protected crypto branding or graphics.
- Ordered by the user's selection: **Update Profile → Apply Jobs → Network → Statistics**.
- Small Targets / Reminders / Stats chips are deliberately secondary so they do not consume the first third of the phone.
- Statistics shows sample personal targets, decisions, profile completeness and a manually editable in-app reminders checklist. It **does not schedule notifications** or read a user's calendar.
- Opens directly into a **sample profile** for review; Google sign-in remains a separate mock, not real Firebase authorization.

## 2 | Jobs hub navigation

\`\`\`text
  [‹] Jobs                     [＋][☷][A]  ← top actions on Discovery & Make CV
───────────────────────────────────────
  Full original Jobs screen, hidden duplicate shell
───────────────────────────────────────
 Dashboard | Discovery |  ⇄ Swipe  | Make CV | More
                                              │
                                              ├─ Add Job
                                              ├─ Statistics
                                              ├─ Rankings
                                              └─ Usage / Account
\`\`\`

- **Dashboard**: original Overview/“Next move” and metrics.
- **Discovery**: original search, category tabs and preference filters.
- **Swipe**: a new full-card review flow for only **Discovery-cleared vacancies with completed JDs**. This is an independent, gamified alternate path to choose job interest, **not a second CV generator**.
- **Make CV**: original Freshmaal list, checkboxes, tiers, application statuses, download and controls; original search and filters remain.
- **More**: Add Job and Statistics are kept out of the five main tabs. Add Job also has a compact plus shortcut from Discovery/Make CV.
- Compact top Filter ☷ focuses the existing Discovery/Make CV search/filter bar rather than creating a disconnected filter model.

### Job swipe — information hierarchy decision for the prototype

\`\`\`text
            Job N of M · JD complete
┌──────────────────────────────────────────┐
│ Dark hero                                │
│ Title / company                          │
│ Location · level · category              │
├──────────────────────────────────────────┤
│ At a glance                              │
│ • 3 key requirements / responsibilities  │
│ • ...                                    │
│ ▼ Read the full job description          │  ← expand before deciding
└──────────────────────────────────────────┘
[← Not interested]      [Interested →]
\`\`\`

**Default recommendation for UX testing: show a short requirement summary above the fold, plus a full JD expandable inside each card.** This preserves informed decision-making without forcing the user to scroll through the entire job description for every swipe.

**Swipe left** = not interested; **swipe right** = interested. Visible buttons and keyboard arrows offer accessible alternatives to gestures. Job decisions are kept separate by mock user. Only entries whose \`discoveryPassed\` and \`jdComplete\` flags are true and whose JD text is substantial are eligible. The current demo provides three fictional eligible roles and one intentionally ineligible JD-missing role. **There is no production Taaza/Freshmaal transfer on swipe at this stage.**

## 3 | Social hub navigation

\`\`\`text
  [‹] Social                           [A]
───────────────────────────────────────────
  Preserved original Social screen
───────────────────────────────────────────
  Targets | Research | ⇄ Swipe | Follow-ups | Stats
\`\`\`

- **Targets** is the original social dashboard and company/department filters, plus saved target searches.
- **Research** retains screenshot/TXT upload, target search and review workflows.
- **Swipe** remains the original LinkedIn-person connection workflow — it is intentionally distinct from **Jobs swipe**.
- **Follow-ups** retains existing message review and next-contact workflow.
- **Stats** shows fictional contacts, accepted sample connections and pending follow-ups; separately adjustable local networking goal.
- All original HTML is preserved in \`social.html\` and \`jobs.html\`; only redundant nested navigation is concealed when embedded. Standalone copies still display the original navigation.

## 4 | Security and non-goals

- **Branch:** \`prototype/multiuser-profile-plan-20261024\`. All changes are under \`prototypes/multiuser-20261024/\`.
- No production \`webapp/Index.html\`, \`standalone/social.html\`, Cloud Run Jobs/Social revisions, Firebase, Sheets, Drive, worker, private records, ranking API or billing were modified.
- Full Jobs and Social copies use a no-network Content Security Policy and read-only fake adapters.
- Present mock A/P identities are for reviewing aesthetics only and must **never** become tenant authority. Later verified Firebase UID and backend authorization are mandatory.
- Job choices, reminders, targets and score imports are **browser-memory examples**. They do not persist after reload and are not eligible for real CV generation.
- The benchmark rule for real job swipe must be defined by the server: eligibility = Discovery passed + JD complete + ownership-aware preference write. Do not infer ownership from a candidate selector or trust a client-supplied row index.
- Statistics require agreed definitions: “jobs viewed”, “interested”, “CV requested”, “CV generated”, “applied”, “connections sent”, “connections accepted”, “follow-up due” — all scoped to the authenticated UID and an explicit date window. Avoid double-counting based on duplicate listing IDs.

## 5 | Mobile UX review gates

- [x] Build reference-inspired typography, color and four launcher tiles.
- [x] Show targets/reminder chips without filling top area with paragraphs.
- [x] Add separate five-item Jobs and Social bottom bars.
- [x] Keep compact back and profile controls in header.
- [x] Preserve the original Jobs and Social screens behind the new shell.
- [x] Show complete-JD-only sample jobs, summary + expandable full JD and both swipe directions.
- [x] Add sample reminders/goals and separate Social statistics.
- [x] Keep existing Discovery, Make CV and Social target filter logic in full preserved HTML.
- [x] Add keyboard and touch alternatives for Jobs swipe.
- [ ] Test viewport widths 320/360/390/430/768/1024 px in real browser.
- [ ] Inspect actual screenshots / iOS and Android physical browser, focus, scroll, safe areas and iframe sizing.
- [ ] Test against a **real staging backend** and a verified live source revision before any authenticated rollout.
- [ ] Approve exact swipe-to-application/Make CV behavior and whether the default summary is sufficient before connecting real job preferences.

## 6 | Files

- [Updated index.html](./index.html) — complete home and navigation HTML/CSS/JS
- [Preserved Jobs](./jobs.html)
- [Preserved Social](./social.html)
- [New Stage 2.2 smoke tests](./stage22-home-swipe.test.cjs)
- [Stage 2 overall UX review](./STAGE2_UX_REVIEW.md)

To use a local checked-out branch: open \`index.html\` with \`jobs.html\` and \`social.html\` beside it in the same directory. Or run a local static HTTP server. GitHub's regular file viewer only displays source, not a fully hosted, live phone preview. To run regression checks with Node:

\`\`\`sh
node --test prototypes/multiuser-20261024/full-app/stage22-home-swipe.test.cjs
\`\`\`

**Approval status:** Awaiting visual review; not deployed or merged.
