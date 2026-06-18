# Business Hours Validation

## Overview

The system now enforces strict business hours validation for all appointment bookings and rescheduling operations:

- ✅ **Hours:** 9:00 AM - 7:00 PM
- ✅ **Days:** Monday - Saturday (Sundays closed)

## Validation Rules

### Reschedule Operations

When rescheduling an appointment, users cannot select:

- ❌ Any time on **Sunday**
- ❌ Any time **before 9:00 AM**
- ❌ Any time **after 7:00 PM** (19:00)

### New Bookings

When creating a new appointment, the system rejects:

- ❌ Any time on **Sunday**
- ❌ Any time **before 9:00 AM**
- ❌ Any time **after 7:00 PM** (19:00)

## User Interface

### Reschedule Modal

When selecting a new date/time:

**Valid Time:**

```
✓ Mon-Sat, 9:00 AM - 7:00 PM
→ Shows: "Will be: [Customer] — [Treatment] — [Date], [Time]"
→ "Review changes" button ENABLED
```

**Invalid Time:**

```
✗ Sunday → "Cannot reschedule on Sundays — clinic is closed"
✗ Before 9 AM → "Cannot reschedule before 9:00 AM"
✗ After 7 PM → "Cannot reschedule after 7:00 PM"
→ "Review changes" button DISABLED (grayed out)
```

**Visual Feedback:**

- Error message shown in red alert box
- "Review changes" button disabled while time is invalid
- Real-time validation as user changes date/time

## API Validation

### PATCH /api/calendar/reschedule

**Request validation:**

- Returns `400 Bad Request` with code `INVALID_DAY` for Sundays
- Returns `400 Bad Request` with code `INVALID_TIME` for outside 9 AM - 7 PM

**Response (Invalid Day):**

```json
{
  "error": "Cannot reschedule on Sundays — clinic is closed",
  "code": "INVALID_DAY"
}
```

**Response (Invalid Time):**

```json
{
  "error": "Can only reschedule between 9:00 AM and 7:00 PM",
  "code": "INVALID_TIME"
}
```

### POST /api/calendar/book

**Request validation:**

- Rejects bookings on Sundays with message: "Appointments cannot be booked on Sundays — clinic is closed"
- Rejects bookings outside 9 AM - 7 PM with message: "Appointments can only be booked between 9:00 AM and 7:00 PM"

## Implementation Details

### Frontend (RescheduleModal)

**File:** `src/components/calendar/AppointmentDialogs.tsx`

```typescript
const getTimeError = (): string | null => {
  if (!ns) return null;

  const dayOfWeek = ns.getDay();
  const hours = ns.getHours();

  if (dayOfWeek === 0) {
    return "Cannot reschedule on Sundays — clinic is closed";
  }

  if (hours < 9) {
    return "Cannot reschedule before 9:00 AM";
  }
  if (hours >= 19) {
    return "Cannot reschedule after 7:00 PM";
  }

  return null;
};

const timeError = getTimeError();
const isValidTime = !timeError;
```

Then used to:

- Show error message to user
- Disable "Review changes" button
- Prevent progression to confirmation step

### Backend (API Reschedule)

**File:** `src/app/api/calendar/reschedule/route.ts`

```typescript
const newStartDate = new Date(newStartTime);
const dayOfWeek = newStartDate.getDay();
const hours = newStartDate.getHours();

if (dayOfWeek === 0) {
  return NextResponse.json(
    { error: "Cannot reschedule on Sundays — clinic is closed", code: "INVALID_DAY" },
    { status: 400 },
  );
}

if (hours < 9 || hours >= 19) {
  return NextResponse.json(
    { error: "Can only reschedule between 9:00 AM and 7:00 PM", code: "INVALID_TIME" },
    { status: 400 },
  );
}
```

### Backend (Booking Service)

**File:** `src/lib/services/booking-service.ts`

```typescript
// Validate business hours (9 AM - 7 PM, no Sundays)
const startDate = new Date(request.startTime);
const dayOfWeek = startDate.getDay();
const hours = startDate.getHours();

if (dayOfWeek === 0) {
  throw new Error("Appointments cannot be booked on Sundays — clinic is closed");
}

if (hours < 9 || hours >= 19) {
  throw new Error("Appointments can only be booked between 9:00 AM and 7:00 PM");
}
```

## Edge Cases Handled

### 1. User Tries to Bypass via Direct API Call

- API validates independently
- User cannot reschedule outside hours even if UI bypassed
- Clear error message returned

### 2. User Selects Invalid Time Then Waits

- Button stays disabled until valid time selected
- No accidental submission possible

### 3. Timezone Considerations

- Validation uses `getDay()` and `getHours()` on Date object
- Times are in local browser timezone
- Consider if clinic operates in different timezone (currently not adjusted)

### 4. End Time Validation

- Only start time is validated
- Assumption: duration is always less than closing time
- Consider adding end-time validation if appointments can span 7 PM

## Testing Checklist

- [ ] Try to reschedule on Sunday → Error shown, button disabled
- [ ] Try to reschedule at 8:59 AM → Error shown, button disabled
- [ ] Try to reschedule at 7:01 PM → Error shown, button disabled
- [ ] Select valid time (Mon 10 AM) → No error, button enabled
- [ ] Try to POST to API with Sunday time → 400 error returned
- [ ] Try to POST to API with 8 AM time → 400 error returned
- [ ] Create new appointment on Sunday → Booking rejected
- [ ] Create new appointment at 6 PM → Booking succeeds
- [ ] Create new appointment at 8 AM → Booking rejected

## Future Enhancements

- [ ] **Timezone handling** - Adjust business hours for clinic timezone
- [ ] **Configurable hours** - Allow setting hours via Settings page
- [ ] **Break times** - Define break periods within business hours
- [ ] **Practitioner hours** - Different hours for different practitioners
- [ ] **Blackout dates** - Mark specific dates as unavailable
- [ ] **Customer timezone** - Show available times in customer's timezone

## Configuration

Currently business hours are hardcoded as:

- **Start:** 9 AM (hour 9)
- **End:** 7 PM (hour 19)
- **Closed:** Sundays (dayOfWeek === 0)

To change these values, update:

1. `src/components/calendar/AppointmentDialogs.tsx` - `getTimeError()` function
2. `src/app/api/calendar/reschedule/route.ts` - validation in PATCH handler
3. `src/lib/services/booking-service.ts` - validation in `bookAppointment()`

To make configurable:

```typescript
// Create constants file: src/lib/business-config.ts
export const BUSINESS_HOURS = {
  START_HOUR: 9,
  END_HOUR: 19, // exclusive (never equal to or after)
  CLOSED_DAYS: [0], // 0 = Sunday
};
```

Then import and use across all three locations.
