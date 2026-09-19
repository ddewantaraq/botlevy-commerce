/** Browser TTS + SpeechRecognition helpers (ChatGPT-style mic). */

export function speakText(text: string, lang = "id-ID") {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
}

/** Soft-normalize ASR transcript before sending to chat/agent. */
export function normalizeSpeechTranscript(raw: string): string {
  return raw
    .trim()
    .replace(/[.…,!?？！。、;:"""''`~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type RecognitionResultLike = {
  0: { transcript: string };
  isFinal: boolean;
};

type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult:
    | ((ev: { results: ArrayLike<RecognitionResultLike> }) => void)
    | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
};

/** Collect final transcripts; fall back to last interim if none final. */
export function transcriptFromRecognitionResults(
  results: ArrayLike<RecognitionResultLike>,
): string {
  const finals: string[] = [];
  let last = "";
  for (let i = 0; i < results.length; i++) {
    const row = results[i];
    const piece = row?.[0]?.transcript?.trim() ?? "";
    if (!piece) continue;
    last = piece;
    if (row.isFinal) finals.push(piece);
  }
  const joined = (finals.length > 0 ? finals.join(" ") : last).trim();
  return normalizeSpeechTranscript(joined);
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    SpeechRecognition?: new () => RecognitionLike;
    webkitSpeechRecognition?: new () => RecognitionLike;
  };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function createSpeechRecognition(): RecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => RecognitionLike;
    webkitSpeechRecognition?: new () => RecognitionLike;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = "id-ID";
  rec.continuous = false;
  rec.interimResults = false;
  return rec;
}
