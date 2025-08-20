import { Router, Response } from "express";
import { PrismaService } from "../services/PrismaService";
import { AuthService } from "../auth/AuthService";
import { authenticateToken } from "../middleware/auth";
import { AuthenticatedRequest, ApiResponse } from "../types";

const router = Router();

// Initialize services
let prismaService: PrismaService;

const getServices = () => {
  if (!prismaService) {
    prismaService = new PrismaService();
  }
  return { prismaService };
};

// GET /api/v1/user/test
router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "User routes working",
    timestamp: new Date().toISOString(),
  });
});

// GET /api/v1/user/profile
router.get(
  "/profile",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: "Authentication required",
          error: "USER_NOT_AUTHENTICATED",
        } as ApiResponse);
        return;
      }

      const { prismaService } = getServices();

      const user = await prismaService.client.user.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          isEmailVerified: true,
          isActive: true,
          isSuspended: true,
          kycStatus: true,
          kycSubmittedAt: true,
          kycApprovedAt: true,
          twoFactorEnabled: true,
          createdAt: true,
          updatedAt: true,
          lastLoginAt: true,
        },
      });

      if (!user) {
        res.status(404).json({
          success: false,
          message: "User not found",
          error: "USER_NOT_FOUND",
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        message: "Profile retrieved successfully",
        data: user,
      } as ApiResponse);
    } catch (error) {
      console.error("Get profile error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get profile",
        error: "INTERNAL_ERROR",
      } as ApiResponse);
    }
  }
);

// PUT /api/v1/user/profile
router.put(
  "/profile",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: "Authentication required",
          error: "USER_NOT_AUTHENTICATED",
        } as ApiResponse);
        return;
      }

      const { firstName, lastName, username } = req.body;
      const { prismaService } = getServices();

      // Validate input
      const updateData: any = {};

      if (firstName !== undefined) {
        if (typeof firstName !== "string" || firstName.length > 50) {
          res.status(400).json({
            success: false,
            message: "First name must be a string with max 50 characters",
            error: "INVALID_FIRST_NAME",
          } as ApiResponse);
          return;
        }
        updateData.firstName = firstName.trim() || null;
      }

      if (lastName !== undefined) {
        if (typeof lastName !== "string" || lastName.length > 50) {
          res.status(400).json({
            success: false,
            message: "Last name must be a string with max 50 characters",
            error: "INVALID_LAST_NAME",
          } as ApiResponse);
          return;
        }
        updateData.lastName = lastName.trim() || null;
      }

      if (username !== undefined) {
        if (
          typeof username !== "string" ||
          username.length < 3 ||
          username.length > 30
        ) {
          res.status(400).json({
            success: false,
            message: "Username must be 3-30 characters long",
            error: "INVALID_USERNAME",
          } as ApiResponse);
          return;
        }

        const usernameRegex = /^[a-zA-Z0-9_-]+$/;
        if (!usernameRegex.test(username)) {
          res.status(400).json({
            success: false,
            message:
              "Username can only contain letters, numbers, hyphens, and underscores",
            error: "INVALID_USERNAME_FORMAT",
          } as ApiResponse);
          return;
        }

        // Check if username is already taken
        const existingUser = await prismaService.client.user.findUnique({
          where: { username: username.toLowerCase() },
          select: { id: true },
        });

        if (existingUser && existingUser.id !== req.user.id) {
          res.status(409).json({
            success: false,
            message: "Username is already taken",
            error: "USERNAME_TAKEN",
          } as ApiResponse);
          return;
        }

        updateData.username = username.toLowerCase();
      }

      // Update user
      const updatedUser = await prismaService.client.user.update({
        where: { id: req.user.id },
        data: updateData,
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          isEmailVerified: true,
          isActive: true,
          isSuspended: true,
          kycStatus: true,
          kycSubmittedAt: true,
          kycApprovedAt: true,
          twoFactorEnabled: true,
          createdAt: true,
          updatedAt: true,
          lastLoginAt: true,
        },
      });

      res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        data: updatedUser,
      } as ApiResponse);
    } catch (error) {
      console.error("Update profile error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update profile",
        error: "INTERNAL_ERROR",
      } as ApiResponse);
    }
  }
);

// POST /api/v1/user/change-password
router.post(
  "/change-password",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: "Authentication required",
          error: "USER_NOT_AUTHENTICATED",
        } as ApiResponse);
        return;
      }

      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        res.status(400).json({
          success: false,
          message: "Current password and new password are required",
          error: "MISSING_PASSWORDS",
        } as ApiResponse);
        return;
      }

      // Validate new password strength
      const passwordValidation = AuthService.validatePassword(newPassword);
      if (!passwordValidation.isValid) {
        res.status(400).json({
          success: false,
          message: "New password does not meet requirements",
          errors: passwordValidation.errors,
          error: "WEAK_PASSWORD",
        } as ApiResponse);
        return;
      }

      const { prismaService } = getServices();

      // Get user with password
      const user = await prismaService.client.user.findUnique({
        where: { id: req.user.id },
        select: { id: true, password: true },
      });

      if (!user) {
        res.status(404).json({
          success: false,
          message: "User not found",
          error: "USER_NOT_FOUND",
        } as ApiResponse);
        return;
      }

      // Verify current password
      const isValidPassword = await AuthService.comparePassword(
        currentPassword,
        user.password
      );
      if (!isValidPassword) {
        res.status(400).json({
          success: false,
          message: "Current password is incorrect",
          error: "INVALID_CURRENT_PASSWORD",
        } as ApiResponse);
        return;
      }

      // Hash new password
      const hashedNewPassword = await AuthService.hashPassword(newPassword);

      // Update password
      await prismaService.client.user.update({
        where: { id: req.user.id },
        data: { password: hashedNewPassword },
      });

      res.status(200).json({
        success: true,
        message: "Password changed successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to change password",
        error: "INTERNAL_ERROR",
      } as ApiResponse);
    }
  }
);

// GET /api/v1/user/account-status
router.get(
  "/account-status",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: "Authentication required",
          error: "USER_NOT_AUTHENTICATED",
        } as ApiResponse);
        return;
      }

      const { prismaService } = getServices();

      const user = await prismaService.client.user.findUnique({
        where: { id: req.user.id },
        select: {
          isEmailVerified: true,
          isActive: true,
          isSuspended: true,
          kycStatus: true,
          kycSubmittedAt: true,
          kycApprovedAt: true,
          twoFactorEnabled: true,
        },
      });

      if (!user) {
        res.status(404).json({
          success: false,
          message: "User not found",
          error: "USER_NOT_FOUND",
        } as ApiResponse);
        return;
      }

      const accountStatus = {
        isEmailVerified: user.isEmailVerified,
        isActive: user.isActive,
        isSuspended: user.isSuspended,
        kycStatus: user.kycStatus,
        kycSubmittedAt: user.kycSubmittedAt,
        kycApprovedAt: user.kycApprovedAt,
        twoFactorEnabled: user.twoFactorEnabled,
        canTrade:
          user.isActive && !user.isSuspended && user.kycStatus === "APPROVED",
        canWithdraw:
          user.isActive &&
          !user.isSuspended &&
          user.kycStatus === "APPROVED" &&
          user.isEmailVerified,
      };

      res.status(200).json({
        success: true,
        message: "Account status retrieved successfully",
        data: accountStatus,
      } as ApiResponse);
    } catch (error) {
      console.error("Get account status error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get account status",
        error: "INTERNAL_ERROR",
      } as ApiResponse);
    }
  }
);

export default router;
