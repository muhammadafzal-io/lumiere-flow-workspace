# Debugging Rooms Update Error

## Error: "Failed to update rooms"

### Step 1: Check If Column Exists

First, verify the migration was run:

```bash
# Go to Supabase Dashboard → SQL Editor → Run this:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'clinics'
ORDER BY column_name;
```

**Look for:** A row with `column_name = 'rooms'` and `data_type = 'text[]'`

**If you DON'T see it:**

- The migration wasn't run
- Run this in Supabase SQL Editor:

```sql
ALTER TABLE clinics ADD COLUMN rooms TEXT[] DEFAULT ARRAY['Room 1', 'Room 2'];
```

---

### Step 2: Check Environment Variables

Make sure `.env.local` has:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
DEFAULT_CLINIC_ID=clinic-001
```

**How to find them:**

1. Go to Supabase Dashboard
2. Click "Settings" → "API"
3. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **Service Role secret** → `SUPABASE_SERVICE_ROLE_KEY`

---

### Step 3: Check If Clinic Exists

```sql
-- Go to Supabase SQL Editor and run:
SELECT id, name FROM clinics LIMIT 10;
```

**If you see no results:**

- No clinics exist yet
- You need to create one first
- Or use a different clinic ID in `.env.local`

**If you see results:**

- Copy a clinic ID
- Set it as `DEFAULT_CLINIC_ID` in `.env.local`
- Restart dev server

---

### Step 4: Run Diagnostic Check

Open your browser and go to:

```
http://localhost:3000/api/settings/rooms
```

**POST request to diagnose (use curl or Postman):**

```bash
curl -X POST http://localhost:3000/api/settings/rooms \
  -H "x-clinic-id: clinic-001"
```

**Expected response:**

```json
{
  "status": "ok",
  "clinic": {
    "id": "clinic-001",
    "name": "Lumière",
    "rooms": ["Room 1", "Room 2"]
  },
  "roomsColumnExists": true,
  "message": "Diagnostic data retrieved successfully"
}
```

**If you get an error:**

- Note the error message
- Check your environment variables again
- Make sure clinic ID exists

---

### Step 5: Check Server Logs

When trying to update, watch the terminal where you ran `npm run dev`:

```
[/api/settings/rooms] PATCH error: {
  message: "...",
  details: "...",
  hint: "...",
  code: "..."
}
```

**Common errors:**

#### Error: "column 'rooms' of relation 'clinics' does not exist"

- **Cause:** Migration not run
- **Fix:** Run migration in Supabase SQL Editor

#### Error: "relation 'clinics' does not exist"

- **Cause:** Wrong database or table name
- **Fix:** Verify table name is exactly `clinics` (lowercase)

#### Error: "permission denied for schema public"

- **Cause:** Service role key doesn't have permission
- **Fix:** Verify you're using `SUPABASE_SERVICE_ROLE_KEY`, not anon key

#### Error: "JWT expired" or "Invalid JWT"

- **Cause:** Service role key is invalid
- **Fix:** Get fresh key from Supabase Dashboard → Settings → API

---

### Step 6: Manual Database Update (Test)

Try updating the database directly to verify permissions:

```sql
-- Go to Supabase SQL Editor and run:
UPDATE clinics
SET rooms = ARRAY['Room 1', 'Room 2', 'Test Pod']::TEXT[]
WHERE id = 'clinic-001';

-- Then verify:
SELECT rooms FROM clinics WHERE id = 'clinic-001';
```

**If this works:**

- Database permissions are fine
- Problem is with API connection
- Check env vars again

**If this fails:**

- Database has issues
- Contact Supabase support

---

## Complete Debugging Checklist

- [ ] **1. Column exists**

  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'clinics' AND column_name = 'rooms';
  ```

- [ ] **2. Env vars set**
  - `NEXT_PUBLIC_SUPABASE_URL` ✓
  - `SUPABASE_SERVICE_ROLE_KEY` ✓
  - `DEFAULT_CLINIC_ID` ✓

- [ ] **3. Clinic exists**

  ```sql
  SELECT id FROM clinics WHERE id = 'clinic-001';
  ```

- [ ] **4. Diagnostic endpoint works**

  ```bash
  curl -X POST http://localhost:3000/api/settings/rooms
  ```

- [ ] **5. Server logs show details**
  - Watch `npm run dev` output

- [ ] **6. Manual update works**
  ```sql
  UPDATE clinics SET rooms = ARRAY['Room 1']::TEXT[]
  WHERE id = 'clinic-001';
  ```

---

## If Still Failing: Provide These Details

When reporting the issue, include:

1. **Error message from browser** (copy full JSON)
2. **Server log output** (copy the PATCH error details)
3. **Your Supabase project URL** (without secrets)
4. **Result of diagnostic POST** (copy the JSON response)
5. **Result of column check** (does rooms column exist?)
6. **Result of manual UPDATE** (works or fails?)

---

## Quick Fix: Start Fresh

If everything is confusing, try resetting:

### 1. Delete the column

```sql
ALTER TABLE clinics DROP COLUMN rooms;
```

### 2. Run migration again

```sql
ALTER TABLE clinics ADD COLUMN rooms TEXT[] DEFAULT ARRAY['Room 1', 'Room 2'];
```

### 3. Verify column exists

```sql
SELECT rooms FROM clinics LIMIT 1;
```

### 4. Restart dev server

```bash
npm run dev
```

### 5. Test in UI

- Settings → Rooms → Add room → Save

---

## Need Help?

Share:

1. Your error message (full JSON)
2. Server log output
3. Result of: `SELECT rooms FROM clinics LIMIT 1;` in Supabase
4. Your `.env.local` (without keys)
