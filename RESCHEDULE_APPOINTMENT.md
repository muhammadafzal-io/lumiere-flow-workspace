# Reschedule Appointment Flow

## Overview

The reschedule appointment flow has been improved to:
- Update Google Calendar with the new appointment time
- Require explicit confirmation (two-step process)
- Notify client with customizable message
- Provide proper error handling and loading states
- Preserve audit trail of rescheduling

## User Flow

### Step 1: Review Changes
1. Admin drags appointment to new time or clicks "Reschedule"
2. Modal opens showing:
   - Original appointment details
   - New date and time
3. Admin can:
   - Toggle "Send notification" (default: ON)
   - View/edit notification message
4. Click "Review changes" to proceed to confirmation

### Step 2: Confirm Reschedule
1. Modal shows warning: "Reschedule will update the calendar"
2. Shows which message will be sent to client (if enabled)
3. Admin clicks "Confirm reschedule"
4. System:
   - Updates event in Google Calendar
   - Updates local store with new times
   - Sends notification to client (if enabled)
   - Shows success toast
5. Modal closes, calendar updates immediately

## API Endpoint

### PATCH /api/calendar/reschedule

**Request:**
```json
{
  "eventId": "google_event_id_123",
  "newStartTime": "2026-06-15T15:00:00Z",
  "newEndTime": "2026-06-15T16:00:00Z"
}
```

**Response (Success):**
```json
{
  "ok": true,
  "eventId": "google_event_id_123",
  "oldStartTime": "2026-06-15T14:00:00Z",
  "newStartTime": "2026-06-15T15:00:00Z",
  "message": "Rescheduled: Botox appointment"
}
```

**Response (Error - Not Found):**
```json
{
  "error": "Appointment not found (may have been deleted)",
  "code": "NOT_FOUND"
}
```

**Response (Error - System):**
```json
{
  "error": "Failed to reschedule appointment",
  "code": "RESCHEDULE_ERROR"
}
```

## Default Message

Auto-generated based on appointment details:
```
Hi [first_name] — Sofia here from Lumière. We've moved your [treatment] to 
[day], [date] at [time]. The new confirmation link is below. Let me know if 
this doesn't work for you.
```

Admin can customize the message before sending.

## Data Changes

When an appointment is rescheduled:

### Google Calendar
- Event is **updated** with new start/end times
- Event summary and description remain unchanged
- All attendees see the updated time

### Local Store
```typescript
{
  ...appointment,
  start_time: newStartTime,
  end_time: newEndTime
}
```

### Activity Log
If notification is sent:
```typescript
{
  id: "a_resch_<timestamp>",
  timestamp: "2026-06-15T15:30:00Z",
  customer_id: "customer_id",
  rule_id: "manual",
  channel: "WhatsApp",
  message_body: "Hi Sofia — Sofia here from Lumière...",
  status: "Sent",
  kind: "reschedule_notification"
}
```

## Technical Details

### State Management
```typescript
const [notify, setNotify] = useState(true);
const [msg, setMsg] = useState(defaultMsg);
const [showMsg, setShowMsg] = useState(false);
const [rescheduling, setRescheduling] = useState(false);  // Loading state
const [step, setStep] = useState<"review" | "confirm">("review");
```

### Process Flow
```
Reschedule Dragged/Selected
    ↓
Step 1: Review Changes
  - Show original vs new times
  - Toggle notification
  - Edit message (optional)
  - "Review changes" button
    ↓
Step 2: Confirm
  - Show warning message
  - Confirm to proceed
  - "Confirm reschedule" button (loading state)
    ↓
API Call: PATCH /api/calendar/reschedule
  ├─ Update Google Calendar
  ├─ Update local store
  ├─ Send notification (if enabled)
  └─ Show success toast
    ↓
Modal Closes
Calendar Updates Immediately
```

### Error Handling

**Google Calendar Errors:**
- If event not found (already deleted): 404 - Show helpful message
- If API fails: 500 - Show generic error with retry suggestion

**Network Errors:**
- Toast shows error message
- User can try again
- No partial state (transaction-like behavior)

## UX Improvements

### Safety Features
✅ **Two-step confirmation** - Prevents accidental rescheduling
✅ **Clear warnings** - Shows impact of reschedule
✅ **Loading state** - Shows progress with spinner
✅ **Proper error messages** - User knows what went wrong

### User Comfort
✅ **Customizable messages** - Admin can adjust tone
✅ **Auto-generated templates** - Saves time
✅ **Back button** - Can edit details before confirming
✅ **Success feedback** - Toast confirms reschedule

### Data Integrity
✅ **Updates source** - Google Calendar is single source of truth
✅ **Audit trail** - Rescheduling tracked in activity log
✅ **Notification tracking** - Know when client was notified
✅ **Customer matching** - Works even if customer not in system

## Testing Checklist

- [ ] Click "Reschedule" or drag appointment to new time
- [ ] Modal shows original and new times correctly
- [ ] Select each notification option (on/off)
- [ ] Edit message text
- [ ] Click "Review changes" to go to confirmation step
- [ ] Click "Back" to return to review step
- [ ] Click "Confirm reschedule" to save
- [ ] Verify appointment moved in calendar
- [ ] Check Google Calendar directly (time should be updated)
- [ ] Verify notification sent (check client's WhatsApp if enabled)
- [ ] Try rescheduling already-deleted appointment (should handle gracefully)
- [ ] Try rescheduling while offline (should show error)

## Edge Cases Handled

### 1. Appointment Already Deleted
- Another admin deleted it before this one completed
- API returns 404
- Message: "Appointment not found (may have been deleted)"
- No error toast, info message instead

### 2. Network Error During Reschedule
- Update fails, no local state change
- Toast shows error
- User can retry
- No partial reschedule

### 3. Notification Disabled
- No WhatsApp sent to client
- Reschedule still processed
- Toast confirms: "Appointment rescheduled."

### 4. Modal Closed Mid-reschedule
- `rescheduling` state prevents button clicks
- User must wait for operation to complete
- Prevents race conditions

### 5. Customer Not in System
- Works even without customer record in app
- Uses clientName from appointment
- Activity log only created if customer found

## Future Enhancements

- [ ] **Conflict detection** - Warn if new time overlaps with other appointments
- [ ] **Undo reschedule** - Restore to previous time within 24 hours
- [ ] **Bulk reschedule** - Move multiple appointments at once
- [ ] **Auto-suggestion** - Suggest next available slot
- [ ] **Reason tracking** - Log why appointment was rescheduled
- [ ] **Client confirmation** - Wait for client to confirm new time

## Architecture

### Components
- **RescheduleModal** - Main UI component
  - State management for two-step flow
  - API integration
  - Error handling

### API
- **PATCH /api/calendar/reschedule** - Updates Google Calendar
  - Validates event exists before updating
  - Returns clear error messages

### Data Flow
```
User Reschedules
    ↓
RescheduleModal State Changes
    ↓
User Confirms (Step 2)
    ↓
API: PATCH /api/calendar/reschedule
    ↓
Google Calendar Updated
    ↓
Local Store Updated
    ↓
Activity Log Created
    ↓
Toast Notification
    ↓
Modal Closes
    ↓
Calendar Component Refreshes
```

## Comparison: Reschedule vs Cancel

| Aspect | Reschedule | Cancel |
|--------|-----------|--------|
| **Steps** | 2 (review + confirm) | 2 (reason + confirm) |
| **API Method** | PATCH | DELETE |
| **Event Status** | Updated time | Deleted from calendar |
| **Reversibility** | Manual undo only | Trash recovery available |
| **Notification** | Shows new time | Explains cancellation |
| **Use Case** | Time conflict, client request | No-show, clinic issue |