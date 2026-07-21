import { useRef, useEffect } from "react";
import YouTube from "react-youtube";
import useVideoSync from "../hooks/useVideoSync";

/**
 * Options for YouTube player.
 */
const YT_OPTS = {
  height: "100%",
  width: "100%",
  playerVars: {
    autoplay: 0,
    controls: 1,
    rel: 0,
    modestbranding: 1,
    enablejsapi: 1,
  },
};

/**
 * VideoPlayer — YouTube player wrapper with sync.
 *
 * @param {{ roomId: string }} props
 */
export default function VideoPlayer({ roomId }) {
  const playerRef = useRef(null);

  const {
    roomState,
    handlePlayerStateChange,
    handlePlayerReady,
    setRoomVideo,
  } = useVideoSync(roomId, playerRef);

  const onReady = (event) => {
    playerRef.current = event.target;
    handlePlayerReady();
  };

  const onStateChange = (event) => {
    handlePlayerStateChange(event);
  };

  if (!roomState.currentVideoId) {
    return (
      <div className="w-full aspect-video flex items-center justify-center bg-black text-felt-gray text-[14px]">
        Paste a YouTube link to start.
      </div>
    );
  }

  return (
    <div className="w-full aspect-video relative">
      <YouTube
        key={roomState.currentVideoId}
        videoId={roomState.currentVideoId}
        opts={{ width: '100%', height: '100%', playerVars: YT_OPTS.playerVars }}
        onReady={onReady}
        onStateChange={onStateChange}
        className="absolute top-0 left-0 w-full h-full"
        iframeClassName="w-full h-full"
      />
    </div>
  );
}
