export interface WarriorsFormData {
  name: string;
  bio: string;
  life_history: string;
  adjectives: string;
  knowledge_areas: string;
  image: File;
}

export interface WarriorsUploadResult {
  imageRootHash: string;
  imageTransactionHash: string;
  metadataRootHash: string;
  metadataTransactionHash: string;
  metadata: any;
  size: number;
  // Legacy compatibility fields
  imageCid: string;
  metadataCid: string;
  imageUrl: string;
  metadataUrl: string;
}

export class IPFSService {
  // Upload Warriors NFT data to 0G Storage
  async uploadWarriorsNFT(formData: WarriorsFormData): Promise<WarriorsUploadResult> {
    // Validate file before upload
    const validation = IPFSService.validateImageFile(formData.image);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    try {
      // Create FormData and send to our API route
      const uploadFormData = new FormData();
      uploadFormData.append('file', formData.image);
      uploadFormData.append('name', formData.name);
      uploadFormData.append('bio', formData.bio);
      uploadFormData.append('life_history', formData.life_history);
      uploadFormData.append('adjectives', formData.adjectives);
      uploadFormData.append('knowledge_areas', formData.knowledge_areas);

      const response = await fetch('/api/files', {
        method: 'POST',
        body: uploadFormData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Upload failed: ${errorData.error || response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error('Upload failed: ' + (result.error || 'Unknown error'));
      }

      console.log('🎯 === WARRIORS NFT UPLOAD SUCCESS ===');
      console.log('📷 Image Root Hash:', result.imageRootHash);
      console.log('📋 Metadata Root Hash:', result.metadataRootHash);
      console.log('🔗 Image Transaction Hash:', result.imageTransactionHash);
      console.log('🔗 Metadata Transaction Hash:', result.metadataTransactionHash);
      console.log('📄 Generated Metadata:', result.metadata);
      console.log('================================');

      return {
        imageRootHash: result.imageRootHash,
        imageTransactionHash: result.imageTransactionHash,
        metadataRootHash: result.metadataRootHash,
        metadataTransactionHash: result.metadataTransactionHash,
        metadata: result.metadata,
        size: result.size,
        // Legacy compatibility fields
        imageCid: result.imageRootHash, // Using root hash as CID for backward compatibility
        metadataCid: result.metadataRootHash, // Using root hash as CID for backward compatibility
        imageUrl: result.imageUrl,
        metadataUrl: result.metadataUrl
      };

    } catch (error) {
      console.error('❌ Error uploading Warriors NFT to 0G Storage:', error);
      throw new Error(`0G Storage upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Legacy method for backward compatibility
  async uploadImageToPinata(file: File): Promise<{ cid: string; url: string; size: number }> {
    const formData: WarriorsFormData = {
      name: "Legacy Upload",
      bio: "Image uploaded without metadata",
      life_history: "N/A",
      adjectives: "N/A", 
      knowledge_areas: "N/A",
      image: file
    };
    
    const result = await this.uploadWarriorsNFT(formData);
    return {
      cid: result.imageRootHash, // Using root hash as CID
      url: result.imageUrl,
      size: result.size
    };
  }

  // Helper method to get 0G Storage URL from root hash
  static get0GStorageUrl(rootHash: string): string {
    return `0g://${rootHash}`;
  }

  // Helper method to validate image file
  static validateImageFile(file: File): { valid: boolean; error?: string } {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

    if (!allowedTypes.includes(file.type)) {
      return {
        valid: false,
        error: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`
      };
    }

    if (file.size > maxSize) {
      return {
        valid: false,
        error: `File size too large. Maximum size: ${maxSize / 1024 / 1024}MB`
      };
    }

    return { valid: true };
  }
}

export const ipfsService = new IPFSService();
