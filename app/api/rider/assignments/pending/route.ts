import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { pendingAssignmentsForRider } from "@/lib/services/rider-assignment";

// GET /api/rider/assignments/pending — pending offers for the blocking popup
// (req #6). Own rider only; stale/superseded offers are filtered server-side.
export const GET = handle(async () => {
  const me = await requireApiRole("rider");
  return json({ results: await pendingAssignmentsForRider(me) });
});
