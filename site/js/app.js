(function () {
  'use strict';

  const PROFILE_BUCKET = 'profile-images';
  const PROFILE_IMAGE_PATH = 'avatar.webp';
  const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;
  const MAX_PROFILE_IMAGE_BYTES = 1024 * 1024;
  const PROFILE_IMAGE_SIZE = 512;
  const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const defaultRoute = 'home';
  const publicRoutes = new Set(['home', 'login', 'privacy']);
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
  const accountDeletionStatus = document.querySelector('[data-account-deletion-status]');
  const requestAccountDeletionButton = document.querySelector('[data-request-account-deletion]');
  const clubLoading = document.querySelector('[data-club-loading]');
  const clubOnboarding = document.querySelector('[data-club-onboarding]');
  const clubDashboard = document.querySelector('[data-club-dashboard]');
  const clubTabButtons = Array.from(document.querySelectorAll('[data-club-tab]'));
  const createClubForm = document.querySelector('[data-create-club-form]');
  const joinClubForm = document.querySelector('[data-join-club-form]');
  const generatedInviteCodeInput = document.querySelector('[data-generated-invite-code]');
  const createClubStatus = document.querySelector('[data-create-club-status]');
  const joinClubStatus = document.querySelector('[data-join-club-status]');
  const createClubSubmit = document.querySelector('[data-create-club-submit]');
  const joinClubSubmit = document.querySelector('[data-join-club-submit]');
  const rotateInviteButton = document.querySelector('[data-rotate-invite-code]');
  const scheduleLoading = document.querySelector('[data-schedule-loading]');
  const scheduleNoClub = document.querySelector('[data-schedule-no-club]');
  const scheduleWorkspace = document.querySelector('[data-schedule-workspace]');
  const scheduleError = document.querySelector('[data-schedule-error]');
  const scheduleList = document.querySelector('[data-schedule-list]');
  const scheduleEmpty = document.querySelector('[data-schedule-empty]');
  const calendarGrid = document.querySelector('[data-calendar-grid]');
  const calendarMonthTitle = document.querySelector('[data-calendar-month-title]');
  const selectedDayTitle = document.querySelector('[data-selected-day-title]');
  const createEventForDateButton = document.querySelector('[data-create-event-for-date]');
  const eventListView = document.querySelector('[data-event-list-view]');
  const eventDetail = document.querySelector('[data-event-detail]');
  const eventForm = document.querySelector('[data-event-form]');
  const createEventButton = document.querySelector('[data-create-event]');
  const eventSaveButton = document.querySelector('[data-event-save]');
  const eventFormStatus = document.querySelector('[data-event-form-status]');
  const eventParticipation = document.querySelector('[data-event-participation]');
  const participationActions = document.querySelector('[data-participation-actions]');
  const participationStatus = document.querySelector('[data-participation-status]');
  const applyEventButton = document.querySelector('[data-apply-event]');
  const absentEventButton = document.querySelector('[data-absent-event]');
  const cancelParticipationButton = document.querySelector('[data-cancel-participation]');
  const attendanceLoading = document.querySelector('[data-attendance-loading]');
  const attendanceNoClub = document.querySelector('[data-attendance-no-club]');
  const attendanceWorkspace = document.querySelector('[data-attendance-workspace]');
  const attendanceError = document.querySelector('[data-attendance-error]');
  const attendanceMonth = document.querySelector('[data-attendance-month]');
  const attendanceEventSelect = document.querySelector('[data-attendance-event]');
  const attendanceStatus = document.querySelector('[data-attendance-status]');
  const adminAttendanceMonth = document.querySelector('[data-admin-attendance-month]');
  const adminAttendanceLoading = document.querySelector('[data-admin-attendance-loading]');
  const adminAttendanceUnauthorized = document.querySelector('[data-admin-attendance-unauthorized]');
  const adminAttendanceWorkspace = document.querySelector('[data-admin-attendance-workspace]');
  const adminAttendanceError = document.querySelector('[data-admin-attendance-error]');
  const adminAttendanceStatus = document.querySelector('[data-admin-attendance-status]');
  const adminAttendanceRows = document.querySelector('[data-admin-attendance-rows]');
  const exportAttendanceCsvButton = document.querySelector('[data-export-attendance-csv]');
  const announcementLoading = document.querySelector('[data-announcement-loading]');
  const announcementNoClub = document.querySelector('[data-announcement-no-club]');
  const announcementWorkspace = document.querySelector('[data-announcement-workspace]');
  const announcementError = document.querySelector('[data-announcement-error]');
  const announcementList = document.querySelector('[data-announcement-list]');
  const announcementEmpty = document.querySelector('[data-announcement-empty]');
  const announcementForm = document.querySelector('[data-announcement-form]');
  const announcementFormStatus = document.querySelector('[data-announcement-form-status]');
  const announcementSaveButton = document.querySelector('[data-announcement-save]');
  const createAnnouncementButton = document.querySelector('[data-create-announcement]');
  const config = window.KFC_CONFIG;
  let authReady = false;
  let session = null;
  let currentProfile = null;
  let currentAvatarUrl = '';
  let selectedAvatarBlob = null;
  let selectedAvatarPreviewUrl = '';
  let useDefaultAvatar = false;
  let activeClub = null;
  let activeClubMembers = [];
  let scheduledEvents = [];
  let scheduleMonth = '';
  let selectedScheduleDate = '';
  let eventResponses = [];
  let attendanceEvents = [];
  let adminAttendanceData = [];
  let adminAttendanceDataMonth = '';
  let announcements = [];
  let selectedEventId = '';
  let memberDirectoryLoadId = 0;
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
    if (authReady && session && route === 'attendance-admin' && !canManageSchedule()) {
      return activeClub ? 'attendance' : 'club';
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
    const deletionRequested = profile.account_status === 'deletion_requested';
    currentProfile = profile;
    currentAvatarUrl = avatarUrl;
    document.querySelector('[data-profile-status]').textContent = deletionRequested
      ? '계정 삭제 처리 중'
      : completed
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
    profileEditButton.disabled = deletionRequested;
    requestAccountDeletionButton.hidden = deletionRequested;
    requestAccountDeletionButton.disabled = false;
    accountDeletionStatus.classList.remove('is-error');
    accountDeletionStatus.textContent = deletionRequested
      ? `${formatKoreanDateTime(profile.deletion_requested_at)}에 삭제를 요청했습니다. 클럽 접근은 중단되었으며 운영자가 최종 삭제를 처리합니다.`
      : '계정 삭제를 요청하면 클럽 접근과 참가 활동이 즉시 중단됩니다.';

    if (!completed && !deletionRequested) {
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
    requestAccountDeletionButton.hidden = false;
    requestAccountDeletionButton.disabled = true;
    accountDeletionStatus.textContent = '로그인 후 계정과 개인정보 설정을 확인할 수 있습니다.';
    accountDeletionStatus.classList.remove('is-error');
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
        'display_name, age, avatar_url, avatar_path, use_default_avatar, preferred_position, preferred_foot, shirt_number, bio, account_status, deletion_requested_at',
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

  async function requestAccountDeletion() {
    if (!session?.user || currentProfile?.account_status === 'deletion_requested') return;
    const confirmed = window.confirm(
      '계정 삭제를 요청하면 클럽 접근과 참가 활동이 즉시 중단되고 자동으로 로그아웃됩니다. 계속할까요?',
    );
    if (!confirmed) return;

    requestAccountDeletionButton.disabled = true;
    accountDeletionStatus.textContent = '계정 삭제 요청을 안전하게 처리하고 있습니다.';
    accountDeletionStatus.classList.remove('is-error');
    const { error } = await supabaseClient.rpc('request_account_deletion');
    if (error) {
      requestAccountDeletionButton.disabled = false;
      accountDeletionStatus.textContent = error.message;
      accountDeletionStatus.classList.add('is-error');
      return;
    }

    const { error: signOutError } = await supabaseClient.auth.signOut();
    window.location.hash = 'home';
    showToast(
      signOutError
        ? '삭제 요청은 완료됐지만 로그아웃하지 못했습니다. 직접 로그아웃해 주세요.'
        : '계정 삭제 요청을 접수하고 클럽 접근을 중단했습니다.',
    );
  }

  function roleLabel(role) {
    return { owner: '총관리자', admin: '관리자', member: '회원' }[role] || '회원';
  }

  function generateInviteCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const values = new Uint8Array(10);
    window.crypto.getRandomValues(values);
    return Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
  }

  function refreshGeneratedInviteCode() {
    generatedInviteCodeInput.value = generateInviteCode();
    createClubStatus.textContent = '';
    createClubStatus.classList.remove('is-error');
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const fallback = document.createElement('textarea');
        fallback.value = text;
        fallback.className = 'visually-hidden';
        document.body.append(fallback);
        fallback.select();
        document.execCommand('copy');
        fallback.remove();
      }
      showToast('초대 코드를 복사했습니다.');
    } catch {
      showToast('복사하지 못했습니다. 코드를 직접 선택해 주세요.');
    }
  }

  function setClubTab(tabName, moveFocus = false) {
    const isCreate = tabName === 'create';
    clubTabButtons.forEach((button) => {
      const selected = button.dataset.clubTab === tabName;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    createClubForm.hidden = !isCreate;
    joinClubForm.hidden = isCreate;
    const targetForm = isCreate ? createClubForm : joinClubForm;
    if (moveFocus) targetForm.querySelector('input:not([readonly])')?.focus();
  }

  function resetClub() {
    activeClub = null;
    activeClubMembers = [];
    memberDirectoryLoadId += 1;
    resetAttendance();
    resetAdminAttendance();
    resetSchedule();
    resetAnnouncements();
    clubLoading.hidden = false;
    clubLoading.lastChild.textContent = ' 클럽 정보를 확인하고 있습니다.';
    clubOnboarding.hidden = true;
    clubDashboard.hidden = true;
    document.querySelector('[data-member-directory]').replaceChildren();
    document.querySelector('[data-new-invite-card]').hidden = true;
    document.querySelector('[data-owner-audit]').hidden = true;
    document.querySelector('[data-audit-list]').replaceChildren();
  }

  function showClubOnboarding() {
    activeClub = null;
    showScheduleNoClub();
    showAttendanceNoClub();
    showAnnouncementsNoClub();
    if (currentProfile?.account_status === 'deletion_requested') {
      clubLoading.hidden = false;
      clubLoading.lastChild.textContent = ' 계정 삭제 요청으로 클럽 접근이 중단되었습니다.';
      clubDashboard.hidden = true;
      clubOnboarding.hidden = true;
      return;
    }
    clubLoading.hidden = true;
    clubDashboard.hidden = true;
    clubOnboarding.hidden = false;
    setClubTab('create');
    if (!generatedInviteCodeInput.value) refreshGeneratedInviteCode();
  }

  function createMemberCard(member, avatarUrl) {
    const card = document.createElement('article');
    card.className = 'member-card';
    const avatar = document.createElement('div');
    avatar.className = 'avatar-placeholder member-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    setAvatar(avatar, avatarUrl, member.display_name);

    const copy = document.createElement('div');
    const name = document.createElement('h3');
    name.textContent = member.display_name;
    const details = document.createElement('p');
    const profileDetails = [
      Number.isInteger(member.age) ? `${member.age}세` : null,
      member.preferred_position,
    ].filter(Boolean);
    details.textContent = profileDetails.join(' · ') || '프로필 정보 없음';
    const role = document.createElement('span');
    role.className = 'member-role';
    role.textContent = roleLabel(member.role);
    copy.append(name, details, role);
    card.append(avatar, copy);

    if (activeClub?.role === 'owner' && member.role !== 'owner') {
      const actions = document.createElement('div');
      actions.className = 'member-actions';
      const roleButton = document.createElement('button');
      roleButton.type = 'button';
      roleButton.dataset.changeMemberRole = member.user_id;
      roleButton.textContent = member.role === 'admin' ? '관리자 해제' : '관리자로 지정';
      roleButton.addEventListener('click', () => changeMemberRole(member, actions));
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.dataset.removeMember = member.user_id;
      removeButton.textContent = '회원 탈퇴 처리';
      removeButton.addEventListener('click', () => removeMember(member, actions));
      actions.append(roleButton, removeButton);
      card.append(actions);
    }
    return card;
  }

  function setMemberActionsDisabled(actions, disabled) {
    actions.querySelectorAll('button').forEach((button) => {
      button.disabled = disabled;
    });
  }

  async function changeMemberRole(member, actions) {
    if (!activeClub || activeClub.role !== 'owner') return;
    const nextRole = member.role === 'admin' ? 'member' : 'admin';
    const actionLabel = nextRole === 'admin' ? '관리자로 지정' : '관리자에서 해제';
    if (!window.confirm(`${member.display_name}님을 ${actionLabel}할까요?`)) return;

    setMemberActionsDisabled(actions, true);
    const { error } = await supabaseClient.rpc('change_member_role', {
      p_club_id: activeClub.club_id,
      p_target_user_id: member.user_id,
      p_new_role: nextRole,
    });
    if (error) {
      setMemberActionsDisabled(actions, false);
      showToast(`권한을 변경하지 못했습니다: ${error.message}`);
      return;
    }
    await loadClub(session.user);
    showToast(`${member.display_name}님의 권한을 변경했습니다.`);
  }

  async function removeMember(member, actions) {
    if (!activeClub || activeClub.role !== 'owner') return;
    if (!window.confirm(`${member.display_name}님을 클럽에서 탈퇴 처리할까요?`)) return;

    setMemberActionsDisabled(actions, true);
    const { error } = await supabaseClient.rpc('remove_club_member', {
      p_club_id: activeClub.club_id,
      p_target_user_id: member.user_id,
    });
    if (error) {
      setMemberActionsDisabled(actions, false);
      showToast(`회원 탈퇴 처리에 실패했습니다: ${error.message}`);
      return;
    }
    await loadClub(session.user);
    showToast(`${member.display_name}님을 탈퇴 처리했습니다.`);
  }

  function auditActionLabel(action) {
    return {
      member_promoted: '관리자 지정',
      admin_revoked: '관리자 해제',
      member_removed: '회원 탈퇴 처리',
      invite_code_rotated: '초대 코드 재발급',
      member_joined: '회원 가입',
      event_created: '일정 작성',
      event_updated: '일정 수정',
      event_published: '일정 공개',
      event_cancelled: '일정 취소',
      participant_status_changed: '참가자 상태 변경',
      attendance_updated: '출석 상태 변경',
      announcement_created: '공지 작성',
      announcement_updated: '공지 수정',
      announcement_archived: '공지 보관',
      account_deletion_requested: '계정 삭제 요청',
    }[action] || '관리 작업';
  }

  function auditDescription(entry) {
    if (entry.action === 'member_promoted') {
      return `${entry.actor_display_name}님이 ${entry.target_display_name}님을 관리자로 지정했습니다.`;
    }
    if (entry.action === 'admin_revoked') {
      return `${entry.actor_display_name}님이 ${entry.target_display_name}님의 관리자 권한을 해제했습니다.`;
    }
    if (entry.action === 'member_removed') {
      return `${entry.actor_display_name}님이 ${entry.target_display_name}님을 탈퇴 처리했습니다.`;
    }
    if (entry.action === 'invite_code_rotated') {
      return `${entry.actor_display_name}님이 초대 코드를 새로 발급했습니다.`;
    }
    if (entry.action === 'member_joined') {
      return `${entry.target_display_name}님이 초대 코드로 가입했습니다.`;
    }
    if (entry.action === 'event_created') {
      return `${entry.actor_display_name}님이 ${entry.target_display_name} 일정을 작성했습니다.`;
    }
    if (entry.action === 'event_updated') {
      return `${entry.actor_display_name}님이 ${entry.target_display_name} 일정을 수정했습니다.`;
    }
    if (entry.action === 'event_published') {
      return `${entry.actor_display_name}님이 ${entry.target_display_name} 일정을 공개했습니다.`;
    }
    if (entry.action === 'event_cancelled') {
      return `${entry.actor_display_name}님이 ${entry.target_display_name} 일정을 취소했습니다.`;
    }
    if (entry.action === 'participant_status_changed') {
      return `${entry.actor_display_name}님이 ${entry.target_display_name}님의 참가 상태를 변경했습니다.`;
    }
    if (entry.action === 'attendance_updated') {
      return `${entry.actor_display_name}님이 ${entry.target_display_name}님의 출석 상태를 변경했습니다.`;
    }
    if (entry.action === 'announcement_created') {
      return `${entry.actor_display_name}님이 ${entry.target_display_name} 공지를 작성했습니다.`;
    }
    if (entry.action === 'announcement_updated') {
      return `${entry.actor_display_name}님이 ${entry.target_display_name} 공지를 수정했습니다.`;
    }
    if (entry.action === 'announcement_archived') {
      return `${entry.actor_display_name}님이 ${entry.target_display_name} 공지를 보관했습니다.`;
    }
    if (entry.action === 'account_deletion_requested') {
      return '탈퇴 회원의 계정 삭제 요청이 접수되었습니다.';
    }
    return `${entry.actor_display_name}님이 관리 작업을 수행했습니다.`;
  }

  async function loadAuditLogs(clubId) {
    const list = document.querySelector('[data-audit-list]');
    list.replaceChildren();
    const { data, error } = await supabaseClient
      .from('audit_logs')
      .select(
        'id, actor_display_name, action, target_type, target_id, target_display_name, before_state, after_state, created_at',
      )
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;

    if (!data.length) {
      const empty = document.createElement('li');
      empty.className = 'audit-empty';
      empty.textContent = '아직 기록된 관리 작업이 없습니다.';
      list.append(empty);
      return;
    }

    const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    data.forEach((entry) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = auditActionLabel(entry.action);
      const time = document.createElement('time');
      time.dateTime = entry.created_at;
      time.textContent = dateFormatter.format(new Date(entry.created_at));
      const description = document.createElement('p');
      description.textContent = auditDescription(entry);
      item.append(title, time, description);
      list.append(item);
    });
  }

  async function loadClubMembers(clubId) {
    const loadId = ++memberDirectoryLoadId;
    const directory = document.querySelector('[data-member-directory]');
    directory.replaceChildren();
    const { data, error } = await supabaseClient
      .from('club_member_profiles')
      .select(
        'club_id, user_id, role, status, joined_at, display_name, age, avatar_url, avatar_path, use_default_avatar, preferred_position, preferred_foot, shirt_number, bio',
      )
      .eq('club_id', clubId)
      .eq('status', 'active')
      .order('joined_at', { ascending: true });
    if (error) throw error;
    if (loadId !== memberDirectoryLoadId || activeClub?.club_id !== clubId) return;

    const uniqueMembers = Array.from(
      new Map(data.map((member) => [member.user_id, member])).values(),
    );

    const membersWithAvatars = await Promise.all(
      uniqueMembers.map(async (member) => ({
        member,
        avatarUrl: await resolveAvatarUrl(member),
      })),
    );
    if (loadId !== memberDirectoryLoadId || activeClub?.club_id !== clubId) return;

    const fragment = document.createDocumentFragment();
    membersWithAvatars.forEach(({ member, avatarUrl }) => {
      fragment.append(createMemberCard(member, avatarUrl));
    });
    activeClubMembers = membersWithAvatars;
    directory.replaceChildren(fragment);
    document.querySelector('[data-club-member-count]').textContent = uniqueMembers.length;
  }

  async function showClubDashboard(membership, createdInviteCode = '') {
    activeClub = membership;
    updateManagerNavigation(membership);
    clubLoading.hidden = true;
    clubOnboarding.hidden = true;
    clubDashboard.hidden = false;
    document.querySelector('[data-club-name]').textContent = membership.clubs.name;
    document.querySelector('[data-club-role]').textContent = roleLabel(membership.role);
    document.querySelector('[data-owner-invite-tools]').hidden = membership.role !== 'owner';
    document.querySelector('[data-owner-audit]').hidden = membership.role !== 'owner';

    const inviteCard = document.querySelector('[data-new-invite-card]');
    inviteCard.hidden = !createdInviteCode;
    if (createdInviteCode) {
      document.querySelector('[data-new-invite-code]').textContent = createdInviteCode;
    }

    try {
      await loadClubMembers(membership.club_id);
    } catch (error) {
      document.querySelector('[data-member-directory]').textContent =
        '회원 명단을 불러오지 못했습니다.';
      showToast(`회원 명단 오류: ${error.message}`);
    }

    if (membership.role === 'owner') {
      try {
        await loadAuditLogs(membership.club_id);
      } catch (error) {
        document.querySelector('[data-audit-list]').textContent =
          '관리 기록을 불러오지 못했습니다.';
        showToast(`관리 기록 오류: ${error.message}`);
      }
    }

    await loadSchedule(membership);
    await loadAttendance(membership);
    await loadAdminAttendance(membership);
    await loadAnnouncements(membership);
  }

  function canManageSchedule(membership = activeClub) {
    return ['owner', 'admin'].includes(membership?.role);
  }

  function updateManagerNavigation(membership = activeClub) {
    const canManage = canManageSchedule(membership);
    document.querySelectorAll('[data-manager-nav]').forEach((link) => {
      link.hidden = !canManage;
    });
    document.querySelector('.mobile-nav')?.classList.toggle('has-manager-link', canManage);
  }

  function eventStatusLabel(status) {
    return {
      draft: '임시 저장',
      published: '공개',
      cancelled: '취소',
    }[status] || status;
  }

  function formatKoreanDateTime(value) {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(value));
  }

  function formatKoreanTime(value) {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(value));
  }

  function toKoreanDateTimeLocal(value) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(value))
      .reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  }

  function koreanDateTimeLocalToIso(value) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
    const date = new Date(`${value}:00+09:00`);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function koreanDateKey(value) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date(value))
      .reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function currentKoreanDate() {
    return koreanDateKey(new Date());
  }

  function shiftMonth(month, amount) {
    const [year, monthNumber] = month.split('-').map(Number);
    const shifted = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
    return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  function shiftDate(dateKey, amount) {
    const [year, monthNumber, day] = dateKey.split('-').map(Number);
    return new Date(Date.UTC(year, monthNumber - 1, day + amount)).toISOString().slice(0, 10);
  }

  function scheduleMonthRange(month) {
    return {
      startsAt: new Date(`${month}-01T00:00:00+09:00`).toISOString(),
      endsAt: new Date(`${shiftMonth(month, 1)}-01T00:00:00+09:00`).toISOString(),
    };
  }

  function formatCalendarMonth(month) {
    const [year, monthNumber] = month.split('-').map(Number);
    return `${year}년 ${monthNumber}월`;
  }

  function formatKoreanDate(value) {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    }).format(new Date(`${value}T00:00:00+09:00`));
  }

  function resetSchedule() {
    scheduledEvents = [];
    eventResponses = [];
    selectedEventId = '';
    scheduleMonth = currentKoreanDate().slice(0, 7);
    selectedScheduleDate = currentKoreanDate();
    createEventButton.hidden = true;
    createEventForDateButton.hidden = true;
    scheduleLoading.hidden = false;
    scheduleNoClub.hidden = true;
    scheduleWorkspace.hidden = true;
    scheduleError.hidden = true;
    scheduleList.replaceChildren();
    calendarGrid.replaceChildren();
    eventListView.hidden = false;
    eventDetail.hidden = true;
    eventForm.hidden = true;
    eventParticipation.hidden = true;
  }

  function showScheduleNoClub() {
    scheduledEvents = [];
    selectedEventId = '';
    createEventButton.hidden = true;
    createEventForDateButton.hidden = true;
    scheduleLoading.hidden = true;
    scheduleWorkspace.hidden = true;
    scheduleError.hidden = true;
    scheduleNoClub.hidden = false;
  }

  function showScheduleError(message) {
    scheduleLoading.hidden = true;
    scheduleNoClub.hidden = true;
    scheduleWorkspace.hidden = true;
    scheduleError.hidden = false;
    document.querySelector('[data-schedule-error-message]').textContent = message;
  }

  function createEventCard(scheduleEvent) {
    const card = document.createElement('article');
    card.className = 'event-card';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'event-card-button';
    button.dataset.openEvent = scheduleEvent.id;
    button.setAttribute('aria-label', `${scheduleEvent.title} 일정 상세 보기`);

    const topline = document.createElement('div');
    topline.className = 'event-card-topline';
    const date = document.createElement('span');
    date.className = 'event-card-date';
    date.textContent = formatKoreanDateTime(scheduleEvent.starts_at);
    const status = document.createElement('span');
    status.className = 'event-status';
    status.dataset.status = scheduleEvent.status;
    status.textContent = eventStatusLabel(scheduleEvent.status);
    topline.append(date, status);

    const title = document.createElement('h3');
    title.textContent = scheduleEvent.title;
    const venue = document.createElement('p');
    venue.className = 'event-card-venue';
    venue.textContent = scheduleEvent.venue;
    const meta = document.createElement('div');
    meta.className = 'event-card-meta';
    const capacity = document.createElement('span');
    capacity.textContent = `참가 ${scheduleEvent.confirmed_count || 0}/${scheduleEvent.capacity}명`;
    const deadline = document.createElement('span');
    deadline.textContent = `신청 ${formatKoreanDateTime(scheduleEvent.registration_deadline)} 마감`;
    meta.append(capacity, deadline);

    button.append(topline, title, venue, meta);
    button.addEventListener('click', () => showEventDetail(scheduleEvent.id));
    card.append(button);
    return card;
  }

  function eventsForDate(dateKey) {
    return scheduledEvents.filter((scheduleEvent) => koreanDateKey(scheduleEvent.starts_at) === dateKey);
  }

  function renderScheduleCalendar() {
    calendarGrid.replaceChildren();
    calendarMonthTitle.textContent = formatCalendarMonth(scheduleMonth);
    const [year, monthNumber] = scheduleMonth.split('-').map(Number);
    const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
    const today = currentKoreanDate();

    for (let index = 0; index < cellCount; index += 1) {
      const dayNumber = index - firstWeekday + 1;
      if (dayNumber < 1 || dayNumber > daysInMonth) {
        const blank = document.createElement('span');
        blank.className = 'calendar-day-blank';
        blank.setAttribute('role', 'gridcell');
        blank.setAttribute('aria-hidden', 'true');
        calendarGrid.append(blank);
        continue;
      }

      const dateKey = `${scheduleMonth}-${String(dayNumber).padStart(2, '0')}`;
      const dayEvents = eventsForDate(dateKey);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'calendar-day';
      button.dataset.calendarDate = dateKey;
      button.setAttribute('role', 'gridcell');
      button.setAttribute('aria-selected', String(dateKey === selectedScheduleDate));
      button.setAttribute(
        'aria-label',
        `${formatKoreanDate(dateKey)}, 일정 ${dayEvents.length}개${dateKey === selectedScheduleDate ? ', 선택됨' : ''}`,
      );
      if (dateKey === today) button.setAttribute('aria-current', 'date');

      const number = document.createElement('span');
      number.className = 'calendar-day-number';
      number.textContent = dayNumber;
      button.append(number);

      const eventLabels = document.createElement('span');
      eventLabels.className = 'calendar-event-labels';
      dayEvents.slice(0, 2).forEach((scheduleEvent) => {
        const label = document.createElement('span');
        label.className = 'calendar-event-label';
        label.dataset.status = scheduleEvent.status;
        label.textContent = scheduleEvent.title;
        eventLabels.append(label);
      });
      if (dayEvents.length > 2) {
        const more = document.createElement('span');
        more.className = 'calendar-event-more';
        more.textContent = `+${dayEvents.length - 2}`;
        eventLabels.append(more);
      }
      button.append(eventLabels);
      button.addEventListener('click', () => selectScheduleDate(dateKey));
      button.addEventListener('keydown', (event) => handleCalendarKeydown(event, dateKey));
      calendarGrid.append(button);
    }
  }

  function renderScheduleList() {
    scheduleList.replaceChildren();
    const selectedEvents = eventsForDate(selectedScheduleDate);
    selectedEvents.forEach((scheduleEvent) => {
      scheduleList.append(createEventCard(scheduleEvent));
    });
    selectedDayTitle.textContent = formatKoreanDate(selectedScheduleDate);
    scheduleEmpty.hidden = selectedEvents.length > 0;
    const selectedDateIsPast = selectedScheduleDate < currentKoreanDate();
    createEventForDateButton.hidden = !canManageSchedule();
    createEventForDateButton.disabled = selectedDateIsPast;
    createEventForDateButton.title = selectedDateIsPast ? '지난 날짜에는 일정을 추가할 수 없습니다.' : '';
    document.querySelector('[data-schedule-empty-message]').textContent = canManageSchedule()
      ? selectedDateIsPast
        ? '지난 날짜에는 새 일정을 추가할 수 없습니다.'
        : '이 날짜에 새 일정을 작성할 수 있습니다.'
      : '관리자가 일정을 공개하면 이곳에 표시됩니다.';
  }

  function selectScheduleDate(dateKey, moveFocus = false) {
    selectedScheduleDate = dateKey;
    renderScheduleCalendar();
    renderScheduleList();
    if (moveFocus) calendarGrid.querySelector(`[data-calendar-date="${dateKey}"]`)?.focus();
  }

  async function handleCalendarKeydown(event, dateKey) {
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!(event.key in offsets)) return;
    event.preventDefault();
    const nextDate = shiftDate(dateKey, offsets[event.key]);
    const nextMonth = nextDate.slice(0, 7);
    if (nextMonth !== scheduleMonth) {
      scheduleMonth = nextMonth;
      selectedScheduleDate = nextDate;
      await loadSchedule(activeClub, { focusCalendarDate: true });
      return;
    }
    selectScheduleDate(nextDate, true);
  }

  function showEventList() {
    selectedEventId = '';
    eventResponses = [];
    eventForm.hidden = true;
    eventDetail.hidden = true;
    eventListView.hidden = false;
  }

  function responseStatusLabel(status, waitPosition = null) {
    return {
      confirmed: '참가 확정',
      waiting: waitPosition ? `대기 ${waitPosition}순위` : '대기',
      absent: '불참',
      cancelled: '참가 취소',
    }[status] || '미응답';
  }

  function createResponseMemberRow(memberEntry, response = null) {
    const member = memberEntry?.member || response;
    const item = document.createElement('li');
    item.className = 'response-member';
    const summary = document.createElement('div');
    summary.className = 'response-member-summary';
    const avatar = document.createElement('div');
    avatar.className = 'avatar-placeholder response-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    setAvatar(avatar, memberEntry?.avatarUrl || '', member.display_name);
    const copy = document.createElement('div');
    copy.className = 'response-member-copy';
    const name = document.createElement('strong');
    name.textContent = member.display_name;
    const detail = document.createElement('span');
    detail.textContent = response
      ? responseStatusLabel(response.status, response.wait_position)
      : '미응답';
    copy.append(name, detail);
    summary.append(avatar, copy);
    item.append(summary);

    const selectedScheduleEvent = scheduledEvents.find((item) => item.id === selectedEventId);
    if (
      canManageSchedule()
      && selectedScheduleEvent?.status === 'published'
      && Date.now() < new Date(selectedScheduleEvent.starts_at).getTime()
    ) {
      const controls = document.createElement('div');
      controls.className = 'response-manager-control';
      const select = document.createElement('select');
      select.setAttribute('aria-label', `${member.display_name}님의 참가 상태`);
      [
        ['confirmed', '참가 확정'],
        ['waiting', '대기'],
        ['absent', '불참'],
        ['cancelled', '참가 취소'],
      ].forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        option.selected = value === (response?.status || 'absent');
        select.append(option);
      });
      const save = document.createElement('button');
      save.type = 'button';
      save.textContent = '변경';
      save.addEventListener('click', () =>
        changeParticipantStatus(member.user_id, select.value, save),
      );
      controls.append(select, save);
      item.append(controls);
    }
    return item;
  }

  function renderResponseRoster(selector, entries) {
    const list = document.querySelector(selector);
    list.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement('li');
      empty.className = 'response-roster-empty';
      empty.textContent = '해당 회원이 없습니다.';
      list.append(empty);
      return;
    }
    entries.forEach(({ memberEntry, response }) => {
      list.append(createResponseMemberRow(memberEntry, response));
    });
  }

  async function loadEventResponses(scheduleEvent) {
    eventResponses = [];
    eventParticipation.hidden = scheduleEvent.status === 'draft';
    if (scheduleEvent.status === 'draft') return;

    participationStatus.textContent = '참가 현황을 불러오고 있습니다.';
    participationStatus.classList.remove('is-error');
    const { data, error } = await supabaseClient
      .from('event_response_profiles')
      .select(
        'event_id, club_id, user_id, status, queue_order, wait_position, responded_at, display_name, age, avatar_url, avatar_path, use_default_avatar, preferred_position, preferred_foot, shirt_number',
      )
      .eq('event_id', scheduleEvent.id)
      .order('queue_order', { ascending: true });

    if (selectedEventId !== scheduleEvent.id) return;
    if (error) {
      participationStatus.textContent = `참가 현황 오류: ${error.message}`;
      participationStatus.classList.add('is-error');
      return;
    }

    eventResponses = data;
    participationStatus.textContent = '';
    const membersById = new Map(
      activeClubMembers.map((memberEntry) => [memberEntry.member.user_id, memberEntry]),
    );
    const entryFor = (response) => ({
      memberEntry: membersById.get(response.user_id) || { member: response, avatarUrl: '' },
      response,
    });
    const confirmed = data.filter((response) => response.status === 'confirmed').map(entryFor);
    const waiting = data.filter((response) => response.status === 'waiting').map(entryFor);
    const absent = data
      .filter((response) => ['absent', 'cancelled'].includes(response.status))
      .map(entryFor);
    const responseUserIds = new Set(data.map((response) => response.user_id));
    const unanswered = activeClubMembers
      .filter((memberEntry) => !responseUserIds.has(memberEntry.member.user_id))
      .map((memberEntry) => ({ memberEntry, response: null }));

    renderResponseRoster('[data-confirmed-roster]', confirmed);
    renderResponseRoster('[data-waiting-roster]', waiting);
    renderResponseRoster('[data-absent-roster]', absent);
    renderResponseRoster('[data-unanswered-roster]', unanswered);
    document.querySelector('[data-confirmed-count]').textContent = confirmed.length;
    document.querySelector('[data-waiting-count]').textContent = waiting.length;
    document.querySelector('[data-absent-count]').textContent = absent.length;
    document.querySelector('[data-unanswered-count]').textContent = unanswered.length;

    const myResponse = data.find((response) => response.user_id === session.user.id);
    document.querySelector('[data-my-response]').textContent = myResponse
      ? `내 응답: ${responseStatusLabel(myResponse.status, myResponse.wait_position)}`
      : '아직 참가 여부를 응답하지 않았습니다.';

    const now = Date.now();
    const registrationOpen = now < new Date(scheduleEvent.registration_deadline).getTime();
    const cancellationOpen = now < new Date(scheduleEvent.cancellation_deadline).getTime();
    const activeResponse = ['confirmed', 'waiting'].includes(myResponse?.status);
    applyEventButton.hidden = !registrationOpen || activeResponse;
    absentEventButton.hidden = myResponse?.status === 'absent'
      || (activeResponse ? !cancellationOpen : !registrationOpen);
    cancelParticipationButton.hidden = !activeResponse || !cancellationOpen;
    participationActions.hidden = scheduleEvent.status !== 'published'
      || [applyEventButton, absentEventButton, cancelParticipationButton].every(
        (button) => button.hidden,
      );
    document.querySelector('[data-participation-deadline]').textContent = scheduleEvent.status === 'cancelled'
      ? '일정이 취소되어 참가 응답을 변경할 수 없습니다.'
      : `신청 마감 ${formatKoreanDateTime(scheduleEvent.registration_deadline)} · 취소 마감 ${formatKoreanDateTime(scheduleEvent.cancellation_deadline)}`;
  }

  async function refreshSelectedEvent() {
    const eventId = selectedEventId;
    await loadSchedule(activeClub);
    await showEventDetail(eventId, false);
  }

  function setParticipationBusy(busy) {
    [applyEventButton, absentEventButton, cancelParticipationButton].forEach((button) => {
      button.disabled = busy;
    });
  }

  async function applyToSelectedEvent() {
    if (!selectedEventId) return;
    setParticipationBusy(true);
    const { data, error } = await supabaseClient.rpc('apply_to_event', {
      p_event_id: selectedEventId,
    });
    setParticipationBusy(false);
    if (error) {
      showToast(`참가 신청에 실패했습니다: ${error.message}`);
      return;
    }
    await refreshSelectedEvent();
    showToast(data.status === 'confirmed' ? '참가가 확정되었습니다.' : `대기 ${data.wait_position}순위로 등록되었습니다.`);
  }

  async function setSelectedEventAbsent() {
    if (!selectedEventId || !window.confirm('이 일정에 불참으로 응답할까요?')) return;
    setParticipationBusy(true);
    const { error } = await supabaseClient.rpc('set_event_absent', {
      p_event_id: selectedEventId,
    });
    setParticipationBusy(false);
    if (error) {
      showToast(`불참 응답에 실패했습니다: ${error.message}`);
      return;
    }
    await refreshSelectedEvent();
    showToast('불참으로 응답했습니다.');
  }

  async function cancelSelectedParticipation() {
    if (!selectedEventId || !window.confirm('참가 또는 대기 신청을 취소할까요?')) return;
    setParticipationBusy(true);
    const { error } = await supabaseClient.rpc('cancel_event_participation', {
      p_event_id: selectedEventId,
    });
    setParticipationBusy(false);
    if (error) {
      showToast(`참가 취소에 실패했습니다: ${error.message}`);
      return;
    }
    await refreshSelectedEvent();
    showToast('참가 신청을 취소했습니다.');
  }

  async function changeParticipantStatus(userId, newStatus, button) {
    if (!selectedEventId || !canManageSchedule()) return;
    button.disabled = true;
    const { error } = await supabaseClient.rpc('admin_change_participant_status', {
      p_event_id: selectedEventId,
      p_target_user_id: userId,
      p_new_status: newStatus,
    });
    button.disabled = false;
    if (error) {
      showToast(`참가자 상태 변경에 실패했습니다: ${error.message}`);
      return;
    }
    await refreshSelectedEvent();
    showToast('참가자 상태를 변경했습니다.');
  }

  async function showEventDetail(eventId, moveFocus = true) {
    const scheduleEvent = scheduledEvents.find((item) => item.id === eventId);
    if (!scheduleEvent) {
      showEventList();
      return;
    }

    selectedEventId = scheduleEvent.id;
    eventListView.hidden = true;
    eventForm.hidden = true;
    eventDetail.hidden = false;
    const status = document.querySelector('[data-event-detail-status]');
    status.dataset.status = scheduleEvent.status;
    status.textContent = eventStatusLabel(scheduleEvent.status);
    document.querySelector('[data-event-detail-title]').textContent = scheduleEvent.title;
    document.querySelector('[data-event-detail-date]').textContent =
      `${formatKoreanDateTime(scheduleEvent.starts_at)} – ${formatKoreanTime(scheduleEvent.ends_at)}`;
    document.querySelector('[data-event-detail-venue]').textContent = scheduleEvent.venue;
    document.querySelector('[data-event-detail-capacity]').textContent =
      `${scheduleEvent.confirmed_count || 0}/${scheduleEvent.capacity}명`;
    document.querySelector('[data-event-detail-registration]').textContent =
      formatKoreanDateTime(scheduleEvent.registration_deadline);
    document.querySelector('[data-event-detail-cancellation]').textContent =
      formatKoreanDateTime(scheduleEvent.cancellation_deadline);
    document.querySelector('[data-event-detail-description]').textContent =
      scheduleEvent.description || '등록된 안내가 없습니다.';

    const cancelNotice = document.querySelector('[data-event-cancel-notice]');
    cancelNotice.hidden = scheduleEvent.status !== 'cancelled';
    document.querySelector('[data-event-cancellation-reason]').textContent =
      scheduleEvent.cancellation_reason || '';

    const managerActions = document.querySelector('[data-event-manager-actions]');
    managerActions.hidden = !canManageSchedule() || scheduleEvent.status === 'cancelled';
    document.querySelector('[data-edit-event]').hidden = scheduleEvent.status === 'cancelled';
    document.querySelector('[data-publish-event]').hidden = scheduleEvent.status !== 'draft';
    document.querySelector('[data-cancel-event]').hidden = scheduleEvent.status !== 'published';
    if (moveFocus) document.querySelector('[data-event-detail-title]').focus();
    await loadEventResponses(scheduleEvent);
  }

  async function loadSchedule(membership, options = {}) {
    if (!membership) {
      showScheduleNoClub();
      return;
    }

    if (!scheduleMonth) scheduleMonth = currentKoreanDate().slice(0, 7);
    const monthRange = scheduleMonthRange(scheduleMonth);
    scheduleLoading.hidden = false;
    scheduleNoClub.hidden = true;
    scheduleWorkspace.hidden = true;
    scheduleError.hidden = true;
    createEventButton.hidden = !canManageSchedule(membership);
    const { data, error } = await supabaseClient
      .from('events')
      .select(
        'id, club_id, title, description, venue, starts_at, ends_at, capacity, confirmed_count, waiting_count, registration_deadline, cancellation_deadline, status, cancellation_reason, published_at, cancelled_at, created_at, updated_at',
      )
      .eq('club_id', membership.club_id)
      .gte('starts_at', monthRange.startsAt)
      .lt('starts_at', monthRange.endsAt)
      .order('starts_at', { ascending: true });

    if (error) {
      showScheduleError(`일정 조회 오류: ${error.message}`);
      return;
    }

    scheduledEvents = data;
    selectedEventId = '';
    if (!selectedScheduleDate || selectedScheduleDate.slice(0, 7) !== scheduleMonth) {
      const today = currentKoreanDate();
      selectedScheduleDate = today.slice(0, 7) === scheduleMonth
        ? today
        : scheduledEvents[0]
          ? koreanDateKey(scheduledEvents[0].starts_at)
          : `${scheduleMonth}-01`;
    }
    renderScheduleCalendar();
    renderScheduleList();
    scheduleLoading.hidden = true;
    scheduleWorkspace.hidden = false;
    showEventList();
    if (options.focusCalendarDate) {
      calendarGrid.querySelector(`[data-calendar-date="${selectedScheduleDate}"]`)?.focus();
    }
  }

  function openEventForm(scheduleEvent = null, preferredDate = '') {
    if (!canManageSchedule()) return;
    eventForm.reset();
    eventFormStatus.textContent = '';
    eventFormStatus.classList.remove('is-error');
    eventForm.dataset.eventId = scheduleEvent?.id || '';
    document.querySelector('[data-event-form-title]').textContent = scheduleEvent
      ? '일정 수정'
      : '새 일정 작성';
    eventSaveButton.textContent = scheduleEvent ? '변경 저장' : '임시 저장';

    if (scheduleEvent) {
      eventForm.elements.title.value = scheduleEvent.title;
      eventForm.elements.venue.value = scheduleEvent.venue;
      eventForm.elements.startsAt.value = toKoreanDateTimeLocal(scheduleEvent.starts_at);
      eventForm.elements.endsAt.value = toKoreanDateTimeLocal(scheduleEvent.ends_at);
      eventForm.elements.registrationDeadline.value =
        toKoreanDateTimeLocal(scheduleEvent.registration_deadline);
      eventForm.elements.cancellationDeadline.value =
        toKoreanDateTimeLocal(scheduleEvent.cancellation_deadline);
      eventForm.elements.capacity.value = scheduleEvent.capacity;
      eventForm.elements.description.value = scheduleEvent.description || '';
    } else {
      const preferredStart = /^\d{4}-\d{2}-\d{2}$/.test(preferredDate)
        ? new Date(`${preferredDate}T20:00:00+09:00`)
        : null;
      const startsAt = preferredStart && preferredStart.getTime() > Date.now() + 2 * 60 * 60 * 1000
        ? preferredStart
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      startsAt.setUTCMinutes(0, 0, 0);
      const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
      const registrationDeadline = new Date(
        Math.max(startsAt.getTime() - 24 * 60 * 60 * 1000, Date.now() + 30 * 60 * 1000),
      );
      const cancellationDeadline = new Date(
        Math.max(startsAt.getTime() - 6 * 60 * 60 * 1000, registrationDeadline.getTime() + 30 * 60 * 1000),
      );
      eventForm.elements.startsAt.value = toKoreanDateTimeLocal(startsAt);
      eventForm.elements.endsAt.value = toKoreanDateTimeLocal(endsAt);
      eventForm.elements.registrationDeadline.value = toKoreanDateTimeLocal(registrationDeadline);
      eventForm.elements.cancellationDeadline.value = toKoreanDateTimeLocal(cancellationDeadline);
      eventForm.elements.capacity.value = 18;
    }

    eventListView.hidden = true;
    eventDetail.hidden = true;
    eventForm.hidden = false;
    document.querySelector('[data-event-form-title]').focus();
  }

  function closeEventForm() {
    const eventId = eventForm.dataset.eventId;
    if (eventId) {
      showEventDetail(eventId);
    } else {
      showEventList();
    }
  }

  function setEventFormStatus(message, isError = false) {
    eventFormStatus.textContent = message;
    eventFormStatus.classList.toggle('is-error', isError);
  }

  function eventFormRpcParameters() {
    return {
      p_club_id: activeClub.club_id,
      p_title: eventForm.elements.title.value.trim(),
      p_description: eventForm.elements.description.value.trim() || null,
      p_venue: eventForm.elements.venue.value.trim(),
      p_starts_at: koreanDateTimeLocalToIso(eventForm.elements.startsAt.value),
      p_ends_at: koreanDateTimeLocalToIso(eventForm.elements.endsAt.value),
      p_capacity: Number(eventForm.elements.capacity.value),
      p_registration_deadline: koreanDateTimeLocalToIso(
        eventForm.elements.registrationDeadline.value,
      ),
      p_cancellation_deadline: koreanDateTimeLocalToIso(
        eventForm.elements.cancellationDeadline.value,
      ),
    };
  }

  async function saveEvent(event) {
    event.preventDefault();
    if (!canManageSchedule() || !eventForm.reportValidity()) return;
    const eventId = eventForm.dataset.eventId;
    const parameters = eventFormRpcParameters();
    const rpcName = eventId ? 'update_event' : 'create_event';
    if (eventId) parameters.p_event_id = eventId;

    eventSaveButton.disabled = true;
    setEventFormStatus(eventId ? '일정 변경을 저장하고 있습니다.' : '일정을 임시 저장하고 있습니다.');
    const { data, error } = await supabaseClient.rpc(rpcName, parameters);
    eventSaveButton.disabled = false;
    if (error) {
      setEventFormStatus(error.message, true);
      return;
    }

    const savedEventId = eventId || data;
    const savedDate = eventForm.elements.startsAt.value.slice(0, 10);
    scheduleMonth = savedDate.slice(0, 7);
    selectedScheduleDate = savedDate;
    await loadSchedule(activeClub);
    await showEventDetail(savedEventId);
    showToast(eventId ? '일정 변경을 저장했습니다.' : '일정을 임시 저장했습니다.');
  }

  async function publishSelectedEvent() {
    const scheduleEvent = scheduledEvents.find((item) => item.id === selectedEventId);
    if (!scheduleEvent || !canManageSchedule() || scheduleEvent.status !== 'draft') return;
    if (!window.confirm('이 일정을 모든 클럽 회원에게 공개할까요?')) return;

    const publishButton = document.querySelector('[data-publish-event]');
    publishButton.disabled = true;
    const { error } = await supabaseClient.rpc('publish_event', {
      p_event_id: scheduleEvent.id,
      p_club_id: activeClub.club_id,
    });
    publishButton.disabled = false;
    if (error) {
      showToast(`일정을 공개하지 못했습니다: ${error.message}`);
      return;
    }

    await loadSchedule(activeClub);
    showEventDetail(scheduleEvent.id);
    showToast('일정을 공개했습니다.');
  }

  async function cancelSelectedEvent() {
    const scheduleEvent = scheduledEvents.find((item) => item.id === selectedEventId);
    if (!scheduleEvent || !canManageSchedule() || scheduleEvent.status !== 'published') return;
    const reason = window.prompt('회원에게 표시할 일정 취소 사유를 입력해 주세요.');
    if (reason === null) return;

    const cancelButton = document.querySelector('[data-cancel-event]');
    cancelButton.disabled = true;
    const { error } = await supabaseClient.rpc('cancel_event', {
      p_event_id: scheduleEvent.id,
      p_club_id: activeClub.club_id,
      p_cancellation_reason: reason.trim(),
    });
    cancelButton.disabled = false;
    if (error) {
      showToast(`일정을 취소하지 못했습니다: ${error.message}`);
      return;
    }

    await loadSchedule(activeClub);
    showEventDetail(scheduleEvent.id);
    showToast('일정을 취소했습니다.');
  }

  function currentKoreanMonth() {
    return toKoreanDateTimeLocal(new Date()).slice(0, 7);
  }

  function attendanceLabel(status) {
    return {
      attended: '출석',
      late: '지각',
      absent: '결석',
      excused: '사유 인정',
      unmarked: '미체크',
    }[status] || '미체크';
  }

  function resetAttendance() {
    attendanceEvents = [];
    attendanceLoading.hidden = false;
    attendanceNoClub.hidden = true;
    attendanceWorkspace.hidden = true;
    attendanceError.hidden = true;
    attendanceEventSelect.replaceChildren();
    attendanceStatus.textContent = '';
    attendanceStatus.classList.remove('is-error');
    document.querySelector('[data-monthly-attendance-list]').replaceChildren();
    document.querySelector('[data-attendance-roster]').replaceChildren();
  }

  function showAttendanceNoClub() {
    attendanceEvents = [];
    attendanceLoading.hidden = true;
    attendanceWorkspace.hidden = true;
    attendanceError.hidden = true;
    attendanceNoClub.hidden = false;
  }

  function showAttendanceError(message) {
    attendanceLoading.hidden = true;
    attendanceNoClub.hidden = true;
    attendanceWorkspace.hidden = true;
    attendanceError.hidden = false;
    document.querySelector('[data-attendance-error-message]').textContent = message;
  }

  function renderMonthlyAttendance(stats) {
    const list = document.querySelector('[data-monthly-attendance-list]');
    list.replaceChildren();
    const statsByUser = new Map(stats.map((row) => [row.user_id, row]));
    activeClubMembers.forEach(({ member }) => {
      const stat = statsByUser.get(member.user_id) || {};
      const row = document.createElement('div');
      row.className = 'attendance-row';
      const name = document.createElement('strong');
      name.textContent = member.display_name;
      const attended = document.createElement('span');
      attended.textContent = `참석 ${(stat.attended_count || 0) + (stat.late_count || 0)}`;
      const late = document.createElement('span');
      late.textContent = `지각 ${stat.late_count || 0}`;
      const absent = document.createElement('span');
      absent.textContent = `결석 ${stat.absent_count || 0}`;
      const rate = document.createElement('span');
      rate.textContent = stat.attendance_rate == null ? '출석률 —' : `출석률 ${stat.attendance_rate}%`;
      row.append(name, attended, late, absent, rate);
      list.append(row);
    });

    const mine = statsByUser.get(session.user.id) || {};
    document.querySelector('[data-my-attended-count]').textContent =
      (mine.attended_count || 0) + (mine.late_count || 0);
    document.querySelector('[data-my-late-count]').textContent = mine.late_count || 0;
    document.querySelector('[data-my-attendance-rate]').textContent =
      mine.attendance_rate == null ? '—' : `${mine.attendance_rate}%`;
  }

  function createAttendanceRow(memberEntry, record) {
    const row = document.createElement('div');
    row.className = 'attendance-row';
    const name = document.createElement('strong');
    name.textContent = memberEntry.member.display_name;
    row.append(name);
    if (!canManageSchedule()) {
      const result = document.createElement('span');
      result.textContent = attendanceLabel(record?.status || 'unmarked');
      row.append(result);
      return row;
    }

    const control = document.createElement('div');
    control.className = 'attendance-control';
    const select = document.createElement('select');
    select.setAttribute('aria-label', `${memberEntry.member.display_name}님의 출석 상태`);
    ['unmarked', 'attended', 'late', 'absent', 'excused'].forEach((status) => {
      const option = document.createElement('option');
      option.value = status;
      option.textContent = attendanceLabel(status);
      option.selected = status === (record?.status || 'unmarked');
      select.append(option);
    });
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = '저장';
    save.addEventListener('click', () => saveAttendance(memberEntry.member.user_id, select.value, save));
    control.append(select, save);
    row.append(control);
    return row;
  }

  async function loadAttendanceRecords() {
    const eventId = attendanceEventSelect.value;
    const roster = document.querySelector('[data-attendance-roster]');
    roster.replaceChildren();
    if (!eventId) {
      attendanceStatus.textContent = '출석을 확인할 수 있는 시작된 일정이 없습니다.';
      return;
    }

    attendanceStatus.textContent = '일정별 출석 결과를 불러오고 있습니다.';
    const { data, error } = await supabaseClient
      .from('attendance_record_profiles')
      .select('event_id, club_id, user_id, status, checked_at, display_name')
      .eq('event_id', eventId);
    if (error) {
      attendanceStatus.textContent = `출석 결과 오류: ${error.message}`;
      attendanceStatus.classList.add('is-error');
      return;
    }
    attendanceStatus.textContent = '';
    attendanceStatus.classList.remove('is-error');
    const recordsByUser = new Map(data.map((record) => [record.user_id, record]));
    activeClubMembers.forEach((memberEntry) => {
      roster.append(createAttendanceRow(memberEntry, recordsByUser.get(memberEntry.member.user_id)));
    });
  }

  async function loadAttendance(membership) {
    if (!membership) {
      showAttendanceNoClub();
      return;
    }
    if (!attendanceMonth.value) attendanceMonth.value = currentKoreanMonth();
    attendanceLoading.hidden = false;
    attendanceNoClub.hidden = true;
    attendanceWorkspace.hidden = true;
    attendanceError.hidden = true;
    attendanceStatus.textContent = '';
    attendanceStatus.classList.remove('is-error');
    if (canManageSchedule(membership)) {
      const finalizeResult = await supabaseClient.rpc('finalize_club_attendance', {
        p_club_id: membership.club_id,
      });
      if (finalizeResult.error) {
        showAttendanceError(`자동 출석 확정 오류: ${finalizeResult.error.message}`);
        return;
      }
      if (finalizeResult.data > 0) {
        showToast(`종료된 일정의 참가 확정자 ${finalizeResult.data}명을 자동으로 참석 처리했습니다.`);
      }
    }
    const previousEventId = attendanceEventSelect.value;
    const monthStart = `${attendanceMonth.value}-01`;
    const [statsResult, eventsResult] = await Promise.all([
      supabaseClient.from('monthly_attendance_stats').select('*').eq('club_id', membership.club_id).eq('month_start', monthStart),
      supabaseClient.from('events').select('id, title, starts_at').eq('club_id', membership.club_id).eq('status', 'published').lte('starts_at', new Date().toISOString()).order('starts_at', { ascending: false }).limit(30),
    ]);
    if (statsResult.error || eventsResult.error) {
      showAttendanceError(`출석 현황 오류: ${(statsResult.error || eventsResult.error).message}`);
      return;
    }
    renderMonthlyAttendance(statsResult.data);
    attendanceEvents = eventsResult.data;
    attendanceEventSelect.replaceChildren();
    if (!attendanceEvents.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '시작된 일정 없음';
      attendanceEventSelect.append(option);
    } else {
      attendanceEvents.forEach((event) => {
        const option = document.createElement('option');
        option.value = event.id;
        option.textContent = `${formatKoreanDateTime(event.starts_at)} · ${event.title}`;
        option.selected = event.id === previousEventId;
        attendanceEventSelect.append(option);
      });
    }
    attendanceLoading.hidden = true;
    attendanceWorkspace.hidden = false;
    await loadAttendanceRecords();
  }

  async function saveAttendance(userId, status, button) {
    if (!canManageSchedule() || !attendanceEventSelect.value) return;
    button.disabled = true;
    const { error } = await supabaseClient.rpc('set_attendance', {
      p_event_id: attendanceEventSelect.value,
      p_target_user_id: userId,
      p_status: status,
    });
    button.disabled = false;
    if (error) {
      showToast(`출석 저장에 실패했습니다: ${error.message}`);
      return;
    }
    await loadAttendance(activeClub);
    showToast('출석 상태를 저장했습니다.');
  }

  function resetAdminAttendance() {
    updateManagerNavigation(null);
    adminAttendanceData = [];
    adminAttendanceDataMonth = '';
    adminAttendanceLoading.hidden = false;
    adminAttendanceUnauthorized.hidden = true;
    adminAttendanceWorkspace.hidden = true;
    adminAttendanceError.hidden = true;
    adminAttendanceStatus.textContent = '';
    adminAttendanceRows.replaceChildren();
    exportAttendanceCsvButton.disabled = true;
  }

  function showAdminAttendanceUnauthorized() {
    adminAttendanceLoading.hidden = true;
    adminAttendanceWorkspace.hidden = true;
    adminAttendanceError.hidden = true;
    adminAttendanceUnauthorized.hidden = false;
  }

  function showAdminAttendanceError(message) {
    adminAttendanceLoading.hidden = true;
    adminAttendanceUnauthorized.hidden = true;
    adminAttendanceWorkspace.hidden = true;
    adminAttendanceError.hidden = false;
    document.querySelector('[data-admin-attendance-error-message]').textContent = message;
  }

  function renderAdminAttendance(rows) {
    adminAttendanceRows.replaceChildren();
    rows.forEach((member) => {
      const row = document.createElement('tr');
      const memberCell = document.createElement('th');
      memberCell.scope = 'row';
      const name = document.createElement('strong');
      name.textContent = member.display_name;
      const role = document.createElement('span');
      role.textContent = roleLabel(member.member_role);
      memberCell.append(name, role);
      [
        member.attended_count,
        member.declared_absent_count,
        member.late_count,
        member.no_show_count,
        member.unprocessed_count,
      ].forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = value || 0;
        row.append(cell);
      });
      row.prepend(memberCell);
      adminAttendanceRows.append(row);
    });

    const totals = rows.reduce(
      (result, member) => ({
        attended: result.attended + (member.attended_count || 0),
        declaredAbsent: result.declaredAbsent + (member.declared_absent_count || 0),
        late: result.late + (member.late_count || 0),
        noShow: result.noShow + (member.no_show_count || 0),
      }),
      { attended: 0, declaredAbsent: 0, late: 0, noShow: 0 },
    );
    document.querySelector('[data-admin-total-attended]').textContent = totals.attended;
    document.querySelector('[data-admin-total-declared-absent]').textContent = totals.declaredAbsent;
    document.querySelector('[data-admin-total-late]').textContent = totals.late;
    document.querySelector('[data-admin-total-no-show]').textContent = totals.noShow;
    adminAttendanceStatus.textContent = rows.length
      ? `활성 회원 ${rows.length}명의 월별 집계입니다.`
      : '집계할 활성 회원이 없습니다.';
    exportAttendanceCsvButton.disabled = rows.length === 0;
  }

  async function loadAdminAttendance(membership = activeClub) {
    if (!canManageSchedule(membership)) {
      showAdminAttendanceUnauthorized();
      return;
    }
    if (!adminAttendanceMonth.value) adminAttendanceMonth.value = currentKoreanMonth();
    adminAttendanceLoading.hidden = false;
    adminAttendanceUnauthorized.hidden = true;
    adminAttendanceWorkspace.hidden = true;
    adminAttendanceError.hidden = true;
    adminAttendanceStatus.textContent = '';
    exportAttendanceCsvButton.disabled = true;

    const { data, error } = await supabaseClient.rpc('get_admin_monthly_attendance', {
      p_club_id: membership.club_id,
      p_month_start: `${adminAttendanceMonth.value}-01`,
    });
    if (error) {
      showAdminAttendanceError(`관리자 출석 조회 오류: ${error.message}`);
      return;
    }

    adminAttendanceData = data || [];
    adminAttendanceDataMonth = adminAttendanceMonth.value;
    renderAdminAttendance(adminAttendanceData);
    adminAttendanceLoading.hidden = true;
    adminAttendanceWorkspace.hidden = false;
  }

  function csvCell(value) {
    let normalized = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(normalized)) normalized = `'${normalized}`;
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  function exportAdminAttendanceCsv() {
    if (!canManageSchedule() || !adminAttendanceData.length || !adminAttendanceDataMonth) return;
    const headers = ['조회 월', '회원명', '권한', '참석', '불참', '지각', '결석', '미처리', '집계 대상 일정'];
    const rows = adminAttendanceData.map((member) => [
      adminAttendanceDataMonth,
      member.display_name,
      roleLabel(member.member_role),
      member.attended_count || 0,
      member.declared_absent_count || 0,
      member.late_count || 0,
      member.no_show_count || 0,
      member.unprocessed_count || 0,
      member.finalized_event_count || 0,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `KFC_월별_출석현황_${adminAttendanceDataMonth}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
    showToast(`${adminAttendanceDataMonth} 출석 현황 CSV를 저장했습니다.`);
  }

  function announcementDisplayStatus(announcement) {
    if (announcement.status !== 'published') return announcement.status;
    const now = Date.now();
    if (new Date(announcement.starts_at).getTime() > now) return 'scheduled';
    if (announcement.ends_at && new Date(announcement.ends_at).getTime() <= now) return 'expired';
    return 'published';
  }

  function announcementStatusLabel(status) {
    return {
      draft: '임시 저장',
      published: '공개 중',
      scheduled: '공개 예정',
      expired: '게시 종료',
      archived: '보관됨',
    }[status] || status;
  }

  function resetAnnouncements() {
    announcements = [];
    announcementLoading.hidden = false;
    announcementLoading.lastElementChild.textContent = '공지사항을 확인하고 있습니다.';
    announcementNoClub.hidden = true;
    announcementWorkspace.hidden = true;
    announcementError.hidden = true;
    announcementList.replaceChildren();
    announcementEmpty.hidden = true;
    announcementForm.hidden = true;
    createAnnouncementButton.hidden = true;
  }

  function showAnnouncementsNoClub() {
    announcements = [];
    announcementLoading.hidden = true;
    announcementWorkspace.hidden = true;
    announcementError.hidden = true;
    announcementNoClub.hidden = false;
    createAnnouncementButton.hidden = true;
  }

  function showAnnouncementError(message) {
    announcementLoading.hidden = true;
    announcementNoClub.hidden = true;
    announcementWorkspace.hidden = true;
    announcementError.hidden = false;
    document.querySelector('[data-announcement-error-message]').textContent = message;
  }

  function closeAnnouncementForm() {
    announcementForm.hidden = true;
    announcementFormStatus.textContent = '';
    announcementFormStatus.classList.remove('is-error');
  }

  function openAnnouncementForm(announcement = null) {
    if (!canManageSchedule()) return;
    announcementForm.reset();
    announcementForm.elements.announcementId.value = announcement?.id || '';
    announcementForm.elements.title.value = announcement?.title || '';
    announcementForm.elements.content.value = announcement?.content || '';
    announcementForm.elements.startsAt.value = toKoreanDateTimeLocal(
      announcement?.starts_at || new Date(),
    );
    announcementForm.elements.endsAt.value = announcement?.ends_at
      ? toKoreanDateTimeLocal(announcement.ends_at)
      : '';
    announcementForm.elements.status.value =
      announcement?.status === 'published' ? 'published' : 'draft';
    announcementForm.elements.isPinned.checked = Boolean(announcement?.is_pinned);
    document.querySelector('[data-announcement-form-title]').textContent = announcement
      ? '공지 수정'
      : '새 공지 작성';
    announcementFormStatus.textContent = '';
    announcementFormStatus.classList.remove('is-error');
    announcementForm.hidden = false;
    announcementForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    announcementForm.elements.title.focus({ preventScroll: true });
  }

  function createAnnouncementCard(announcement) {
    const card = document.createElement('article');
    card.className = 'announcement-card';
    card.classList.toggle('is-pinned', announcement.is_pinned);

    const header = document.createElement('div');
    header.className = 'announcement-card-header';
    const titleWrap = document.createElement('div');
    titleWrap.className = 'announcement-card-title';
    const title = document.createElement('h2');
    title.textContent = announcement.title;
    titleWrap.append(title);
    if (announcement.is_pinned) {
      const pin = document.createElement('span');
      pin.className = 'announcement-pin';
      pin.textContent = '중요';
      titleWrap.prepend(pin);
    }
    const displayStatus = announcementDisplayStatus(announcement);
    const status = document.createElement('span');
    status.className = 'announcement-status';
    status.dataset.status = displayStatus;
    status.textContent = announcementStatusLabel(displayStatus);
    header.append(titleWrap, status);

    const content = document.createElement('p');
    content.className = 'announcement-content';
    content.textContent = announcement.content;
    const meta = document.createElement('div');
    meta.className = 'announcement-card-meta';
    const start = document.createElement('span');
    start.textContent = `게시 시작 ${formatKoreanDateTime(announcement.starts_at)}`;
    meta.append(start);
    if (announcement.ends_at) {
      const end = document.createElement('span');
      end.textContent = `· 게시 종료 ${formatKoreanDateTime(announcement.ends_at)}`;
      meta.append(end);
    }
    card.append(header, content, meta);

    if (canManageSchedule() && announcement.status !== 'archived') {
      const actions = document.createElement('div');
      actions.className = 'announcement-card-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.dataset.editAnnouncement = announcement.id;
      edit.textContent = '수정';
      edit.addEventListener('click', () => openAnnouncementForm(announcement));
      const archive = document.createElement('button');
      archive.type = 'button';
      archive.dataset.archiveAnnouncement = announcement.id;
      archive.textContent = '보관';
      archive.addEventListener('click', () => archiveAnnouncement(announcement, archive));
      actions.append(edit, archive);
      card.append(actions);
    }
    return card;
  }

  async function loadAnnouncements(membership = activeClub) {
    if (!membership) {
      showAnnouncementsNoClub();
      return;
    }
    announcementLoading.hidden = false;
    announcementNoClub.hidden = true;
    announcementWorkspace.hidden = true;
    announcementError.hidden = true;
    createAnnouncementButton.hidden = !canManageSchedule(membership);
    const { data, error } = await supabaseClient
      .from('announcements')
      .select('id, club_id, title, content, is_pinned, starts_at, ends_at, status, created_at, updated_at')
      .eq('club_id', membership.club_id)
      .order('is_pinned', { ascending: false })
      .order('starts_at', { ascending: false });
    if (error) {
      showAnnouncementError(error.message);
      return;
    }
    announcements = data;
    announcementList.replaceChildren();
    data.forEach((announcement) => announcementList.append(createAnnouncementCard(announcement)));
    announcementEmpty.hidden = data.length > 0;
    announcementLoading.hidden = true;
    announcementWorkspace.hidden = false;
  }

  async function saveAnnouncement(event) {
    event.preventDefault();
    if (!activeClub || !canManageSchedule() || !announcementForm.reportValidity()) return;
    const announcementId = announcementForm.elements.announcementId.value;
    const startsAt = koreanDateTimeLocalToIso(announcementForm.elements.startsAt.value);
    const endsAtValue = announcementForm.elements.endsAt.value;
    const endsAt = endsAtValue ? koreanDateTimeLocalToIso(endsAtValue) : null;
    if (!startsAt || (endsAtValue && !endsAt)) {
      announcementFormStatus.textContent = '게시 기간을 확인해 주세요.';
      announcementFormStatus.classList.add('is-error');
      return;
    }

    announcementSaveButton.disabled = true;
    announcementFormStatus.textContent = '공지를 안전하게 저장하고 있습니다.';
    announcementFormStatus.classList.remove('is-error');
    const shared = {
      p_title: announcementForm.elements.title.value.trim(),
      p_content: announcementForm.elements.content.value.trim(),
      p_is_pinned: announcementForm.elements.isPinned.checked,
      p_starts_at: startsAt,
      p_ends_at: endsAt,
      p_status: announcementForm.elements.status.value,
    };
    const { error } = announcementId
      ? await supabaseClient.rpc('update_announcement', {
          p_announcement_id: announcementId,
          ...shared,
        })
      : await supabaseClient.rpc('create_announcement', {
          p_club_id: activeClub.club_id,
          ...shared,
        });
    announcementSaveButton.disabled = false;
    if (error) {
      announcementFormStatus.textContent = error.message;
      announcementFormStatus.classList.add('is-error');
      return;
    }
    closeAnnouncementForm();
    await loadAnnouncements(activeClub);
    showToast(announcementId ? '공지를 수정했습니다.' : '공지를 작성했습니다.');
  }

  async function archiveAnnouncement(announcement, button) {
    if (!canManageSchedule()) return;
    if (!window.confirm(`${announcement.title} 공지를 보관할까요?`)) return;
    button.disabled = true;
    const { error } = await supabaseClient.rpc('archive_announcement', {
      p_announcement_id: announcement.id,
    });
    if (error) {
      button.disabled = false;
      showToast(`공지를 보관하지 못했습니다: ${error.message}`);
      return;
    }
    closeAnnouncementForm();
    await loadAnnouncements(activeClub);
    showToast('공지를 보관했습니다.');
  }

  async function loadClub(user, createdInviteCode = '') {
    resetClub();
    const { data, error } = await supabaseClient
      .from('club_members')
      .select('club_id, role, status, clubs!inner(id, name, owner_id, time_zone, status)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (error) {
      clubLoading.lastChild.textContent = ' 클럽 정보를 불러오지 못했습니다.';
      showToast(`클럽 정보 오류: ${error.message}`);
      return;
    }
    if (!data) {
      showClubOnboarding();
      return;
    }
    await showClubDashboard(data, createdInviteCode);
  }

  async function rotateInviteCode() {
    if (!session?.user || !activeClub || activeClub.role !== 'owner') return;
    const confirmed = window.confirm(
      '새 초대 코드를 발급하면 기존 코드는 즉시 사용할 수 없습니다. 계속할까요?',
    );
    if (!confirmed) return;

    const inviteCode = generateInviteCode();
    rotateInviteButton.disabled = true;
    const { error } = await supabaseClient.rpc('rotate_club_invite_code', {
      p_club_id: activeClub.club_id,
      p_invite_code: inviteCode,
    });
    rotateInviteButton.disabled = false;
    if (error) {
      showToast(`새 코드를 발급하지 못했습니다: ${error.message}`);
      return;
    }

    document.querySelector('[data-new-invite-code]').textContent = inviteCode;
    document.querySelector('[data-new-invite-card]').hidden = false;
    showToast('새 초대 코드를 발급했습니다.');
  }

  function setClubFormStatus(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle('is-error', isError);
  }

  async function createClub(event) {
    event.preventDefault();
    if (!session?.user || !createClubForm.reportValidity()) return;
    const clubName = createClubForm.elements.clubName.value.trim();
    const inviteCode = generatedInviteCodeInput.value;
    createClubSubmit.disabled = true;
    setClubFormStatus(createClubStatus, '클럽과 초대 코드를 안전하게 만들고 있습니다.');

    const { error } = await supabaseClient.rpc('create_club_with_invite_code', {
      p_name: clubName,
      p_invite_code: inviteCode,
    });
    createClubSubmit.disabled = false;
    if (error) {
      setClubFormStatus(createClubStatus, error.message, true);
      return;
    }

    createClubForm.reset();
    refreshGeneratedInviteCode();
    await loadClub(session.user, inviteCode);
    showToast('클럽을 만들었습니다.');
  }

  async function joinClub(event) {
    event.preventDefault();
    if (!session?.user || !joinClubForm.reportValidity()) return;
    const inviteCode = joinClubForm.elements.inviteCode.value.trim().toUpperCase();
    joinClubSubmit.disabled = true;
    setClubFormStatus(joinClubStatus, '초대 코드를 확인하고 있습니다.');

    const { error } = await supabaseClient.rpc('join_club_with_invite_code', {
      p_invite_code: inviteCode,
    });
    joinClubSubmit.disabled = false;
    if (error) {
      setClubFormStatus(joinClubStatus, error.message, true);
      return;
    }

    joinClubForm.reset();
    await loadClub(session.user);
    showToast('클럽에 가입했습니다.');
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
      await loadClub(session.user);
    } else {
      window.sessionStorage.removeItem('kfc-oauth-pending');
      resetProfile();
      resetClub();
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
    element.textContent = config?.appVersion || '1.4.0';
  });

  googleLoginButton?.addEventListener('click', signInWithGoogle);
  authActionButton?.addEventListener('click', handleAuthAction);
  profileEditButton?.addEventListener('click', openProfileForm);
  profileCancelButton?.addEventListener('click', closeProfileForm);
  profilePhotoInput?.addEventListener('change', handleProfilePhoto);
  profilePhotoRemoveButton?.addEventListener('click', useDefaultProfileAvatar);
  profileForm?.addEventListener('submit', saveProfile);
  requestAccountDeletionButton?.addEventListener('click', requestAccountDeletion);
  profileBioInput?.addEventListener('input', () => {
    profileBioCount.textContent = profileBioInput.value.length;
  });
  profileForm?.elements.displayName?.addEventListener('input', () => {
    if (!selectedAvatarPreviewUrl && useDefaultAvatar) {
      setAvatar(document.querySelector('[data-edit-avatar]'), '', profileForm.elements.displayName.value);
    }
  });
  clubTabButtons.forEach((button, index) => {
    button.addEventListener('click', () => setClubTab(button.dataset.clubTab, true));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const nextButton = clubTabButtons[(index + direction + clubTabButtons.length) % clubTabButtons.length];
      setClubTab(nextButton.dataset.clubTab);
      nextButton.focus();
    });
  });
  createClubForm?.addEventListener('submit', createClub);
  joinClubForm?.addEventListener('submit', joinClub);
  document.querySelector('[data-regenerate-invite-code]')?.addEventListener('click', refreshGeneratedInviteCode);
  document.querySelector('[data-copy-generated-code]')?.addEventListener('click', () => {
    copyText(generatedInviteCodeInput.value);
  });
  document.querySelector('[data-copy-new-invite]')?.addEventListener('click', () => {
    copyText(document.querySelector('[data-new-invite-code]').textContent);
  });
  rotateInviteButton?.addEventListener('click', rotateInviteCode);
  createEventButton?.addEventListener('click', () => {
    const preferredDate = selectedScheduleDate >= currentKoreanDate() ? selectedScheduleDate : '';
    openEventForm(null, preferredDate);
  });
  createEventForDateButton?.addEventListener('click', () => {
    if (selectedScheduleDate >= currentKoreanDate()) openEventForm(null, selectedScheduleDate);
  });
  document.querySelector('[data-calendar-previous]')?.addEventListener('click', async () => {
    scheduleMonth = shiftMonth(scheduleMonth, -1);
    selectedScheduleDate = '';
    await loadSchedule(activeClub);
  });
  document.querySelector('[data-calendar-next]')?.addEventListener('click', async () => {
    scheduleMonth = shiftMonth(scheduleMonth, 1);
    selectedScheduleDate = '';
    await loadSchedule(activeClub);
  });
  document.querySelector('[data-calendar-today]')?.addEventListener('click', async () => {
    selectedScheduleDate = currentKoreanDate();
    scheduleMonth = selectedScheduleDate.slice(0, 7);
    await loadSchedule(activeClub, { focusCalendarDate: true });
  });
  eventForm?.addEventListener('submit', saveEvent);
  document.querySelector('[data-event-form-cancel]')?.addEventListener('click', closeEventForm);
  document.querySelector('[data-event-back]')?.addEventListener('click', showEventList);
  document.querySelector('[data-edit-event]')?.addEventListener('click', () => {
    const scheduleEvent = scheduledEvents.find((item) => item.id === selectedEventId);
    if (scheduleEvent) openEventForm(scheduleEvent);
  });
  document.querySelector('[data-publish-event]')?.addEventListener('click', publishSelectedEvent);
  document.querySelector('[data-cancel-event]')?.addEventListener('click', cancelSelectedEvent);
  document.querySelector('[data-schedule-retry]')?.addEventListener('click', () => {
    if (activeClub) loadSchedule(activeClub);
  });
  attendanceMonth?.addEventListener('change', () => {
    if (activeClub) loadAttendance(activeClub);
  });
  attendanceEventSelect?.addEventListener('change', loadAttendanceRecords);
  document.querySelector('[data-attendance-retry]')?.addEventListener('click', () => {
    if (activeClub) loadAttendance(activeClub);
  });
  adminAttendanceMonth?.addEventListener('change', () => {
    if (activeClub) loadAdminAttendance(activeClub);
  });
  document.querySelector('[data-admin-attendance-retry]')?.addEventListener('click', () => {
    if (activeClub) loadAdminAttendance(activeClub);
  });
  exportAttendanceCsvButton?.addEventListener('click', exportAdminAttendanceCsv);
  createAnnouncementButton?.addEventListener('click', () => openAnnouncementForm());
  announcementForm?.addEventListener('submit', saveAnnouncement);
  document.querySelector('[data-announcement-form-cancel]')?.addEventListener('click', closeAnnouncementForm);
  document.querySelector('[data-announcement-retry]')?.addEventListener('click', () => {
    if (activeClub) loadAnnouncements(activeClub);
  });
  applyEventButton?.addEventListener('click', applyToSelectedEvent);
  absentEventButton?.addEventListener('click', setSelectedEventAbsent);
  cancelParticipationButton?.addEventListener('click', cancelSelectedParticipation);
  joinClubForm?.elements.inviteCode?.addEventListener('input', (event) => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  });
  window.addEventListener('hashchange', renderRoute);

  refreshGeneratedInviteCode();

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
