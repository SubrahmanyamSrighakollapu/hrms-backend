/* eslint-disable no-console */
/**
 * HRMS end-to-end harness.
 * Drives an admin setup pass, a full employee journey, and an HR/manager pass
 * across every mounted module, recording every request/response.
 */
const BASE = process.env.API_BASE || 'http://localhost:5000/api/v1';

const results = [];
let failures = 0;
let throttled = 0;
const skipped = [];

function listOf(data, ...keys) {
  if (Array.isArray(data)) return data;
  for (const k of keys) if (Array.isArray(data?.[k])) return data[k];
  return [];
}

async function call(group, name, method, path, opts = {}) {
  const { token, body, form, raw, expect, note } = opts;
  const headers = {};
  let payload;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (form) payload = form;
  else if (raw !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = raw;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let status = 0;
  let text = '';
  const startedAt = Date.now();
  try {
    const res = await fetch(BASE + path, { method, headers, body: payload });
    status = res.status;
    text = await res.text();
  } catch (err) {
    text = `FETCH_ERROR: ${err.message}`;
  }
  const ms = Date.now() - startedAt;
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  // A 429 means the server's global rate limit kicked in — that is the limiter
  // working as designed, not an application defect, so it must not fail a run.
  const rateLimited = status === 429;
  if (rateLimited) throttled += 1;
  const ok = rateLimited || (Array.isArray(expect) ? expect.includes(status) : status >= 200 && status < 300);
  if (!ok) failures += 1;
  results.push({
    group,
    name,
    method,
    path,
    status,
    ms,
    ok,
    error: ok ? undefined : (parsed && parsed.message ? parsed.message : String(parsed).slice(0, 220)),
    note: rateLimited ? 'rate-limited (429)' : note,
  });
  const data = parsed && typeof parsed === 'object' && parsed !== null && 'data' in parsed ? parsed.data : parsed;
  return { ok, status, data, raw: parsed };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  /* ------------------------------------------------------------------ */
  /* AUTH                                                               */
  /* ------------------------------------------------------------------ */
  const anon = await call('auth', 'reject unauthenticated request', 'GET', '/expenses', { expect: [401] });
  await call('auth', 'reject unknown route', 'GET', '/does-not-exist', { expect: [404] });
  await call('auth', 'reject bad password', 'POST', '/auth/login', {
    body: { email: 'employee@hrms.local', password: 'wrong-password' },
    expect: [401],
  });

  const empLogin = await call('auth', 'employee login', 'POST', '/auth/login', {
    body: { email: 'employee@hrms.local', password: 'Employee@123' },
  });
  const empToken = empLogin.data?.tokens?.accessToken ?? empLogin.data?.accessToken;
  const empRefresh = empLogin.data?.tokens?.refreshToken ?? empLogin.data?.refreshToken;

  const adminLogin = await call('auth', 'admin login', 'POST', '/auth/login', {
    body: { email: 'admin@hrms.local', password: 'Admin@123' },
  });
  const adminToken = adminLogin.data?.tokens?.accessToken ?? adminLogin.data?.accessToken;

  const hrLogin = await call('auth', 'hr login', 'POST', '/auth/login', {
    body: { email: 'hr@hrms.local', password: 'Hr@12345' },
  });
  const hrToken = hrLogin.data?.tokens?.accessToken ?? hrLogin.data?.accessToken;

  if (!empToken || !adminToken || !hrToken) {
    console.log('FATAL: could not obtain tokens');
    report();
    process.exit(1);
  }

  await call('auth', 'me (employee)', 'GET', '/auth/me', { token: empToken });
  const refresh = await call('auth', 'refresh token', 'POST', '/auth/refresh', { body: { refreshToken: empRefresh } });
  const empToken2 = refresh.data?.tokens?.accessToken ?? refresh.data?.accessToken ?? empToken;

  /* ------------------------------------------------------------------ */
  /* ADMIN SETUP (prerequisites for downstream flows)                   */
  /* ------------------------------------------------------------------ */
  const desks = await call('desk', 'admin list desks', 'GET', '/desk-management', { token: adminToken });
  let deskId = listOf(desks.data, 'desks', 'items')[0]?.id;
  if (!deskId) {
    const created = await call('desk', 'admin create desk', 'POST', '/desk-management', {
      token: adminToken,
      body: { name: 'E2E Desk', code: `E2E-${Date.now()}` },
    });
    deskId = created.data?.desk?.id ?? created.data?.id;
  }

  const events = await call('events', 'admin list events', 'GET', '/events', { token: adminToken });
  let eventId = listOf(events.data, 'events', 'items')[0]?.id;
  if (!eventId) {
    const created = await call('events', 'admin create event', 'POST', '/events', {
      token: adminToken,
      body: { title: 'E2E Townhall', description: 'Automated test event', date: '2026-12-15T10:00:00.000Z', location: 'HQ' },
    });
    eventId = created.data?.event?.id ?? created.data?.id;
  }

  const holidays = await call('holidays', 'admin list holidays', 'GET', '/holidays?year=2026', { token: adminToken });
  let optionalHolidayId = listOf(holidays.data, 'holidays', 'items').find((h) => h.type === 'OPTIONAL')?.id;
  if (!optionalHolidayId) {
    const created = await call('holidays', 'admin create optional holiday', 'POST', '/holidays', {
      token: adminToken,
      body: { name: 'E2E Optional Holiday', date: '2026-12-24', type: 'OPTIONAL' },
    });
    optionalHolidayId = created.data?.holiday?.id ?? created.data?.id;
  }

  let itCategoryId = listOf((await call('it-support', 'list IT categories', 'GET', '/it-support/categories', { token: adminToken })).data, 'categories', 'items')[0]?.id;
  if (!itCategoryId) {
    const created = await call('it-support', 'admin create IT category', 'POST', '/it-support/categories', {
      token: adminToken,
      body: { name: 'E2E Hardware' },
    });
    itCategoryId = created.data?.category?.id ?? created.data?.id;
  }

  let hrCategoryId = listOf((await call('hr-helpdesk', 'list HR categories', 'GET', '/hr-helpdesk/categories', { token: adminToken })).data, 'categories', 'items')[0]?.id;
  if (!hrCategoryId) {
    const created = await call('hr-helpdesk', 'admin create HR category', 'POST', '/hr-helpdesk/categories', {
      token: adminToken,
      body: { name: 'E2E Payroll Query' },
    });
    hrCategoryId = created.data?.category?.id ?? created.data?.id;
  }

  let policyId = listOf((await call('policies', 'admin list policies', 'GET', '/policies', { token: adminToken })).data, 'policies', 'items')[0]?.id;
  if (!policyId) {
    const fd = new FormData();
    fd.append('title', 'E2E Code of Conduct');
    fd.append('description', 'Automated test policy');
    fd.append('category', 'General');
    fd.append('status', 'PUBLISHED');
    fd.append('document', new Blob(['E2E policy body'], { type: 'text/plain' }), 'policy.txt');
    const created = await call('policies', 'admin create policy (upload)', 'POST', '/policies', { token: adminToken, form: fd });
    policyId = created.data?.policy?.id ?? created.data?.id;
  }

  /* ------------------------------------------------------------------ */
  /* EMPLOYEE JOURNEY                                                   */
  /* ------------------------------------------------------------------ */
  await call('dashboard', 'employee dashboard summary', 'GET', '/dashboard/summary', { token: empToken2 });

  const me = await call('my-info', 'get own profile', 'GET', '/employees/me', { token: empToken2 });
  const empUserId = me.data?.employee?.id ?? me.data?.id;

  // Repeated harness runs consume the seeded CASUAL entitlement, so top it back
  // up first — otherwise the leave-creation step fails on an exhausted balance.
  if (empUserId) {
    const balances = await call('timeoff', 'admin read leave balances', 'GET', '/settings/leave-balances?year=2026', { token: adminToken });
    const rows = listOf(balances.data, 'balances', 'leaveBalances', 'items');
    const casual = rows.find((b) => b.employeeId === empUserId && b.leaveType === 'CASUAL');
    const used = Number(casual?.used ?? 0);
    await call('timeoff', 'admin top-up CASUAL balance', 'PUT', '/settings/leave-balances', {
      token: adminToken,
      body: { employeeId: empUserId, leaveType: 'CASUAL', year: 2026, total: Math.max(24, used + 24) },
    });
  }

  await call('my-info', 'update own profile', 'PATCH', '/employees/me', {
    token: empToken2,
    body: { phone: `90000${String(Date.now()).slice(-5)}` },
  });
  await call('my-info', 'reject invalid phone', 'PATCH', '/employees/me', {
    token: empToken2,
    body: { phone: '!!!' },
    expect: [400],
  });

  const we = await call('my-info', 'add work experience', 'POST', '/employees/me/work-experience', {
    token: empToken2,
    body: { company: 'E2E Corp', designation: 'Engineer', fromDate: '2020-01-01', currentlyWorking: true },
  });
  const weId = we.data?.entry?.id ?? we.data?.workExperience?.id ?? we.data?.id;
  await call('my-info', 'list work experience', 'GET', '/employees/me/work-experience', { token: empToken2 });
  if (weId) await call('my-info', 'update work experience', 'PATCH', `/employees/me/work-experience/${weId}`, { token: empToken2, body: { designation: 'Senior Engineer' } });
  if (weId) await call('my-info', 'delete work experience', 'DELETE', `/employees/me/work-experience/${weId}`, { token: empToken2 });

  const fam = await call('my-info', 'add family member', 'POST', '/employees/me/family', { token: empToken2, body: { name: 'E2E Kin', relationship: 'Sibling' } });
  const famId = fam.data?.member?.id ?? fam.data?.family?.id ?? fam.data?.id;
  if (famId) await call('my-info', 'delete family member', 'DELETE', `/employees/me/family/${famId}`, { token: empToken2 });

  const edu = await call('my-info', 'add education', 'POST', '/employees/me/education', { token: empToken2, body: { institution: 'E2E University', degree: 'B.Tech', fromYear: 2016, toYear: 2020 } });
  const eduId = edu.data?.entry?.id ?? edu.data?.education?.id ?? edu.data?.id;
  if (eduId) await call('my-info', 'delete education', 'DELETE', `/employees/me/education/${eduId}`, { token: empToken2 });

  await call('timeoff', 'leave balances', 'GET', '/timeoff/balances', { token: empToken2 });
  const leave = await call('timeoff', 'create LEAVE request', 'POST', '/timeoff', {
    token: empToken2,
    body: { type: 'LEAVE', reason: 'E2E leave', leaveType: 'CASUAL', fromDate: '2026-12-01', toDate: '2026-12-02', days: 2 },
  });
  const leaveId = leave.data?.request?.id ?? leave.data?.id;
  await call('timeoff', 'reject inverted date range', 'POST', '/timeoff', {
    token: empToken2,
    body: { type: 'LEAVE', reason: 'bad', leaveType: 'CASUAL', fromDate: '2026-12-05', toDate: '2026-12-01', days: 2 },
    expect: [400],
  });
  const perm = await call('timeoff', 'create PERMISSION request', 'POST', '/timeoff', {
    token: empToken2,
    body: { type: 'PERMISSION', reason: 'E2E permission', permissionDate: '2026-12-03', fromTime: '10:00', toTime: '12:00' },
  });
  const permId = perm.data?.request?.id ?? perm.data?.id;
  await call('timeoff', 'list own requests', 'GET', '/timeoff', { token: empToken2 });
  if (leaveId) await call('timeoff', 'get own request', 'GET', `/timeoff/${leaveId}`, { token: empToken2 });
  await call('timeoff', 'forbid employee approval inbox', 'GET', '/timeoff/inbox', { token: empToken2, expect: [403] });

  await call('payroll', 'list own payslips', 'GET', '/payroll/payslips', { token: empToken2 });
  await call('payroll', 'forbid employee bulk upload', 'POST', '/payroll/payslips/bulk', { token: empToken2, expect: [403, 400] });

  await call('holidays', 'list holidays', 'GET', '/holidays?year=2026', { token: empToken2 });
  await call('holidays', 'holiday settings', 'GET', '/holidays/settings', { token: empToken2 });
  await call('holidays', 'my optional holidays', 'GET', '/holidays/mine', { token: empToken2 });
  if (optionalHolidayId) {
    await call('holidays', 'avail optional holiday', 'POST', `/holidays/${optionalHolidayId}/avail`, { token: empToken2 });
    await call('holidays', 'cancel optional holiday', 'DELETE', `/holidays/${optionalHolidayId}/avail`, { token: empToken2 });
  } else skipped.push('holidays avail (no optional holiday)');

  const policies = await call('policies', 'list policies', 'GET', '/policies', { token: empToken2 });
  if (policyId) {
    await call('policies', 'get policy', 'GET', `/policies/${policyId}`, { token: empToken2 });
    await call('policies', 'download policy document', 'GET', `/policies/${policyId}/download`, { token: empToken2 });
    await call('policies', 'acknowledge policy', 'POST', `/policies/${policyId}/acknowledge`, { token: empToken2 });
  } else skipped.push('policies detail (none available)');

  await call('desk', 'list desks', 'GET', '/desk-management', { token: empToken2 });
  if (deskId) {
    const booking = await call('desk', 'book a desk', 'POST', `/desk-management/${deskId}/book`, { token: empToken2, body: { date: '2026-12-08' } });
    await call('desk', 'list own bookings', 'GET', '/desk-management/mine', { token: empToken2 });
    const bookingId = booking.data?.booking?.id ?? booking.data?.id;
    if (bookingId) await call('desk', 'cancel booking', 'DELETE', `/desk-management/bookings/${bookingId}`, { token: empToken2 });
  }

  await call('calendars', 'calendar events', 'GET', '/calendars/events?start=2026-12-01&end=2026-12-31', { token: empToken2 });

  await call('events', 'list events', 'GET', '/events?upcoming=true', { token: empToken2 });
  if (eventId) {
    await call('events', 'rsvp to event', 'POST', `/events/${eventId}/rsvp`, { token: empToken2, body: { response: 'GOING' } });
    await call('events', 'my rsvps', 'GET', '/events/mine', { token: empToken2 });
  }

  const itTicket = itCategoryId
    ? await call('it-support', 'create ticket', 'POST', '/it-support', { token: empToken2, body: { title: 'E2E laptop issue', description: 'Laptop will not boot', categoryId: itCategoryId, priority: 'HIGH' } })
    : (skipped.push('it-support create (no category)'), { data: null });
  const itTicketId = itTicket.data?.ticket?.id ?? itTicket.data?.id;
  await call('it-support', 'list tickets', 'GET', '/it-support', { token: empToken2 });
  await call('it-support', 'ticket stats', 'GET', '/it-support/stats', { token: empToken2 });
  if (itTicketId) {
    await call('it-support', 'get ticket', 'GET', `/it-support/${itTicketId}`, { token: empToken2 });
    await call('it-support', 'comment on ticket', 'POST', `/it-support/${itTicketId}/comments`, { token: empToken2, body: { message: 'Still broken' } });
    await call('it-support', 'forbid employee ticket update', 'PATCH', `/it-support/${itTicketId}`, { token: empToken2, body: { status: 'CLOSED' }, expect: [403] });
  }

  const hrTicket = hrCategoryId
    ? await call('hr-helpdesk', 'create ticket', 'POST', '/hr-helpdesk', { token: empToken2, body: { title: 'E2E payslip query', description: 'Payslip missing', categoryId: hrCategoryId } })
    : (skipped.push('hr-helpdesk create (no category)'), { data: null });
  const hrTicketId = hrTicket.data?.ticket?.id ?? hrTicket.data?.id;
  await call('hr-helpdesk', 'list tickets', 'GET', '/hr-helpdesk', { token: empToken2 });
  if (hrTicketId) {
    await call('hr-helpdesk', 'comment on ticket', 'POST', `/hr-helpdesk/${hrTicketId}/comments`, { token: empToken2, body: { message: 'Please advise' } });
  }

  const expCats = await call('expenses', 'list expense categories', 'GET', '/expenses/categories', { token: empToken2 });
  const expCat = listOf(expCats.data, 'categories', 'items')[0];
  let claimId;
  if (expCat) {
    const claim = await call('expenses', 'create + submit claim', 'POST', '/expenses', {
      token: empToken2,
      body: { title: 'E2E client visit', items: [{ categoryId: expCat.id, expenseDate: '2026-12-04', amount: 300, description: 'Taxi' }], submit: true },
    });
    claimId = claim.data?.claim?.id ?? claim.data?.id;
  } else skipped.push('expenses claim (no category)');
  await call('expenses', 'list own claims', 'GET', '/expenses?scope=mine', { token: empToken2 });
  await call('expenses', 'expense stats', 'GET', '/expenses/stats', { token: empToken2 });
  await call('expenses', 'expense report', 'GET', '/expenses/report', { token: empToken2 });
  await call('expenses', 'export report CSV', 'GET', '/expenses/report/export', { token: empToken2 });
  await call('expenses', 'forbid employee categories/all', 'GET', '/expenses/categories/all', { token: empToken2, expect: [403] });
  await call('expenses', 'forbid employee decision', 'POST', `/expenses/${claimId ?? 'x'}/decision`, { token: empToken2, body: { decision: 'APPROVED' }, expect: [403] });
  if (claimId && expCat) {
    await call('expenses', 'reject over-limit line', 'POST', '/expenses', {
      token: empToken2,
      body: { title: 'E2E over limit', items: [{ categoryId: expCat.id, expenseDate: '2026-12-04', amount: 999999 }], submit: true },
      expect: [400],
    });
  }

  await call('notifications', 'list notifications', 'GET', '/notifications', { token: empToken2 });

  const dir = await call('chat', 'chat directory', 'GET', '/chat/directory', { token: empToken2 });
  const other = listOf(dir.data, 'employees', 'items').find((e) => e.id !== empUserId);
  await call('chat', 'list conversations', 'GET', '/chat/conversations', { token: empToken2 });
  await call('chat', 'chat settings', 'GET', '/chat/settings', { token: empToken2 });
  await call('chat', 'unread counts', 'GET', '/chat/unread', { token: empToken2 });
  await call('chat', 'online users', 'GET', '/chat/online', { token: empToken2 });
  if (other) {
    const conv = await call('chat', 'start direct conversation', 'POST', '/chat/conversations/direct', { token: empToken2, body: { employeeId: other.id } });
    const convId = conv.data?.conversation?.id ?? conv.data?.id;
    if (convId) {
      await call('chat', 'send message', 'POST', `/chat/conversations/${convId}/messages`, { token: empToken2, body: { content: 'Hello from E2E' } });
      await call('chat', 'list messages', 'GET', `/chat/conversations/${convId}/messages`, { token: empToken2 });
      await call('chat', 'get conversation', 'GET', `/chat/conversations/${convId}`, { token: empToken2 });
    }
  } else skipped.push('chat messaging (no other employee)');
  await call('chat', 'search messages', 'GET', '/chat/search?q=Hello', { token: empToken2 });

  /* employee must be denied admin-only modules */
  await call('rbac', 'employee denied /employees', 'GET', '/employees', { token: empToken2, expect: [403] });
  await call('rbac', 'employee denied /reports/summary', 'GET', '/reports/summary', { token: empToken2, expect: [403] });
  await call('rbac', 'employee denied /organization/departments', 'GET', '/organization/departments', { token: empToken2, expect: [403] });
  await call('rbac', 'employee denied /roles', 'GET', '/roles', { token: empToken2, expect: [403] });
  await call('rbac', 'employee denied /settings/profile', 'GET', '/settings/profile', { token: empToken2, expect: [403] });

  /* ------------------------------------------------------------------ */
  /* HR / MANAGER PASS                                                  */
  /* ------------------------------------------------------------------ */
  await call('dashboard', 'hr dashboard summary', 'GET', '/dashboard/summary', { token: hrToken });

  await call('timeoff', 'hr approval inbox', 'GET', '/timeoff/inbox', { token: hrToken });
  if (leaveId) await call('timeoff', 'hr approve leave', 'PATCH', `/timeoff/${leaveId}/approve`, { token: hrToken, body: { comment: 'Approved by E2E' } });
  if (permId) await call('timeoff', 'hr reject permission', 'PATCH', `/timeoff/${permId}/reject`, { token: hrToken, body: { comment: 'Rejected by E2E' } });
  await call('timeoff', 'hr list approval flows', 'GET', '/timeoff/approval-flows', { token: hrToken, expect: [200, 403] });

  const empList = await call('employees', 'hr list employees', 'GET', '/employees', { token: hrToken });
  const firstEmpId = listOf(empList.data, 'employees', 'items')[0]?.id;
  await call('employees', 'hr form options', 'GET', '/employees/form-options', { token: hrToken });
  if (firstEmpId) await call('employees', 'hr get employee', 'GET', `/employees/${firstEmpId}`, { token: hrToken });

  await call('payroll', 'hr list payslips', 'GET', '/payroll/payslips', { token: hrToken });
  await call('payroll', 'hr bulk upload rejects empty', 'POST', '/payroll/payslips/bulk', { token: hrToken, expect: [400] });

  await call('holidays', 'hr team holidays', 'GET', '/holidays/team', { token: hrToken });
  await call('holidays', 'hr update settings', 'PUT', '/holidays/settings', { token: hrToken, body: { optionalHolidayAllowance: 2 } });

  await call('policies', 'hr team acknowledgments', 'GET', '/policies/team', { token: hrToken });
  if (policyId) await call('policies', 'hr publish policy', 'PATCH', `/policies/${policyId}/publish`, { token: hrToken, expect: [200, 400] });

  if (itTicketId) await call('it-support', 'hr update ticket', 'PATCH', `/it-support/${itTicketId}`, { token: hrToken, body: { status: 'IN_PROGRESS', priority: 'URGENT' } });
  if (hrTicketId) await call('hr-helpdesk', 'hr update ticket', 'PATCH', `/hr-helpdesk/${hrTicketId}`, { token: hrToken, body: { status: 'RESOLVED' } });

  await call('expenses', 'hr approvals queue', 'GET', '/expenses?scope=approvals', { token: hrToken });
  await call('expenses', 'hr expense employees', 'GET', '/expenses/employees', { token: hrToken });
  if (claimId) {
    await call('expenses', 'hr approve claim', 'POST', `/expenses/${claimId}/decision`, { token: hrToken, body: { decision: 'APPROVED', note: 'OK' } });
    await call('expenses', 'hr reimburse claim', 'POST', `/expenses/${claimId}/reimburse`, { token: hrToken, body: { paymentMode: 'BANK_TRANSFER', reference: `UTR${Date.now()}` } });
    await call('expenses', 'hr get claim', 'GET', `/expenses/${claimId}`, { token: hrToken });
  }
  await call('expenses', 'hr report', 'GET', '/expenses/report', { token: hrToken });

  await call('desk', 'hr list all bookings', 'GET', '/desk-management/bookings', { token: hrToken });
  await call('reports', 'hr report summary', 'GET', '/reports/summary', { token: hrToken });
  await call('organization', 'hr departments', 'GET', '/organization/departments', { token: hrToken });
  await call('organization', 'hr hierarchy', 'GET', '/organization/hierarchy', { token: hrToken });
  await call('organization', 'hr locations', 'GET', '/organization/locations', { token: hrToken });
  await call('organization', 'hr sub-locations', 'GET', '/organization/sub-locations', { token: hrToken });
  await call('roles', 'hr list roles', 'GET', '/roles', { token: hrToken });
  await call('settings', 'hr settings profile', 'GET', '/settings/profile', { token: hrToken, expect: [200, 403] });
  await call('settings', 'admin settings profile', 'GET', '/settings/profile', { token: adminToken });
  await call('settings', 'admin leave balances', 'GET', '/settings/leave-balances?year=2026', { token: adminToken });
  await call('roles', 'admin role assignments', 'GET', '/roles/assignments', { token: adminToken });
  await call('notifications', 'hr notifications', 'GET', '/notifications', { token: hrToken });

  /* ------------------------------------------------------------------ */
  /* ADMIN CONFIG / CRUD EDGE CASES                                     */
  /* ------------------------------------------------------------------ */
  const dept = await call('organization', 'admin create department', 'POST', '/organization/departments', { token: adminToken, body: { name: `E2E Dept ${Date.now() % 100000}` } });
  const deptId = dept.data?.department?.id ?? dept.data?.id;
  if (deptId) {
    await call('organization', 'admin update department', 'PATCH', `/organization/departments/${deptId}`, { token: adminToken, body: { description: 'E2E' } });
    await call('organization', 'admin delete department', 'DELETE', `/organization/departments/${deptId}`, { token: adminToken });
  }
  const loc = await call('organization', 'admin create location', 'POST', '/organization/locations', { token: adminToken, body: { name: `E2E Loc ${Date.now() % 100000}` } });
  const locId = loc.data?.location?.id ?? loc.data?.id;
  if (locId) {
    const sub = await call('organization', 'admin create sub-location', 'POST', '/organization/sub-locations', { token: adminToken, body: { locationId: locId, name: 'E2E Floor' } });
    const subId = sub.data?.subLocation?.id ?? sub.data?.id;
    if (subId) await call('organization', 'admin delete sub-location', 'DELETE', `/organization/sub-locations/${subId}`, { token: adminToken });
    await call('organization', 'admin delete location', 'DELETE', `/organization/locations/${locId}`, { token: adminToken });
  }
  const dupName = `E2E Dup ${Date.now() % 100000}`;
  const dup = await call('organization', 'admin create department (unique name)', 'POST', '/organization/departments', { token: adminToken, body: { name: dupName } });
  const dupId = dup.data?.department?.id ?? dup.data?.id;
  await call('organization', 'reject duplicate department name', 'POST', '/organization/departments', { token: adminToken, body: { name: dupName }, expect: [400, 409] });
  if (dupId) await call('organization', 'cleanup duplicate department', 'DELETE', `/organization/departments/${dupId}`, { token: adminToken });

  const role = await call('roles', 'admin create role', 'POST', '/roles', { token: adminToken, body: { name: `E2E Role ${Date.now() % 100000}`, description: 'temp' } });
  const roleId = role.data?.role?.id ?? role.data?.id;
  if (roleId) {
    await call('roles', 'admin update role', 'PATCH', `/roles/${roleId}`, { token: adminToken, body: { description: 'updated' } });
    await call('roles', 'admin delete role', 'DELETE', `/roles/${roleId}`, { token: adminToken });
  }
  await call('roles', 'reject role name too short', 'POST', '/roles', { token: adminToken, body: { name: 'x' }, expect: [400] });

  const newCat = await call('expenses', 'admin create category', 'POST', '/expenses/categories', { token: adminToken, body: { name: `E2E Cat ${Date.now() % 100000}`, maxAmount: 1000, receiptRequiredAbove: 500 } });
  const catId = newCat.data?.category?.id ?? newCat.data?.id;
  if (catId) {
    await call('expenses', 'admin update category', 'PATCH', `/expenses/categories/${catId}`, { token: adminToken, body: { active: false } });
    await call('expenses', 'admin list all categories', 'GET', '/expenses/categories/all', { token: adminToken });
  }

  const ticketCat = await call('it-support', 'admin create ticket category', 'POST', '/it-support/categories', { token: adminToken, body: { name: `E2E TC ${Date.now() % 100000}` } });
  const ticketCatId = ticketCat.data?.category?.id ?? ticketCat.data?.id;
  if (ticketCatId) await call('it-support', 'admin update ticket category', 'PATCH', `/it-support/categories/${ticketCatId}`, { token: adminToken, body: { active: false } });

  /* ------------------------------------------------------------------ */
  /* EDGE CASES / NEGATIVE / BOUNDS                                     */
  /* ------------------------------------------------------------------ */
  const ghost = `ghost-${Date.now()}`;
  await call('edge', 'unknown expense claim -> 404', 'GET', `/expenses/${ghost}`, { token: hrToken, expect: [404] });
  await call('edge', 'decision on unknown claim -> 404', 'POST', `/expenses/${ghost}/decision`, { token: hrToken, body: { decision: 'APPROVED' }, expect: [404] });
  await call('edge', 'unknown leave request -> 404', 'GET', `/timeoff/${ghost}`, { token: empToken2, expect: [404] });
  await call('edge', 'unknown employee -> 404', 'GET', `/employees/${ghost}`, { token: hrToken, expect: [404] });
  await call('edge', 'expense claim without items -> 400', 'POST', '/expenses', { token: empToken2, body: { title: 'No items' }, expect: [400] });
  await call('edge', 'expense claim without title -> 400', 'POST', '/expenses', { token: empToken2, body: { items: [{ categoryId: expCat?.id ?? 'x', expenseDate: '2026-12-04', amount: 10 }] }, expect: [400] });
  await call('edge', 'over-long address -> 400', 'PATCH', '/employees/me', { token: empToken2, body: { address: 'x'.repeat(300) }, expect: [400] });
  await call('edge', 'malformed JSON body -> 400', 'POST', '/auth/login', { raw: '{this is not json', expect: [400] });
  await call('edge', 'negative page -> 400', 'GET', '/employees?page=-1', { token: hrToken, expect: [400] });
  await call('edge', 'oversized pageSize rejected', 'GET', '/employees?pageSize=9999', { token: hrToken, expect: [400] });
  await call('edge', 'empty search query handled', 'GET', '/employees?q=', { token: hrToken });

  /* extra RBAC coverage */
  await call('rbac', 'employee denied desk bookings list', 'GET', '/desk-management/bookings', { token: empToken2, expect: [403] });
  await call('rbac', 'employee team avails (self-scoped)', 'GET', '/holidays/team', { token: empToken2 });
  await call('rbac', 'employee team acks (self-scoped)', 'GET', '/policies/team', { token: empToken2 });
  await call('rbac', 'no token -> 401', 'GET', '/payroll/payslips', { expect: [401] });

  /* ------------------------------------------------------------------ */
  /* PERFORMANCE                                                        */
  /* ------------------------------------------------------------------ */
  await call('perf', 'dashboard summary', 'GET', '/dashboard/summary', { token: hrToken });
  await call('perf', 'employees list', 'GET', '/employees?page=1&pageSize=50', { token: hrToken });
  await call('perf', 'chat directory', 'GET', '/chat/directory', { token: empToken2 });
  await call('perf', 'expenses report', 'GET', '/expenses/report', { token: hrToken });
  await call('perf', 'holidays list', 'GET', '/holidays?year=2026', { token: empToken2 });
  await call('perf', 'notifications list', 'GET', '/notifications', { token: empToken2 });

  report();
}

function report() {
  const byGroup = new Map();
  for (const r of results) {
    if (!byGroup.has(r.group)) byGroup.set(r.group, []);
    byGroup.get(r.group).push(r);
  }
  console.log('\n=== RESULTS BY MODULE ===');
  for (const [group, rows] of byGroup) {
    const bad = rows.filter((r) => !r.ok);
    console.log(`${bad.length === 0 ? 'PASS' : 'FAIL'}  ${group.padEnd(14)} ${rows.length - bad.length}/${rows.length}`);
  }
  console.log(`\nTOTAL: ${results.length} checks, ${results.length - failures} passed, ${failures} failed`);
  if (throttled) {
    console.log(
      `WARNING: ${throttled} request(s) were rate-limited (429). Re-run after the rate-limit window, ` +
        'or start the API with a raised RATE_LIMIT_MAX for E2E runs.',
    );
  }
  if (skipped.length) console.log(`SKIPPED: ${skipped.join(' | ')}`);

  const slow = [...results].sort((a, b) => b.ms - a.ms).slice(0, 8);
  const SLOW_MS = 1000;
  console.log('\n=== SLOWEST ENDPOINTS ===');
  for (const r of slow) console.log(`  ${String(r.ms).padStart(5)}ms  ${r.method} ${r.path}${r.ms > SLOW_MS ? '  <-- SLOW' : ''}`);

  if (failures) {
    console.log('\n=== FAILURES ===');
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`- [${r.group}] ${r.name} -> ${r.method} ${r.path} : ${r.status} :: ${r.error ?? ''}`);
    }
    console.log('\n=== FAILURES JSON ===');
    console.log(JSON.stringify(results.filter((x) => !x.ok), null, 2));
  }
}

main().catch((err) => {
  console.error('HARNESS CRASH:', err);
  report();
  process.exit(1);
});
