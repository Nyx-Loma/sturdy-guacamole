export interface RecoveryRecord {
  accountId: string;
  rcHash: string;
  params: {
    timeCost: number;
    memoryCost: number;
    parallelism: number;
    version: number;
  };
  updatedAt: Date;
}

export interface RecoveryBlobRecord {
  id: string;
  accountId: string;
  blobVersion: number;
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  associatedData: Uint8Array;
  salt: Uint8Array;
  argonParams: {
    timeCost: number;
    memoryCost: number;
    parallelism: number;
  };
  cipherLength: number;
  padLength: number;
  verifier?: Uint8Array | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}


