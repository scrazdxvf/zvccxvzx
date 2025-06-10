
import React, { useState, useEffect, useCallback, FormEvent } from 'react';
import { useParams, useNavigate, Link, useLocation, useOutletContext } from 'react-router-dom';
import { Product, Message, TelegramUser } from '../types';
import { listingService } from '../services/listingService'; // For category names
import { chatService } from '../services/chatService'; // For sending messages
import Spinner from '../components/ui/Spinner';
import { CURRENCY_SYMBOL, DEFAULT_PLACEHOLDER_IMAGE, LISTINGS_COLLECTION, MESSAGES_COLLECTION } from '../constants';
import Button from '../components/ui/Button';
import Textarea from '../components/ui/Textarea';
import Input from '../components/ui/Input';
import { db, doc, onSnapshot, collection, query, where, orderBy, Timestamp } from '../../firebaseConfig';

interface OutletContextType {
  currentUserId?: string;
  currentUserFull?: TelegramUser | null;
}

const ProductPage: React.FC = () => {
  const { id: productId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUserId } = useOutletContext<OutletContextType>();

  const [product, setProduct] = useState<Product | null>(null);
  const [isLoadingProduct, setIsLoadingProduct] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false); // Can be true even if product loaded
  const [newMessageText, setNewMessageText] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    if (queryParams.get('openChat') === 'true' && currentUserId) {
      setShowChat(true);
    }
  }, [location.search, currentUserId]);

  // Fetch Product Details
  useEffect(() => {
    if (!productId) {
      setError("ID товара не найден.");
      setIsLoadingProduct(false);
      return;
    }
    setIsLoadingProduct(true);
    setError(null);

    const unsubProduct = onSnapshot(doc(db, LISTINGS_COLLECTION, productId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setProduct({
          ...data,
          id: docSnap.id,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Date.now(),
        } as Product);
      } else {
        setError("Товар не найден.");
        setProduct(null);
      }
      setIsLoadingProduct(false);
    }, (err) => {
      console.error("Error fetching product details from Firestore:", err);
      setError("Не удалось загрузить информацию о товаре.");
      setIsLoadingProduct(false);
    });

    return () => unsubProduct();
  }, [productId]);

  // Fetch Chat Messages when showChat and product are ready
  useEffect(() => {
    if (!showChat || !productId || !currentUserId || !product || product.userId === currentUserId) {
      setMessages([]); // Clear messages if chat shouldn't be shown or it's own ad
      return;
    }

    setIsLoadingMessages(true);
    const q = query(
      collection(db, MESSAGES_COLLECTION),
      where('adId', '==', productId),
      // To get messages between current user and product owner:
      // This requires two separate where clauses with an OR, which Firestore doesn't support directly in one query.
      // A common approach is to have a 'participants' array field in each message document:
      // where('participants', 'array-contains', currentUserId)
      // And then filter for the specific product owner.
      // For now, let's assume we can filter based on sender/receiver matching currentUserId and product.userId
      orderBy('timestamp', 'asc')
    );

    const unsubMessages = onSnapshot(q, (querySnapshot) => {
      const chatMessages: Message[] = [];
      let unreadFound = false;
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        // Ensure message is between current user and product owner
        if ((data.senderId === currentUserId && data.receiverId === product.userId) ||
            (data.senderId === product.userId && data.receiverId === currentUserId)) {
          chatMessages.push({
            ...data,
            id: docSnap.id,
            timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toMillis() : Date.now(),
          } as Message);
          if (data.receiverId === currentUserId && !data.read) {
            unreadFound = true;
          }
        }
      });
      setMessages(chatMessages);
      if (unreadFound) {
        chatService.markMessagesAsRead(productId, currentUserId); // Mark as read
      }
      setIsLoadingMessages(false);
    }, (err) => {
      console.error("Error fetching messages from Firestore:", err);
      setIsLoadingMessages(false);
    });

    return () => unsubMessages();
  }, [showChat, productId, currentUserId, product]);


  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!newMessageText.trim() || !product || !currentUserId || product.userId === currentUserId) return;
    setIsSendingMessage(true);
    try {
      await chatService.sendMessage(product.id, currentUserId, product.userId, newMessageText.trim());
      setNewMessageText('');
      // No need to manually refetch messages, onSnapshot will handle it.
    } catch (err) {
      console.error("Failed to send message:", err);
      // Optionally set an error state to display to user
    } finally {
      setIsSendingMessage(false);
    }
  };


  if (isLoadingProduct) return <Spinner fullPage />;
  if (error) return <div className="text-center text-red-500 dark:text-red-400 p-8">{error} <Button onClick={() => navigate('/')}>На главную</Button></div>;
  if (!product) return <div className="text-center text-slate-600 dark:text-slate-300 p-8">Товар не найден. <Button onClick={() => navigate('/')}>На главную</Button></div>;

  const images = product.images && product.images.length > 0 ? product.images : [`${DEFAULT_PLACEHOLDER_IMAGE}${product.id}`];
  const isOwnAd = currentUserId && product.userId === currentUserId;

  return (
    <div className="container mx-auto px-2 sm:px-4 py-8">
      <Button onClick={() => navigate(-1)} variant="ghost" size="sm" className="mb-4">
        <i className="fa-solid fa-arrow-left mr-2"></i> Назад
      </Button>
      <div className="bg-light-primary dark:bg-dark-primary shadow-xl rounded-lg overflow-hidden">
        <div className="md:flex">
          {/* Image Gallery */}
          <div className="md:w-1/2 p-4">
            <div className="relative aspect-w-4 aspect-h-3 mb-2">
              <img 
                src={images[currentImageIndex]} 
                alt={product.title} 
                className="w-full h-full object-contain rounded-lg max-h-[500px]"
                onError={(e) => { (e.target as HTMLImageElement).src = `${DEFAULT_PLACEHOLDER_IMAGE}${product.id}`; }}
              />
            </div>
            {images.length > 1 && (
              <div className="flex space-x-2 overflow-x-auto p-1">
                {images.map((img, index) => (
                  <img
                    key={index}
                    src={img}
                    alt={`${product.title} - ${index + 1}`}
                    className={`w-20 h-20 object-cover rounded cursor-pointer border-2 ${index === currentImageIndex ? 'border-sky-500 dark:border-dark-accent' : 'border-transparent hover:border-slate-300 dark:hover:border-slate-600'}`}
                    onClick={() => setCurrentImageIndex(index)}
                    onError={(e) => { (e.target as HTMLImageElement).src = `${DEFAULT_PLACEHOLDER_IMAGE}${product.id}${index}`; }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="md:w-1/2 p-6 flex flex-col">
            <h1 className="text-3xl font-bold text-light-text-primary dark:text-dark-text-primary mb-2">{product.title}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {listingService.getCategoryName(product.category)} &raquo; {listingService.getSubcategoryName(product.category, product.subcategory)}
            </p>
            <p className="text-3xl font-extrabold text-sky-600 dark:text-dark-accent mb-6">
              {product.price.toLocaleString('uk-UA')} {CURRENCY_SYMBOL}
            </p>
            
            <div className="mb-6">
                <h2 className="text-xl font-semibold text-light-text-primary dark:text-dark-text-primary mb-2">Описание</h2>
                <p className="text-slate-700 dark:text-dark-text-secondary whitespace-pre-wrap leading-relaxed">{product.description}</p>
            </div>

            <div className="mt-auto">
              <Input
                label="Контакт продавца"
                value={product.contactInfo || 'Не указано'}
                readOnly
                wrapperClassName="mb-4"
                className="bg-slate-100 dark:bg-slate-700 cursor-default"
              />
              {currentUserId ? ( 
                isOwnAd ? (
                  <Button onClick={() => navigate(`/edit-listing/${product.id}`)} variant="secondary" className="w-full" leftIcon={<i className="fa-solid fa-edit"/>}>
                      Редактировать объявление
                    </Button>
                ) : (
                  <Button onClick={() => setShowChat(s => !s)} variant="primary" className="w-full" leftIcon={<i className="fa-solid fa-comments"/>}>
                    {showChat ? 'Скрыть чат' : 'Написать продавцу'}
                  </Button>
                )
              ) : (
                 <p className="text-sm text-center text-slate-500 dark:text-slate-400">Войдите, чтобы связаться с продавцом.</p>
              )}
            </div>
          </div>
        </div>
        
        {currentUserId && !isOwnAd && showChat && (
          <div className="border-t border-slate-200 dark:border-slate-700 p-4 sm:p-6">
            <h2 className="text-xl font-semibold text-light-text-primary dark:text-dark-text-primary mb-4">Чат с продавцом</h2>
             {isLoadingMessages && <div className="flex justify-center my-2"><Spinner size="sm"/></div>}
            {!isLoadingMessages && messages.length === 0 && <p className="text-center text-sm text-slate-500 dark:text-slate-400">Сообщений пока нет. Начните диалог первым!</p>}
            {!isLoadingMessages && messages.length > 0 && (
                <div className="max-h-96 overflow-y-auto mb-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg space-y-3">
                {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.senderId === currentUserId ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-xl ${msg.senderId === currentUserId ? 'bg-sky-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-light-text-primary dark:text-dark-text-primary'}`}>
                        <p className="text-sm">{msg.text}</p>
                        <p className={`text-xs mt-1 ${msg.senderId === currentUserId ? 'text-sky-200 text-right' : 'text-slate-500 dark:text-slate-400 text-left'}`}>
                        {new Date(msg.timestamp).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                    </div>
                    </div>
                ))}
                </div>
            )}
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <Textarea
                value={newMessageText}
                onChange={(e) => setNewMessageText(e.target.value)}
                placeholder="Ваше сообщение..."
                rows={2}
                className="flex-grow"
                wrapperClassName="mb-0 flex-grow"
                required
              />
              <Button type="submit" isLoading={isSendingMessage} disabled={!newMessageText.trim()} className="self-end h-full">
                <i className="fa-solid fa-paper-plane"></i>
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductPage;
