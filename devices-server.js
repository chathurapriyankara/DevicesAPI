const WebSocketServer = require('websocket').server;
const watch = require('node-watch');
const http = require('http');
const csv = require('csv-parser');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const geoTz = require('geo-tz')
const key = 'AIzaSyD9agllUXdSWHnIYPbbRAFjHZ3hjKa2BV8';
const axios = require('axios');
const {response} = require("express");
const clients = [];
let fileContents = [];
const server = http.createServer();

//Load the initial data from the CSV file
fs.createReadStream('timezone.csv')
    .pipe(csv())
    .on('data', async (data) =>
        fileContents.push(data)
    ).on('end', async () => {
        await formatDate(fileContents);
    });

server.listen(3030, function () {
    console.log((new Date()) + ' Server is listening on port 3030');
});

wsServer = new WebSocketServer({
    httpServer: server,
});

wsServer.on('request', function (request) {
    console.log((new Date()) + ' Recieved a new connection from origin ' + request.origin + '.');
    const connection = request.accept(null);
    connection.send(JSON.stringify(fileContents));
    clients.push(connection);
    console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
});

// Watch for the file updates
watch('timezone.csv', async function (event, filename) {
    //Load the variable fileContents to a new empty array
    fileContents = [];
    fs.createReadStream('timezone.csv')
        .pipe(csv())
        .on('data', async (data) => {
            fileContents.push(data);
        })
        .on('end', async () => {
            await formatDate(fileContents);
            console.log(fileContents);
        });
});

async function formatDate(fileData) {
    for (const data of fileData) {
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
                // console.log(DateTime.fromISO(date, { zone: timezone }))
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