import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.allnetgames.app',
  appName: 'AllNet',
  webDir: 'www',
  server: {
    // Testing: load from branch preview. Change to https://allnetgames.com when merged to main.
    url: 'https://allnet-app-git-capacitor-setup-all-net.vercel.app',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
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
    SocialLogin: {
      providers: {
        google: true,
        apple: true,
        facebook: false,
        twitter: false,
      },
    },
  },
  ios: {
    scheme: 'AllNet',
    contentInset: 'always',
    backgroundColor: '#0A0A0A',
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
