/**
 * Database layer – Supabase edition.
 *
 * Previously this module used a local JSON file. Now every function talks
 * to Supabase via the JS client. The module keeps the same public API that
 * the routes expect (readDb/writeDb), **plus** a new set of granular helpers
 * the routes can call directly for better performance.
 *
 * The old readDb()/writeDb() functions are kept as thin compatibility shims
 * but routes should migrate to the individual helpers over time.
 */

const { supabase } = require("./supabase");
const { buildSeed, toISODate } = require("./seed");

// ---------------------------------------------------------------
// Initialisation – seed Supabase if tables are empty
// ---------------------------------------------------------------

async function initDb() {
  console.log("[db] Checking if Supabase tables need seeding…");

  // Check if branches table already has data
  const { data: existingBranches, error } = await supabase
    .from("branches")
    .select("code")
    .limit(1);

  if (error) {
    console.error("[db] Error checking branches table:", error.message);
    console.error("[db] Make sure you have run the SQL migration in Supabase Dashboard first!");
    process.exit(1);
  }

  if (existingBranches && existingBranches.length > 0) {
    console.log("[db] Supabase tables already have data – skipping seed.");
    return;
  }

  console.log("[db] Empty tables detected – seeding Supabase…");
  await seedSupabase();
  console.log("[db] Seeding complete.");
}

async function seedSupabase() {
  const seed = buildSeed();

  // 1) Insert branches
  const branchRows = seed.branches.map((b) => ({
    code: b.code,
    full_name: b.full,
    students: b.students,
    faculty: b.faculty,
  }));
  const { error: brErr } = await supabase.from("branches").insert(branchRows);
  if (brErr) throw new Error(`Seeding branches failed: ${brErr.message}`);

  // 2) Insert students
  const studentRows = seed.students.map((s) => ({
    name: s.name,
    roll: s.roll,
    branch: s.branch,
  }));
  const { data: insertedStudents, error: stErr } = await supabase
    .from("students")
    .insert(studentRows)
    .select("id, roll, branch");
  if (stErr) throw new Error(`Seeding students failed: ${stErr.message}`);

  // Build a mapping from (roll, branch) → new Supabase student id
  const studentIdMap = {};
  for (const s of insertedStudents) {
    studentIdMap[`${s.roll}|${s.branch}`] = s.id;
  }

  // 3) Insert attendance in batches (can be thousands of rows)
  const attRows = seed.attendance.map((a) => {
    const student = seed.students.find((s) => s.id === a.studentId);
    return {
      student_id: studentIdMap[`${student.roll}|${student.branch}`],
      branch: a.branch,
      date: a.date,
      status: a.status,
    };
  });

  // Supabase recommends batches of ~500 for large inserts
  const BATCH = 500;
  for (let i = 0; i < attRows.length; i += BATCH) {
    const batch = attRows.slice(i, i + BATCH);
    const { error: attErr } = await supabase.from("attendance").insert(batch);
    if (attErr) throw new Error(`Seeding attendance batch ${i} failed: ${attErr.message}`);
  }

  // 4) Insert archived yearly stats
  const archRows = seed.archivedStats.yearly.map((a) => ({
    branch: a.branch,
    year: a.year,
    pct: a.pct,
  }));
  const { error: archErr } = await supabase.from("archived_stats_yearly").insert(archRows);
  if (archErr) throw new Error(`Seeding archived stats failed: ${archErr.message}`);

  // 5) Insert leave requests
  const leaveRows = seed.leaveRequests.map((lr) => ({
    name: lr.name,
    roll: lr.roll,
    branch: lr.branch,
    from: lr.from,
    to: lr.to,
    reason: lr.reason,
    status: lr.status,
    createdAt: lr.createdAt,
    decidedAt: lr.decidedAt || null,
  }));
  const { error: leaveErr } = await supabase.from("leave_requests").insert(leaveRows);
  if (leaveErr) throw new Error(`Seeding leave requests failed: ${leaveErr.message}`);
}

// ---------------------------------------------------------------
// Branch helpers
// ---------------------------------------------------------------

async function getAllBranches() {
  const { data, error } = await supabase
    .from("branches")
    .select("*")
    .order("code");
  if (error) throw error;
  // Map DB column names back to the shape the frontend expects
  return data.map((b) => ({
    code: b.code,
    full: b.full_name,
    students: b.students,
    faculty: b.faculty,
  }));
}

// ---------------------------------------------------------------
// Student / Roster helpers
// ---------------------------------------------------------------

async function getStudentsByBranch(branch) {
  const { data, error } = await supabase
    .from("students")
    .select("*")
    .eq("branch", branch)
    .order("roll");
  if (error) throw error;
  return data;
}

async function findStudent(branch, roll) {
  const { data, error } = await supabase
    .from("students")
    .select("*")
    .eq("branch", branch)
    .eq("roll", roll)
    .maybeSingle();
  if (error) throw error;
  return data; // null if not found
}

async function addStudent({ name, roll, branch }) {
  // Make sure the branch exists
  const { data: existingBranch } = await supabase
    .from("branches")
    .select("code")
    .eq("code", branch)
    .maybeSingle();

  if (!existingBranch) {
    await supabase.from("branches").insert({
      code: branch,
      full_name: branch,
      students: 0,
      faculty: 0,
    });
  }

  const { data, error } = await supabase
    .from("students")
    .insert({ name, roll, branch })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------
// Attendance helpers
// ---------------------------------------------------------------

async function getAttendanceForBranchAndDate(branch, date) {
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("branch", branch)
    .eq("date", date);
  if (error) throw error;
  return data;
}

async function getAttendanceForBranch(branch) {
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("branch", branch);
  if (error) throw error;
  return data;
}

async function upsertAttendance({ studentId, branch, date, status }) {
  // Check if record exists
  const { data: existing } = await supabase
    .from("attendance")
    .select("id")
    .eq("student_id", studentId)
    .eq("date", date)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("attendance")
      .update({ status })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase
      .from("attendance")
      .insert({ student_id: studentId, branch, date, status })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}

async function getArchivedYearlyStats(branch, year) {
  const { data, error } = await supabase
    .from("archived_stats_yearly")
    .select("*")
    .eq("branch", branch)
    .eq("year", year)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------
// Leave helpers
// ---------------------------------------------------------------

async function getLeaveRequests({ branch, status } = {}) {
  let query = supabase.from("leave_requests").select("*");

  if (branch && branch !== "all") {
    query = query.eq("branch", branch);
  }
  if (status) {
    query = query.eq("status", status);
  }

  query = query.order("createdAt", { ascending: false });

  const { data, error } = await query;
  if (error) throw error;

  // Map DB column names to the shape the frontend expects
  return data.map((lr) => ({
    id: lr.id,
    name: lr.name,
    roll: lr.roll,
    branch: lr.branch,
    from: lr.from,
    to: lr.to,
    reason: lr.reason,
    status: lr.status,
    createdAt: lr.createdAt,
    decidedAt: lr.decidedAt,
  }));
}

async function createLeaveRequest({ name, roll, branch, from, to, reason }) {
  const { data, error } = await supabase
    .from("leave_requests")
    .insert({ name, roll, branch, from, to, reason, status: "pending" })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    roll: data.roll,
    branch: data.branch,
    from: data.from,
    to: data.to,
    reason: data.reason,
    status: data.status,
    createdAt: data.createdAt,
    decidedAt: data.decidedAt,
  };
}

async function updateLeaveStatus(id, status) {
  const { data, error } = await supabase
    .from("leave_requests")
    .update({ status, decidedAt: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    roll: data.roll,
    branch: data.branch,
    from: data.from,
    to: data.to,
    reason: data.reason,
    status: data.status,
    createdAt: data.createdAt,
    decidedAt: data.decidedAt,
  };
}

module.exports = {
  initDb,
  // Branch
  getAllBranches,
  // Students
  getStudentsByBranch,
  findStudent,
  addStudent,
  // Attendance
  getAttendanceForBranchAndDate,
  getAttendanceForBranch,
  upsertAttendance,
  getArchivedYearlyStats,
  // Leave
  getLeaveRequests,
  createLeaveRequest,
  updateLeaveStatus,
};
