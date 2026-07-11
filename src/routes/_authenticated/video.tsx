import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Video, StopCircle, Play, Download, RefreshCw, Eye, Smile, User,
  Sun, Shirt, AlertCircle, CheckCircle2, Camera,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/video")({
  component: VideoInterviewPage,
});

type Metrics = {
  facePresent: boolean;
  eyeContact: number; // 0-100
  attention: number; // 0-100
  smile: number; // 0-100
  posture: number; // 0-100
  brightness: number; // 0-100
  bgQuality: number; // 0-100
  samples: number;
};

const INITIAL: Metrics = {
  facePresent: false, eyeContact: 0, attention: 0, smile: 0,
  posture: 0, brightness: 0, bgQuality: 0, samples: 0,
};

// Native FaceDetector typing (Chromium only)
type FDBox = { x: number; y: number; width: number; height: number };
type FDLandmark = { type: string; locations: { x: number; y: number }[] };
type FDFace = { boundingBox: FDBox; landmarks?: FDLandmark[] };
type FaceDetectorLike = { detect: (src: CanvasImageSource) => Promise<FDFace[]> };

function VideoInterviewPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const replayRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const detectorRef = useRef<FaceDetectorLike | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);

  const [cameraOn, setCameraOn] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedSec, setRecordedSec] = useState(0);
  const [live, setLive] = useState<Metrics>(INITIAL);
  const [avg, setAvg] = useState<Metrics>(INITIAL);
  const aggRef = useRef<Metrics>({ ...INITIAL });
  const [error, setError] = useState<string | null>(null);
  const [detectorSupported, setDetectorSupported] = useState(true);

  const stopAnalysis = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const stopCamera = useCallback(() => {
    stopAnalysis();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
    setRecording(false);
  }, [stopAnalysis]);

  useEffect(() => {
    const FD = (window as unknown as { FaceDetector?: new (opts?: unknown) => FaceDetectorLike }).FaceDetector;
    if (FD) {
      try {
        detectorRef.current = new FD({ fastMode: true, maxDetectedFaces: 1 });
      } catch {
        setDetectorSupported(false);
      }
    } else {
      setDetectorSupported(false);
    }
    return () => { stopCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const analyzeFrame = useCallback(async () => {
    if (!runningRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(() => void analyzeFrame());
      return;
    }
    const w = 160;
    const h = Math.round((video.videoHeight / Math.max(1, video.videoWidth)) * w) || 120;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h).data;

    // brightness average
    let sum = 0;
    for (let i = 0; i < img.length; i += 4) {
      sum += (img[i] + img[i + 1] + img[i + 2]) / 3;
    }
    const bright = sum / (img.length / 4); // 0-255
    const brightness = Math.round((bright / 255) * 100);

    // background uniformity: variance of edge pixels (border strip)
    let edgeSum = 0, edgeSum2 = 0, edgeN = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x > 8 && x < w - 8 && y > 8 && y < h - 8) continue;
        const p = (y * w + x) * 4;
        const g = (img[p] + img[p + 1] + img[p + 2]) / 3;
        edgeSum += g; edgeSum2 += g * g; edgeN++;
      }
    }
    const mean = edgeSum / edgeN;
    const variance = edgeSum2 / edgeN - mean * mean;
    const std = Math.sqrt(Math.max(0, variance));
    // Lower std = more uniform bg. Map std 0..60 -> 100..40
    const bgUniformity = Math.max(0, Math.min(100, 100 - (std / 60) * 60));
    const brightBonus = brightness > 35 && brightness < 85 ? 100 : 60;
    const bgQuality = Math.round(bgUniformity * 0.6 + brightBonus * 0.4);

    let facePresent = false;
    let eyeContact = 0, attention = 0, smile = 0, posture = 0;

    if (detectorRef.current) {
      try {
        const faces = await detectorRef.current.detect(video);
        if (faces.length > 0) {
          facePresent = true;
          const f = faces[0];
          const cx = f.boundingBox.x + f.boundingBox.width / 2;
          const cy = f.boundingBox.y + f.boundingBox.height / 2;
          const vw = video.videoWidth || 640;
          const vh = video.videoHeight || 480;
          const dx = Math.abs(cx / vw - 0.5); // 0 center .. 0.5 edge
          const dy = Math.abs(cy / vh - 0.45);
          // eye contact ~ how centered horizontally
          eyeContact = Math.round(Math.max(0, 100 - dx * 260));
          attention = Math.round(Math.max(0, 100 - (dx + dy) * 180));
          // posture: face size + vertical position
          const rel = (f.boundingBox.width * f.boundingBox.height) / (vw * vh);
          // ideal rel ~ 0.08-0.20
          const sizeScore = rel < 0.03 ? 40 : rel > 0.35 ? 55 : 100 - Math.abs(rel - 0.13) * 300;
          posture = Math.round(Math.max(0, Math.min(100, sizeScore - dy * 80)));
          // smile heuristic: brightness of mouth region (lower-third of face box)
          const mx = Math.floor((f.boundingBox.x / vw) * w);
          const my = Math.floor(((f.boundingBox.y + f.boundingBox.height * 0.65) / vh) * h);
          const mw = Math.max(4, Math.floor((f.boundingBox.width / vw) * w));
          const mh = Math.max(3, Math.floor((f.boundingBox.height * 0.25 / vh) * h));
          let mMin = 255, mMax = 0;
          for (let y = my; y < Math.min(h, my + mh); y++) {
            for (let x = mx; x < Math.min(w, mx + mw); x++) {
              const p = (y * w + x) * 4;
              const g = (img[p] + img[p + 1] + img[p + 2]) / 3;
              if (g < mMin) mMin = g;
              if (g > mMax) mMax = g;
            }
          }
          const contrast = mMax - mMin;
          smile = Math.round(Math.max(0, Math.min(100, (contrast - 30) * 1.8)));
        }
      } catch {
        // detector failure -> fallback
      }
    }

    if (!detectorRef.current) {
      // fallback: assume face present if center is skin-toned & brighter than edges
      let cSum = 0, cN = 0;
      const cx0 = Math.floor(w * 0.35), cx1 = Math.floor(w * 0.65);
      const cy0 = Math.floor(h * 0.25), cy1 = Math.floor(h * 0.7);
      for (let y = cy0; y < cy1; y++) {
        for (let x = cx0; x < cx1; x++) {
          const p = (y * w + x) * 4;
          const r = img[p], gCh = img[p + 1], b = img[p + 2];
          const skin = r > 80 && gCh > 40 && b > 30 && r > gCh && r > b;
          if (skin) cN++;
          cSum += (r + gCh + b) / 3;
        }
      }
      const centerArea = (cx1 - cx0) * (cy1 - cy0);
      const skinRatio = cN / centerArea;
      facePresent = skinRatio > 0.05;
      eyeContact = Math.round(Math.min(100, skinRatio * 400));
      attention = eyeContact;
      posture = brightness > 30 ? 75 : 45;
      smile = 50;
    }

    const next: Metrics = {
      facePresent, eyeContact, attention, smile, posture,
      brightness, bgQuality, samples: live.samples + 1,
    };
    setLive(next);

    if (recording) {
      const a = aggRef.current;
      a.samples += 1;
      a.eyeContact += eyeContact;
      a.attention += attention;
      a.smile += smile;
      a.posture += posture;
      a.brightness += brightness;
      a.bgQuality += bgQuality;
      a.facePresent = facePresent;
    }

    rafRef.current = requestAnimationFrame(() => void analyzeFrame());
  }, [recording, live.samples]);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraOn(true);
      runningRef.current = true;
      rafRef.current = requestAnimationFrame(() => void analyzeFrame());
    } catch (err) {
      const e = err as DOMException;
      const msg =
        e?.name === "NotAllowedError" || e?.name === "SecurityError"
          ? "Camera & microphone blocked. Allow access in your browser's address bar."
          : e?.name === "NotFoundError"
            ? "No camera detected."
            : !window.isSecureContext
              ? "Camera requires HTTPS. Use the published site."
              : `Could not access camera: ${e?.message ?? "unknown"}`;
      setError(msg);
      toast.error(msg);
    }
  }, [analyzeFrame]);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
    }
    chunksRef.current = [];
    aggRef.current = { ...INITIAL };
    const mimeCandidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
    const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    try {
      const rec = mimeType ? new MediaRecorder(streamRef.current, { mimeType }) : new MediaRecorder(streamRef.current);
      recorderRef.current = rec;
      const start = Date.now();
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "video/webm" });
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
        setRecordedSec(Math.round((Date.now() - start) / 1000));
        const a = aggRef.current;
        const n = Math.max(1, a.samples);
        setAvg({
          facePresent: a.facePresent,
          eyeContact: Math.round(a.eyeContact / n),
          attention: Math.round(a.attention / n),
          smile: Math.round(a.smile / n),
          posture: Math.round(a.posture / n),
          brightness: Math.round(a.brightness / n),
          bgQuality: Math.round(a.bgQuality / n),
          samples: a.samples,
        });
        toast.success("Recording ready to replay");
      };
      rec.start(1000);
      setRecording(true);
      toast.success("Recording started");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Recording failed";
      setError(msg);
      toast.error(msg);
    }
  }, [recordedUrl]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setRecording(false);
  }, []);

  const downloadRecording = () => {
    if (!recordedUrl) return;
    const a = document.createElement("a");
    a.href = recordedUrl;
    a.download = `interview-${Date.now()}.webm`;
    a.click();
  };

  const bgTips = live.brightness < 30
    ? "Room is too dark — face a window or add a lamp."
    : live.brightness > 90
      ? "Overexposed — reduce backlight and avoid sitting in front of a window."
      : live.bgQuality < 55
        ? "Cluttered background — use a plain wall or blur your background."
        : "Background looks clean and well-lit.";

  const dressTips = [
    "Solid mid-tone shirt (navy, charcoal, muted green). Avoid busy prints.",
    "Collared shirt or blazer for senior/managerial roles.",
    "No logos, neon colors, or thin stripes (they moiré on camera).",
    "Groomed hair, minimal jewelry, clean neckline framing.",
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary">
            <Video className="size-4" /> Video Interview Lab
          </div>
          <h1 className="mt-1 text-3xl font-bold">Practice on camera with live coaching</h1>
          <p className="mt-1 text-muted-foreground">
            Webcam recording, eye contact & attention tracking, smile / posture analysis, background & dress code tips, then replay.
          </p>
        </header>

        {!detectorSupported && (
          <div className="flex items-start gap-3 rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 text-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-orange-500" />
            <div>
              Your browser doesn't support the native Face Detector. Metrics use a lightweight fallback — Chrome / Edge give the most accurate tracking.
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-black shadow-sm">
              <video
                ref={videoRef}
                muted
                playsInline
                className="aspect-video w-full object-cover"
              />
              {!cameraOn && (
                <div className="absolute inset-0 grid place-items-center bg-black/70 text-center text-white">
                  <div className="space-y-3">
                    <Camera className="mx-auto size-10 opacity-70" />
                    <p className="text-sm opacity-80">Camera is off</p>
                    <Button onClick={startCamera}>Enable camera & microphone</Button>
                  </div>
                </div>
              )}
              {cameraOn && (
                <div className="absolute right-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs text-white backdrop-blur">
                  <span className={`size-2 rounded-full ${recording ? "animate-pulse bg-red-500" : "bg-emerald-400"}`} />
                  {recording ? "REC" : "LIVE"}
                </div>
              )}
              <canvas ref={canvasRef} className="hidden" />
            </div>

            <div className="flex flex-wrap gap-2">
              {!cameraOn ? (
                <Button onClick={startCamera}>
                  <Camera className="mr-2 size-4" /> Start camera
                </Button>
              ) : !recording ? (
                <>
                  <Button onClick={startRecording}>
                    <Video className="mr-2 size-4" /> Start recording
                  </Button>
                  <Button variant="outline" onClick={stopCamera}>Stop camera</Button>
                </>
              ) : (
                <Button variant="destructive" onClick={stopRecording}>
                  <StopCircle className="mr-2 size-4" /> Stop recording
                </Button>
              )}
            </div>

            {recordedUrl && (
              <div className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm backdrop-blur-xl">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wider text-primary">Replay</div>
                    <div className="text-sm text-muted-foreground">{recordedSec}s recorded · {avg.samples} frames analyzed</div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => replayRef.current?.play()}>
                      <Play className="mr-2 size-4" /> Play
                    </Button>
                    <Button variant="outline" size="sm" onClick={downloadRecording}>
                      <Download className="mr-2 size-4" /> Download
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { URL.revokeObjectURL(recordedUrl); setRecordedUrl(null); setAvg(INITIAL); }}>
                      <RefreshCw className="mr-2 size-4" /> Clear
                    </Button>
                  </div>
                </div>
                <video ref={replayRef} src={recordedUrl} controls className="aspect-video w-full rounded-lg bg-black" />
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <MetricCard icon={Eye} label="Eye contact" value={avg.eyeContact} />
                  <MetricCard icon={User} label="Attention" value={avg.attention} />
                  <MetricCard icon={Smile} label="Smile" value={avg.smile} />
                  <MetricCard icon={User} label="Posture" value={avg.posture} />
                  <MetricCard icon={Sun} label="Lighting" value={avg.brightness} />
                  <MetricCard icon={CheckCircle2} label="Background" value={avg.bgQuality} />
                </div>
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm backdrop-blur-xl">
              <div className="text-xs font-medium uppercase tracking-wider text-primary">Live metrics</div>
              <div className="mt-3 space-y-3">
                <LiveRow label="Face detected" value={live.facePresent ? 100 : 0} suffix={live.facePresent ? "Yes" : "No"} />
                <LiveRow icon={Eye} label="Eye contact" value={live.eyeContact} />
                <LiveRow icon={User} label="Attention" value={live.attention} />
                <LiveRow icon={Smile} label="Smile" value={live.smile} />
                <LiveRow icon={User} label="Posture" value={live.posture} />
                <LiveRow icon={Sun} label="Lighting" value={live.brightness} />
                <LiveRow icon={CheckCircle2} label="Background" value={live.bgQuality} />
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm backdrop-blur-xl">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary">
                <Sun className="size-4" /> Background check
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{bgTips}</p>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm backdrop-blur-xl">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary">
                <Shirt className="size-4" /> Dress code tips
              </div>
              <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                {dressTips.map((t) => (
                  <li key={t} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  const tone = value >= 70 ? "text-emerald-500" : value >= 45 ? "text-orange-500" : "text-destructive";
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${tone}`}>{value}</div>
    </div>
  );
}

function LiveRow({ icon: Icon, label, value, suffix }: { icon?: React.ComponentType<{ className?: string }>; label: string; value: number; suffix?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {Icon && <Icon className="size-3.5" />} {label}
        </span>
        <span className="font-mono tabular-nums">{suffix ?? `${value}%`}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full transition-all ${value >= 70 ? "bg-emerald-500" : value >= 45 ? "bg-orange-500" : "bg-destructive"}`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}
