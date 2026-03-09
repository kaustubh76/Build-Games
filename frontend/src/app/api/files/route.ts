import { NextResponse, type NextRequest } from "next/server";
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';
import { upload as zgUpload, isZgConfigured } from '@/services/zgStorageService';

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

    // === 0G Storage Upload ===
    if (isZgConfigured()) {
      try {
        console.log("Uploading to 0G Storage:", file.name, `(${(file.size / 1024 / 1024).toFixed(2)} MB)`);

        // Step 1: Upload image to 0G Storage
        const imageBuffer = Buffer.from(await file.arrayBuffer());
        const imageResult = await zgUpload(imageBuffer, file.name);
        console.log("Image uploaded to 0G Storage, rootHash:", imageResult.rootHash);

        // Step 2: Create metadata JSON with storage:// image URI
        const metadata = {
          name: name || "Unknown Warrior",
          bio: bio || "A legendary warrior",
          life_history: life_history || "History unknown",
          personality: adjectives ? adjectives.split(', ').map(trait => trait.trim()) : ["Brave", "Skilled"],
          knowledge_areas: knowledge_areas ? knowledge_areas.split(', ').map(area => area.trim()) : ["Combat", "Strategy"],
          image: `storage://${imageResult.rootHash}`,
        };

        // Step 3: Upload metadata JSON to 0G Storage
        const metadataBuffer = Buffer.from(JSON.stringify(metadata, null, 2));
        const metadataResult = await zgUpload(metadataBuffer, 'metadata.json');
        console.log("Metadata uploaded to 0G Storage, rootHash:", metadataResult.rootHash);

        return NextResponse.json({
          success: true,
          imageRootHash: imageResult.rootHash,
          imageTransactionHash: imageResult.txHash,
          metadataRootHash: metadataResult.rootHash,
          metadataTransactionHash: metadataResult.txHash,
          metadata,
          size: file.size,
          imageUrl: `/api/storage/download/${imageResult.rootHash}`,
          metadataUrl: `/api/storage/download/${metadataResult.rootHash}`,
          storage: '0g',
        }, { status: 200 });
      } catch (zgError) {
        console.warn("0G Storage upload failed, falling back to Pinata:", zgError instanceof Error ? zgError.message : zgError);
      }
    }

    // === Pinata/IPFS Fallback ===
    if (!PINATA_JWT) {
      throw new Error('No storage configured. Set ZG_PRIVATE_KEY for 0G Storage or PINATA_JWT for IPFS.');
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
      storage: 'ipfs',
    }, { status: 200 });

  } catch (error) {
    return handleAPIError(error, 'API:Files:POST');
  }
}
