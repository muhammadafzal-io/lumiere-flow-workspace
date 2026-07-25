import { ImageResponse } from "next/og";
import { getClinicConfig } from "@/lib/clinic-config";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function Icon() {
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
        borderRadius: 7,
        color: "#f8fdfc",
        fontSize: 20,
        fontWeight: 600,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {initial}
    </div>,
    { ...size },
  );
}
