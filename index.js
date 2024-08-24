import { writeFileSync, existsSync, mkdirSync, unlink, unlinkSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import express, { urlencoded, json } from 'express';
import session from 'express-session';

import sqlite3 from 'sqlite3';

import { config } from 'dotenv';
import sharp from 'sharp';

import { Server } from 'socket.io';

import { uploadGPX, uploadPhoto } from './upload.mjs';

const app = express();
const server = createServer(app);
const io = new Server(server);

config({ path: './.env' });

const db = new sqlite3.Database(`./db/${process.env.DATABASE}.db`, (error) => {
    if (error)
        console.error(error.message);
    else
        console.log("Connected to database");
});

db.run("CREATE TABLE IF NOT EXISTS Messages (" +
    "id INTEGER PRIMARY KEY UNIQUE, " +
    "unixTime INTEGER, " +
    "messageType TEXT, " +
    "latitude REAL, " +
    "longitude REAL, " +
    "altitude REAL, " +
    "batteryState TEXT, " +
    "messageContent TEXT" +
    ")",
    function (err) {
        if (err)
            console.error(err.message);
    }
);

db.run("CREATE TABLE IF NOT EXISTS Photos (" +
    "id INTEGER PRIMARY KEY UNIQUE, " +
    "unixTime INTEGER, " +
    "latitude REAL, " +
    "longitude REAL, " +
    "name TEXT, " +
    "show INTEGER" +
    ")",
    function (err) {
        if (err)
            console.error(err.message);
    }
);

let latestUnixTime = 0;
let lastRequestTime = new Date(0);

function unixTimeToDate(unix) {
    const date = new Date(unix * 1000);

    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Months are 0-based
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');

    const datetimeString = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}-0000`;

    console.log('unixTimeToData: ' + unix + ' -> ' + datetimeString);

    return datetimeString;
}

function checkLogin(req, res, next) {
    if (req.session.loggedin) {
        next();
    } else {
        // return res.redirect('/login');
        return res.sendFile(join(__dirname, 'static', 'login.html'));
    }
}

function allDataFetched() {
    db.get("SELECT MAX(unixTime) maxUnixTime FROM Messages", [], function (err, row) {
        if (err) {
            console.log(err);
            return;
        } else if (row) {
            latestUnixTime = row.maxUnixTime;
            console.log("latestUnixTime: " + latestUnixTime);
            unixTimeToDate(latestUnixTime);

            try {
                writeFileSync('./cache.json', JSON.stringify({ latestUnixTime: latestUnixTime, lastRequestTime: lastRequestTime }), 'utf-8');
            } catch (error) {
                console.log(error.message);
            }
        } else {
            console.log("No row returned");
        }
    });

    lastRequestTime = Date.now();
}

async function fetchSpotData(start) {
    console.log(`fetchSpotData(${start})`);
    let startDate = unixTimeToDate(latestUnixTime);

    // get data from last entry, if last entry is more than 5 minutes ago
    // if no last entry, get as much as possible...
    const API_URL = "https://api.findmespot.com/spot-main-web/consumer/rest-api/2.0/public/feed/" + process.env.SPOT_API_KEY + "/message.json";
    console.log(`API_URL: ${API_URL}`);

    const res = await fetch(API_URL + `?start=${start}&startDate=${startDate}`);
    let data;
    try {
	data = await res.json();
    } catch (error) {
        console.log(error);
        return;
    }

    if (data['response']['errors']) {
        allDataFetched();
        return;
    }

    const dataKeys = [
        'id', 'unixTime', 'messageType', 'latitude', 'longitude', 'altitude', 'batteryState', 'messageContent'
    ];

    let placeholders = dataKeys.map((key) => '?').join(', ');
    let columns = dataKeys.join(', ');
    let query = `INSERT INTO Messages(${columns}) VALUES(${placeholders})`;

    const messages = data['response']['feedMessageResponse']['messages']['message'];

    if (messages === undefined || messages === null)
        return;

    if (Array.isArray(messages)) {
        for (const msg of messages) {
            let params = dataKeys.map((key) => msg[key]);

            // add message to db
            db.run(query, params, function (err) { });
        }
    } else {
        let params = dataKeys.map((key) => messages[key]);

        db.run(query, params, function (err) { });
    }

    const count = data['response']['feedMessageResponse']['count'];
    if (count && count > 50)
        await fetchSpotData(start + 50);
    else
        allDataFetched();
}

app.use(urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: true,
    saveUninitialized: true
}));
app.use(json());

app.get('/edit', checkLogin, function (req, res) {
    res.sendFile(join(__dirname, 'editor', 'edit.html'));
});

app.get('/login', checkLogin, function (req, res) {
    res.sendFile(join(__dirname, 'static', 'login.html'));
});

app.post('/auth/login', function (req, res) {
    let password = req.body.password;

    if (password && password == process.env.USER_PASSWORD) {
        req.session.loggedin = true;
        res.redirect('/edit');
    } else {
        res.redirect('/login');
    }
});

app.post('/auth/logout', function (req, res) {
    req.session.loggedin = false;
    res.redirect('/login');
});

app.post('/upload_gpx', uploadGPX.single('gpx_file'), (req, res) => {
    io.emit('success', "Uploaded GPX file successfully");
    res.sendStatus(204);
});

app.post('/upload_photo', uploadPhoto.single('photo_file'), (req, res) => {
    // console.log(req.file.path);

    const thumbDir = join(req.file.destination, '.thumbs');
    if (!existsSync(thumbDir))
        mkdirSync(thumbDir);

    sharp(req.file.path)
        .resize({ fit: sharp.fit.cover, width: 256, height: 256 })
        .toFile(join(req.file.destination, '.thumbs', req.file.filename))
        .then(function (info) {
            console.log(info);

            db.run("INSERT INTO Photos (unixTime, latitude, longitude, name, show) VALUES (?, ?, ?, ?, ?)", [0, 10, 10, req.file.filename, 1], function (error) {
                if (error) {
                    io.emit("error", err.message);
                    console.log(error);
                } else {
                    io.emit('success', `Uploaded photo successfully: ${req.file.path}`);
                }

                res.sendStatus(204);
            });

        }).catch(function (err) {
            console.log(err)
        });
});

app.get('/remove_gpx', function (req, res) {
    unlink('uploads/planned.gpx', (err) => {
        if (err) {
            io.emit("error", err.message);
            console.log(err.message);
        }

        res.sendStatus(204);
    });
});

app.post('/remove_photo', function (req, res) {
    db.get("SELECT name FROM Photos WHERE id = ?", [req.body.photo_id], function (err, row) {
        if (err) {
            console.error(err.message);
            io.emit("error", err.message);
            res.sendStatus(204);
        }

        // remove files
        unlinkSync(join(__dirname, 'uploads', 'images', row.name));
        unlinkSync(join(__dirname, 'uploads', 'images', '.thumbs', row.name));

        db.run("DELETE FROM Photos WHERE id = ?", req.body.photo_id, function (err) {
            if (err) {
                io.emit("error", err.message);
                console.error(err.message);
            }
            res.sendStatus(204);
        });
    });
});

app.get('/planned.gpx', function (req, res) {
    res.sendFile(join(__dirname, 'uploads', 'planned.gpx'));
});

app.get('/all_messages', function (req, res) {
    if (Date.now() - lastRequestTime > 5 * 60 * 1000)
        fetchSpotData(0);

    db.all("SELECT * FROM Messages ORDER BY unixTime DESC", [], function (err, rows) {
        if (err) {
            io.emit("error", err.message);
            console.log(err);
        }

        // TODO: split this up into chucks and stream?
        res.json(rows);
    })
});

app.get('/all_photos', function (req, res) {
    db.all("SELECT * FROM Photos", [], function (err, rows) {
        if (err) {
            io.emit("error", err.message);
            console.log(err);
        }

        // TODO: split this up into chucks and stream?
        res.json(rows);
    })
});

app.use('/photos/thumb', express.static(join(__dirname, 'uploads', 'images', '.thumbs')));
app.use('/photos', express.static(join(__dirname, 'uploads', 'images')));

app.use(express.static(join(__dirname, 'static')));

io.on('connection', (socket) => {
    console.log('a user connected');
    socket.on('disconnect', () => {
        console.log('user disconnected');
    });
});

server.listen(process.env.EXPRESS_PORT, () => {
    console.log('Express listening on http://localhost:' + process.env.EXPRESS_PORT);

    try {
        const cacheData = JSON.parse(readFileSync('./cache.json'));
        latestUnixTime = cacheData.latestUnixTime || 0;
        lastRequestTime = cacheData.lastRequestTime || 0;

        console.log(`loaded latestUnixTime: ${latestUnixTime}, lastRequestTime: ${lastRequestTime}, now: ${Date.now()}`);
    } catch (error) {
        console.error(error.message);
    }

    if (Date.now() - lastRequestTime > 5 * 60 * 1000)
        fetchSpotData(0);

});
