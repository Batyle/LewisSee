// BASE_URL is '/<repository>/' on GitHub Pages, rather than '/'.
const MODEL_URL = `${import.meta.env.BASE_URL}models`;
// Keep the camera's normal 4:3 shape. Feeding a 16:9 webcam image into a
// square canvas stretches faces, which makes TinyFaceDetector unreliable.
export const INFERENCE_WIDTH = 320;
export const INFERENCE_HEIGHT = 240;
let faceapi;
let loaded = false;

export async function loadDetector() {
  if (loaded) return faceapi;
  // Dynamic import keeps TensorFlow and model code out of the initial UI bundle.
  faceapi = await import("face-api.js");
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  loaded = true;
  return faceapi;
}

function options() {
  return new faceapi.TinyFaceDetectorOptions({
    inputSize: INFERENCE_WIDTH,
    // 0.5 was needlessly strict for ordinary indoor webcam lighting. Liveness
    // still decides whether a recognized face may record attendance.
    scoreThreshold: 0.35,
  });
}

export async function detect(canvas) {
  if (!faceapi) throw new Error("Detector has not loaded.");
  // face-api disposes its intermediate tensors internally; results are plain typed arrays.
  return faceapi.detectAllFaces(canvas, options()).withFaceLandmarks(true).withFaceDescriptors();
}

export function distance(a, b) { return faceapi.euclideanDistance(a, b); }
