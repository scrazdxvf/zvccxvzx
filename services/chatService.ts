
import { Message } from '../types';
import { MESSAGES_COLLECTION } from '../constants';
import { 
  db, 
  collection, 
  addDoc, 
  updateDoc, 
  doc,
  query, 
  where, 
  orderBy, 
  getDocs,
  serverTimestamp,
  Timestamp,
  writeBatch
} from '../../firebaseConfig'; // Adjusted path

// Helper to convert Firestore doc to Message, converting Timestamp to number
const messageFromDoc = (docSnapshot: any): Message => {
  const data = docSnapshot.data();
  return {
    ...data,
    id: docSnapshot.id,
    timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toMillis() : (data.timestamp || Date.now()),
  } as Message;
};

export const chatService = {
  // Use onSnapshot in components for real-time messages. This is for one-time fetch if needed.
  async getMessagesForAd(adId: string, currentUserId: string): Promise<Message[]> {
    if (!currentUserId) return [];
    const q = query(
      collection(db, MESSAGES_COLLECTION),
      where('adId', '==', adId),
      // This OR condition is not directly supported in Firestore queries.
      // We need to fetch messages where currentUserId is sender OR receiver.
      // This usually means two separate queries or filtering client-side if data set is small.
      // For simplicity here, we'll fetch all for adId and filter, but for scale,
      // you might store participants in the message or structure data differently.
      // where(`participants.${currentUserId}`, '==', true) // if using a participants map
      orderBy('timestamp', 'asc')
    );
    const snapshot = await getDocs(q);
    // Filter client-side for simplicity, acknowledging limitations
    return snapshot.docs
        .map(messageFromDoc)
        .filter(msg => msg.senderId === currentUserId || msg.receiverId === currentUserId);
  },

  async sendMessage(adId: string, senderId: string, receiverId: string, text: string): Promise<Message> {
    if (!senderId || !receiverId) {
        throw new Error("Sender and Receiver ID are required to send a message.");
    }
    const newMessageData = {
      adId,
      senderId,
      receiverId,
      text,
      timestamp: serverTimestamp(),
      read: false,
    };
    const docRef = await addDoc(collection(db, MESSAGES_COLLECTION), newMessageData);
    return {
        ...newMessageData,
        id: docRef.id,
        timestamp: Date.now(), // Placeholder, actual is serverTimestamp
    } as Message;
  },

  async markMessagesAsRead(adId: string, readerId: string): Promise<void> {
    if (!readerId) return;
    
    const q = query(
      collection(db, MESSAGES_COLLECTION),
      where('adId', '==', adId),
      where('receiverId', '==', readerId),
      where('read', '==', false)
    );
    
    const snapshot = await getDocs(q);
    if (snapshot.empty) return;

    const batch = writeBatch(db);
    snapshot.docs.forEach(docSnapshot => {
      batch.update(doc(db, MESSAGES_COLLECTION, docSnapshot.id), { read: true });
    });
    
    await batch.commit();
  },

  async getUnreadMessagesCountForUser(userId: string): Promise<number> {
    if (!userId) return 0;
    const q = query(
      collection(db, MESSAGES_COLLECTION),
      where('receiverId', '==', userId),
      where('read', '==', false)
    );
    const snapshot = await getDocs(q); // For count, getCountFromServer could be used if not subscribing
    return snapshot.size;
  },

  // This function would be more complex with Firestore if needing to aggregate
  // For simplicity, it might just fetch all messages involving the user and derive adIds client-side
  // or structure data to make this query easier (e.g., a 'userChats' collection).
  // This is a simplified version.
  async getChatsForUser(userId: string): Promise<string[]> {
    if (!userId) return [];
    
    // Query messages sent by the user
    const sentQuery = query(collection(db, MESSAGES_COLLECTION), where('senderId', '==', userId));
    // Query messages received by the user
    const receivedQuery = query(collection(db, MESSAGES_COLLECTION), where('receiverId', '==', userId));

    const [sentSnapshot, receivedSnapshot] = await Promise.all([
      getDocs(sentQuery),
      getDocs(receivedQuery)
    ]);
    
    const adIds = new Set<string>();
    sentSnapshot.docs.forEach(doc => adIds.add(doc.data().adId));
    receivedSnapshot.docs.forEach(doc => adIds.add(doc.data().adId));
    
    return Array.from(adIds);
  }
};
