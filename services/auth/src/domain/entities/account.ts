export type AccountStatus = 'active' | 'suspended' | 'deleted';

export interface Account {
  id: string;
  status: AccountStatus;
  createdAt: Date;
}


