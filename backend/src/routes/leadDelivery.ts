import { Router } from "express";
import { auth, roles } from "../middleware/auth";
import {
  getDeliverySchedule,
  getSalesCapacity,
  isWithinHoldWindow,
  releaseHeldLeads,
} from "../services/leadDelivery.service";

const r = Router();

/**
 * GET /api/lead-delivery/schedule
 * Return the exact admin lead-hold window and current delivery state.
 */
r.get("/schedule", auth, roles("ADMIN"), async (_req, res) => {
  const schedule = await getDeliverySchedule();
  res.json({ schedule, holding: isWithinHoldWindow(schedule) });
});

/**
 * PUT /api/lead-delivery/schedule
 * Save an exact date/time lead-hold window.
 */
r.put("/schedule", auth, roles("ADMIN"), async (req, res) => {
  const {
    enabled,
    holdFrom,
    holdUntil,
    timezone = "Asia/Kolkata",
  } = req.body ?? {};

  if (Boolean(enabled)) {
    if (!holdFrom || Number.isNaN(new Date(holdFrom).getTime())) {
      return res
        .status(400)
        .json({ message: "A valid hold start date and time is required" });
    }

    if (!holdUntil || Number.isNaN(new Date(holdUntil).getTime())) {
      return res
        .status(400)
        .json({ message: "A valid hold end date and time is required" });
    }

    if (new Date(holdUntil).getTime() <= new Date(holdFrom).getTime()) {
      return res
        .status(400)
        .json({ message: "Hold end must be after hold start" });
    }
  }

  const schedule = await getDeliverySchedule();
  schedule.enabled = Boolean(enabled);
  schedule.holdFrom = enabled ? new Date(holdFrom) : undefined;
  schedule.holdUntil = enabled ? new Date(holdUntil) : undefined;
  schedule.timezone = timezone;
  schedule.updatedBy = req.user!.id;
  await schedule.save();

  const io = req.app.get("io");
  const result = await releaseHeldLeads(io);

  res.json({
    schedule,
    holding: isWithinHoldWindow(schedule),
    release: result,
  });
});

/**
 * GET /api/lead-delivery/capacity
 * Return today's automatic lead capacity for every active salesperson.
 */
r.get("/capacity", auth, roles("ADMIN"), async (_req, res) => {
  const capacity = await getSalesCapacity();
  res.json({ capacity });
});

/**
 * POST /api/lead-delivery/release
 * Manually attempt to release held leads when the hold window has ended.
 */
r.post("/release", auth, roles("ADMIN"), async (req, res) => {
  const result = await releaseHeldLeads(req.app.get("io"));
  res.json(result);
});

export default r;
