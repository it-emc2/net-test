// Augment Express's Request with the authenticated user set by requireAuth.
import "express";

declare global {
  namespace Express {
    interface Request {
      user?: { email: string };
    }
  }
}

export {};
