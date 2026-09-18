let audio: HTMLAudioElement | null = null;
let enabled = true;

function getAudio() {
  if (typeof window === "undefined") return null;

  if (!audio) {
    audio = new Audio("/sounds/new-lead.mp3");
    audio.preload = "auto";
    audio.volume = 0.9;
  }

  return audio;
}

export async function unlockNotificationSound() {
  const sound = getAudio();
  if (!sound) return false;

  try {
    sound.muted = true;
    sound.currentTime = 0;
    await sound.play();
    sound.pause();
    sound.currentTime = 0;
    sound.muted = false;
    enabled = true;
    window.dispatchEvent(new Event("leadflow:sound-enabled"));
    return true;
  } catch {
    sound.muted = false;
    enabled = false;
    return false;
  }
}

export async function playNotificationSound() {
  const sound = getAudio();
  if (!sound || !enabled) return false;

  try {
    sound.pause();
    sound.currentTime = 0;
    await sound.play();
    return true;
  } catch {
    sound.muted = false;
    enabled = true;

    window.dispatchEvent(new Event("leadflow:sound-enabled"));

    return false;
  }
}

export function isNotificationSoundEnabled() {
  return enabled;
}
