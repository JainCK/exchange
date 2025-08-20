import { Request, Response, NextFunction } from "express";
import { AuthService } from "../auth/AuthService";
import { PrismaService } from "../services/PrismaService";
import { AuthenticatedRequest, User } from "../types";

/**
 * Authentication middleware to verify JWT tokens
 */
export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({
        success: false,
        message: "Access token required",
        error: "MISSING_TOKEN",
      });
      return;
    }

    const token = AuthService.extractTokenFromHeader(authHeader);

    if (!token) {
      res.status(401).json({
        success: false,
        message: "Invalid token format",
        error: "INVALID_TOKEN_FORMAT",
      });
      return;
    }

    const payload = AuthService.verifyToken(token);

    if (!payload) {
      res.status(401).json({
        success: false,
        message: "Invalid or expired token",
        error: "INVALID_TOKEN",
      });
      return;
    }

    // Get user from database to ensure they still exist and are active
    const prisma = new PrismaService();
    const user = await prisma.client.user.findUnique({
      where: { id: payload.userId },
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
        twoFactorEnabled: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
      },
    });

    if (!user) {
      res.status(401).json({
        success: false,
        message: "User not found",
        error: "USER_NOT_FOUND",
      });
      return;
    }

    if (!user.isActive || user.isSuspended) {
      res.status(403).json({
        success: false,
        message: "Account is inactive or suspended",
        error: "ACCOUNT_SUSPENDED",
      });
      return;
    }

    // Attach user to request
    req.user = user as User;
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({
      success: false,
      message: "Authentication failed",
      error: "INTERNAL_ERROR",
    });
  }
};

/**
 * Middleware to require authentication (alias for authenticateToken)
 */
export const requireAuth = authenticateToken;

/**
 * Middleware to require email verification
 */
export const requireEmailVerification = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user?.isEmailVerified) {
    res.status(403).json({
      success: false,
      message: "Email verification required",
      error: "EMAIL_NOT_VERIFIED",
    });
    return;
  }
  next();
};

/**
 * Middleware to require KYC approval
 */
export const requireKYCApproval = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (req.user?.kycStatus !== "APPROVED") {
    res.status(403).json({
      success: false,
      message: "KYC approval required",
      error: "KYC_NOT_APPROVED",
      data: {
        currentStatus: req.user?.kycStatus,
      },
    });
    return;
  }
  next();
};

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      next();
      return;
    }

    const token = AuthService.extractTokenFromHeader(authHeader);

    if (!token) {
      next();
      return;
    }

    const payload = AuthService.verifyToken(token);

    if (!payload) {
      next();
      return;
    }

    // Get user from database
    const prisma = new PrismaService();
    const user = await prisma.client.user.findUnique({
      where: { id: payload.userId },
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
        twoFactorEnabled: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
      },
    });

    if (user && user.isActive && !user.isSuspended) {
      req.user = user as User;
    }

    next();
  } catch (error) {
    // Don't fail on optional auth errors
    next();
  }
};
