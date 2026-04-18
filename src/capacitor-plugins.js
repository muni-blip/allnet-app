// ═══════════════════════════════════════════════
// AllNet — Capacitor Plugin Bridge
// Bundles ES module plugin imports for vanilla JS access.
// Built via: npx esbuild src/capacitor-plugins.js --bundle --outfile=js/capacitor-plugins.bundle.js --format=iife --global-name=AllNetPlugins
// ═══════════════════════════════════════════════

import { SocialLogin } from '@capgo/capacitor-social-login';

// Expose to global scope for vanilla JS access
window.AllNetSocialLogin = SocialLogin;

console.log('AllNet: SocialLogin plugin bridge loaded');
