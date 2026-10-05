const express = require("express");
const router = express.Router();
const { getLeaveRequests, createLeaveRequest, updateLeaveStatus } = require("../lib/db");
const requireFaculty = require("../middleware/requireFaculty");

// GET /api/leave?branch=CSE&status=pending   (both filters optional)
// branch=all or omitted -> every branch. Used both for the per-branch
// approvals queue and for the "pending across all branches" overview.
router.get("/", async (req, res) => {
  try {
    const items = await getLeaveRequests({
      branch: req.query.branch,
      status: req.query.status,
    });
    res.json(items);
  } catch (err) {
    console.error("[leave] Error fetching:", err.message);
    res.status(500).json({ error: "Internal server error." });
  }
});

// POST /api/leave   { name, roll, branch, from, to, reason }
router.post("/", async (req, res) => {
  try {
    const { name, roll, branch, from, to, reason } = req.body || {};
    if (!name || !roll || !branch || !from || !to || !reason) {
      return res.status(400).json({ error: "name, roll, branch, from, to and reason are all required." });
    }
    if (new Date(to) < new Date(from)) {
      return res.status(400).json({ error: '"To" date cannot be before "From" date.' });
    }

    const request = await createLeaveRequest({ name, roll, branch, from, to, reason });
    res.status(201).json(request);
  } catch (err) {
    console.error("[leave] Error creating:", err.message);
    res.status(500).json({ error: "Internal server error." });
  }
});

// PATCH /api/leave/:id   { status: "approved" | "denied" }   [faculty only]
router.patch("/:id", requireFaculty, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body || {};
    if (!["approved", "denied"].includes(status)) {
      return res.status(400).json({ error: 'status must be "approved" or "denied".' });
    }

    const request = await updateLeaveStatus(id, status);
    if (!request) return res.status(404).json({ error: "Leave request not found." });

    res.json(request);
  } catch (err) {
    console.error("[leave] Error updating:", err.message);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;
