import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
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
          fontSize: 200,
          fontWeight: 700,
          letterSpacing: -8,
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