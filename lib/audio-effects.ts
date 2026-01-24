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
  // Echo settings (medium echo effect)
  echo: {
    delayTime: 0.18, // 180ms delay for medium echo
    feedback: 0.35, // 35% feedback for 2-3 repetitions
    wetMix: 0.45, // 45% wet signal for balanced echo
    numberOfEchoes: 3, // Number of echo repetitions
  },
  // Pitch shift settings (slight pitch change)
  pitch: {
    playbackRate: 1.02, // 2% faster = slightly higher pitch (subtle difference)
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

  // Create delay node for echo effect
  const delayNode = audioContext.createDelay(1.0);
  delayNode.delayTime.value = TAROUK_EFFECTS.echo.delayTime;

  // Create feedback gain for echo repetitions
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
  };
}

/**
 * Set playback rate for pitch shift on native platforms
 */
export function applyPitchShift(player: any) {
  if (player && player.playbackRate !== undefined) {
    player.playbackRate = TAROUK_EFFECTS.pitch.playbackRate;
  }
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

    // Set playback rate (pitch shift)
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = TAROUK_EFFECTS.pitch.playbackRate;

    // Create echo delays
    const delays = [];
    const gains = [];
    
    for (let i = 0; i < TAROUK_EFFECTS.echo.numberOfEchoes; i++) {
      const delay = audioContext.createDelay(1.0);
      delay.delayTime.value = TAROUK_EFFECTS.echo.delayTime * (i + 1); // 0.18s, 0.36s, 0.54s
      delays.push(delay);
      
      const gain = audioContext.createGain();
      // Each echo is quieter: 0.35, 0.12, 0.04
      gain.gain.value = Math.pow(TAROUK_EFFECTS.echo.feedback, i + 1);
      gains.push(gain);
    }

    // Create master gain
    const masterGain = audioContext.createGain();
    masterGain.gain.value = 0.8;

    // Create wet/dry mix
    const dryGain = audioContext.createGain();
    dryGain.gain.value = 1 - TAROUK_EFFECTS.echo.wetMix; // 55% dry
    
    const wetGain = audioContext.createGain();
    wetGain.gain.value = TAROUK_EFFECTS.echo.wetMix; // 45% wet

    // Connect nodes
    // Dry signal (original)
    source.connect(dryGain);
    dryGain.connect(masterGain);

    // Wet signal (echo)
    const echoDelay = audioContext.createDelay(1.0);
    echoDelay.delayTime.value = TAROUK_EFFECTS.echo.delayTime;
    
    const echoFeedback = audioContext.createGain();
    echoFeedback.gain.value = TAROUK_EFFECTS.echo.feedback;
    
    // Echo feedback loop
    source.connect(echoDelay);
    echoDelay.connect(echoFeedback);
    echoFeedback.connect(echoDelay); // Feedback loop
    echoDelay.connect(wetGain);
    wetGain.connect(masterGain);  // Connect to output
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
    taroukSource.playbackRate.value = TAROUK_EFFECTS.pitch.playbackRate;

    // Create echo effect
    const taroukDryGain = audioContext.createGain();
    taroukDryGain.gain.value = 1 - TAROUK_EFFECTS.echo.wetMix;
    
    const taroukWetGain = audioContext.createGain();
    taroukWetGain.gain.value = TAROUK_EFFECTS.echo.wetMix;
    
    const taroukEchoDelay = audioContext.createDelay(1.0);
    taroukEchoDelay.delayTime.value = TAROUK_EFFECTS.echo.delayTime;
    
    const taroukEchoFeedback = audioContext.createGain();
    taroukEchoFeedback.gain.value = TAROUK_EFFECTS.echo.feedback;

    // Create master gain for Tarouk
    const taroukGain = audioContext.createGain();
    taroukGain.gain.value = 0.7; // Slightly lower to make room for clapping

    // Connect Tarouk nodes (echo)
    taroukSource.connect(taroukDryGain);
    taroukDryGain.connect(taroukGain);
    
    taroukSource.connect(taroukEchoDelay);
    taroukEchoDelay.connect(taroukEchoFeedback);
    taroukEchoFeedback.connect(taroukEchoDelay);
    taroukEchoDelay.connect(taroukWetGain);
    taroukWetGain.connect(taroukGain);

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
  return TAROUK_EFFECTS.pitch.playbackRate;
}
