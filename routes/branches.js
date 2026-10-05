const express = require("express");
const router = express.Router();
const { getAllBranches, getAttendanceForBranchAndDate } = require("../lib/db");
const { toISODate } = require("../lib/seed");

function computeTodayPct(attendanceRecords) {
  if (attendanceRecords.length === 0) return null; // nobody marked yet today
  const present = attendanceRecords.filter((a) => a.status === "present").length;
  return Math.round((present / attendanceRecords.length) * 100);
}

// GET /api/branches
router.get("/", async (req, res) => {
  try {
    const branches = await getAllBranches();
    const today = toISODate(new Date());

    // Fetch today's attendance for each branch in parallel
    const result = await Promise.all(
      branches.map(async (b) => {
        const records = await getAttendanceForBranchAndDate(b.code, today);
        return { ...b, today: computeTodayPct(records) };
      })
    );

    res.json(result);
  } catch (err) {
    console.error("[branches] Error:", err.message);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;
