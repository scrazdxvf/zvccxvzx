
import { Product, AdStatus } from '../types';
import { CATEGORIES, DEFAULT_PLACEHOLDER_IMAGE, LISTINGS_COLLECTION } from '../constants';
import { 
  db, 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy,
  serverTimestamp,
  Timestamp
} from '../../firebaseConfig'; // Adjusted path

// Helper to convert Firestore doc to Product, converting Timestamp to number
const productFromDoc = (docSnapshot: any): Product => {
  const data = docSnapshot.data();
  return {
    ...data,
    id: docSnapshot.id,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : (data.createdAt || Date.now()),
  } as Product;
};

export const listingService = {
  // Use onSnapshot in components for real-time updates. These are for one-time fetches if needed.
  async getAllListings(): Promise<Product[]> {
    const q = query(collection(db, LISTINGS_COLLECTION), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(productFromDoc);
  },

  async getActiveListings(): Promise<Product[]> {
    const q = query(
      collection(db, LISTINGS_COLLECTION), 
      where('status', '==', AdStatus.ACTIVE),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(productFromDoc);
  },

  async getListingById(id: string): Promise<Product | undefined> {
    const docRef = doc(db, LISTINGS_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return productFromDoc(docSnap);
    }
    return undefined;
  },

  async getListingsByUserId(userId: string): Promise<Product[]> {
     const q = query(
      collection(db, LISTINGS_COLLECTION), 
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(productFromDoc);
  },
  
  async createListing(productData: Omit<Product, 'id' | 'createdAt' | 'status'>): Promise<Product> {
    if (!productData.userId) {
        throw new Error("User ID is required to create a listing.");
    }
    const newProductData = {
      ...productData,
      createdAt: serverTimestamp(),
      status: AdStatus.PENDING,
      images: productData.images.length > 0 ? productData.images : [`${DEFAULT_PLACEHOLDER_IMAGE}${Date.now()}`],
    };
    const docRef = await addDoc(collection(db, LISTINGS_COLLECTION), newProductData);
    // To return the full product with ID and resolved timestamp, we'd ideally fetch it,
    // but for now, we'll optimistically return with a client-side timestamp.
    // A more robust way is to pass back the ID and let the component refetch or use onSnapshot.
    return {
        ...productData,
        id: docRef.id,
        createdAt: Date.now(), // Placeholder, actual is serverTimestamp
        status: AdStatus.PENDING,
    } as Product;
  },

  async updateListing(id: string, updates: Partial<Omit<Product, 'id' | 'userId'>>): Promise<void> {
    const docRef = doc(db, LISTINGS_COLLECTION, id);
    // Prevent userId from being changed with this generic update
    const { userId, createdAt, ...safeUpdates } = updates as any; // createdAt shouldn't be updated like this
    await updateDoc(docRef, safeUpdates);
  },

  async deleteListing(id: string): Promise<void> {
    const docRef = doc(db, LISTINGS_COLLECTION, id);
    await deleteDoc(docRef);
  },

  async getPendingListings(): Promise<Product[]> {
    const q = query(
      collection(db, LISTINGS_COLLECTION), 
      where('status', '==', AdStatus.PENDING),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(productFromDoc);
  },

  async approveListing(id: string): Promise<void> {
    await listingService.updateListing(id, { status: AdStatus.ACTIVE, rejectionReason: undefined });
  },

  async rejectListing(id: string, reason: string): Promise<void> {
    await listingService.updateListing(id, { status: AdStatus.REJECTED, rejectionReason: reason });
  },

  getCategoryName(categoryId: string): string {
    return CATEGORIES.find(c => c.id === categoryId)?.name || categoryId;
  },

  getSubcategoryName(categoryId:string, subcategoryId: string): string {
    const category = CATEGORIES.find(c => c.id === categoryId);
    return category?.subcategories.find(sc => sc.id === subcategoryId)?.name || subcategoryId;
  }
};
