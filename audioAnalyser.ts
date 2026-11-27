export class LiveAudioWaveform {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;

  public async start(): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      const source = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.78;
      source.connect(this.analyser);
      this.dataArray = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
      return true;
    } catch {
      this.stop();
      return false;
    }
  }

  public sampleBars(barCount = 24): number[] {
    if (!this.analyser || !this.dataArray) {
      return Array(barCount).fill(0.08);
    }
    this.analyser.getByteFrequencyData(this.dataArray);
    const bars: number[] = [];
    const step = Math.max(1, Math.floor(this.dataArray.length / barCount));
    for (let i = 0; i < barCount; i++) {
      const val = this.dataArray[Math.min(i * step, this.dataArray.length - 1)] || 0;
      bars.push(Math.max(0.08, Math.min(1, val / 210)));
    }
    return bars;
  }

  public stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.ctx && this.ctx.state !== "closed") {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.analyser = null;
    this.dataArray = null;
  }
}
