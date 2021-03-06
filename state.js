//Author: Luke Fredrickson
//state.js file adapted and modified from https://github.com/zachwinter/kaleidosync

module.exports = {
    state: {
        pingLoop: undefined,

        io: {
            socket: null
        },

        api: {
            currentlyPlaying:
                "https://api.spotify.com/v1/me/player/currently-playing",
            trackAnalysis: "https://api.spotify.com/v1/audio-analysis/",
            trackFeatures: "https://api.spotify.com/v1/audio-features/",
            seek: "https://api.spotify.com/v1/me/player/seek",
            headers: {},
            pingDelay: 1000
        },

        tokens: {
            accessToken: ""
        },

        visualizer: {
            syncOffsetThreshold: 100,

            beatLoop: undefined,
            activeBeat: {},
            activeBeatIndex: 0,

            //colors to cycle through
            // Decimal -> Hex -> Color
            colors: [
                16711680, //FF0000: Red 
                16744192, //FF7F00: Orange
                16776960, //FFFF00: Yellow
                8388352,  //7FFF00: Yellow-Green
                65280,    //00FF00  Green
                65407,    //00FF7F: Light green
                65535,    //00FFFF: Teal
                32767,    //007FFF: Light-Blue
                255,      //0000FF: Blue
                8323327,  //7F00FF: Purple
                16711935, //FF00FF: Pink
                16711807  //FF007F: More pink lol
            ],
            //index of the last color, to avoid duplicates
            lastColor: -1,

            /** Current track, track analysis, and track features. */
            currentlyPlaying: {},
            trackAnalysis: {},
            hasAnalysis: false,

            /** Timestamps & progress. */
            trackProgressLoop: undefined,
            trackProgressTickRate: 5,
            initialTimestamp: 0,
            initialTrackProgress: 0,
            trackProgress: 0,

            /** Playing state. */
            active: false
        }
    }
};
