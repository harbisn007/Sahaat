/**
 * Audio Effects Processor for Tarouk
 * 
 * This module provides audio processing capabilities for the Tarouk feature:
 * - Echo/Reverb effect: Creates the illusion of multiple people repeating
 * - Speed up: Slightly increases playback speed for energy
 * 
 * Note: Web Audio API is used for web platform, native platforms use expo-audio
 */

// Audio effect configuration for Tarouk
export const TAROUK_EFFECTS = {
  // Echo/Reverb settings
  echo: {
    delayTime: 0.15, // 150ms delay between echoes
    feedback: 0.4, // 40% feedback for natural decay
    wetMix: 0.5, // 50% wet signal
    numberOfEchoes: 3, // Number of echo repetitions
  },
  // Speed up settings
  speed: {
    playbackRate: 1.15, // 15% faster playback
  },
};

/**
 * Process audio with Tarouk effects using Web Audio API
 * Creates echo effect and speeds up playback
 */
export async function processAudioWithTaroukEffect(
  audioUri: string
): Promise<{ processedUri: string; duration: number }> {
  // For now, return the original URI
  // Full audio processing would require native modules or server-side processing
  return {
    processedUri: audioUri,
    duration: 0,
  };
}

/**
 * Create Web Audio context with Tarouk effects chain
 * This is used for real-time playback with effects
 */
export function createTaroukAudioContext() {
  if (typeof window === "undefined" || !window.AudioContext) {
    return null;
  }

  const audioContext = new AudioContext();

  // Create delay node for echo effect
  const delayNode = audioContext.createDelay(1.0);
  delayNode.delayTime.value = TAROUK_EFFECTS.echo.delayTime;

  // Create feedback gain for echo decay
  const feedbackGain = audioContext.createGain();
  feedbackGain.gain.value = TAROUK_EFFECTS.echo.feedback;

  // Create wet/dry mix gains
  const wetGain = audioContext.createGain();
  wetGain.gain.value = TAROUK_EFFECTS.echo.wetMix;

  const dryGain = audioContext.createGain();
  dryGain.gain.value = 1 - TAROUK_EFFECTS.echo.wetMix;

  // Create output gain
  const outputGain = audioContext.createGain();
  outputGain.gain.value = 1.0;

  return {
    audioContext,
    delayNode,
    feedbackGain,
    wetGain,
    dryGain,
    outputGain,
    playbackRate: TAROUK_EFFECTS.speed.playbackRate,
  };
}

/**
 * Play audio with Tarouk effects (echo + speed up)
 * Uses Web Audio API for real-time processing
 */
export async function playWithTaroukEffects(
  audioUri: string,
  onEnd?: () => void
): Promise<{ stop: () => void } | null> {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const audioContext = new AudioContext();

    // Fetch and decode audio
    const response = await fetch(audioUri);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Create source
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = TAROUK_EFFECTS.speed.playbackRate;

    // Create delay for echo effect
    const delay1 = audioContext.createDelay(1.0);
    delay1.delayTime.value = TAROUK_EFFECTS.echo.delayTime;

    const delay2 = audioContext.createDelay(1.0);
    delay2.delayTime.value = TAROUK_EFFECTS.echo.delayTime * 2;

    const delay3 = audioContext.createDelay(1.0);
    delay3.delayTime.value = TAROUK_EFFECTS.echo.delayTime * 3;

    // Create gains for each echo
    const gain1 = audioContext.createGain();
    gain1.gain.value = 0.7;

    const gain2 = audioContext.createGain();
    gain2.gain.value = 0.5;

    const gain3 = audioContext.createGain();
    gain3.gain.value = 0.3;

    // Create master gain
    const masterGain = audioContext.createGain();
    masterGain.gain.value = 0.8;

    // Connect nodes
    // Original signal
    source.connect(masterGain);

    // Echo 1
    source.connect(delay1);
    delay1.connect(gain1);
    gain1.connect(masterGain);

    // Echo 2
    source.connect(delay2);
    delay2.connect(gain2);
    gain2.connect(masterGain);

    // Echo 3
    source.connect(delay3);
    delay3.connect(gain3);
    gain3.connect(masterGain);

    // Connect to output
    masterGain.connect(audioContext.destination);

    // Start playback
    source.start(0);

    // Handle end
    source.onended = () => {
      audioContext.close();
      onEnd?.();
    };

    return {
      stop: () => {
        source.stop();
        audioContext.close();
        onEnd?.();
      },
    };
  } catch (error) {
    console.error("Failed to play with Tarouk effects:", error);
    return null;
  }
}

/**
 * Simple audio player with speed adjustment for native platforms
 */
export function getPlaybackRateForTarouk(): number {
  return TAROUK_EFFECTS.speed.playbackRate;
}
