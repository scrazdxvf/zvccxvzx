
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useOutletContext, useLocation } from 'react-router-dom';
import ProductForm from '../components/product/ProductForm';
import { listingService } from '../services/listingService';
import { Product, AdStatus, TelegramUser } from '../types';
import Spinner from '../components/ui/Spinner';
import Button from '../components/ui/Button';
import { db, doc, onSnapshot, Timestamp } from '../../firebaseConfig'; // For real-time fetch
import { LISTINGS_COLLECTION } from '../../constants';

interface OutletContextType {
  currentUserId?: string;
  currentUserFull?: TelegramUser | null;
}

const EditListingPage: React.FC = () => {
  const navigate = useNavigate();
  const { id: productId } = useParams<{ id: string }>();
  const { currentUserId } = useOutletContext<OutletContextType>();
  const location = useLocation();
  
  const queryParams = new URLSearchParams(location.search);
  const isAdminEdit = queryParams.get('admin') === 'true';

  const [initialProduct, setInitialProduct] = useState<Product | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) {
      setError("ID объявления не указан.");
      setIsLoading(false);
      return;
    }
    if (!currentUserId && !isAdminEdit) {
        setError("Не удалось определить пользователя. Авторизация не пройдена.");
        setIsLoading(false);
        return;
    }

    setIsLoading(true);
    const docRef = doc(db, LISTINGS_COLLECTION, productId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const productData = docSnap.data();
        const product = {
          ...productData,
          id: docSnap.id,
          createdAt: productData.createdAt instanceof Timestamp ? productData.createdAt.toMillis() : Date.now(),
        } as Product;

        if (isAdminEdit || product.userId === currentUserId) {
          setInitialProduct(product);
        } else {
           setError("У вас нет прав для редактирования этого объявления.");
        }
      } else {
        setError("Объявление не найдено.");
      }
      setIsLoading(false);
    }, (err) => {
      console.error("Failed to fetch product for editing from Firestore:", err);
      setError("Не удалось загрузить объявление для редактирования.");
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [productId, currentUserId, isAdminEdit]);

  const handleSubmit = async (productDataFromForm: Product) => { 
    setIsSubmitting(true);
    setError(null);
    if (!initialProduct || !productId) return;

    try {
      let finalStatus = productDataFromForm.status; 
      
      if (!isAdminEdit) { 
         finalStatus = AdStatus.PENDING; // Non-admins always resubmit to pending
      }
      
      const updatePayload: Partial<Omit<Product, 'id' | 'userId' | 'createdAt'>> = {
        title: productDataFromForm.title,
        description: productDataFromForm.description,
        price: productDataFromForm.price,
        category: productDataFromForm.category,
        subcategory: productDataFromForm.subcategory,
        images: productDataFromForm.images,
        contactInfo: productDataFromForm.contactInfo,
        status: finalStatus, 
        rejectionReason: finalStatus === AdStatus.REJECTED ? productDataFromForm.rejectionReason : (finalStatus === AdStatus.ACTIVE ? undefined : initialProduct.rejectionReason),
      };

      await listingService.updateListing(productId, updatePayload);
      
      if (isAdminEdit) {
        navigate('/admin/manage-listings');
      } else {
        navigate(`/my-listings`); 
      }

    } catch (err) {
      console.error("Failed to update listing:", err);
      setError('Не удалось обновить объявление. Пожалуйста, попробуйте еще раз.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || (!isAdminEdit && !currentUserId && !initialProduct)) return <Spinner fullPage />;
  
  if (error) {
    return (
        <div className="container mx-auto px-2 sm:px-4 py-8 text-center">
            <p className="text-red-500 dark:text-red-400 p-4 mb-4 bg-red-100 dark:bg-red-900 rounded-md">{error}</p>
            <Button onClick={() => navigate(isAdminEdit ? '/admin/manage-listings' : '/my-listings')}>
                {isAdminEdit ? 'К управлению объявлениями' : 'К моим объявлениям'}
            </Button>
        </div>
    );
  }
  
  if (!initialProduct) {
      return (
          <div className="container mx-auto px-2 sm:px-4 py-8 text-center">
              <p className="text-slate-600 dark:text-slate-300 p-8">Объявление не найдено или у вас нет прав на его редактирование.</p>
          </div>
      );
  }


  return (
    <div className="container mx-auto px-2 sm:px-4 py-8">
      <Button onClick={() => navigate(-1)} variant="ghost" size="sm" className="mb-4">
        <i className="fa-solid fa-arrow-left mr-2"></i> Назад
      </Button>
      <ProductForm
        initialProduct={initialProduct}
        onSubmit={handleSubmit as (data: Omit<Product, 'id' | 'createdAt' | 'status'> | Product) => Promise<void>}
        isSubmitting={isSubmitting}
        submitButtonText={isAdminEdit ? "Сохранить (Админ)" : "Сохранить и отправить на проверку"}
      />
      {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
    </div>
  );
};

export default EditListingPage;
