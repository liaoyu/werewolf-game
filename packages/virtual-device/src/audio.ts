export function floatTo16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const s = Math.max(-1, Math.min(1, input[i] ?? 0));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export function int16ToFloat(input: Int16Array): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    out[i] = (input[i] ?? 0) / 0x8000;
  }
  return out;
}

export function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const length = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = src - i0;
    const a = input[i0] ?? 0;
    const b = input[i1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

export const PCM_HELLO = {
  type: "hello",
  version: 1,
  transport: "websocket",
  audio_params: {
    format: "pcm",
    sample_rate: 16000,
    channels: 1,
    bit_depth: 16,
    endianness: "little",
    frame_duration: 20,
    frame_size: 320,
    sample_format: "signed_int16",
    play_buffer_duration: 1000,
  },
};

export class PcmPlayer {
  private ctx: AudioContext;
  private next = 0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  enqueue(pcm: Int16Array): void {
    const data = int16ToFloat(pcm);
    const buffer = this.ctx.createBuffer(1, data.length, 16000);
    buffer.getChannelData(0).set(data);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.ctx.destination);
    const now = this.ctx.currentTime;
    const start = Math.max(now, this.next);
    src.start(start);
    this.next = start + buffer.duration;
  }
}
