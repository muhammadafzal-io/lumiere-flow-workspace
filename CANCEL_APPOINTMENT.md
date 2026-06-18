# Cancel Appointment Flow

## Overview

The appointment cancellation flow has been improved to:

- Delete from Google Calendar (not just mark as cancelled locally)
- Require explicit confirmation (two-step process)
- Notify client with customizable message
- Provide proper error handling and loading states
- Preserve audit trail of cancellations

## User Flow

### Step 1: Select Cancellation Reason

1. Admin clicks "Cancel" on an appointment
2. Modal opens with appointment details
3. Admin selects reason from dropdown:
   - Client requested
   - Clinic conflict
   - Practitioner unavailable
   - No-show
   - Other
4. Message auto-populates based on reason
5. Admin can customize the message
6. Toggle "Send cancellation message" to client (default: ON)
7. Click "Next" to proceed to confirmation

### Step 2: Confirm Cancellation

1. Modal shows warning: "This action cannot be undone"
2. Shows which message will be sent to client (if enabled)
3. Admin clicks "Cancel appointment" to confirm
4. System:
   - Deletes event from Google Calendar
   - Updates local store status to "cancelled"
   - Adds cancellation reason to appointment notes
   - Sends WhatsApp/SMS notification to client (if enabled)
   - Shows success toast
5. Modal closes, calendar updates immediately

## API Endpoint

### DELETE /api/calendar/cancel

**Request:**

```json
{
  "eventId": "google_event_id_123"
}
```

**Response (Success):**

```json
{
  "ok": true,
  "eventId": "google_event_id_123",
  "message": "Cancelled: Botox appointment"
}
```

**Response (Error - Not Found):**

```json
{
  "error": "Appointment not found (may have been deleted already)",
  "code": "NOT_FOUND"
}
```

**Response (Error - System):**

```json
{
  "error": "Failed to cancel appointment",
  "code": "CANCEL_ERROR"
}
```

## Cancellation Messages

Messages are dynamically generated based on cancellation reason:

| Reason                   | Message Template                                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client requested         | "Hi [name] — confirming we've cancelled your appointment. Thank you for letting us know — we'll be here whenever you're ready to rebook."                                                                           |
| Clinic conflict          | "Hi [name] — so sorry, we've had to cancel your [treatment] due to a clinic conflict. We'd love to offer you a priority slot to rebook — tap here to choose a new time."                                            |
| Practitioner unavailable | "Hi [name] — your [treatment] has been cancelled because your practitioner is no longer available. We can rebook you with another team member or with the same practitioner next week. Reply with your preference." |
| No-show                  | "Hi [name] — we missed you today. No worries — tap here to rebook in one tap."                                                                                                                                      |
| Other                    | "Hi [name] — your appointment has been cancelled. Reach out any time to schedule a new visit."                                                                                                                      |

Admin can customize the message before sending.

## Data Changes

When an appointment is cancelled:

### Google Calendar

- Event is **deleted** from the clinic's calendar
- Cannot be recovered through the UI (must restore from trash in Google Calendar if needed)

### Local Store

```typescript
{
  ...appointment,
  status: "cancelled",
  notes: `${original_notes}\nCancelled: ${reason}`
}
```

### Activity Log

If notification is sent:

```typescript
{
  id: "a_cancel_<timestamp>",
  timestamp: "2026-06-15T15:30:00Z",
  customer_id: "customer_id",
  rule_id: "manual",
  channel: "WhatsApp",
  message_body: "Hi Sofia — confirming we've cancelled...",
  status: "Sent",
  kind: "cancellation_notification"
}
```

## Technical Details

### State Management

```typescript
const [reason, setReason] = useState<string>("Client requested");
const [notify, setNotify] = useState(true);
const [msg, setMsg] = useState("");
const [cancelling, setCancelling] = useState(false); // Loading state
const [step, setStep] = useState<"reason" | "confirm">("reason"); // Two-step flow
```

### Process Flow

```
CancelModal Opens
    ↓
Step 1: Reason Selection
  - Show appointment details
  - Dropdown with cancellation reasons
  - Message preview (auto-populated)
  - Notification toggle
  - "Next" button
    ↓
Step 2: Confirmation
  - Show warning message
  - Confirm to proceed
  - "Cancel appointment" button (loading state)
    ↓
API Call: DELETE /api/calendar/cancel
  ├─ Delete from Google Calendar
  ├─ Update local store (status = "cancelled")
  ├─ Send notification (if enabled)
  └─ Show success toast
    ↓
Modal Closes
Calendar Updates
```

### Error Handling

**Google Calendar Errors:**

- If event not found (already deleted): Show helpful message
- If API fails: Show generic error with retry suggestion

**Network Errors:**

- Toast shows error message
- User can try again
- No partial state (transaction-like behavior)

## UX Improvements

### Safety Features

✅ **Two-step confirmation** - Prevents accidental cancellations
✅ **Clear warnings** - "This action cannot be undone"
✅ **Loading state** - Shows progress with spinner
✅ **Proper error messages** - User knows what went wrong

### User Comfort

✅ **Customizable messages** - Admin can adjust tone
✅ **Reason-based templates** - Saves time, improves consistency
✅ **Back button** - Can edit reason before confirming
✅ **Success feedback** - Toast confirms cancellation

### Data Integrity

✅ **Deletes from source** - Google Calendar is single source of truth
✅ **Audit trail** - Cancellation reason stored in notes
✅ **Activity log** - Track what was communicated to client
✅ **No orphaned data** - Local store syncs with Google Calendar

## Testing Checklist

- [ ] Click "Cancel" on an appointment
- [ ] Modal shows appointment details correctly
- [ ] Select each reason and verify message updates
- [ ] Toggle notification on/off
- [ ] Edit message text
- [ ] Click "Next" to go to confirmation step
- [ ] Click "Back" to return to reason selection
- [ ] Click "Cancel appointment" to delete
- [ ] Verify appointment removed from calendar
- [ ] Check Google Calendar directly (event should be gone)
- [ ] Verify notification sent (check client's WhatsApp if enabled)
- [ ] Try cancelling already-deleted appointment (should handle gracefully)
- [ ] Try cancelling while offline (should show error)

## Edge Cases Handled

### 1. Appointment Already Deleted

- Another admin deleted it before this one completed
- API returns 404
- Message: "Appointment not found (may have been deleted already)"
- No error toast, info message instead

### 2. Network Error During Cancellation

- Delete fails, no local state change
- Toast shows error
- User can retry
- No partial cancellation

### 3. Notification Disabled

- No WhatsApp sent to client
- Cancellation still processed
- Toast confirms: "Appointment cancelled."

### 4. Modal Closed Mid-cancellation

- `cancelling` state prevents button clicks
- User must wait for operation to complete
- Prevents race conditions

## Future Enhancements

- [ ] **Undo cancellation** - Restore deleted appointment within 24 hours
- [ ] **Automated rebooking** - Offer client alternative times
- [ ] **Cancellation analytics** - Track why appointments are cancelled
- [ ] **Bulk cancellation** - Cancel multiple appointments at once
- [ ] **Cancellation policies** - Different rules based on timing
- [ ] **Refund integration** - Process refunds automatically

## Architecture

### Components

- **CancelModal** - Main UI component
  - State management for multi-step flow
  - API integration
  - Error handling

### API

- **DELETE /api/calendar/cancel** - Deletes from Google Calendar
  - Authentication required (future)
  - Validates event exists before deletion
  - Returns clear error messages

### Data Flow

```
CancelModal State Changes
    ↓
User Confirms (Step 2)
    ↓
API: DELETE /api/calendar/cancel
    ↓
Google Calendar Event Deleted
    ↓
Local Store Updated
    ↓
Activity Log Entry Created
    ↓
Toast Notification
    ↓
Modal Closes
    ↓
Calendar Component Refreshes
```
