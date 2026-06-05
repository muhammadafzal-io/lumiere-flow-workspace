# Booking Best Practices & Implementation Guide

## User Story Implementation

**User Story:** "A client can book an appointment based on available practitioners and room capacity. A chatbot helps the client book appointments based on room and doctor capacity using shared database."

## What We Implemented

### ✅ Unified Booking Service
- **Single source of truth** for all booking logic
- Used by both admin UI and chatbot
- Eliminates code duplication and inconsistency

### ✅ Room Availability Checking
- Rooms are managed in Settings → Rooms tab
- Configurable via `CLINIC_ROOMS` environment variable
- Dynamic availability per time slot

### ✅ Practitioner Availability Checking
- Practitioners pulled from Google Calendar event metadata
- Each slot shows which practitioners are available
- Conflict detection prevents double-booking same practitioner

### ✅ Smart Conflict Detection
- Prevents booking: same room + same practitioner at same time
- Allows: different practitioners in same room
- Allows: same practitioner in different rooms
- Conservative handling of legacy events (blocks everything)

### ✅ Intelligent Auto-Selection
- Chatbot can book without specifying room/practitioner
- System automatically picks first available option
- `suggestSlot()` function makes smart recommendations

## Architecture Decisions

### 1. Why Google Calendar for Room Bookings?

**Pros:**
- ✓ Already real-time source of truth for appointments
- ✓ No separate database needed
- ✓ Metadata stored in event descriptions (room, practitioner)
- ✓ Easy to audit (visible in Google Calendar directly)
- ✓ Multi-device sync (admin sees updates in real-time)

**Cons:**
- ✗ Metadata parsing is string-based (fragile)
- ✗ No transactions (race condition risk at 100% load)
- ✗ Limited filtering (must fetch all events then filter locally)

**Mitigation:**
- Structured metadata format (prefix-based: "Room: ", "Practitioner: ")
- Always validate before booking (re-check at book time)
- Comprehensive error messages for conflicts

### 2. Why Separate Booking Service?

**Problem:** Admin UI and chatbot had different booking logic
- Admin: `bookAdminAppointment()` with room+practitioner validation
- Chatbot: `createAppointment()` without any validation

**Solution:** `booking-service.ts` wraps both with unified interface
- Single contract for all callers
- Easy to change implementation (e.g., switch to Supabase)
- Testable in isolation

### 3. Why Add Room to Settings?

**Problem:** Rooms were hardcoded to ["Room 1", "Room 2"]
**Solution:** Admin can manage rooms without code changes

**Flow:**
```
Settings → Rooms tab → Add/Remove rooms → Persisted to API
```

**Current Implementation:** In-memory storage
**Production:** Should persist to database + environment variable

## Integration Checklist

### For Admin UI
- [x] NewAppointmentModal fetches available slots
- [x] Room dropdown shows only available rooms for selected time
- [x] Booking validates room+practitioner availability
- [x] Error messages are helpful (suggests available times)

### For Chatbot
- [x] `check_availability` returns available rooms+practitioners
- [x] `book_appointment` validates room+practitioner before booking
- [x] Auto-selects room/practitioner if client doesn't specify
- [x] Agent tool descriptions updated with room/practitioner docs

### For Room Management
- [x] Settings UI to add/remove rooms
- [x] Environment variable to pre-configure rooms
- [x] API endpoint to get/update room list
- [x] Documentation on room naming conventions

## Code Usage Examples

### Admin UI Booking
```typescript
// 1. Check availability (automatic in useEffect)
GET /api/calendar/slots?date=2026-06-15&practitioners=Dr.+Sofia&duration=60

// Response includes availableRooms
{
  slots: [
    {
      startTime: "...",
      availableRooms: ["Room 1", "Room 2"]
    }
  ]
}

// 2. UI shows only available rooms
<Select value={room} onValueChange={setRoom}>
  {availableRooms.map(r => <SelectItem>{r}</SelectItem>)}
</Select>

// 3. User books
POST /api/calendar/book {
  clientName: "Sofia",
  treatment: "Botox",
  startTime: "...",
  endTime: "...",
  practitionerName: "Dr. Sofia",
  room: "Room 1"
}
```

### Chatbot Booking
```typescript
// 1. Check availability
const availability = await executeTool("check_availability", {
  date: "2026-06-15",
  duration_minutes: 60
});

// Returns: { slots, availablePractitioners, availableRooms }

// 2. Agent suggests slot to client
"I found 5 slots on Jun 15. Available with: Dr. Sofia, Maya (practitioners) and Room 1, Room 2."

// 3. Client confirms
"Book me with Dr. Sofia in Room 1 at 10 AM"

// 4. Agent books
await executeTool("book_appointment", {
  client_name: "Sofia Reyes",
  treatment: "Botox",
  date_time: "2026-06-15T10:00:00Z",
  duration_minutes: 60,
  client_contact: "+1-512-555-0101",
  practitioner_name: "Dr. Sofia",
  room: "Room 1"
});

// If practitioner_name/room omitted, system auto-selects
```

## Performance Considerations

### Slot Fetching
**Current:** Fetches all events in business hours (9 AM - 7:30 PM)
**Complexity:** O(n) where n = events on date
**Optimization:** Google Calendar API batching for multiple dates

### Conflict Detection
**Current:** Scans all events, checks for time overlap + room conflict
**Complexity:** O(n) per booking attempt
**Optimization:** Add caching if same date checked repeatedly

### Room Dropdown Updates
**Current:** Refetches on every date/practitioner/treatment change
**Complexity:** 3 API calls per modal interaction
**Optimization:** Combine into single request with filters

## Common Issues & Solutions

### Issue: "Room X is not available"
**Cause:** Room booked but `availableRooms` still showed it
**Root:** Race condition between API response and user click
**Solution:** Always validate at book time (✓ already implemented)

### Issue: Chatbot books wrong practitioner
**Cause:** Agent called `book_appointment` without calling `check_availability` first
**Solution:** System can't know which practitioner is available
**Prevention:** Update agent system prompt to enforce check first

### Issue: Old legacy events blocking all slots
**Cause:** Event without room/practitioner metadata = blocks everything
**Solution:** Edit old events to add "Room: " and "Practitioner: " to description

## Testing

### Unit Tests Needed
```typescript
// test/booking-service.test.ts
- checkAvailability returns empty slots for past dates
- checkAvailability filters by practitioner correctly
- checkAvailability filters by room correctly
- bookAppointment throws if room not in availableRooms
- bookAppointment throws if practitioner not in availablePractitioners
- suggestSlot returns first available slot
- suggestSlot respects preferences
```

### Integration Tests Needed
```typescript
// test/booking-flow.test.ts
- Admin UI flow: check → select → book
- Chatbot flow: check → suggest → book
- Edge case: only 1 room available
- Edge case: only 1 practitioner available
- Race condition: concurrent bookings for same room
```

### Manual Testing
1. **Admin UI**
   - Create new appointment
   - Verify room dropdown updates as you change date/practitioner
   - Try to book same room+practitioner twice (should fail)
   - Try to book with conflicting time (should fail)

2. **Chatbot**
   - Chat: "Book me Botox next Monday"
   - Verify it suggests available practitioners and rooms
   - Chat: "Confirm 10 AM with Dr. Sofia in Room 1"
   - Verify appointment created in Google Calendar

3. **Room Management**
   - Go to Settings → Rooms
   - Add a new room (e.g. "Laser Suite")
   - Try to book in that room
   - Verify it appears in availability checks

## Security Considerations

### Authentication
- ✓ API routes should check auth (not implemented yet)
- ✓ Only authenticated users can book/check availability

### Data Validation
- ✓ Room names validated (no special chars)
- ✓ Date format validated (YYYY-MM-DD)
- ✓ ISO 8601 timestamps validated

### Rate Limiting
- ✗ Not implemented
- Consider: max 1 booking per minute per user

## Future Improvements

### Phase 2: Advanced Features
- [ ] **Room Capacity** - multiple clients in same room simultaneously
- [ ] **Practitioner Specialization** - only Dr. Sofia does Botox
- [ ] **Room Features** - which rooms have lasers, etc
- [ ] **Treatment Routing** - auto-assign room based on treatment type
- [ ] **Buffer Time** - 15-min recovery between appointments
- [ ] **Preferred Slots** - ML-based recommendations

### Phase 3: Optimization
- [ ] Cache availability for frequently-checked dates
- [ ] Batch availability checks for week view
- [ ] Async booking with webhooks
- [ ] Supabase audit logging for compliance

## Documentation References

- **BOOKING_ARCHITECTURE.md** - Detailed technical design
- **ROOM_SETUP.md** - Room configuration guide
- **src/lib/services/booking-service.ts** - Service implementation
- **src/lib/agent/index.ts** - Agent tool implementation
- **src/app/api/calendar/book/route.ts** - API endpoint
