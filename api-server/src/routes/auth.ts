import { Router } from "express";

const router = Router();

// GET /api/v1/auth/test
router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Auth routes working",
    timestamp: new Date().toISOString(),
  });
});

// TODO: Implement auth routes
// POST /api/v1/auth/register
// POST /api/v1/auth/login
// POST /api/v1/auth/logout
// POST /api/v1/auth/refresh
// POST /api/v1/auth/forgot-password
// POST /api/v1/auth/reset-password

export default router;
