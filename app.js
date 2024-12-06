const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const app = express()
app.use(express.json())
const dbPath = path.join(__dirname, 'covid19IndiaPortal.db')

let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}
initializeDBAndServer()

// requered
app.post('/register', async (request, response) => {
  const {username, name, password, gender, location} = request.body
  const hashedPassword = await bcrypt.hash(password, 10)
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`
  const dbUser = await db.get(selectUserQuery)

  if (dbUser === undefined) {
    const createUserQuery = `
      INSERT INTO 
        user (username, name, password, gender, location) 
      VALUES 
        (
          '${username}', 
          '${name}',
          '${hashedPassword}', 
          '${gender}',
          '${location}'
        )`

    if (password.length < 5) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const dbResponse = await db.run(createUserQuery)
      const newUserId = dbResponse.lastID
      response.status(200)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

// API 1 login
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched === true) {
      let playLoad = {username: username}
      const jwtToken = jwt.sign(playLoad, 'asdfsgsfagshsf')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})
// Authentication with Token
const authenticateToken = (request, response, next) => {
  let jwtToken
  let authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
    console.log(jwtToken)
  }
  if (authHeader === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'asdfsgsfagshsf', async (error, playLoad) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = playLoad.username
        next()
      }
    })
  }
}
// convert snakeCase to cameleCase
function convertSnakeCaseToCameleCase(dbObject) {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  }
}

// API2

// Returns a list of all states in the state table
app.get('/states/', authenticateToken, async (request, response) => {
  console.log('inside get states api 1')
  const getALLStatesQuery = `SELECT * FROM state`
  const allStates = await db.all(getALLStatesQuery)
  response.send(
    allStates.map(eachState => convertSnakeCaseToCameleCase(eachState)),
  )
})

// Returns a state based on the state ID
app.get('/states/:stateId/', authenticateToken, async (request, response) => {
  const {stateId} = request.params
  const getStateQuery = `SELECT * FROM state WHERE state_id=${stateId}`
  const stateApi = await db.get(getStateQuery)
  response.send(convertSnakeCaseToCameleCase(stateApi))
})

// Create a district in the district table, district_id is auto-incremented
app.post('/districts/', authenticateToken, async (request, response) => {
  const districtsNames = request.body
  const {districtName, stateId, cases, cured, active, deaths} = districtsNames

  const createDistictsQuery = `INSERT INTO district (district_name,state_id,cases,cured
   ,active,deaths) VALUES('${districtName}', ${stateId},${cases},${cured},
   ${active},${deaths})`
  const postApi = await db.run(createDistictsQuery)
  console.log(postApi)
  const {districtId} = postApi.lastID
  response.send('District Successfully Added')
})

// Returns a district based on the district ID
app.get(
  '/districts/:districtId/',
  authenticateToken,

  async (request, response) => {
    const {districtId} = request.params
    const getQuery = `SELECT * FROM district WHERE district_id = ${districtId}`
    console.log(getQuery)
    const distict = await db.get(getQuery)
    console.log(distict)
    response.send({
      districtId: distict.district_id,
      districtName: distict.district_name,
      stateId: distict.state_id,
      cases: distict.cases,
      cured: distict.cured,
      active: distict.active,
      deaths: distict.deaths,
    })
  },
)

// Deletes a district from the district table based on the district ID
app.delete(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const deleteDistictNameQuery = `DELETE FROM district WHERE district_id=${districtId}`
    await db.run(deleteDistictNameQuery)
    response.send('District Removed')
  },
)

// Updates the details of a specific district based on the district ID
app.put(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const distictNameDetails = request.body
    const {districtName, stateId, cases, cured, active, deaths} =
      distictNameDetails
    const distictNameQuery = `UPDATE district 
  SET 
  district_name='${districtName}', 
  state_id = ${stateId},
   cases = ${cases},
   cured = ${cured},
   active = ${active},
  deaths = ${deaths}
   WHERE district_id=${districtId}`
    const dbquery = await db.run(distictNameQuery)
    console.log(dbquery)
    response.send('District Details Updated')
  },
)

// Returns the statistics of total cases, cured, active, deaths of a specific state based on state ID
app.get(
  '/states/:stateId/stats/',
  authenticateToken,
  async (request, response) => {
    const {stateId} = request.params
    const getStateIdStatsQuery = `SELECT SUM(cases), SUM(cured), SUM(active), SUM(deaths)
  FROM district WHERE state_id = ${stateId}`
    const stats = await db.get(getStateIdStatsQuery)
    console.log(stats)
    response.send({
      totalCases: stats['SUM(cases)'],
      totalCured: stats['SUM(cured)'],
      totalActive: stats['SUM(active)'],
      totalDeaths: stats['SUM(deaths)'],
    })
  },
)

module.exports = app
