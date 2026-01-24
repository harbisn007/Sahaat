/**
 * Audio Effects Processor for Tarouk
 * 
 * This module provides audio processing capabilities for the Tarouk feature:
 * - Chorus effect: Creates the illusion of multiple people singing together
 * - Slow down: Slightly decreases playback speed for deeper, more powerful voice
 * 
 * Note: Web Audio API is used for web platform, native platforms use expo-audio
 */

// Audio effect configuration for Tarouk
export const TAROUK_EFFECTS = {
  // Chorus settings (multiple voices effect)
  chorus: {
    delayTime: 0.03, // 30ms delay for chorus effect (shorter than echo)
    feedback: 0.2, // 20% feedback for subtle layering
    wetMix: 0.6, // 60% wet signal for stronger chorus
    numberOfVoices: 4, // Number of layered voices
  },
  // Slow down settings (deeper, more powerful voice)
  speed: {
    playbackRate: 0.9, // 10% slower playback for deeper sound
  },
};

/**
 * Process audio with Tarouk effects using Web Audio API
 * Creates chorus effect and slows down playback for deeper voice
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

  // Create delay node for chorus effect
  const delayNode = audioContext.createDelay(1.0);
  delayNode.delayTime.value = TAROUK_EFFECTS.chorus.delayTime;

  // Create feedback gain for chorus layering
  const feedbackGain = audioContext.createGain();
  feedbackGain.gain.value = TAROUK_EFFECTS.chorus.feedback;

  // Create wet/dry mix gains
  const wetGain = audioContext.createGain();
  wetGain.gain.value = TAROUK_EFFECTS.chorus.wetMix;

  const dryGain = audioContext.createGain();
  dryGain.gain.value = 1 - TAROUK_EFFECTS.chorus.wetMix;

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
 * Play audio with Tarouk effects (chorus + slow down)
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

    // Create delays for chorus effect (multiple voices)
    const delay1 = audioContext.createDelay(1.0);
    delay1.delayTime.value = TAROUK_EFFECTS.chorus.delayTime;

    const delay2 = audioContext.createDelay(1.0);
    delay2.delayTime.value = TAROUK_EFFECTS.chorus.delayTime * 1.5;

    const delay3 = audioContext.createDelay(1.0);
    delay3.delayTime.value = TAROUK_EFFECTS.chorus.delayTime * 2;

    const delay4 = audioContext.createDelay(1.0);
    delay4.delayTime.value = TAROUK_EFFECTS.chorus.delayTime * 2.5;

    // Create gains for each voice (more balanced for chorus)
    const gain1 = audioContext.createGain();
    gain1.gain.value = 0.8;

    const gain2 = audioContext.createGain();
    gain2.gain.value = 0.75;

    const gain3 = audioContext.createGain();
    gain3.gain.value = 0.7;

    const gain4 = audioContext.createGain();
    gain4.gain.value = 0.65;

    // Create master gain
    const masterGain = audioContext.createGain();
    masterGain.gain.value = 0.8;

    // Connect nodes
    // Original signal
    source.connect(masterGain);

    // Voice 1
    source.connect(delay1);
    delay1.connect(gain1);
    gain1.connect(masterGain);

    // Voice 2
    source.connect(delay2);
    delay2.connect(gain2);
    gain2.connect(masterGain);

    // Voice 3
    source.connect(delay3);
    delay3.connect(gain3);
    gain3.connect(masterGain);

    // Voice 4
    source.connect(delay4);
    delay4.connect(gain4);
    gain4.connect(masterGain);

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
