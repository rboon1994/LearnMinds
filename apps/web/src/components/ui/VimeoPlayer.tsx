'use client';

import { useEffect, useRef } from 'react';
import VimeoPlayerSdk from '@vimeo/player';
import type { VimeoUrl } from '@vimeo/player';

type VimeoPlayerProps = {
  url: string;
  // Fired once per genuine watch session — 5s of continuous playback, not just clicking play.
  // Stored in a ref (not an effect dependency) so passing a new closure every render doesn't
  // tear down and re-attach the player's play/pause listeners mid-playback — same rationale as
  // VideoPlayer.tsx's upload-video tracker.
  onWatched?: () => void;
};

// Vimeo's Player SDK talks to the embed iframe over postMessage, so play/pause/ended events are
// observable even though the iframe itself is cross-origin — unlike a bare <iframe>, which is
// why EXTERNAL_LINK lessons could be tracked for Vimeo specifically but not arbitrary embeds.
export function VimeoPlayer({ url, onWatched }: VimeoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onWatchedRef = useRef(onWatched);
  const watchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasWatchedRef = useRef(false);
  onWatchedRef.current = onWatched;

  const clearWatchTimer = () => {
    if (watchTimerRef.current) {
      clearTimeout(watchTimerRef.current);
      watchTimerRef.current = null;
    }
  };

  const markWatched = () => {
    if (hasWatchedRef.current) return;
    hasWatchedRef.current = true;
    onWatchedRef.current?.();
  };

  useEffect(() => {
    if (!containerRef.current) return;
    hasWatchedRef.current = false;
    // VimeoUrl is a template-literal type TS can only check statically — `url` is a runtime
    // string already guaranteed (by the backend's normalizeVimeoUrl) to be a vimeo.com/
    // player.vimeo.com link, so the cast just tells TS what's already true at runtime.
    //
    // No `responsive: true`: that mode sizes Vimeo's own injected wrapper via a padding-bottom
    // trick based on the VIDEO's native aspect ratio, which fights this page's own aspect-locked
    // container (the `aspect-[15/9] lg:aspect-video` box in learn/[courseId]/page.tsx). The
    // bare <iframe> this replaces just filled that box exactly regardless of the video's native
    // ratio — the CSS overrides below reproduce that same "always fill the parent" behavior.
    const player = new VimeoPlayerSdk(containerRef.current, { url: url as VimeoUrl });

    // Not listening for 'seeking'/'seeked' is deliberate — same rationale as VideoPlayer.tsx:
    // a viewer scrubbing through a long video is still watching it.
    player.on('play', () => {
      clearWatchTimer();
      watchTimerRef.current = setTimeout(markWatched, 5000);
    });
    player.on('pause', clearWatchTimer);
    // A video shorter than the 5s threshold reaches 'ended' before the timer fires — count a
    // full playthrough as watched instead of letting clearWatchTimer silently drop it.
    player.on('ended', () => {
      clearWatchTimer();
      markWatched();
    });

    return () => {
      clearWatchTimer();
      player.destroy().catch(() => {});
    };
  }, [url]);

  return (
    // overflow-hidden + rounded-xl on this element matches the bare <iframe> being replaced
    // (`absolute inset-0 w-full h-full rounded-xl overflow-hidden`). The `!important` overrides
    // on the injected <iframe> are needed because Vimeo's oEmbed HTML ships its own inline
    // `style="width:...px;height:...px"` — without `!`, our classes lose to that inline style.
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden rounded-xl [&_iframe]:absolute! [&_iframe]:inset-0! [&_iframe]:h-full! [&_iframe]:w-full!"
    />
  );
}
