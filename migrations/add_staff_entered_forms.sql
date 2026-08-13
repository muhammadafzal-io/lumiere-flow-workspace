-- Lets staff fill out a required in-house form on a client's behalf (e.g. the client filled it
-- out on paper in person) instead of leaving it PENDING forever with no supported path forward.
-- Denormalized name (not a join) matches this table's existing client_name column, so the
-- read-only "View Response" dialog can show who entered it with zero extra joins.
ALTER TABLE "FormResponses" ADD COLUMN entered_by_staff_id uuid;
ALTER TABLE "FormResponses" ADD COLUMN entered_by_staff_name text;
