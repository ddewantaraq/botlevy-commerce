export {
  config,
  API_URL,
  MOCK_USDC_ADDRESS,
  CHAIN_ID,
  hasInjectedProvider,
  getPreferredConnector,
} from "./wagmi";
export { siweLogin, siweLogout, type SessionRole } from "./siwe";
export {
  setSiweLoginIntent,
  getSiweLoginIntent,
  clearSiweLoginIntent,
  hasSiweLoginIntent,
} from "./siwe-intent";
export {
  useWalletSiweLogin,
  type WalletSiwePhase,
  type SiweLoginResult,
} from "./use-wallet-siwe-login";
export {
  isOnboardingDone,
  markOnboardingDone,
  type OnboardingApp,
} from "./onboarding-storage";
export {
  LOGIN_HELP,
  COOKER_ONBOARDING_STEPS,
  MERCHANT_ONBOARDING_STEPS,
  type OnboardingStep,
} from "./onboarding-copy";
export { MOCK_USDC_ABI, formatMusdc, parseMusdc } from "./token";
export {
  speakText,
  stopSpeaking,
  isSpeechRecognitionSupported,
  createSpeechRecognition,
  normalizeSpeechTranscript,
  transcriptFromRecognitionResults,
} from "./speech";
export {
  UNITS,
  MERCHANT_UNITS,
  RECIPE_UNITS,
  normalizeUnit,
  unitsCompatible,
  isMerchantUnit,
  formatQtyUnit,
  formatIngredientLabel,
  type UnitsConfig,
} from "./units";
