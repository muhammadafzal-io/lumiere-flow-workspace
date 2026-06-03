// Activity logging has been migrated to Supabase.
// This file re-exports from the new module for backwards compatibility.
export { logEvent, readActivityLog as readOpsLog } from "./activity-log";
