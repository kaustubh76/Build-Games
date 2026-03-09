/**
 * Download API Route — serves content from 0G Storage or IPFS.
 * GET /api/storage/download/:hash
 *
 * - IPFS CIDs (Qm.../bafy...) → proxied from public IPFS gateway
 * - Everything else → downloaded from 0G Storage
 */

import { NextResponse, type NextRequest } from 'next/server';
import { download, isZgConfigured } from '@/services/zgStorageService';

const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://dweb.link/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
];

async function fetchFromIPFS(cid: string): Promise<Response | null> {
  for (const gateway of IPFS_GATEWAYS) {
    try {
      const res = await fetch(`${gateway}${cid}`, {
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) return res;
    } catch {
      continue;
    }
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ hash: string }> }
) {
  const { hash } = await params;

  if (!hash) {
    return NextResponse.json({ error: 'Hash parameter required' }, { status: 400 });
  }

  // Strip storage:// or 0g:// prefix if present
  let cleanHash = hash;
  if (cleanHash.startsWith('storage://')) cleanHash = cleanHash.replace('storage://', '');
  if (cleanHash.startsWith('0g://')) cleanHash = cleanHash.replace('0g://', '');
  // Remove any port suffix (e.g., "hash:0")
  cleanHash = cleanHash.split(':')[0];

  try {
    // IPFS CIDs → proxy from IPFS gateway
    if (cleanHash.startsWith('Qm') || cleanHash.startsWith('bafy')) {
      const ipfsRes = await fetchFromIPFS(cleanHash);
      if (!ipfsRes) {
        return NextResponse.json({ error: 'IPFS fetch failed from all gateways' }, { status: 502 });
      }

      const data = await ipfsRes.arrayBuffer();
      const contentType = ipfsRes.headers.get('Content-Type') || 'application/octet-stream';

      return new NextResponse(data, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // 0G Storage download
    if (!isZgConfigured()) {
      return NextResponse.json(
        { error: 'Storage not configured. Set ZG_PRIVATE_KEY or use IPFS CIDs.' },
        { status: 503 }
      );
    }

    const data = await download(cleanHash);

    // Try to detect content type from data
    let contentType = 'application/octet-stream';
    try {
      JSON.parse(data.toString('utf-8'));
      contentType = 'application/json';
    } catch {
      // Not JSON — check for image magic bytes
      if (data[0] === 0xFF && data[1] === 0xD8) contentType = 'image/jpeg';
      else if (data[0] === 0x89 && data[1] === 0x50) contentType = 'image/png';
      else if (data[0] === 0x47 && data[1] === 0x49) contentType = 'image/gif';
    }

    return new NextResponse(data, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error: any) {
    console.error(`Storage download error for hash ${cleanHash}:`, error);
    return NextResponse.json(
      { error: error.message || 'Download failed' },
      { status: 404 }
    );
  }
}
