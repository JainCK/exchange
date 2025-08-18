import { Router } from "express";

const router = Router();

// GET /api/v1/order/test
router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Order routes working",
    timestamp: new Date().toISOString(),
  });
});

export default router;
