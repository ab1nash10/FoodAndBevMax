// Test data for every location: fills the fields left empty and gives each location a working
// set-up (sub-location, store, kitchen, restaurant, counter, POS device, menu, employees, staff
// discounts, time slots, item prices), so every module can be tried anywhere.
//
// It goes through the API, so the same checks and audit log apply as in the portal. It only fills
// what is empty and only creates what is missing: run it again and nothing changes. It never
// touches payment keys, card machines or UPI IDs, and gives employees no mobile (a staff discount
// OTP would go to that number by real SMS); emails are @example.com.
//
//   Local (signs in as the Super Admin with the dev OTP; no SMS):
//     E2E_MOBILE=<local Super Admin mobile> node scripts/seed-test-data.mjs [--dry-run]
//   Deployed dev (one base for every service; the token of a signed-in Super Admin):
//     AAHAR_API=https://<host>/fandb/api/v1 AAHAR_TOKEN=<access token> node scripts/seed-test-data.mjs
//
// AAHAR_TOKEN is the accessToken in the portal's localStorage entry "aahar.admin.auth" (browser
// dev tools > Application > Local Storage). Signing in here instead would end that browser's
// session: a user is signed in on one browser at a time.

const DRY = process.argv.includes('--dry-run');
const BASE = process.env.AAHAR_API?.replace(/\/$/, '');
const ORG = BASE ?? 'http://localhost:4003/api/v1';
const AUTH = BASE ?? 'http://localhost:4001/api/v1';

const done = { created: 0, failed: [], filled: 0 };

async function signIn() {
  if (process.env.AAHAR_TOKEN) return process.env.AAHAR_TOKEN;
  if (BASE) throw new Error('Set AAHAR_TOKEN to a Super Admin access token for a deployed server.');
  if (!process.env.E2E_MOBILE)
    throw new Error('Set E2E_MOBILE (local Super Admin) or AAHAR_TOKEN.');

  const res = await fetch(`${AUTH}/auth/verify-otp`, {
    body: JSON.stringify({ mobile: process.env.E2E_MOBILE, otp: '000000' }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Sign-in failed (${res.status}): is the auth service in dev mode?`);
  return (await res.json()).data.accessToken;
}

const token = await signIn();

async function api(method, path, body, attempt = 1) {
  const res = await fetch(ORG + path, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    method,
  });
  // The server's rate limit: wait and try again, as a person would.
  if (res.status === 429 && attempt < 8) {
    const wait = Number(res.headers.get('retry-after')) * 1000 || 5000 * attempt;
    await new Promise((resolve) => setTimeout(resolve, wait));
    return api(method, path, body, attempt + 1);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json.message ?? json)}`);
  }
  return json.data;
}

async function list(path) {
  const rows = [];
  for (let page = 1; ; page += 1) {
    const data = await api('GET', `${path}${path.includes('?') ? '&' : '?'}limit=100&page=${page}`);
    const items = Array.isArray(data) ? data : (data?.items ?? []);
    rows.push(...items);
    if (Array.isArray(data) || items.length < 100) return rows;
  }
}

const blank = (value) =>
  value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length);
const same = (a, b) =>
  String(a ?? '')
    .trim()
    .toLowerCase() ===
  String(b ?? '')
    .trim()
    .toLowerCase();

/** Only the wanted fields the record has empty. */
function blanksOf(record, wanted) {
  return Object.fromEntries(Object.entries(wanted).filter(([key]) => blank(record[key])));
}

async function write(label, method, path, body) {
  if (DRY) {
    console.log(`  would ${label}: ${method} ${path} ${JSON.stringify(body)}`);
    return { id: `dry-${Math.random().toString(36).slice(2, 8)}`, ...body };
  }
  try {
    const result = await api(method, path, body);
    if (method === 'POST') done.created += 1;
    else done.filled += 1;
    console.log(`  ${label}`);
    return result ?? {};
  } catch (error) {
    done.failed.push(`${label}: ${error.message}`);
    console.log(`  FAILED ${label}: ${error.message}`);
    return null;
  }
}

async function fill(label, path, record, wanted) {
  const body = blanksOf(record, wanted);
  if (Object.keys(body).length)
    await write(`${label} (${Object.keys(body).join(', ')})`, 'PUT', path, body);
}

// ---- Shared catalogue: categories and items are not per location. -------------------------------

const catalogue = [
  {
    cat: 'Beverages',
    featured: true,
    gst: 5,
    hsn: '0902',
    name: 'Masala Chai',
    prep: 3,
    price: 30,
    room: 40,
  },
  { cat: 'Beverages', gst: 5, hsn: '0901', name: 'Filter Coffee', prep: 3, price: 40, room: 50 },
  {
    cat: 'Beverages',
    gst: 12,
    hsn: '2202',
    name: 'Fresh Lime Soda',
    prep: 2,
    price: 60,
    room: null,
    serveAt: 'COUNTER',
  },
  {
    cat: 'Snacks',
    featured: true,
    gst: 5,
    hsn: '1905',
    kitchen: true,
    name: 'Veg Sandwich',
    prep: 8,
    price: 80,
    room: 100,
  },
  {
    cat: 'Snacks',
    gst: 5,
    hsn: '2106',
    kitchen: true,
    name: 'Samosa (2 pcs)',
    prep: 5,
    price: 40,
    room: null,
    serveAt: 'COUNTER',
  },
  {
    cat: 'Snacks',
    gst: 5,
    hsn: '2106',
    kitchen: true,
    name: 'Paneer Tikka Roll',
    prep: 10,
    price: 120,
    room: 140,
  },
  {
    cat: 'Snacks',
    gst: 5,
    hsn: '2106',
    kitchen: true,
    name: 'Egg Bhurji Pav',
    prep: 10,
    price: 90,
    room: 110,
    type: 'EGGETARIAN',
  },
  {
    cat: 'Meals',
    from: '12:00',
    to: '15:30',
    featured: true,
    gst: 5,
    hsn: '2106',
    kitchen: true,
    name: 'Veg Thali',
    prep: 15,
    price: 180,
    room: 220,
    serves: 1,
    with: 'Rice, roti, dal, sabzi, salad',
  },
  {
    cat: 'Meals',
    gst: 5,
    hsn: '2106',
    kitchen: true,
    name: 'Chicken Biryani',
    prep: 20,
    price: 240,
    room: 280,
    type: 'NON_VEG',
    with: 'Raita, salan',
  },
  {
    cat: 'Meals',
    gst: 5,
    hsn: '2106',
    kitchen: true,
    name: 'Khichdi (Light Diet)',
    prep: 15,
    price: null,
    room: 140,
    serveAt: 'ROOM',
    with: 'Curd',
  },
  {
    cat: 'Meals',
    from: '07:00',
    to: '11:30',
    gst: 5,
    hsn: '2106',
    kitchen: true,
    name: 'Masala Dosa',
    prep: 12,
    price: 110,
    room: 130,
    with: 'Sambar, chutney',
  },
  {
    cat: 'Desserts',
    gst: 5,
    hsn: '2106',
    name: 'Gulab Jamun (2 pcs)',
    prep: 2,
    price: 50,
    room: 60,
  },
  {
    cat: 'Desserts',
    discountable: false,
    gst: 0,
    hsn: '0813',
    name: 'Fruit Bowl',
    prep: 5,
    price: 90,
    room: 110,
  },
];

console.log(`${DRY ? 'DRY RUN: nothing is written.\n' : ''}Catalogue`);
const categories = await list('/item-categories');
const categoryId = {};
for (const name of new Set(catalogue.map((entry) => entry.cat))) {
  const found = categories.find((category) => same(category.categoryName, name));
  categoryId[name] =
    found?.id ??
    (await write(`category ${name}`, 'POST', '/item-categories', { categoryName: name }))?.id;
}

const items = await list('/items');
const itemId = {};
// Made in a kitchen, unless the item is already stocked in a store (MRP): an item is one or the other.
const fromKitchen = {};
for (const entry of catalogue) {
  const found = items.find((item) => same(item.itemName, entry.name));
  const wanted = { hsnCode: entry.hsn, preparationTimeMinutes: entry.prep };
  fromKitchen[entry.name] = Boolean(entry.kitchen) && found?.itemType !== 'MRP';
  if (found) {
    itemId[entry.name] = found.id;
    await fill(`item ${entry.name}`, `/items/${found.id}`, found, wanted);
  } else {
    itemId[entry.name] = (
      await write(`item ${entry.name}`, 'POST', '/items', {
        itemName: entry.name,
        type: entry.type ?? 'VEG',
        ...wanted,
      })
    )?.id;
  }
}

// ---- Per location. ------------------------------------------------------------------------------

const places = {
  blk: { area: 'Rajinder Nagar', lat: '28.6448', lng: '77.1806', pin: '110060' },
  patparganj: { area: 'Patparganj', lat: '28.6280', lng: '77.3078', pin: '110092' },
  saket: { area: 'Saket', lat: '28.5274', lng: '77.2124', pin: '110017' },
  smart: { area: 'Saket', lat: '28.5280', lng: '77.2130', pin: '110017' },
};
const placeOf = (name, index) =>
  Object.entries(places).find(([key]) => name.toLowerCase().includes(key))?.[1] ?? {
    area: 'Saket',
    lat: (28.53 + index / 100).toFixed(4),
    lng: (77.21 + index / 100).toFixed(4),
    pin: '110017',
  };
const shortOf = (name) => name.replace(/^max[\s-]*/i, '').trim() || name;
const slug = (text) =>
  text
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const digits = (seed, length) => {
  let hash = 7;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 1_000_000_007;
  return String(hash).padStart(length, '0').slice(-length);
};
/** A GSTIN in the right shape (Delhi, 07) whose middle is its PAN. */
const gstinFor = (seed) =>
  `07AABCM${digits(seed, 4)}${'ABCDEFGHJK'[Number(digits(seed, 1))]}1Z${digits(seed + 'z', 1)}`;

const hospitals = await list('/hospitals');
const legalEntities = await list('/legal-entities');
const [subLocations, stores, kitchens, restaurants, counters, devices, employees, slots, prices] =
  await Promise.all(
    [
      '/locations',
      '/stores',
      '/kitchens',
      '/restaurants',
      '/counters',
      '/pos-devices',
      '/employees',
      '/time-slots',
      '/item-prices',
    ].map(list),
  );
const storeItems = await list('/store-items');
const kitchenItems = await list('/kitchen-items');
const menus = await list('/restaurant-menus');
const discounts = await list('/employee-discounts');

for (const [index, h] of hospitals.entries()) {
  const name = h.hospitalName ?? h.title;
  const short = shortOf(name);
  const place = placeOf(name, index);
  const address = `Max Hospital, ${place.area}, New Delhi ${place.pin}`;
  console.log(`\n${name}`);

  // Legal entity: the location bills under one.
  let legalEntityId = h.legalEntityId;
  let gstNumber = legalEntities.find((entity) => entity.id === legalEntityId)?.gstNumber;
  if (!legalEntityId) {
    gstNumber = gstinFor(name);
    const entity = await write('legal entity', 'POST', '/legal-entities', {
      entityAddress: address,
      entityName: `${short} Hospitality Pvt Ltd`,
      gstNumber,
      locationName: name,
    });
    legalEntityId = entity?.id;
  }
  gstNumber ??= gstinFor(name);

  await fill('location fields', `/hospitals/${h.id}`, h, {
    address,
    area: place.area,
    billPrefix: `MAX-${slug(short).slice(0, 8)}`,
    city: 'New Delhi',
    displayName: name,
    invoicePrefix: `INV-${slug(short).slice(0, 8)}`,
    ipAddress: `10.65.${10 + index}.10`,
    latitude: place.lat,
    legalEntityId,
    longitude: place.lng,
    postalCode: place.pin,
    state: 'Delhi',
    visitingCardAddress: `${name}\n${address}\nPh: 011-4055 4055`,
  });
  if (blank(h.onlinePaymentOption) || h.onlinePaymentOption === 'NONE') {
    // UPI on the kiosk, QR and till through the server's shared Razorpay keys (no keys stored here).
    await write('online payment: Razorpay', 'PUT', `/hospitals/${h.id}`, {
      onlinePaymentOption: 'RAZORPAY',
    });
  }

  // Sub-location: where in the hospital the outlets are.
  const mine = (rows) => rows.filter((row) => row.hospitalId === h.id);
  let area = mine(subLocations)[0];
  const areaWanted = { address, area: 'Food court', building: 'Main block', floor: 'Ground floor' };
  if (area) await fill('sub-location', `/locations/${area.id}`, area, areaWanted);
  else
    area = await write('sub-location', 'POST', '/locations', {
      hospitalId: h.id,
      locationName: `${short} Food Court`,
      ...areaWanted,
    });
  const locationId = area?.id;

  // Store and kitchen.
  for (const store of mine(stores)) {
    await fill(`store ${store.storeName}`, `/stores/${store.id}`, store, {
      address,
      locationId,
      storeType: 'Main',
    });
  }
  const store =
    mine(stores)[0] ??
    (await write('store', 'POST', '/stores', {
      address,
      hospitalId: h.id,
      locationId,
      storeName: `${short} Main Store`,
      storeType: 'Main',
    }));
  for (const kitchen of mine(kitchens)) {
    await fill(`kitchen ${kitchen.kitchenName}`, `/kitchens/${kitchen.id}`, kitchen, {
      closingTime: '23:00',
      locationId,
      openingTime: '06:00',
    });
  }
  const kitchen =
    mine(kitchens)[0] ??
    (await write('kitchen', 'POST', '/kitchens', {
      closingTime: '23:00',
      hospitalId: h.id,
      kitchenName: `${short} Main Kitchen`,
      locationId,
      openingTime: '06:00',
    }));

  // Restaurant(s): every empty field but the UPI ID (set, it replaces the gateway's QR) and images.
  const restaurantWanted = (restaurant) => ({
    accountNumber: `50100${digits(restaurant.id, 9)}`,
    address,
    bankBranch: place.area,
    bankName: 'HDFC Bank',
    closingTime: '23:00',
    email: `${slug(short).toLowerCase()}.cafe@example.com`,
    fssaiNumber: `1332${digits(restaurant.id, 10)}`,
    gstAddress: address,
    gstNumber,
    ifscCode: `HDFC000${digits(restaurant.id, 4)}`,
    kitchenId: kitchen?.id,
    legalEntityId,
    legalName: `${short} Hospitality Pvt Ltd`,
    locationId,
    mobile: `98100${digits(restaurant.id, 5)}`,
    openingTime: '07:00',
    panNumber: gstNumber.slice(2, 12),
    qrUnitName: `${short} Cafe`,
    shiftTimings: [
      { endTime: '15:00', name: 'Morning', startTime: '07:00' },
      { endTime: '23:00', name: 'Evening', startTime: '15:00' },
    ],
    sodexoMid: `SDX${digits(restaurant.id + 'm', 7)}`,
    sodexoTid: `T${digits(restaurant.id + 't', 7)}`,
    storeId: store?.id,
    sunBu: `BU${digits(restaurant.id + 'b', 4)}`,
    // sunT1/sunT2 are not in the response: they follow sunBu.
    ...(blank(restaurant.sunBu) ? { sunT1: 'T1-FNB', sunT2: 'T2-CAFE' } : {}),
  });
  let outlets = mine(restaurants);
  if (!outlets.length) {
    const made = await write('restaurant', 'POST', '/restaurants', {
      hospitalId: h.id,
      restaurantName: `${short} Cafe`,
      staffDiscountApplicable: true,
    });
    outlets = made ? [made] : [];
  }

  for (const restaurant of outlets) {
    console.log(` ${restaurant.restaurantName}`);
    const wanted = restaurantWanted(restaurant);
    const body = blanksOf(restaurant, wanted);
    if (Object.keys(body).length) {
      await write(
        `  restaurant fields (${Object.keys(body).join(', ')})`,
        'PUT',
        `/restaurants/${restaurant.id}`,
        body,
      );
    }

    // A counter, used for the kiosk and room-service QR where none is picked.
    let counter = counters.find((row) => row.restaurantId === restaurant.id);
    counter ??= await write('  counter', 'POST', '/counters', {
      counterCode: `${restaurant.restaurantCode ?? slug(short)}-C1`,
      counterName: `${restaurant.restaurantName} Counter 1`,
      hospitalId: h.id,
      restaurantId: restaurant.id,
    });
    if (counter?.id && blank(restaurant.kioskCounterId)) {
      await write('  kiosk counter', 'PUT', `/restaurants/${restaurant.id}/kiosk-counter`, {
        counterId: counter.id,
      });
    }
    if (counter?.id && blank(restaurant.qrCounterId)) {
      await write('  QR counter', 'PUT', `/restaurants/${restaurant.id}/qr-counter`, {
        counterId: counter.id,
      });
    }
    // The board and kiosk link; made once, an existing one is kept (regenerate: false).
    if (!DRY)
      await api('POST', `/restaurants/${restaurant.id}/board-link`, { regenerate: false }).catch(
        () => {},
      );

    // Menu: the catalogue at counter and room prices.
    for (const entry of catalogue) {
      const id = itemId[entry.name];
      // An item already mapped to this store keeps that mapping's category on the menu.
      const category =
        storeItems.find((row) => row.storeId === store?.id && row.itemId === id)?.categoryId ??
        categoryId[entry.cat];
      if (!id || !category) continue;
      const kitchenMade = fromKitchen[entry.name] && Boolean(kitchen?.id);
      if (
        !kitchenMade &&
        store?.id &&
        !storeItems.some((row) => row.storeId === store.id && row.itemId === id)
      ) {
        await write(`  store item ${entry.name}`, 'POST', '/store-items', {
          categoryId: category,
          itemId: id,
          storeId: store.id,
        });
        storeItems.push({ categoryId: category, itemId: id, storeId: store.id });
      }
      if (
        kitchenMade &&
        !kitchenItems.some((row) => row.kitchenId === kitchen.id && row.itemId === id)
      ) {
        await write(`  kitchen item ${entry.name}`, 'POST', '/kitchen-items', {
          categoryId: category,
          itemId: id,
          kitchenId: kitchen.id,
        });
        kitchenItems.push({ itemId: id, kitchenId: kitchen.id });
      }
      if (menus.some((row) => row.restaurantId === restaurant.id && row.itemId === id)) continue;
      await write(`  menu ${entry.name}`, 'POST', '/restaurant-menus', {
        accompaniments: entry.with ?? null,
        availableFrom: entry.from ?? null,
        availableTo: entry.to ?? null,
        categoryId: category,
        gstPercent: entry.gst,
        isDiscountable: entry.discountable ?? true,
        isFeatured: entry.featured ?? false,
        isGstInclusive: true,
        itemId: id,
        // From the kitchen that makes it or the store that stocks it, never both.
        kitchenId: kitchenMade ? kitchen.id : null,
        preparationTimeMinutes: entry.prep,
        price: entry.price,
        restaurantId: restaurant.id,
        roomPrice: entry.room,
        serveAt: entry.serveAt ?? 'BOTH',
        serves: entry.serves ?? 1,
        storeId: kitchenMade ? null : (store?.id ?? null),
        subCode: `${slug(entry.cat).slice(0, 3)}-${digits(entry.name, 3)}`,
      });
    }

    // Staff discounts, by employee level.
    if (!discounts.some((row) => row.restaurantId === restaurant.id)) {
      await write('  staff discount on roll', 'POST', '/employee-discounts', {
        discountPercent: 10,
        employmentType: 'ON_ROLL',
        name: `${short} Staff 10%`,
        restaurantId: restaurant.id,
      });
      await write('  staff discount outsourced', 'POST', '/employee-discounts', {
        discountPercent: 5,
        employmentType: 'OUTSOURCED',
        name: `${short} Outsourced 5%`,
        restaurantId: restaurant.id,
      });
    }
  }

  // A POS device for the location's restaurants (a made-up host name: no real computer is a till).
  const device = mine(devices)[0];
  if (device) {
    await fill(`POS device ${device.name}`, `/pos-devices/${device.id}`, device, { legalEntityId });
  } else if (outlets.length) {
    const code = `TT-${slug(h.hospitalCode ?? short)}`.slice(0, 20);
    await write('POS device', 'POST', '/pos-devices', {
      code,
      hospitalId: h.id,
      hostName: `TEST-${code}`.slice(0, 60),
      isInvoicePrintEnabled: true,
      isKotPrintEnabled: false,
      legalEntityId,
      name: `${short} Test Till`,
      restaurantIds: outlets.map((restaurant) => restaurant.id),
    });
  }

  // Employees: on roll, outsourced, and one not eligible for the discount. No mobiles (real SMS).
  const people = mine(employees);
  // The manager: whoever others already report to, else the first with no manager of their own.
  const manager =
    people.find((person) => people.some((other) => other.reportingManagerId === person.id)) ??
    people.find((person) => blank(person.reportingManagerId)) ??
    people[0];
  const hasReports = (person) => people.some((other) => other.reportingManagerId === person.id);
  const employeeWanted = (person, n) => ({
    birthDate: `19${85 + (n % 10)}-0${1 + (n % 9)}-15`,
    department: 'Food & Beverages',
    designation: n === 0 ? 'F&B Manager' : 'Service Associate',
    employeeLevel: n === 0 ? 'L3' : 'L1',
    gender: n % 2 ? 'FEMALE' : 'MALE',
    hospitalId: h.id,
    joiningDate: `202${n % 5}-04-01`,
    legalEntityId,
    officialEmail: `${slug(person.employeeName ?? `emp${n}`).toLowerCase()}.${slug(short).toLowerCase()}@example.com`,
    ...(manager && person.id !== manager.id && !hasReports(person)
      ? { reportingManagerId: manager.id }
      : {}),
  });
  for (const [n, person] of people.entries()) {
    await fill(
      `employee ${person.employeeName}`,
      `/employees/${person.id}`,
      person,
      employeeWanted(person, n),
    );
  }
  if (people.length < 3) {
    const starter = [
      { eligibleForDiscount: true, employeeName: `${short} Ravi Kumar`, employmentType: 'ON_ROLL' },
      {
        eligibleForDiscount: true,
        employeeName: `${short} Priya Sharma`,
        employmentType: 'OUTSOURCED',
      },
      {
        eligibleForDiscount: false,
        employeeName: `${short} Amit Verma`,
        employmentType: 'ON_ROLL',
      },
    ];
    let boss = manager;
    for (const [n, person] of starter.slice(people.length).entries()) {
      const made = await write(`employee ${person.employeeName}`, 'POST', '/employees', {
        ...person,
        ...employeeWanted(person, people.length + n),
        ...(boss ? { reportingManagerId: boss.id } : {}),
      });
      boss ??= made;
    }
  }

  // Time slots of its own (slot names are unique across locations).
  for (const [slot, startTime, endTime] of [
    ['Breakfast', '07:00', '10:30'],
    ['Lunch', '12:00', '15:30'],
    ['Dinner', '19:00', '22:30'],
  ]) {
    const slotName = `${short} ${slot}`;
    if (!slots.some((row) => same(row.slotName, slotName))) {
      await write(`time slot ${slotName}`, 'POST', '/time-slots', {
        endTime,
        hospitalId: h.id,
        slotName,
        startTime,
      });
    }
  }

  // Location-level item prices, normal and room.
  for (const entry of catalogue) {
    const id = itemId[entry.name];
    for (const [rateType, price] of [
      ['NORMAL', entry.price],
      ['ROOM', entry.room],
    ]) {
      if (!id || !price) continue;
      if (
        prices.some(
          (row) => row.hospitalId === h.id && row.itemId === id && row.rateType === rateType,
        )
      )
        continue;
      await write(`price ${entry.name} ${rateType}`, 'POST', '/item-prices', {
        effectiveFrom: '2026-11-01',
        gstPercent: entry.gst,
        hospitalId: h.id,
        isTaxInclusive: true,
        itemId: id,
        price,
        rateType,
      });
    }
  }
}

console.log(
  `\n${DRY ? 'Dry run done.' : 'Done.'} Created ${done.created}, filled ${done.filled}, failed ${done.failed.length}.`,
);
for (const failure of done.failed) console.log(`  - ${failure}`);
process.exitCode = done.failed.length ? 1 : 0;
