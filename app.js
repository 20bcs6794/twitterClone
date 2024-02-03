const express = require('express')
const app = express()
app.use(express.json())

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')

const path = require('path')
const dbPath = path.join(__dirname, 'twitterClone.db')
let db = null

const initializeBDAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('The server is running on http://localhost:3000')
    })
  } catch (e) {
    console.log(`The Error Message = ${e}`)
    process.exit(1)
  }
}

initializeBDAndServer()
// API 1
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const isUserExistsQuery = `SELECT * FROM user WHERE username = '${username}';`
  const userExists = await db.get(isUserExistsQuery)

  if (userExists !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10) // 10 is the salt rounds
      const postUserQuery = `INSERT INTO user (name, username, password, gender) VALUES('${name}', '${username}', '${hashedPassword}','${gender}');`

      await db.run(postUserQuery)
      response.status(200)
      response.send('User created successfully')
    }
  }
})
// API 2
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const isUserExistsQuery = `SELECT * FROM user WHERE username = '${username}';`
  const userExists = await db.get(isUserExistsQuery)

  if (userExists === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const checkPassword = await bcrypt.compare(password, userExists.password)
    if (checkPassword === false) {
      response.status(400)
      response.send('Invalid password')
    } else {
      const payload = {username: username}
      const jwtToken = await jwt.sign(payload, 'MY_SECRET_KEY')
      response.send({jwtToken})
    }
  }
})
// JWT Authenticate
const jwtAuthenticate = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers.authorization
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  } else {
    response.status(401)
    response.send('Invalid JWT Token')
  }

  jwt.verify(jwtToken, 'MY_SECRET_KEY', (error, payload) => {
    if (error) {
      response.status(401)
      response.send('Invalid JWT Token')
    } else {
      request.username = payload.username
      next()
    }
  })
}
// API 3
app.get('/user/tweets/feed/', jwtAuthenticate, async (request, response) => {
  const username = request.username
  const {user_id} = await db.get(
    `SELECT user_id FROM user WHERE username = '${username}'`,
  )
  const following_ids = await db.all(
    `SELECT following_user_id from follower WHERE follower_user_id = ${user_id}`,
  )
  console.log(following_ids)
  const idsArray = following_ids.map(eachObj => eachObj.following_user_id)
  const tuple = `(${idsArray.join(', ')})`
  console.log(tuple)
  const getTweetQuery = `SELECT username, tweet, date_time AS dateTime FROM tweet JOIN user ON tweet.user_id = user.user_id WHERE tweet.user_id IN ${tuple} ORDER BY date_time DESC LIMIT 4`
  const tweets = await db.all(getTweetQuery)

  response.send(tweets)
})

// API 4
app.get('/user/following', jwtAuthenticate, async (request, response) => {
  const username = request.username

  const {user_id} = await db.get(
    `SELECT user_id FROM user WHERE username = '${username}';`,
  )
  const following_ids = await db.all(
    `SELECT following_user_id from follower WHERE follower_user_id = ${user_id}`,
  )

  const idsArray = following_ids.map(eachObj => eachObj.following_user_id)

  const idTuple = `(${idsArray.join(',')})`

  const getNameQuery = `SELECT name FROM user WHERE user_id IN ${idTuple} `
  const getName = await db.all(getNameQuery)
  response.send(getName)
})

//API 5
app.get('/user/followers/', jwtAuthenticate, async (request, response) => {
  const username = request.username
  const userIdQuery = `SELECT user_id from user WHERE username = '${username}'`
  const userId = await db.get(userIdQuery)

  let followerArray = []
  const getFollowingsIdQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${userId.user_id}`
  const followings = await db.all(getFollowingsIdQuery)

  for (let eachObj of followings) {
    followerArray.push(eachObj.following_user_id)
  }
  console.log(followerArray, 'follower Array')

  const getFollowBackQuery = `SELECT follower_user_id FROM follower WHERE following_user_id = ${
    userId.user_id
  } AND follower_user_id IN (${followerArray.join(',')})`
  const followBack = await db.all(getFollowBackQuery)
  console.log(followBack.map(eachObj => eachObj.follower_user_id))
  let friends = []
  for (let eachObj of followBack) {
    const getFriendQuery = `SELECT name from user Where user_id = ${eachObj.follower_user_id}`
    const friend = await db.get(getFriendQuery)
    friends.push(friend)
  }
  response.send(friends)
})

async function getUserId(username) {
  const userIdQuery = `SELECT user_id from user WHERE username = '${username}'`
  const userId = await db.get(userIdQuery)
  return userId.user_id
}

async function getFollowingPeople(followerId) {
  let followingPeopleArray = []
  const getFollowingsIdQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${followerId}`
  const followings = await db.all(getFollowingsIdQuery)
  for (let eachObj of followings) {
    followingPeopleArray.push(eachObj.following_user_id)
  }
  return followingPeopleArray
}

//API 6
app.get('/tweets/:tweetId/', jwtAuthenticate, async (request, response) => {
  const username = request.username
  const userId = await getUserId(username)

  const followingToPeople = await getFollowingPeople(userId)

  const {tweetId} = request.params

  const tweetPosterQuery = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId}`
  const tweetPoster = await db.get(tweetPosterQuery)

  if (followingToPeople.includes(tweetPoster.user_id)) {
    const getTweetDetailsQuery = `SELECT tweet, (SELECT COUNT(*) FROM Like WHERE tweet_id = tweet.tweet_id) as likes, (SELECT COUNT(*) FROM Reply WHERE tweet_id = tweet.tweet_id) AS replies, date_time AS dateTime FROM tweet WHERE tweet.tweet_id = ${tweetId}`
    const tweetDetails = await db.get(getTweetDetailsQuery)
    response.send(tweetDetails)
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

//API 7
app.get(
  '/tweets/:tweetId/likes/',
  jwtAuthenticate,
  async (request, response) => {
    const username = request.username
    const userId = await getUserId(username)
    const followingToPeople = await getFollowingPeople(userId)
    const {tweetId} = request.params

    const tweetPosterQuery = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId}`
    const tweetPoster = await db.get(tweetPosterQuery)

    if (followingToPeople.includes(tweetPoster.user_id)) {
      const userLikeIdQuery = `SELECT user_id  FROM like WHERE tweet_id = ${tweetId};`
      const userIds = await db.all(userLikeIdQuery)
      const likerIds = userIds.map(eachObj => eachObj.user_id)
      console.log(likerIds)
      let likerName = []

      for (let eachObj of likerIds) {
        const usernameQuery = `SELECT username FROM user WHERE user_id = ${eachObj};`
        const username = await db.get(usernameQuery)
        likerName.push(username)
      }
      response.send({likes: likerName.map(eachObj => eachObj.username)})
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

// API 8
app.get(
  '/tweets/:tweetId/replies',
  jwtAuthenticate,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request

    const getUserId = `SELECT user_id FROM user WHERE username = '${username}'`
    const userId = (await db.get(getUserId)).user_id

    const getRepliedUsersQuery = `
            SELECT 
               *
            FROM 
                follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id 
                INNER JOIN user ON user.user_id = reply.user_id
            WHERE 
            tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${userId}
        ;`
    const repliedUsers = await db.all(getRepliedUsersQuery)
    console.log(repliedUsers)

    if (repliedUsers.length !== 0) {
      let replies = []
      const getNamesArray = repliedUsers => {
        for (let item of repliedUsers) {
          let object = {
            name: item.name,
            reply: item.reply,
          }
          replies.push(object)
        }
      }
      getNamesArray(repliedUsers)
      response.send({replies})
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//API 9
app.get('/user/tweets/', jwtAuthenticate, async (request, response) => {
  const user = request.username
  console.log(user)
  const getUserId = `SELECT user_id FROM user WHERE username = '${user}'`
  const userId = (await db.get(getUserId)).user_id
  console.log(userId)
  const getAllTweetQuery = `SELECT tweet.tweet AS tweet, COUNT(DISTINCT(like.like_id)) AS likes, COUNT(DISTINCT(reply.reply_id)) AS replies, tweet.date_time AS dateTime FROM user INNER JOIN tweet ON tweet.user_id = user.user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id INNER JOIN reply ON tweet.tweet_id = reply.tweet_id WHERE user.user_id = ${userId} GROUP BY tweet.tweet_id `
  const allTweets = await db.all(getAllTweetQuery)
  response.send(allTweets)
})

// API 10

app.post('/user/tweets/', jwtAuthenticate, async (request, response) => {
  const {tweet} = request.body
  console.log(tweet)
  const createTweetQuery = `INSERT INTO tweet (tweet) VALUES ('${tweet}');`
  await db.run(createTweetQuery)
  response.send('Created a Tweet')
})

// API 11

app.delete('/tweets/:tweetId/', jwtAuthenticate, async (request, response) => {
  const {tweetId} = request.params
  const {username} = request

  const getUserId = `SELECT user_id FROM user WHERE username = '${username}'`
  const userId = (await db.get(getUserId)).user_id
  const deleteQuery = `SELECT * FROM tweet WHERE tweet.tweet_id = ${tweetId} AND tweet.user_id = ${userId}`
  const deleted = await db.all(deleteQuery)

  if (deleted.length === 0) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    const deletingQuery = `DELETE FROM tweet WHERE tweet.tweet_id = ${tweetId} AND tweet.user_id = ${userId}`
    await db.run(deletingQuery)
    response.send('Tweet Removed')
  }
})
module.exports = app
