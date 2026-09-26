import { MicIcon } from "./MicIcon";
import type { CookingSession } from "../types/chat";

type Props = {
  draft: string;
  onDraftChange: (value: string) => void;
  error: string;
  signedIn: boolean;
  busy: boolean;
  session: CookingSession | null;
  micSupported: boolean;
  pendingHandsFreeAsk: boolean;
  handsFree: boolean;
  listening: boolean;
  ttsSpeaking: boolean;
  pantry: string[];
  onSend: () => void;
  onToggleMic: () => void;
  onHandsFreeOn: () => void;
  onHandsFreeOff: () => void;
  onStopTts: () => void;
};

export function ChatComposer({
  draft,
  onDraftChange,
  error,
  signedIn,
  busy,
  session,
  micSupported,
  pendingHandsFreeAsk,
  handsFree,
  listening,
  ttsSpeaking,
  pantry,
  onSend,
  onToggleMic,
  onHandsFreeOn,
  onHandsFreeOff,
  onStopTts,
}: Props) {
  return (
    <>
      {error ? (
        <p className="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      <div className="shrink-0 border-t border-[var(--line)] bg-[var(--canvas)]/95 px-4 py-3">
        {(session?.status === "cooking" || session?.status === "prep") &&
        micSupported ? (
          <div className="mx-auto mb-2 flex max-w-3xl flex-wrap items-center gap-2 text-xs">
            <span className="text-[var(--body)]">Hands-free</span>
            <button
              type="button"
              disabled={!signedIn || busy}
              onClick={onHandsFreeOn}
              className={`rounded-lg px-2.5 py-1 font-semibold ${
                !pendingHandsFreeAsk && handsFree
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--line)] bg-white text-[var(--ink)]"
              }`}
            >
              On
            </button>
            <button
              type="button"
              disabled={!signedIn || busy}
              onClick={onHandsFreeOff}
              className={`rounded-lg px-2.5 py-1 font-semibold ${
                !pendingHandsFreeAsk && !handsFree
                  ? "bg-[var(--ink)] text-white"
                  : "border border-[var(--line)] bg-white text-[var(--ink)]"
              }`}
            >
              Off
            </button>
            {pendingHandsFreeAsk ? (
              <span className="text-[var(--body)]">Choose On or Off…</span>
            ) : listening ? (
              <span className="text-red-600">Listening…</span>
            ) : ttsSpeaking ? (
              <span className="text-[var(--body)]">Agent speaking…</span>
            ) : null}
          </div>
        ) : null}
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            rows={1}
            placeholder={
              signedIn
                ? pendingHandsFreeAsk
                  ? "ya / tidak (hands-free)…"
                  : session?.status === "prep" && session.prepGuide === "ask"
                    ? "satu-satu / langsung…"
                    : session?.status === "prep" && session.prepGuide === "walk"
                      ? "lanjut / balik / ulang / mulai masak…"
                      : session?.status === "prep"
                        ? "mulai masak / bahan siap…"
                        : session?.status === "cooking"
                          ? "lanjut / balik / ulang / selesai…"
                          : "Pesan ke agent…"
                : "Login dulu…"
            }
            disabled={!signedIn || busy}
            className="max-h-32 min-h-[44px] flex-1 resize-y rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
          />
          <button
            type="button"
            title={
              !micSupported
                ? "Voice tidak didukung"
                : session?.status === "cooking" || session?.status === "prep"
                  ? handsFree
                    ? "Hands-free on — tap to turn off"
                    : "Hands-free off — tap to turn on"
                  : "Voice input (push-to-talk)"
            }
            aria-label={micSupported ? "Voice input" : "Voice tidak didukung"}
            aria-pressed={listening || handsFree}
            disabled={!signedIn || !micSupported || (busy && !handsFree)}
            onClick={onToggleMic}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${
              listening || handsFree
                ? "animate-pulse border-red-400 bg-red-50 text-red-600"
                : "border-[var(--line)] bg-white text-[var(--ink)]"
            } disabled:opacity-40`}
          >
            <MicIcon />
          </button>
          <button
            type="button"
            disabled={!signedIn || busy || !draft.trim()}
            onClick={onSend}
            className="flex h-11 shrink-0 items-center rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            ➤
          </button>
          <button
            type="button"
            title="Stop TTS"
            onClick={onStopTts}
            className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-white text-xs sm:flex"
          >
            🔇
          </button>
        </div>
        {pantry.length > 0 ? (
          <p className="mx-auto mt-2 max-w-3xl text-[10px] text-[var(--body)]">
            Pantry: {pantry.join(", ")}
          </p>
        ) : null}
      </div>
    </>
  );
}
