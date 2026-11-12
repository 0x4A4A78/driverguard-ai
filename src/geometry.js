/**
 * DriverGuard AI - Computer Vision Geometry & Biomarker Calculations
 * Implements Eye Aspect Ratio (EAR) & Mouth Aspect Ratio (MAR)
 */

/**
 * Calculate Euclidean distance between two 2D/3D points
 * @param {{x: number, y: number, z?: number}} p1 
 * @param {{x: number, y: number, z?: number}} p2 
 * @returns {number}
 */
export function euclideanDistance(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.hypot(dx, dy);
}

/**
 * MediaPipe FaceMesh Landmark Indices for Eye Analysis
 * Standard 6-point formulation (Soukupová and Čech, 2016)
 */
export const EYE_INDICES = {
  // Left eye landmarks
  left: {
    cornerOuter: 362,
    topOuter: 385,
    topInner: 387,
    cornerInner: 263,
    bottomInner: 373,
    bottomOuter: 380,
    iris: [474, 475, 476, 477]
  },
  // Right eye landmarks
  right: {
    cornerOuter: 33,
    topOuter: 160,
    topInner: 158,
    cornerInner: 133,
    bottomInner: 153,
    bottomOuter: 144,
    iris: [469, 470, 471, 472]
  }
};

/**
 * MediaPipe FaceMesh Landmark Indices for Mouth (Yawning) Analysis
 */
export const MOUTH_INDICES = {
  lipTopInner: 13,
  lipBottomInner: 14,
  cornerLeft: 78,
  cornerRight: 308,
  lipTopOuter: 0,
  lipBottomOuter: 17
};

/**
 * Head pose estimation key landmarks
 */
export const HEAD_INDICES = {
  forehead: 10,
  noseTip: 1,
  chin: 152,
  leftCheek: 234,
  rightCheek: 454
};

/**
 * Calculate Eye Aspect Ratio (EAR) for a single eye
 * Formula: EAR = (||p2 - p6|| + ||p3 - p5||) / (2 * ||p1 - p4||)
 * @param {Array<{x: number, y: number}>} landmarks - Full 468/478 landmarks array
 * @param {'left'|'right'} eyeSide 
 * @returns {number} EAR value (typical open: 0.25 - 0.38, closed: < 0.20)
 */
export function calculateSingleEAR(landmarks, eyeSide) {
  const idx = EYE_INDICES[eyeSide];
  const p1 = landmarks[idx.cornerOuter];
  const p2 = landmarks[idx.topOuter];
  const p3 = landmarks[idx.topInner];
  const p4 = landmarks[idx.cornerInner];
  const p5 = landmarks[idx.bottomInner];
  const p6 = landmarks[idx.bottomOuter];

  if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) return 0;

  // Vertical distances
  const v1 = euclideanDistance(p2, p6);
  const v2 = euclideanDistance(p3, p5);

  // Horizontal distance
  const h = euclideanDistance(p1, p4);

  if (h === 0) return 0;

  return (v1 + v2) / (2.0 * h);
}

/**
 * Calculate Average EAR across both eyes
 * @param {Array<{x: number, y: number}>} landmarks 
 * @returns {{ leftEAR: number, rightEAR: number, avgEAR: number }}
 */
export function calculateEyeMetrics(landmarks) {
  const leftEAR = calculateSingleEAR(landmarks, 'left');
  const rightEAR = calculateSingleEAR(landmarks, 'right');
  const avgEAR = (leftEAR + rightEAR) / 2.0;

  return {
    leftEAR: Number(leftEAR.toFixed(3)),
    rightEAR: Number(rightEAR.toFixed(3)),
    avgEAR: Number(avgEAR.toFixed(3))
  };
}

/**
 * Calculate Mouth Aspect Ratio (MAR) for yawn detection
 * Formula: MAR = ||lipTopInner - lipBottomInner|| / ||cornerLeft - cornerRight||
 * @param {Array<{x: number, y: number}>} landmarks 
 * @returns {number} MAR value (typical closed/speaking: 0.15 - 0.35, yawning: > 0.60)
 */
export function calculateMAR(landmarks) {
  const top = landmarks[MOUTH_INDICES.lipTopInner];
  const bottom = landmarks[MOUTH_INDICES.lipBottomInner];
  const left = landmarks[MOUTH_INDICES.cornerLeft];
  const right = landmarks[MOUTH_INDICES.cornerRight];

  if (!top || !bottom || !left || !right) return 0;

  const vertical = euclideanDistance(top, bottom);
  const horizontal = euclideanDistance(left, right);

  if (horizontal === 0) return 0;

  return Number((vertical / horizontal).toFixed(3));
}

/**
 * Estimate Head Pitch / Slump (Forward nodding off)
 * Calculates ratio of nose-to-chin vs forehead-to-nose vertical distance
 * @param {Array<{x: number, y: number, z?: number}>} landmarks 
 * @returns {{ isSlumped: boolean, pitchRatio: number }}
 */
export function checkHeadSlump(landmarks) {
  const forehead = landmarks[HEAD_INDICES.forehead];
  const nose = landmarks[HEAD_INDICES.noseTip];
  const chin = landmarks[HEAD_INDICES.chin];

  if (!forehead || !nose || !chin) {
    return { isSlumped: false, pitchRatio: 1.0 };
  }

  const upper = Math.abs(nose.y - forehead.y);
  const lower = Math.abs(chin.y - nose.y);

  if (upper === 0) return { isSlumped: false, pitchRatio: 1.0 };

  const pitchRatio = Number((lower / upper).toFixed(2));
  // When head tilts forward/down, the chin appears closer to nose relative to forehead
  const isSlumped = pitchRatio < 0.65;

  return { isSlumped, pitchRatio };
}

/**
 * Get bounding box of detected face
 * @param {Array<{x: number, y: number}>} landmarks 
 * @param {number} width - Canvas/Video width
 * @param {number} height - Canvas/Video height
 */
export function getFaceBounds(landmarks, width, height) {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;

  for (let i = 0; i < landmarks.length; i++) {
    const pt = landmarks[i];
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  // Add 10% padding
  const padX = (maxX - minX) * 0.1;
  const padY = (maxY - minY) * 0.1;

  return {
    x: Math.max(0, (minX - padX) * width),
    y: Math.max(0, (minY - padY) * height),
    width: Math.min(width, (maxX - minX + padX * 2) * width),
    height: Math.min(height, (maxY - minY + padY * 2) * height)
  };
}
