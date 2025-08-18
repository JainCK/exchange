import { Router } from "express";

const router = Router();

// GET /api/v1/user/test
router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "User routes working",
    timestamp: new Date().toISOString(),
  });
});

export default router;
