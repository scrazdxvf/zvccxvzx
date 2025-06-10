

export enum Theme {
  LIGHT = 'light',
  DARK = 'dark',
}

export interface Category {
  id: string;
  name: string;
  subcategories: Subcategory[];
  icon: string; // Font Awesome class
}

export interface Subcategory {
  id: string;
  name: string;
  icon?: string;
}

export enum AdStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  REJECTED = 'rejected',
}

export interface Product {
  id: string; 
  title: string;
  description: string;
  price: number;
  category: string; // Main category ID
  subcategory: string; // Subcategory ID
  images: string[]; // URLs or base64 strings
  userId: string; // Actual Telegram User ID
  status: AdStatus;
  rejectionReason?: string;
  createdAt: number; // Timestamp (milliseconds since epoch) - will be converted from Firestore Timestamp
  contactInfo?: string; // e.g., Telegram username
}


export interface Message {
  id: string; 
  adId: string;
  senderId: string; // Actual Telegram User ID
  receiverId: string; // Actual Telegram User ID
  text: string;
  timestamp: number; // Timestamp (milliseconds since epoch) - will be converted from Firestore Timestamp
  read: boolean;
}

export interface User { // This is a generic User, could be used for seller profiles if extended
  id: string;
  username: string; // e.g. telegram username
  // other user details if needed
}

export interface TelegramUser {
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  isPremium?: boolean;
  languageCode?: string;
}
