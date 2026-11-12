/**
 * DriverGuard AI - Main Application Controller
 * High-performance browser-based Drowsiness & Yawn Detection System
 */

import './style.css';
import { calculateEyeMetrics, calculateMAR, checkHeadSlump, getFaceBounds, EYE_INDICES, MOUTH_INDICES } from './geometry.js';
import { alertAudio } from './audio.js';
import { EarTelemetryChart } from './chart.js';
import { 
  createIcons, 
  ShieldAlert, 
  BellRing, 
  Sliders, 
  AlertTriangle, 
  ScanFace, 
  SwitchCamera, 
  Play, 
  Square, 
  Activity, 
  Eye, 
  Smile, 
  LineChart, 
  Gauge, 
  RotateCcw, 
  X, 
  Info, 
  Volume2 
} from 'lucide';
import confetti from 'canvas-confetti';

class DrowsinessDetectorApp {
  constructor() {
    // System Configurations & Thresholds
    this.config = {
      earThreshold: 0.22,           // Eyes considered closed below this EAR
      drowsyDelaySeconds: 1.5,       // Time eyes must stay closed to trigger alarm
      warningDelaySeconds: 0.6,      // Time eyes closed to trigger warning
      marThreshold: 0.62,           // Mouth considered yawning above this MAR
      yawnDelaySeconds: 1.8,         // Time mouth must stay open to count as yawn
      showMesh: true,               // Draw AR face mesh on canvas
      selectedCameraId: null,
      facingMode: 'user'            // 'user' (front) or 'environment' (back)
    };

    // State Variables
    this.state = {
      isRunning: false,
      isModelLoaded: false,
      currentStatus: 'IDLE',        // 'IDLE' | 'NORMAL' | 'WARNING' | 'ALARM' | 'YAWN'
      faceDetected: false,
      ear: 0,
      mar: 0,
      leftEar: 0,
      rightEar: 0,
      alertnessScore: 100,
      
      // Timers & Counters
      eyesClosedStartTime: null,
      mouthOpenStartTime: null,
      blinkCount: 0,
      drowsyCount: 0,
      yawnCount: 0,
      isBlinking: false,
      tripStartTime: null,
      tripTimerInterval: null,
      fps: 0,
      lastFrameTime: performance.now(),
      frameCount: 0
    };

    // DOM Elements
    this.dom = {
      video: document.getElementById('camera-feed'),
      canvas: document.getElementById('overlay-canvas'),
      chartCanvas: document.getElementById('telemetry-chart'),
      statusBadge: document.getElementById('status-badge'),
      statusText: document.getElementById('status-text'),
      statusSubtext: document.getElementById('status-subtext'),
      strobeAlert: document.getElementById('strobe-alert'),
      
      // Buttons
      startBtn: document.getElementById('start-btn'),
      stopBtn: document.getElementById('stop-btn'),
      switchCamBtn: document.getElementById('switch-cam-btn'),
      simulateBtn: document.getElementById('simulate-alarm-btn'),
      resetStatsBtn: document.getElementById('reset-stats-btn'),
      toggleMeshBtn: document.getElementById('toggle-mesh-btn'),
      settingsBtn: document.getElementById('settings-btn'),
      closeSettingsBtn: document.getElementById('close-settings-btn'),
      settingsModal: document.getElementById('settings-modal'),
      testAudioBtn: document.getElementById('test-audio-btn'),

      // Telemetry Displays
      earValue: document.getElementById('val-ear'),
      marValue: document.getElementById('val-mar'),
      fpsValue: document.getElementById('val-fps'),
      earBar: document.getElementById('ear-progress-bar'),
      earThresholdMarker: document.getElementById('ear-threshold-marker'),
      alertnessScore: document.getElementById('val-alertness'),
      alertnessBar: document.getElementById('alertness-progress-bar'),
      driveTime: document.getElementById('val-drive-time'),
      blinkCount: document.getElementById('val-blinks'),
      drowsyCount: document.getElementById('val-drowsy'),
      yawnCount: document.getElementById('val-yawns'),

      // Settings Inputs
      earSlider: document.getElementById('input-ear-threshold'),
      earSliderVal: document.getElementById('label-ear-threshold'),
      delaySlider: document.getElementById('input-drowsy-delay'),
      delaySliderVal: document.getElementById('label-drowsy-delay'),
      marSlider: document.getElementById('input-mar-threshold'),
      marSliderVal: document.getElementById('label-mar-threshold'),
      volumeSlider: document.getElementById('input-volume'),
      voiceToggle: document.getElementById('input-voice-toggle'),
      cameraSelect: document.getElementById('select-camera')
    };

    this.ctx = this.dom.canvas.getContext('2d');
    this.chart = new EarTelemetryChart(this.dom.chartCanvas, 75);
    this.chart.setThreshold(this.config.earThreshold);
    this.faceMesh = null;
    this.cameraStream = null;
    this.animFrameId = null;

    this.init();
  }

  async init() {
    createIcons({
      icons: {
        ShieldAlert,
        BellRing,
        Sliders,
        AlertTriangle,
        ScanFace,
        SwitchCamera,
        Play,
        Square,
        Activity,
        Eye,
        Smile,
        LineChart,
        Gauge,
        RotateCcw,
        X,
        Info,
        Volume2
      }
    });
    this.bindEvents();
    this.updateThresholdMarkers();
    await this.initFaceMesh();
    await this.enumerateCameras();
  }

  /**
   * Bind event listeners for UI buttons and inputs
   */
  bindEvents() {
    // Start / Stop Camera
    this.dom.startBtn.addEventListener('click', () => this.start());
    this.dom.stopBtn.addEventListener('click', () => this.stop());

    // Switch Camera (Flip front/back)
    if (this.dom.switchCamBtn) {
      this.dom.switchCamBtn.addEventListener('click', () => this.flipCamera());
    }

    // Settings Modal
    if (this.dom.settingsBtn && this.dom.settingsModal) {
      this.dom.settingsBtn.addEventListener('click', () => {
        this.dom.settingsModal.classList.remove('hidden');
      });
    }
    if (this.dom.closeSettingsBtn && this.dom.settingsModal) {
      this.dom.closeSettingsBtn.addEventListener('click', () => {
        this.dom.settingsModal.classList.add('hidden');
      });
    }

    // Toggle Face Mesh Drawing
    if (this.dom.toggleMeshBtn) {
      this.dom.toggleMeshBtn.addEventListener('click', () => {
        this.config.showMesh = !this.config.showMesh;
        this.dom.toggleMeshBtn.classList.toggle('text-emerald-400', this.config.showMesh);
        this.dom.toggleMeshBtn.classList.toggle('text-gray-400', !this.config.showMesh);
      });
    }

    // Simulate Alarm (for quick demonstration without actual sleeping)
    if (this.dom.simulateBtn) {
      this.dom.simulateBtn.addEventListener('click', () => this.simulateDrowsiness());
    }

    // Reset Stats
    if (this.dom.resetStatsBtn) {
      this.dom.resetStatsBtn.addEventListener('click', () => this.resetSessionStats());
    }

    // Audio Test
    if (this.dom.testAudioBtn) {
      this.dom.testAudioBtn.addEventListener('click', () => {
        alertAudio.testAlarm();
      });
    }

    // Sliders
    this.dom.earSlider.addEventListener('input', (e) => {
      this.config.earThreshold = parseFloat(e.target.value);
      this.dom.earSliderVal.textContent = this.config.earThreshold.toFixed(2);
      this.chart.setThreshold(this.config.earThreshold);
      this.updateThresholdMarkers();
    });

    this.dom.delaySlider.addEventListener('input', (e) => {
      this.config.drowsyDelaySeconds = parseFloat(e.target.value);
      this.dom.delaySliderVal.textContent = `${this.config.drowsyDelaySeconds.toFixed(1)} วิ`;
    });

    this.dom.marSlider.addEventListener('input', (e) => {
      this.config.marThreshold = parseFloat(e.target.value);
      this.dom.marSliderVal.textContent = this.config.marThreshold.toFixed(2);
    });

    this.dom.volumeSlider.addEventListener('input', (e) => {
      const vol = parseFloat(e.target.value);
      alertAudio.setVolume(vol);
    });

    this.dom.voiceToggle.addEventListener('change', (e) => {
      alertAudio.voiceEnabled = e.target.checked;
    });

    if (this.dom.cameraSelect) {
      this.dom.cameraSelect.addEventListener('change', (e) => {
        this.config.selectedCameraId = e.target.value;
        if (this.state.isRunning) {
          this.startCameraStream();
        }
      });
    }

    // Responsive Canvas Resizing
    window.addEventListener('resize', () => this.adjustCanvasSize());
  }

  updateThresholdMarkers() {
    // EAR progress bar threshold position (scale 0 to 0.45)
    const pct = Math.min(100, Math.max(0, (this.config.earThreshold / 0.45) * 100));
    if (this.dom.earThresholdMarker) {
      this.dom.earThresholdMarker.style.left = `${pct}%`;
    }
  }

  /**
   * Load MediaPipe FaceMesh
   */
  async initFaceMesh() {
    try {
      this.updateStatus('LOADING', 'กำลังโหลดสมองกล AI (FaceMesh)...');
      
      const FaceMeshConstructor = window.FaceMesh;
      if (!FaceMeshConstructor) {
        throw new Error('ไม่พบไลบรารี MediaPipe FaceMesh บนหน้าเว็บ');
      }

      this.faceMesh = new FaceMeshConstructor({
        locateFile: (file) => {
          // Prefer local offline files from /mediapipe/face_mesh/
          return `/mediapipe/face_mesh/${file}`;
        }
      });

      this.faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      this.faceMesh.onResults((results) => this.onFaceMeshResults(results));

      this.state.isModelLoaded = true;
      this.updateStatus('IDLE', 'ระบบพร้อมทำงาน กด "เริ่มระบบ" ได้เลย');
      this.dom.startBtn.disabled = false;
      this.dom.startBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    } catch (err) {
      console.warn('Local FaceMesh load error, trying CDN fallback:', err);
      try {
        const FaceMeshConstructor = window.FaceMesh;
        this.faceMesh = new FaceMeshConstructor({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });
        this.faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
        this.faceMesh.onResults((results) => this.onFaceMeshResults(results));
        this.state.isModelLoaded = true;
        this.updateStatus('IDLE', 'ระบบพร้อมทำงาน (CDN Fallback)');
        this.dom.startBtn.disabled = false;
        this.dom.startBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      } catch (cdnErr) {
        console.error('All FaceMesh initializations failed:', cdnErr);
        this.updateStatus('ERROR', 'โหลดโมเดลไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ');
      }
    }
  }

  /**
   * Detect and enumerate available cameras (webcams, front, back)
   */
  async enumerateCameras() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      
      if (this.dom.cameraSelect) {
        this.dom.cameraSelect.innerHTML = '';
        videoDevices.forEach((device, index) => {
          const opt = document.createElement('option');
          opt.value = device.deviceId;
          opt.textContent = device.label || `กล้องตัวที่ ${index + 1}`;
          this.dom.cameraSelect.appendChild(opt);
        });
      }
    } catch (e) {
      console.warn('Could not enumerate cameras:', e);
    }
  }

  /**
   * Start detection session
   */
  async start() {
    alertAudio.initContext();
    this.dom.startBtn.classList.add('hidden');
    this.dom.stopBtn.classList.remove('hidden');

    this.state.isRunning = true;
    this.state.tripStartTime = Date.now();
    this.startTripTimer();

    await this.startCameraStream();
    this.adjustCanvasSize();
    this.processVideoLoop();
  }

  /**
   * Stop detection session
   */
  stop() {
    this.state.isRunning = false;
    alertAudio.stopSiren();
    this.clearStrobeAlert();

    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(track => track.stop());
      this.cameraStream = null;
    }
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.state.tripTimerInterval) {
      clearInterval(this.state.tripTimerInterval);
      this.state.tripTimerInterval = null;
    }

    this.ctx.clearRect(0, 0, this.dom.canvas.width, this.dom.canvas.height);
    this.updateStatus('IDLE', 'หยุดการทำงานชั่วคราว');

    this.dom.startBtn.classList.remove('hidden');
    this.dom.stopBtn.classList.add('hidden');
  }

  /**
   * Flip between front (user) and back (environment) cameras
   */
  async flipCamera() {
    this.config.facingMode = this.config.facingMode === 'user' ? 'environment' : 'user';
    this.config.selectedCameraId = null;
    if (this.state.isRunning) {
      await this.startCameraStream();
    }
  }

  /**
   * Start camera video stream
   */
  async startCameraStream() {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(track => track.stop());
    }

    const constraints = {
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: this.config.selectedCameraId ? undefined : this.config.facingMode,
        deviceId: this.config.selectedCameraId ? { exact: this.config.selectedCameraId } : undefined
      },
      audio: false
    };

    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.dom.video.srcObject = this.cameraStream;
      
      await new Promise((resolve) => {
        this.dom.video.onloadedmetadata = () => {
          this.dom.video.play();
          this.adjustCanvasSize();
          resolve();
        };
      });

      this.updateStatus('NORMAL', 'กล้องทำงานปกติ กำลังตรวจจับใบหน้า...');
    } catch (err) {
      console.error('Error opening camera:', err);
      this.updateStatus('ERROR', 'ไม่สามารถเข้าถึงกล้องได้ ตรวจสอบสิทธิ์การใช้งาน');
      this.stop();
    }
  }

  adjustCanvasSize() {
    if (!this.dom.video) return;
    const w = this.dom.video.videoWidth || 640;
    const h = this.dom.video.videoHeight || 480;
    this.dom.canvas.width = w;
    this.dom.canvas.height = h;
  }

  /**
   * Continuous animation loop to feed camera frames into FaceMesh
   */
  async processVideoLoop() {
    if (!this.state.isRunning) return;

    if (this.dom.video.readyState >= 2 && this.faceMesh) {
      try {
        await this.faceMesh.send({ image: this.dom.video });
      } catch (err) {
        console.warn('FaceMesh frame processing error:', err);
      }
    }

    // Calculate real-time FPS
    this.calculateFPS();

    this.animFrameId = requestAnimationFrame(() => this.processVideoLoop());
  }

  calculateFPS() {
    const now = performance.now();
    this.state.frameCount++;
    if (now - this.state.lastFrameTime >= 1000) {
      this.state.fps = this.state.frameCount;
      this.state.frameCount = 0;
      this.state.lastFrameTime = now;
      if (this.dom.fpsValue) {
        this.dom.fpsValue.textContent = this.state.fps;
      }
    }
  }

  /**
   * MediaPipe FaceMesh callback containing detected landmarks
   */
  onFaceMeshResults(results) {
    if (!this.state.isRunning) return;

    const width = this.dom.canvas.width;
    const height = this.dom.canvas.height;
    this.ctx.clearRect(0, 0, width, height);

    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      this.state.faceDetected = false;
      this.handleNoFaceDetected();
      return;
    }

    this.state.faceDetected = true;
    const landmarks = results.multiFaceLandmarks[0];

    // 1. Calculate Eye Metrics (EAR)
    const { leftEAR, rightEAR, avgEAR } = calculateEyeMetrics(landmarks);
    this.state.leftEar = leftEAR;
    this.state.rightEar = rightEAR;
    this.state.ear = avgEAR;

    // 2. Calculate Mouth Metrics (MAR)
    const mar = calculateMAR(landmarks);
    this.state.mar = mar;

    // 3. Check Head Slump / Nodding
    const { isSlumped } = checkHeadSlump(landmarks);

    // 4. Update Telemetry Chart
    this.chart.addDataPoint(avgEAR);

    // 5. Update Telemetry UI
    this.updateTelemetryUI(avgEAR, mar);

    // 6. State Machine: Evaluate Drowsiness & Yawn
    this.evaluateDriverState(avgEAR, mar, isSlumped);

    // 7. Draw Visual AR Overlay on Canvas
    if (this.config.showMesh) {
      this.drawAROverlay(landmarks, width, height, isSlumped);
    }
  }

  handleNoFaceDetected() {
    this.chart.addDataPoint(0.3); // Baseline
    this.updateStatus('WARNING', 'ไม่พบใบหน้าคนขับ! กรุณาหันหน้าเข้าหากล้อง');
    this.dom.earValue.textContent = '--';
    this.dom.marValue.textContent = '--';
  }

  /**
   * Evaluate Eye Aspect Ratio & Mouth Aspect Ratio state machine
   */
  evaluateDriverState(ear, mar, isSlumped) {
    const now = Date.now();
    const isEyesClosed = ear < this.config.earThreshold;
    const isMouthOpen = mar > this.config.marThreshold;

    // --- A. Eye & Drowsiness Logic ---
    if (isEyesClosed) {
      if (!this.state.eyesClosedStartTime) {
        this.state.eyesClosedStartTime = now;
      }

      const closedDurationSeconds = (now - this.state.eyesClosedStartTime) / 1000.0;

      if (closedDurationSeconds >= this.config.drowsyDelaySeconds || (isSlumped && closedDurationSeconds >= 0.8)) {
        // CRITICAL ALARM: MICROSLEEP
        this.triggerAlarmState(closedDurationSeconds);
      } else if (closedDurationSeconds >= this.config.warningDelaySeconds) {
        // WARNING: Squinting / Starting to sleep
        this.triggerWarningState(closedDurationSeconds);
      }
    } else {
      // Eyes Opened
      if (this.state.eyesClosedStartTime) {
        const duration = (now - this.state.eyesClosedStartTime) / 1000.0;
        // Blink detected (quick eye closure: 0.1s - 0.45s)
        if (duration >= 0.08 && duration < 0.5) {
          this.state.blinkCount++;
          if (this.dom.blinkCount) {
            this.dom.blinkCount.textContent = this.state.blinkCount;
          }
        }
        this.state.eyesClosedStartTime = null;
      }

      // If we were in ALARM state and driver woke up
      if (this.state.currentStatus === 'ALARM' || this.state.currentStatus === 'WARNING') {
        this.clearAlarmState();
      }
    }

    // --- B. Yawn Detection Logic ---
    if (isMouthOpen) {
      if (!this.state.mouthOpenStartTime) {
        this.state.mouthOpenStartTime = now;
      }
      const yawnDuration = (now - this.state.mouthOpenStartTime) / 1000.0;
      if (yawnDuration >= this.config.yawnDelaySeconds && this.state.currentStatus !== 'ALARM') {
        this.triggerYawnState();
      }
    } else {
      this.state.mouthOpenStartTime = null;
      if (this.state.currentStatus === 'YAWN') {
        this.clearAlarmState();
      }
    }
  }

  /**
   * Trigger Critical Microsleep Alarm
   */
  triggerAlarmState(duration) {
    if (this.state.currentStatus !== 'ALARM') {
      this.state.currentStatus = 'ALARM';
      this.state.drowsyCount++;
      if (this.dom.drowsyCount) {
        this.dom.drowsyCount.textContent = this.state.drowsyCount;
      }

      // Deduct alertness score
      this.deductAlertness(15);
    }

    alertAudio.triggerDrowsyAlarm();
    this.showStrobeAlert();
    this.updateStatus('ALARM', `🚨 อันตราย! หลับในค้าง ${duration.toFixed(1)} วิ! กรุณาตื่น!`);
  }

  /**
   * Trigger Warning State (Drowsy start)
   */
  triggerWarningState(duration) {
    this.state.currentStatus = 'WARNING';
    alertAudio.playWarningBeep();
    this.updateStatus('WARNING', `⚠️ ระวัง: ตาปิดนาน ${duration.toFixed(1)} วิ (เริ่มง่วง)`);
  }

  /**
   * Trigger Yawn Warning State
   */
  triggerYawnState() {
    if (this.state.currentStatus !== 'YAWN') {
      this.state.currentStatus = 'YAWN';
      this.state.yawnCount++;
      if (this.dom.yawnCount) {
        this.dom.yawnCount.textContent = this.state.yawnCount;
      }
      this.deductAlertness(5);
      alertAudio.triggerYawnWarning();
    }
    this.updateStatus('YAWN', '🥱 ตรวจพบการหาว! คุณเริ่มเหนื่อยล้า ควรแวะพักผ่อน');
  }

  /**
   * Clear Alarm and return to Normal
   */
  clearAlarmState() {
    this.state.currentStatus = 'NORMAL';
    alertAudio.stopSiren();
    this.clearStrobeAlert();
    this.updateStatus('NORMAL', '🟢 ขับขี่ปกติ สภาพร่างกายตื่นตัว');
  }

  deductAlertness(points) {
    this.state.alertnessScore = Math.max(10, this.state.alertnessScore - points);
    if (this.dom.alertnessScore) {
      this.dom.alertnessScore.textContent = `${this.state.alertnessScore}%`;
    }
    if (this.dom.alertnessBar) {
      this.dom.alertnessBar.style.width = `${this.state.alertnessScore}%`;
      if (this.state.alertnessScore < 50) {
        this.dom.alertnessBar.className = 'h-full bg-red-500 transition-all duration-300';
      } else if (this.state.alertnessScore < 75) {
        this.dom.alertnessBar.className = 'h-full bg-amber-500 transition-all duration-300';
      } else {
        this.dom.alertnessBar.className = 'h-full bg-emerald-500 transition-all duration-300';
      }
    }
  }

  showStrobeAlert() {
    if (this.dom.strobeAlert) {
      this.dom.strobeAlert.classList.remove('hidden');
    }
  }

  clearStrobeAlert() {
    if (this.dom.strobeAlert) {
      this.dom.strobeAlert.classList.add('hidden');
    }
  }

  /**
   * Update Status Banner
   */
  updateStatus(status, text) {
    if (!this.dom.statusText) return;
    this.dom.statusText.textContent = text;

    const badge = this.dom.statusBadge;
    if (!badge) return;

    badge.className = 'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-colors duration-200';

    switch (status) {
      case 'NORMAL':
        badge.classList.add('bg-emerald-500/20', 'text-emerald-400', 'border', 'border-emerald-500/40');
        badge.textContent = 'ปลอดภัย (NORMAL)';
        break;
      case 'WARNING':
        badge.classList.add('bg-amber-500/20', 'text-amber-400', 'border', 'border-amber-500/40');
        badge.textContent = 'เตือน (WARNING)';
        break;
      case 'ALARM':
        badge.classList.add('bg-red-500/30', 'text-red-400', 'border', 'border-red-500/60', 'animate-pulse');
        badge.textContent = 'อันตราย! (ALARM)';
        break;
      case 'YAWN':
        badge.classList.add('bg-orange-500/20', 'text-orange-400', 'border', 'border-orange-500/40');
        badge.textContent = 'เหนื่อยล้า (YAWN)';
        break;
      case 'IDLE':
      default:
        badge.classList.add('bg-gray-800', 'text-gray-400', 'border', 'border-gray-700');
        badge.textContent = 'สแตนด์บาย (IDLE)';
        break;
    }
  }

  updateTelemetryUI(ear, mar) {
    if (this.dom.earValue) {
      this.dom.earValue.textContent = ear.toFixed(2);
      this.dom.earValue.className = ear < this.config.earThreshold 
        ? 'font-mono text-2xl font-black text-red-500' 
        : 'font-mono text-2xl font-black text-emerald-400';
    }

    if (this.dom.marValue) {
      this.dom.marValue.textContent = mar.toFixed(2);
      this.dom.marValue.className = mar > this.config.marThreshold 
        ? 'font-mono text-2xl font-black text-orange-400' 
        : 'font-mono text-2xl font-black text-cyan-400';
    }

    if (this.dom.earBar) {
      const pct = Math.min(100, Math.max(0, (ear / 0.45) * 100));
      this.dom.earBar.style.width = `${pct}%`;
      this.dom.earBar.className = ear < this.config.earThreshold 
        ? 'h-full bg-red-500 transition-all duration-100' 
        : 'h-full bg-emerald-500 transition-all duration-100';
    }
  }

  /**
   * Draw High-Tech AR HUD Overlay on Canvas
   */
  drawAROverlay(landmarks, width, height, isSlumped) {
    const ctx = this.ctx;
    const isAlarm = this.state.currentStatus === 'ALARM';
    const isWarning = this.state.currentStatus === 'WARNING';
    const eyeColor = isAlarm ? '#EF4444' : isWarning ? '#F59E0B' : '#10B981';

    // 1. Draw Face Bounding Corners (Cockpit Targeting HUD)
    const bounds = getFaceBounds(landmarks, width, height);
    this.drawTargetHUD(ctx, bounds, isAlarm ? '#EF4444' : '#06B6D4');

    // 2. Draw Eye Contours
    this.drawEyeContour(ctx, landmarks, EYE_INDICES.left, width, height, eyeColor);
    this.drawEyeContour(ctx, landmarks, EYE_INDICES.right, width, height, eyeColor);

    // 3. Draw Mouth Contour
    const mouthColor = this.state.mar > this.config.marThreshold ? '#F97316' : 'rgba(6, 182, 212, 0.4)';
    this.drawMouthContour(ctx, landmarks, width, height, mouthColor);

    // 4. Draw Floating Telemetry Tag next to face
    ctx.save();
    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(3, 7, 18, 0.8)';
    ctx.fillRect(bounds.x, bounds.y - 24, 150, 20);
    ctx.strokeStyle = eyeColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(bounds.x, bounds.y - 24, 150, 20);

    ctx.fillStyle = eyeColor;
    ctx.fillText(`EAR: ${this.state.ear.toFixed(2)} | MAR: ${this.state.mar.toFixed(2)}`, bounds.x + 8, bounds.y - 10);
    ctx.restore();
  }

  drawTargetHUD(ctx, b, color) {
    const len = Math.min(24, b.width * 0.2);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(b.x, b.y + len);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(b.x + len, b.y);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(b.x + b.width - len, b.y);
    ctx.lineTo(b.x + b.width, b.y);
    ctx.lineTo(b.x + b.width, b.y + len);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(b.x, b.y + b.height - len);
    ctx.lineTo(b.x, b.y + b.height);
    ctx.lineTo(b.x + len, b.y + b.height);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(b.x + b.width - len, b.y + b.height);
    ctx.lineTo(b.x + b.width, b.y + b.height);
    ctx.lineTo(b.x + b.width, b.y + b.height - len);
    ctx.stroke();

    ctx.restore();
  }

  drawEyeContour(ctx, landmarks, indices, width, height, color) {
    const pts = [
      landmarks[indices.cornerOuter],
      landmarks[indices.topOuter],
      landmarks[indices.topInner],
      landmarks[indices.cornerInner],
      landmarks[indices.bottomInner],
      landmarks[indices.bottomOuter]
    ];

    ctx.save();
    ctx.beginPath();
    pts.forEach((pt, i) => {
      const x = pt.x * width;
      const y = pt.y * height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = color.startsWith('#EF') ? 'rgba(239, 68, 68, 0.25)' : 'rgba(16, 185, 129, 0.15)';
    ctx.fill();
    ctx.restore();
  }

  drawMouthContour(ctx, landmarks, width, height, color) {
    const top = landmarks[MOUTH_INDICES.lipTopInner];
    const bottom = landmarks[MOUTH_INDICES.lipBottomInner];
    const left = landmarks[MOUTH_INDICES.cornerLeft];
    const right = landmarks[MOUTH_INDICES.cornerRight];

    if (!top || !bottom || !left || !right) return;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(left.x * width, left.y * height);
    ctx.lineTo(top.x * width, top.y * height);
    ctx.lineTo(right.x * width, right.y * height);
    ctx.lineTo(bottom.x * width, bottom.y * height);
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Trip Duration Timer
   */
  startTripTimer() {
    if (this.state.tripTimerInterval) clearInterval(this.state.tripTimerInterval);
    this.state.tripTimerInterval = setInterval(() => {
      if (!this.state.isRunning || !this.state.tripStartTime) return;
      const elapsedSeconds = Math.floor((Date.now() - this.state.tripStartTime) / 1000);
      const mins = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
      const secs = (elapsedSeconds % 60).toString().padStart(2, '0');
      if (this.dom.driveTime) {
        this.dom.driveTime.textContent = `${mins}:${secs}`;
      }
    }, 1000);
  }

  /**
   * Reset Session Statistics
   */
  resetSessionStats() {
    this.state.blinkCount = 0;
    this.state.drowsyCount = 0;
    this.state.yawnCount = 0;
    this.state.alertnessScore = 100;
    this.state.tripStartTime = Date.now();

    if (this.dom.blinkCount) this.dom.blinkCount.textContent = '0';
    if (this.dom.drowsyCount) this.dom.drowsyCount.textContent = '0';
    if (this.dom.yawnCount) this.dom.yawnCount.textContent = '0';
    if (this.dom.alertnessScore) this.dom.alertnessScore.textContent = '100%';
    if (this.dom.alertnessBar) this.dom.alertnessBar.style.width = '100%';

    confetti({ particleCount: 30, spread: 60, origin: { y: 0.8 } });
  }

  /**
   * Simulate Drowsiness Alarm for 3.5 seconds (for presentation testing)
   */
  simulateDrowsiness() {
    this.triggerAlarmState(2.0);
    setTimeout(() => {
      this.clearAlarmState();
    }, 3500);
  }
}

// Bootstrap on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.app = new DrowsinessDetectorApp();
});
