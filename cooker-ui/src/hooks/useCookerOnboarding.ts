import { useState } from "react";
import {
  isOnboardingDone,
  markOnboardingDone,
} from "@botlevy-commerce/shared";

export function useCookerOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(
    () => !isOnboardingDone("cooker"),
  );
  const [showLoginHelp, setShowLoginHelp] = useState(false);

  function finishOnboarding() {
    markOnboardingDone("cooker");
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
