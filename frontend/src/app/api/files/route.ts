import { NextResponse, type NextRequest } from "next/server";
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';

const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY = (process.env.PINATA_GATEWAY_URL || 'https://gateway.pinata.cloud').trim();

async function uploadToPinata(file: File | Blob, fileName: string): Promise<{ IpfsHash: string; PinSize: number }> {
  const formData = new FormData();
  formData.append('file', file, fileName);

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Pinata upload failed (${res.status}): ${errText}`);
  }

  return res.json();
}

export async function POST(request: NextRequest) {
  try {
    applyRateLimit(request, {
      prefix: 'files-upload',
      maxRequests: 10,
      windowMs: 60000,
    });

    if (!PINATA_JWT) {
      throw new Error('PINATA_JWT environment variable is not configured');
    }

    const data = await request.formData();
    const file: File | null = data.get("file") as unknown as File;
    const name = data.get("name") as string;
    const bio = data.get("bio") as string;
    const life_history = data.get("life_history") as string;
    const adjectives = data.get("adjectives") as string;
    const knowledge_areas = data.get("knowledge_areas") as string;

    if (!file) {
      throw ErrorResponses.badRequest("No file received");
    }

    console.log("Uploading image to Pinata:", file.name, `(${(file.size / 1024 / 1024).toFixed(2)} MB)`);

    // Step 1: Upload image to Pinata
    const imageResult = await uploadToPinata(file, file.name);
    const imageCid = imageResult.IpfsHash;
    console.log("Image uploaded to IPFS:", imageCid);

    // Step 2: Create metadata JSON
    const metadata = {
      name: name || "Unknown Warrior",
      bio: bio || "A legendary warrior",
      life_history: life_history || "History unknown",
      personality: adjectives ? adjectives.split(', ').map(trait => trait.trim()) : ["Brave", "Skilled"],
      knowledge_areas: knowledge_areas ? knowledge_areas.split(', ').map(area => area.trim()) : ["Combat", "Strategy"],
      image: `ipfs://${imageCid}`,
      image_cid: imageCid,
    };

    // Step 3: Upload metadata JSON to Pinata
    const metadataBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
    const metadataResult = await uploadToPinata(metadataBlob, 'metadata.json');
    const metadataCid = metadataResult.IpfsHash;
    console.log("Metadata uploaded to IPFS:", metadataCid);

    const imageUrl = `${PINATA_GATEWAY}/ipfs/${imageCid}`;
    const metadataUrl = `${PINATA_GATEWAY}/ipfs/${metadataCid}`;

    return NextResponse.json({
      success: true,
      imageRootHash: imageCid,
      imageTransactionHash: imageCid,
      metadataRootHash: metadataCid,
      metadataTransactionHash: metadataCid,
      metadata,
      size: file.size,
      imageCid,
      metadataCid,
      imageUrl,
      metadataUrl,
    }, { status: 200 });

  } catch (error) {
    return handleAPIError(error, 'API:Files:POST');
  }
}
