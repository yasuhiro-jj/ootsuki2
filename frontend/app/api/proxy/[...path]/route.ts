import { NextRequest, NextResponse } from 'next/server';

// 本番環境では環境変数が必須
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 
  (process.env.VERCEL ? '' : 'http://localhost:8011'); // 開発環境のみlocalhost

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(request, params.path, 'GET');
}

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(request, params.path, 'POST');
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(request, params.path, 'PUT');
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(request, params.path, 'DELETE');
}

async function proxyRequest(
  request: NextRequest,
  pathSegments: string[],
  method: string
) {
  // 本番環境で環境変数が設定されていない場合
  if (!BACKEND_URL) {
    console.error('[API Proxy] NEXT_PUBLIC_API_URL is not set');
    return NextResponse.json(
      {
        detail: 'バックエンドURLが設定されていません。NEXT_PUBLIC_API_URL環境変数を設定してください。',
      },
      { status: 500 }
    );
  }

  try {
    const path = pathSegments.join('/');
    const url = `${BACKEND_URL}/${path}`;
    
    // クエリパラメータを取得
    const searchParams = request.nextUrl.searchParams.toString();
    const fullUrl = searchParams ? `${url}?${searchParams}` : url;

    // リクエストボディを取得
    let body: string | undefined;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (method === 'POST' || method === 'PUT') {
      try {
        body = await request.text();
        // 空文字列の場合はundefinedにする
        if (!body || body.trim() === '') {
          body = undefined;
        }
      } catch (e) {
        // ボディがない場合は無視
        body = undefined;
      }
    }

    // Authorizationヘッダーがある場合は追加
    const authHeader = request.headers.get('authorization');
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    console.log(`[API Proxy] ${method} ${fullUrl}`, { 
      hasBody: !!body,
      path: pathSegments 
    });

    // バックエンドにリクエストを転送
    const response = await fetch(fullUrl, {
      method,
      headers,
      ...(body && { body }),
    });

    console.log(`[API Proxy] Response: ${response.status} ${response.statusText}`);

    // レスポンスを取得
    const contentType = response.headers.get('content-type');
    let data: any;
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json().catch(() => ({}));
    } else {
      const text = await response.text().catch(() => '');
      try {
        data = JSON.parse(text);
      } catch {
        data = { detail: text || 'レスポンスの解析に失敗しました' };
      }
    }

    // ステータスコードとレスポンスを返す
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    console.error('[API Proxy] Error:', error);
    return NextResponse.json(
      {
        detail: error.message || 'バックエンドへの接続に失敗しました',
      },
      { status: 500 }
    );
  }
}
