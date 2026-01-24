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
    delayTime: 0.02, // 20ms delay for tighter chorus (10 voices)
    feedback: 0.15, // 15% feedback for natural layering
    wetMix: 0.75, // 75% wet signal for very strong chorus (10 voices)
    numberOfVoices: 10, // Number of layered voices (like 10 men singing)
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

    // Create 10 delays for chorus effect (10 voices like 10 men singing)
    const delays = [];
    const gains = [];
    
    for (let i = 0; i < 10; i++) {
      const delay = audioContext.createDelay(1.0);
      delay.delayTime.value = TAROUK_EFFECTS.chorus.delayTime * (1 + i * 0.3);
      delays.push(delay);
      
      const gain = audioContext.createGain();
      gain.gain.value = 0.9 - (i * 0.03); // Gradual decrease from 0.9 to 0.63
      gains.push(gain);
    }

    // Create master gain
    const masterGain = audioContext.createGain();
    masterGain.gain.value = 0.8;

    // Connect nodes
    // Original signal
    source.connect(masterGain);

    // Connect all 10 voices
    for (let i = 0; i < 10; i++) {
      source.connect(delays[i]);
      delays[i].connect(gains[i]);
      gains[i].connect(masterGain);
    }

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
 * Play audio with Tarouk effects AND clapping sound merged together
 * Uses Web Audio API to mix both sounds as one
 */
export async function playWithTaroukAndClapEffects(
  audioUri: string,
  clapSoundUri: string,
  onEnd?: () => void
): Promise<{ stop: () => void } | null> {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const audioContext = new AudioContext();

    // Fetch and decode both audio files
    const [taroukResponse, clapResponse] = await Promise.all([
      fetch(audioUri),
      fetch(clapSoundUri),
    ]);
    
    const [taroukArrayBuffer, clapArrayBuffer] = await Promise.all([
      taroukResponse.arrayBuffer(),
      clapResponse.arrayBuffer(),
    ]);
    
    const [taroukBuffer, clapBuffer] = await Promise.all([
      audioContext.decodeAudioData(taroukArrayBuffer),
      audioContext.decodeAudioData(clapArrayBuffer),
    ]);

    // Create source for Tarouk
    const taroukSource = audioContext.createBufferSource();
    taroukSource.buffer = taroukBuffer;
    taroukSource.playbackRate.value = TAROUK_EFFECTS.speed.playbackRate;

    // Create 10 delays for chorus effect (10 voices like 10 men singing)
    const delays = [];
    const gains = [];
    
    for (let i = 0; i < 10; i++) {
      const delay = audioContext.createDelay(1.0);
      delay.delayTime.value = TAROUK_EFFECTS.chorus.delayTime * (1 + i * 0.3);
      delays.push(delay);
      
      const gain = audioContext.createGain();
      gain.gain.value = 0.9 - (i * 0.03);
      gains.push(gain);
    }

    // Create master gain for Tarouk
    const taroukGain = audioContext.createGain();
    taroukGain.gain.value = 0.7; // Slightly lower to make room for clapping

    // Connect Tarouk nodes
    taroukSource.connect(taroukGain);
    for (let i = 0; i < 10; i++) {
      taroukSource.connect(delays[i]);
      delays[i].connect(gains[i]);
      gains[i].connect(taroukGain);
    }

    // Create source for clapping (looped)
    const clapSource = audioContext.createBufferSource();
    clapSource.buffer = clapBuffer;
    clapSource.loop = true; // Loop the clapping

    // Create gain for clapping
    const clapGain = audioContext.createGain();
    clapGain.gain.value = 0.5; // Mix clapping at 50% volume

    // Connect clapping
    clapSource.connect(clapGain);

    // Create final mixer
    const mixer = audioContext.createGain();
    mixer.gain.value = 1.0;

    // Mix both sounds
    taroukGain.connect(mixer);
    clapGain.connect(mixer);

    // Connect to output
    mixer.connect(audioContext.destination);

    // Start both sources at the same time
    const startTime = audioContext.currentTime;
    taroukSource.start(startTime);
    clapSource.start(startTime);

    // Stop clapping when Tarouk ends
    taroukSource.onended = () => {
      try {
        clapSource.stop();
      } catch (e) {
        console.log("Clap source already stopped");
      }
      audioContext.close();
      onEnd?.();
    };

    return {
      stop: () => {
        try {
          taroukSource.stop();
          clapSource.stop();
        } catch (e) {
          console.log("Sources already stopped");
        }
        audioContext.close();
        onEnd?.();
      },
    };
  } catch (error) {
    console.error("Failed to play with Tarouk and clap effects:", error);
    return null;
  }
}

/**
 * Simple audio player with speed adjustment for native platforms
 */
export function getPlaybackRateForTarouk(): number {
  return TAROUK_EFFECTS.speed.playbackRate;
}
