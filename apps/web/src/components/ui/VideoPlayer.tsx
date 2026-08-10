'use client';

import { useEffect, useRef } from 'react';
import videojs from 'video.js';
import type Player from 'video.js/dist/types/player';
import 'video.js/dist/video-js.css';

type VideoPlayerProps = {
  src: string;
  type?: string;
  // Fired once per genuine watch session — 5s of continuous playback, not just clicking play.
  // Stored in a ref (not an effect dependency) so passing a new closure every render doesn't
  // tear down and re-attach the player's play/pause listeners mid-playback.
  onWatched?: () => void;
};

// Video.js recommended React integration: create the <video-js> element imperatively once,
// then update its source on prop changes instead of re-creating the player each render.
export function VideoPlayer({ src, type = 'video/mp4', onWatched }: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
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
    if (!playerRef.current) {
      const videoElement = document.createElement('video-js');
      videoElement.classList.add('vjs-big-play-centered');
      // Without this, iOS Safari hands playback off to its own native fullscreen player and
      // Video.js's custom control bar stops responding to taps entirely.
      videoElement.setAttribute('playsinline', 'true');
      containerRef.current?.appendChild(videoElement);

      playerRef.current = videojs(videoElement, {
        controls: true,
        // `fill` (not `fluid`) makes the player match its container's actual box exactly,
        // regardless of the video's own aspect ratio — `fluid` sizes from the video's native
        // ratio instead, which silently pushed the control bar outside this container's
        // overflow-hidden clip whenever the two ratios didn't match exactly (looked fine,
        // but every button became unclickable since it was rendered outside the visible area).
        fill: true,
        playsinline: true,
        // Kept as defensive config for the native-controls handoff case, though tracing
        // Video.js's source confirmed it's a no-op for our setup (the <video-js> "ingest"
        // pattern below builds a bare tech element that never gets a native `controls`
        // attribute in the first place). The actual mobile-unclickable root cause was
        // overflow-hidden + rounded-xl on an ancestor wrapping both the video and its control
        // bar — a WebKit touch-hit-testing bug (see the <style> block below for the fix).
        html5: {
          nativeControlsForTouch: false,
          nativeAudioTracks: false,
          nativeVideoTracks: false,
        },
        sources: [{ src, type }],
      });

      const player = playerRef.current;
      // Not listening for 'seeking'/'seeked' is deliberate: a viewer scrubbing through a long
      // video is still watching it, and resetting the timer on every seek would mean someone
      // skimming a 30-minute video by jumping every few seconds could genuinely watch for
      // minutes and never once cross the 5s threshold.
      player.on('play', () => {
        clearWatchTimer();
        watchTimerRef.current = setTimeout(markWatched, 5000);
      });
      player.on('pause', clearWatchTimer);
      // A video shorter than the 5s threshold reaches 'ended' before the timer fires — count
      // a full playthrough as watched instead of letting clearWatchTimer silently drop it.
      player.on('ended', () => {
        clearWatchTimer();
        markWatched();
      });
    } else {
      clearWatchTimer();
      hasWatchedRef.current = false;
      playerRef.current.src([{ src, type }]);
    }
  }, [src, type]);

  useEffect(() => {
    return () => {
      clearWatchTimer();
      const player = playerRef.current;
      if (player && !player.isDisposed()) {
        player.dispose();
        playerRef.current = null;
      }
    };
  }, []);

  return (
    // absolute + inset-0 (not w-full/h-full) so this reliably fills its parent's exact box in
    // every browser, independent of percentage-height resolution — the parent (the caller's
    // aspect-video container) must be `position: relative` for this to anchor correctly.
    <div data-vjs-player className="absolute inset-0">
      {/* clip-path (not border-radius+overflow+transform) rounds the corners: it's a compositor
          -level mask, so it reliably clips a GPU-composited <video> layer on every browser —
          border-radius+overflow didn't (translateZ(0) "fixed" mobile clipping by forcing a
          layer, but that same promoted layer then ignored its own border-radius/overflow clip
          on desktop, so the video's square corners overflowed past the rounded background on
          resize). clip-path needs no forced layer promotion, so translateZ(0) is gone too.
          Scoped to .vjs-tech and .vjs-control-bar INDIVIDUALLY, not to their shared parent
          .video-js: clipping at the shared-ancestor level is exactly what caused the earlier
          "no button responds to touch on iOS" bug (a clip wrapping both the video's own
          composited layer and the separately-interactive control bar confuses WebKit's touch
          hit-testing). Each element clipping only itself avoids that regardless of mechanism. */}
      <div
        ref={containerRef}
        
        className="w-full h-full
          [&_.video-js]:bg-transparent!
          [&_.vjs-tech]:[clip-path:inset(0_0_0_0_round_0.75rem_0.75rem_0_0)]
          [&_.vjs-tech]:object-contain
          [&_.vjs-control-bar]:[clip-path:inset(0_0_0_0_round_0_0_0.75rem_0.75rem)]
          [&_.vjs-poster_img]:[clip-path:inset(0_0_0_0_round_0.75rem)]"
      />
    </div>
  );
}
