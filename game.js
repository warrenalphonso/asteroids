var canv = document.getElementById('gameCanvas')
canv.width = screen.width / 1.5
canv.height = screen.height / 1.5
var ctx = canv.getContext('2d')

//set up event handlers
document.addEventListener('keydown', keyDown)
document.addEventListener('keyup', keyUp)

var GAME_ON = false

const FPS = 60 //frames per second
const FRICTION = 0.7 //friction coefficient of space
const GAME_LIVES = 3 //starting number of lives
const LASER_MAX = 10 //maximum number of lasers on screen at once
const LASER_SPEED = 500 //speed of lasers in pixels per second
const LASER_DIST = 0.6 //max distance laser can travel as fraction of screen width
const LASER_EXPLODE_DUR = 0.1 //duration of lasers' explosion in seconds
const ROIDS_JAG = .4 //jaggedness of the asteroids (0 = none, 1 = lots)
const ROIDS_NUM = 6 //starting number of asteroids
const ROIDS_SIZE = 100 //starting size of asteroids in pixels
const ROIDS_SPEED = 50 //max starting speed of asteriods in pixels per second
const ROIDS_VERT = 10 //average number of vertices on each asteroid
const ROIDS_PTS_LGE = 20 //points scored for large asteroid
const ROIDS_PTS_MDE = 50 //points for medium
const ROIDS_PTS_SML = 100 //points for small
const SAVE_KEY_SCORE = 'highscore' //save key for local storage of high score
const SHIP_SIZE = 30 //ship height in pixels
const SHIP_THRUST = 5 //acceleration of ship in pixels per second per second
const SHIP_EXPLODE_DUR = 0.3 //duration of ship's explosion
const SHIP_INV_DUR = 3 //duration of ship's invisibility duration in seconds
const SHIP_BLINK_DUR = .1 //duration of ship's blink during invisbility in seconds
const TURN_SPEED = 360 //turn speed in degrees per second

//developer flags
var AUTOMATION_ON = false //set up neural network
const SHOW_BOUNDING = false // show or hide collision bounding
const SHOW_CENTER_DOT = false //show or hide ship's center dot
const TEXT_FADE_TIME = 2.5 //text fade time in seconds
const TEXT_SIZE = 40 //text size in pixels
var SOUND_ON = false
var MUSIC_ON = false
var GAME_SPEED = 1000 // 1000 for normal 10 for fast forward

//neural network parameters
var nn, aiShootTime = 0
const NUM_INPUTS = 4
const NUM_HIDDEN = 100
const NUM_OUTPUTS = 1
const NUM_SAMPLES = 100000 //number of training samples
const OUTPUT_LEFT = 0 //expected neural output for turning left
const OUTPUT_RIGHT = 1 //expected neural output for turning right
const OUTPUT_THRESHHOLD = 0.01 //how close prediction must be to commit to a turn
const RATE_OF_FIRE = 50 //shots per second
const IMMEDIATE_RADIUS = 100 //radius within which neural network prioritizes asteroid on path to hit

//set up sound effects
var fxLaser = new Sound('sounds/laser.m4a', 5, 0.1)
var fxExplode = new Sound('sounds/explode.m4a')
var fxHit = new Sound('sounds/hit.m4a', 5, 0.1)
var fxThrust = new Sound('sounds/thrust.m4a', 1, 0.5)

//set up the music
var music = new Music('sounds/music-low.m4a', 'sounds/music-high.m4a')

//set up the game paramters
var roidsLeft, roidsTotal
var level, lives, roids, score, scoreHigh, ship, text, textAlpha

var oldInterval = null

homeScreen()

function homeScreen() {
  // draw home screen 
  ctx.fillStyle = 'black'
  ctx.fillRect(0,0, canv.width, canv.height)
  ctx.textAlign = 'center'
  ctx.textBaseline ='middle'
  ctx.fillStyle = 'rgba(255,255,255,1)'
  ctx.font = 'small-caps ' + 1.5 * TEXT_SIZE + 'px dejavu sans mono'
  ctx.fillText("ASTEROIDS", canv.width / 2, canv.height * 0.45)
  ctx.font = 'small-caps ' + 0.60 * TEXT_SIZE + 'px dejavu sans mono'
  ctx.fillText("Choose parameters and press Start", canv.width / 2, canv.height * 0.65)
  
  document.addEventListener('submit', function(event) {
    event.preventDefault()

    // display loading animation - say it might take a while if training 
    ctx.fillStyle = 'black'
    ctx.fillRect(0,0, canv.width, canv.height)
    ctx.textAlign = 'center'
    ctx.textBaseline ='middle'
    ctx.fillStyle = 'rgba(255,255,255,1)'
    ctx.font = 'small-caps ' + 1.5 * TEXT_SIZE + 'px dejavu sans mono'
    ctx.fillText("Loading...", canv.width / 2, canv.height * 0.45)
    ctx.font = 'small-caps ' + 0.40 * TEXT_SIZE + 'px dejavu sans mono'
    ctx.fillText("Training may take a while.", canv.width / 2, canv.height * 0.65)
    
    // listen for start button and get parameters 
    var trainInp = document.querySelector('#train')
    var fastForwardInp = document.querySelector('#fastForward')
    var soundInp = document.querySelector('#sound')
    var musicInp = document.querySelector('#music')

    if (trainInp.checked) {
      AUTOMATION_ON = true
    } else {
      AUTOMATION_ON = false
    }
    if (fastForwardInp.checked) {
      GAME_SPEED = 10
    } else {
      GAME_SPEED = 1000
    }
    if (soundInp.checked) {
      SOUND_ON = true
    } else {
      SOUND_ON = false 
    }
    if (musicInp.checked) {
      MUSIC_ON = true
    } else {
      MUSIC_ON = false
    }

    // start new game and train nn if needed 
    if (oldInterval != null) {
      clearInterval(oldInterval)
    }

    newGame()
    GAME_ON = true

    //set up the neural network
    if (AUTOMATION_ON){
      nn = new NeuralNetwork(NUM_INPUTS, NUM_HIDDEN, NUM_OUTPUTS)

      //train the network
      let ax, ay, sa, sx, sy
      for (let i = 0; i < NUM_SAMPLES; i++){

        //random asteroid location (include off-screen data)
        ax = Math.random() * (canv.width + ROIDS_SIZE) - ROIDS_SIZE / 2
        ay = Math.random() * (canv.height + ROIDS_SIZE) - ROIDS_SIZE / 2

        //ship's angle and position
        sa = Math.random() * Math.PI * 2
        sx = ship.x
        sy = ship.y

        //angle to turn to asteroid
        let angle = angleToPoint(sx, sy, sa, ax, ay)

        //determine direction to turn
        let direction = angle > Math.PI ? OUTPUT_LEFT : OUTPUT_RIGHT

        //train the network
        nn.train(normalizeInput(ax, ay, angle, sa), [direction])
      }
    }

    oldInterval = setInterval(update, GAME_SPEED / FPS)

  }, false)
}

function angleToPoint(x, y, bearing, targetX, targetY){
  let angleToTarget = Math.atan2(-targetY + y, targetX - x)
  let diff = bearing - angleToTarget
  return (diff + Math.PI * 2) % (Math.PI * 2)
}

function createAsteroidBelt(){
  roids = []
  roidsTotal = (ROIDS_NUM + level) * 7
  roidsLeft = roidsTotal
  var x,y
  for (var i = 0; i < ROIDS_NUM + level; i++){
    do {
      x = Math.floor(Math.random() * canv.width)
      y = Math.floor(Math.random() * canv.height)
    } while (distBetweenPoints(ship.x, ship.y, x, y) < ROIDS_SIZE * 2 + ship.r)
    roids.push(newAsteroid(x,y, Math.ceil(ROIDS_SIZE / 2)))
  }
}

function destroyAsteroid(index){
  var x = roids[index].x
  var y = roids[index].y
  var r = roids[index].r

  //split the asteroid in two if necessary
  if (r == Math.ceil(ROIDS_SIZE / 2)){
    roids.push(newAsteroid(x, y, Math.ceil(ROIDS_SIZE / 4)))
    roids.push(newAsteroid(x, y, Math.ceil(ROIDS_SIZE / 4)))
    score += ROIDS_PTS_LGE
  } else if (r == Math.ceil(ROIDS_SIZE / 4)){
    roids.push(newAsteroid(x, y, Math.ceil(ROIDS_SIZE / 8)))
    roids.push(newAsteroid(x, y, Math.ceil(ROIDS_SIZE / 8)))
    score += ROIDS_PTS_MDE
  } else {
    score += ROIDS_PTS_SML
  }

  //check high score
  if (score > scoreHigh){
    scoreHigh = score
    localStorage.setItem(SAVE_KEY_SCORE, scoreHigh)
  }

  //destroy initial asteroid
  roids.splice(index, 1)
  fxHit.play()

  //calculate ratio of remaining asteroids to determine music tempo
  roidsLeft--
  music.setAsteroidRatio(roidsLeft == 0 ? 1 : roidsLeft / roidsTotal)

  //new level when no asteroids
  if (roids.length == 0){
    level++
    newLevel()
  }
}

function distBetweenPoints(x1, y1, x2, y2){
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 -y1, 2))
}

function drawShip(x, y, a, color = 'white'){
  ctx.strokeStyle = color
  ctx.lineWidth = SHIP_SIZE / 20
  ctx.beginPath()
  ctx.moveTo( //nose of the ship
    x + 4 / 3 * ship.r * Math.cos(a),
    y -  4 / 3 * ship.r * Math.sin(a),
  )
  ctx.lineTo( //rear left
    x - ship.r * ( 2 / 3 * Math.cos(a) + Math.sin(a)),
    y + ship.r * ( 2 / 3 * Math.sin(a) - Math.cos(a)),
  )
  ctx.lineTo( //rear right
    x - ship.r * ( 2 / 3 * Math.cos(a) - Math.sin(a)),
    y + ship.r * ( 2 / 3 * Math.sin(a) + Math.cos(a)),
  )
  ctx.closePath()
  ctx.stroke()
}

function explodeShip(){
  ship.explodeTime = Math.ceil(SHIP_EXPLODE_DUR * FPS)
  fxExplode.play()
}

function gameOver(){
  ship.dead = true
  text = 'Game Over'
  textAlpha = 1.0
}

function keyDown(/** @type (KeyboardEvent) */ ev){
  if (!GAME_ON || ship.dead || AUTOMATION_ON){
    return
  }
  switch(ev.keyCode){
    case 32: //space bar (shoot laser)
      shootLaser()
      break
    case 37: //left arrow (rotate ship left)
      rotateShip(false)
      break
    case 38: //up arrow (thrust ship)
      ship.thrusting = true
      break
    case 39: //right arrow (rotate ship right)
      rotateShip(true)
      break
  }
}

function keyUp(/** @type (KeyboardEvent) */ ev){
  if (!GAME_ON || ship.dead || AUTOMATION_ON){
    return
  }
  switch(ev.keyCode){
    case 32: //space bar (allow shooting again)
      ship.canShoot = true
      break
    case 37: //left arrow (stop rotate ship left)
      ship.rot = 0
      break
    case 38: //up arrow (stop thrust ship)
      ship.thrusting = false
      break
    case 39: //right arrow (stop rotate ship right)
      ship.rot = 0
      break
  }
}

function newAsteroid(x, y, r){
  var lvlMult = 1 + .1 * level
  var roid = {
    x: x,
    y: y,
    xv: Math.random() * ROIDS_SPEED * lvlMult / FPS * (Math.random() < .5 ? 1: -1),
    yv: Math.random() * ROIDS_SPEED * lvlMult / FPS * (Math.random() < .5 ? 1: -1),
    a: Math.random() * Math.PI * 2, //in radians
    r: r,
    offs: [],
    vert: Math.random() * (ROIDS_VERT + 1) + ROIDS_VERT / 2,
  }

  //create the vertex offsets array
  for(var i = 0; i < roid.vert; i++){
    roid.offs.push(Math.random() * ROIDS_JAG * 2 + 1 - ROIDS_JAG)
  }
  return roid
}

function newGame(){
  level = 0
  lives = GAME_LIVES
  score = 0
  ship = newShip()

  //get the high score from local storage
  var scoreStr = localStorage.getItem(SAVE_KEY_SCORE)
  if (scoreStr == null){
    scoreHigh = 0
  } else {
    scoreHigh = parseInt(scoreStr)
  }
  newLevel()
}

function newLevel(){
  text = 'Level ' + (level + 1)
  textAlpha = 1.0
  createAsteroidBelt()

}

function newShip(){
  return {
    x: canv.width / 2,
    y: canv.height / 2,
    r: SHIP_SIZE / 2,
    a: 90 / 180 * Math.PI, //convert to radians
    blinkNum: Math.ceil(SHIP_INV_DUR / SHIP_BLINK_DUR),
    blinkTime: Math.ceil(SHIP_BLINK_DUR * FPS),
    canShoot: true,
    dead: false,
    explode_time: 0,
    lasers: [],
    rot: 0,
    thrusting: false,
    thrust: {
      x: 0,
      y: 0,
    }
  }
}

function normalizeInput(roidX, roidY, roidA, shipA){
  //normalize the values to between 0 and 1
  let input = []
  input[0] = (roidX + ROIDS_SIZE / 2) / (canv.width + ROIDS_SIZE)
  input[1] = (roidY + ROIDS_SIZE / 2) / (canv.height + ROIDS_SIZE)
  input[2] = roidA / (Math.PI * 2)
  input[3] = shipA / (Math.PI * 2)
  return input
}

function rotateShip(right){
  let sign = right ? -1 : 1
  ship.rot = TURN_SPEED / 180 * Math.PI / FPS * sign
}

function shootLaser(){
  //create the laser object
  if (ship.canShoot && ship.lasers.length < LASER_MAX){
    ship.lasers.push({ //from the nose of the ship
      x: ship.x + 4 / 3 * ship.r * Math.cos(ship.a),
      y: ship.y -  4 / 3 * ship.r * Math.sin(ship.a),
      xv: LASER_SPEED * Math.cos(ship.a) / FPS,
      yv: -LASER_SPEED * Math.sin(ship.a) / FPS,
      dist: 0,
      explodeTime: 0,
    })
    fxLaser.play()
  }

  //prevent further shooting
  ship.canShoot = false
}

function Sound(src, maxStreams = 1, vol = 1.0){
  this.streamNum = 0
  this.streams = []
  for (var i = 0; i < maxStreams; i++){
    this.streams.push(new Audio(src))
    this.streams[i].volume = vol
  }
  //implement play function
  this.play = function(){
    if (SOUND_ON){
      this.streamNum = (this.streamNum + 1) % maxStreams
      this.streams[this.streamNum].play()
    }
  }
  this.stop = function(){
    this.streams[this.streamNum].pause()
    this.streams[this.streamNum].currentTime = 0
  }
}

function Music(srcLow, srcHigh){
  this.soundLow = new Audio(srcLow)
  this.soundHigh = new Audio(srcHigh)
  this.low = true
  this.tempo = 1.0 //seconds per beat
  this.beatTime = 0 //frames left until next beat

  this.play = function(){
    if (GAME_ON && MUSIC_ON){
      if (this.low){
        this.soundLow.play()
      } else {
        this.soundHigh.play()
      }
      this.low = !this.low
    }
  }

  this.setAsteroidRatio = function(ratio){
    this.tempo = 1.0 - 0.75 * (1.0 - ratio)
  }

  this.tick = function(){
    if (this.beatTime == 0){
      this.play()
      this.beatTime = Math.ceil(this.tempo * FPS)
    } else {
      this.beatTime--
      }
    }
  }

function update() {
  var blinkOn = ship.blinkNum % 2 == 0
  var exploding = ship.explodeTime > 0

  //use the neural network to rotate and shoot
  if (AUTOMATION_ON){

    // //compute the closest asteroid
    // let c = 0 //closest index
    // let dist0 = distBetweenPoints(ship.x, ship.y, roids[0].x, roids[0].y)
    // for (let i = 1 i < roids.length i++){
    //   let dist1 = distBetweenPoints(ship.x, ship.y, roids[i].x, roids[i].y)
    //   if (dist1 < dist0){
    //     dist0 = dist1
    //     c = i
    //   }
    // }

    //compute closest asteroids within a radius
    let c = null
    var closest_asteroids = []
    for (let i = 0; i < roids.length; i++){
      let disti = distBetweenPoints(ship.x, ship.y, roids[i].x, roids[i].y)
      // if (disti < IMMEDIATE_RADIUS){
      closest_asteroids.push([i, disti])
      // }
    }

    //sort closest_asteroids in ascending order
    closest_asteroids.sort(function(a, b){return a[1] - b[1]})
    // c = closest_asteroids[0][0]

    //check which asteroids will hit within closest_asteroids
    for (let i = 0; i < closest_asteroids.length; i++){
      if (Colliding(ship.x, ship.y, closest_asteroids[i][0].x, closest_asteroids[i][0].y,
        closest_asteroids[i][0].r, closest_asteroids[i][0].xv, closest_asteroids[i][0].yv)){
        c = i
      }
    }

    if (c == null){
      c = closest_asteroids[0][0]
    }

    //function to check if asteroid will collide with ship by comparing
    //slope of line between asteroid and ship to slope of velociy of
    //asteroid adjusted for radii

    //PROBLEM: asteroid might have same slope but be moving away - that causes
    //targeting of asteroid that's not yet harmful
    function Colliding(sx, sy, ax, ay, ar, axv, ayv){
      //ship radius = SHIP_SIZE / 2
      //slope of line connecting centers
      let centers_slope = (sy - ay) / (sx - ax)
      //slope of asteroid velocity direction
      let vel_slope = ayv / axv
      //offset by which to compare slopes (large  asteroids can match slope less)
      let offset = ROIDS_SIZE / ar
      if (centers_slope >= 0.08 * offset * vel_slope && 0.08 * offset * centers_slope <= vel_slope){
        return true
      }
    }

    //make a prediction based on current data
    let ax = roids[c].x
    let ay = roids[c].y
    let sx = ship.x
    let sy = ship.y
    let sa = ship.a
    let angle = angleToPoint(sx, sy, sa, ax, ay)
    let predict = nn.feedForward(normalizeInput(ax, ay, angle, sa)).data[0][0]

    //make a turn
    let dLeft = Math.abs(predict - OUTPUT_LEFT)
    let dRight = Math.abs(predict - OUTPUT_RIGHT)
    if (dLeft < OUTPUT_THRESHHOLD){
      rotateShip(false)
    } else if (dRight < OUTPUT_THRESHHOLD){
      rotateShip(true)
    } else {
      //stop rotating
      ship.rot = 0
    }

    //shoot all the time
    if (aiShootTime == 0){
      aiShootTime = Math.ceil(FPS / RATE_OF_FIRE)
      if (!ship.dead){
        ship.canShoot = true
      }
      shootLaser()
    } else {
      aiShootTime--
    }
  }

  //tick the music
  music.tick()

  // draw space
  ctx.fillStyle = 'black'
  ctx.fillRect(0,0, canv.width, canv.height)

  // draw the asteroids
  ctx.lineWidth = SHIP_SIZE / 20
  var x, y, r, a, vert, offs
  for (var i = 0; i < roids.length; i++){
    ctx.strokeStyle = 'slategrey'

    //get the asteroid properties
    x = roids[i].x
    y = roids[i].y
    r = roids[i].r
    a = roids[i].a
    vert = roids[i].vert
    offs = roids[i].offs

    //draw the path
    ctx.beginPath()
    ctx.moveTo(
      x + r * offs[0] * Math.cos(a),
      y + r * offs[0] * Math.sin(a),
    )

    //draw the polygon
    for (var j = 1; j < vert; j++){
      ctx.lineTo(
        x + r * offs[j] * Math.cos(a + j * Math.PI * 2 / vert),
        y + r * offs[j] * Math.sin(a + j * Math.PI * 2 / vert),
      )
    }
    ctx.closePath()
    ctx.stroke()

    //show asteroid's collision circle
    if (SHOW_BOUNDING){
      ctx.strokeStyle = 'lime'
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2, false)
      ctx.stroke()
    }
  }

  // thrust the ship
  if (ship.thrusting && !ship.dead){
    ship.thrust.x += SHIP_THRUST * Math.cos(ship.a) / FPS
    ship.thrust.y -= SHIP_THRUST * Math.sin(ship.a) / FPS
    fxThrust.play()

    //draw the thruster
    if (!exploding && blinkOn) {
      ctx.fillStyle ='red'
      ctx.strokeStyle = 'yellow'
      ctx.lineWidth = SHIP_SIZE / 10
      ctx.beginPath()
      ctx.moveTo( //rear left
        ship.x - ship.r * ( 2 / 3 * Math.cos(ship.a) + .5 * Math.sin(ship.a)),
        ship.y + ship.r * ( 2 / 3 * Math.sin(ship.a) - .5 * Math.cos(ship.a)),
      )
      ctx.lineTo( //rear center behind the ship
        ship.x - ship.r * 5 / 3 * Math.cos(ship.a),
        ship.y + ship.r * 5 / 3 * Math.sin(ship.a),
      )
      ctx.lineTo( //rear right
        ship.x - ship.r * ( 2 / 3 * Math.cos(ship.a) - .5 * Math.sin(ship.a)),
        ship.y + ship.r * ( 2 / 3 * Math.sin(ship.a) + .5 * Math.cos(ship.a)),
      )
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
  } else {
    ship.thrust.x -= FRICTION * ship.thrust.x / FPS
    ship.thrust.y -= FRICTION * ship.thrust.y / FPS
    fxThrust.stop()
  }

  //draw trianglular ship
  if (!exploding){
    if (blinkOn && !ship.dead){
      drawShip(ship.x, ship.y, ship.a)
    }

    //handle blinking
    if (ship.blinkNum > 0){
        //reduce the blink time
        ship.blinkTime --

        //reduce the blink num
        if (ship.blinkTime == 0){
          ship.blinkTime = Math.ceil(SHIP_BLINK_DUR * FPS)
          ship.blinkNum--
        }
    }
  } else {
    //draw the explosion
    ctx.fillStyle = 'darkred'
    ctx.beginPath()
    ctx.arc(ship.x, ship.y, 1.7 * ship.r, 0, Math.PI * 2, false)
    ctx.fill()
    ctx.fillStyle = 'red'
    ctx.beginPath()
    ctx.arc(ship.x, ship.y, 1.4 * ship.r, 0, Math.PI * 2, false)
    ctx.fill()
    ctx.fillStyle = 'orange'
    ctx.beginPath()
    ctx.arc(ship.x, ship.y, 1.1 * ship.r, 0, Math.PI * 2, false)
    ctx.fill()
    ctx.fillStyle = 'yellow'
    ctx.beginPath()
    ctx.arc(ship.x, ship.y, 0.8 * ship.r, 0, Math.PI * 2, false)
    ctx.fill()
    ctx.fillStyle = 'white'
    ctx.beginPath()
    ctx.arc(ship.x, ship.y, 0.5 * ship.r, 0, Math.PI * 2, false)
    ctx.fill()
  }

  //show ship's collision circle
  if (SHOW_BOUNDING){
    ctx.strokeStyle = 'lime'
    ctx.beginPath()
    ctx.arc(ship.x, ship.y, ship.r, 0, Math.PI * 2, false)
    ctx.stroke()
  }

  //show ship's center dot
  if (SHOW_CENTER_DOT){
    ctx.fillStyle = 'red'
    ctx.fillRect(ship.x - 1, ship.y - 1, 2, 2)
  }

  //draw the lasers
  for (var i = 0; i < ship.lasers.length; i++){
    if (ship.lasers[i].explodeTime == 0){
      ctx.fillStyle = 'salmon'
      ctx.beginPath()
      ctx.arc(ship.lasers[i].x, ship.lasers[i].y, SHIP_SIZE / 15, 0, Math.PI * 2, false)
      ctx.fill()
    } else {
      //draw the explosion
      ctx.fillStyle = 'orangered'
      ctx.beginPath()
      ctx.arc(ship.lasers[i].x, ship.lasers[i].y, ship.r * .75, 0, Math.PI * 2, false)
      ctx.fill()
      ctx.fillStyle = 'salmon'
      ctx.beginPath()
      ctx.arc(ship.lasers[i].x, ship.lasers[i].y, ship.r * .5, 0, Math.PI * 2, false)
      ctx.fill()
      ctx.fillStyle = 'pink'
      ctx.beginPath()
      ctx.arc(ship.lasers[i].x, ship.lasers[i].y, ship.r * .25, 0, Math.PI * 2, false)
      ctx.fill()
    }
  }

  //draw the game text
  if (textAlpha >= 0){
    ctx.textAlign = 'center'
    ctx.textBaseline ='middle'
    ctx.fillStyle = 'rgba(255,255,255, ' + textAlpha + ')'
    ctx.font = 'small-caps ' + TEXT_SIZE + 'px dejavu sans mono'
    ctx.fillText(text, canv.width / 2, canv.height * 0.75)
    textAlpha -= (1.0 / TEXT_FADE_TIME / FPS)
  } else if (ship.dead){
    GAME_ON = false
    homeScreen()
  }

  //draw lives
  var lifeColor
  for (var i = 0; i < lives; i++){
    lifeColor = exploding && i == (lives - 1) ? 'red': 'white'
    drawShip(SHIP_SIZE + i * SHIP_SIZE * 1.2, SHIP_SIZE, 0.5 * Math.PI, lifeColor)
  }

  //draw score
  ctx.textAlign = 'right'
  ctx.textBaseline ='middle'
  ctx.fillStyle = 'white'
  ctx.font =  TEXT_SIZE + 'px dejavu sans mono'
  ctx.fillText(score, canv.width - SHIP_SIZE / 2, SHIP_SIZE)

  //draw high score
  ctx.textAlign = 'center'
  ctx.textBaseline ='middle'
  ctx.fillStyle = 'white'
  ctx.font =  (TEXT_SIZE * 0.75) + 'px dejavu sans mono'
  ctx.fillText('BEST ' + scoreHigh, canv.width / 2, SHIP_SIZE)


  //detect laser hit on asteroid
  var ax, ay, ar, lx, ly
  for (var i = roids.length - 1; i >= 0; i--){
    //grab the asteroid properties
    ax = roids[i].x
    ay = roids[i].y
    ar = roids[i].r

    //loop over the lasers
    for (var j = ship.lasers.length - 1; j >= 0; j--){
      //grab the laser properties
      lx = ship.lasers[j].x
      ly = ship.lasers[j].y

      //detect hits
      if (ship.lasers[j].explodeTime == 0 && distBetweenPoints(ax, ay, lx, ly) < ar){
        //destroy the asteroid and activate laser explosion
        destroyAsteroid(i)
        ship.lasers[j].explodeTime = Math.ceil(LASER_EXPLODE_DUR * FPS)
        break
      }

    }
  }

  //check for asteroid collisions
  if (!exploding){
    if (ship.blinkNum == 0 && !ship.dead){
      for (var i = 0; i < roids.length; i++){
        if (distBetweenPoints(ship.x, ship.y, roids[i].x, roids[i].y) < ship.r + roids[i].r){
          explodeShip()
          destroyAsteroid(i)
          break
        }
      }
    }

    //rotate the ship
    ship.a += ship.rot

    //keep the angle between 0 and 2 pi
    if (ship.a < 0){
      ship.a += (Math.PI * 2)
    } else if (ship.a >= (Math.PI * 2)){
      ship.a -= (Math.PI * 2)
    }

    //move the ship
    ship.x += ship.thrust.x
    ship.y += ship.thrust.y
  } else {
    //decrement explosion time
    ship.explodeTime --

    //reset the ship after explosion
    if (ship.explodeTime == 0){
      lives--
      if (lives == 0){
        gameOver()
      } else {
      ship = newShip()
    }
    }
  }

  //handle edge of screen
  if (ship.x < 0 - ship.r){
    ship.x = canv.width + ship.r
  } else if (ship.x > canv.width + ship.r){
    ship.x = 0 - ship.r
  }
  if (ship.y < 0 - ship.r){
    ship.y = canv.height + ship.r
  } else if (ship.y > canv.height + ship.r){
    ship.y = 0 - ship.r
  }

  //move the lasers
  for (var i = ship.lasers.length - 1; i >= 0; i--){
    //check distance travelled
    if (ship.lasers[i].dist > LASER_DIST * canv.width){
      ship.lasers.splice(i, 1)
      continue
    }

    //handle the explosion
    if (ship.lasers[i].explodeTime > 0){
      ship.lasers[i].explodeTime--

      //destroy the lasers after the duration is up
      if (ship.lasers[i].explodeTime == 0){
        ship.lasers.splice(i, 1)
        continue
      }
    } else {
      //move the laser
      ship.lasers[i].x += ship.lasers[i].xv
      ship.lasers[i].y += ship.lasers[i].yv

      //calculate the distance travelled
      ship.lasers[i].dist += Math.sqrt(Math.pow(ship.lasers[i].xv, 2) + Math.pow(ship.lasers[i].yv, 2))
    }


    //handle edge of screen
    if (ship.lasers[i].x < 0){
      ship.lasers[i].x = canv.width
    } else if (ship.lasers[i].x > canv.width){
      ship.lasers[i].x = 0
    }
    if (ship.lasers[i].y < 0){
      ship.lasers[i].y = canv.height
    } else if (ship.lasers[i].y > canv.height){
      ship.lasers[i].y = 0
    }

  }

  //move the asteroid
  for (var i = 0; i < roids.length; i++){
    roids[i].x += roids[i].xv
    roids[i].y += roids[i].yv

    //hands edge of screen
    if (roids[i].x < 0 - roids[i].r){
      roids[i].x = canv.width + roids[i].r
    } else if (roids[i].x > canv.width + roids[i].r){
      roids[i].x = 0 - roids[i].r
    }
    if (roids[i].y < 0 - roids[i].r){
      roids[i].y = canv.height + roids[i].r
    } else if (roids[i].y > canv.height + roids[i].r){
      roids[i].y = 0 - roids[i].r
    }
  }
}