const express = require("express");
const router = express.Router();
const { getStudentsByBranch, findStudent, addStudent, getAttendanceForBranchAndDate } = require("../lib/db");
const { toISODate } = require("../lib/seed");

// POST /api/roster/students
router.post("/students", async (req, res) => {
  try {
    const { name, roll, branch } = req.body;
    if (!name || !roll || !branch) {
      return res.status(400).json({ error: "Name, roll, and branch are required." });
    }

    const existing = await findStudent(branch, roll);
    if (existing) {
      return res.json({ message: "Student already exists.", student: existing });
    }

    const newStudent = await addStudent({ name, roll, branch });
    res.status(201).json({ message: "Student registered successfully.", student: newStudent });
  } catch (err) {
    console.error("[roster] Error adding student:", err.message);
    res.status(500).json({ error: "Internal server error." });
  }
});

// GET /api/roster/:branch?date=YYYY-MM-DD  (date optional, defaults to today)
router.get("/:branch", async (req, res) => {
  try {
    const branch = req.params.branch;
    const date = req.query.date || toISODate(new Date());

    const students = await getStudentsByBranch(branch);
    if (students.length === 0) {
      return res.status(404).json({ error: `No roster found for branch "${branch}".` });
    }

    const attendanceRecords = await getAttendanceForBranchAndDate(branch, date);

    const roster = students.map((s) => {
      const record = attendanceRecords.find((a) => a.student_id === s.id);
      return { roll: s.roll, name: s.name, status: record ? record.status : "unmarked" };
    });

    res.json({ branch, date, roster });
  } catch (err) {
    console.error("[roster] Error:", err.message);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;
