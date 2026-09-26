import { useState } from "react";
import {
  isOnboardingDone,
  markOnboardingDone,
} from "@botlevy-commerce/shared";

export function useMerchantOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(
    () => !isOnboardingDone("merchant"),
  );
  const [showLoginHelp, setShowLoginHelp] = useState(false);

  function finishOnboarding() {
    markOnboardingDone("merchant");
    setShowOnboarding(false);
  }

  function openLoginHelp() {
    setShowLoginHelp(true);
  }

  function closeLoginHelp() {
    setShowLoginHelp(false);
  }

  return {
    showOnboarding,
    finishOnboarding,
    showLoginHelp,
    openLoginHelp,
    closeLoginHelp,
  };
}
