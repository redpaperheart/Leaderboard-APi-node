'use strict';
const express = require('express');
const multer = require('multer');
const mongo = require('mongodb').MongoClient;
const ObjectId = require('mongodb').ObjectID;
const autoIncrement = require('mongodb-autoincrement');
const base64Img = require('base64-img');

startLeaderboardService(); 
function startLeaderboardService() {
  const app = express(); 
  app.listen( 4000, function() {
    console.log('started listening on 4000');
  });

  const connectionString = 'mongodb://localhost:27017/leaderboard';
  const storage = multer.diskStorage({
    destination: function(req, file, cb) {
                   cb(null, 'public/');
                 },
    filename: function(req, file, cb) {
                const filenameParts = file.originalname.split('.');
                cb(null, `${Date.now()}.${filenameParts[filenameParts.length-1]}`);
              }
  });
  const upload = multer({ storage: storage });
  const router = express.Router();

  mongo.connect(connectionString, leaderboardServiceConnectionProvider(router, upload, app));
}

function leaderboardServiceConnectionProvider(router, upload, app) {
  return (err, db) => {
    if (err) {
      console.log(err);
      return;
    }

    leaderboardService(db, router, upload, app);
  }
}

function generateNewRankings(players) {
    // generate array with only unique scores
    // order the unique scores, so that their index is the rank for that score
    const uniqueScores = players.reduce((scores, player, index) => {
      scores.indexOf(player.score) >= 0 ? null : scores.push(player.score);
      return scores;
    }, []);
    return uniqueScores.sort((a, b) => { return b - a});
}

function insertPlayer(db, player, resolve, reject) {
    // assign new player a rank based on score
    // insert new player into database
    const addTime = new Date();
    player.created_at = addTime.toISOString().slice(0, 19).replace('T', ' ');
    autoIncrement.getNextSequence(db, 'players', (error, autoIndex) => {
      player.id = autoIndex;
      db.collection('players').insertOne(player, (error, result) => {
        if (error) {
          console.log(error);
          reject(error);
          return;
        }
        resolve(result)
      });
    });
}

function updateRankings(db, playersToUpdate, scoreRankMap) {
  playersToUpdate.forEach((player, index, array) => {
    const addTime = new Date();
    db.collection('players')
      .updateOne(
        {_id: {$eq: ObjectId(player._id)}},
        { 
          $set: {
            rank: scoreRankMap.indexOf(player.score)+1,
            updated_at: addTime.toISOString().slice(0, 19).replace('T', ' ')
          }
        },
        (error, result) => {
          if (error) {
            console.log(error);
          }
        }
      );
  });
}

function leaderboardService(db, router, upload, app) {
  // create routes
  
  router.get('/api/v1', (req, res) => {
    res.status(200).send('RPH-Leaderboard - node.js API - node / express 4');
  });

  router.post('/api/v1/lb', upload.single('image'), (req, res) => {
    try {
    const { leaderboard, name, score, image } = req.body;
    const imagePath = new Promise((resolve, reject) => {
      if (req.file) {
        resolve(req.file.filename);
      } else if (image) {
        base64Img.img(image, 'public', Date.now(), (err, filePath) => {
          const pathParts = filePath.split('/');
          resolve(pathParts[pathParts.length-1]);
        });
      } else {
        resolve('');
      }
    });

    const nextLeaderboard = db.collection('players').find({leaderboard: { $eq: leaderboard }}).sort({score: -1}).toArray((error, docs) => {
      imagePath.then((imagePath) => {
      const nextLeaderboard = docs;
      nextLeaderboard.push({leaderboard, name, score: parseInt(score), image: imagePath});
      const newPlayer = nextLeaderboard[nextLeaderboard.length - 1];

      const scoreRankMap = generateNewRankings(nextLeaderboard);
      newPlayer.rank = scoreRankMap.indexOf(newPlayer.score)+1;
      const insertedPlayer = new Promise((resolve, reject) => {
        insertPlayer(db, newPlayer, resolve, reject);
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
      updateRankings(db, playersToUpdate, scoreRankMap);

      insertedPlayer.then(player => {
        if(player.result.ok === 1 && player.result.n === 1) {
          res.status(200).json(player.ops[0]);
        }
      });
      
      });
    });
    }
    catch (e) {
      console.log('error: ',e);
    }
  });

  router.get('/api/v1/lb/:id/:count?', (req, res) => {
    const limit = parseInt(req.params.count) || 0;
    db.collection('players')
      .find({
        leaderboard: {
          $eq: req.params.id
        }
      })
      .sort({
        rank: 1,
        created_at: -1
      })
      .limit(limit)
      .toArray((error, result) => {
        res.status(200).send(result);
      })
  });

  router.get('/api/v1/lb/:lbId/with/:pId/:count?', (req, res) => {
    const { lbId, count, pId } = req.params;
    const limit = parseInt(count) || 0;
    db.collection('players')
      .find({leaderboard: {$eq: lbId}})
      .sort({
        rank: 1,
        created_at: -1
      })
      .limit(limit)
      .toArray((leaderError, leaderResults) => {
        db.collection('players')
          .findOne({id: {$eq: parseInt(pId)}}, (playerError, playerResult) => {
          
            const error = playerError || leaderError;
            if (error) { console.log(error) }

            if (leaderResults && playerResult) {
              if (!leaderResults.find((el) => el.id === parseInt(pId))) {
                leaderResults.push(playerResult);
              }
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
  app.use('/storage/', express.static('public'));
}
