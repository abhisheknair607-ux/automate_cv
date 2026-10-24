# Garamaal — Stage 2 Mobile-First UI/UX Refinement

**Status:** Implementation checkpoint ready; human browser/device visual approval outstanding  
**Date:** 24 October 2026  
**Source:** \`prototype/multiuser-profile-plan-20261024\`, directory \`prototypes/multiuser-20261024/full-app/\`

> **Do not deploy.** This design copy runs in isolation. Account sign-in, Cloud Run tenancy checks, Firestore, API billing and user-specific data storage are not active. No production Sheets, Drive, GitHub Actions or OpenAI generation is contacted.

## Executive view

Stage 2 refines the **existing Stage 1 HTML**, keeping the complete original Jobs and Social interfaces. It is a UX checkpoint, not a replacement implementation or a migration of backend data.

## Navigation at different screen sizes

\`\`\`text
320–720 px                                   Tablet / desktop
┌───────────────────────────────┐             ┌───────────────┬─────────────────────┐
│ Garamaal / Current page       │             │ Dashboard     │ Compact top header  │
├───────────────────────────────┤             │ Jobs          ├─────────────────────┤
│ Full-width active page        │             │ Profile       │                     │
│                               │             │ Social        │ Adaptive 1–3-column │
│ Profile: swipeable section    │             │ My rankings   │ content and forms   │
│ tabs + expandable role cards  │             │ Usage/Credits │                     │
│                               │             │ Account       │                     │
├───────────────────────────────┤             └───────────────┴─────────────────────┘
│ Home Jobs Profile Social More │
└───────────────────────────────┘
               │
               └─ More sheet → Rankings / Credits / Account / Sign out

Original Jobs/Social page on phone:
[Back to workspace] → [preserved original controls take full height]
No duplicate outer mobile nav; the original page retains its own mobile navigation.
\`\`\`

## UX changes incorporated

- **Mobile-first visual density:** slimmer padding, compact cards, consistent border radii, 44 px touch-target baseline, 16 px legacy input font on phones to avoid iOS auto-zoom, reduced-motion support, focus rings and viewport-specific refinements at 365, 390, 700/720, and 960 px.
- **Navigation:** persistent desktop rail; five-item bottom bar on mobile; accessible More sheet for private Rankings, Usage/Credits and Account; Escape key to dismiss and arrow-key navigation in the five Profile tabs.
- **Original Jobs integration:** the full 120 KB-plus Jobs HTML remains a working reference, forced to demo/offline mode. When embedded into the new shell on desktop only, the redundant inner Jobs sidebar is suppressed and the shell's four Jobs page shortcuts provide navigation. When opened standalone, the original navigation remains intact.
- **Original Social integration:** full 120 KB-plus Social HTML preserved. Fictional per-legacy-candidate sample contacts populate Dashboard, Swipe and Follow-ups for visual review. Existing read-only guards block status updates. Copying legacy prompts that contain live sheet paths is disabled in the preview. Source code still preserves the original features for eventual secure backend integration.
- **Profile editor:** one collapsible card per employer/role, structured action/outcome fields per achievement, expandable optional metrics/timeframe/evidence/preferred wording. Adding roles or achievements reveals the new editor rather than leaving it hidden. Raw CV paste remains non-AI and is labelled as future reviewed extraction.
- **Profile quality:** computed profile readiness replaces a static percent in profile and dashboard; results with only self-reported evidence do not pass the evidence-verification check. Preferred STAR bullet preview reports its word count and 25-word warning without inventing figures or making an API call.
- **Personal rankings:** shared sample job selection, compact profile-aware copy prompt, JSON schema and bounds checks and local-only 55% Profile Fit / 45% Career Fit recomputation. Independent account samples have independent ranking stores.
- **Account and Credits:** clear future-only states; no misleading claims that demo accounts are actually authenticated or that costs are prepaid/charged.
- **No production interference:** all updates are in new \`prototypes/multiuser-20261024/\` files on the separate branch.

## Interaction model — one role

\`\`\`text
[Profile → Work Experience]
          │
          ▼
[Employer + designation + dates + preserved notes]  ← expandable
          │
          ├─ Achievement 1 (action/result) ← expandable
          │       └─ optional numeric value, unit/timeframe, source, preferred CV bullet
          └─ Add Achievement
                  ↓
       [Preview concise bullet]
                  ↓
       [Review evidence + <=25 words]
                  ↓
       [Save browser-only draft] → later Firebase UID & versioning
\`\`\`

## Technical quality gates

| Check | Current result |
|---|---|
| New UI shell JS syntax | Passed |
| Full original Jobs JS syntax | Passed |
| Full original Social JS syntax | Passed |
| Login/dashboard/Jobs/Social/profile/ranking/usage/account HTML render in simulated DOM | Passed |
| All five Profile sections render | Passed |
| Distinct fictitious account profile objects | Passed |
| Fictional Social data separated by legacy candidate | Passed |
| Social stub refuses write operations | Passed |
| All HTML copies forbid outgoing connections through CSP | Passed |
| Existing files in active source folders modified | **None** (compare GitHub branch against baseline) |
| Actual Chrome/Firefox/Safari 320/360/390/430/768/1024/1440 px visual inspection | **Pending human browser QA** |
| Real Firebase ownership security and Firestore rules | **Not implemented — later stage** |
| Real cost accounting and payment protections | **Not implemented — later stage** |

**Automated regression test:** \`stage2-smoke.test.cjs\` uses only Node built-in \`node:test\`, \`node:assert\` and \`vm\`. In a local checkout of this branch, run:

\`\`\`sh
node --test prototypes/multiuser-20261024/full-app/stage2-smoke.test.cjs
\`\`\`

Passing a JS syntax check does not mean the UI has been visually reviewed. A true browser/device walkthrough is still required before approving the design.

## Manual UX review checklist

- [ ] At **320 px**, no unintentional sideways scrolling; bottom navigation labels and header remain readable.
- [ ] At **360 / 390 / 430 px**, More sheet works, focus stays usable, actions remain visible above safe-area padding.
- [ ] At **768 px**, Profile tabs fit as horizontal scroll without hiding content; input grid and heading have sufficient spacing.
- [ ] At **1024 / 1440 px**, desktop sidebar and embedded original Jobs/Social controls don't duplicate large navigation.
- [ ] Use an Android and iPhone-sized browser to verify keyboard focus, textarea font size and touch target accessibility.
- [ ] Add a new Role and Achievement; ensure the new item opens and fields edit correctly.
- [ ] Edit original notes then switch Profile section; confirm this preview keeps edits within the active sample account.
- [ ] Change a sample job and import a valid/mismatched/invalid JSON ranking; assert only the chosen user's score changes.
- [ ] Browse legacy Social Research, Swipe and Follow-ups with the fictional sample contacts; never send invitations through the preview.
- [ ] Confirm the current live production **Jobs** and **Social** remain entirely unchanged.

## Important constraints before Stage 3

- The backend's legacy A/P selector is **not** a true identity boundary. Future tenant ownership MUST use verified Firebase UID in Cloud Run and Firestore security rules.
- Do not send real personal profiles, contact details, payment cards or API keys into these HTML mocks or browser memory.
- Draft 'save' in this preview is ephemeral and does not survive a reload. No real files are uploaded or generated.
- The original App Script-style frontend wiring survives only inside the preserved HTML and Cloud Run compatibility flow; Apps Script itself is **not** being redeployed.
- The 55/45 score import works only in a sample local object; direct user ChatGPT-to-database write access is an unconfirmed future integration.
- Treat source snapshots as historical; verify the active production Cloud Run revision SHA separately before any staging implementation.

## Release status

**Stage 2: review-ready UX copy, not live release.** 

Next approved step: actual mobile/tablet browser visual QA and accepted refinements. After sign-off, Stage 3 can start a separate UID ownership + Firestore profile proof of concept in staging, with privacy and costs enforced at the backend. No branch merge or production deploy is authorised.
