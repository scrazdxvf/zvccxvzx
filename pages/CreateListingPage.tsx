
import React, { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import ProductForm from '../components/product/ProductForm';
import { listingService } from '../services/listingService';
import { Product, TelegramUser } from '../types';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';

interface OutletContextType {
  currentUserId?: string;
  currentUserFull?: TelegramUser | null;
}

const CreateListingPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUserId } = useOutletContext<OutletContextType>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (productFormData: Omit<Product, 'id' | 'createdAt' | 'status'> | Product) => {
    setIsSubmitting(true);
    setError(null);

    if (!currentUserId) {
      setError('Не удалось определить пользователя. Пожалуйста, убедитесь, что вы вошли в систему.');
      setIsSubmitting(false);
      return;
    }

    try {
      const dataToSubmit = { 
        ...(productFormData as Omit<Product, 'id' | 'createdAt' | 'status'>),
        userId: currentUserId 
      };
      
      await listingService.createListing(dataToSubmit);
      // After successful creation, Firestore's onSnapshot on MyListingsPage should pick up the new ad.
      // Or redirect to product page if desired.
      navigate(`/my-listings`); 
    } catch (err) {
      console.error("Failed to create listing:", err);
      setError(err instanceof Error ? err.message : 'Не удалось создать объявление. Пожалуйста, попробуйте еще раз.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (!currentUserId && !error) {
    // Rely on App.tsx's main loader or error display
    return <Spinner fullPage/>; // Or more specific message
  }


  return (
    <div className="container mx-auto px-2 sm:px-4 py-8">
       <Button onClick={() => navigate(-1)} variant="ghost" size="sm" className="mb-4">
        <i className="fa-solid fa-arrow-left mr-2"></i> Назад
      </Button>
      {!currentUserId && error && ( // This case might be less likely if App.tsx handles global user error
         <div className="text-center text-red-500 dark:text-red-400 p-4 mb-4 bg-red-100 dark:bg-red-900 rounded-md">
          {error} <br/> Пожалуйста, убедитесь, что приложение открыто в Telegram и попробуйте перезагрузить.
        </div>
      )}
      {currentUserId ? (
        <ProductForm 
          onSubmit={handleSubmit} 
          isSubmitting={isSubmitting} 
          submitButtonText="Разместить и отправить на проверку"
        />
      ) : (
        <div className="text-center text-slate-600 dark:text-slate-300 p-8">
            <p>Для создания объявления необходимо авторизоваться через Telegram.</p>
        </div>
      )}
      {error && currentUserId && <p className="text-red-500 mt-4 text-center">{error}</p>}
    </div>
  );
};

export default CreateListingPage;
