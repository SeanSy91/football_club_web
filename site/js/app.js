(function () {
  'use strict';

  const PROFILE_BUCKET = 'profile-images';
  const PROFILE_IMAGE_PATH = 'avatar.webp';
  const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;
  const MAX_PROFILE_IMAGE_BYTES = 1024 * 1024;
  const PROFILE_IMAGE_SIZE = 512;
  const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
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
  const profileForm = document.querySelector('[data-profile-form]');
  const profileEditButton = document.querySelector('[data-profile-edit]');
  const profileCancelButton = document.querySelector('[data-profile-cancel]');
  const profileSaveButton = document.querySelector('[data-profile-save]');
  const profilePhotoInput = document.querySelector('[data-profile-photo]');
  const profilePhotoRemoveButton = document.querySelector('[data-profile-photo-remove]');
  const profileFormStatus = document.querySelector('[data-profile-form-status]');
  const profileBioInput = document.querySelector('[data-profile-bio-input]');
  const profileBioCount = document.querySelector('[data-profile-bio-count]');
  const config = window.KFC_CONFIG;
  let authReady = false;
  let session = null;
  let currentProfile = null;
  let currentAvatarUrl = '';
  let selectedAvatarBlob = null;
  let selectedAvatarPreviewUrl = '';
  let useDefaultAvatar = false;
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
      link.toggleAttribute('aria-current', link.dataset.routeLink === route);
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

  function initialsFor(displayName) {
    return displayName?.trim().charAt(0).toUpperCase() || 'K';
  }

  function setAvatar(element, imageUrl, displayName) {
    if (!element) return;
    element.textContent = imageUrl ? '' : initialsFor(displayName);
    element.style.backgroundImage = imageUrl ? `url("${imageUrl.replaceAll('"', '%22')}")` : '';
    element.classList.toggle('has-image', Boolean(imageUrl));
  }

  function setProfileAvatars(summaryUrl, editUrl, displayName) {
    setAvatar(document.querySelector('[data-profile-avatar]'), summaryUrl, displayName);
    setAvatar(document.querySelector('[data-edit-avatar]'), editUrl ?? summaryUrl, displayName);
  }

  function formatFoot(value) {
    return { right: '오른발', left: '왼발', both: '양발' }[value] || '—';
  }

  function renderProfile(profile, email, avatarUrl) {
    const completed = Number.isInteger(profile.age);
    currentProfile = profile;
    currentAvatarUrl = avatarUrl;
    document.querySelector('[data-profile-status]').textContent = completed
      ? '프로필 등록 완료'
      : '프로필 작성 필요';
    document.querySelector('[data-profile-name]').textContent = profile.display_name;
    document.querySelector('[data-profile-email]').textContent = email || '이메일 정보 없음';
    document.querySelector('[data-profile-age]').textContent = completed ? `${profile.age}세` : '—';
    document.querySelector('[data-profile-position]').textContent = profile.preferred_position || '—';
    document.querySelector('[data-profile-foot]').textContent = formatFoot(profile.preferred_foot);
    document.querySelector('[data-profile-number]').textContent = Number.isInteger(profile.shirt_number)
      ? profile.shirt_number
      : '—';
    document.querySelector('[data-profile-bio]').textContent =
      profile.bio || '자기소개를 등록해 보세요.';
    setProfileAvatars(avatarUrl, avatarUrl, profile.display_name);
    profileEditButton.disabled = false;

    if (!completed) {
      openProfileForm();
    }
  }

  function resetProfile() {
    currentProfile = null;
    currentAvatarUrl = '';
    clearSelectedAvatar();
    document.querySelector('[data-profile-status]').textContent = '로그인 필요';
    document.querySelector('[data-profile-name]').textContent = '회원 프로필';
    document.querySelector('[data-profile-email]').textContent =
      'Google 계정으로 로그인하면 본인 정보가 표시됩니다.';
    document.querySelector('[data-profile-age]').textContent = '—';
    document.querySelector('[data-profile-position]').textContent = '—';
    document.querySelector('[data-profile-foot]').textContent = '—';
    document.querySelector('[data-profile-number]').textContent = '—';
    document.querySelector('[data-profile-bio]').textContent = '자기소개를 등록해 보세요.';
    setProfileAvatars('', '', 'K');
    profileEditButton.disabled = true;
    profileForm.hidden = true;
  }

  async function resolveAvatarUrl(profile) {
    if (profile.use_default_avatar) return '';
    if (!profile.avatar_path) return profile.avatar_url || '';

    const { data, error } = await supabaseClient.storage
      .from(PROFILE_BUCKET)
      .createSignedUrl(profile.avatar_path, 3600);
    if (error) {
      showToast('프로필 사진을 불러오지 못해 기본 이미지를 표시합니다.');
      return '';
    }
    return `${data.signedUrl}&v=${Date.now()}`;
  }

  async function loadProfile(user) {
    const fallbackName =
      user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'KFC 회원';
    const { data, error } = await supabaseClient
      .from('profiles')
      .select(
        'display_name, age, avatar_url, avatar_path, use_default_avatar, preferred_position, preferred_foot, shirt_number, bio',
      )
      .eq('id', user.id)
      .single();

    if (error) {
      document.querySelector('[data-profile-status]').textContent = '프로필 준비 필요';
      document.querySelector('[data-profile-name]').textContent = fallbackName;
      document.querySelector('[data-profile-email]').textContent = user.email || '이메일 정보 없음';
      setProfileAvatars(user.user_metadata?.avatar_url || '', null, fallbackName);
      profileEditButton.disabled = true;
      showToast('프로필 데이터베이스 설정을 확인해 주세요.');
      return;
    }

    renderProfile(data, user.email, await resolveAvatarUrl(data));
  }

  function setProfileFormStatus(message, isError = false) {
    profileFormStatus.textContent = message;
    profileFormStatus.classList.toggle('is-error', isError);
  }

  function clearSelectedAvatar() {
    if (selectedAvatarPreviewUrl) {
      URL.revokeObjectURL(selectedAvatarPreviewUrl);
    }
    selectedAvatarBlob = null;
    selectedAvatarPreviewUrl = '';
    useDefaultAvatar = Boolean(currentProfile?.use_default_avatar);
    if (profilePhotoInput) profilePhotoInput.value = '';
  }

  function fillProfileForm() {
    if (!currentProfile) return;
    profileForm.elements.displayName.value = currentProfile.display_name || '';
    profileForm.elements.age.value = currentProfile.age ?? '';
    profileForm.elements.shirtNumber.value = currentProfile.shirt_number ?? '';
    profileForm.elements.preferredPosition.value = currentProfile.preferred_position || '';
    profileForm.elements.preferredFoot.value = currentProfile.preferred_foot || '';
    profileForm.elements.bio.value = currentProfile.bio || '';
    profileBioCount.textContent = profileForm.elements.bio.value.length;
    useDefaultAvatar = Boolean(currentProfile.use_default_avatar);
    setAvatar(
      document.querySelector('[data-edit-avatar]'),
      useDefaultAvatar ? '' : currentAvatarUrl,
      currentProfile.display_name,
    );
  }

  function openProfileForm() {
    if (!currentProfile) return;
    clearSelectedAvatar();
    fillProfileForm();
    setProfileFormStatus('');
    profileCancelButton.hidden = !Number.isInteger(currentProfile.age);
    profileForm.hidden = false;
    profileForm.elements.displayName.focus();
  }

  function closeProfileForm() {
    clearSelectedAvatar();
    profileForm.hidden = true;
    setProfileAvatars(currentAvatarUrl, currentAvatarUrl, currentProfile?.display_name);
    profileEditButton.focus();
  }

  function canvasToBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('이미지를 변환하지 못했습니다.'))),
        'image/webp',
        quality,
      );
    });
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('올바른 이미지 파일을 선택해 주세요.'));
      };
      image.src = objectUrl;
    });
  }

  async function compressProfileImage(file) {
    if (!allowedImageTypes.has(file.type)) {
      throw new Error('JPG, PNG 또는 WebP 이미지만 선택할 수 있습니다.');
    }
    if (file.size > MAX_SOURCE_IMAGE_BYTES) {
      throw new Error('원본 사진은 10MB 이하만 선택할 수 있습니다.');
    }

    const image = await loadImage(file);
    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    if (!sourceSize) throw new Error('이미지 크기를 확인할 수 없습니다.');
    const sourceX = (image.naturalWidth - sourceSize) / 2;
    const sourceY = (image.naturalHeight - sourceSize) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(PROFILE_IMAGE_SIZE, sourceSize);
    canvas.height = canvas.width;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('이 브라우저에서는 사진을 처리할 수 없습니다.');
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    let blob = await canvasToBlob(canvas, 0.82);
    if (blob.size > MAX_PROFILE_IMAGE_BYTES) blob = await canvasToBlob(canvas, 0.64);
    if (blob.size > MAX_PROFILE_IMAGE_BYTES) {
      throw new Error('압축된 사진이 1MB를 초과합니다. 다른 사진을 선택해 주세요.');
    }
    return blob;
  }

  async function handleProfilePhoto(event) {
    const [file] = event.target.files;
    if (!file) return;
    setProfileFormStatus('사진을 최적화하고 있습니다.');

    try {
      const blob = await compressProfileImage(file);
      clearSelectedAvatar();
      selectedAvatarBlob = blob;
      selectedAvatarPreviewUrl = URL.createObjectURL(blob);
      useDefaultAvatar = false;
      setAvatar(
        document.querySelector('[data-edit-avatar]'),
        selectedAvatarPreviewUrl,
        profileForm.elements.displayName.value,
      );
      setProfileFormStatus(`사진 준비 완료 · ${Math.ceil(blob.size / 1024)}KB`);
    } catch (error) {
      profilePhotoInput.value = '';
      setProfileFormStatus(error.message, true);
    }
  }

  function useDefaultProfileAvatar() {
    clearSelectedAvatar();
    useDefaultAvatar = true;
    setAvatar(
      document.querySelector('[data-edit-avatar]'),
      '',
      profileForm.elements.displayName.value,
    );
    setProfileFormStatus('저장하면 이니셜 기본 이미지가 사용됩니다.');
  }

  function normalizedOptional(value) {
    const normalized = value.trim();
    return normalized || null;
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (!session?.user || !currentProfile) return;
    if (!profileForm.reportValidity()) return;

    const displayName = profileForm.elements.displayName.value.trim();
    const age = Number.parseInt(profileForm.elements.age.value, 10);
    const shirtNumberText = profileForm.elements.shirtNumber.value.trim();
    const avatarPath = `${session.user.id}/${PROFILE_IMAGE_PATH}`;
    profileSaveButton.disabled = true;
    profileCancelButton.disabled = true;
    setProfileFormStatus('프로필을 저장하고 있습니다.');

    try {
      if (selectedAvatarBlob) {
        const { error: uploadError } = await supabaseClient.storage
          .from(PROFILE_BUCKET)
          .upload(avatarPath, selectedAvatarBlob, {
            contentType: 'image/webp',
            cacheControl: '3600',
            upsert: true,
          });
        if (uploadError) throw uploadError;
      }

      const payload = {
        display_name: displayName,
        age,
        preferred_position: normalizedOptional(profileForm.elements.preferredPosition.value),
        preferred_foot: normalizedOptional(profileForm.elements.preferredFoot.value),
        shirt_number: shirtNumberText ? Number.parseInt(shirtNumberText, 10) : null,
        bio: normalizedOptional(profileForm.elements.bio.value),
        avatar_path: selectedAvatarBlob ? avatarPath : useDefaultAvatar ? null : currentProfile.avatar_path,
        use_default_avatar: useDefaultAvatar,
      };
      const { data, error: updateError } = await supabaseClient
        .from('profiles')
        .update(payload)
        .eq('id', session.user.id)
        .select(
          'display_name, age, avatar_url, avatar_path, use_default_avatar, preferred_position, preferred_foot, shirt_number, bio',
        )
        .single();
      if (updateError) throw updateError;

      if (useDefaultAvatar && currentProfile.avatar_path) {
        const { error: removeError } = await supabaseClient.storage
          .from(PROFILE_BUCKET)
          .remove([currentProfile.avatar_path]);
        if (removeError) showToast('프로필은 저장됐지만 이전 사진 정리는 나중에 다시 시도합니다.');
      }

      clearSelectedAvatar();
      renderProfile(data, session.user.email, await resolveAvatarUrl(data));
      profileForm.hidden = true;
      showToast('프로필을 저장했습니다.');
      profileEditButton.focus();
    } catch (error) {
      setProfileFormStatus(`저장하지 못했습니다: ${error.message}`, true);
    } finally {
      profileSaveButton.disabled = false;
      profileCancelButton.disabled = false;
    }
  }

  async function handleAuthSession(nextSession) {
    session = nextSession;
    authReady = true;
    updateAuthControls();

    if (session?.user) {
      if (window.sessionStorage.getItem('kfc-oauth-pending') === '1') {
        window.sessionStorage.removeItem('kfc-oauth-pending');
        window.history.replaceState(null, '', '#profile');
      }
      setConnectionState('ready', `${session.user.email || '회원'} 계정으로 로그인했습니다.`);
      await loadProfile(session.user);
    } else {
      window.sessionStorage.removeItem('kfc-oauth-pending');
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
    window.sessionStorage.setItem('kfc-oauth-pending', '1');
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });

    if (error) {
      window.sessionStorage.removeItem('kfc-oauth-pending');
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
    element.textContent = config?.appVersion || '0.3.0';
  });

  googleLoginButton?.addEventListener('click', signInWithGoogle);
  authActionButton?.addEventListener('click', handleAuthAction);
  profileEditButton?.addEventListener('click', openProfileForm);
  profileCancelButton?.addEventListener('click', closeProfileForm);
  profilePhotoInput?.addEventListener('change', handleProfilePhoto);
  profilePhotoRemoveButton?.addEventListener('click', useDefaultProfileAvatar);
  profileForm?.addEventListener('submit', saveProfile);
  profileBioInput?.addEventListener('input', () => {
    profileBioCount.textContent = profileBioInput.value.length;
  });
  profileForm?.elements.displayName?.addEventListener('input', () => {
    if (!selectedAvatarPreviewUrl && useDefaultAvatar) {
      setAvatar(document.querySelector('[data-edit-avatar]'), '', profileForm.elements.displayName.value);
    }
  });
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
