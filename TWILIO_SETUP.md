# Twilio address blast — ABANDONED (2026-11-22)

This plan is dead. Do **not** build the Twilio blast script or follow the setup
steps below. Summary of the decision (see Fernando's update, 2026-11-22):

- The A2P/10DLC campaign was **rejected twice**: (1) use-case mismatch — personal /
  peer-to-peer texting is not what 10DLC is for; (2) opt-in evidence — verbal
  consent needs recorded proof per guest, which is as much work as texting
  everyone directly.
- **New flow instead:** Fernando builds `guests.csv` (kept OUT of this repo — it
  is public), runs `node scripts/import_guests.mjs guests.csv` ONCE with
  `SITE_URL=https://thedavilaswedding.parallel5.com` to generate personal links
  (`guest_tokens.csv` — also kept out of the repo), then Kendra & Nando text each
  guest their link individually from their own phones. Replies are tracked via
  `/api/addresses.csv` (admin key) cross-referenced against `guest_tokens.csv`;
  follow-ups reuse the SAME link.
- Never re-run the import for already-sent guests — re-running mints new tokens
  that won't match links already sent.
- `/privacy` and `/terms` pages stay live (useful, harmless).

## Original Twilio setup checklist (kept for reference only — OBSOLETE)

# Twilio setup — address text blast (Kendra & Nando)

Checklist for Fernando to work through tomorrow. Nothing here blocks the website side — the `/address` page, database table, guest-token import script, and CSV export are already built; this covers the texting side only.

## 1. Twilio account

1. Sign up at https://www.twilio.com (free trial account is fine to start; you'll need to upgrade to send to real US numbers)
2. Buy a number: **Console → Phone Numbers → Manage → Buy a number** — pick a US number with **SMS** capability (voice not needed). ~$1.15/mo
3. Save your **Account SID** and **Auth Token** (Console dashboard) — these are secrets; do not put them in the repo or chat. Hand them to Glyph via a local secrets file (`C:\Users\glyph.DESKTOP-F8K8CPE\secrets\twilio` with `TWILIO_ACCOUNT_SID=...` and `TWILIO_AUTH_TOKEN=...` lines).

## 2. A2P / 10DLC registration (REQUIRED for US bulk texting, start this first — approval takes ~24-48h)

US carriers require all bulk SMS to come from a registered brand + campaign:

1. Console → **Messaging → Regulatory Compliance (A2P) → Brand Registration** — register as a **Sole Proprietor** brand (Kendra & Nando's names + address). ~$4.50 brand fee + $15 one-time campaign review, then ~$2/month for the campaign. (The ~$44 figure is the Standard tier — not needed at this scale. Sole Proprietor also has a simpler campaign form: no "Mixed" / "Low volume mixed" use-case picker.)
2. Then **Campaign Registration** (uses the brand):
   - Use case: follow the Sole Proprietor flow's simplified options (pick the closest match to personal event outreach)
   - Sample messages: paste 2–3 examples, e.g. _"Kendra & Nando here! We're getting a head start on invitations — give us your current mailing address at <link> 💌 Reply STOP to opt out"_
   - Opt-in description: guests gave their phone numbers directly to Kendra or Nando (in person / by text); each guest receives one message with their personal mailing-address link, and can reply STOP to opt out
   - Opt-out: reply STOP; no further messages sent
3. After approval, link the campaign to your phone number (or a **Messaging Service** — Console → Messaging → Services → create one, add your number, attach the campaign)

## 3. When the guest list is ready (tomorrow)

1. Drop the list as a CSV at `C:\Users\glyph.DESKTOP-F8K8CPE\projects\davilas-wedding\guests.csv` — headers: `name,phone` (mixed phone formats are fine — the import leaves them as typed; the SMS blast script normalizes to E.164 at send time), optional `email` column
2. Hand it to Glyph — or run it yourself:
   ```
   node scripts/import_guests.mjs guests.csv
   ```
   This generates `guest_tokens.csv` with each guest's personal link (`SITE_URL/address?g=<token>`). Note: the import does NOT normalize phone formats — the SMS blast script does E.164 normalization at send time, so mixed formats in the CSV are fine.
3. Glyph runs the SMS blast through Twilio's API (script provided when the list lands) — one message per guest, with STOP language, spaced to respect throughput limits
4. Watch replies in the Twilio console; STOP/opt-out handling is honored automatically by Twilio for numbers in its opt-out list

## 4. Environment variables (for the blast script, not the website)

```
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_MESSAGING_SERVICE_SID=...   # from step 2
SITE_URL=https://davilas.parallel5.com   # domain only — the script appends /address?g=<token> itself
```

## 5. Cost sanity check

- US SMS outbound: ~$0.0079/msg (pooled) — 100 guests ≈ **under $1** in messages
- Number: ~$1.15/mo · A2P Sole Proprietor brand: ~$4.50 one-time + $15 campaign review · campaign: ~$2/mo
- **Total for the whole address campaign: roughly $25 all-in**

## Status / open items

- [x] Website `/address` page + API + DB (built, on `addresses` branch)
- [x] Guest token import script (`scripts/import_guests.mjs`)
- [x] This checklist
- [ ] Guest list CSV from Fernando (late Nov 12)
- [ ] Twilio account + number + A2P registration (above)
- [ ] Blast script run (needs 1-4)
- [ ] Neon password rotation (separate, still pending — chat-leaked string)
