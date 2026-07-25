import { ImageResponse } from "next/og";
import { getClinicConfig } from "@/lib/clinic-config";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function AppleIcon() {
  const { clinicName } = await getClinicConfig();
  const initial = clinicName.trim().charAt(0).toUpperCase() || "L";
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#127a6b",
        color: "#f8fdfc",
        fontSize: 112,
        fontWeight: 600,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {initial}
    </div>,
    { ...size },
  );
}
