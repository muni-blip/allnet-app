export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  // TODO: Replace SHA-256 after first production Android build via:
  // eas credentials --platform android
  res.status(200).json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.allnetgames.app',
        sha256_cert_fingerprints: [
          'PLACEHOLDER_SHA256_FROM_PRODUCTION_BUILD'
        ]
      }
    }
  ]);
}
