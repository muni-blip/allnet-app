import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.allnetgames.app',
  appName: 'AllNet',
  webDir: 'www',
  // In development, uncomment this to load from Vercel preview instead of bundled files:
  // server: { url: 'https://allnet-app-git-capacitor-setup.vercel.app', cleartext: true },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#0A0A0A',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#000000',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  ios: {
    scheme: 'AllNet',
    contentInset: 'always',
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
