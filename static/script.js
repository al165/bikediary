let map = L.map('map').setView([50.0469811, 19.9223924], 5);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

function updatePoints(data) {
    console.log("updatepoints");
    // TODO: incremental updates
    latlongs = [[]];
    currLine = 0;
    for (const msg of data) {
    	// should only apply to ULIMITED-TRACK messages
        const latlong = [msg['latitude'], msg['longitude']];
        if (msg['unixTime'] < lastUnixTime - 24 * 60 * 60) {
            // split line
            if (lastLatLong) {
                jumps.push([
                    latlong,
                    lastLatLong
                ]);
            }
            latlongs.push([]);
            currLine++;
        }
        msg.lat = msg.latitude;
        msg.lng = msg.longitude;
        latlongs[currLine].unshift(msg);
        lastUnixTime = msg['unixTime'];
        lastLatLong = latlong.slice();
        if (msg['messageType'] != "UNLIMITED-TRACK") {
            messageData.push(JSON.parse(JSON.stringify(msg)))
        }
    }
}

let latlongs = [[]];
let jumps = [];
let currLine = 0;
let lastUnixTime = 0;
let lastLatLong;
let messageData = [];
let polyline;
let currentMarker;
let plannedRoute;
let loaded = false;

async function getPoints() {
    console.log("getpoints");
    const res = await fetch("/all_messages");
    const data = await res.json();
    updatePoints(data);
    drawOverlay();
}

setInterval(getPoints, 1000 * 60 * 2);

function drawOverlay() {
    if (polyline) {
        polyline.remove(map);
    }
    polyline = L.polyline(latlongs,
        {
            color: 'blue',
            weight: 2,
            smoothFactor: 3,
        }).arrowheads({
            frequency: '50px',
            size: '12px'
        }).addTo(map);
    if (latlongs[0].length > 0) {
        if (currentMarker)
            currentMarker.remove(map);
        const lastPoint = latlongs.at(0).at(-1);
        if (!lastPoint)
            return;
        currentMarker = L.marker(lastPoint, {
            icon: new L.BeautifyIcon.icon({
                iconShape: 'marker',
                borderWidth: 4,
                borderColor: "blue",
                icon: null,
                text: "",
                textColor: "blue",
            })
        }).addTo(map);
        console.log(lastPoint);
        const updateTime = new Date(lastPoint.unixTime * 1000);
        currentMarker.bindPopup(`
        <b>Current position</b><br>
        <a href="https://maps.google.com/?q=${lastPoint.lat},${lastPoint.lng}" target="_blank" rel="noopener noreferrer">view on Google Maps</a>
        <p>Last message time: ${updateTime.toString()}</p>
        <p>Tracker battery status: ${lastPoint.batteryState.toLowerCase()}</p>
        `);
        if (!loaded) {
            map.setView(currentMarker.getLatLng(), 11);
            loaded = true;
        }
    }
    const geodesic = new L.Geodesic(jumps, { color: 'blue', opacity: 0.5, dashArray: '8', weight: 2 }).arrowheads({ size: '12px', dashArray: '0' }).addTo(map);
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
}

let messageMarkerLayer = L.layerGroup();
let layerControls = L.control.layers(null, { 'Messages': messageMarkerLayer }).addTo(map);
let plannedDistance = 0;

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
    console.log(ev.target.get_name());
    console.log(Math.round(ev.target.get_distance() / 100) / 10 + 'km');
    console.log(ev.target.get_duration_string(ev.target.get_total_time(), true));
    console.log(ev.target.get_elevation_gain() + 'm');
    const elevationDataAll = ev.target.get_elevation_data();
    let elevationData = [];
    for(let i = 0; i < elevationDataAll.length; i+=15){
        elevationData.push(elevationDataAll[i]);
    }
    console.log(elevationData);
    elevationChart = new Chart(
        document.getElementById("elevation-chart"),
        {
            type: "line",
            options: {
                animation: false,
                plugins: {
                    legend: {display: false},
                    tooltip: {enabled: false}
                }
            },
            data: {
                labels: elevationData.map(row => Math.floor(row[0])),
                datasets: [
                    {
                        label: "elevation (m)",
                        data: elevationData.map(row => row[1]),
                        borderWidth: 1,
                        borderColor: 'red',
                        pointRadius: 0
                    }
                ]
            }
        }
    );
}).addTo(map);
layerControls.addOverlay(plannedRoute, "Planned Route");

const elevationSlude = L.control.slideMenu("elevation data here soon!", {
  position: "topleft",
  menuPosition: "bottomleft",
  width: "100%",
  height: "30%",
  direction: "vertical",
  icon: "fa fa-line-chart"
}).addTo(map);
elevationSlude.setContents(`<div id="elevationContainer"><canvas id="elevation-chart"></canvas></div>`);

getPoints();
