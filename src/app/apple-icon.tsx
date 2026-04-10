import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 55%, #60a5fa 100%)",
          color: "white",
          fontSize: 78,
          fontWeight: 700,
          borderRadius: 36,
          letterSpacing: -4,
        }}
      >
        P
      </div>
    ),
    {
      ...size,
    }
  );
}