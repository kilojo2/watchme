/**
 * TheaterToggle — button to toggle Theater Mode on/off.
 *
 * @param {{ isTheaterMode: boolean, onToggle: () => void }} props
 */
export default function TheaterToggle({ isTheaterMode, onToggle }) {
  return (
    <button
      onClick={onToggle}
      title={isTheaterMode ? "Exit Theater Mode" : "Theater Mode"}
      className={`p-2 rounded-none transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)]
        ${isTheaterMode
          ? "text-paper bg-paper/10"
          : "text-felt-gray hover:text-paper hover:bg-paper/5"
        }`}
    >
      {isTheaterMode ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
        </svg>
      )}
    </button>
  );
}
