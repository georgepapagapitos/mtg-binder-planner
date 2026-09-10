import './HomePage.css';
import { HomeHero } from '../components/home/HomeHero';
import { GetStartedCard } from '../components/home/GetStartedCard';
import { ActivityStripCard } from '../components/home/ActivityStripCard';
import { NewFromFriendsCard } from '../components/home/NewFromFriendsCard';
import { DiscoverCard } from '../components/home/DiscoverCard';
import { RecentDecksCard } from '../components/home/RecentDecksCard';
import { GameNightCard } from '../components/home/GameNightCard';
import { ValueMoversCard } from '../components/home/ValueMoversCard';
import { TradeTargetsCard } from '../components/home/TradeTargetsCard';
import { NewArrivalsCard } from '../components/home/NewArrivalsCard';
import { BinderReviewCard } from '../components/home/BinderReviewCard';

/**
 * The /home dashboard (social program W3) — the default landing for authed
 * users since w3-nav-activation shipped (App.tsx routes both `/` and the
 * catch-all here for them); still reachable by direct URL for guests, who
 * are never auto-routed here. The
 * hero band (HomeHero — pass 2b, "your collection is the hero") replaces the
 * old plain `<h1>` + Quick Actions with collection art, the greeting/value,
 * the scale line, a scoped deck search, and Quick Actions along its bottom
 * edge; the bento grid below (3 columns from a 1200px container, cards at
 * their natural height — see HomePage.css) holds the three social cards
 * (activity/friends/discover) plus
 * the five signal cards (decks/game nights/value/arrivals/binder review) and
 * one insight-only card (trade targets) — each card reads state the app
 * already computes elsewhere, never a re-capture. TradeTargetsCard renders
 * nothing when there's nothing to show (no invitation value in an empty
 * want-list summary), so the mounted count varies 8-9 in practice.
 * GetStartedCard leads the grid and renders nothing once an account has
 * imported a collection, built a binder, and made a deck (T117).
 */
export function HomePage() {
  return (
    <div className="home-page">
      <HomeHero />
      <div className="deck-bento home-bento">
        <GetStartedCard />
        <ActivityStripCard />
        <NewFromFriendsCard />
        <DiscoverCard />
        <RecentDecksCard />
        <GameNightCard />
        <ValueMoversCard />
        <TradeTargetsCard />
        <NewArrivalsCard />
        <BinderReviewCard />
      </div>
    </div>
  );
}
