(function () {
  'use strict';

  const defaultRoute = 'home';
  const views = Array.from(document.querySelectorAll('[data-view]'));
  const routeLinks = Array.from(document.querySelectorAll('[data-route-link]'));
  const knownRoutes = new Set(views.map((view) => view.dataset.view));
  const toast = document.querySelector('.toast');
  let toastTimer;

  function currentRoute() {
    const requestedRoute = window.location.hash.replace(/^#/, '').trim();
    return knownRoutes.has(requestedRoute) ? requestedRoute : defaultRoute;
  }

  function renderRoute() {
    const route = currentRoute();

    views.forEach((view) => {
      view.hidden = view.dataset.view !== route;
    });

    routeLinks.forEach((link) => {
      const isCurrent = link.dataset.routeLink === route;
      if (isCurrent) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    const activeView = document.querySelector(`[data-view="${route}"]`);
    const heading = activeView?.querySelector('h1');
    document.title = heading
      ? `${heading.textContent.replace(/\s+/g, ' ').trim()} | KFC Football Club`
      : 'KFC Football Club';

    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 3600);
  }

  document.querySelector('[data-google-login]')?.addEventListener('click', () => {
    const config = window.KFC_CONFIG;
    if (!config?.supabaseUrl || !config?.supabasePublishableKey) {
      showToast('Supabase 프로젝트를 연결한 뒤 Google 로그인을 사용할 수 있습니다.');
      return;
    }

    showToast('Google 로그인 연결은 다음 개발 단계에서 활성화됩니다.');
  });

  window.addEventListener('hashchange', renderRoute);

  if (!window.location.hash) {
    window.history.replaceState(null, '', '#home');
  }
  renderRoute();
})();
