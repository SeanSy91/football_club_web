(function () {
  'use strict';

  const defaultRoute = 'home';
  const publicRoutes = new Set(['home', 'login']);
  const views = Array.from(document.querySelectorAll('[data-view]'));
  const routeLinks = Array.from(document.querySelectorAll('[data-route-link]'));
  const knownRoutes = new Set(views.map((view) => view.dataset.view));
  const toast = document.querySelector('.toast');
  const googleLoginButton = document.querySelector('[data-google-login]');
  const authActionButton = document.querySelector('[data-auth-action]');
  const primaryAuthAction = document.querySelector('[data-primary-auth-action]');
  const statusDot = document.querySelector('.status-dot');
  const connectionStatus = document.querySelector('[data-connection-status]');
  const config = window.KFC_CONFIG;
  let authReady = false;
  let session = null;
  let toastTimer;

  const hasSupabaseConfig = Boolean(
    config?.supabaseUrl && config?.supabasePublishableKey && window.supabase?.createClient,
  );
  const supabaseClient = hasSupabaseConfig
    ? window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

  function requestedRoute() {
    const route = window.location.hash.replace(/^#/, '').trim();
    return knownRoutes.has(route) ? route : defaultRoute;
  }

  function currentRoute() {
    const route = requestedRoute();
    if (authReady && !session && !publicRoutes.has(route)) {
      return 'login';
    }
    if (authReady && session && route === 'login') {
      return 'profile';
    }
    return route;
  }

  function renderRoute() {
    const route = currentRoute();
    const requested = requestedRoute();

    if (route !== requested) {
      window.history.replaceState(null, '', `#${route}`);
    }

    views.forEach((view) => {
      view.hidden = view.dataset.view !== route;
    });

    routeLinks.forEach((link) => {
      const isCurrent = link.dataset.routeLink === route;
      link.toggleAttribute('aria-current', isCurrent);
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
    }, 4200);
  }

  function setConnectionState(state, message) {
    connectionStatus.textContent = message;
    statusDot.classList.toggle('is-ready', state === 'ready');
    statusDot.classList.toggle('is-error', state === 'error');
  }

  function updateAuthControls() {
    const isSignedIn = Boolean(session);
    authActionButton.textContent = isSignedIn ? '로그아웃' : '로그인';
    authActionButton.setAttribute('aria-label', isSignedIn ? '로그아웃' : '로그인');
    primaryAuthAction.textContent = isSignedIn ? '내 정보 보기' : 'Google로 시작하기';
    primaryAuthAction.href = isSignedIn ? '#profile' : '#login';
  }

  function resetProfile() {
    const avatar = document.querySelector('[data-profile-avatar]');
    avatar.textContent = 'K';
    avatar.style.backgroundImage = '';
    avatar.classList.remove('has-image');
    document.querySelector('[data-profile-status]').textContent = '로그인 필요';
    document.querySelector('[data-profile-name]').textContent = '회원 프로필';
    document.querySelector('[data-profile-email]').textContent =
      'Google 계정으로 로그인하면 본인 정보가 표시됩니다.';
  }

  async function loadProfile(user) {
    const fallbackName =
      user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'KFC 회원';
    const fallbackAvatar = user.user_metadata?.avatar_url || '';
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', user.id)
      .single();

    if (error) {
      document.querySelector('[data-profile-status]').textContent = '프로필 준비 필요';
      document.querySelector('[data-profile-name]').textContent = fallbackName;
      document.querySelector('[data-profile-email]').textContent = user.email || '이메일 정보 없음';
      showToast('프로필 데이터베이스 설정을 확인해 주세요.');
      return;
    }

    const avatarUrl = data.avatar_url || fallbackAvatar;
    const avatar = document.querySelector('[data-profile-avatar]');
    const displayName = data.display_name || fallbackName;
    avatar.textContent = avatarUrl ? '' : displayName.charAt(0).toUpperCase();
    avatar.style.backgroundImage = avatarUrl ? `url("${avatarUrl.replaceAll('"', '%22')}")` : '';
    avatar.classList.toggle('has-image', Boolean(avatarUrl));
    document.querySelector('[data-profile-status]').textContent = 'Google 로그인됨';
    document.querySelector('[data-profile-name]').textContent = displayName;
    document.querySelector('[data-profile-email]').textContent = user.email || '이메일 정보 없음';
  }

  async function handleAuthSession(nextSession) {
    session = nextSession;
    authReady = true;
    updateAuthControls();

    if (session?.user) {
      setConnectionState('ready', `${session.user.email || '회원'} 계정으로 로그인했습니다.`);
      await loadProfile(session.user);
    } else {
      resetProfile();
      setConnectionState('ready', 'Supabase가 연결되었습니다. Google 로그인을 사용할 수 있습니다.');
    }

    renderRoute();
  }

  async function signInWithGoogle() {
    if (!supabaseClient) {
      showToast('Supabase 연결 설정을 확인해 주세요.');
      return;
    }

    googleLoginButton.disabled = true;
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });

    if (error) {
      googleLoginButton.disabled = false;
      showToast(`Google 로그인을 시작하지 못했습니다: ${error.message}`);
    }
  }

  async function handleAuthAction() {
    if (!session) {
      window.location.hash = 'login';
      return;
    }

    authActionButton.disabled = true;
    const { error } = await supabaseClient.auth.signOut();
    authActionButton.disabled = false;
    if (error) {
      showToast(`로그아웃하지 못했습니다: ${error.message}`);
      return;
    }
    window.location.hash = 'home';
    showToast('로그아웃했습니다.');
  }

  document.querySelectorAll('[data-app-version]').forEach((element) => {
    element.textContent = config?.appVersion || '0.2.0';
  });

  googleLoginButton?.addEventListener('click', signInWithGoogle);
  authActionButton?.addEventListener('click', handleAuthAction);
  window.addEventListener('hashchange', renderRoute);

  if (!window.location.hash) {
    window.history.replaceState(null, '', '#home');
  }

  if (!supabaseClient) {
    authReady = true;
    setConnectionState('error', 'Supabase 연결 설정이 필요합니다.');
    updateAuthControls();
    renderRoute();
    return;
  }

  supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
    window.setTimeout(() => handleAuthSession(nextSession), 0);
  });
  renderRoute();
})();
