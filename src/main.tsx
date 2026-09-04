import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import './index.css';

// גרסה חדשה שמתפרסמת בענן לא תיכנס למכשיר עד שנבדוק ונכריח עדכון -
// בדיקה מיידית + בכל חזרה למסך האפליקציה, כדי שעדכונים יגיעו למכשיר תוך שניות ולא יתקעו על גרסה ישנה.
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    const checkForUpdate = () => registration.update().catch(() => {});
    // בדיקה מיידית עם הטעינה, ואז כל 20 דקות, ובכל פעם שהאפליקציה חוזרת לחזית -
    // באייפון קוד לא רץ ברקע כשהאפליקציה סגורה/ממוזערת, אז הרגע שהיא נפתחת מחדש
    // (visibilitychange/pageshow/focus) הוא ההזדמנות האמינה ביותר לתפוס עדכון.
    checkForUpdate();
    setInterval(checkForUpdate, 20 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    });
    window.addEventListener('pageshow', checkForUpdate);
    window.addEventListener('focus', checkForUpdate);
  },
  onNeedRefresh() {
    updateSW(true);
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
