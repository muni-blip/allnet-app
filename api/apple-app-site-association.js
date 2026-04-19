export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({
    applinks: {
      apps: [],
      details: [
        {
          appID: 'DC7V9U9D6S.com.allnetgames.app',
          paths: ['/auth-callback*']
        }
      ]
    }
  });
}
