import { MERCHANT_ONBOARDING_STEPS } from "@botlevy-commerce/shared";
import { LoginHelpSheet } from "../components/LoginHelpSheet";
import { MerchantHeader } from "../components/MerchantHeader";
import { OnboardingCarousel } from "../components/OnboardingCarousel";
import { OrderList } from "../components/OrderList";
import { ProductCatalog } from "../components/ProductCatalog";
import { ShopForm } from "../components/ShopForm";
import { useMerchantDashboard } from "../hooks/useMerchantDashboard";

export function MerchantPage() {
  const d = useMerchantDashboard();

  return (
    <div className="space-y-6">
      {d.showOnboarding ? (
        <OnboardingCarousel
          steps={MERCHANT_ONBOARDING_STEPS}
          onDone={d.finishOnboarding}
        />
      ) : null}

      <LoginHelpSheet open={d.showLoginHelp} onClose={d.closeLoginHelp} />

      <MerchantHeader
        signedIn={d.signedIn}
        walletBusy={d.walletBusy}
        buttonLabel={d.buttonLabel}
        walletError={d.walletError}
        connectError={d.connectError}
        address={d.address}
        wrongChain={d.wrongChain}
        error={d.error}
        onLogin={() => void d.startLogin()}
        onLogout={() => void d.logout()}
        onSwitchChain={d.switchToBsc}
        onOpenLoginHelp={d.openLoginHelp}
      />

      {d.merchant ? (
        <>
          <ShopForm
            shopName={d.shopName}
            location={d.location}
            payTo={d.merchant.payTo}
            busy={d.busy}
            onShopNameChange={d.setShopName}
            onLocationChange={d.setLocation}
            onSave={() => void d.saveShop()}
          />

          <ProductCatalog
            draft={d.draft}
            products={d.products}
            editingId={d.editingId}
            editDraft={d.editDraft}
            busy={d.busy}
            suggesting={d.suggesting}
            onDraftChange={d.setDraft}
            onEditDraftChange={d.setEditDraft}
            onSuggestTags={(target) => void d.suggestTags(target)}
            onAddProduct={() => void d.addProduct()}
            onStartEdit={d.startEdit}
            onSaveEdit={() => void d.saveEdit()}
            onCancelEdit={d.cancelEdit}
            onRemoveProduct={(id) => void d.removeProduct(id)}
          />

          <OrderList
            orders={d.orders}
            onFulfill={(id) => void d.fulfill(id)}
          />
        </>
      ) : null}
    </div>
  );
}
