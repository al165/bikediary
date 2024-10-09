import { ElevationPlotter } from './plotter.js';


const stopTypeNames = {
    'bnb': 'BnB',
    'hotel': 'Hotel',
    'hostel': 'Hostel',
    'hosted': 'Hosted',
    'camping-wild': 'Wild Camp',
    'camping-campsite': 'Campsite'
};

// API Key only allows requests from arranlyon.com
const key = 'vWoMg6UEoZfSTtgtX14E';

let map = L.map('map').setView([50.0469811, 19.9223924], 5);
const mtLayer = L.maptilerLayer({
    apiKey: key,
    style: L.MaptilerStyle.STREETS, // optional
}).addTo(map);
//L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
//    maxZoom: 19,
//    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
//}).addTo(map);

L.control.locate({
    position: 'topleft',
}).addTo(map);

L.control.scale({
    position: 'bottomright',
    maxWidth: 150,
}).addTo(map);

let messageMarkerLayer = L.layerGroup();
let stopMarkerLayer = L.layerGroup();
let allMessagePointsLayer = L.layerGroup();
let layerControls = L.control.layers(null, { 'Stops': stopMarkerLayer, 'All points': allMessagePointsLayer }).addTo(map);
let elevationPlot;

const trackColour = '#4141E7';

function updatePoints(data) {
    // TODO: incremental updates
    latlongs = [[]];
    currLine = 0;
    for (const msg of data) {
        if (msg.ignore)
            continue;

        msg.lat = msg.latitude;
        msg.lng = msg.longitude;
        latlongs[currLine].unshift(msg);
        lastUnixTime = msg['unixTime'];

        if (msg['messageType'] != "UNLIMITED-TRACK") {
            messageData.push(JSON.parse(JSON.stringify(msg)))
        }

        if (msg['pointType']) {
            stops.push(msg);
        }
    }
    lastMessage = latlongs.at(0).at(-1);
}

let latlongs = [[]];
let jumps = [];
let currLine = 0;
let lastUnixTime = 0;
let lastLatLong;
let messageData = [];
let stops = [];
let polyline;
let currentMarker;
let plannedRoute;
let plannedPoints = [];
let lastMessage;
let loaded = false;
let closestGPXPoint;
let currentDistance = 0;

async function getPoints() {
    const res = await fetch("/all_messages");
    const data = await res.json();
    updatePoints(data);
    drawOverlay();
}

function getClosestGPXPoint() {
    closestGPXPoint = null;
    if (plannedPoints.length == 0 || !lastMessage)
        return;

    let closestD = Infinity;
    for(const planned of plannedPoints){
        let dist = map.distance(planned, lastMessage) / 1000;
        if(dist < closestD){
            closestD = dist;
            closestGPXPoint = planned;
        }
    }

    currentDistance = closestGPXPoint.meta.distance;
    if(elevationPlot)
    	elevationPlot.updatePosition(currentDistance);
}

// setInterval(getPoints, 1000 * 60 * 2);

let updateTimeSinceInterval;

function updateTimeSince() {
    let el = document.querySelector('#time-since');
    if (!el || !lastMessage) {
        return;
    }
    const updateSince = moment.unix(lastMessage.unixTime).fromNow();
    el.innerText = updateSince;
}

function drawOverlay() {
    if (polyline) {
        polyline.remove(map);
    }
    polyline = L.polyline(latlongs,
        {
            color: trackColour,
            weight: 3,
            smoothFactor: 2,
        }).addTo(map);

    for (const msg of latlongs[0]) {
        console.log(msg);
        const marker = L.marker(msg, {
           icon: new L.BeautifyIcon.icon({
               iconShape: 'circle-dot',
               borderColor: trackColour,
               iconSize: [7, 7],
               iconAnchor: [3, 3]
           })
        }).addTo(allMessagePointsLayer);
        marker.bindPopup(JSON.stringify(msg, null, 2));
    }

    for (const msg of messageData) {
        const latlong = L.latLng(msg['latitude'], msg['longitude']);
        const marker = L.marker(latlong, {
            icon: new L.BeautifyIcon.icon({
                iconShape: 'circle-dot',
                borderWidth: 4
            })
        }).addTo(messageMarkerLayer);
        marker.bindPopup(`<b>${msg['messageType']}</b><p>${msg['messageContent']}</p>`);
        marker.bindTooltip(`Message: ${msg['messageType']}`);
    }
    messageMarkerLayer.addTo(map);

    if (lastMessage) {
        if (currentMarker)
            currentMarker.remove(map);

        let stopInfo = '';
        let stopped = false;

        let lastStop = stops.at(0);

        if (
            lastMessage['pointType'] ||
            (lastStop && map.distance(lastMessage, lastStop) < 100)
        ) {
            const stopString = stopTypeNames[lastMessage.pointType];
            stopInfo = `<b>Stopped: ${stopString}</b><br>${lastMessage.pointDetails}</p>`;
            stopped = true;
        }

        currentMarker = L.marker(lastMessage, {
            icon: new L.BeautifyIcon.icon({
                iconShape: 'circle-dot',
                iconSize: [22, 22],
                iconAnchor: [11, 11],
                borderWidth: 6,
                borderColor: trackColour,
                icon: null,
                text: "",
                textColor: trackColour,
                customClasses: stopped ? "" : "blinking",
            })
        }).addTo(map);

        currentMarker.bindPopup(
	    function(target) {
		const popup = target.getPopup();
		const countryDataURL = `/country/${lastMessage.lat}/${lastMessage.lng}`;
		console.log(countryDataURL);
		fetch(countryDataURL)
		.then(res => res.json())
		.then(data => {
                    popup.setContent(`
                    <b>Current position</b><br>
                    ${data.emoji} ${data.name}<br>
                    <a href="https://maps.google.com/?q=${lastMessage.lat},${lastMessage.lng}" target="_blank" rel="noopener noreferrer">[view on Google Maps]</a>
                    <p>Last update: <span id="time-since"></span></p>
                    <p>Tracker battery status: ${lastMessage.batteryState.toLowerCase()}</p>
                    ${stopInfo}
                    `);

                    if (updateTimeSinceInterval)
                        clearInterval(updateTimeSinceInterval);

                    updateTimeSinceInterval = setInterval(updateTimeSince, 1000);

    		});
    		return "Loading...";
	    }
        );

        if (!loaded) {
            map.setView(currentMarker.getLatLng(), 10);
            loaded = true;
        }

        getClosestGPXPoint();
    }


    for (const stop of stops) {
        if (stop.id == lastMessage.id)
            continue;

        const marker = L.marker(stop, {
            icon: new L.BeautifyIcon.icon({
                iconShape: 'circle-dot',
                iconSize: [11, 11],
                iconAnchor: [5, 5],
                borderWidth: 4,
                borderColor: trackColour,
            })
        }).addTo(stopMarkerLayer);
        const stopString = stopTypeNames[stop.pointType];
        marker.bindPopup(`<b>${stopString}</b><br>${stop.pointDetails}`);
    }
    stopMarkerLayer.addTo(map); 
}

plannedRoute = new L.GPX('planned.gpx', {
    async: true,
    polyline_options: {
        color: 'red',
        weight: 2,
        distanceMarkers: {
            showAll: 13, iconSize: [22, 16]
        }
    }
}).on('addpoint', function (ev) {

    console.log('Added ' + ev.point_type + ' point: ' + ev.point);
    if (ev.point_type === "start") {
        ev.point.bindPopup(`<b>Planned Route: ${ev.target.get_name()}</b><br>Distance: ${Math.round(ev.target.get_distance() / 100) / 10 + 'km'}<br>Expected moving time: ${ev.target.get_duration_string(ev.target.get_total_time(), true)}<br>Elevation gain: ${Math.round(ev.target.get_elevation_gain()) + 'm'}`)
        ev.point.setIcon(new L.BeautifyIcon.icon({
            icon: 'play',
            iconShape: 'circle',
            borderColor: 'red',
            textColor: 'red'
        }))
        ev.point.bindTooltip('Planned route start');
    } else if (ev.point_type === "end") {
        ev.point.setIcon(new L.BeautifyIcon.icon({
            icon: 'flag',
            iconShape: 'circle',
            borderColor: 'red',
            textColor: 'red'
        }));
        ev.point.bindTooltip('Planned route end');
    }
}).on('loaded', function (ev) {
    const elevationDataAll = ev.target.get_elevation_data();
    plannedPoints = plannedRoute.getLayers()[0].getLayers()[0].getLatLngs();
    for(let i = 0; i < plannedPoints.length; i++){
        plannedPoints[i].meta.distance = elevationDataAll[i][0]
    }
    elevationPlot = new ElevationPlotter(document.getElementById("elevationContainer"), plannedPoints);
    getClosestGPXPoint();
}).addTo(map);
layerControls.addOverlay(plannedRoute, "Planned Route");

const elevationSlide = L.control.slideMenu("elevation data here soon!", {
  position: "topleft",
  menuPosition: "bottomleft",
  width: "100%",
  height: "40%",
  direction: "vertical",
  icon: "fa fa-line-chart"
}).addTo(map);
elevationSlide.setContents(`<h3>Elevation profile of planned route</h3><div id="elevationContainer"></div>`);

const stravaEmbed = `
<iframe height='454' width='300' frameborder='0' allowtransparency='true' scrolling='no' src='https://www.strava.com/athletes/3904627/latest-rides/94f4562082905ad6135ce5aef63fbf508beb141b'></iframe>
`
const stravaSlide = L.control.slideMenu(stravaEmbed, {
    position: "topleft",
    menuPosition: "bottomleft",
    width: "320px",
    height: "520px",
    direction: "horizontal",
    icon: "fa fa-info-circle"
}).addTo(map);

getPoints();


