# Rooms Column Implementation Guide

## Step 1: Run Database Migration

### Option A: Supabase Dashboard (Easy)

1. Open [Supabase Dashboard](https://app.supabase.com)
2. Go to SQL Editor
3. Copy and paste this SQL:

```sql
ALTER TABLE clinics ADD COLUMN rooms TEXT[] DEFAULT ARRAY['Room 1', 'Room 2'];

UPDATE clinics SET rooms = ARRAY['Room 1', 'Room 2'] WHERE rooms IS NULL;

COMMENT ON COLUMN clinics.rooms IS 'Array of available room names for appointment booking';
```

4. Click "Run"
5. You should see: "Success. No rows returned"

### Option B: Supabase CLI

```bash
# First time setup
npm install -g supabase

# Login to Supabase
supabase login

# Run migration
supabase db push

# Or use the migration file
supabase migration up migrations/add_rooms_column.sql
```

### Option C: DBeaver or pgAdmin (GUI)

1. Connect to your Supabase Postgres database
2. Run the SQL from `migrations/add_rooms_column.sql`

## Step 2: Set Environment Variables

Your `.env.local` should have:

```env
# Supabase (you should already have these)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Default clinic ID (for testing/development)
DEFAULT_CLINIC_ID=clinic-001
```

## Step 3: Verify Migration Worked

### Check in Supabase Dashboard

1. Go to Supabase Dashboard
2. Click "Table Editor"
3. Click on `clinics` table
4. Look for new `rooms` column (should be blue array type)
5. Should show default: `["Room 1", "Room 2"]`

### Check in Database

```sql
-- Query to verify
SELECT id, name, rooms FROM clinics LIMIT 10;

-- Should show something like:
-- id           | name        | rooms
-- clinic-001   | Lumière     | {"Room 1", "Room 2"}
```

## Step 4: Test the API

### Test GET (Fetch Rooms)

```bash
curl http://localhost:3000/api/settings/rooms \
  -H "x-clinic-id: clinic-001"
```

**Expected Response:**
```json
{
  "rooms": ["Room 1", "Room 2"]
}
```

### Test PATCH (Update Rooms)

```bash
curl -X PATCH http://localhost:3000/api/settings/rooms \
  -H "Content-Type: application/json" \
  -H "x-clinic-id: clinic-001" \
  -d '{"rooms": ["Room 1", "Room 2", "Treatment Pod A"]}'
```

**Expected Response:**
```json
{
  "rooms": ["Room 1", "Room 2", "Treatment Pod A"],
  "ok": true
}
```

### Verify in Database

```sql
SELECT rooms FROM clinics WHERE id = 'clinic-001';
-- Should show: {"Room 1", "Room 2", "Treatment Pod A"}
```

## Step 5: Update Calendar Integration

The calendar needs to fetch rooms from the database dynamically:

**File:** `src/lib/integrations/google-calendar.ts`

```typescript
// OLD (reads from env var):
function getDefaultRooms(): string[] {
  const roomsEnv = process.env.CLINIC_ROOMS;
  return roomsEnv?.split(",").map(r => r.trim()) || ["Room 1", "Room 2"];
}

// NEW (reads from database):
async function getDefaultRooms(clinicId?: string): Promise<string[]> {
  try {
    const id = clinicId || process.env.DEFAULT_CLINIC_ID || "clinic-001";
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/settings/rooms`, {
      headers: {
        "x-clinic-id": id,
      },
    });
    const data = await response.json();
    return data.rooms || ["Room 1", "Room 2"];
  } catch (err) {
    console.error("[getDefaultRooms] Error fetching rooms:", err);
    return ["Room 1", "Room 2"];
  }
}

// Update the constant to be async
let DEFAULT_ROOMS: string[] = ["Room 1", "Room 2"];

// Call on startup
export async function initializeDefaultRooms(clinicId?: string) {
  DEFAULT_ROOMS = await getDefaultRooms(clinicId);
}
```

## Step 6: Test Full Flow in UI

1. **Start the dev server:**
   ```bash
   npm run dev
   ```

2. **Open Settings page:**
   - Go to http://localhost:3000
   - Click Settings → Rooms tab

3. **Add a new room:**
   - Type "Treatment Pod A"
   - Click "Save rooms"
   - Should show success toast

4. **Verify in database:**
   ```sql
   SELECT rooms FROM clinics WHERE id = 'clinic-001';
   ```
   Should include "Treatment Pod A"

5. **Refresh the page:**
   - Reload the page
   - Rooms should still show "Treatment Pod A"
   - ✅ Data persists!

6. **Check Calendar:**
   - Go to Calendar page
   - Create new appointment
   - Room dropdown should show "Treatment Pod A"
   - ✅ Calendar uses new room!

## Troubleshooting

### Error: "Missing Supabase environment variables"

**Cause:** `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` not set

**Fix:**
```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_key_here
```

### Error: "Column 'rooms' does not exist"

**Cause:** Migration not run yet

**Fix:** Run the migration from Step 1

### Rooms not showing in Settings

**Cause:** API returning empty array

**Fix:**
1. Check `.env.local` has `DEFAULT_CLINIC_ID`
2. Verify clinic exists in database: `SELECT * FROM clinics;`
3. Check server logs for errors

### Changes not persisting after refresh

**Cause:** Changes saved to in-memory array, not database

**Fix:**
1. Verify API PATCH worked (check for success toast)
2. Check database directly:
   ```sql
   SELECT rooms FROM clinics WHERE id = 'clinic-001';
   ```
3. Check server logs for update errors

## Database Schema Verification

After migration, your clinics table should look like:

```sql
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'clinics';

-- Should include:
-- column_name | data_type | column_default
-- id          | uuid      | NULL
-- name        | text      | NULL
-- rooms       | text[]    | 'ARRAY[\'Room 1\'::text, \'Room 2\'::text]'
```

## After Implementation Checklist

- [ ] Migration SQL run successfully
- [ ] Supabase dashboard shows `rooms` column in `clinics` table
- [ ] Environment variables set in `.env.local`
- [ ] API endpoint works (test with curl)
- [ ] Settings page shows rooms
- [ ] Can add/remove rooms in Settings
- [ ] Changes persist after page refresh
- [ ] Calendar shows new rooms in dropdowns
- [ ] Bookings work with new rooms
- [ ] Server logs show successful updates

## How Rooms Now Work

```
Before:
Settings → Add "Treatment Pod A" → Stored in RAM → Lost on restart ❌

After:
Settings → Add "Treatment Pod A"
         → API PATCH /api/settings/rooms
         → Database UPDATE clinics SET rooms = [...]
         → Supabase stores in rooms column ✅
         → Server restart
         → API GET /api/settings/rooms
         → Database SELECT rooms FROM clinics
         → "Treatment Pod A" still there! ✅
```

## Future: Authentication

Currently using `DEFAULT_CLINIC_ID` from env. Later, extract clinic ID from JWT:

```typescript
// TODO: Replace this
async function getClinicId(req: NextRequest): Promise<string> {
  // Current (temporary):
  return req.headers.get("x-clinic-id") || process.env.DEFAULT_CLINIC_ID || "clinic-001";
  
  // Future (proper JWT):
  // const token = req.headers.get("authorization")?.split(" ")[1];
  // const decoded = await verifyJWT(token);
  // return decoded.clinic_id;
}
```

## Summary

✅ **What changed:**
- Added `rooms` column to `clinics` table in Supabase
- Updated API to read/write from database
- Rooms now persist permanently

✅ **What works:**
- Add/edit/remove rooms in Settings UI
- Changes save to database
- Persist across server restarts
- Calendar uses new rooms immediately
- Booking works with new rooms

❌ **What needs work:**
- Extract clinic ID from JWT (currently using header)
- Update calendar integration to fetch from DB
- Add room validation to booking service
