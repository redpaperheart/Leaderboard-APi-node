# Red Paper Heart Leaderboard Service
## (it's tiny)

1. Have node.js installed. This was built with 5.5.0 but any version after that should also work.
2. Have NPM installed. This was built using NPM 3, but earlier versions should work.
3. Run `npm install` in the root of the project.

*If you're running a version of node.js that does _not_ support es6 features:*
4. Run `npm run build` to transpile the service into es5 if you're running a version of node that
doesn't support es6 features.
4.5. Add a "plugin" prop to your `ampm.json` config object whose value is the path to `dist/moduleApp.js`.

*If you're running a version of node.js that supports es6 features:*
4. Add a "plugin" prop to your `ampm.json` config object whose value is the path to `src/moduleApp.js`.

5. Run `ampm` from your app directory.

The service should now be available on port 4000.

## Endpoints
### /api/v1/lb
This endpoint adds a new player. Players require the following fields encoded as mutli-part form data:

* `name`: text
* `leaderboard`: text
* `score`: number

You can optionally provide a profile image in the `image` field. Adding a player with a leaderboard that
doesn't exist effectively creates a new leaderboard.

### /api/v1/lb/:leaderboardId/:count?
This endpoint returns the players in the leaderboard specified by `:leaderboardId`. You can limit
the number of results you receive in the response using the optional `:count` parameter. Use an int.

### /api/v1/lb/:leaderboardId/with/:playerId/:count?
This endpoint returns the players in the leaderboard specified by `:leaderboardId`, plus the player
specified by :playerId. Players are looked up using the primary index, `id`, from the players table.
You can limit the number of results you receive in the response using the optional `:count` parameter.
Use an int.
