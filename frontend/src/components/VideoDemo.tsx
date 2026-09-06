"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

/* --------------------------------------------------------------------------
   The one place to configure the demo.

   Set `source` and the section appears on the landing page. Leave it null and
   the section renders nothing at all, so a half-finished walkthrough can never
   reach production as an empty frame or a "coming soon" placeholder.

     Self-hosted:  { kind: "file", src: "/demo/walkthrough.mp4" }
                   Put the file in frontend/public/demo/. Best quality and no
                   third party, but it counts against Vercel's bandwidth and
                   the repo should not carry a large binary — keep it under
                   ~50MB or move it to object storage and use the full URL.

     YouTube:      { kind: "youtube", id: "dQw4w9WgXcQ" }
     Vimeo:        { kind: "vimeo",   id: "76979871" }
                   Free hosting and adaptive bitrate. Note that either one adds
                   a third party to the privacy policy and the subprocessor
                   list — nothing loads from them until the viewer presses play
                   (see the facade below), but once it does, it is their player.

   `chapters` is optional. Give timestamps in seconds and each becomes a
   clickable marker that starts the video at that point. Left empty until there
   is a real video to take timings from — inventing them would put times on
   screen that do not match anything.
   -------------------------------------------------------------------------- */

type DemoSource =
  | { kind: "file"; src: string; type?: string }
  | { kind: "youtube"; id: string }
  | { kind: "vimeo"; id: string };

interface Chapter {
  /** Seconds from the start. */
  at: number;
  label: string;
}

export interface DemoConfig {
  source: DemoSource | null;
  /** A still from the video, in public/. Falls back to a drawn placeholder. */
  poster: string | null;
  /** Shown on the facade, e.g. "4 min". Free text; omit if unknown. */
  runtime: string;
  chapters: Chapter[];
}

export const DEMO: DemoConfig = {
  source: null,
  poster: null,
  runtime: "",
  chapters: [],
};

const EASE = [0.23, 1, 0.32, 1] as const;

/** mm:ss for a chapter marker. */
function stamp(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * `config` exists so the section can be previewed with a source without editing
 * the shipping constant — the landing page always passes nothing and gets DEMO.
 */
export function VideoDemo({ config = DEMO }: { config?: DemoConfig }) {
  const [playing, setPlaying] = useState(false);
  const [seekTo, setSeekTo] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduced = useReducedMotion() ?? false;
  const source = config.source;

  const start = useCallback((at = 0) => {
    setSeekTo(at);
    setPlaying(true);
  }, []);

  // Seeking a file we already control is just a property set; no reload.
  const jump = useCallback(
    (at: number) => {
      if (source?.kind === "file" && playing && videoRef.current) {
        videoRef.current.currentTime = at;
        void videoRef.current.play();
        return;
      }
      start(at);
    },
    [source, playing, start],
  );

  useEffect(() => {
    if (source?.kind === "file" && playing && videoRef.current && seekTo > 0) {
      videoRef.current.currentTime = seekTo;
    }
  }, [source, playing, seekTo]);

  if (!source) return null;

  return (
    <section id="demo" className="mx-auto max-w-5xl scroll-mt-28 px-6 py-24">
      <div className="mb-10 max-w-2xl">
        <h2 className="text-[clamp(1.7rem,3.6vw,2.5rem)] font-semibold tracking-[-0.022em] text-text">
          Watch it run.
        </h2>
        <p className="mt-4 max-w-xl text-[14.5px] leading-relaxed text-muted">
          A walkthrough of the real dashboard: a live disruption arriving, the risk it raises, the
          factors behind the score, and the mitigation tracked to completion.
        </p>
      </div>

      <div
        className="relative overflow-hidden rounded-panel border"
        style={{
          borderColor: playing ? "rgba(91,141,239,0.4)" : "rgba(148,163,184,0.14)",
          background: "#0e131b",
          boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
        }}
      >
        <div className="relative aspect-video w-full">
          {playing ? (
            <Player source={source} seekTo={seekTo} videoRef={videoRef} />
          ) : (
            <Facade
              poster={config.poster}
              runtime={config.runtime}
              reduced={reduced}
              onPlay={start}
            />
          )}
        </div>
      </div>

      {config.chapters.length > 0 && (
        <nav aria-label="Chapters" className="mt-5 flex flex-wrap gap-2">
          {config.chapters.map((c) => (
            <button
              key={c.at}
              type="button"
              onClick={() => jump(c.at)}
              className="group flex items-center gap-2 rounded-control border px-3 py-1.5 text-left transition-colors"
              style={{
                borderColor: "rgba(148,163,184,0.14)",
                background: "rgba(16,21,30,0.7)",
              }}
            >
              <span className="num text-[10.5px] text-accent/80">{stamp(c.at)}</span>
              <span className="text-[12.5px] text-muted transition-colors group-hover:text-text">
                {c.label}
              </span>
            </button>
          ))}
        </nav>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The click-to-play cover.
 *
 * Nothing is requested from a video host until this is pressed. That is partly
 * performance — an embedded player is a megabyte of script most visitors never
 * run — and partly the honest thing: the privacy policy says no third party
 * gets a request until you ask for one, and a cold iframe would make that false
 * on page load.
 */
function Facade({
  poster,
  runtime,
  reduced,
  onPlay,
}: {
  poster: string | null;
  runtime: string;
  reduced: boolean;
  onPlay: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPlay()}
      aria-label="Play the product walkthrough"
      className="group absolute inset-0 h-full w-full cursor-pointer"
    >
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <PlaceholderArt />
      )}

      {/* Scrim, so the control reads against any frame the poster happens to be. */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 50%, rgba(6,9,15,0.28) 0%, rgba(6,9,15,0.72) 100%)",
        }}
      />

      <span className="absolute inset-0 flex flex-col items-center justify-center gap-4">
        <motion.span
          className="flex h-16 w-16 items-center justify-center rounded-full border"
          style={{
            borderColor: "rgba(91,141,239,0.5)",
            background: "rgba(11,14,21,0.72)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
          initial={false}
          whileHover={reduced ? undefined : { scale: 1.06 }}
          whileTap={reduced ? undefined : { scale: 0.97 }}
          transition={{ duration: 0.24, ease: EASE }}
        >
          {/* Nudged right by a hair: a triangle's optical centre is left of its
              bounding box, so a centred one looks like it is drifting. */}
          <svg width="20" height="22" viewBox="0 0 20 22" aria-hidden className="ml-[3px]">
            <polygon points="0,0 20,11 0,22" fill="#5b8def" />
          </svg>
        </motion.span>

        <span className="flex items-center gap-2.5">
          <span className="text-[13.5px] font-medium text-text">Product walkthrough</span>
          {runtime && (
            <>
              <span aria-hidden className="h-3 w-px bg-line-strong" />
              <span className="num text-[11.5px] text-muted">{runtime}</span>
            </>
          )}
        </span>
      </span>
    </button>
  );
}

/**
 * Stands in for a poster still until a real frame is exported from the video.
 * Drawn from the design system rather than left as an empty box, so the section
 * never looks broken while the film is still being cut.
 */
function PlaceholderArt() {
  return (
    <span aria-hidden className="absolute inset-0 overflow-hidden">
      <span
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 120% at 50% 0%, rgba(91,141,239,0.16) 0%, rgba(11,14,21,0) 62%), #0b0e15",
        }}
      />
      <span
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148,163,184,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.07) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
    </span>
  );
}

/* -------------------------------------------------------------------------- */

function Player({
  source,
  seekTo,
  videoRef,
}: {
  source: DemoSource;
  seekTo: number;
  videoRef: React.RefObject<HTMLVideoElement>;
}) {
  if (source.kind === "file") {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full bg-black"
        src={source.src}
        controls
        autoPlay
        playsInline
        preload="metadata"
      />
    );
  }

  // youtube-nocookie and Vimeo's do-not-track flag: the least these players can
  // be asked to collect, given the viewer has chosen to load one.
  const src =
    source.kind === "youtube"
      ? `https://www.youtube-nocookie.com/embed/${source.id}?autoplay=1&rel=0&modestbranding=1${
          seekTo > 0 ? `&start=${Math.floor(seekTo)}` : ""
        }`
      : `https://player.vimeo.com/video/${source.id}?autoplay=1&dnt=1${
          seekTo > 0 ? `#t=${Math.floor(seekTo)}s` : ""
        }`;

  return (
    <iframe
      // Remounts on a chapter jump, which is how these players accept a seek.
      key={src}
      className="absolute inset-0 h-full w-full"
      src={src}
      title="Chainsilience AI product walkthrough"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}
