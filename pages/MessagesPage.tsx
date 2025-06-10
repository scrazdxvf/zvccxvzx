
import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { chatService } from '../services/chatService';
import { listingService } from '../services/listingService'; // For ad details
import { Product, Message, TelegramUser } from '../types';
import Spinner from '../components/ui/Spinner';
import { DEFAULT_PLACEHOLDER_IMAGE, LISTINGS_COLLECTION, MESSAGES_COLLECTION } from '../constants';
import { db, collection, query, where, orderBy, onSnapshot, getDoc, doc, Timestamp, getDocs, limit } from '../../firebaseConfig';


interface ChatPreview {
  adId: string;
  adTitle: string;
  adImage: string;
  lastMessageText: string;
  lastMessageTimestamp: number | null;
  lastMessageSenderId?: string;
  unreadCount: number;
  otherParticipantId?: string; // For unread count updates
}

interface OutletContextType {
  currentUserId?: string;
  currentUserFull?: TelegramUser | null;
}

const MessagesPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUserId } = useOutletContext<OutletContextType>();

  const [chatPreviews, setChatPreviews] = useState<ChatPreview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // This effect will fetch all involved ad IDs and then details for each
  // This can be quite heavy. For a production app, denormalizing some data
  // into a 'userChats' collection would be more efficient.
  useEffect(() => {
    if (!currentUserId) {
      setIsLoading(false);
      setChatPreviews([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    // 1. Get all unique ad IDs the user has chatted about
    const messagesRef = collection(db, MESSAGES_COLLECTION);
    const sentQuery = query(messagesRef, where('senderId', '==', currentUserId));
    const receivedQuery = query(messagesRef, where('receiverId', '==', currentUserId));

    Promise.all([getDocs(sentQuery), getDocs(receivedQuery)])
      .then(async ([sentSnapshot, receivedSnapshot]) => {
        const adIds = new Set<string>();
        const allUserMessagesMap = new Map<string, Message[]>();

        const processSnapshot = (snapshot: any) => {
          snapshot.forEach((docSnap: any) => {
            const msg = { 
              ...docSnap.data(), 
              id: docSnap.id,
              timestamp: docSnap.data().timestamp instanceof Timestamp ? docSnap.data().timestamp.toMillis() : Date.now()
            } as Message;
            adIds.add(msg.adId);
            const adMessages = allUserMessagesMap.get(msg.adId) || [];
            adMessages.push(msg);
            allUserMessagesMap.set(msg.adId, adMessages);
          });
        };

        processSnapshot(sentSnapshot);
        processSnapshot(receivedSnapshot);

        if (adIds.size === 0) {
          setChatPreviews([]);
          setIsLoading(false);
          return;
        }

        // 2. For each ad ID, fetch ad details and construct preview
        const previewsPromises = Array.from(adIds).map(async (adId) => {
          try {
            const adDocRef = doc(db, LISTINGS_COLLECTION, adId);
            const adSnap = await getDoc(adDocRef);
            
            if (!adSnap.exists()) return null; // Ad might have been deleted

            const adDetails = { 
                ...adSnap.data(), 
                id: adSnap.id,
                 createdAt: adSnap.data().createdAt instanceof Timestamp ? adSnap.data().createdAt.toMillis() : Date.now()
            } as Product;

            const messagesForAd = (allUserMessagesMap.get(adId) || [])
                                .filter(m => (m.senderId === currentUserId && m.receiverId === adDetails.userId) || (m.senderId === adDetails.userId && m.receiverId === currentUserId))
                                .sort((a,b) => a.timestamp - b.timestamp);


            const lastMessage = messagesForAd.length > 0 ? messagesForAd[messagesForAd.length - 1] : null;
            const unreadCount = messagesForAd.filter(msg => msg.receiverId === currentUserId && !msg.read).length;
            const otherParticipantId = lastMessage ? (lastMessage.senderId === currentUserId ? lastMessage.receiverId : lastMessage.senderId) : undefined;


            return {
              adId,
              adTitle: adDetails.title,
              adImage: adDetails.images?.[0] || `${DEFAULT_PLACEHOLDER_IMAGE}${adId}`,
              lastMessageText: lastMessage ? lastMessage.text : 'Нет сообщений',
              lastMessageTimestamp: lastMessage ? lastMessage.timestamp : null,
              lastMessageSenderId: lastMessage?.senderId,
              unreadCount,
              otherParticipantId
            };
          } catch(e) {
            console.error(`Error processing ad ${adId}:`, e);
            return null;
          }
        });

        const resolvedPreviews = (await Promise.all(previewsPromises))
          .filter(p => p !== null) as ChatPreview[];
        
        resolvedPreviews.sort((a, b) => {
            if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
            if (b.unreadCount > 0 && a.unreadCount === 0) return 1;
            if (a.lastMessageTimestamp && b.lastMessageTimestamp) return b.lastMessageTimestamp - a.lastMessageTimestamp;
            if (a.lastMessageTimestamp) return -1;
            if (b.lastMessageTimestamp) return 1;
            return 0;
        });
        
        setChatPreviews(resolvedPreviews);

      })
      .catch(err => {
        console.error("Failed to fetch chat previews:", err);
        setError("Не удалось загрузить ваши чаты.");
      })
      .finally(() => {
        setIsLoading(false);
      });

  }, [currentUserId]);

  // Real-time listener for unread counts (more targeted)
  useEffect(() => {
    if (!currentUserId || chatPreviews.length === 0) return;

    const unsubscribers = chatPreviews.map(preview => {
      if (!preview.otherParticipantId) return () => {}; // No other participant identified

      const q = query(
        collection(db, MESSAGES_COLLECTION),
        where('adId', '==', preview.adId),
        where('receiverId', '==', currentUserId),
        where('senderId', '==', preview.otherParticipantId), // Messages from the other person
        where('read', '==', false)
      );
      return onSnapshot(q, (snapshot) => {
        setChatPreviews(prev => prev.map(p => 
          p.adId === preview.adId ? { ...p, unreadCount: snapshot.size } : p
        ).sort((a, b) => { // Re-sort after update
            if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
            if (b.unreadCount > 0 && a.unreadCount === 0) return 1;
            if (a.lastMessageTimestamp && b.lastMessageTimestamp) return b.lastMessageTimestamp - a.lastMessageTimestamp;
            return 0;
        }));
      });
    });
    return () => unsubscribers.forEach(unsub => unsub());
  }, [currentUserId, chatPreviews]);


  if (!currentUserId && !isLoading) {
     return (
      <div className="container mx-auto px-2 sm:px-4 py-8 text-center">
        <p className="text-xl text-slate-600 dark:text-slate-300">
          Пожалуйста, убедитесь, что вы вошли в систему через Telegram, чтобы просмотреть свои сообщения.
        </p>
      </div>
    );
  }

  if (isLoading) return <Spinner fullPage />;
  if (error && !isLoading) return <div className="text-center text-red-500 dark:text-red-400 p-8">{error}</div>;

  return (
    <div className="container mx-auto px-2 sm:px-4 py-8">
      <h1 className="text-3xl font-bold text-light-text-primary dark:text-dark-text-primary mb-6">Мои сообщения</h1>
      
      {chatPreviews.length === 0 ? (
        <div className="text-center py-12">
          <i className="fa-solid fa-comments-dollar text-6xl text-slate-400 dark:text-slate-500 mb-4"></i>
          <p className="text-xl text-slate-600 dark:text-slate-300">У вас пока нет активных чатов.</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Начните общение, написав продавцу интересующего вас товара.</p>
        </div>
      ) : (
          <div className="space-y-4">
            {chatPreviews.map(preview => (
              <Link 
                key={preview.adId} 
                to={`/product/${preview.adId}?openChat=true`}
                className="block bg-light-secondary dark:bg-dark-secondary p-4 rounded-lg shadow hover:shadow-md transition-shadow"
              >
                <div className="flex items-center space-x-4">
                  <img 
                    src={preview.adImage} 
                    alt={preview.adTitle} 
                    className="w-16 h-16 object-cover rounded-md flex-shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).src = `${DEFAULT_PLACEHOLDER_IMAGE}${preview.adId}`; }}
                  />
                  <div className="flex-grow overflow-hidden">
                    <h3 className="font-semibold text-light-text-primary dark:text-dark-text-primary truncate">{preview.adTitle}</h3>
                    <p className={`text-sm truncate ${preview.unreadCount > 0 ? 'font-bold text-sky-600 dark:text-dark-accent' : 'text-slate-500 dark:text-slate-400'}`}>
                      {preview.lastMessageSenderId === currentUserId ? "Вы: " : ""}
                      {preview.lastMessageText}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    {preview.lastMessageTimestamp && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">
                        {new Date(preview.lastMessageTimestamp).toLocaleDateString('uk-UA', { day:'numeric', month:'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                    {preview.unreadCount > 0 && (
                      <span className="px-2 py-1 bg-red-500 text-white text-xs font-bold rounded-full">
                        {preview.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
      )}
    </div>
  );
};

export default MessagesPage;
