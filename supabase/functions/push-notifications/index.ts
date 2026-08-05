import { createClient } from '@supabase/supabase-js';
import webPush from 'web-push';

const allowedOrigins = new Set([
  'https://seansy91.github.io',
  'http://127.0.0.1:8080',
  'http://localhost:8080',
]);

type PushActionBody = {
  action?: 'public-key' | 'test';
  clubId?: string;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin && allowedOrigins.has(origin) ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
) {
  return Response.json(body, {
    status,
    headers: corsHeaders(origin),
  });
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

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse({ message: '로그인이 필요합니다.' }, 401, origin);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const publishableKey = firstConfiguredKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
  const secretKey = firstConfiguredKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !publishableKey || !secretKey) {
    return jsonResponse({ message: '서버 인증 설정이 준비되지 않았습니다.' }, 500, origin);
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ message: '로그인 정보를 확인할 수 없습니다.' }, 401, origin);
  }

  let body: PushActionBody;
  try {
    body = await request.json() as PushActionBody;
  } catch {
    return jsonResponse({ message: '요청 형식이 올바르지 않습니다.' }, 400, origin);
  }

  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
  if (!vapidPublicKey) {
    return jsonResponse({ message: '푸시 공개 키가 설정되지 않았습니다.' }, 503, origin);
  }
  if (body.action === 'public-key') {
    return jsonResponse({ publicKey: vapidPublicKey }, 200, origin);
  }
  if (body.action !== 'test' || !isUuid(body.clubId)) {
    return jsonResponse({ message: '지원하지 않는 푸시 작업입니다.' }, 400, origin);
  }

  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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

  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  const vapidSubject = Deno.env.get('VAPID_SUBJECT')
    ?? 'https://seansy91.github.io/football_club_web/';
  if (!vapidPrivateKey) {
    return jsonResponse({ message: '푸시 비공개 키가 설정되지 않았습니다.' }, 503, origin);
  }

  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const payload = JSON.stringify({
    title: 'KFC Football Club',
    body: '푸시 알림 연결이 완료되었습니다.',
    tag: 'kfc-push-test',
    url: './#profile',
  });
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
        payload,
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
