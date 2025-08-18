import { Router } from "express";

const router = Router();

// GET /api/v1/balance/test
router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Balance routes working",
    timestamp: new Date().toISOString(),
  });
});

export default router;
