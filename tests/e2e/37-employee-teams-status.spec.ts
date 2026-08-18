import { test, expect, type APIRequestContext } from "@playwright/test";

import { newSession, apiLogin, API_BASE } from "./helpers";

/**
 * PHASE M/N — staff teams, job terms and the Quit Job status.
 *
 * The point of these tests is the HISTORY guarantee: quitting is a status
 * change, never a delete, so the employee row, their attendance and every
 * report survive it. The only thing that changes is that they stop appearing in
 * the roster used to create NEW attendance.
 */

const TEAMS = `${API_BASE}/api/employee-teams/`;
const EMPLOYEES = `${API_BASE}/api/employees/`;
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function makeEmployee(req: APIRequestContext, extra: Record<string, string> = {}) {
  const res = await req.post(EMPLOYEES, {
    multipart: { first_name: "Team", last_name: "Member", employee_code: `T-${uniq()}`, role: "waiter", ...extra },
  });
  expect(res.status(), "employee created").toBe(201);
  return res.json();
}

async function makeTeam(req: APIRequestContext, extra: Record<string, unknown> = {}) {
  const res = await req.post(TEAMS, { data: { name: `Team ${uniq()}`, description: "Floor staff", ...extra } });
  expect(res.status(), "team created").toBe(201);
  return res.json();
}

test.describe("Phase M — teams", () => {
  test("a branch manager creates, renames and scopes teams to their own branch", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    const team = await makeTeam(bm.req);
    expect(team.member_count).toBe(0);
    expect(team.is_active).toBe(true);

    // A duplicate name inside the same branch is refused.
    expect((await bm.req.post(TEAMS, { data: { name: team.name } })).status(), "duplicate name").toBe(400);
    // A nameless team is refused.
    expect((await bm.req.post(TEAMS, { data: { name: "   " } })).status(), "name required").toBe(400);

    const renamed = await bm.req.patch(`${TEAMS}${team.id}/`, { data: { name: `${team.name} B`, description: "Updated" } });
    expect(renamed.status()).toBe(200);
    expect((await renamed.json()).description).toBe("Updated");

    // Listed for this branch.
    const list = await (await bm.req.get(TEAMS)).json();
    expect(list.results.some((t: { id: number }) => t.id === team.id)).toBe(true);

    // Empty team → really deleted.
    const del = await bm.req.delete(`${TEAMS}${team.id}/`);
    expect(del.status()).toBe(200);
    expect((await del.json()).archived, "an empty team is deleted outright").toBe(false);
  });

  test("a team with members is archived, not deleted", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    const team = await makeTeam(bm.req);
    const employee = await makeEmployee(bm.req, { team_id: String(team.id) });
    expect(employee.team, "employee joined the team").toBe(team.id);

    const del = await bm.req.delete(`${TEAMS}${team.id}/`);
    expect(del.status()).toBe(200);
    const body = await del.json();
    expect(body.archived, "a team with members is archived").toBe(true);
    expect(body.members).toBeGreaterThanOrEqual(1);

    // The employee still exists and still names the team.
    const after = await (await bm.req.get(`${EMPLOYEES}${employee.id}/`)).json();
    expect(after.team, "membership preserved").toBe(team.id);

    // Archived teams are hidden by default, visible on request, and closed to edits.
    const plain = await (await bm.req.get(TEAMS)).json();
    expect(plain.results.some((t: { id: number }) => t.id === team.id)).toBe(false);
    const withArchived = await (await bm.req.get(`${TEAMS}?include_archived=true`)).json();
    expect(withArchived.results.some((t: { id: number }) => t.id === team.id)).toBe(true);
    expect((await bm.req.patch(`${TEAMS}${team.id}/`, { data: { name: "Nope" } })).status(), "archived is read-only").toBe(409);
  });

  test("teams are branch-scoped and closed to other roles", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const bm = await newSession(browser, "branch_manager");
    const own = (await (await bm.req.get(`${API_BASE}/api/dashboard/branch-manager/`)).json()).branch.id;

    // A team on some OTHER branch, created by the super admin.
    const { results } = await (await admin.req.get(`${API_BASE}/api/branches/?page_size=100`)).json();
    const other = (results as { id: number }[]).find((b) => b.id !== own)!;
    const foreign = await makeTeam(admin.req, { branch_id: other.id });

    expect((await bm.req.get(`${TEAMS}${foreign.id}/`)).status(), "cross-branch read refused").toBe(403);
    expect((await bm.req.patch(`${TEAMS}${foreign.id}/`, { data: { name: "hijack" } })).status(), "cross-branch write refused").toBe(403);
    expect((await bm.req.delete(`${TEAMS}${foreign.id}/`)).status(), "cross-branch delete refused").toBe(403);

    // The BM's own list never contains another branch's team.
    const mine = await (await bm.req.get(TEAMS)).json();
    expect(mine.results.some((t: { id: number }) => t.id === foreign.id)).toBe(false);

    // An employee cannot be pushed into another branch's team.
    const emp = await makeEmployee(bm.req);
    expect(
      (await bm.req.patch(`${EMPLOYEES}${emp.id}/`, { multipart: { team_id: String(foreign.id) } })).status(),
      "cross-branch team assignment refused",
    ).toBe(400);

    for (const role of ["rider", "customer"]) {
      const s = await apiLogin(browser, role);
      expect((await s.req.get(TEAMS)).status(), `${role} list`).toBe(403);
      expect((await s.req.post(TEAMS, { data: { name: "x" } })).status(), `${role} create`).toBe(403);
      await s.context.close();
    }
    await admin.req.delete(`${TEAMS}${foreign.id}/`);
  });
});

test.describe("Phase M — job terms", () => {
  test('"Others" requires a custom term, and switching to a real role clears it', async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");

    const missing = await bm.req.post(EMPLOYEES, {
      multipart: { first_name: "No", last_name: "Label", employee_code: `O-${uniq()}`, role: "others" },
    });
    expect(missing.status(), "Others without a label is refused").toBe(400);

    const employee = await makeEmployee(bm.req, { role: "others", custom_role: "Dishwasher" });
    expect(employee.role).toBe("others");
    expect(employee.custom_role).toBe("Dishwasher");
    expect(employee.role_label, "the custom term is what gets shown").toBe("Dishwasher");

    const promoted = await bm.req.patch(`${EMPLOYEES}${employee.id}/`, { multipart: { role: "chef" } });
    expect(promoted.status()).toBe(200);
    const body = await promoted.json();
    expect(body.custom_role, "a stale custom term must not linger").toBe("");
    expect(body.role_label).toBe("chef");

    // The existing validated roles still work exactly as before.
    const cleaner = await makeEmployee(bm.req, { role: "cleaner" });
    expect(cleaner.role_label).toBe("cleaner");
    expect((await bm.req.post(EMPLOYEES, {
      multipart: { first_name: "Bad", employee_code: `B-${uniq()}`, role: "wizard" },
    })).status(), "an unknown role is still refused").toBe(400);
  });
});

test.describe("Phase M/N — Quit Job preserves history", () => {
  test("quitting keeps the employee, their attendance and their reports", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    const employee = await makeEmployee(bm.req, { role: "chef" });
    const today = new Date().toISOString().slice(0, 10);

    // Give them one attendance row first — this is the history under test.
    const marked = await bm.req.post(`${API_BASE}/api/employee-attendance/`, {
      data: { employee_id: employee.id, date: today, status: "present" },
    });
    expect(marked.status(), "attendance recorded").toBe(201);

    const statusUrl = `${EMPLOYEES}${employee.id}/status/`;
    expect(
      (await bm.req.post(statusUrl, { data: { employment_status: "quit_job" } })).status(),
      "a quit record needs a reason",
    ).toBe(400);

    const quit = await bm.req.post(statusUrl, {
      data: { employment_status: "quit_job", reason: "Moved to another city" },
    });
    expect(quit.status()).toBe(200);
    const quitBody = await quit.json();
    expect(quitBody.employment_status).toBe("quit_job");
    expect(quitBody.quit_reason, "the reason is stored as typed").toBe("Moved to another city");
    expect(quitBody.quit_at).not.toBeNull();
    expect(quitBody.is_active).toBe(false);

    // Repeating the same status is a conflict, not a silent no-op.
    expect(
      (await bm.req.post(statusUrl, { data: { employment_status: "quit_job", reason: "again" } })).status(),
    ).toBe(409);

    // The employee row still exists…
    expect((await bm.req.get(`${EMPLOYEES}${employee.id}/`)).status(), "not deleted").toBe(200);
    // …and their attendance history is still readable and still counted.
    const history = await (await bm.req.get(`${API_BASE}/api/employee-attendance/?employee_id=${employee.id}`)).json();
    expect(history.count, "attendance preserved").toBeGreaterThanOrEqual(1);
    expect(history.summary.present, "summaries still include them").toBeGreaterThanOrEqual(1);

    // They are gone from the roster used to create NEW attendance…
    const roster = await (await bm.req.get(`${EMPLOYEES}?roster=true&page_size=100`)).json();
    expect(roster.results.some((e: { id: number }) => e.id === employee.id), "off the roster").toBe(false);

    // …and a NEW attendance date is refused for them.
    expect((await bm.req.post(`${API_BASE}/api/employee-attendance/`, {
      data: { employee_id: employee.id, date: "2020-01-02", status: "present" },
    })).status(), "no new attendance after quitting").toBe(400);

    // An EXISTING row stays correctable.
    expect((await bm.req.post(`${API_BASE}/api/employee-attendance/`, {
      data: { employee_id: employee.id, date: today, status: "late" },
    })).status(), "past records can still be corrected").toBe(201);

    // Reactivating restores them to the roster.
    const back = await bm.req.post(statusUrl, { data: { employment_status: "active" } });
    expect(back.status()).toBe(200);
    expect((await back.json()).employment_status).toBe("active");
    const roster2 = await (await bm.req.get(`${EMPLOYEES}?roster=true&page_size=100`)).json();
    expect(roster2.results.some((e: { id: number }) => e.id === employee.id), "back on the roster").toBe(true);
  });

  test("list filters: status, team, search and pagination are real queries", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    const team = await makeTeam(bm.req);
    const surname = `Zz${uniq()}`;
    const inTeam = await makeEmployee(bm.req, { last_name: surname, team_id: String(team.id) });
    const quitter = await makeEmployee(bm.req, { last_name: surname });
    await bm.req.post(`${EMPLOYEES}${quitter.id}/status/`, {
      data: { employment_status: "quit_job", reason: "End of contract" },
    });

    const active = await (await bm.req.get(`${EMPLOYEES}?status=active&page_size=100`)).json();
    expect(active.results.some((e: { id: number }) => e.id === quitter.id), "quit staff excluded").toBe(false);
    expect(active.results.some((e: { id: number }) => e.id === inTeam.id)).toBe(true);

    const quitOnly = await (await bm.req.get(`${EMPLOYEES}?status=quit_job&page_size=100`)).json();
    expect(quitOnly.results.some((e: { id: number }) => e.id === quitter.id), "still findable").toBe(true);

    const byTeam = await (await bm.req.get(`${EMPLOYEES}?team_id=${team.id}&page_size=100`)).json();
    expect(byTeam.results.map((e: { id: number }) => e.id)).toContain(inTeam.id);
    expect(byTeam.results.every((e: { team: number | null }) => e.team === team.id)).toBe(true);

    const search = await (await bm.req.get(`${EMPLOYEES}?search=${surname}&page_size=100`)).json();
    expect(search.count, "both matches found by surname").toBeGreaterThanOrEqual(2);

    const paged = await (await bm.req.get(`${EMPLOYEES}?search=${surname}&page_size=1`)).json();
    expect(paged.results.length, "page size honoured").toBe(1);
    expect(paged.count, "count is the full match set").toBeGreaterThanOrEqual(2);

    // Attendance can be filtered by team without leaking other teams.
    const today = new Date().toISOString().slice(0, 10);
    await bm.req.post(`${API_BASE}/api/employee-attendance/`, {
      data: { employee_id: inTeam.id, date: today, status: "present" },
    });
    const teamAttendance = await (await bm.req.get(`${API_BASE}/api/employee-attendance/?team_id=${team.id}`)).json();
    expect(teamAttendance.count).toBeGreaterThanOrEqual(1);
    expect(teamAttendance.results.every((r: { employee: number }) => r.employee === inTeam.id)).toBe(true);
  });
});
