import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import 'mana-font/css/mana.min.css';
import 'keyrune/css/keyrune.min.css';
// Must follow the two vendor stylesheets — it re-points their @font-face rules
// at our bbox-corrected woff2 builds (see the file header).
import './styles/icon-fonts.css';
// Split from the former styles/global.css — imported in original cascade order
// so the split is a pure file-organization change (no behavior change).
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base-layout.css';
import './styles/import-upload.css';
import './styles/forms-banners.css';
import './styles/binder-hero.css';
import './styles/search-controls.css';
import './styles/stats-breakdown.css';
import './styles/tabs.css';
import './styles/binder-grid-slots.css';
import './styles/tooltip-legend.css';
import './styles/feedback-spinner.css';
import './styles/binder-nav.css';
import './styles/modals-dialogs.css';
import './styles/binder-rules-editor.css';
import './styles/footer-card-preview.css';
import './styles/responsive-nav.css';
import './styles/collection.css';
import './styles/auth.css';
import './styles/settings-sync.css';
import './styles/binder-card-management.css';
import './styles/admin-scanner.css';
import './styles/holographic.css';
import './styles/themes.css';
import './styles/typesets.css';
// Split from the former styles/deck-builder.css — imported in original cascade order (byte-identical).
import './styles/deck-builder-page.css';
import './styles/deck-builder-commander.css';
import './styles/deck-builder-settings.css';
import './styles/deck-builder-display.css';
import './styles/deck-builder-card-list.css';
import './styles/deck-builder-analysis.css';
import './styles/deck-builder-decks-index.css';
import './styles/deck-builder-editor.css';
import './styles/deck-builder-customizer.css';
import './styles/deck-builder-export.css';
import './styles/deck-builder-card-search.css';
import './styles/deck-builder-test-hand.css';
import './styles/deck-builder-combos.css';
import './styles/deck-builder-tabs.css';
import './styles/deck-builder-combos-list.css';
import './styles/deck-builder-row-qty.css';
import './styles/deck-builder-toast.css';
import './styles/deck-builder-binder-slot.css';
import './styles/deck-builder-responsive.css';
import './styles/deck-builder-import-dialog.css';
import './styles/deck-builder-deck-extras.css';
import './styles/deck-builder-binders-index.css';
import './styles/deck-builder-analysis-panel.css';
import './styles/deck-builder-commander-profile.css';
import './styles/deck-builder-guided.css';
import './styles/deck-builder-skeleton.css';
// Split from the former styles/play.css — imported in original cascade order.
import './styles/play-setup.css';
import './styles/play-board.css';
import './styles/play-panel-menus.css';
import './styles/play-history-inline.css';
import './styles/play-effects.css';
import './styles/play-enhancements.css';
import './styles/play-layout-editor.css';
import './styles/play-counters-panel.css';
import './styles/social-shared.css';
import './styles/shared.css';
import { bootstrapTheme, useThemeStore } from './store/theme';
import { bootstrapTypeSet } from './store/typeset';
import { loadTaggerData } from './deck-builder/services/tagger/client';
import { loadCardSimilar } from './deck-builder/services/deckBuilder/cardSimilar';
import { registerPwa } from './lib/register-pwa';
import { tagPlatform, syncStatusBar, hideSplashWhenReady } from './lib/platform';
import { initKeyboardLayer } from './lib/keyboard';
import { installErrorReporting, startVitals } from './lib/analytics';
import { hasEverVisited } from './lib/first-run';

// First, so an exception anywhere in the boot below is counted too.
installErrorReporting();
startVitals();
tagPlatform();
bootstrapTheme();
bootstrapTypeSet();
void syncStatusBar();
initKeyboardLayer();
// Re-sync the native status bar icons whenever the user switches themes;
// no-op on web.
useThemeStore.subscribe(() => {
  void syncStatusBar();
});
// Warm the two deck-builder corpora — the tagger role index and the EDHREC
// substitute index — so the first deck build / Coach pass has them in hand.
// Together they are ~500 KB gzipped, so they are NOT part of the boot: a
// first-time visitor reading the landing page never pays for them (every
// consumer loads on demand anyway — useTaggerReady, dataAcquisition), and a
// returning user fetches them only after the app's own assets have loaded.
// Both loaders cache and dedupe, so calling them again later is free.
if (hasEverVisited()) {
  const warm = () => {
    void loadTaggerData();
    void loadCardSimilar();
  };
  if (document.readyState === 'complete') warm();
  else window.addEventListener('load', warm, { once: true });
}
// Register the service worker for installable / offline-capable behavior.
// No-op in dev (devOptions.enabled = false in vite.config.ts).
void registerPwa();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

// Splash stays up until the first frame is actually on screen; no-op on web.
hideSplashWhenReady();
