"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/** The hero film, chosen by QuickPro. It plays from YouTube's privacy-enhanced domain. */
export const HERO_VIDEO_ID = "PHezq3zCgGs";
const EMBED_ORIGIN = "https://www.youtube-nocookie.com";

function embedUrl(origin: string) {
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    loop: "1",
    // YouTube loops a single video only when it is also its own playlist.
    playlist: HERO_VIDEO_ID,
    playsinline: "1",
    controls: "0",
    rel: "0",
    enablejsapi: "1",
    origin,
  });
  return `${EMBED_ORIGIN}/embed/${HERO_VIDEO_ID}?${params}`;
}

/**
 * The hero's video. A thumbnail holds the space first, so nothing shifts while the
 * player loads. The film then starts muted and loops. For people who prefer
 * reduced motion it stays on the thumbnail until they press play.
 */
export function HeroVideo() {
  const frame = useRef<HTMLIFrameElement>(null);
  // null until mounted: the server can't know the visitor's motion preference.
  const [load, setLoad] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [origin, setOrigin] = useState("");
  const [thumb, setThumb] = useState(`https://i.ytimg.com/vi/${HERO_VIDEO_ID}/maxresdefault.jpg`);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Reading browser-only values once after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
    setLoad(!reduce);
    setPlaying(!reduce);
  }, []);

  function command(func: "playVideo" | "pauseVideo" | "mute" | "unMute") {
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args: [] }), EMBED_ORIGIN);
  }

  function togglePlay() {
    if (!load) {
      // Reduced motion: the first press loads the player, which then starts on its own.
      setLoad(true);
      setPlaying(true);
      return;
    }
    command(playing ? "pauseVideo" : "playVideo");
    setPlaying(!playing);
  }

  function toggleSound() {
    command(muted ? "unMute" : "mute");
    setMuted(!muted);
  }

  return (
    <figure className="relative">
      <div
        className="relative aspect-video overflow-hidden rounded-[24px] bg-qp-navy shadow-[0_1px_2px_rgba(11,22,51,0.08),0_30px_60px_-30px_rgba(11,22,51,0.45)] sm:rounded-[28px]"
        data-testid="hero-video"
      >
        <Image
          src={thumb}
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 620px, 100vw"
          className={`object-cover transition-opacity duration-500 ${ready ? "opacity-0" : "opacity-100"}`}
          onError={() => setThumb(`https://i.ytimg.com/vi/${HERO_VIDEO_ID}/hqdefault.jpg`)}
        />
        {load && origin ? (
          <iframe
            ref={frame}
            src={embedUrl(origin)}
            title="QuickPro video"
            allow="autoplay; encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => {
              setReady(true);
              // Matches the player to the buttons, for browsers that blocked autoplay.
              if (muted) command("mute");
            }}
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : null}

        <div className="absolute bottom-3 left-3 flex gap-2 sm:bottom-4 sm:left-4">
          <ControlButton label={playing && load ? "Pause video" : "Play video"} onClick={togglePlay}>
            {playing && load ? (
              <path d="M7 5v10M13 5v10" strokeWidth="2.4" strokeLinecap="round" />
            ) : (
              <path d="M7 4.8v10.4a.6.6 0 0 0 .9.5l8.2-5.2a.6.6 0 0 0 0-1L7.9 4.3a.6.6 0 0 0-.9.5Z" fill="currentColor" />
            )}
          </ControlButton>
          {load ? (
            <ControlButton label={muted ? "Turn sound on" : "Turn sound off"} onClick={toggleSound}>
              <path d="M3.5 8h2.8L10 4.8v10.4L6.3 12H3.5Z" fill="currentColor" strokeLinejoin="round" />
              {muted ? (
                <path d="m13 7.5 4 5M17 7.5l-4 5" strokeWidth="1.8" strokeLinecap="round" />
              ) : (
                <path d="M13 7.2a4 4 0 0 1 0 5.6M15.2 5a7 7 0 0 1 0 10" strokeWidth="1.8" strokeLinecap="round" />
              )}
            </ControlButton>
          ) : null}
        </div>
      </div>
    </figure>
  );
}

function ControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-qp-navy shadow-[0_4px_14px_-4px_rgba(11,22,51,0.4)] transition-colors duration-200 hover:bg-white hover:text-qp-blue"
    >
      <svg aria-hidden viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor">
        {children}
      </svg>
    </button>
  );
}
