'use strict';
const express = require('express');
const multer = require('multer');
const { connection } = require('./connection.js');

const app = express();
app.listen( 4000, function() {
  console.log('started listening on 4000');
});

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
                 cb(null, 'public/');
               },
  filename: function(req, file, cb) {
              cb(null, Date.now() + '.jpg');
            }
});
const upload = multer({ storage: storage });

const router = express.Router();

function generateNewRankings(players) {
    // generate array with only unique scores
    // order the unique scores, so that their index is the rank for that score
    const uniqueScores = players.reduce((scores, player, index) => {
      scores.indexOf(player.score) >= 0 ? null : scores.push(player.score);
      return scores;
    }, []);
    return uniqueScores.sort((a, b) => { return b - a});
}

function insertPlayer(player, imagePath, resolve, reject) {
    // assign new player a rank based on score
    // insert new player into database
    const addTime = new Date();
    const cols = '(`leaderboard`,`name`,`score`,`image`,`rank`, `created_at`)';
    const queryString = `INSERT INTO \`leaderboard\`.\`players\` ${cols}
    VALUES('${player.leaderboard}',
      '${player.name}',
      ${player.score},
      ${connection.escape(imagePath)},
      ${player.rank},
      '${addTime.toISOString().slice(0, 19).replace('T', ' ')}');
    SELECT * FROM \`leaderboard\`.\`players\` WHERE \`id\`=LAST_INSERT_ID();
    ` 
    connection.query(queryString, (error, result, fields) => {
      if (error) {
        console.log(error);
        reject(error);
        return;
      }
      resolve(result[1]);
    });
}

function updateRankings(playersToUpdate, scoreRankMap) {
  playersToUpdate.forEach((player, index, array) => {
    const addTime = new Date();
    const queryString = `UPDATE \`players\`
    SET \`rank\`=${scoreRankMap.indexOf(player.score)},
        \`updated_at\`='${addTime.toISOString().slice(0, 19).replace('T', ' ')}'
    WHERE \`id\`=${player.id}`;
    connection.query(queryString, (error) => {
      if (error) { console.log(error); }
    });
  });
}

// create routes
router.post('/api/v1/lb', upload.single('image'), (req, res) => {
  const { leaderboard, name, score } = req.body;
  const imagePath = req.file ? req.file.path : 'public/default.jpg';

  const users = connection.query(`SELECT \`id\`,
    \`score\`,
    \`rank\`,
    \`created_at\`
    FROM \`leaderboard\`.\`players\`
    WHERE \`leaderboard\`='${leaderboard}'
    ORDER BY score DESC`,
  (error, results, fields) => {
    const nextLeaderboard = results;
    nextLeaderboard.push({leaderboard, name, score: parseInt(score), imagePath});
    const newPlayer = nextLeaderboard[nextLeaderboard.length - 1];
    const scoreRankMap = generateNewRankings(nextLeaderboard);
    newPlayer.rank = scoreRankMap.indexOf(newPlayer.score);
    const insertedPlayer = new Promise((resolve, reject) => {
      insertPlayer(newPlayer, imagePath, resolve, reject);
    });

    // sort the leaderboard with added player by score
    // update the database with new rank for players with scores lower than
    // the inserted player
    nextLeaderboard.sort((a, b) => {
      const ascore = a.score;
      const bscore = b.score;
      return bscore - ascore != 0 ? bscore - ascore : new Date(b.created_at) - new Date(a.created_at);
    });
    const playersToUpdate = nextLeaderboard.slice(nextLeaderboard.indexOf(newPlayer) + 1);
    updateRankings(playersToUpdate, scoreRankMap);

    insertedPlayer.then(player => {
      res.status(200).json({
        message: 'player successfully added',
        newPlayer: player
      });
    });
  });
});

router.get('/api/v1/lb/:id/:count?', (req, res) => {
  const limit = req.params.count ? `LIMIT ${req.params.count}` : '';
  const users = connection.query(`SELECT * FROM \`leaderboard\`.\`players\`
    WHERE \`leaderboard\`='${req.params.id}'
    ORDER BY \`rank\` ASC, \`created_at\` DESC ${limit}`,
  (error, results, fields) => {
    res.status(200).send(results);
    res.end();
  });
});

router.get('/api/v1/lb/:lbId/with/:pId/:count?', (req, res) => {
  const limit = req.params.count ? `LIMIT ${req.params.count-1}` : '';
  connection.query(`SELECT * FROM \`leaderboard\`.\`players\`
    WHERE \`leaderboard\`='${req.params.lbId}'
    ORDER BY \`rank\` ASC, \`created_at\` DESC ${limit}`,
  (error, leaderResults, fields) => {
    connection.query(`SELECT * FROM \`leaderboard\`.\`players\` WHERE \`id\`=${req.params.pId}`, (error, playerResult, fields) => {
      
      if (error) { console.log(error) }

      if (leaderResults && playerResult.length === 1) {
        leaderResults.push(playerResult[0]);
        res.send(leaderResults);
        res.end();
      } else {
        res.status(404).json({
          error: "specified player not found"
        });
      }
    })
  });
});

app.use('/', router);
