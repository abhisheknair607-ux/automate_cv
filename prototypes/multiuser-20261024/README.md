# Garamaal Multi-User UI/UX Prototype

> **Planning prototype only — not deployed.** Created 24 October 2026. All writes are limited to `prototype/multiuser-profile-plan-20261024`. No production Google Sheets, Drive, Firebase hosting, Cloud Run or CV worker changes.

## Prototype files

- [Current dashboard source snapshot](./current-dashboard-source-snapshot.html) — exact copy of `webapp/Index.html` from `fix/jobs-live-header-overlay-guarded-20261020` at blob `765acba0e663e291545f3ceb3083178a92431646`; unchanged reference.
- [Profile + sign-in design](./profile-signin-design-preview.html) — separate interactive single-file HTML using the existing dashboard visual vocabulary. Open the downloaded HTML file locally in a browser to interact with it. All sample records, counts and sign-in state are illustrative.
- This README — design choices and the stage gates below.

## The proposed experience

```text
[ Welcome / Google sign-in ]
                |
                v
[ Invitation + consent ]  <-- future backend, not in mock
                |
                v
[ Dashboard ]
     | replaces the "Next move" card with "My Profile"
     +----------> [ My Profile ]
                        |
          +-------------+----------------+
          |             |                |
  [Experience]      [Education]     [Achievements]
          |                              |
     [STAR + metrics]                [Evidence]
          |             |                |
          +----------[Interests]--------[Skills]
                        |
                        v
                [ Verified profile ]
                   |            |
                   v            v
              [ CV builder ]  [ Personal rankings ]
```

### Editor design

- **One employment card per role**, not one global experience text box.
- Role fields: employer, title, dates, location and original free-text responsibility notes.
- Repeatable achievement entries: challenge/situation, action, result, numeric metric + unit, source and verification state.
- Optional raw CV paste/extraction flow, where **the user must review and approve** parsed records.
- CV bullet preview must not include unsupported numbers; default preference is evidence-backed STAR, no more than 25 words.
- Education, Achievements, Interests and Skills each get their own navigation section; goals are visible in Interests.
- Profile edits should be free of paid AI calls until the user explicitly runs a billable task.

### Sign-in design

```text
[ Google/Firebase Auth ] ---> [ Verified UID ] ---> [ Cloud Run ACL ]
                                                          |
                                        +-----------------+----------------+
                                        v                                  v
                                 [ own profile ]                    [ own ranking ]
```

The mock's Google button **does not authenticate**. Clicking it opens a fictitious private workspace; no user data is persisted. Do not connect the real app to this mock or mistake the sample user for an access control mechanism.

## Mobile and interaction review checklist

- [ ] Dashboard retains ranking actions, stats, Jobs/Social navigation and the vacancy-to-CV workflow.
- [ ] My Profile completion card appears where “Next move” is today; check if quick actions need relocating rather than removal.
- [ ] Each of the five Profile sections is accessible on a phone without losing edits.
- [ ] Experience achievements support optional metrics and evidence; imported CV text remains reviewable.
- [ ] Google sign-in/invitation screen explains privacy and account separation.
- [ ] No direct access to any other user's data or mixed selectors.
- [ ] No payment, OpenAI, GitHub Actions, Sheets, Drive or Firebase requests happen from the prototype.
- [ ] Get approval on UX before implementation in a staging backend.

## Storage / release diagram

```text
GitHub planning branch
      | design review / test only
      v
Isolated staged frontend + backend (future)
      | Auth UID -> Firestore rules -> Cloud Run owner check
      |             |
      |             +-> Profile / user ranking / private contacts
      v
Approval + smoke tests + rollback point
      v
Production Cloud Run / Firebase Hosting (NOT YET)
```

## Living master plans

- [Architecture and implementation plan](https://docs.google.com/document/d/1z3pbM4Jf3QMJhL8WdAy-4wZ_2q2_Yr9ixqy9BEbzm5M/edit).
- [Future Plans, Decisions & Change Archive](https://docs.google.com/document/d/1zWEHIdaI3iRvFwm6vRbT7M1iwtWDZrU4tIbpn4zHBi4/edit).
- [Planning folder](https://drive.google.com/drive/folders/11A-9bgmcvnqdZb5dStZ92A_pSEMH0fyy).

**Do not deploy this prototype.** First independently verify the currently running Jobs Cloud Run revision/source commit. The source branch used for this copy is not proof of the deployed SHA.
