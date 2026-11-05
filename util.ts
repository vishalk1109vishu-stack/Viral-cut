import { spawn } from "child_process";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  /** Called for every stdout/stderr line (live progress). */
  onLine?: (line: string, source: "out" | "err") => void;
  timeoutMs?: number;
  maxBufferBytes?: number;
  env?: Record<string, string>;
}

/** Run a command, streaming lines to onLine. Resolves even on non-zero exit. */
export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, ...(opts.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const cap = opts.maxBufferBytes ?? 8_000_000;

    const timer = opts.timeoutMs
      ? setTimeout(() => {
          if (!settled) {
            settled = true;
            try {
              child.kill("SIGKILL");
            } catch {
              /* noop */
            }
            reject(new Error(`${cmd} timed out after ${Math.round(opts.timeoutMs! / 1000)}s`));
          }
        }, opts.timeoutMs)
      : null;

    const pump = (src: NodeJS.ReadableStream, source: "out" | "err") => {
      let buf = "";
      src.setEncoding("utf8");
      src.on("data", (chunk: string) => {
        if (source === "out" && stdout.length < cap) stdout += chunk;
        if (source === "err" && stderr.length < cap) stderr += chunk;
        buf += chunk;
        const lines = buf.split(/\r?\n|\r/);
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (t) opts.onLine?.(t, source);
        }
      });
      src.on("end", () => {
        const t = buf.trim();
        if (t) opts.onLine?.(t, source);
      });
    };

    pump(child.stdout, "out");
    pump(child.stderr, "err");

    child.on("error", (err) => {
      if (!settled) {
        settled = true;
        if (timer) clearTimeout(timer);
        reject(err);
      }
    });
    child.on("close", (code) => {
      if (!settled) {
        settled = true;
        if (timer) clearTimeout(timer);
        resolve({ code: code ?? -1, stdout, stderr });
      }
    });
  });
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function fmtTime(s: number): string {
  const sec = Math.max(0, Math.round(s));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const r = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}
