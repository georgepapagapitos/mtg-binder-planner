/* global location, navigator, Blob, document */
// First-party, cookieless usage beacon (see /privacy.html). Sends only an
// event name and this page's path to our own server, which keeps a daily
// aggregate count. No cookie, identifier, or IP address is stored.
(function () {
  function send(name) {
    var body = JSON.stringify({ name: name, path: location.pathname });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }));
    }
  }
  send('pageview');
  document.querySelectorAll('a.cta').forEach(function (a) {
    a.addEventListener('click', function () {
      send('guide_cta');
    });
  });
})();
