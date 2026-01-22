// AudioWorklet processor for PCM16 streaming to Gemini Live API
class GeminiAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = []
    this.bufferSize = 4096

    this.port.onmessage = (event) => {
      if (event.data.type === 'flush') {
        this.flush()
      }
    }
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]
    if (input && input[0]) {
      this.buffer.push(new Float32Array(input[0]))

      const totalSamples = this.buffer.reduce((sum, arr) => sum + arr.length, 0)
      if (totalSamples >= this.bufferSize) {
        this.flush()
      }
    }
    return true
  }

  flush() {
    if (this.buffer.length === 0) return

    const totalLength = this.buffer.reduce((sum, arr) => sum + arr.length, 0)
    const combined = new Float32Array(totalLength)
    let offset = 0
    for (const arr of this.buffer) {
      combined.set(arr, offset)
      offset += arr.length
    }
    this.buffer = []

    // Convert Float32 to PCM16
    const pcm16 = new Int16Array(combined.length)
    for (let i = 0; i < combined.length; i++) {
      const s = Math.max(-1, Math.min(1, combined[i]))
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }

    this.port.postMessage({
      type: 'audio',
      data: pcm16.buffer,
    }, [pcm16.buffer])
  }
}

registerProcessor('gemini-audio-processor', GeminiAudioProcessor)
