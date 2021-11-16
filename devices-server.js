const WebSocketServer = require('websocket').server;
const watch = require('node-watch');
const http = require('http');
const csv = require('csv-parser');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const geoTz = require('geo-tz');
const bodyParser = require('body-parser');
var urlencodedParser = bodyParser.urlencoded({extended: false})
const app = express();
const _ = require('lodash');
const key = 'AIzaSyD9agllUXdSWHnIYPbbRAFjHZ3hjKa2BV8';
const axios = require('axios');
const {json} = require("express");
const clients = [];
let fileContents = [];
const server = http.createServer();
const restAPIPort = 5050;
const webSocketPort = 3030;

//Load the initial data from the CSV file
fs.createReadStream('timezone.csv')
    .pipe(csv())
    .on('data', (data) =>
        fileContents.push(data)
    ).on('end', async () => {
    await formatDates(fileContents);
});

app.get('/get-devices', function (req, res) {
    res.send(JSON.stringify(fileContents));
});

app.post('/device', urlencodedParser, function (req, res) {
    let deviceFound = false;
    fileContents.forEach((device) => {
        if (device.id === req.body.id) {
            deviceFound = true;
            res.send(JSON.stringify(device));
        }
    });
    if (!deviceFound) {
        res.send('Invalid device id');
    }
});

server.listen(webSocketPort, () => console.log((new Date()) + `WebSocket Server is listening on port ${webSocketPort}!`));
app.listen(restAPIPort, () => console.log(`REST service is listening on port ${restAPIPort}!`))

wsServer = new WebSocketServer({
    httpServer: server,
});

wsServer.on('request', function (request) {
    //console.log((new Date()) + ' Recieved a new connection from origin ' + request.origin + '.');
    let connection = request.accept('echo-protocol', request.origin);
    connection.on('message', (message) => {
        let selectedDevice;
        fileContents.forEach((device) => {
            if (device['id'] === message.utf8Data) {
                selectedDevice = device;
            }
        });
        if (selectedDevice) {
            connection.send(JSON.stringify(selectedDevice));
        } else {
            connection.send('Invalid device ID');
        }
        let client = {con: connection, req: message.utf8Data}
        clients.push(client);
    });
    connection.on('close', function (reasonCode, description) {
        clients.splice(clients.indexOf(connection), 1);
        console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
    });
});

// Watch for the file updates
watch('timezone.csv', function (event, filename) {
    //Set the variable fileContents to a new empty array
    let modifiedFileContents = [];
    fs.createReadStream('timezone.csv')
        .pipe(csv())
        .on('data', (data) => modifiedFileContents.push(data))
        .on('end', async () => {
            let modifiedDevices = [];
            for (let i = 0; i < fileContents.length; i++) {
                //On device location change
                if (fileContents[i].lat !== modifiedFileContents[i].lat || fileContents[i].lng !== modifiedFileContents[i].lng) {
                    fileContents[i] = modifiedFileContents[i];
                    modifiedDevices.push(modifiedFileContents[i])
                }
            }
            await formatDates(fileContents);
            await formatDates(modifiedDevices);
            modifiedDevices.forEach((device) => {
                clients.forEach((client) => {
                    if (device['id'] === client.req) {
                        client.con.send(JSON.stringify(device));
                    }
                });
            });
        });
});

async function formatDates(fileData) {
    for (const data of fileData) {
        await formatSingleDate(data);
    }
}

async function formatSingleDate(data) {
    let timestamp = data.timestamp_utc;
    let longitude = data.lng;
    let latitude = data.lat;
    let timezone;
    let rdata;
    let timezone1
    const config = {
        method: 'get',
        url: `https://maps.googleapis.com/maps/api/timezone/json?location=${latitude}%2C${longitude}&timestamp=${timestamp}&key=${key}`,
        headers: {}
    };
    await axios(config)
        .then(function (response) {
            rdata = response.data;
            timezone1 = rdata.timeZoneId;

            const date = new Date(timestamp * 1000);
            timezone = geoTz(latitude, longitude);
            const nDate = date.toLocaleString('en-GB', {
                timeZone: timezone
            });
            let time = date.toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: timezone,
                hour12: false
            });
            let date1 = date.toLocaleDateString()
            let time1 = date.toTimeString('en-US', {timeZone: timezone});
            data['date_time'] = `${date1} ${time1} ${timezone} ${getAbbreviation(rdata.timeZoneName)} ${getoffset(rdata)}`;
        })
        .catch(function (error) {
            console.log(error);
        });
}

function getAbbreviation(text) {
    if (typeof text != 'string' || !text) {
        return '';
    }
    const acronym = text
        .match(/[\p{Alpha}\p{Nd}]+/gu)
        .reduce((previous, next) => previous + ((+next === 0 || parseInt(next)) ? parseInt(next) : next[0] || ''), '')
        .toUpperCase()
    return acronym;
}

function getoffset(rdata) {
    return (rdata.rawOffset + rdata.dstOffset) / 3600;
}