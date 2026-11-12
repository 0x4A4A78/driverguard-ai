/**
 * DriverGuard AI - Real-time EAR Telemetry Waveform Chart
 * Renders a high-refresh rolling line graph showing Eye Aspect Ratio vs Threshold
 */

export class EarTelemetryChart {
  /**
   * @param {HTMLCanvasElement} canvas 
   * @param {number} maxDataPoints 
   */
  constructor(canvas, maxDataPoints = 90) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.maxPoints = maxDataPoints;
    this.data = new Array(maxDataPoints).fill(0.3); // Initial dummy baseline
    this.threshold = 0.22;
  }

  /**
   * Update the threshold reference line
   * @param {number} thresh 
   */
  setThreshold(thresh) {
    this.threshold = thresh;
  }

  /**
   * Push a new EAR value into the rolling window
   * @param {number} earVal 
   */
  addDataPoint(earVal) {
    this.data.push(earVal);
    if (this.data.length > this.maxPoints) {
      this.data.shift();
    }
    this.render();
  }

  /**
   * Render the telemetry chart on canvas
   */
  render() {
    if (!this.canvas || !this.ctx) return;

    const width = this.canvas.width;
    const height = this.canvas.height;
    const ctx = this.ctx;

    // Clear background
    ctx.clearRect(0, 0, width, height);

    // Dynamic scale: EAR range roughly 0.05 to 0.45
    const minY = 0.05;
    const maxY = 0.45;
    const getY = (val) => {
      const clamped = Math.max(minY, Math.min(maxY, val));
      const normalized = (clamped - minY) / (maxY - minY);
      return height - normalized * height;
    };

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let yVal = 0.1; yVal <= 0.4; yVal += 0.1) {
      const y = getY(yVal);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      // Label
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.font = '9px monospace';
      ctx.fillText(yVal.toFixed(1), 4, y - 2);
    }

    // Draw Threshold Line (Dashed Orange/Red)
    const threshY = getY(this.threshold);
    ctx.save();
    ctx.strokeStyle = '#F59E0B'; // Amber
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, threshY);
    ctx.lineTo(width, threshY);
    ctx.stroke();

    // Threshold badge
    ctx.fillStyle = '#F59E0B';
    ctx.font = 'bold 9px monospace';
    ctx.fillText(`เกณฑ์เตือน: ${this.threshold.toFixed(2)}`, width - 85, threshY - 4);
    ctx.restore();

    // Draw Area under EAR Curve
    const step = width / (this.maxPoints - 1);
    const lastValue = this.data[this.data.length - 1];
    const isBelowThreshold = lastValue < this.threshold;

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    if (isBelowThreshold) {
      gradient.addColorStop(0, 'rgba(239, 68, 68, 0.4)');
      gradient.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
    } else {
      gradient.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
      gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
    }

    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let i = 0; i < this.data.length; i++) {
      const x = i * step;
      const y = getY(this.data[i]);
      if (i === 0) {
        ctx.lineTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw Main EAR Line
    ctx.beginPath();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = isBelowThreshold ? '#EF4444' : '#10B981';
    for (let i = 0; i < this.data.length; i++) {
      const x = i * step;
      const y = getY(this.data[i]);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Draw pulse dot on current point
    const currentX = width;
    const currentY = getY(lastValue);
    ctx.beginPath();
    ctx.arc(currentX - 4, currentY, 4, 0, 2 * Math.PI);
    ctx.fillStyle = isBelowThreshold ? '#EF4444' : '#10B981';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
