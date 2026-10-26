import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.brainslead.ballast',
  appName: 'Ballast',
  webDir: 'dist',
  plugins: {
    PushNotifications: {
      // הודעה מהמאמן מוצגת גם כשהאפליקציה פתוחה
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
