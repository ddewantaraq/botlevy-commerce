import {
  COOKER_ONBOARDING_STEPS,
} from "@botlevy-commerce/shared";
import { ChatComposer } from "../components/ChatComposer";
import { ChatTranscript } from "../components/ChatTranscript";
import { CookerHeader } from "../components/CookerHeader";
import { LoginHelpSheet } from "../components/LoginHelpSheet";
import { OnboardingCarousel } from "../components/OnboardingCarousel";
import { useCookerChat } from "../hooks/useCookerChat";

export function CookerChatPage() {
  const chat = useCookerChat();

  return (
    <div className="flex h-[100dvh] flex-col">
      {chat.showOnboarding ? (
        <OnboardingCarousel
          steps={COOKER_ONBOARDING_STEPS}
          onDone={chat.finishOnboarding}
        />
      ) : null}

      <LoginHelpSheet
        open={chat.showLoginHelp}
        onClose={chat.closeLoginHelp}
      />

      <CookerHeader
        session={chat.session}
        handsFree={chat.handsFree}
        pendingHandsFreeAsk={chat.pendingHandsFreeAsk}
        signedIn={chat.signedIn}
        walletBusy={chat.walletBusy}
        buttonLabel={chat.buttonLabel}
        walletError={chat.walletError}
        connectError={chat.connectError}
        address={chat.address}
        wrongChain={chat.wrongChain}
        onLogin={() => void chat.startLogin()}
        onLogout={() => void chat.logout()}
        onSwitchChain={chat.switchToBsc}
        onOpenLoginHelp={chat.openLoginHelp}
      />

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden">
        <ChatTranscript
          messages={chat.messages}
          busy={chat.busy}
          bottomRef={chat.bottomRef}
          session={chat.session}
          pendingHandsFreeAsk={chat.pendingHandsFreeAsk}
          paying={chat.paying}
          confirmingPay={chat.confirmingPay}
          signedIn={chat.signedIn}
          onSend={(text) => void chat.handleSend(text)}
          onTogglePrepTag={(tag, value) => void chat.togglePrepTag(tag, value)}
          onPickDish={(dish) => void chat.pickDish(dish)}
          onPayQuote={(quote, runId) => void chat.payQuote(quote, runId)}
          onStartPrep={(runId) => void chat.startPrep(runId)}
          onSaveMenu={(plan) => void chat.saveMenu(plan)}
        />

        <ChatComposer
          draft={chat.draft}
          onDraftChange={chat.setDraft}
          error={chat.error}
          signedIn={chat.signedIn}
          busy={chat.busy}
          session={chat.session}
          micSupported={chat.micSupported}
          pendingHandsFreeAsk={chat.pendingHandsFreeAsk}
          handsFree={chat.handsFree}
          listening={chat.listening}
          ttsSpeaking={chat.ttsSpeaking}
          pantry={chat.pantry}
          onSend={() => void chat.handleSend()}
          onToggleMic={chat.toggleMic}
          onHandsFreeOn={() => chat.resolveHandsFreeAsk(true)}
          onHandsFreeOff={() => chat.resolveHandsFreeAsk(false)}
          onStopTts={chat.stopTts}
        />
      </div>
    </div>
  );
}
