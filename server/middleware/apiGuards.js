// API-key and rate-limit guards shared by every router.
//
// The guards are registered per route rather than on the mount path. That way
// a request for an unknown subpath (e.g. /api/clubs/club-01/nope) falls through
// to the app's JSON 404 instead of being rejected as an authentication error.
import { Router } from "express";
import { requireApiKey } from "./apiKey.js";
import { rateLimit } from "./rateLimit.js";

// 100 requests per consumer per 60 seconds — see SECURITY_AUDIT.md.
// Kept here so createApiRouter and GET /api/admin share one limiter instance.
export const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  max: Number(process.env.RATE_LIMIT_MAX || 100),
});

export const apiGuards = [requireApiKey, limiter];

const ROUTE_METHODS = ["get", "post", "put", "patch", "delete", "head", "options", "all"];

/**
 * Creates an Express router whose registered routes always run through
 * apiGuards. Registering the guards here (rather than with app.use) keeps auth
 * off unmatched paths while making it hard for a new route to forget them.
 */
export function createApiRouter() {
  const router = Router();

  for (const method of ROUTE_METHODS) {
    const register = router[method];
    router[method] = (path, ...handlers) => register.call(router, path, ...apiGuards, ...handlers);
  }

  return router;
}
