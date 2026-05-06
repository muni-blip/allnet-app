export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  // No caching — changes need to propagate immediately
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.status(200).json({
    applinks: {
      apps: [],
      details: [
        {
          appIDs: ['DC7V9U9D6S.com.allnetgames.app'],
          components: [
            { '/': '/r/*/*',   comment: 'Session pages: /r/{org}/{code}' },
            { '/': '/p/*',     comment: 'Player pages: /p/{slug}' },
            { '/': '/org/*',   comment: 'Org pages: /org/{slug}' },
          ]
        }
      ]
    }
  });
}
