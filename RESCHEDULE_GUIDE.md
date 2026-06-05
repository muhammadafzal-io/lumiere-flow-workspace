# Complete Reschedule Appointment Guide

## Overview

The reschedule system is fully integrated with business hours validation at every layer to ensure appointments never get scheduled outside clinic hours or on closed days.

**Business Hours:** Monday - Saturday, 9:00 AM - 7:00 PM
**Closed:** Sundays

## How to Reschedule (User Guide)

### Method 1: Click from Appointment Details

1. **Open Calendar** → Navigate to any date with an appointment
2. **Click Appointment** → Appointment details slide-over opens on the right
3. **Click "Reschedule" Button** → Reschedule modal opens with date/time pickers
4. **Select New Date** → Choose a date from the date picker
5. **Select New Time** → Choose a time from the time picker
6. **See Real-Time Validation** → 
   - ✅ Valid time → Green preview shows: "Will be: [Customer] — [Treatment] — [Date], [Time]"
   - ❌ Invalid time → Red error shows: "Cannot reschedule on Sundays" or "Cannot reschedule after 7:00 PM"
7. **(Optional) Toggle Notification** → Send WhatsApp message to client
8. **(Optional) Edit Message** → Customize notification text
9. **Click "Review changes"** → Go to confirmation step (button only enabled if time is valid!)
10. **Review Confirmation Screen** → Shows new time and warning message
11. **Click "Confirm reschedule"** → Updates Google Calendar immediately
12. **See Success Toast** → "Appointment rescheduled. Notification sent to [Customer]."

### Method 2: Drag & Drop (Direct on Calendar)

1. **Open Calendar** → Week or Day view
2. **Find Appointment** → Locate the appointment block you want to reschedule
3. **Click & Drag** → Hold appointment and drag it to a new time slot
4. **See Validation Toast** →
   - ✅ Valid drag → Modal opens with new time pre-filled
   - ❌ Sunday → Toast shows: "Cannot reschedule on Sundays — clinic is closed"
   - ❌ Outside hours → Toast shows: "Can only reschedule between 9:00 AM and 7:00 PM"
5. **If Valid** → RescheduleModal opens with date/time already set, can edit further
6. **Continue from step 8 above**

## Complete Flow Diagram

```
User Opens Appointment
    ↓
Click "Reschedule" Button
    ↓
RescheduleModal Opens
├─ Shows: Original appointment details
├─ Shows: Date picker (initialized to appointment's current date)
├─ Shows: Time picker (initialized to appointment's current time)
└─ Shows: Real-time validation messages
    ↓
User Selects New Date & Time
    ↓
VALIDATION LAYER 1: Frontend Validation
├─ Check: Is it Sunday? → RED error, disable button
├─ Check: Is it before 9 AM? → RED error, disable button
├─ Check: Is it after 7 PM? → RED error, disable button
└─ If Valid: Show green preview, ENABLE "Review changes" button
    ↓
User Clicks "Review changes" Button
    ↓
Step 2: Confirmation Screen
├─ Shows: New appointment time in blue box
├─ Shows: Warning: "Reschedule will update the calendar"
├─ Shows: (If notification enabled) Message that will be sent
└─ Shows: "Confirm reschedule" button
    ↓
User Clicks "Confirm reschedule" Button
    ↓
API VALIDATION LAYER 2: Server-Side Validation
├─ Parse: Extract date and time from ISO string
├─ Check: Is it Sunday? → Return 400 error
├─ Check: Is it before 9 AM? → Return 400 error
├─ Check: Is it after 7 PM? → Return 400 error
└─ If Valid: Proceed to Google Calendar update
    ↓
Update Google Calendar
├─ Get existing event
├─ Update: start time, end time (preserve description/summary)
└─ Save to Google Calendar
    ↓
Update Local Store
├─ Update appointment object with new times
├─ Store persists changes locally
    ↓
Create Activity Log (Optional)
├─ Only if: Customer found AND notification enabled
├─ Log: Reschedule notification sent via WhatsApp
    ↓
Show Success Toast
├─ "Appointment rescheduled."
├─ If notified: "Notification sent to [Customer Name]."
    ↓
Modal Closes
├─ Reset state: Clear editDate, editTime
├─ Calendar refreshes with new appointment time
    ↓
Done! ✅
```

## Validation Layers

### Layer 1: Frontend Modal (UX)
**File:** `src/components/calendar/AppointmentDialogs.tsx`

```typescript
const getTimeError = (): string | null => {
  if (!ns) return null;

  const dayOfWeek = ns.getDay();   // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const hours = ns.getHours();     // 0-23

  if (dayOfWeek === 0) {
    return "Cannot reschedule on Sundays — clinic is closed";
  }

  if (hours < 9) {
    return "Cannot reschedule before 9:00 AM";
  }
  if (hours >= 19) {  // 19:00 is 7 PM
    return "Cannot reschedule after 7:00 PM";
  }

  return null;
};

const timeError = getTimeError();
const isValidTime = !timeError;
```

**Uses:**
- Display error message in red alert box
- Disable "Review changes" button when error exists
- Prevent progression to confirmation step

### Layer 2: API Validation (Security)
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

**Uses:**
- Rejects invalid requests
- Cannot be bypassed by direct API calls
- Returns specific error codes for client handling

### Layer 3: Drag Handler Validation
**File:** `src/app/(admin)/calendar/page-client.tsx`

```typescript
const handleDragEnd = (e: DragEndEvent) => {
  // ... get slot and appointment ...

  const dayOfWeek = slot.date.getDay();
  const hours = slot.date.getHours();

  if (dayOfWeek === 0) {
    toast.error("Cannot reschedule on Sundays — clinic is closed");
    return;
  }

  if (hours < 9 || hours >= 19) {
    toast.error("Can only reschedule between 9:00 AM and 7:00 PM");
    return;
  }

  setReschedAptId(aptId);
  setReschedNewStart(slot.date);
};
```

**Uses:**
- Prevents invalid drag operations
- Shows toast message to user
- Prevents modal from opening with invalid time

### Layer 4: Booking Service Validation
**File:** `src/lib/services/booking-service.ts`

```typescript
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

**Uses:**
- Prevents new bookings outside hours
- Used by both admin UI and chatbot
- Shared service ensures consistency

## Error Messages

### Sunday Reschedule
```
Frontend: "Cannot reschedule on Sundays — clinic is closed"
API: "Cannot reschedule on Sundays — clinic is closed" (code: INVALID_DAY)
Drag: "Cannot reschedule on Sundays — clinic is closed" (toast)
```

### Before 9 AM
```
Frontend: "Cannot reschedule before 9:00 AM"
API: "Can only reschedule between 9:00 AM and 7:00 PM" (code: INVALID_TIME)
Drag: "Can only reschedule between 9:00 AM and 7:00 PM" (toast)
```

### After 7 PM
```
Frontend: "Cannot reschedule after 7:00 PM"
API: "Can only reschedule between 9:00 AM and 7:00 PM" (code: INVALID_TIME)
Drag: "Can only reschedule between 9:00 AM and 7:00 PM" (toast)
```

## Testing Scenarios

### ✅ Valid Reschedules (Should Work)

| From | To | Status |
|------|----|----|
| Mon 2 PM | Tue 10 AM | ✅ Works |
| Wed 9 AM | Wed 6 PM | ✅ Works |
| Thu 12 PM | Fri 5 PM | ✅ Works |
| Sat 10 AM | Mon 3 PM | ✅ Works |

### ❌ Invalid Reschedules (Should Fail)

| From | To | Reason |
|------|----|----|
| Mon 2 PM | Sun 3 PM | Sunday (closed) |
| Mon 2 PM | Mon 8 AM | Before 9 AM |
| Mon 2 PM | Tue 8 PM | After 7 PM (19:00) |
| Mon 2 PM | Sat 7:30 PM | After 7 PM |

### Edge Cases

**Case 1: Appointment at 6 PM**
- Can reschedule until 6:59 PM (still within 19:00 hour)
- Cannot reschedule to 7:00 PM or later (hours >= 19)

**Case 2: Appointment at 9:00 AM**
- Can reschedule (hours === 9)
- Is valid

**Case 3: Appointment at 8:59 AM**
- Cannot reschedule (hours < 9)
- Shows error

**Case 4: Saturday Evening**
- Can reschedule to Sat 6 PM (not Sunday)
- Cannot reschedule to Sun any time

## Files Modified

1. **`src/components/calendar/AppointmentDialogs.tsx`** (UPDATED)
   - Added date/time picker inputs
   - Added business hours validation function
   - Added error message display
   - Disabled "Review changes" button when invalid

2. **`src/app/api/calendar/reschedule/route.ts`** (UPDATED)
   - Added server-side business hours validation
   - Returns 400 with error codes

3. **`src/app/(admin)/calendar/page-client.tsx`** (UPDATED)
   - Added drag handler validation
   - Shows toast messages for invalid drags

4. **`src/lib/services/booking-service.ts`** (UPDATED)
   - Added booking time validation
   - Prevents booking outside hours

5. **`BUSINESS_HOURS.md`** (NEW)
   - Documentation of validation rules

6. **`RESCHEDULE_APPOINTMENT.md`** (NEW)
   - Original reschedule documentation

## Configuration

To change business hours, update all four locations:

```typescript
// Currently hardcoded as:
BUSINESS_HOURS = {
  START_HOUR: 9,      // 9 AM
  END_HOUR: 19,       // 7 PM (exclusive)
  CLOSED_DAYS: [0],   // Sunday
};
```

### Future: Make Configurable
```typescript
// src/lib/business-config.ts
export const BUSINESS_HOURS = {
  START_HOUR: 9,
  END_HOUR: 19,
  CLOSED_DAYS: [0],
};

// Then import in all validation places:
import { BUSINESS_HOURS } from "@/lib/business-config";
```

## Troubleshooting

### "Reschedule button doesn't work"
1. Check appointment status is not "completed" or "cancelled"
2. Verify RescheduleModal is being rendered
3. Check browser console for JavaScript errors

### "Modal opens but shows same time"
- This is correct! The modal initializes with current appointment time
- User must change the date/time using the pickers

### "Can reschedule to invalid time"
- Verify all 4 validation layers are in place
- Check browser console for API errors
- Check server logs for validation failures

### "Drag doesn't show error"
- Verify drag handler has toast.error() calls
- Check that toast is imported
- Verify drag listener is active

### "API accepts invalid time"
- Verify .env.local has correct timezone info
- Check server is using correct timezone
- Verify Date parsing is correct

## Success Indicators

✅ Modal opens with date/time pickers pre-filled
✅ Selecting Sunday shows red error message
✅ Selecting 8 AM shows red error message
✅ Selecting 7 PM shows red error message
✅ Valid time shows green preview
✅ "Review changes" button disabled for invalid times
✅ Dragging to Sunday shows toast error
✅ Dragging to outside hours shows toast error
✅ Can confirm valid reschedule
✅ Toast shows success message
✅ Calendar updates with new time
✅ Google Calendar synced (check via web)
