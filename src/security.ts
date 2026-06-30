import { randomUUID, timingSafeEqual } from "crypto";
import { Express, NextFunction, Request, Response } from "express";
import { IncomingHttpHeaders, IncomingMessage } from "http";
import { Duplex } from "stream";
import { logger } from "./logger";

type EdgeProtectionMode = "off" | "report" | "enforce";

type EdgeEvaluation = {
  mode: EdgeProtectionMode;
  host: string;
  protectedHost: boolean;
  edgeAuthenticated: boolean;
  deny: boolean;
  reason?: string;
};

const DEFAULT_PUBLIC_CHAT_HOSTS = [
  "chat-api.degencoinflip.com",
  "chatview-api.degencoinflip.com",
  "chat.degenrpc.com",
];

const RATE_LIMIT_WINDOW_CLEANUP_INTERVAL_MS = 60_000;
const RATE_LIMIT_BUCKET_MAX_IDLE_MS = 5 * 60_000;

type RateLimitBucket = {
  tokens: number;
  updatedAt: number;
};

const viewersRateLimitBuckets = new Map<string, RateLimitBucket>();
let lastRateLimitCleanupAt = 0;

const parseList = (value: string | undefined, defaults: string[]) => {
  const source = value === undefined ? defaults.join(",") : value;
  return source
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
};

const getHeader = (
  headers: IncomingHttpHeaders,
  name: string,
): string | undefined => {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

const getHost = (hostHeader: string | string[] | undefined) => {
  const raw = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const host = (raw || "").trim().toLowerCase();
  if (host.startsWith("[")) {
    return host.slice(1, host.indexOf("]"));
  }
  return host.split(":")[0];
};

const getPath = (requestUrl: string | undefined) => {
  if (!requestUrl) {
    return "/";
  }
  return requestUrl.split("?")[0] || "/";
};

const getProtectionMode = (): EdgeProtectionMode => {
  const mode = (process.env.EDGE_PROTECTION_MODE || "report").toLowerCase();
  if (mode === "off" || mode === "report" || mode === "enforce") {
    return mode;
  }
  return "report";
};

const getEdgeHeaderName = () =>
  (process.env.TRUSTED_EDGE_HEADER || "x-dcf-edge-secret")
    .trim()
    .toLowerCase();

const getTrustedEdgeSecret = () =>
  process.env.TRUSTED_EDGE_SECRET || process.env.EDGE_SHARED_SECRET || "";

const safeEquals = (received: string, expected: string) => {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
};

export const isProtectedPublicHost = (
  hostHeader: string | string[] | undefined,
) => {
  const host = getHost(hostHeader);
  const publicHosts = parseList(
    process.env.PUBLIC_CHAT_HOSTS,
    DEFAULT_PUBLIC_CHAT_HOSTS,
  );
  return publicHosts.includes(host);
};

export const isTrustedEdgeRequest = (headers: IncomingHttpHeaders) => {
  const expectedSecret = getTrustedEdgeSecret();
  if (!expectedSecret) {
    return false;
  }

  const receivedSecret = getHeader(headers, getEdgeHeaderName());
  return receivedSecret ? safeEquals(receivedSecret, expectedSecret) : false;
};

const evaluateEdgeRequest = (
  headers: IncomingHttpHeaders,
): EdgeEvaluation => {
  const mode = getProtectionMode();
  const host = getHost(headers.host);
  const protectedHost = isProtectedPublicHost(headers.host);
  const edgeAuthenticated = isTrustedEdgeRequest(headers);
  const deny = protectedHost && mode === "enforce" && !edgeAuthenticated;

  return {
    mode,
    host,
    protectedHost,
    edgeAuthenticated,
    deny,
    reason:
      protectedHost && !edgeAuthenticated
        ? getTrustedEdgeSecret()
          ? "missing-or-invalid-edge-secret"
          : "trusted-edge-secret-not-configured"
        : undefined,
  };
};

const firstForwardedFor = (headers: IncomingHttpHeaders) => {
  const forwardedFor = getHeader(headers, "x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim();
};

const getObservedClientIp = (
  headers: IncomingHttpHeaders,
  remoteAddress: string | undefined,
  edgeAuthenticated: boolean,
) => {
  if (edgeAuthenticated) {
    return (
      getHeader(headers, "cf-connecting-ip") ||
      firstForwardedFor(headers) ||
      remoteAddress ||
      "unknown"
    );
  }
  return remoteAddress || "unknown";
};

const getRequestId = (headers: IncomingHttpHeaders) =>
  getHeader(headers, "x-request-id") || getHeader(headers, "cf-ray") || randomUUID();

const getUserAgent = (headers: IncomingHttpHeaders) => {
  const userAgent = getHeader(headers, "user-agent") || "";
  return userAgent.slice(0, 180);
};

const edgeLogFields = (
  request: IncomingMessage,
  evaluation: EdgeEvaluation,
  surface: string,
) => ({
  event: "chat_edge_request",
  surface,
  requestId: getRequestId(request.headers),
  method: request.method,
  path: getPath(request.url),
  host: evaluation.host,
  protectedHost: evaluation.protectedHost,
  edgeMode: evaluation.mode,
  edgeAuthenticated: evaluation.edgeAuthenticated,
  clientIp: getObservedClientIp(
    request.headers,
    request.socket.remoteAddress,
    evaluation.edgeAuthenticated,
  ),
  remoteAddress: request.socket.remoteAddress,
  userAgent: getUserAgent(request.headers),
  reason: evaluation.reason,
});

const parseTrustProxy = () => {
  const value = process.env.TRUST_PROXY || "loopback";
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  if (/^\d+$/.test(normalized)) {
    return Number.parseInt(normalized, 10);
  }
  if (value.includes(",")) {
    return value.split(",").map((item) => item.trim());
  }
  return value;
};

const cleanupRateLimitBuckets = (now: number) => {
  if (now - lastRateLimitCleanupAt < RATE_LIMIT_WINDOW_CLEANUP_INTERVAL_MS) {
    return;
  }

  lastRateLimitCleanupAt = now;
  viewersRateLimitBuckets.forEach((bucket, key) => {
    if (now - bucket.updatedAt > RATE_LIMIT_BUCKET_MAX_IDLE_MS) {
      viewersRateLimitBuckets.delete(key);
    }
  });
};

const numberFromEnv = (name: string, defaultValue: number) => {
  const parsed = Number.parseFloat(process.env[name] || "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
};

const clientKeyForRequest = (req: Request, evaluation: EdgeEvaluation) => {
  const ip = getObservedClientIp(
    req.headers,
    req.ip || req.socket.remoteAddress,
    evaluation.edgeAuthenticated,
  );
  return `${evaluation.host || "unknown-host"}:${ip}`;
};

export const httpRequestObservability = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const startedAt = process.hrtime.bigint();
  const requestId = getRequestId(req.headers);
  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    const evaluation =
      (res.locals.edgeEvaluation as EdgeEvaluation | undefined) ||
      evaluateEdgeRequest(req.headers);
    const durationMs =
      Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    logger.info(
      {
        event: "chat_http_request",
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs),
        host: evaluation.host,
        protectedHost: evaluation.protectedHost,
        edgeMode: evaluation.mode,
        edgeAuthenticated: evaluation.edgeAuthenticated,
        clientIp: getObservedClientIp(
          req.headers,
          req.ip || req.socket.remoteAddress,
          evaluation.edgeAuthenticated,
        ),
        userAgent: getUserAgent(req.headers),
      },
      "chat http request",
    );
  });

  next();
};

export const enforceHttpEdgeProtection = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const evaluation = evaluateEdgeRequest(req.headers);
  res.locals.edgeEvaluation = evaluation;

  if (evaluation.deny) {
    logger.warn(edgeLogFields(req, evaluation, "http"), "chat edge denied");
    res.status(403).json({ error: true });
    return;
  }

  if (
    evaluation.protectedHost &&
    evaluation.mode === "report" &&
    !evaluation.edgeAuthenticated
  ) {
    logger.warn(
      edgeLogFields(req, evaluation, "http"),
      "chat edge missing trusted edge marker",
    );
  }

  next();
};

export const viewersRateLimit = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const ratePerSecond = numberFromEnv("CHAT_VIEWERS_RATE_PER_SECOND", 2);
  const burst = numberFromEnv("CHAT_VIEWERS_RATE_BURST", 20);
  const now = Date.now();
  const evaluation =
    (res.locals.edgeEvaluation as EdgeEvaluation | undefined) ||
    evaluateEdgeRequest(req.headers);
  const key = clientKeyForRequest(req, evaluation);
  const bucket = viewersRateLimitBuckets.get(key) || {
    tokens: burst,
    updatedAt: now,
  };
  const elapsedSeconds = Math.max(0, (now - bucket.updatedAt) / 1000);

  bucket.tokens = Math.min(burst, bucket.tokens + elapsedSeconds * ratePerSecond);
  bucket.updatedAt = now;
  cleanupRateLimitBuckets(now);

  res.setHeader("RateLimit-Limit", String(burst));
  res.setHeader("RateLimit-Policy", `${ratePerSecond};w=1;burst=${burst}`);

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    viewersRateLimitBuckets.set(key, bucket);
    next();
    return;
  }

  viewersRateLimitBuckets.set(key, bucket);
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((1 - bucket.tokens) / ratePerSecond),
  );

  res.setHeader("Retry-After", String(retryAfterSeconds));
  logger.warn(
    {
      event: "chat_viewers_rate_limited",
      requestId: getRequestId(req.headers),
      method: req.method,
      path: req.path,
      host: evaluation.host,
      protectedHost: evaluation.protectedHost,
      edgeAuthenticated: evaluation.edgeAuthenticated,
      clientIp: getObservedClientIp(
        req.headers,
        req.ip || req.socket.remoteAddress,
        evaluation.edgeAuthenticated,
      ),
      ratePerSecond,
      burst,
      retryAfterSeconds,
    },
    "chat viewers rate limited",
  );
  res.status(429).json({ error: true, message: "Rate limit exceeded" });
};

export const rejectUntrustedWebSocketUpgrade = (
  request: IncomingMessage,
  socket: Duplex,
  surface: string,
) => {
  const evaluation = evaluateEdgeRequest(request.headers);

  if (evaluation.deny) {
    logger.warn(edgeLogFields(request, evaluation, surface), "chat ws denied");
    socket.write(
      "HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
    );
    socket.destroy();
    return true;
  }

  if (
    evaluation.protectedHost &&
    evaluation.mode === "report" &&
    !evaluation.edgeAuthenticated
  ) {
    logger.warn(
      edgeLogFields(request, evaluation, surface),
      "chat ws missing trusted edge marker",
    );
  }

  if (evaluation.protectedHost && evaluation.edgeAuthenticated) {
    logger.info(edgeLogFields(request, evaluation, surface), "chat ws accepted");
  }

  return false;
};

export const shouldAcceptWebSocketRequest = (
  request: IncomingMessage,
  surface: string,
) => {
  const evaluation = evaluateEdgeRequest(request.headers);
  const allowed = !evaluation.deny;

  if (!allowed) {
    logger.warn(edgeLogFields(request, evaluation, surface), "chat ws denied");
  } else if (
    evaluation.protectedHost &&
    evaluation.mode === "report" &&
    !evaluation.edgeAuthenticated
  ) {
    logger.warn(
      edgeLogFields(request, evaluation, surface),
      "chat ws missing trusted edge marker",
    );
  } else if (evaluation.protectedHost && evaluation.edgeAuthenticated) {
    logger.info(edgeLogFields(request, evaluation, surface), "chat ws accepted");
  }

  return allowed;
};

export const configureHttpSecurity = (app: Express) => {
  const trustProxy = parseTrustProxy();
  app.set("trust proxy", trustProxy);
  logger.info(
    {
      event: "chat_security_configured",
      publicHosts: parseList(
        process.env.PUBLIC_CHAT_HOSTS,
        DEFAULT_PUBLIC_CHAT_HOSTS,
      ),
      edgeMode: getProtectionMode(),
      trustedEdgeHeader: getEdgeHeaderName(),
      trustedEdgeSecretConfigured: Boolean(getTrustedEdgeSecret()),
      trustProxy,
      viewersRatePerSecond: numberFromEnv("CHAT_VIEWERS_RATE_PER_SECOND", 2),
      viewersRateBurst: numberFromEnv("CHAT_VIEWERS_RATE_BURST", 20),
    },
    "chat security configured",
  );

  app.use(httpRequestObservability);
  app.use(enforceHttpEdgeProtection);
  app.use("/api/chat/viewers", viewersRateLimit);
};
