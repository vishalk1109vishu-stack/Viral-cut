import { run } from "./util";

export interface ProbeInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
}

/** ffprobe a media file. */
export async function probe(file: string): Promise<ProbeInfo> {
  const res = await run(
    "ffprobe",
    ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", file],
    { timeoutMs: 120_000 }
  );
  if (res.code !== 0) throw new Error(`Could not read media file (${res.stderr.slice(0, 200)})`);
  const j = JSON.parse(res.stdout) as {
    format?: { duration?: string };
    streams?: Array<Record<string, unknown>>;
  };
  const streams = j.streams ?? [];
  const v = streams.find((s) => s.codec_type === "video");
  const a = streams.find((s) => s.codec_type === "audio");
  const duration =
    parseFloat(String(j.format?.duration ?? "0")) ||
    parseFloat(String(v?.duration ?? "0")) ||
    0;
  const rate = String(v?.r_frame_rate ?? "30/1");
  const [rn, rd] = rate.split("/").map(Number);
  return {
    duration,
    width: Number(v?.width ?? 0),
    height: Number(v?.height ?? 0),
    fps: rd ? rn / rd : 30,
    hasAudio: Boolean(a),
  };
}

/** Extract 16 kHz mono WAV for transcription + energy analysis. */
export async function extractAudio(src: string, out: string): Promise<void> {
  const res = await run(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-y", "-i", src, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", out],
    { timeoutMs: 30 * 60_000 }
  );
  if (res.code !== 0) throw new Error(`Audio extraction failed: ${res.stderr.slice(-300)}`);
}

/** Make a tiny 2 fps grayscale-ish proxy for fast face/motion tracking. */
export async function makeProxy(src: string, out: string): Promise<void> {
  const res = await run(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", src,
      "-vf", "fps=2,scale=320:-2",
      "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30",
      out,
    ],
    { timeoutMs: 60 * 60_000 }
  );
  if (res.code !== 0) throw new Error(`Proxy generation failed: ${res.stderr.slice(-300)}`);
}

/** Grab a poster JPEG at time t (seconds). */
export async function grabPoster(src: string, t: number, out: string): Promise<void> {
  await run(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-y",
      "-ss", String(Math.max(0, t)),
      "-i", src,
      "-frames:v", "1",
      "-vf", "scale=540:-2",
      "-q:v", "4",
      out,
    ],
    { timeoutMs: 120_000 }
  );
}
