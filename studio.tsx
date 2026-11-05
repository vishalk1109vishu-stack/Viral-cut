"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles, Link2, UploadCloud, Download, Copy, Check, AlertTriangle,
  Scissors, Loader2, RefreshCw, Clock, Languages, Crop, Flame, History,
} from "lucide-react";

/* ---------------- types ---------------- */

interface ClipDto {
  id: string; index: number; start: number; end: number; duration: number;
  score: number; hook: number; energy: number; pacing: number; flow: number;
  reason: string | null; title: string | null; hashtags: string | null;
  text: string | null; file: string | null; poster: string | null;
  ready: boolean; streamUrl: string; downloadUrl: string; posterUrl: string;
}
interface JobDto {
  id: string; source: string; url: string | null; title: string | null;
  duration: number | null; ratio: string; clipCount: number; clipLength: string;
  captions: boolean; status: string; stage: string; progress: number;
  error: string | null; language: string | null; clips: ClipDto[];
}

const RATIOS = [
  { v: "9:16", label: "9:16", hint: "Shorts / Reels / TikTok" },
  { v: "1:1", label: "1:1", hint: "Square" },
  { v: "4:5", label: "4:5", hint: "Feed" },
  { v: "16:9", label: "16:9", hint: "Wide" },
];
const LENGTHS = [
  { v: "auto", label: "Auto" },
  { v: "30", label: "30s" },
  { v: "45", label: "45s" },
  { v: "60", label: "60s" },
];

function fmt(s: number): string {
  const sec = Math.max(0, Math.round(s));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const r = sec % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return h ? `${h}:${mm}:${String(r).padStart(2, "0")}` : `${mm}:${String(r).padStart(2, "0")}`;
}

/* ---------------- small pieces ---------------- */

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-[44px] rounded-xl border px-3.5 py-2 text-sm font-medium transition-all touch-manipulation ${
        active
          ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-300 shadow-[0_0_18px_-6px_rgba(52,211,153,0.7)]"
          : "border-zinc-700/70 bg-zinc-900/60 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

function ScoreRing({ value }: { value: number }) {
  const color = value >= 75 ? "#34d399" : value >= 55 ? "#fbbf24" : "#a1a1aa";
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="#27272a" strokeWidth="3.5" />
        <circle
          cx="18" cy="18" r="15.5" fill="none" stroke={color} strokeWidth="3.5"
          strokeLinecap="round" strokeDasharray={`${Math.max(2, value)} 100`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-14 shrink-0 text-zinc-500">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-amber-400 transition-all"
          style={{ width: `${Math.min(100, Math.max(3, value))}%` }}
        />
      </div>
      <span className="w-7 text-right tabular-nums text-zinc-400">{value}</span>
    </div>
  );
}

function ClipCard({ clip, ratio }: { clip: ClipDto; ratio: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [w, h] = ratio.split(":").map(Number);
  const ar = `${w}/${h}`;

  const copyTags = async () => {
    if (!clip.hashtags) return;
    try {
      await navigator.clipboard.writeText(clip.hashtags);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  };

  return (
    <Card className="overflow-hidden border-zinc-800 bg-zinc-900/50">
      <CardContent className="p-4 space-y-3">
        <div className="flex gap-3">
          <div
            className="relative w-[46%] max-w-[190px] shrink-0 overflow-hidden rounded-xl bg-black"
            style={{ aspectRatio: ar }}
          >
            {clip.ready ? (
              <video
                className="h-full w-full object-cover"
                src={clip.streamUrl}
                poster={clip.posterUrl}
                controls
                playsInline
                preload="metadata"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-zinc-600">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-[10px] uppercase tracking-wider">rendering</span>
              </div>
            )}
            <span className="absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-zinc-200 backdrop-blur">
              {fmt(clip.start)} → {fmt(clip.end)}
            </span>
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-start gap-2">
              <ScoreRing value={clip.score} />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/90">
                  Virality score
                </p>
                <p className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-zinc-100">
                  {clip.title}
                </p>
              </div>
            </div>
            <div className="space-y-1.5 pt-1">
              <Bar label="Hook" value={clip.hook} />
              <Bar label="Energy" value={clip.energy} />
              <Bar label="Pacing" value={clip.pacing} />
              <Bar label="Flow" value={clip.flow} />
            </div>
          </div>
        </div>

        {clip.reason && (
          <p className="rounded-lg bg-zinc-900 px-3 py-2 text-xs leading-relaxed text-zinc-400">
            <Sparkles className="mr-1.5 inline h-3 w-3 text-emerald-400" />
            {clip.reason}
          </p>
        )}

        {clip.hashtags && (
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 flex-1 truncate text-xs text-emerald-300/80">{clip.hashtags}</p>
            <Button size="sm" variant="ghost" className="h-8 shrink-0 px-2 text-zinc-400" onClick={copyTags}>
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span className="ml-1 text-xs">{copied ? "Copied" : "Tags"}</span>
            </Button>
          </div>
        )}

        <Button
          className="w-full min-h-[44px] bg-emerald-500 font-semibold text-zinc-950 hover:bg-emerald-400"
          disabled={!clip.ready}
          onClick={() => {
            const a = document.createElement("a");
            a.href = clip.downloadUrl;
            a.download = "";
            document.body.appendChild(a);
            a.click();
            a.remove();
          }}
        >
          <Download className="mr-2 h-4 w-4" />
          {clip.ready ? "Download clip" : "Rendering…"}
        </Button>
      </CardContent>
    </Card>
  );
}

/* ---------------- main studio ---------------- */

export default function Studio() {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [ratio, setRatio] = useState("9:16");
  const [clipCount, setClipCount] = useState(4);
  const [clipLength, setClipLength] = useState("auto");
  const [captions, setCaptions] = useState(true);
  const [job, setJob] = useState<JobDto | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [recent, setRecent] = useState<JobDto[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const refreshRecent = useCallback(() => {
    fetch("/api/jobs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { jobs?: JobDto[] } | null) => {
        if (d?.jobs) setRecent(d.jobs.filter((j) => j.clips.length > 0).slice(0, 4));
      })
      .catch(() => undefined);
  }, []);

  const startPolling = useCallback(
    (id: string) => {
      stopPoll();
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
          if (!res.ok) return;
          const data = (await res.json()) as { job: JobDto };
          setJob(data.job);
          if (data.job.status === "done" || data.job.status === "error") {
            stopPoll();
            refreshRecent();
          }
        } catch {
          /* transient network error — keep polling */
        }
      }, 2000);
    },
    [stopPoll, refreshRecent]
  );

  // resume unfinished job + load recent shelf
  useEffect(() => {
    const last = localStorage.getItem("vc_last_job");
    if (last) {
      fetch(`/api/jobs/${last}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { job?: JobDto } | null) => {
          if (d?.job && d.job.status !== "error") {
            setJob(d.job);
            if (d.job.status === "queued" || d.job.status === "working") startPolling(d.job.id);
          }
        })
        .catch(() => undefined);
    }
    refreshRecent();
    return stopPoll;
  }, [startPolling, stopPoll, refreshRecent]);

  const submit = async () => {
    if (submitting) return;
    const isUploadTab = file !== null;
    if (!isUploadTab && !url.trim()) {
      toast({ title: "Paste a YouTube link first", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      let res: Response;
      if (isUploadTab) {
        // raw-stream upload: file is the request body, options in the query
        // string — streams to disk server-side, so multi-GB videos are fine
        const qs = new URLSearchParams({
          ratio,
          clipCount: String(clipCount),
          clipLength,
          captions: String(captions),
          name: file.name,
        });
        res = await fetch(`/api/jobs?${qs}`, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
      } else {
        res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim(), ratio, clipCount, clipLength, captions }),
        });
      }
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        toast({ title: data.error ?? "Could not start", variant: "destructive" });
        return;
      }
      localStorage.setItem("vc_last_job", data.id);
      const jobRes = await fetch(`/api/jobs/${data.id}`, { cache: "no-store" });
      const jd = (await jobRes.json()) as { job: JobDto };
      setJob(jd.job);
      startPolling(data.id);
      refreshRecent();
      setTimeout(() => document.getElementById("progress-anchor")?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
    } catch {
      toast({ title: "Network error — try again", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const active = job && (job.status === "queued" || job.status === "working");

  return (
    <section id="studio" className="mx-auto w-full max-w-3xl space-y-4">
      {/* -------- input card -------- */}
      <Card className="border-zinc-800 bg-zinc-900/60 shadow-2xl shadow-black/40 backdrop-blur">
        <CardContent className="space-y-5 p-4 sm:p-6">
          <Tabs defaultValue="link">
            <TabsList className="grid h-11 w-full grid-cols-2 bg-zinc-950/80">
              <TabsTrigger value="link" className="gap-2 data-[state=active]:bg-zinc-800">
                <Link2 className="h-4 w-4" /> YouTube link
              </TabsTrigger>
              <TabsTrigger value="upload" className="gap-2 data-[state=active]:bg-zinc-800">
                <UploadCloud className="h-4 w-4" /> Upload video
              </TabsTrigger>
            </TabsList>

            <TabsContent value="link" className="mt-4 space-y-4">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                inputMode="url"
                autoComplete="off"
                className="h-12 border-zinc-700 bg-zinc-950/70 text-base text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/60"
              />
              <p className="text-xs leading-relaxed text-zinc-500">
                Any duration — 5 minutes or 5 hours. Videos, podcasts, interviews, streams (after they end).
              </p>
            </TabsContent>

            <TabsContent value="upload" className="mt-4 space-y-4">
              <label className="flex min-h-[110px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-950/50 px-4 py-6 text-center transition-colors hover:border-emerald-500/50">
                <UploadCloud className="h-7 w-7 text-emerald-400" />
                <span className="text-sm font-medium text-zinc-300">
                  {file ? file.name : "Tap to pick a video from your phone"}
                </span>
                {file && <span className="text-xs text-zinc-500">{(file.size / 1024 / 1024).toFixed(1)} MB</span>}
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <p className="text-xs text-zinc-500">
                Works 100% even when YouTube blocks server downloads — pick any video from your gallery.
              </p>
            </TabsContent>
          </Tabs>

          {/* options */}
          <div className="space-y-4 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                <Crop className="h-3.5 w-3.5" /> Aspect ratio
              </p>
              <div className="grid grid-cols-4 gap-2">
                {RATIOS.map((r) => (
                  <Chip key={r.v} active={ratio === r.v} onClick={() => setRatio(r.v)}>
                    {r.label}
                  </Chip>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-zinc-600">
                {RATIOS.find((r) => r.v === ratio)?.hint} — faces are tracked, nothing gets cut off.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Clips</p>
                <div className="grid grid-cols-2 gap-2">
                  {[3, 4].map((n) => (
                    <Chip key={n} active={clipCount === n} onClick={() => setClipCount(n)}>
                      {n} clips
                    </Chip>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Length</p>
                <div className="grid grid-cols-4 gap-2">
                  {LENGTHS.map((l) => (
                    <Chip key={l.v} active={clipLength === l.v} onClick={() => setClipLength(l.v)}>
                      {l.label}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-zinc-900/70 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Languages className="h-4 w-4 text-emerald-400" />
                <div>
                  <p className="text-sm font-medium text-zinc-200">Auto captions</p>
                  <p className="text-[11px] text-zinc-500">Karaoke style · EN · हिन्दी · اردو · 90+ languages</p>
                </div>
              </div>
              <Switch checked={captions} onCheckedChange={setCaptions} />
            </div>
          </div>

          <Button
            onClick={submit}
            disabled={submitting || active}
            className="h-13 w-full min-h-[52px] bg-gradient-to-r from-emerald-500 to-emerald-400 text-base font-bold text-zinc-950 shadow-lg shadow-emerald-500/20 hover:from-emerald-400 hover:to-emerald-300"
          >
            {active || submitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Working on it…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" /> Make my clips
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* -------- progress -------- */}
      <div id="progress-anchor" />
      {job && (active || job.status === "error") && (
        <Card className={`border ${job.status === "error" ? "border-red-900/60 bg-red-950/20" : "border-emerald-900/50 bg-emerald-950/10"}`}>
          <CardContent className="space-y-3 p-4 sm:p-5">
            {job.status === "error" ? (
              <>
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                  <div className="min-w-0">
                    <p className="font-semibold text-red-300">Couldn&apos;t finish this one</p>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-300">{job.error}</p>
                  </div>
                </div>
                <Button variant="outline" className="w-full border-zinc-700" onClick={() => setJob(null)}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Start over
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-emerald-300">{job.stage}</p>
                  <span className="tabular-nums text-sm font-bold text-emerald-400">{job.progress}%</span>
                </div>
                <Progress value={job.progress} className="h-2 bg-zinc-800 [&>div]:bg-gradient-to-r [&>div]:from-emerald-500 [&>div]:to-amber-400" />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
                  {job.title && <span className="max-w-full truncate text-zinc-400">🎬 {job.title}</span>}
                  {job.language && <span>🌐 {job.language}</span>}
                  {job.duration && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {fmt(job.duration)}
                    </span>
                  )}
                </div>
                <p className="text-[11px] leading-relaxed text-zinc-600">
                  Keep this page open — long videos take a while (roughly 1–4 minutes per 10 minutes of video). You can
                  close and come back; it keeps working.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* -------- results -------- */}
      {job && job.clips.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="flex items-center gap-2 text-base font-bold text-zinc-100">
              <Flame className="h-4 w-4 text-amber-400" />
              Your clips
            </h3>
            <Badge variant="outline" className="border-zinc-700 text-zinc-400">
              {job.ratio} · {job.clips.length} clips
            </Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {job.clips.map((c) => (
              <ClipCard key={c.id} clip={c} ratio={job.ratio} />
            ))}
          </div>
        </div>
      )}

      {/* -------- recent -------- */}
      {recent.length > 0 && (
        <Card className="border-zinc-800/70 bg-zinc-900/40">
          <CardContent className="p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-300">
              <History className="h-4 w-4 text-zinc-500" /> Recent renders
            </p>
            <div className="space-y-2">
              {recent.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setJob(r);
                    if (r.status === "queued" || r.status === "working") startPolling(r.id);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-left transition-colors hover:border-emerald-600/40"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">
                    <Scissors className="mr-1.5 inline h-3.5 w-3.5 text-emerald-500" />
                    {r.title ?? r.id}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {r.status === "done" ? `${r.clips.filter((c) => c.ready).length} clips` : r.stage}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
