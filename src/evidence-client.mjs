import { WikiError } from "./errors.mjs";

// Operator-selected read-only service. No content URL can select an upstream host.
export class EvidenceClient {
  constructor(base) {
    this.base = new URL(base.endsWith("/") ? base : base + "/");
    if (
      !["http:", "https:"].includes(this.base.protocol) ||
      this.base.username ||
      this.base.password ||
      this.base.search ||
      this.base.hash
    )
      throw Error("Invalid evidence service URL");
  }
  async response(route, params = {}, headers = {}, timeout = 120000) {
    const url = new URL(route, this.base);
    for (const [key, value] of Object.entries(params))
      if (value !== undefined && value !== null && value !== "")
        url.searchParams.set(key, String(value));
    try {
      return await fetch(url, {
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(timeout),
      });
    } catch {
      throw new WikiError(
        "EVIDENCE_UNAVAILABLE",
        "The evidence service is temporarily unavailable.",
        503,
      );
    }
  }
  async json(route, params = {}, timeout = 120000) {
    const response = await this.response(route, params, {}, timeout);
    if (!response.ok)
      throw new WikiError(
        response.status === 404 ? "NOT_FOUND" : "EVIDENCE_UNAVAILABLE",
        response.status === 404
          ? "This archived item is unavailable."
          : response.status === 400
            ? "Invalid evidence query or page."
            : "The evidence service is temporarily unavailable.",
        [400, 404].includes(response.status) ? response.status : 503,
      );
    try {
      return await response.json();
    } catch {
      throw new WikiError(
        "EVIDENCE_UNAVAILABLE",
        "Invalid evidence service response.",
        503,
      );
    }
  }
  validateQuery(q, options) {
    if (
      typeof q !== "string" ||
      q.length > 300 ||
      !Number.isSafeInteger(Number(options.offset ?? 0)) ||
      Number(options.offset ?? 0) < 0 ||
      Number(options.offset ?? 0) > 1000000 ||
      !Number.isSafeInteger(Number(options.limit ?? 20)) ||
      Number(options.limit ?? 20) < 1 ||
      Number(options.limit ?? 20) > 100 ||
      String(options.machine || "").length > 100 ||
      !["", "codex", "pi", "claude"].includes(
        options.format || options.harness || "",
      )
    )
      throw new WikiError(
        "INVALID_SEARCH",
        "Invalid evidence search parameters.",
      );
  }
  async search(q, options = {}) {
    this.validateQuery(q, options);
    const result = await this.json(
      "search",
      { q, ...options, harness: options.format || options.harness },
      15000,
    );
    if (!Array.isArray(result.results))
      throw new WikiError(
        "EVIDENCE_UNAVAILABLE",
        "Invalid evidence search response.",
        503,
      );
    return result;
  }
  catalog(params = {}) {
    this.validateQuery(params.q || "", params);
    return this.json(
      "catalog",
      { ...params, harness: params.format || params.harness },
      15000,
    );
  }
  read(id, params = {}) {
    return this.json("traces/" + encodeURIComponent(id), params);
  }
  attachment(asset) {
    return this.json("attachments/" + encodeURIComponent(asset));
  }
  async health() {
    const results = await Promise.allSettled([
      this.json("health", {}, 5000),
      this.search("", { limit: 1 }),
    ]);
    const state = (r) =>
      r.status === "fulfilled"
        ? { state: "ready" }
        : { state: "degraded", error: r.reason.message };
    return { traceArchive: state(results[0]), traceSearch: state(results[1]) };
  }
}
