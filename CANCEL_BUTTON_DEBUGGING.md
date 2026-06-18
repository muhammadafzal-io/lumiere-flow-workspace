# Cancel Button Debugging Guide

## If the Cancel Button Isn't Working

Follow these steps to diagnose the issue:

### Step 1: Open Browser DevTools

1. Press `F12` or right-click → "Inspect"
2. Go to **Console** tab
3. Look for any error messages starting with `[Cancel]`

### Step 2: Try to Cancel an Appointment

1. Click "Cancel" on any appointment
2. Select a cancellation reason
3. Click "Next"
4. Click "Cancel appointment"
5. Check the Console for logs

### Step 3: Check Console Logs

**Good scenario (should see these logs):**

```
[Cancel] Sending delete request for appointment: abc123def456
[Cancel] API Response status: 200
[Cancel] Success response: {ok: true, eventId: "abc123def456", ...}
```

**Problem scenario (errors):**

```
[Cancel] Sending delete request for appointment: undefined
→ Issue: Appointment ID is missing

[Cancel] API Response status: 400
[Cancel] API Error: {error: "eventId is required", code: "MISSING_EVENT_ID"}
→ Issue: Not sending eventId to API

[Cancel] API Response status: 404
[Cancel] API Error: {error: "Appointment not found..."}
→ Issue: Event already deleted or wrong ID format

[Cancel] API Response status: 500
[Cancel] API Error: {error: "Failed to cancel appointment"}
→ Issue: Google Calendar API error (see details below)
```

### Step 4: Network Tab Debugging

1. Open DevTools → **Network** tab
2. Try to cancel again
3. Look for a request called `cancel` or `DELETE`
4. Click on it to see:
   - **Request body**: Should show `{"eventId": "actual_event_id"}`
   - **Response**: Should show `{"ok": true}` or error details

**If no DELETE request appears:**

- The confirm button might not be wired correctly
- Check that `onClick={confirm}` is on the button

### Step 5: Check Appointment Data

In the browser console, run:

```javascript
// Check if appointment has an ID
localStorage.getItem("lumiere.appointments");
```

Look for appointments in the JSON. Each should have an `id` field:

```json
{
  "id": "abc123def456",  // ← Should be present
  "customer_id": "...",
  "treatment": "Botox",
  ...
}
```

If `id` is missing or empty → **Problem: Appointment IDs not being set**

### Step 6: Verify Google Calendar Integration

1. Check `.env.local` has these variables:

   ```
   GOOGLE_SERVICE_ACCOUNT_JSON={"type": "service_account", ...}
   GOOGLE_CALENDAR_ID=your-calendar-id@group.calendar.google.com
   ```

2. If missing → API calls will fail

### Common Issues & Fixes

#### Issue 1: "Failed to cancel appointment"

**Cause**: Google Calendar API error

**Fix**:

1. Check `.env.local` for correct credentials
2. Verify the event exists in Google Calendar
3. Check the event ID format (should be alphanumeric, often 26 chars)

#### Issue 2: "Appointment not found"

**Cause**: Event already deleted or ID mismatch

**Fix**:

1. Make sure the appointment wasn't deleted already
2. Verify the `id` field matches actual Google Calendar event ID
3. Check the appointment details in localStorage

#### Issue 3: Button doesn't respond (no logs in console)

**Cause**: onClick handler not wired or button disabled

**Fix**:

1. Check browser console for JavaScript errors
2. Verify button doesn't have `disabled={true}`
3. Check that `cancelling` state isn't stuck as `true`

#### Issue 4: Modal closes but appointment not deleted

**Cause**: Local store updated but Google Calendar not deleted

**Fix**:

1. Check Google Calendar directly (should see event gone)
2. If event still there → API call succeeded but event still exists
3. Try refreshing the page and cancelling again
4. Check Google Calendar's Trash for the event

### Step 7: Enable Debug Mode

Add this to the beginning of the `confirm` function to see more details:

```typescript
const confirm = async () => {
  console.log("[Cancel Debug] Step:", step);
  console.log("[Cancel Debug] Appointment:", appointment);
  console.log("[Cancel Debug] Customer:", customer);
  // ... rest of function
};
```

### Step 8: Test the API Directly

In browser console, test the API manually:

```javascript
// Test the cancel API
fetch("/api/calendar/cancel", {
  method: "DELETE",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    eventId: "PASTE_ACTUAL_EVENT_ID_HERE",
  }),
})
  .then((r) => r.json())
  .then((d) => console.log("Response:", d))
  .catch((e) => console.error("Error:", e));
```

**Expected response:**

```json
{
  "ok": true,
  "eventId": "...",
  "message": "Cancelled: ..."
}
```

### Step 9: Check for Network Issues

1. Are you offline? → Cancel will fail
2. Is the API responding slowly? → Might timeout
3. Is there a CORS issue? → Would see error in console

### Step 10: Force Refresh

Sometimes the issue is just stale code:

1. Close all tabs with the app
2. Press `Ctrl + Shift + Delete` to clear cache
3. Reopen the app
4. Try cancelling again

## Checklist for Debugging

- [ ] Opened DevTools Console
- [ ] Clicked Cancel and checked for `[Cancel]` logs
- [ ] Verified appointment has an `id` field
- [ ] Checked `.env.local` has Google credentials
- [ ] Tested API directly via console fetch
- [ ] Checked Network tab for DELETE request
- [ ] Verified event exists in Google Calendar
- [ ] Cleared browser cache and retried
- [ ] Checked for JavaScript errors in console

## If Still Not Working

Run this diagnostic script in the browser console:

```javascript
// Copy this entire block into the console
(async function diagnose() {
  console.log("=== Cancel Button Diagnostic ===");

  // Check 1: LocalStorage appointments
  const appts = JSON.parse(localStorage.getItem("lumiere.appointments") || "[]");
  console.log(`Appointments in store: ${appts.length}`);
  if (appts.length > 0) {
    const appt = appts[0];
    console.log(`First appointment ID: ${appt.id || "MISSING"}`);
    console.log(`First appointment:`, appt);
  }

  // Check 2: Try a test API call
  console.log("\nTesting API endpoint...");
  if (appts.length > 0 && appts[0].id) {
    try {
      const res = await fetch("/api/calendar/cancel", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: appts[0].id }),
      });
      const data = await res.json();
      console.log(`API Status: ${res.status}`);
      console.log(`API Response:`, data);
    } catch (e) {
      console.error("API Test Error:", e);
    }
  }

  console.log("=== End Diagnostic ===");
})();
```

This will show:

- Whether appointments have IDs
- Whether the API is reachable
- What error the API returns

## Report Issues With These Details

When reporting the issue, include:

1. Console logs (screenshot or copy-paste)
2. Network request details (Request body + Response)
3. Appointment ID from localStorage
4. Whether Google Calendar credentials are set
5. Expected behavior vs actual behavior

Example bug report:

```
**Problem**: Cancel button not working

**Steps to reproduce**:
1. Open appointment
2. Click "Cancel"
3. Select reason and click "Next"
4. Click "Cancel appointment"

**Expected**: Appointment deleted

**Actual**: Nothing happens, no error in console

**Console logs**:
[Cancel] Sending delete request for appointment: undefined

**Issue**: Appointment ID is undefined
```
