/**
 * Shared utilities for room operations.
 */

/**
 * Generates a 6-character alphanumeric room ID (no ambiguous chars).
 * @returns {string}
 */
export function generateRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

/**
 * Extracts a YouTube video ID from a string (URL or raw ID).
 * @param {string} input
 * @returns {string|null}
 */
export function extractVideoId(input) {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();

  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;

  const urlParams = new URLSearchParams(
    trimmed.includes("?") ? trimmed.split("?")[1] : "",
  );
  const v = urlParams.get("v");
  if (v) return v;

  const shortMatch = trimmed.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];

  const shortsMatch = trimmed.match(/shorts\/([A-Za-z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1];

  return null;
}
