-- Lets staff edit a submitted form response's answers (correct a mistake, add a missed detail)
-- instead of the record being permanently read-only. Tracks who last edited it and when, so the
-- "View Response" dialog can show an edit trail rather than silently overwriting what was
-- originally submitted with no record of the change.
ALTER TABLE "FormResponses" ADD COLUMN edited_by_staff_id uuid;
ALTER TABLE "FormResponses" ADD COLUMN edited_by_staff_name text;
ALTER TABLE "FormResponses" ADD COLUMN edited_at timestamptz;
