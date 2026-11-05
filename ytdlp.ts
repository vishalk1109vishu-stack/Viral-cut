import { run } from "./util";

/**
 * yt-dlp wrapper hardened against datacenter-IP bot detection.
 *
 * Empirically, the only thing that consistently gets YouTube to serve a
 * datacenter IP without "sign in to confirm you're not a bot" is forcing
 * the mobile player clients (android, ios). They speak a different API
 * path that does not trigger the JS BotGuard challenge. We still keep a
 * couple of generic options on top for resilience.
 */
export const YT_DLP_ARGS = [
  "--no-playlist",
  "--no-warnings",
  "--no-color",
  "--socket-timeout", "30",
  "--retries", "5",
  "--fragment-retries", "5",
  // Mobile player clients bypass YouTube's BotGuard on datacenter IPs.
  // yt-dlp falls through this list in order, so a single failed client
  // does not abort the whole download.
  "--extractor-args", "youtube:player_client=android,ios,default",
  "--user-agent", "Mozilla/5.0 (Linux; Android 13; SM-S908U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
];

const YT_URL_RE =
  /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com\/(watch\?[^ ]*v=[\w-]+|shorts\/[\w-]+|live\/[\w-]+)|youtu\.be\/[\w-]+)/i;

export function isYouTubeUrl(url: string): boolean {
  return YT_URL_RE.test(url.trim());
}

/** Reject playlists / channel pages that would download hundreds of videos. */
export function looksLikePlaylist(url: string): boolean {
  const u = url.trim();
  const hasVideo = /watch\?[^ ]*v=[\w-]+/i.test(u) || /youtu\.be\/[\w-]+/i.test(u) || /shorts\/[\w-]+/i.test(u);
  const onlyPlaylist = /[?&]list=/i.test(u) && !hasVideo;
  const channel = /youtube\.com\/(channel|c|user|@)/i.test(u);
  return onlyPlaylist || channel;
}

export interface YtMeta {
  id: string;
  title: string;
  duration: number;
  uploader?: string;
}

export async function probeYouTube(url: string): Promise<YtMeta> {
  const res = await run(
    "yt-dlp",
    [...YT_DLP_ARGS, "--skip-download", "--dump-single-json", url.trim()],
    { timeoutMs: 180_000, maxBufferBytes: 12_000_000 }
  );
  if (res.code !== 0) throw new Error(friendlyYtError(res.stderr || res.stdout));
  const j = JSON.parse(res.stdout) as { id?: string; title?: string; duration?: number; uploader?: string };
  return {
    id: j.id ?? "video",
    title: j.title ?? "YouTube video",
    duration: Number(j.duration ?? 0),
    uploader: j.uploader,
  };
}

export async function downloadYouTube(
  url: string,
  outPath: string,
  onPct: (pct: number) => void
): Promise<void> {
  const args = [
    ...YT_DLP_ARGS,
    "-f",
    "bv*[height<=720][ext=mp4]+ba[ext=m4a]/bv*[height<=720]+ba/b[height<=720]/bv*+ba/b",
    "--merge-output-format", "mp4",
    "--concurrent-fragments", "4",
    "--newline",
    "--progress-template", "download:PROG %(progress._percent_str)s",
    "--no-part",
    "-o", outPath,
    url.trim(),
  ];
  const res = await run("yt-dlp", args, {
    timeoutMs: 3 * 3600_000, // no artificial duration limits — but a hard 3h safety net
    onLine: (line) => {
      const m = line.match(/PROG\s+([\d.]+)%/);
      if (m) onPct(parseFloat(m[1]));
    },
  });
  if (res.code !== 0) throw new Error(friendlyYtError(res.stderr || res.stdout));
}

/** Map raw yt-dlp failures to messages a normal person can act on. */
export function friendlyYtError(stderr: string): string {
  const s = stderr.toLowerCase();
  if (s.includes("sign in to confirm") || s.includes("not a bot")) {
    return "YouTube is asking this server to solve a bot-check (it does this to datacenter IPs). Try the link again in a minute — yt-dlp will rotate clients. If it still fails, switch to the Upload tab and pick the video from your phone gallery; everything else works identically.";
  }
  if (s.includes("429") || s.includes("too many requests")) {
    return "YouTube is rate-limiting this server right now (HTTP 429). Please retry in a few minutes, or upload the video file directly.";
  }
  if (s.includes("video unavailable") || s.includes("private video")) {
    return "That video is unavailable or private. Check the link, or upload the file instead.";
  }
  if (s.includes("age") && (s.includes("restrict") || s.includes("confirm"))) {
    return "This video is age-restricted, so it needs sign-in. Upload the file instead.";
  }
  if (s.includes("is not a valid url") || s.includes("unsupported url")) {
    return "That does not look like a YouTube video link. Paste a link like https://www.youtube.com/watch?v=...";
  }
  if (s.includes("live event will begin") || s.includes("is live")) {
    return "This is a live stream. Wait until it ends, then clip it.";
  }
  const firstLine = stderr.split("\n").find((l) => l.startsWith("ERROR:"));
  return firstLine?.replace(/^ERROR:\s*/, "").slice(0, 300) || "YouTube download failed — try again, or use the Upload tab.";
}
