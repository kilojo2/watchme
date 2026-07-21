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
      <div className="w-full h-full flex items-center justify-center bg-black text-felt-gray text-[14px]">
        Paste a YouTube link to start.
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <YouTube
        key={roomState.currentVideoId}
        videoId={roomState.currentVideoId}
        opts={YT_OPTS}
        onReady={onReady}
        onStateChange={onStateChange}
        iframeClassName="w-full h-full"
      />
    </div>
  );
}
