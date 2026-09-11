import http from "node:http";
import { WikiError } from "./errors.mjs";

export const MCP_INLINE_BYTES = 1024 * 1024;

// This wrapper is internal, never inferred from untrusted API response fields.
export class McpResourceResult {
  constructor(uri) {
    this.uri = uri;
  }
}

/** Bound the loopback bridge independently of trace workers and client speed. */
export class McpApiClient {
  constructor(server, origin, { maxConcurrent = 4, timeout = 30000 } = {}) {
    this.server = server;
    this.origin = origin;
    this.maxConcurrent = maxConcurrent;
    this.timeout = timeout;
    this.pending = new Set();
    this.closed = false;
  }

  async request(route, draft) {
    if (!route.startsWith("/api/"))
      throw new Error("Invalid internal API route");
    if (this.closed)
      throw new WikiError("MCP_CLOSED", "MCP bridge is closed.", 503);
    if (this.pending.size >= this.maxConcurrent)
      throw new WikiError(
        "MCP_BUSY",
        "MCP bridge is busy; retry shortly.",
        503,
      );
    const address = this.server.address();
    if (!address || typeof address === "string")
      throw new Error("Wiki is not listening");
    return new Promise((resolve, reject) => {
      let finished = false;
      const upstream = http.request({
        hostname: "127.0.0.1",
        port: address.port,
        path: route,
        method: draft ? "POST" : "GET",
        headers: {
          Host: new URL(this.origin).host,
          Origin: this.origin,
          "Content-Type": "application/json",
          "X-Wiki-Write": "1",
        },
      });
      const finish = (error, result) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        this.pending.delete(cancel);
        upstream.destroy();
        if (error) reject(error);
        else resolve(result);
      };
      const cancel = () =>
        finish(new WikiError("MCP_CLOSED", "MCP bridge is closed.", 503));
      this.pending.add(cancel);
      const timer = setTimeout(
        () =>
          finish(
            new WikiError(
              "MCP_TIMEOUT",
              "MCP API request timed out; retry saves with identical input and operation_id.",
              503,
            ),
          ),
        this.timeout,
      );
      upstream.on("error", (error) => finish(error));
      upstream.on("response", (response) => {
        const chunks = [];
        let size = 0;
        const ok = response.statusCode >= 200 && response.statusCode < 300;
        const oversized = () => {
          // Only successful GETs have a safe, repeatable resource URL. Never
          // convert an error or POST into a misleading success/download link.
          if (ok && !draft)
            finish(
              null,
              new McpResourceResult(new URL(route, this.origin).href),
            );
          else
            finish(
              new WikiError(
                "MCP_RESPONSE_TOO_LARGE",
                "API response is too large to inline; retry saves with identical input and operation_id.",
                503,
              ),
            );
        };
        response.on("error", (error) => finish(error));
        if (Number(response.headers["content-length"]) > MCP_INLINE_BYTES) {
          oversized();
          return;
        }
        response.on("data", (chunk) => {
          if (finished) return;
          size += chunk.length;
          if (size > MCP_INLINE_BYTES) return oversized();
          chunks.push(chunk);
        });
        response.on("end", () => {
          if (finished) return;
          try {
            const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (!ok)
              finish(
                new WikiError(
                  result.code || `HTTP_${response.statusCode}`,
                  result.error || `HTTP ${response.statusCode}`,
                  response.statusCode,
                ),
              );
            else finish(null, result);
          } catch (error) {
            finish(error);
          }
        });
      });
      upstream.end(draft ? JSON.stringify(draft) : undefined);
    });
  }

  close() {
    this.closed = true;
    for (const cancel of this.pending) cancel();
  }
}
