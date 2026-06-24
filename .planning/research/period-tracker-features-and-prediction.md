# Research: Period Tracker Features and Prediction Model

**Date:** 2026-06-24  
**Scope:** Identify feature ideas from strong period/cycle tracker products and improve Minmin Calendar's current period prediction formula.

## Current Project Fit

Minmin Calendar is not a medical product. Its strongest differentiated angle is a private two-person shared calendar: period signals, "happy time" memories, holidays, lunar dates, and lightweight planning in one home screen.

The product should therefore prefer:

- clear calendar semantics over dense health dashboards;
- private, explainable predictions over opaque "AI" claims;
- shared awareness features that preserve user control;
- small, testable date logic in utility modules.

## Samples Reviewed

### Open-source / developer-facing samples

| Project | Signal | Relevant ideas |
|---|---:|---|
| Mensinator | 137 GitHub stars by GitHub API on 2026-06-24 | Symptom colors, period/ovulation statistics, average-period prediction, average-luteal-phase prediction for irregular cycles, custom reminder text, import/export, privacy-first no account. |
| peri | 100 GitHub stars by GitHub API on 2026-06-24 | Days before period, current cycle day, ovulation countdown, possible next period date, history, average cycle length, average period length. |
| Menstrudel | 85 GitHub stars by GitHub API on 2026-06-24 | Offline-first private tracking, period start dates, symptoms, flow intensity, next-cycle prediction. |
| drip | GitLab project with 2,234 commits; F-Droid distribution | Local data, transparent calculations, symptoms/bleeding/fertility/sex/mood/pain tracking, graphs, period reminders, temperature reminders, import/export, password protection. |
| Euki Android | Public GitHub repo | On-device privacy, data deletion, offline-friendly behavior, PIN protection, educational library. |

### High-rating / mainstream product samples

| Product | Signal | Relevant ideas |
|---|---:|---|
| Flo | App Store 4.8 from 1.9M ratings; Google Play 4.7 from 4.91M reviews; 530M+ downloads on Google Play listing | 70+ symptoms/moods, irregular-period support, doctor-share summaries, BBT tracking, pregnancy/perimenopause modes, partner sharing, anonymous mode, strong disclaimers. |
| Clue | Google Play 4.5 from 1.45M reviews; 100M+ users/download claim on listing/site | 200+ trackable factors, pattern spotting, flow regularity, reminders, wearable integrations, partner sharing via Clue Connect, manual cycle/period length override. |
| Apple Health Cycle Tracking | Built-in platform feature | Period predictions from prior periods and cycle length, notifications, cycle-deviation detection from recent history, exportable cycle history PDF, optional Apple Watch heart-rate/temperature inputs. |

## Feature Candidates Worth Considering

### P1: Prediction range and confidence

Current UI shows one predicted date and confidence as text. Better products and health sources all imply uncertainty. The app should show a range, for example:

- "Expected Jul 20 - Jul 23";
- "Typical variation +/- 3 days";
- confidence derived from both history count and variability.

This fits the existing home card and reduces false precision.

### P1: Explainable cycle stats

Add a small "why this prediction" detail view:

- recent cycle lengths;
- average or median cycle length;
- average period duration;
- ignored suspicious records, if any;
- confidence reason, e.g. "recent 6 cycles vary by about 2 days".

This follows drip's "transparent calculations" direction and makes the app feel calmer and more trustworthy.

### P1: Reminders

Add opt-in reminders:

- predicted period approaching;
- period possibly ended, ask whether to confirm end date;
- record missing if a predicted period passed without a new record.

Apple/Flo/Clue all make notifications central, but Minmin should keep them explicit and quiet.

### P1: Symptoms and flow intensity

Add optional tags to period records:

- flow: light / normal / heavy;
- pain: none / mild / strong;
- mood / sleep / headache / acne / cravings;
- custom tags.

Keep this optional. The current app is intimate and simple, so symptoms should not crowd the calendar.

### P2: Partner-aware sharing controls

The app already has a two-person room, which is a valuable differentiator. Mature products support partner modes, but they also expose privacy tension. Minmin should add explicit controls:

- what is shared: period dates only, symptoms, notes, memories;
- partner cannot edit unless granted;
- clear disconnect/unpair path.

### P2: Calendar legend and marker filtering

As holiday/lunar/prediction/memory markers grow, add a compact legend or filter:

- period;
- prediction;
- happy time;
- holiday;
- adjusted workday.

This protects the home calendar from becoming decorative noise.

### P2: Export / health summary

Settings already exports raw JSON. A more useful version:

- last 12 months summary;
- cycle lengths;
- period durations;
- symptoms/flow if added;
- human-readable text or PDF-like report later.

Apple's cycle history export is a useful product reference, but this app can start with a plain shareable summary.

### P3 / defer: fertility and ovulation mode

Do not add fertility/ovulation as a default feature yet. Research warns that calendar-only fertile-window predictions are easy to overstate. If this is added later, it should be opt-in and clearly labeled as an estimate unless the user records BBT, LH tests, or cervical mucus.

## Current Formula Assessment

Current logic in `pages/index/index.js`:

1. Sort periods by `startDate`.
2. Compute gaps between consecutive start dates.
3. Compute raw average.
4. Keep gaps within 7 days of raw average.
5. Use the latest 3 filtered gaps with weights `[1, 2, 3]`.
6. Predict next start as `lastStart + weightedAvg`.
7. Confidence is based mostly on filtered record count.

This is a reasonable v1, but it has four problems:

- mean-based outlier filtering can itself be dragged by the outlier;
- confidence ignores variability;
- one exact date can look more certain than the data supports;
- period duration is not used to predict the full period window.

## Recommended Prediction Model

### Data normalization

Create a pure helper, likely `utils/cycle.js`, that accepts normalized records:

```js
{
  startDate: 'YYYY-MM-DD',
  endDate: 'YYYY-MM-DD',
  duration: 1
}
```

Rules:

- ignore invalid or non-ISO dates;
- sort by start date;
- compute cycle length as days from one period start to the next period start;
- compute duration from start/end when missing;
- keep medical interpretation out of code comments and UI copy.

### Cycle-length guardrails

Use broad data-quality guardrails, not medical judgement:

- treat 15-60 day gaps as candidate cycle lengths;
- keep out-of-range gaps in history but exclude from prediction;
- show "needs review" or "unusual record" in explainability UI, not a diagnosis.

Health references commonly describe adult cycles around 21-35 days and bleeding around 3-7 days, but the app should not erase irregular records.

### Robust outlier handling

Replace mean-centered filtering with a median-centered approach:

```js
median = median(cycleLengths)
mad = median(abs(length - median))
threshold = max(7, 2 * mad)
stableCycles = cycleLengths.filter(length => abs(length - median) <= threshold)
```

If fewer than 3 stable cycles remain, fall back to the recent raw cycles and mark confidence as low.

### Recency weighting

Use the most recent 6 usable cycles, weighted by recency:

```js
weights = [1, 2, 3, 4, 5, 6].slice(-n)
predictedCycleLength = round(weightedMean(recentStableCycles, weights))
```

This preserves the current "recent cycles matter more" behavior, but makes it less noisy.

### Period duration prediction

Predict the period window, not only the start:

```js
predictedDuration = round(median(lastValidDurations.slice(-6)))
predictedEnd = predictedStart + max(1, predictedDuration) - 1
```

Use a safe display default only when there is too little duration history.

### Confidence and range

Use standard deviation of recent stable cycles:

```js
if usableCycles < 2:
  no prediction
else if usableCycles >= 6 && sd <= 2:
  confidence = 'high'
else if usableCycles >= 4 && sd <= 5:
  confidence = 'medium'
else:
  confidence = 'low'

rangeDays = clamp(ceil(sd || 3), 1, 7)
displayRange = predictedStart +/- rangeDays
```

The home card can still show one compact date, but the detail UI should show the range.

### Manual override

Add settings for:

- typical cycle length;
- typical period length.

When fewer than 2 usable cycles exist, use manual values if present. Clue explicitly lets manual cycle/period lengths override automated calculations, which is a good pattern for a small app.

### Ovulation / fertile window

Avoid default ovulation prediction. If later added:

- only show it in an opt-in fertility mode;
- label it as an estimate;
- improve it only when the user records ovulation markers such as BBT, LH test, or cervical mucus.

## Suggested Implementation Slice

1. Add `utils/cycle.js` with pure functions:
   - `normalizePeriods(records)`;
   - `calculateCycleStats(records, options)`;
   - `predictNextPeriod(records, options)`.
2. Add focused tests for:
   - regular cycles;
   - one outlier cycle;
   - irregular cycles;
   - too little data;
   - manual override fallback;
   - duration prediction.
3. Update `pages/index/index.js` to consume the helper.
4. Update calendar UI to support prediction range/detail.
5. Keep fertility/ovulation out of the first formula-improvement slice.

## Source Links

- Mensinator: https://github.com/EmmaTellblom/Mensinator
- peri: https://github.com/IraSoro/peri
- Menstrudel: https://github.com/J-shw/Menstrudel
- drip website: https://dripapp.org/
- drip F-Droid: https://f-droid.org/en/packages/com.drip/
- drip GitLab: https://gitlab.com/bloodyhealth/drip
- Euki Android: https://github.com/Euki-Inc/Euki-Android
- Flo Google Play: https://play.google.com/store/apps/details?id=org.iggymedia.periodtracker
- Flo App Store: https://apps.apple.com/us/app/flo-cycle-period-tracker/id1038369065
- Clue Google Play: https://play.google.com/store/apps/details?id=com.clue.android
- Clue website: https://helloclue.com/
- Clue manual cycle/period lengths: https://support.helloclue.com/hc/en-us/articles/34363252340637-How-can-I-manually-edit-my-cycle-and-period-lengths
- Apple Cycle Tracking: https://support.apple.com/en-ca/120356
- PubMed app-prediction accuracy paper: https://pubmed.ncbi.nlm.nih.gov/34629005/
- NICHD menstruation factsheet: https://www.nichd.nih.gov/health/topics/factsheets/menstruation
- Cleveland Clinic menstrual cycle overview: https://my.clevelandclinic.org/health/articles/10132-menstrual-cycle
- Harvard / Apple Women's Health Study update: https://hsph.harvard.edu/research/apple-womens-health-study/study-updates/menstrual-cycles-today-how-menstrual-cycles-vary-by-age-weight-race-and-ethnicity/
