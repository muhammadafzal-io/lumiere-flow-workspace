const VOICE_MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 24000,
  },
};

/** Pre-Promise `navigator.getUserMedia` (success/error callbacks). */
type LegacyGetUserMedia = (
  constraints: MediaStreamConstraints,
  success: (stream: MediaStream) => void,
  error: (err: DOMException) => void,
) => void;

type NavigatorWithLegacyMedia = Navigator & {
  getUserMedia?: LegacyGetUserMedia;
  webkitGetUserMedia?: LegacyGetUserMedia;
  mozGetUserMedia?: LegacyGetUserMedia;
};

function ensureMediaDevices(): MediaDevices {
  if (typeof navigator === "undefined") {
    throw new Error("Microphone access is not available in this environment.");
  }

  if (navigator.mediaDevices != null) {
    return navigator.mediaDevices;
  }

  // Legacy API (older browsers)
  const nav = navigator as NavigatorWithLegacyMedia;
  const legacyGetUserMedia = nav.getUserMedia ?? nav.webkitGetUserMedia ?? nav.mozGetUserMedia;

  if (legacyGetUserMedia) {
    return {
      getUserMedia: (constraints: MediaStreamConstraints) =>
        new Promise((resolve, reject) => {
          legacyGetUserMedia.call(navigator, constraints, resolve, reject);
        }),
    } as MediaDevices;
  }

  const insecure =
    typeof window !== "undefined" &&
    !window.isSecureContext &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1";

  if (insecure) {
    throw new Error(
      "Microphone requires a secure connection. Open http://localhost:3000/widget on this device, or use HTTPS.",
    );
  }

  throw new Error(
    "Microphone is not available in this browser. Try Chrome or Edge on http://localhost:3000/widget.",
  );
}

/** Request mic stream with voice-optimized constraints and safe error handling. */
export async function requestVoiceMicrophoneStream(): Promise<MediaStream> {
  const mediaDevices = ensureMediaDevices();
  return mediaDevices.getUserMedia(VOICE_MIC_CONSTRAINTS);
}
