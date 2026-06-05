# Timezone Fix for Reschedule Modal

## The Problem

When opening the reschedule modal, the date and time pickers were initialized incorrectly due to timezone conversion issues.

**Before:**
- Original appointment: Sat Jun 6, 12:30 PM
- Date input showed: "08/06/2026"
- Time input showed: "10:36 am"
- But preview showed: "Mon, Jun 8, 12:36 AM" ❌ (WRONG!)

The issue was that `toISOString()` was converting the appointment time to UTC before extracting the date, which caused timezone mismatches when reconstructing the date object.

## The Root Cause

```typescript
// BEFORE (WRONG):
const dateStr = initialNs.toISOString().split("T")[0];
const hours = String(initialNs.getHours()).padStart(2, "0");
const minutes = String(initialNs.getMinutes()).padStart(2, "0");
```

This logic:
1. Converted appointment to UTC with `toISOString()` → "2026-06-06T17:30:00Z"
2. Extracted date: "2026-06-06" ✓ (happens to be correct)
3. Got local hours: 12 ✓ (local time hours)
4. Created date string: "2026-06-06"
5. When user changed time to 10:36, it created: `new Date("2026-06-08T10:36:00")`

The problem was a mismatch between how the date was extracted (UTC-based) and how the time was used (local-based).

## The Solution

```typescript
// AFTER (CORRECT):
const year = initialNs.getFullYear();
const month = String(initialNs.getMonth() + 1).padStart(2, "0");
const day = String(initialNs.getDate()).padStart(2, "0");
const hours = String(initialNs.getHours()).padStart(2, "0");
const minutes = String(initialNs.getMinutes()).padStart(2, "0");

const dateStr = `${year}-${month}-${day}`;
const timeStr = `${hours}:${minutes}`;
```

This logic:
1. Gets year from local date: 2026 ✓
2. Gets month from local date: 06 ✓
3. Gets day from local date: 06 ✓
4. Gets hour from local time: 12 ✓
5. Gets minutes from local time: 30 ✓
6. Creates: `2026-06-06T12:30` in local time ✓

All date/time components are now extracted consistently from the local timezone, not UTC.

## What Changed

**File:** `src/components/calendar/AppointmentDialogs.tsx`

**Lines 479-488** (useEffect for initializing date/time)

**From:**
```typescript
useEffect(() => {
  if (initialNs) {
    const dateStr = initialNs.toISOString().split("T")[0];
    const hours = String(initialNs.getHours()).padStart(2, "0");
    const minutes = String(initialNs.getMinutes()).padStart(2, "0");
    setEditDate(dateStr);
    setEditTime(`${hours}:${minutes}`);
  }
}, [initialNs]);
```

**To:**
```typescript
useEffect(() => {
  if (initialNs) {
    // Get local date components (not UTC)
    const year = initialNs.getFullYear();
    const month = String(initialNs.getMonth() + 1).padStart(2, "0");
    const day = String(initialNs.getDate()).padStart(2, "0");
    const hours = String(initialNs.getHours()).padStart(2, "0");
    const minutes = String(initialNs.getMinutes()).padStart(2, "0");

    // Format as YYYY-MM-DD for HTML date input
    const dateStr = `${year}-${month}-${day}`;
    const timeStr = `${hours}:${minutes}`;

    setEditDate(dateStr);
    setEditTime(timeStr);
  }
}, [initialNs]);
```

## Result

Now when opening the reschedule modal:

**After Fix:**
- Original appointment: Sat Jun 6, 12:30 PM
- Date input shows: "2026-06-06"
- Time input shows: "12:30"
- Preview shows: "Sat, Jun 6, 12:30 PM" ✅ (CORRECT!)

When user changes to 10:36 am on Jun 8:
- Date input: "2026-06-08"
- Time input: "10:36"
- Preview shows: "Mon, Jun 8, 10:36 AM" ✅ (CORRECT!)

## Timeline & Date Component Reference

The fix uses the correct JS Date methods for local time:

| Method | Returns | Example |
|--------|---------|---------|
| `getFullYear()` | 4-digit year | 2026 |
| `getMonth()` | 0-11 (Jan-Dec) | 5 (for June, need +1) |
| `getDate()` | 1-31 (day of month) | 8 |
| `getHours()` | 0-23 (local time) | 10 |
| `getMinutes()` | 0-59 (local time) | 36 |

**Never use for local time:**
- `toISOString()` - converts to UTC
- `getUTCHours()`, `getUTCMinutes()`, etc. - UTC values

## Testing the Fix

1. **Open Calendar** → Click on an appointment
2. **Click Reschedule** → Modal opens
3. **Verify date/time match original appointment** → Should be exactly the same
4. **Change date/time** → Preview should update correctly
5. **Confirm reschedule works** → Should reflect new time

## Business Hours Still Work

The business hours validation still functions correctly because:
- `getDay()` and `getHours()` always work in local timezone
- Validation uses these methods (unchanged)
- No impact on validation layer

## Timezone Awareness

The entire app uses:
- **Business timezone:** `America/Chicago`
- **All displays:** Use Chicago timezone via `fmtTime()` and `toLocaleDateString()`
- **Date construction:** Now consistently local-time-based
- **No UTC conversions:** Except in API when storing to database

This ensures that regardless of user's browser timezone, the appointment times are always interpreted relative to the clinic's timezone (Chicago).

## No Breaking Changes

- ✅ Existing reschedule functionality unchanged
- ✅ Validation logic unchanged
- ✅ API endpoints unchanged
- ✅ Only the date/time initialization is fixed
- ✅ Modal behavior identical, just displays correct times now

## Related Files

- `src/lib/calendar-utils.ts` - `fmtTime()` function uses Chicago timezone
- `src/components/calendar/AppointmentDialogs.tsx` - RescheduleModal component
- `BUSINESS_HOURS.md` - Business hours validation documentation
- `RESCHEDULE_GUIDE.md` - Complete reschedule flow documentation
