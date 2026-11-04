export const CAMERA_WIDTH = 640;
export const CAMERA_HEIGHT = 480;
export const CAMERA_FPS = 30;

export function createInferenceCanvas(width = 320, height = 240) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  // This canvas is reused so no image buffers are allocated for each frame.
  canvas.getContext("2d", { willReadFrequently: true });
  return canvas;
}

// Draw a centred crop without changing the source aspect ratio. This is used
// for webcam frames and enrollment photos so their descriptors are comparable.
export function drawImageCover(context, source, width, height) {
  const sourceWidth = source.videoWidth || source.naturalWidth || source.width;
  const sourceHeight = source.videoHeight || source.naturalHeight || source.height;
  if (!sourceWidth || !sourceHeight) return false;

  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  const sourceX = (sourceWidth - cropWidth) / 2;
  const sourceY = (sourceHeight - cropHeight) / 2;
  context.drawImage(
    source,
    sourceX,
    sourceY,
    cropWidth,
    cropHeight,
    0,
    0,
    width,
    height,
  );
  return true;
}

export async function requestCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser does not support camera access.");
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: CAMERA_WIDTH }, height: { ideal: CAMERA_HEIGHT }, frameRate: { ideal: CAMERA_FPS, max: CAMERA_FPS } },
    audio: false,
  });
}

export function stopCamera(stream) { stream?.getTracks().forEach((track) => track.stop()); }
export function setCameraPaused(stream, paused) { stream?.getVideoTracks().forEach((track) => { track.enabled = !paused; }); }

export function cameraErrorMessage(error) {
  if (error?.name === "NotAllowedError") return "Camera permission was denied. Allow access in your browser settings and retry.";
  if (error?.name === "NotFoundError") return "No camera was found. Connect a camera and retry.";
  if (error?.name === "NotReadableError") return "Your camera is in use by another app. Close that app and retry.";
  return "The camera could not be started. Please retry.";
}
