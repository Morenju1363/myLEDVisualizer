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
app.use(express.static(__dirname + "/public"))
    .use(cors())
    .use(cookieParser());
app.use(express.static(__dirname + '/styles'));

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
var socket = socketio.connect(baseUrl + ":" + backEndPort.toString() + "/", {
    reconnection: true
});
socket.on("connect", () => {
    console.log("connected to back-end server");
});

/* ==========
        ROUTES
    ========== */
//main visualization page
app.get("/visualizer", function(req, res) {
    res.redirect("visualizer.html");
});

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
                    res.redirect("/visualizer");
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


//This is for the website refresh token
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

app.listen(appPort);
console.log("Listening on " + appPort.toString());
