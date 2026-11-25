import type { Interest, InterestProps } from '../../domain';

export type InterestView = Omit<InterestProps, 'createdAt'> & {
  readonly createdAt: string;
  readonly status: 'active' | 'archived';
};

export const presentInterest = (interest: Interest): InterestView => {
  const snapshot = interest.toSnapshot();

  return {
    ...snapshot,
    createdAt: snapshot.createdAt.toISOString(),
    status: 'active',
  };
};

export const presentArchivedInterest = (interest: Interest): InterestView => ({
  ...presentInterest(interest),
  status: 'archived',
});
