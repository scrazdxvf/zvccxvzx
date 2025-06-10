
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { listingService } from '../../services/listingService';
import { Product, AdStatus } from '../../types';
import Spinner from '../../components/ui/Spinner';
import { LISTINGS_COLLECTION } from '../../constants';
import { db, collection, query, where, orderBy, onSnapshot, getCountFromServer, Timestamp, limit } from '../../../firebaseConfig';


interface Stats {
  totalActive: number;
  totalPending: number;
  totalRejected: number;
  totalListings: number;
}


const AdminDashboardPage: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [recentPending, setRecentPending] = useState<Product[]>([]);

  // Fetch listing counts
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const listingsColRef = collection(db, LISTINGS_COLLECTION);
        
        const activeQuery = query(listingsColRef, where('status', '==', AdStatus.ACTIVE));
        const pendingQuery = query(listingsColRef, where('status', '==', AdStatus.PENDING));
        const rejectedQuery = query(listingsColRef, where('status', '==', AdStatus.REJECTED));
        
        const [
          activeSnapshot, 
          pendingSnapshot, 
          rejectedSnapshot,
          totalSnapshot
        ] = await Promise.all([
          getCountFromServer(activeQuery),
          getCountFromServer(pendingQuery),
          getCountFromServer(rejectedQuery),
          getCountFromServer(listingsColRef) // Total listings
        ]);

        setStats({
          totalActive: activeSnapshot.data().count,
          totalPending: pendingSnapshot.data().count,
          totalRejected: rejectedSnapshot.data().count,
          totalListings: totalSnapshot.data().count,
        });
      } catch (error) {
        console.error("Error fetching admin dashboard counts from Firestore:", error);
      }
    };
    fetchCounts(); // Initial fetch
    
    // Optional: Setup onSnapshot listeners if you want these counts to be real-time (more reads)
    // For counts, periodic refetch or manual refresh might be more cost-effective than onSnapshot on entire collections.
    
  }, []);

  // Fetch recent pending listings
  useEffect(() => {
    setIsLoading(true); // Can set loading for this part specifically
    const q = query(
      collection(db, LISTINGS_COLLECTION),
      where('status', '==', AdStatus.PENDING),
      orderBy('createdAt', 'desc'),
      limit(5)
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const pending: Product[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        pending.push({
          ...data,
          id: doc.id,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Date.now(),
        } as Product);
      });
      setRecentPending(pending);
      setIsLoading(false); // Consider separate loading state if counts and list load at very different times
    }, (error) => {
      console.error("Error fetching recent pending listings:", error);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);


  if (isLoading || !stats) return <Spinner fullPage />;

  const StatCard: React.FC<{ title: string; value: number | string; icon: string; color: string; linkTo?: string; tooltip?: string }> = 
    ({ title, value, icon, color, linkTo, tooltip }) => (
    <div 
        className={`bg-light-primary dark:bg-dark-secondary p-6 rounded-xl shadow-lg hover:shadow-xl transition-shadow ${linkTo ? 'cursor-pointer' : ''}`}
        title={tooltip}
    >
      {linkTo ? (
        <Link to={linkTo} className="block">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{title}</p>
              <p className="text-3xl font-bold text-light-text-primary dark:text-dark-text-primary">{value}</p>
            </div>
            <div className={`p-3 rounded-full ${color.replace('text-', 'bg-')} bg-opacity-20`}>
              <i className={`${icon} ${color} text-2xl`}></i>
            </div>
          </div>
        </Link>
      ) : (
         <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{title}</p>
            <p className="text-3xl font-bold text-light-text-primary dark:text-dark-text-primary">{value}</p>
          </div>
          <div className={`p-3 rounded-full ${color.replace('text-', 'bg-')} bg-opacity-20`}>
            <i className={`${icon} ${color} text-2xl`}></i>
          </div>
        </div>
      )}
    </div>
  );


  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-light-text-primary dark:text-dark-text-primary mb-8">Панель Администратора</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6 mb-8"> {/* Adjusted grid for fewer cards */}
        <StatCard title="Активные объявления" value={stats.totalActive} icon="fa-solid fa-check-circle" color="text-green-500" linkTo="/admin/manage-listings?status=active" />
        <StatCard title="На модерации" value={stats.totalPending} icon="fa-solid fa-clock" color="text-yellow-500" linkTo="/admin/moderation" />
        <StatCard title="Всего объявлений" value={stats.totalListings} icon="fa-solid fa-list-alt" color="text-sky-500 dark:text-dark-accent" linkTo="/admin/manage-listings" />
        {/* Removed localStorage-based stats:
        <StatCard title="Уникальных посетителей" value={stats.totalUniqueVisitors} icon="fa-solid fa-users" color="text-purple-500" tooltip="Всего уникальных пользователей, открывавших приложение."/>
        <StatCard title="Сейчас онлайн" value={stats.usersOnline} icon="fa-solid fa-wifi" color="text-teal-500" tooltip={`Пользователи, активные за последние ${USER_ONLINE_THRESHOLD_MS / 60000} мин.`}/>
        */}
        <StatCard title="Отклоненные" value={stats.totalRejected} icon="fa-solid fa-times-circle" color="text-red-500" linkTo="/admin/manage-listings?status=rejected" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-light-primary dark:bg-dark-secondary p-6 rounded-xl shadow-lg">
          <h2 className="text-xl font-semibold text-light-text-primary dark:text-dark-text-primary mb-4">Недавние объявления на модерацию</h2>
          {recentPending.length > 0 ? (
            <ul className="space-y-3">
              {recentPending.map(p => (
                <li key={p.id} className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-700 rounded-md hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors">
                  <div>
                    <Link to={`/product/${p.id}`} target="_blank" className="font-medium text-sky-600 dark:text-dark-accent hover:underline">{p.title}</Link>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {new Date(p.createdAt).toLocaleString('uk-UA')} - {p.price} ₴
                    </p>
                  </div>
                  <Link to={`/admin/moderation#listing-${p.id}`}>
                    <span className="text-xs font-semibold px-2 py-1 bg-yellow-400 text-yellow-800 rounded-full">Проверить</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-500 dark:text-slate-400">Нет объявлений, ожидающих модерации.</p>
          )}
          {stats.totalPending > 0 && 
            <Link to="/admin/moderation" className="mt-4 inline-block text-sm text-sky-600 dark:text-dark-accent hover:underline font-medium">
              Смотреть все ({stats.totalPending}) <i className="fa-solid fa-arrow-right ml-1"></i>
            </Link>
          }
        </div>

        <div className="bg-light-primary dark:bg-dark-secondary p-6 rounded-xl shadow-lg">
           <h2 className="text-xl font-semibold text-light-text-primary dark:text-dark-text-primary mb-4">Быстрые действия</h2>
            <div className="space-y-3">
                 <Link to="/admin/moderation" className="flex items-center p-3 bg-slate-50 dark:bg-slate-700 rounded-md hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors">
                    <i className="fa-solid fa-gavel text-xl text-sky-500 dark:text-dark-accent mr-3"></i>
                    <span>Перейти к модерации объявлений</span>
                </Link>
                 <Link to="/admin/manage-listings" className="flex items-center p-3 bg-slate-50 dark:bg-slate-700 rounded-md hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors">
                    <i className="fa-solid fa-folder-open text-xl text-sky-500 dark:text-dark-accent mr-3"></i>
                    <span>Управление всеми объявлениями</span>
                </Link>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboardPage;
