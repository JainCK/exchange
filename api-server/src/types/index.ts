import { Request } from "express";

export interface User {
  id: string;
  email: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  isEmailVerified: boolean;
  isActive: boolean;
  isSuspended: boolean;
  kycStatus: KycStatus;
  twoFactorEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  username?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  twoFactorCode?: string;
}

export interface LoginResponse {
  user: Omit<User, "password">;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface JWTPayload {
  userId: string;
  email: string;
  username?: string;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  user: User;
}

export interface Balance {
  id: string;
  userId: string;
  asset: string;
  available: number;
  locked: number;
  total: number;
  updatedAt: Date;
}

export interface OrderRequest {
  tradingPair: string;
  side: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT";
  quantity: number;
  price?: number;
  timeInForce?: "GTC" | "IOC" | "FOK";
}

export interface OrderResponse {
  id: string;
  status: string;
  message?: string;
  executedQuantity: number;
  remainingQuantity: number;
  averagePrice: number;
  fills: any[];
}

export interface TransactionRequest {
  type: "DEPOSIT" | "WITHDRAWAL";
  asset: string;
  amount: number;
  address?: string; // For withdrawals
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errors?: string[];
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export enum KycStatus {
  PENDING = "PENDING",
  SUBMITTED = "SUBMITTED",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  EXPIRED = "EXPIRED",
}

export enum OrderStatus {
  PENDING = "PENDING",
  OPEN = "OPEN",
  FILLED = "FILLED",
  CANCELLED = "CANCELLED",
  REJECTED = "REJECTED",
  PARTIALLY_FILLED = "PARTIALLY_FILLED",
}

export enum TransactionStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}
