/**
 * DriverGuard AI - Web Audio & Speech Synthesis Engine
 * Dual-layer alert system: Hardware-independent Web Audio Oscillator + Thai Speech Synthesis
 */

class AlertAudioManager {
  constructor() {
    this.audioCtx = null;
    this.oscillator = null;
    this.gainNode = null;
    this.isPlayingSiren = false;
    this.volume = 0.8;
    this.isMuted = false;
    this.voiceEnabled = true;

    // Speech cooldown
    this.lastSpokenTime = 0;
    this.speechCooldownMs = 4000; // Speak every 4 seconds max during alarm

    // Siren pulse timer
    this.pulseInterval = null;
  }

  /**
   * Initialize AudioContext on user interaction
   */
  initContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  /**
   * Set Master Volume (0.0 to 1.0)
   */
  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.gainNode && !this.isMuted) {
      this.gainNode.gain.setValueAtTime(this.volume, this.audioCtx.currentTime);
    }
  }

  /**
   * Toggle Mute
   */
  setMuted(muted) {
    this.isMuted = muted;
    if (this.isMuted) {
      this.stopSiren();
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    }
  }

  /**
   * Start High-Priority Emergency Siren
   * Generates a piercing 2-tone police/cockpit alarm via Web Audio Oscillator
   */
  startSiren() {
    if (this.isMuted || this.isPlayingSiren) return;
    this.initContext();
    if (!this.audioCtx) return;

    try {
      this.isPlayingSiren = true;
      this.oscillator = this.audioCtx.createOscillator();
      this.gainNode = this.audioCtx.createGain();

      this.oscillator.type = 'sawtooth';
      this.oscillator.frequency.setValueAtTime(880, this.audioCtx.currentTime); // A5

      this.gainNode.gain.setValueAtTime(this.volume, this.audioCtx.currentTime);

      this.oscillator.connect(this.gainNode);
      this.gainNode.connect(this.audioCtx.destination);
      this.oscillator.start();

      let highTone = false;
      this.pulseInterval = setInterval(() => {
        if (!this.isPlayingSiren || !this.audioCtx) return;
        highTone = !highTone;
        const targetFreq = highTone ? 1320 : 880;
        this.oscillator.frequency.setValueAtTime(targetFreq, this.audioCtx.currentTime);
      }, 160);
    } catch (e) {
      console.warn('AudioContext siren failed to start:', e);
    }
  }

  /**
   * Stop the Emergency Siren
   */
  stopSiren() {
    if (this.pulseInterval) {
      clearInterval(this.pulseInterval);
      this.pulseInterval = null;
    }
    if (this.oscillator) {
      try {
        this.oscillator.stop();
        this.oscillator.disconnect();
      } catch (e) {
        // Ignore if already stopped
      }
      this.oscillator = null;
    }
    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch (e) {}
      this.gainNode = null;
    }
    this.isPlayingSiren = false;
  }

  /**
   * Play a single soft warning beep (for minor alerts like yawning or initial eye droop)
   */
  playWarningBeep() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.audioCtx) return;

    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, this.audioCtx.currentTime); // D5
      gain.gain.setValueAtTime(this.volume * 0.5, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.3);
    } catch (e) {
      console.warn('Warning beep failed:', e);
    }
  }

  /**
   * Speak a Thai announcement using Web Speech Synthesis API
   * @param {string} text 
   * @param {boolean} force - Ignore cooldown
   */
  speak(text, force = false) {
    if (this.isMuted || !this.voiceEnabled) return;
    if (!('speechSynthesis' in window)) return;

    const now = Date.now();
    if (!force && now - this.lastSpokenTime < this.speechCooldownMs) {
      return;
    }
    this.lastSpokenTime = now;

    try {
      window.speechSynthesis.cancel(); // Cancel any lingering utterance
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'th-TH';
      utterance.rate = 1.15; // Slightly urgent tempo
      utterance.pitch = 1.1;
      utterance.volume = this.volume;

      // Select Thai voice if available
      const voices = window.speechSynthesis.getVoices();
      const thaiVoice = voices.find(v => v.lang.startsWith('th') || v.lang.includes('TH'));
      if (thaiVoice) {
        utterance.voice = thaiVoice;
      }

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('SpeechSynthesis error:', e);
    }
  }

  /**
   * Trigger the full Microsleep / Drowsiness Alarm
   */
  triggerDrowsyAlarm() {
    this.startSiren();
    this.speak('อันตราย! ตรวจพบอาการหลับใน กรุณาตื่นค่ะ');
  }

  /**
   * Trigger Yawn Warning
   */
  triggerYawnWarning() {
    this.playWarningBeep();
    this.speak('ตรวจพบการหาวบ่อยครั้ง กรุณาแวะพักผ่อนนะคะ');
  }

  /**
   * Test Sound for user settings check
   */
  testAlarm() {
    this.initContext();
    this.startSiren();
    this.speak('ทดสอบระบบเสียงเตือนความปลอดภัย พร้อมทำงานค่ะ', true);
    setTimeout(() => {
      this.stopSiren();
    }, 1800);
  }
}

export const alertAudio = new AlertAudioManager();
