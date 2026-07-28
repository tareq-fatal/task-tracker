import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Task Tracker";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Shared OG/Twitter card image (falls back to it on every route that
// doesn't define its own). Kept text-light to sidestep Arabic shaping in
// satori — trilingual copy lives in the page metadata/JSON-LD instead.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #eef2ff 0%, #ffffff 55%, #fdf2f8 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 40,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 160,
              height: 160,
              borderRadius: 44,
              background: "linear-gradient(135deg, #6366F1 0%, #A855F7 50%, #EC4899 100%)",
              boxShadow: "0 20px 60px rgba(99,102,241,0.35)",
            }}
          >
            <svg width="88" height="88" viewBox="0 0 48 48" fill="none">
              <path
                d="M14 25.5L20.5 32L34 16"
                stroke="#fff"
                strokeWidth="4.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 72,
                fontWeight: 700,
                letterSpacing: -1.5,
                backgroundImage:
                  "linear-gradient(135deg, #6366F1 0%, #A855F7 50%, #EC4899 100%)",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Task Tracker
            </div>
            <div style={{ fontSize: 32, color: "#475569", marginTop: 4 }}>
              Boards · Sprints · Roadmaps · Reports
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
