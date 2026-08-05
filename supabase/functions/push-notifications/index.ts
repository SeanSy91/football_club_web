import { createClient } from '@supabase/supabase-js';
import webPush from 'web-push';

const allowedOrigins = new Set([
  'https://seansy91.github.io',
  'http://127.0.0.1:8080',
  'http://localhost:8080',
]);

type PushActionBody = {
  action?: 'public-key' | 'test' | 'event-message' | 'process-reminders';
  clubId?: string;
  eventId?: string;
  title?: string;
  body?: string;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

type PushPayload = {
  title: string;
  body: string;
  tag: string;
  url: string;
};

type DeliveryResult = {
  eligibleUserCount: number;
  sentCount: number;
  failedCount: number;
};

function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin && allowedOrigins.has(origin) ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function jsonResponse(body: Record<string, unknown>, status: number, origin: string | null) {
  return Response.json(body, { status, headers: corsHeaders(origin) });
}

function firstConfiguredKey(jsonName: string, legacyName: string) {
  const legacyValue = Deno.env.get(legacyName);
  if (legacyValue) return legacyValue;

  const configuredKeys = Deno.env.get(jsonName);
  if (!configuredKeys) return '';
  try {
    const parsed = JSON.parse(configuredKeys) as Record<string, string>;
    return Object.values(parsed).find(Boolean) ?? '';
  } catch {
    return '';
  }
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function trimmedText(value: unknown, min: number, max: number) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length >= min && trimmed.length <= max ? trimmed : '';
}

function formatEventStart(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}

async function deliverToConfirmedAttendees(
  adminClient: any,
  eventId: string,
  clubId: string,
  preferenceField: 'event_reminder' | 'admin_event_message',
  payload: PushPayload,
  ttl: number,
): Promise<DeliveryResult> {
  const { data: responses, error: responseError } = await adminClient
    .from('event_responses')
    .select('user_id')
    .eq('event_id', eventId)
    .eq('status', 'confirmed');
  if (responseError) throw new Error('참가 확정자를 불러오지 못했습니다.');

  const confirmedUserIds = [...new Set(
    (responses ?? []).map((item: { user_id: string }) => item.user_id),
  )];
  if (!confirmedUserIds.length) return { eligibleUserCount: 0, sentCount: 0, failedCount: 0 };

  const { data: disabledPreferences, error: preferenceError } = await adminClient
    .from('notification_preferences')
    .select('user_id')
    .eq('club_id', clubId)
    .eq(preferenceField, false)
    .in('user_id', confirmedUserIds);
  if (preferenceError) throw new Error('회원 알림 설정을 불러오지 못했습니다.');

  const disabledUserIds = new Set(
    (disabledPreferences ?? []).map((item: { user_id: string }) => item.user_id),
  );
  const eligibleUserIds = confirmedUserIds.filter((userId) => !disabledUserIds.has(userId));
  if (!eligibleUserIds.length) return { eligibleUserCount: 0, sentCount: 0, failedCount: 0 };

  const { data: subscriptions, error: subscriptionError } = await adminClient
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .eq('club_id', clubId)
    .eq('is_active', true)
    .in('user_id', eligibleUserIds);
  if (subscriptionError) throw new Error('푸시 구독을 불러오지 못했습니다.');

  const staleSubscriptionIds: string[] = [];
  let sentCount = 0;
  let failedCount = 0;
  await Promise.all(((subscriptions ?? []) as PushSubscriptionRow[]).map(async (subscription) => {
    try {
      await webPush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
        },
        JSON.stringify(payload),
        { TTL: ttl, urgency: 'high', topic: payload.tag.slice(0, 32) },
      );
      sentCount += 1;
    } catch (error) {
      failedCount += 1;
      const statusCode = typeof error === 'object' && error && 'statusCode' in error
        ? Number(error.statusCode)
        : 0;
      if (statusCode === 404 || statusCode === 410) staleSubscriptionIds.push(subscription.id);
    }
  }));

  if (staleSubscriptionIds.length) {
    await adminClient
      .from('push_subscriptions')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in('id', staleSubscriptionIds);
  }

  return { eligibleUserCount: eligibleUserIds.length, sentCount, failedCount };
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  if (origin && !allowedOrigins.has(origin)) {
    return jsonResponse({ message: '허용되지 않은 요청 출처입니다.' }, 403, null);
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ message: 'POST 요청만 사용할 수 있습니다.' }, 405, origin);
  }

  let body: PushActionBody;
  try {
    body = await request.json() as PushActionBody;
  } catch {
    return jsonResponse({ message: '요청 형식이 올바르지 않습니다.' }, 400, origin);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const publishableKey = firstConfiguredKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
  const secretKey = firstConfiguredKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  if (!supabaseUrl || !publishableKey || !secretKey) {
    return jsonResponse({ message: '서버 인증 설정이 준비되지 않았습니다.' }, 500, origin);
  }
  if (!vapidPublicKey || !vapidPrivateKey) {
    return jsonResponse({ message: '푸시 키가 설정되지 않았습니다.' }, 503, origin);
  }

  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  webPush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'https://seansy91.github.io/football_club_web/',
    vapidPublicKey,
    vapidPrivateKey,
  );

  if (body.action === 'process-reminders') {
    const automationSecret = request.headers.get('x-push-automation-secret') ?? '';
    const { data: reminders, error: claimError } = await adminClient.rpc(
      'claim_due_event_reminders',
      { p_automation_secret: automationSecret },
    );
    if (claimError) {
      return jsonResponse({ message: '예약 알림 인증 또는 조회에 실패했습니다.' }, 403, origin);
    }

    let sentCount = 0;
    let failedCount = 0;
    for (const reminder of reminders ?? []) {
      let result: DeliveryResult;
      try {
        result = await deliverToConfirmedAttendees(
          adminClient,
          reminder.event_id,
          reminder.club_id,
          'event_reminder',
          {
            title: `일정 알림 · ${reminder.event_title}`,
            body: `${formatEventStart(reminder.event_starts_at)} · ${reminder.event_venue}`,
            tag: `event-reminder-${reminder.event_id.slice(0, 8)}`,
            url: './#schedule',
          },
          6 * 60 * 60,
        );
      } catch {
        await adminClient.rpc('fail_event_reminder', {
          p_automation_secret: automationSecret,
          p_message_id: reminder.message_id,
        });
        failedCount += 1;
        continue;
      }

      const { error: completeError } = await adminClient.rpc('complete_event_reminder', {
        p_automation_secret: automationSecret,
        p_message_id: reminder.message_id,
        p_eligible_user_count: result.eligibleUserCount,
        p_sent_count: result.sentCount,
        p_failed_count: result.failedCount,
      });
      if (completeError) failedCount += 1;
      sentCount += result.sentCount;
      failedCount += result.failedCount;
    }

    return jsonResponse({ processedCount: reminders?.length ?? 0, sentCount, failedCount }, 200, origin);
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse({ message: '로그인이 필요합니다.' }, 401, origin);
  }
  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ message: '로그인 정보를 확인할 수 없습니다.' }, 401, origin);
  }

  if (body.action === 'public-key') {
    return jsonResponse({ publicKey: vapidPublicKey }, 200, origin);
  }

  if (body.action === 'event-message') {
    const title = trimmedText(body.title, 2, 60);
    const messageBody = trimmedText(body.body, 2, 300);
    if (!isUuid(body.eventId) || !title || !messageBody) {
      return jsonResponse({ message: '참석자 알림 내용을 다시 확인해 주세요.' }, 400, origin);
    }

    const { data: messageId, error: createError } = await userClient.rpc(
      'create_manual_event_push_message',
      { p_event_id: body.eventId, p_title: title, p_body: messageBody },
    );
    if (createError || !messageId) {
      return jsonResponse({ message: createError?.message ?? '알림 요청을 만들지 못했습니다.' }, 403, origin);
    }

    const { data: message, error: messageError } = await adminClient
      .from('event_push_messages')
      .select('id, club_id, event_id, title, body')
      .eq('id', messageId)
      .single();
    if (messageError || !message) {
      return jsonResponse({ message: '알림 요청을 확인하지 못했습니다.' }, 500, origin);
    }

    let result: DeliveryResult;
    try {
      result = await deliverToConfirmedAttendees(
        adminClient,
        message.event_id,
        message.club_id,
        'admin_event_message',
        {
          title: message.title,
          body: message.body,
          tag: `event-message-${message.event_id.slice(0, 8)}`,
          url: './#schedule',
        },
        60 * 60,
      );
    } catch (error) {
      await adminClient
        .from('event_push_messages')
        .update({ status: 'failed', failed_count: 1, completed_at: new Date().toISOString() })
        .eq('id', message.id);
      return jsonResponse({ message: error instanceof Error ? error.message : '알림 전송에 실패했습니다.' }, 500, origin);
    }

    await adminClient
      .from('event_push_messages')
      .update({
        eligible_user_count: result.eligibleUserCount,
        sent_count: result.sentCount,
        failed_count: result.failedCount,
        status: result.sentCount > 0 ? 'sent' : 'failed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', message.id);
    return jsonResponse(result, 200, origin);
  }

  if (body.action !== 'test' || !isUuid(body.clubId)) {
    return jsonResponse({ message: '지원하지 않는 푸시 작업입니다.' }, 400, origin);
  }

  const { data: membership, error: membershipError } = await adminClient
    .from('club_members')
    .select('club_id')
    .eq('club_id', body.clubId)
    .eq('user_id', userData.user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (membershipError || !membership) {
    return jsonResponse({ message: '활성 클럽 회원만 시험 알림을 보낼 수 있습니다.' }, 403, origin);
  }

  const { data: subscriptions, error: subscriptionError } = await adminClient
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .eq('club_id', body.clubId)
    .eq('user_id', userData.user.id)
    .eq('is_active', true);
  if (subscriptionError) {
    return jsonResponse({ message: '푸시 구독을 불러오지 못했습니다.' }, 500, origin);
  }
  if (!subscriptions?.length) {
    return jsonResponse({ message: '활성화된 알림 기기가 없습니다.' }, 409, origin);
  }

  const staleSubscriptionIds: string[] = [];
  let sentCount = 0;
  let failedCount = 0;
  await Promise.all((subscriptions as PushSubscriptionRow[]).map(async (subscription) => {
    try {
      await webPush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
        },
        JSON.stringify({
          title: 'KFC Football Club',
          body: '푸시 알림 연결이 완료되었습니다.',
          tag: 'kfc-push-test',
          url: './#profile',
        }),
        { TTL: 60, urgency: 'high', topic: 'kfc-push-test' },
      );
      sentCount += 1;
    } catch (error) {
      failedCount += 1;
      const statusCode = typeof error === 'object' && error && 'statusCode' in error
        ? Number(error.statusCode)
        : 0;
      if (statusCode === 404 || statusCode === 410) staleSubscriptionIds.push(subscription.id);
    }
  }));

  if (staleSubscriptionIds.length) {
    await adminClient
      .from('push_subscriptions')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in('id', staleSubscriptionIds);
  }
  if (!sentCount) {
    return jsonResponse({ message: '시험 알림을 전송하지 못했습니다.', failedCount }, 502, origin);
  }
  return jsonResponse({ sentCount, failedCount }, 200, origin);
});
