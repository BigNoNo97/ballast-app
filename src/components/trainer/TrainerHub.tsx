import React, { useEffect, useState } from 'react';
import { ClipboardList, KeyRound, Loader2, UserCheck } from 'lucide-react';
import type { Exercise, RoutineTemplate } from '../../types';
import { getMyTrainerProfile, getMyTrainerRelation, TrainerProfile, TrainerRelation } from '../../services/trainer';
import { BecomeTrainerScreen, ClientDetailScreen, TrainerDashboard } from './CoachViews';
import { requestPushPermission } from '../../services/push';
import { JoinTrainerScreen, MyTrainerScreen } from './TraineeViews';
import { Card, ErrorNote, Muted, RowButton, Screen, SectionTitle } from './trainerUi';

type Route =
  | { name: 'home' }
  | { name: 'join' }
  | { name: 'myTrainer' }
  | { name: 'become' }
  | { name: 'editProfile' }
  | { name: 'dashboard' }
  | { name: 'client'; relation: TrainerRelation };

export interface TrainerInbox {
  /** הודעות שלא נקראו לפי שיחה: `${trainer_id}:${client_id}` */
  unreadByThread: Map<string, number>;
  refresh: () => void;
}

/** "מאמנים": כניסה אחת לשני הצדדים - המאמן שלי (מתאמן) ולוח המאמן (מאמן). */
export const TrainerHub: React.FC<{
  meId: string;
  defaultName: string;
  allExercises: Exercise[];
  myRoutines: RoutineTemplate[];
  inbox: TrainerInbox;
  onClose: () => void;
}> = ({ meId, defaultName, allExercises, myRoutines, inbox, onClose }) => {
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [profile, setProfile] = useState<TrainerProfile | null | undefined>(undefined);
  const [myTrainer, setMyTrainer] = useState<{ relation: TrainerRelation; trainerName: string } | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [p, t] = await Promise.all([getMyTrainerProfile(), getMyTrainerRelation(meId)]);
      setProfile(p);
      setMyTrainer(t);
      setError(null);
    } catch {
      setError('אין חיבור לשרת. בדוק את האינטרנט ונסה שוב.');
      setProfile((v) => v ?? null);
      setMyTrainer((v) => v ?? null);
    }
  };
  useEffect(() => {
    load();
  }, [meId]);

  const home = () => {
    setRoute({ name: 'home' });
    load();
    inbox.refresh();
  };

  switch (route.name) {
    case 'join':
      return <JoinTrainerScreen defaultName={defaultName} onBack={home} onJoined={() => { load(); setRoute({ name: 'myTrainer' }); }} />;
    case 'myTrainer':
      return (
        <MyTrainerScreen
          meId={meId}
          unread={myTrainer ? inbox.unreadByThread.get(`${myTrainer.relation.trainer_id}:${meId}`) ?? 0 : 0}
          onBack={home}
          onChanged={inbox.refresh}
        />
      );
    case 'become':
    case 'editProfile':
      return (
        <BecomeTrainerScreen
          defaultName={defaultName}
          existing={route.name === 'editProfile' ? profile : null}
          onBack={() => setRoute(route.name === 'editProfile' ? { name: 'dashboard' } : { name: 'home' })}
          onDone={(p) => {
            if (p && !profile) requestPushPermission();
            setProfile(p);
            setRoute(p ? { name: 'dashboard' } : { name: 'home' });
          }}
        />
      );
    case 'dashboard':
      return profile ? (
        <TrainerDashboard
          profile={profile}
          unreadByThread={inbox.unreadByThread}
          onBack={home}
          onEditProfile={() => setRoute({ name: 'editProfile' })}
          onOpenClient={(relation) => setRoute({ name: 'client', relation })}
          onProfileChanged={setProfile}
        />
      ) : null;
    case 'client':
      return (
        <ClientDetailScreen
          trainerId={meId}
          trainerName={profile?.display_name ?? ''}
          relation={route.relation}
          allExercises={allExercises}
          myRoutines={myRoutines}
          unread={inbox.unreadByThread.get(`${meId}:${route.relation.client_id}`) ?? 0}
          onBack={() => setRoute({ name: 'dashboard' })}
          onRead={inbox.refresh}
          onRemoved={() => setRoute({ name: 'dashboard' })}
        />
      );
  }

  const loading = profile === undefined || myTrainer === undefined;
  const clientUnread = myTrainer ? inbox.unreadByThread.get(`${myTrainer.relation.trainer_id}:${meId}`) ?? 0 : 0;
  let trainerUnread = 0;
  inbox.unreadByThread.forEach((n, key) => {
    if (key.startsWith(`${meId}:`)) trainerUnread += n;
  });

  return (
    <Screen title="מאמנים" onBack={onClose} backLabel="סגירה">
      <ErrorNote text={error} />
      {loading ? (
        <Loader2 size={20} className="spin" style={{ margin: '40px auto' }} />
      ) : (
        <>
          <img
            src="/art/trainer-hero.webp"
            alt=""
            style={{ width: 'min(220px, 60vw)', aspectRatio: '1 / 1', objectFit: 'contain', display: 'block', margin: '0 auto 4px' }}
          />
          <SectionTitle>המאמן שלי</SectionTitle>
          {myTrainer ? (
            <RowButton
              icon={<UserCheck size={20} color="var(--color-blue)" />}
              title={myTrainer.trainerName}
              subtitle="הודעות ושינויים של המאמן"
              badge={clientUnread}
              onClick={() => setRoute({ name: 'myTrainer' })}
            />
          ) : (
            <RowButton
              icon={<KeyRound size={20} color="var(--color-blue)" />}
              title="יש לך מאמן? הצטרפות עם קוד"
              subtitle="המאמן ינהל לך את התוכנית, האימונים והיעדים, ותוכלו לדבר כאן"
              onClick={() => setRoute({ name: 'join' })}
            />
          )}

          <SectionTitle>לאנשי מקצוע</SectionTitle>
          {profile ? (
            <RowButton
              icon={<ClipboardList size={20} color="var(--color-green)" />}
              title="לוח המאמן"
              subtitle={`${profile.display_name} · קוד ${profile.invite_code}`}
              badge={trainerUnread}
              onClick={() => setRoute({ name: 'dashboard' })}
            />
          ) : (
            <>
              <RowButton
                icon={<ClipboardList size={20} color="var(--color-green)" />}
                title="אתה מאמן כושר? פתיחת חשבון מאמן"
                subtitle="ניהול כל המתאמנים מאותה אפליקציה: תוכניות, אימונים, יעדים והודעות"
                onClick={() => setRoute({ name: 'become' })}
              />
              <Card style={{ background: 'transparent', boxShadow: 'none', padding: '0 4px' }}>
                <Muted>אפשר להיות מאמן וגם מתאמן באותו חשבון.</Muted>
              </Card>
            </>
          )}
        </>
      )}
    </Screen>
  );
};
