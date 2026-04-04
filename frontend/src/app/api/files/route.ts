import { NextResponse, type NextRequest } from "next/server";
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';
import { upload as zgUpload, isZgConfigured } from '@/services/zgStorageService';

export async function POST(request: NextRequest) {
  try {
    applyRateLimit(request, {
      prefix: 'files-upload',
      maxRequests: 10,
      windowMs: 60000,
    });

    // Require 0G Storage
    if (!isZgConfigured()) {
      throw ErrorResponses.serviceUnavailable('0G Storage not configured. Set ZG_PRIVATE_KEY.');
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

    console.log("Uploading to 0G Storage:", file.name, `(${(file.size / 1024 / 1024).toFixed(2)} MB)`);

    // Step 1: Upload image to 0G Storage
    const imageBuffer = Buffer.from(await file.arrayBuffer());
    const imageResult = await zgUpload(imageBuffer, file.name);
    if (!imageResult.rootHash) {
      throw new Error('0G Storage upload returned empty rootHash for image');
    }
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

  } catch (error) {
    return handleAPIError(error, 'API:Files:POST');
  }
}
