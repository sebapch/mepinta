export interface Profile {
  id: string;
  full_name: string;
  avatar_url: string;
  username: string;
}

export interface Availability {
  id: string;
  user_id: string;
  day: string;
  moments: string[];
}

export const MOCK_USER: Profile = {
  id: 'me',
  full_name: 'Usuario',
  avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=User',
  username: 'usuario',
};

// All mock data removed as per user request
export const MOCK_FRIENDS: Profile[] = [];
export const MOCK_AVAILABILITY: Availability[] = [];
export interface Group {
  id: string;
  name: string;
  image_url: string;
  invite_link: string;
  members_count: number;
}
export const MOCK_GROUPS: Group[] = [];
