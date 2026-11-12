// Web Audio API & SpeechSynthesis Voice Announcement Helper
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// Auto-unlock AudioContext on first user interaction
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      if ('speechSynthesis' in window && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch {
      // ignore
    }
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
  };
  window.addEventListener('click', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  window.addEventListener('touchstart', unlockAudio);
}

// Global cache to prevent duplicate speech announcements within 12 seconds
const recentSpokenTexts = new Map<string, number>();

/**
 * Text-to-Speech (TTS) voice announcement in Vietnamese
 */
export function speakText(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }

  // Strip HTML tags and normalize whitespace for clean voice playback
  const cleanText = text
    .replace(/<[^>]*>?/gm, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, ' và ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanText) return;

  // Normalize key for deduplication comparison (ignore case, punctuation and spacing)
  const normKey = cleanText
    .toLowerCase()
    .replace(/[^a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/g, '');

  const now = Date.now();
  const lastSpokenTime = recentSpokenTexts.get(normKey) || 0;

  // Chặn hoàn toàn nếu câu nói giống nhau được gọi lại trong vòng 12 giây
  if (now - lastSpokenTime < 12000) {
    console.info('[TTS] Bỏ qua câu thông báo trùng lặp trong 12s:', cleanText);
    return;
  }
  recentSpokenTexts.set(normKey, now);

  // Dọn dẹp cache cũ sau mỗi 50 entries
  if (recentSpokenTexts.size > 50) {
    for (const [k, v] of recentSpokenTexts.entries()) {
      if (now - v > 30000) recentSpokenTexts.delete(k);
    }
  }

  // Always trigger chime sound alert for clear audibility
  playElevatorChime();

  try {
    const doSpeak = () => {
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'vi-VN';
        utterance.rate = 0.95; // Clear natural voice rate for warehouse speakers
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // Prevent Chromium GC bug by pinning utterance to global window
        (window as any).__lastSpeechUtterance = utterance;

        const assignVoiceAndPlay = () => {
          const voices = window.speechSynthesis.getVoices();
          const viVoice = voices.find(v => v.lang.includes('vi') || v.lang.includes('VI'));
          if (viVoice) {
            utterance.voice = viVoice;
          }
          window.speechSynthesis.speak(utterance);
        };

        if (window.speechSynthesis.getVoices().length === 0) {
          const handleVoices = () => {
            window.speechSynthesis.removeEventListener('voiceschanged', handleVoices);
            assignVoiceAndPlay();
          };
          window.speechSynthesis.addEventListener('voiceschanged', handleVoices);
          // Fallback if event does not trigger
          setTimeout(assignVoiceAndPlay, 100);
        } else {
          assignVoiceAndPlay();
        }
      } catch (err) {
        console.warn('SpeechSynthesis inner error:', err);
      }
    };

    // If currently speaking, cancel and delay 80ms to avoid Chromium cancel/speak bug
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      setTimeout(doSpeak, 80);
    } else {
      setTimeout(doSpeak, 250); // slight pause after chime
    }
  } catch (err) {
    console.warn('SpeechSynthesis error:', err);
  }
}

/**
 * Announcement when a lift arrives at a target floor with goods
 */
export function speakLiftArrival(liftName: string, floor: number) {
  const formattedLift = liftName.replace(/^Lift\s*/i, 'Thang P').replace(/^Tời\s*/i, 'Thang P');
  const message = `Thông báo, ${formattedLift} đã vận chuyển hàng đến Tầng ${floor}. Yêu cầu nhân viên điều phối kho Tầng ${floor} kiểm tra kéo hàng!`;
  speakText(message);
}

/**
 * Warning announcement when cargo remains uncollected after 2 minutes (120s)
 */
export function speakUncollectedWarning(liftName: string, floor: number, minutes: number = 2) {
  const formattedLift = liftName.replace(/^Lift\s*/i, 'Thang P').replace(/^Tời\s*/i, 'Thang P');
  const message = `Cảnh báo! ${formattedLift} tại Tầng ${floor} chưa được kéo hàng quá ${minutes} phút. Yêu cầu điều phối kho Tầng ${floor} khẩn trương kéo hàng!`;
  speakText(message);
}

/**
 * Plays a classic elevator "Ding-Dong" arrival chime (legacy fallback).
 */
export function playElevatorChime() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(783.99, now);

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.4, now + 0.03);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 1.2);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();

    const startTime2 = now + 0.28;
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(523.25, startTime2);

    gain2.gain.setValueAtTime(0, startTime2);
    gain2.gain.linearRampToValueAtTime(0.45, startTime2 + 0.03);
    gain2.gain.exponentialRampToValueAtTime(0.001, startTime2 + 1.5);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(startTime2);
    osc2.stop(startTime2 + 1.5);
  } catch (err) {
    console.warn('Could not play elevator chime audio:', err);
  }
}
