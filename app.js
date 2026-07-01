let map;
let currentDayIndex = 0;
let markers = {};
let hotelMarker = null;
let routeLine = null;
let mapReady = false;

function $(id){ return document.getElementById(id); }

function hasCoords(item){
  return Array.isArray(item?.coords) && item.coords.length === 2 && item.coords.every(Number.isFinite);
}

function dayLocations(day){
  return [...(day.locations || [])].sort((a,b)=>(a.order || 0) - (b.order || 0));
}

function dayMapCoords(day){
  return dayLocations(day).filter(hasCoords).map(loc => loc.coords);
}

function hotelCoords(){
  const hotel = window.TRIP_DATA?.trip?.hotel;
  return hasCoords(hotel) ? hotel.coords : null;
}

function googleDirectionsUrl(coords){
  const validCoords = coords.filter(Array.isArray).filter(c => c.length === 2);
  if(validCoords.length === 0) return "";
  if(validCoords.length === 1){
    return `https://www.google.com/maps/search/?api=1&query=${validCoords[0].join(",")}`;
  }

  const [origin, ...rest] = validCoords;
  const destination = rest.pop();
  const params = new URLSearchParams({
    api:"1",
    origin:origin.join(","),
    destination:destination.join(","),
    travelmode:"driving"
  });
  if(rest.length) params.set("waypoints", rest.map(c=>c.join(",")).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function dayRouteUrl(day){
  if(day.routeMapUrl) return day.routeMapUrl;
  const coords = [...dayMapCoords(day)];
  const hotel = hotelCoords();
  if(hotel) coords.unshift(hotel);
  return googleDirectionsUrl(coords);
}

function weatherCoords(day){
  if(hasCoords({ coords: day.weatherCoords })) return day.weatherCoords;
  if(hasCoords({ coords: day.center })) return day.center;
  return dayMapCoords(day)[0] || hotelCoords();
}

function weatherCodeLabel(code){
  const labels = {
    0:"trời quang",
    1:"ít mây",
    2:"mây rải rác",
    3:"nhiều mây",
    45:"sương mù",
    48:"sương mù đóng băng",
    51:"mưa phùn nhẹ",
    53:"mưa phùn",
    55:"mưa phùn dày",
    56:"mưa phùn lạnh nhẹ",
    57:"mưa phùn lạnh",
    61:"mưa nhỏ",
    63:"mưa vừa",
    65:"mưa to",
    66:"mưa lạnh nhẹ",
    67:"mưa lạnh",
    71:"tuyết nhẹ",
    73:"tuyết vừa",
    75:"tuyết dày",
    77:"hạt tuyết",
    80:"mưa rào nhẹ",
    81:"mưa rào vừa",
    82:"mưa rào mạnh",
    85:"mưa tuyết rào nhẹ",
    86:"mưa tuyết rào mạnh",
    95:"dông",
    96:"dông kèm mưa đá nhẹ",
    99:"dông kèm mưa đá mạnh"
  };
  return labels[code] || "thời tiết chưa phân loại";
}

function formatWeatherForecast(day, daily){
  const min = daily.temperature_2m_min?.[0];
  const max = daily.temperature_2m_max?.[0];
  const probability = daily.precipitation_probability_max?.[0];
  const rain = daily.precipitation_sum?.[0];
  const code = daily.weather_code?.[0];
  const date = formatShortDate(daily.time?.[0] || day.date);
  const temps = Number.isFinite(min) && Number.isFinite(max) ? `${min.toFixed(1)}-${max.toFixed(1)}°C` : "";
  const rainChance = Number.isFinite(probability) ? `xác suất mưa ${probability}%` : "";
  const rainAmount = Number.isFinite(rain) ? `lượng mưa khoảng ${rain.toFixed(1)} mm` : "";
  const details = [rainChance, rainAmount].filter(Boolean).join(", ");
  const label = weatherCodeLabel(code);
  return `${date}: ${temps}${temps ? ", " : ""}${label}${details ? `; ${details}` : ""}.`;
}

function weatherApiUrl(day){
  const coords = weatherCoords(day);
  if(!day.date || !coords) return "";
  const params = new URLSearchParams({
    latitude:coords[0],
    longitude:coords[1],
    daily:"weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum",
    timezone:window.TRIP_DATA.trip.timezone || "Asia/Ho_Chi_Minh",
    start_date:day.date,
    end_date:day.date
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

function defaultCenter(firstDay){
  return firstDay.center || hotelCoords() || dayMapCoords(firstDay)[0] || [10.25, 103.95];
}

function formatShortDate(value){
  if(!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if(Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("vi-VN", { day:"2-digit", month:"2-digit" });
}

function init(){
  const data = window.TRIP_DATA;
  document.title = data.trip.title || "Smart Travel Itinerary";

  $("tripTitle").textContent = data.trip.title;
  $("tripSubtitle").textContent = data.trip.subtitle || data.trip.destination || "";
  $("tripMeta").textContent = [
    data.trip.destination,
    `${data.trip.startDate || ""} → ${data.trip.endDate || ""}`,
    (data.trip.travelers || []).join(" • ")
  ].filter(Boolean).join(" · ");

  if(data.trip.coverImage){
    document.documentElement.style.setProperty("--cover", `linear-gradient(180deg,rgba(2,6,23,.05),rgba(2,6,23,.75)), url('${data.trip.coverImage}')`);
  }

  renderTabs();
  renderDay(0);
  initMap(data.days[0]);
  if(mapReady) renderDay(currentDayIndex);

  $("fitRouteBtn").addEventListener("click", fitCurrentRoute);
  window.addEventListener("resize", () => {
    if(mapReady) setTimeout(()=>map.invalidateSize(),150);
  });
  window.addEventListener("leaflet-ready", () => {
    if(mapReady) return;
    initMap(window.TRIP_DATA.days[currentDayIndex]);
    renderDay(currentDayIndex);
  });
}

function initMap(firstDay){
  if(!window.L){
    showMapFallback("Không tải được bản đồ", "Lịch trình vẫn dùng được. Hãy kiểm tra kết nối mạng để tải Leaflet/OpenStreetMap.");
    return;
  }

  $("map").innerHTML = "";
  map = L.map("map", { zoomControl:false }).setView(defaultCenter(firstDay), firstDay.zoom || 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap"
  }).addTo(map);
  L.control.zoom({position:"bottomright"}).addTo(map);
  mapReady = true;
  $("fitRouteBtn").disabled = false;
}

function showMapFallback(title, message){
  $("map").innerHTML = `
    <div class="map-fallback">
      <div>
        <strong>${title}</strong>
        <span>${message}</span>
      </div>
    </div>
  `;
  $("fitRouteBtn").disabled = true;
}

function renderTabs(){
  const tabs = $("dayTabs");
  tabs.innerHTML = "";
  window.TRIP_DATA.days.forEach((d, idx)=>{
    const btn = document.createElement("button");
    btn.className = "day-tab";
    btn.type = "button";
    btn.title = [d.title, d.date].filter(Boolean).join(" · ");
    btn.innerHTML = `
      <span>Ngày ${d.day}</span>
      ${d.date ? `<small>${formatShortDate(d.date)}</small>` : ""}
    `;
    btn.onclick = () => renderDay(idx);
    tabs.appendChild(btn);
  });
}

function renderOverview(day){
  const trip = window.TRIP_DATA.trip;
  const routeUrl = dayRouteUrl(day);
  const hotelActionClass = hasCoords(trip.hotel) ? " fact-action" : "";
  const canRefreshWeather = Boolean(weatherApiUrl(day));
  const routeLink = routeUrl
    ? `<a class="summary-route-link" href="${routeUrl}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-route"></i> Mở lộ trình trong Google Maps</a>`
    : "";
  const weatherContent = `
    <b>Thời tiết${day.weatherLocation ? ` · ${day.weatherLocation}` : ""}${canRefreshWeather ? ` <i class="fa-solid fa-rotate weather-refresh-icon"></i>` : ""}</b>
    <span>${day.weather || "Chưa cập nhật"}</span>
  `;
  $("overviewCard").innerHTML = `
    <div class="day-summary">
      <div>
        <span>${day.date ? formatShortDate(day.date) : `Ngày ${day.day}`}</span>
        <h2>${day.title || `Ngày ${day.day}`}</h2>
      </div>
      ${day.summary ? `<p>${day.summary}</p>` : ""}
      ${routeLink}
    </div>
    <div class="overview-grid">
      <button class="fact${hotelActionClass}" id="hotelFact" type="button" ${hasCoords(trip.hotel) ? "" : "disabled"}>
        <b>Khách sạn</b><span>${trip.hotel?.name || "Chưa có"}</span>
      </button>
      ${canRefreshWeather
        ? `<button class="fact fact-action weather-fact" id="weatherFact" type="button" title="Cập nhật dự báo thời tiết">${weatherContent}</button>`
        : `<div class="fact weather-fact">${weatherContent}</div>`}
    </div>
  `;

  const hotelFact = $("hotelFact");
  if(hotelFact && hasCoords(trip.hotel)) hotelFact.addEventListener("click", focusHotel);
  const weatherFact = $("weatherFact");
  if(weatherFact) weatherFact.addEventListener("click", () => refreshWeather(day));
}

async function refreshWeather(day){
  const weatherFact = $("weatherFact");
  const url = weatherApiUrl(day);
  if(!weatherFact || !url) return;

  const label = `Thời tiết${day.weatherLocation ? ` · ${day.weatherLocation}` : ""} <i class="fa-solid fa-rotate weather-refresh-icon is-spinning"></i>`;
  weatherFact.disabled = true;
  weatherFact.classList.add("loading");
  weatherFact.innerHTML = `<b>${label}</b><span>Đang cập nhật dự báo...</span>`;

  try{
    const response = await fetch(url);
    if(!response.ok) throw new Error(`Weather request failed: ${response.status}`);
    const forecast = await response.json();
    const updatedWeather = formatWeatherForecast(day, forecast.daily || {});
    day.weather = updatedWeather;
    weatherFact.innerHTML = `
      <b>Thời tiết${day.weatherLocation ? ` · ${day.weatherLocation}` : ""} <i class="fa-solid fa-rotate weather-refresh-icon"></i></b>
      <span>${updatedWeather}</span>
    `;
  }catch(error){
    weatherFact.innerHTML = `
      <b>Thời tiết${day.weatherLocation ? ` · ${day.weatherLocation}` : ""} <i class="fa-solid fa-rotate weather-refresh-icon"></i></b>
      <span>${day.weather || "Không cập nhật được dự báo. Hãy thử lại khi có mạng."}</span>
    `;
  }finally{
    weatherFact.disabled = false;
    weatherFact.classList.remove("loading");
  }
}

function renderDay(idx){
  currentDayIndex = idx;
  const data = window.TRIP_DATA;
  const day = data.days[idx];
  document.documentElement.style.setProperty("--primary", day.themeColor || "#2563eb");

  [...document.querySelectorAll(".day-tab")].forEach((b,i)=>b.classList.toggle("active", i===idx));

  if(mapReady){
    Object.values(markers).forEach(m => map.removeLayer(m));
    if(hotelMarker) map.removeLayer(hotelMarker);
    if(routeLine) map.removeLayer(routeLine);
  }
  markers = {};
  hotelMarker = null;
  routeLine = null;

  renderOverview(day);
  renderLocations(day);
  renderNotes(data.notes || []);

  const locations = dayLocations(day);
  const coords = dayMapCoords(day);
  if(!mapReady) return;

  renderHotelMarker(data.trip.hotel);

  if(coords.length >= 2){
    routeLine = L.polyline(coords, { color: day.themeColor, weight:4, opacity:.65, dashArray:"8 8" }).addTo(map);
  }

  locations.filter(hasCoords).forEach(loc=>{
    const icon = L.divIcon({
      className:"marker-label",
      html:`<div class="marker-dot">${loc.order}</div>`,
      iconSize:[40,40],
      iconAnchor:[20,20]
    });
    const marker = L.marker(loc.coords, {icon}).addTo(map);
    marker.on("click",()=>focusLocation(loc.order));
    markers[loc.order] = marker;
  });

  setTimeout(()=>fitCurrentRoute(),100);
}

function renderHotelMarker(hotel){
  if(!hasCoords(hotel)) return;

  const icon = L.divIcon({
    className:"marker-label hotel-marker",
    html:`<div class="marker-dot hotel-dot"><i class="fa-solid ${hotel.icon || "fa-hotel"}"></i></div>`,
    iconSize:[42,42],
    iconAnchor:[21,21]
  });

  hotelMarker = L.marker(hotel.coords, { icon, zIndexOffset:1000 }).addTo(map);
  hotelMarker.on("click", focusHotel);
  hotelMarker.bindPopup(`
    <strong>${hotel.name || "Khách sạn"}</strong>
    ${hotel.address ? `<br>${hotel.address}` : ""}
    ${hotel.checkin || hotel.checkout ? `<br>Check-in: ${hotel.checkin || "-"} · Check-out: ${hotel.checkout || "-"}` : ""}
  `);
}

function renderLocations(day){
  const list = $("itineraryList");
  list.innerHTML = "";
  dayLocations(day).forEach(loc=>{
    const card = document.createElement("article");
    card.className = "location-card";
    card.id = `loc-${loc.order}`;
    card.onclick = () => focusLocation(loc.order);
    card.innerHTML = `
      <div class="location-head">
        <div class="order-badge">${loc.order}</div>
        <div>
          <h3><i class="fa-solid ${loc.icon || "fa-location-dot"}"></i> ${loc.name}</h3>
          <p>${loc.description || ""}</p>
        </div>
        <div class="time-pill">${loc.time || ""}</div>
      </div>
      <div class="location-extra">
        ${loc.category ? `<span class="tag">${loc.category}</span>` : ""}
        ${loc.highlight ? `<span class="tag">${loc.highlight}</span>` : ""}
        ${loc.duration ? `<span class="tag"><i class="fa-regular fa-clock"></i> ${loc.duration}</span>` : ""}
        ${loc.cost ? `<span class="tag"><i class="fa-solid fa-wallet"></i> ${loc.cost}</span>` : ""}
        ${loc.mapUrl ? `<a class="tag map-link" href="${loc.mapUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">Google Maps</a>` : ""}
      </div>
    `;
    list.appendChild(card);
  });
}

function renderNotes(notes){
  $("notesPanel").innerHTML = notes.length ? `
    <h3>Lưu ý quan trọng</h3>
    <ul>${notes.map(n=>`<li>${n}</li>`).join("")}</ul>
  ` : "";
}

function focusLocation(order){
  const day = window.TRIP_DATA.days[currentDayIndex];
  const loc = dayLocations(day).find(l=>l.order===order);
  if(!loc) return;

  document.querySelectorAll(".location-card").forEach(c=>c.classList.remove("active"));
  document.querySelectorAll(".fact").forEach(c=>c.classList.remove("active"));
  const card = $(`loc-${order}`);
  if(card){
    card.classList.add("active");
    card.scrollIntoView({behavior:"smooth", block:"nearest"});
  }

  Object.values(markers).forEach(m=>{
    const el = m.getElement();
    if(el) el.classList.remove("active");
  });
  if(hotelMarker?.getElement()) hotelMarker.getElement().classList.remove("active");
  const marker = markers[order];
  if(marker?.getElement()) marker.getElement().classList.add("active");

  if(mapReady && hasCoords(loc)) map.flyTo(loc.coords, 14, {duration:1});
}

function focusHotel(){
  const hotel = window.TRIP_DATA.trip.hotel;
  if(!hotel) return;

  document.querySelectorAll(".location-card").forEach(c=>c.classList.remove("active"));
  document.querySelectorAll(".fact").forEach(c=>c.classList.remove("active"));
  const fact = $("hotelFact");
  if(fact){
    fact.classList.add("active");
    fact.scrollIntoView({behavior:"smooth", block:"nearest"});
  }

  Object.values(markers).forEach(m=>{
    const el = m.getElement();
    if(el) el.classList.remove("active");
  });
  const el = hotelMarker?.getElement();
  if(el) el.classList.add("active");

  if(mapReady && hasCoords(hotel)){
    map.flyTo(hotel.coords, 14, {duration:1});
    hotelMarker?.openPopup();
    setTimeout(()=>hotelMarker?.openPopup(), 450);
  }
}

function fitCurrentRoute(){
  const day = window.TRIP_DATA.days[currentDayIndex];
  if(!mapReady) return;

  const coords = [...dayMapCoords(day)];
  const hotel = hotelCoords();
  if(hotel) coords.push(hotel);
  if(coords.length === 0) return;
  if(coords.length === 1){
    map.setView(coords[0], day.zoom || 13);
    return;
  }

  map.fitBounds(L.latLngBounds(coords), { padding:[60,60], maxZoom:13 });
}

window.addEventListener("load", init);
