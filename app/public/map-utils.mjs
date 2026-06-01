function mapPointFromPlace(place, kind) {
  return {
    id: place.id || kind,
    kind,
    title: place.placeName,
    latitude: Number(place.latitude),
    longitude: Number(place.longitude),
    rating: null,
    revisitStatus: kind,
    memory: null
  };
}

function firstText(value) {
  if (Array.isArray(value)) return String(value[0] || "");
  return String(value || "");
}

export function normalizePlaceSearchResults(pois = [], fallbackQuery = "") {
  return pois
    .filter((poi) => poi?.location)
    .map((poi, index) => ({
      id: poi.id || `place_${index}`,
      placeName: firstText(poi.name) || fallbackQuery,
      address: firstText(poi.address),
      city: firstText(poi.cityname),
      district: firstText(poi.adname),
      latitude: Number(poi.location.lat),
      longitude: Number(poi.location.lng)
    }))
    .filter((place) => place.placeName && Number.isFinite(place.latitude) && Number.isFinite(place.longitude));
}

function cityName(memory) {
  return memory.city || memory.district || "";
}

function routeDate(memory) {
  return `${memory.memoryDate || ""}${memory.createdAt || ""}`;
}

const provinceByCode = {
  "11": "北京市",
  "12": "天津市",
  "13": "河北省",
  "14": "山西省",
  "15": "内蒙古自治区",
  "21": "辽宁省",
  "22": "吉林省",
  "23": "黑龙江省",
  "31": "上海市",
  "32": "江苏省",
  "33": "浙江省",
  "34": "安徽省",
  "35": "福建省",
  "36": "江西省",
  "37": "山东省",
  "41": "河南省",
  "42": "湖北省",
  "43": "湖南省",
  "44": "广东省",
  "45": "广西壮族自治区",
  "46": "海南省",
  "50": "重庆市",
  "51": "四川省",
  "52": "贵州省",
  "53": "云南省",
  "54": "西藏自治区",
  "61": "陕西省",
  "62": "甘肃省",
  "63": "青海省",
  "64": "宁夏回族自治区",
  "65": "新疆维吾尔自治区"
};

const cityProvinceHints = {
  "合肥": "安徽省",
  "芜湖": "安徽省",
  "杭州": "浙江省",
  "宁波": "浙江省",
  "南京": "江苏省",
  "苏州": "江苏省",
  "上海": "上海市",
  "北京": "北京市",
  "广州": "广东省",
  "深圳": "广东省",
  "成都": "四川省",
  "重庆": "重庆市",
  "武汉": "湖北省",
  "长沙": "湖南省",
  "西安": "陕西省"
};

export function provinceNameFromAdcode(adcode = "") {
  return provinceByCode[String(adcode).slice(0, 2)] || "";
}

export function provinceNameFromMemory(memory = {}) {
  const direct = provinceNameFromAdcode(memory.adcode || memory.cityAdcode || memory.districtAdcode);
  if (direct) return direct;
  const text = [memory.city, memory.district, memory.address].filter(Boolean).join(" ");
  const province = Object.values(provinceByCode).find((name) => text.includes(name.replace(/省|市|自治区|壮族|回族|维吾尔/g, "")) || text.includes(name));
  if (province) return province;
  const hinted = Object.entries(cityProvinceHints).find(([city]) => text.includes(city));
  return hinted?.[1] || "";
}

export function provinceStats(memories = []) {
  const groups = new Map();
  memories.forEach((memory) => {
    const province = provinceNameFromMemory(memory);
    if (!province) return;
    const current = groups.get(province) || [];
    current.push(memory);
    groups.set(province, current);
  });

  return [...groups.entries()]
    .map(([province, items]) => {
      const latest = [...items].sort((a, b) => routeDate(b).localeCompare(routeDate(a)))[0] || {};
      return {
        province,
        count: items.length,
        latestCity: cityName(latest),
        latestPlace: latest.placeName || ""
      };
    })
    .sort((a, b) => b.count - a.count || a.province.localeCompare(b.province));
}

export function outlineMapTarget(homeView, level = "city", context = {}) {
  if (level === "country") {
    return { label: "中国", level: "country", searchName: "中国" };
  }

  if (level === "province") {
    const provinceName = context.provinceName || provinceNameFromAdcode(context.cityAdcode || context.adcode);
    return {
      label: provinceName || "中国",
      level: provinceName ? "province" : "country",
      searchName: provinceName || "中国"
    };
  }

  const city = context.cityName || homeView.city || "";
  return {
    label: city || "中国",
    level: city ? "city" : "country",
    searchName: city || "中国"
  };
}

export function homeMapView(memories = []) {
  if (!memories.length) return { city: "", memories: [], route: [] };

  const counts = new Map();
  memories.forEach((memory) => {
    const city = cityName(memory);
    if (!city) return;
    counts.set(city, (counts.get(city) || 0) + 1);
  });

  let city = "";
  let count = 0;
  for (const [candidate, candidateCount] of counts) {
    if (candidateCount > count) {
      city = candidate;
      count = candidateCount;
    }
  }

  const homeMemories = city ? memories.filter((memory) => cityName(memory) === city) : memories;
  const route = [...homeMemories].sort((a, b) => routeDate(a).localeCompare(routeDate(b)));
  return { city, memories: homeMemories, route };
}

export function mapPresentation(hasActivePlace = false) {
  if (hasActivePlace) {
    return {
      mapStyle: "amap://styles/normal",
      features: ["bg", "road", "building", "point"]
    };
  }

  return {
    mapStyle: "amap://styles/normal",
    features: ["bg", "road"]
  };
}

export function renderableMapPoints(memories = [], draft = null, searchedPlace = null) {
  const memoryPoints = memories.map((memory) => ({
    id: memory.id,
    kind: "memory",
    title: memory.placeName,
    latitude: Number(memory.latitude),
    longitude: Number(memory.longitude),
    rating: memory.rating,
    revisitStatus: memory.revisitStatus,
    memory
  }));

  if (draft) return [...memoryPoints, mapPointFromPlace(draft, "draft")];

  if (searchedPlace) return [...memoryPoints, mapPointFromPlace(searchedPlace, "searched")];

  return memoryPoints;
}
