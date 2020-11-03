//Author: Luke Fredrickson
//Authorization flow adapted and modified from https://github.com/spotify/web-api-auth-examples

//import required libraries
var express = require("express");
var request = require("request");
var cors = require("cors");
var querystring = require("query-string");
var cookieParser = require("cookie-parser");
var crypto = require("crypto");
var socketio = require("socket.io-client");

var websiteState = require("./websiteState").state;

//grab network config info from network-info.json
var networkInfo = require("./network-info.json");
var baseUrl = networkInfo.baseUrl;
var appPort = networkInfo.frontEndPort;
var backEndPort = networkInfo.backEndPort;



//initialize Express server using public dir and cors, cookie-parser middleware
var app = express();
app.use(express.static(__dirname + "/views"))
    .use(cors())
    .use(cookieParser());
app.use(express.static(__dirname + '/styles'));
app.set('view engine', 'ejs');

//front end for visualizer website
var server = require('http').Server(app);
var io = require('socket.io')(server);



//spotify api information
var client_id = "a80ce077cafc435b993b38d5a9bb9762";
var client_secret = require("./keys.json").spotify_client_secret;
var redirect_uri = baseUrl + ":" + appPort.toString() + "/callback";

//key for state ID cookie
var stateKey = "spotify_auth_state";

/* ======================================================
        WebSocket communication between front-end and back-end server.
    ====================================================== */
//connect to the back-end server via websockets

var socket = io.listen(server)


socket.on('connection',function(socket){
    socket.emit('announcements', {message: "Socket Connection Worked "});
})



/*

var socket = socketio.connect(baseUrl + ":" + backEndPort.toString() + "/", {
    reconnection: true
});
socket.on("connect", () => {
    console.log("connected to back-end server");
});
*/
/* ==========
        ROUTES
    ========== */
//main visualization page
/*
app.get("/visualizer", function(req, res) {
    res.redirect("visualizer.html");
});
*/
app.get("/HomePage", function (req,res){
    res.render('header');
})
//login page (redirects to spotify auth page) All GOOD
app.get("/login", function(req, res) {
    //initialize random state ID and store in cookie
    var state = crypto.randomBytes(16).toString("hex");
    res.cookie(stateKey, state);

    // your application requests authorization
    var scope = "user-read-currently-playing";

    // whether the user must reauthorize upon every login
    var showDialog = true;

    //redirect to spotify authorization page
    res.redirect(
        "https://accounts.spotify.com/authorize?" +
            querystring.stringify({
                response_type: "code",
                client_id: client_id,
                scope: scope,
                redirect_uri: redirect_uri,
                state: state,
                show_dialog: showDialog
            })
    );
});

//callback from Spotify authorization page
app.get("/callback", function(req, res) {
    //get authorization code contained in Spotify's callback request
    var code = req.query.code || null;
    var state = req.query.state || null;
    var storedState = req.cookies ? req.cookies[stateKey] : null;

    //check that state contained in Spotify's callback matches original request state
    //this prevents cross-site request forgery
    //if state doesn't match, redirect to error page
    if (state === null || state !== storedState) {
        res.redirect(
            "/#" +
                querystring.stringify({
                    error: "state_mismatch"
                })
        );
    }

    //if state matches, continue on!
    else {
        //clear the state cookie
        res.clearCookie(stateKey);
        //use authorization code, client id and client secret to get access token and refresh token from Spotify
        //access token allows API request for a specific user's Spotify information.
        //refresh token allows API request to get a new access token once original expires.
        var authOptions = {
            url: "https://accounts.spotify.com/api/token",
            form: {
                code: code,
                redirect_uri: redirect_uri,
                grant_type: "authorization_code"
            },
            headers: {
                //authorization header is encoded in base64
                Authorization:
                    "Basic " +
                    Buffer.from(client_id + ":" + client_secret).toString(
                        "base64"
                    )
            },
            json: true
        };
         //send http request to Spotify to get access token and refresh token
         request.post(authOptions, function(error, response, body) {
            if (!error && response.statusCode === 200) {
                //grab access token and refresh token from API response
                    websiteState.tokens.access_token = body.access_token
                    websiteState.tokens.refresh_token = body.refresh_token;
                    console.log("access_token: " + websiteState.tokens.access_token);
                    //refreshAccessToken(websiteState);
                    res.redirect("/HomePage");
                 
            }
            else {
                res.redirect(
                    "/#" +
                        querystring.stringify({
                            error: "invalid_token"
                        })
                );
            }
        });  
/* 
//Ignore for now. WILL USE ONCE WE GET THE BOARD
        //send http request to Spotify to get access token and refresh token
        request.post(authOptions, function(error, response, body) {
            if (!error && response.statusCode === 200) {
                //grab access token and refresh token from API response
                var access_token = body.access_token,
                    refresh_token = body.refresh_token;

                //ONCE ACCESS TOKEN IS PASSED TO BACK-END,
                //VISUALIZATION MAY BEGIN

                //pass access token to back-end serverf
                socket.emit("accessToken", access_token);
                console.log("access token passed to back-end");
                console.log("access_token: " + access_token);
                //get new access token upon request from back-end server
                socket.on("refreshAccessToken", () => {
                    console.log("token refresh requested");
                    var authOptions = {
                        url: "https://accounts.spotify.com/api/token",
                        headers: {
                            Authorization:
                                "Basic " +
                                Buffer.from(
                                    client_id + ":" + client_secret
                                ).toString("base64")
                        },
                        form: {
                            grant_type: "refresh_token",
                            refresh_token: refresh_token
                        },
                        json: true
                    };
                    request.post(authOptions, function(error, response, body) {
                        if (!error && response.statusCode === 200) {
                            var new_access_token = body.access_token;
                            //pass new access token to back-end server
                            socket.emit("accessToken", new_access_token);
                            console.log("new access token passed to back-end");
                            console.log("access_token: " + new_access_token);
                        }
                    });
                });

                //redirect to main interface page
                res.redirect("/visualizer");
            }

            //if authorization code is rejected, redirect with invalid token error
            else {
                res.redirect(
                    "/#" +
                        querystring.stringify({
                            error: "invalid_token"
                        })
                );
            }
        });
*/
    }
});

app.get('/visualizer',  function(req,res){
    refreshAccessToken(websiteState);
    res.render("visualizer");
})



/*
*  Start of function testing 
*/
function connect(websiteState) {
    stopPingLoop(websiteState);
    initialize(websiteState, websiteState.tokens.accessToken)

}
/**
 *  initializes the visualizer by setting access token and starting ping loop
 *  Done
 */
function initialize(websiteState, access_token) {
    // update state with access token
    websiteState.tokens.accessToken = access_token;
    websiteState.api.headers = { Authorization: "Bearer " + access_token };
    // start the ping loop
    ping(websiteState);
}

/**
 * request new access token from express server if required
 * Need to work on this
 */
function refreshAccessToken(websiteState) {
    console.log("Refreshing access token...");

    console.log("token refresh requested");
    var authOptions = {
        url: "https://accounts.spotify.com/api/token",
        headers: {
            Authorization: "Basic " + Buffer.from(client_id + ":" + client_secret ).toString("base64")
        },
        form: {
            grant_type: "refresh_token",
            refresh_token: websiteState.tokens.refresh_token
        },
        json: true
    };
    request.post(authOptions, function(error, response, body) {
        if (!error && response.statusCode === 200) {
            var new_access_token = body.access_token;
            //pass new access token to back-end server
            websiteState.tokens.accessToken = new_access_token;
            connect(websiteState);
           // socket.emit("accessToken", new_access_token); // We need to do shit here fuck!!!!!!!
            console.log("new access token passed to back-end");
            console.log("access_token: " + new_access_token);
        }
    });
}

/**
 * ping the spotify API for the currently playing song after a delay specified in state 
 * DONE
 */
function ping(websiteState) {
    websiteState.pingLoop = setTimeout(() => fetchCurrentlyPlaying(websiteState),
    websiteState.api.pingDelay);
}

/**
 * stops the ping loop, effectively stopping the visualizer until a new access token is passed
 * DONE
 */
function stopPingLoop(websiteState) {
    if (websiteState.pingLoop !== undefined) {
        clearTimeout(websiteState.pingLoop);
        stopVisualizer(websiteState);
        console.log("\n\t==========\n\tTERMINATED\n\t==========\n");
    }
}

/**
 * gets the currently playing song + track progress from spotify API
 * DONE 
 */
function fetchCurrentlyPlaying(websiteState) {
    // grab the current time
    var timestamp = Date.now();

    // request the currently playing song from spotify API
    request.get(
        {
            url: websiteState.api.currentlyPlaying,
            headers: websiteState.api.headers,
            json: true
        },
        (error, response, body) => {
            // access token is expired, we must request a new one
            if (response.statusCode === 401) {                    
                refreshAccessToken(websiteState);
                return;
            }
            // no device is playing music
            else if (response.statusCode === 204) {
                console.log("\nNo playback detected");
                if (websiteState.visualizer.active) {
                    stopVisualizer(websiteState);
                }
                // keep listening in case playback resumes
                ping(websiteState);
            }
            // no error, proceed
            else {
                // process the response
                processResponse(websiteState, {
                    track: body.item,
                    playing: body.is_playing,
                    // account for time to call api in progress
                    progress: body.progress_ms + (Date.now() - timestamp)
                });
            }
        }
    );
}

/**
 * gets the song analysis (beat intervals, etc) for the current song from the spotify API
 * DONE
 */
function fetchTrackData(websiteState, { track, progress }) {
    // fetch the current time
    var timestamp = Date.now();

    // request song analysis from spotify
    request.get(
        {
            url: websiteState.api.trackAnalysis + track.id,
            headers: websiteState.api.headers,
            json: true
        },
        (error, response, body) => {
            // access token is expired, we must request a new one
            if (response.statusCode === 401) {
                refreshAccessToken(websiteState);
                return;
            }
            // no error, proceed
            else {
                var analysis = body;
                // if the track has no analysis data, don't visualize it
                if (
                    analysis === undefined ||
                    analysis["beats"] === undefined ||
                    analysis["beats"].length == 0
                ) {
                    websiteState.visualizer.hasAnalysis = false;
                } else {
                    websiteState.visualizer.hasAnalysis = true;
                    // adjust beat data for ease of use
                    normalizeIntervals(websiteState, { track, analysis });
                }
                // account for time to call api in initial timestamp
                var initialTimestamp = Date.now() - (Date.now() - timestamp);
                syncTrackProgress(websiteState, progress, initialTimestamp);
                // set the new currently playing song
                setCurrentlyPlaying(websiteState, {
                    track,
                    analysis
                });
            }
        }
    );
}

/**
 * figure out what to do, according to state and track data 
 * might need to work on this when no song playing for front end actually done in stopVisualizer funciton so this IS
 * DONE
 */
function processResponse(websiteState, { track, playing, progress }) {
    // check that the song we have is the currently playing song
    var songsInSync =
        JSON.stringify(websiteState.visualizer.currentlyPlaying) ===
        JSON.stringify(track);

    // approximate progress vs api progress, and error between
    var progressStats = {
        client: websiteState.visualizer.trackProgress,
        server: progress,
        error: websiteState.visualizer.trackProgress - progress
    };

    // log the error between our approximate progress and the server progress
    console.log(`\nclient progress: ${progressStats.client}ms`);
    console.log(`server progress: ${progressStats.server}ms`);
    console.log(`Sync error: ${Math.round(progressStats.error)}ms\n`);

    // if nothing is playing, ping state
    if (track === null || track === undefined) {
        return ping(websiteState);
    }

    // if something is playing, but visualizer isn't on
    if (playing && !websiteState.visualizer.active) {
        // start the visualizer if the songs are synced
        if (songsInSync) {
            return startVisualizer(websiteState);
        }
        // otherwise, get the data for the new track
        return fetchTrackData(websiteState, { track, progress });
    }

    // if nothing is playing but the visualizer is active
    if (!playing && websiteState.visualizer.active) {
        stopVisualizer(websiteState);
    }

    // if the wrong song is playing
    if (playing && websiteState.visualizer.active && !songsInSync) {
        // get the data for the new track
        stopVisualizer(websiteState);
        return fetchTrackData(websiteState, { track, progress });
    }

    // if the approximate track progress and the api track progress fall out of sync by more than 250ms
    // resync the progress and the beat loop
    if (
        playing &&
        websiteState.visualizer.active &&
        songsInSync &&
        Math.abs(progressStats.error) > websiteState.visualizer.syncOffsetThreshold
    ) {
        var initialTimestamp = Date.now();
        stopBeatLoop(websiteState);
        syncTrackProgress(websiteState, progress, initialTimestamp);
        syncBeats(websiteState);
    }

    // keep the ping loop going
    ping(websiteState);
}

/**
 * Sets the currently playing song and track analysis in state
 * DONE
 */
function setCurrentlyPlaying(websiteState, { track, analysis }) {
    websiteState.visualizer.currentlyPlaying = track;
    websiteState.visualizer.trackAnalysis = analysis;

    startVisualizer(websiteState);

    console.log(
        `Now playing: ${
            websiteState.visualizer.currentlyPlaying.album.artists[0].name
        } – ${websiteState.visualizer.currentlyPlaying.name}`
    );
}

/**
 * sets visualizer to active, syncs beats, and begins ping loop
 * DONE
 */
function startVisualizer(websiteState) {
    console.log("\nVisualizer started");
    websiteState.visualizer.active = true;
    syncBeats(websiteState);
    ping(websiteState);
}

/**
 * sets visualizer to inactive, terminates beat loop, and turns off led strip
 * Done. Background goes defualt to the purple black gradient when stopped.
 */
function stopVisualizer(websiteState) {
    console.log("\nVisualizer stopped");
    websiteState.visualizer.active = false;
    // stop the track progress loop if it's running
    stopTrackProgressLoop(websiteState);
    // stop the beat loop if it's running
    stopBeatLoop(websiteState);
    socket.emit('stopVisualuizer',{backgroundColor: "rgb(25,20,20)", backGroundImage: "radial-gradient(purple,rgb(25,20,20)"});
    // black out the led strip DONT NEED THIS
    /*
    for (var i = 0; i < NUM_LEDS; i++) {
        pixelData[i] = 0;
    }
    ws281x.render(pixelData);
    */
}

/**
 * resets any track progress approximation loop currently running and begins a new loop
 * DONE
 */
function syncTrackProgress(websiteState, initialProgress, initialTimestamp) {
    websiteState.visualizer.initialTimestamp = initialTimestamp;
    // stop the track progress update loop
    stopTrackProgressLoop(websiteState);
    // set the new approximate track progress
    setTrackProgress(websiteState, initialProgress);
    // begin the track progress update loop
    startTrackProgressLoop(websiteState);
}

/**
 * sets the approximation of track progress
 * DONE
 */
function setTrackProgress(websiteState, initialProgress) {
    websiteState.visualizer.initialTrackProgress = initialProgress;
}

/**
 * A setInterval loop which ticks approximate track progress
 * DONE
 */
function startTrackProgressLoop(websiteState) {
    calculateTrackProgress(websiteState);
    // calculate and set track progress on a specified tick rate
    websiteState.visualizer.trackProgressLoop = setInterval(() => {
        calculateTrackProgress(websiteState);
    }, websiteState.visualizer.trackProgressTickRate);
}

/**
 * calculates current song progress with timestamp now and timestamp when song started playing
 * DONE
 */
function calculateTrackProgress(websiteState) {
    websiteState.visualizer.trackProgress =
        websiteState.visualizer.initialTrackProgress +
        (Date.now() - websiteState.visualizer.initialTimestamp);
}

/**
 * stops the approximate track progress loop
 * DONE
 */
function stopTrackProgressLoop(websiteState) {
    if (websiteState.visualizer.trackProgressLoop !== undefined) {
        clearTimeout(websiteState.visualizer.trackProgressLoop);
    }
}

/**
 * Method borrowed from https://github.com/zachwinter/kaleidosync
 * Beat interval data is not present for entire duration of track data, and it is in seconds, not ms
 * We must make sure the first beat starts at 0, and the last ends at the end of the track
 * Then convert all time data to ms.
 * DONE
 */
function normalizeIntervals(websiteState, { track, analysis }) {
    if (websiteState.visualizer.hasAnalysis) {
        const beats = analysis["beats"];
        /** Ensure first interval of each type starts at zero. */
        beats[0].duration = beats[0].start + beats[0].duration;
        beats[0].start = 0;

        /** Ensure last interval of each type ends at the very end of the track. */
        beats[beats.length - 1].duration =
            track.duration_ms / 1000 - beats[beats.length - 1].start;

        /** Convert every time value to milliseconds for our later convenience. */
        beats.forEach(interval => {
            interval.start = interval.start * 1000;
            interval.duration = interval.duration * 1000;
        });
    }
}

/**
 * Manages the beat fire loop and detection of the active beat.
 * DONE
 */
function syncBeats(state) {
    if (websiteState.visualizer.hasAnalysis) {
        // reset the active beat
        websiteState.visualizer.activeBeat = {};
        websiteState.visualizer.activeBeatIndex = 0;

        // grab state vars
        var trackProgress = websiteState.visualizer.trackProgress;
        var beats = websiteState.visualizer.trackAnalysis["beats"];

        // find and set the currently active beat
        for (var i = 0; i < beats.length - 2; i++) {
            if (
                trackProgress > beats[i].start &&
                trackProgress < beats[i + 1].start
            ) {
                websiteState.visualizer.activeBeat = beats[i];
                websiteState.visualizer.activeBeatIndex = i;
                break;
            }
        }
        // stage the beat
        stageBeat(websiteState);
    }
}

/**
 * calculates the time until the next beat based on current beat duration and track progress
 * DONE
 */
function calculateTimeUntilNextBeat(websiteState) {
    var activeBeatStart = websiteState.visualizer.activeBeat.start;
    var activeBeatDuration = websiteState.visualizer.activeBeat.duration;
    var trackProgress = websiteState.visualizer.trackProgress;
    var timeUntilNextBeat =
        activeBeatDuration - (trackProgress - activeBeatStart);
    return timeUntilNextBeat;
}

/**
 * stage a beat to fire after a delay
 * DONE
 */
function stageBeat(websiteState) {
    //set the timeout id to a variable in state for convenient loop cancellation.
    websiteState.visualizer.beatLoop = setTimeout(
        () => fireBeat(websiteState),
        calculateTimeUntilNextBeat(websiteState)
    );
}

/**
 * stops the beat loop
 * DONE
 */
function stopBeatLoop(websiteState) {
    if (websiteState.visualizer.beatLoop !== undefined) {
        clearTimeout(websiteState.visualizer.beatLoop);
    }
}

/**
 * Fires a beat on the LED strip.
 * Done with website. Need to uncomment led code 
 */
function fireBeat(websiteState) {
    // log the beat to console if you want to
    /*
    console.log(
        `\nBEAT - ${Math.round(state.visualizer.activeBeat.start)}ms\n`
    );
    */

    // grab a random color from the options that is different from the previous color
    var randColor;
    do {
        randColor = Math.floor(
            Math.random() * Math.floor(websiteState.visualizer.colors.length)
        );
    } while (randColor == websiteState.visualizer.lastColor);
    //set the new previous color
    websiteState.visualizer.lastColor = randColor;

    /*

    // set every LED on the strip to that color
    for (var i = 0; i < NUM_LEDS; i++) {
        pixelData[i] = websiteState.visualizer.colors[randColor];
    }

    //render the LED strip
    ws281x.render(pixelData);
    */
    // continue the beat loop by incrementing to the next beat
    setBackgroundColor(randColor);

    incrementBeat(websiteState);
    /*}*/
}

/**
 * sets the new active beat to the next beat in the array (if it exists)
 * DONE
 */
function incrementBeat(websiteState) {
    var beats = websiteState.visualizer.trackAnalysis["beats"];
    var lastBeatIndex = websiteState.visualizer.activeBeatIndex;
    // if the last beat index is the last beat of the song, stop beat loop
    if (beats.length - 1 !== lastBeatIndex) {
        // stage the beat
        stageBeat(websiteState);

        // update the active beat to be the next beat
        var nextBeat = beats[lastBeatIndex + 1];
        websiteState.visualizer.activeBeat = nextBeat;
        websiteState.visualizer.activeBeatIndex = lastBeatIndex + 1;
    }
}
/*
 * Setting website background color
*/
function setBackgroundColor(randColor){
    hexString = websiteState.visualizer.colors[randColor].toString(16);
    //console.log("Hex of Number is #" + hexString) //Testing purposes to see right color was being shown
    socket.emit('changeColor', {message: hexString})

}

server.listen(appPort);
console.log("Listening on " + appPort.toString());




//This is for the website refresh token NOT USING IT
/*
app.get('/refresh_token', function(req, res) {

    // requesting access token from refresh token
    //var refresh_token = req.query.refresh_token;
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
      form: {
        grant_type: 'refresh_token',
        refresh_token: websiteState.tokens.refresh_token
      },
      json: true
    };
  
    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {
        websiteState.tokens.accessToken = body.access_token;
        //I dont think i will need this part but lets keeop it for now. the Send part
        res.send({
          'access_token': websiteState.tokens.accessToken 
        });
      }
      else {
        res.redirect(
            "/#" +
                querystring.stringify({
                    error: "Refresh Token Error"
                })
        );
    }
    });
});
*/


