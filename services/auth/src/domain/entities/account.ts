export interface Account {
  id: string;
  status: 'active' | 'suspended' | 'deleted';
  createdAt: Date;
}


