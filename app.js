const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";
const SEARCH_DELAY_MS = 450;
const MIN_SEARCH_INTERVAL_MS = 1_100;

const locations = { start: null, end: null };
const searchControllers = { start: null, end: null };
let searchTimers = { start: null, end: null };
let nextSearchAt = 0;
let routeController = null;

const fields = {
  start: getField("start"),
  end: getField("end"),
};
const calculateButton = document.querySelector("#calculate-button");
const formHint = document.querySelector("#form-hint");
const resultEmpty = document.querySelector("#result-empty");
const resultContent = document.querySelector("#result-content");
const distanceValue = document.querySelector("#distance-value");
const routeSummary = document.querySelector("#route-summary");
const mapLink = document.querySelector("#map-link");

function getField(key) {
  const input = document.querySelector(`#${key}-input`);
  const container = input.closest(".location-field");
  return {
    input,
    container,
    results: container.querySelector(".suggestions"),
    clear: container.querySelector(".clear-button"),
  };
}

function setHint(message, state) {
  formHint.lastChild.textContent = ` ${message}`;
  if (state) formHint.dataset.state = state;
  else delete formHint.dataset.state;
}

function updateControls() {
  calculateButton.disabled = !locations.start || !locations.end || calculateButton.dataset.loading === "true";
  for (const [key, field] of Object.entries(fields)) {
    field.clear.hidden = !field.input.value;
    field.input.setAttribute("aria-expanded", String(!field.results.hidden));
    field.input.setAttribute("aria-activedescendant", "");
    if (locations[key]) field.input.title = locations[key].displayName;
    else field.input.removeAttribute("title");
  }
}

function invalidateRoute() {
  routeController?.abort();
  setCalculating(false);
  resultContent.hidden = true;
  resultEmpty.hidden = false;
}

function closeResults(key) {
  const { results } = fields[key];
  results.hidden = true;
  results.replaceChildren();
  updateControls();
}

function setSearchingMessage(key, message, isError = false) {
  const { results } = fields[key];
  results.replaceChildren();
  const item = document.createElement("li");
  item.className = "suggestion-message";
  item.textContent = message;
  if (isError) item.setAttribute("role", "alert");
  results.append(item);
  results.hidden = false;
  updateControls();
}

function queueNominatimRequest(url, signal) {
  const now = Date.now();
  const wait = Math.max(0, nextSearchAt - now);
  nextSearchAt = Math.max(now, nextSearchAt) + MIN_SEARCH_INTERVAL_MS;
  return new Promise((resolve, reject) => {
    window.setTimeout(async () => {
      if (signal.aborted) {
        reject(new DOMException("검색이 취소되었습니다.", "AbortError"));
        return;
      }
      try {
        const response = await fetch(url, {
          headers: { Accept: "application/json" },
          signal,
        });
        if (!response.ok) throw new Error("장소 검색 서비스에 연결할 수 없습니다.");
        resolve(await response.json());
      } catch (error) {
        reject(error);
      }
    }, wait);
  });
}

function formatPlaceName(place) {
  const address = place.address || {};
  const parts = [
    address.city || address.town || address.village || address.county || address.state,
    address.suburb || address.city_district || address.district,
    address.road || address.neighbourhood,
  ].filter(Boolean);
  return [...new Set(parts)].join(" ");
}

function renderSuggestions(key, places) {
  const { results } = fields[key];
  results.replaceChildren();
  if (!places.length) {
    setSearchingMessage(key, "검색 결과가 없습니다. 다른 이름으로 검색해 보세요.");
    return;
  }

  for (const place of places) {
    const item = document.createElement("li");
    const option = document.createElement("button");
    option.type = "button";
    option.className = "suggestion-option";
    option.setAttribute("role", "option");
    const name = document.createElement("span");
    name.className = "suggestion-name";
    name.textContent = place.name || formatPlaceName(place) || place.display_name.split(",")[0];
    const detail = document.createElement("span");
    detail.className = "suggestion-detail";
    detail.textContent = place.display_name;
    option.append(name, detail);
    option.addEventListener("click", () => selectPlace(key, place));
    item.append(option);
    results.append(item);
  }
  results.hidden = false;
  updateControls();
}

function selectPlace(key, place) {
  const field = fields[key];
  invalidateRoute();
  window.clearTimeout(searchTimers[key]);
  searchControllers[key]?.abort();
  locations[key] = {
    displayName: place.display_name,
    lat: Number(place.lat),
    lon: Number(place.lon),
  };
  field.input.value = place.name || formatPlaceName(place) || place.display_name.split(",")[0];
  closeResults(key);
  setHint(locations.start && locations.end ? "두 장소가 확인됐어요. 거리를 계산해 보세요." : "다른 장소도 검색해 주세요.");
  updateControls();
}

async function searchPlaces(key, query) {
  searchControllers[key]?.abort();
  const controller = new AbortController();
  searchControllers[key] = controller;
  setSearchingMessage(key, "실제 장소를 검색하고 있어요…");

  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    namedetails: "1",
    limit: "5",
    "accept-language": "ko",
  });
  try {
    const places = await queueNominatimRequest(`${NOMINATIM_URL}?${params}`, controller.signal);
    if (!controller.signal.aborted && fields[key].input.value.trim() === query) {
      renderSuggestions(key, places);
    }
  } catch (error) {
    if (error.name !== "AbortError" && !controller.signal.aborted) {
      setSearchingMessage(key, "장소 검색에 실패했어요. 잠시 후 다시 시도해 주세요.", true);
    }
  }
}

for (const [key, field] of Object.entries(fields)) {
  field.input.addEventListener("input", () => {
    invalidateRoute();
    locations[key] = null;
    window.clearTimeout(searchTimers[key]);
    searchControllers[key]?.abort();
    const query = field.input.value.trim();
    updateControls();
    if (query.length < 2) {
      closeResults(key);
      setHint("두 글자 이상 입력하면 실제 장소를 검색할 수 있어요.");
      return;
    }
    setHint("검색 결과에서 장소를 선택해 주세요.");
    searchTimers[key] = window.setTimeout(() => searchPlaces(key, query), SEARCH_DELAY_MS);
  });

  field.input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeResults(key);
    if (event.key === "Enter" && !field.results.hidden) {
      const firstOption = field.results.querySelector("button");
      if (firstOption) {
        event.preventDefault();
        firstOption.click();
      }
    }
  });

  field.input.addEventListener("focus", () => {
    for (const otherKey of Object.keys(fields)) {
      if (otherKey !== key) closeResults(otherKey);
    }
  });

  field.clear.addEventListener("click", () => {
    invalidateRoute();
    field.input.value = "";
    locations[key] = null;
    closeResults(key);
    field.input.focus();
    setHint("검색 결과에서 장소를 선택해 주세요.");
  });
}

document.addEventListener("click", (event) => {
  for (const [key, field] of Object.entries(fields)) {
    if (!field.container.contains(event.target)) closeResults(key);
  }
});

function formatDistance(meters) {
  if (meters < 1_000) return `${Math.round(meters)} m`;
  const kilometers = meters / 1_000;
  const digits = kilometers < 10 ? 1 : 0;
  return `${kilometers.toLocaleString("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} km`;
}

function setCalculating(isCalculating) {
  calculateButton.dataset.loading = String(isCalculating);
  calculateButton.classList.toggle("is-loading", isCalculating);
  calculateButton.querySelector("span").textContent = isCalculating ? "도로 경로 확인 중…" : "거리 계산하기";
  calculateButton.disabled = isCalculating || !locations.start || !locations.end;
}

async function calculateRoute() {
  if (!locations.start || !locations.end) return;
  routeController?.abort();
  routeController = new AbortController();
  const { signal } = routeController;
  const start = locations.start;
  const end = locations.end;
  const coordinates = `${start.lon},${start.lat};${end.lon},${end.lat}`;
  const params = new URLSearchParams({ overview: "false", steps: "false" });

  setCalculating(true);
  setHint("자동차 도로 경로를 확인하고 있어요.");
  try {
    const response = await fetch(`${OSRM_URL}/${coordinates}?${params}`, { signal });
    if (!response.ok) throw new Error("도로 경로 서비스에 연결할 수 없습니다.");
    const data = await response.json();
    if (data.code !== "Ok" || !data.routes?.length) {
      throw new Error("두 장소를 잇는 자동차 도로 경로를 찾지 못했어요.");
    }
    const distance = data.routes[0].distance;
    if (!Number.isFinite(distance) || distance <= 0) {
      throw new Error("유효한 도로 거리를 확인하지 못했어요.");
    }

    distanceValue.textContent = formatDistance(distance);
    routeSummary.textContent = `${start.displayName} → ${end.displayName}`;
    const mapParams = new URLSearchParams({
      engine: "fossgis_osrm_car",
      route: `${start.lat},${start.lon};${end.lat},${end.lon}`,
    });
    mapLink.href = `https://www.openstreetmap.org/directions?${mapParams}`;
    resultEmpty.hidden = true;
    resultContent.hidden = false;
    setHint("도로를 따라 계산한 거리예요.");
  } catch (error) {
    if (error.name !== "AbortError") {
      setHint(error.message || "거리를 계산하지 못했어요. 잠시 후 다시 시도해 주세요.", "error");
    }
  } finally {
    if (!signal.aborted) setCalculating(false);
  }
}

calculateButton.addEventListener("click", calculateRoute);
updateControls();
