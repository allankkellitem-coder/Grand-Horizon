const http = require('http');

function request(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runTests() {
  console.log('Testing endpoints...');

  // 1. GET /
  const home = await request({ hostname: 'localhost', port: 3000, path: '/', method: 'GET' });
  console.log('GET / status:', home.statusCode, home.body.includes("Eldoret's Premier Boutique Stay") ? 'SUCCESS' : 'FAILED');

  // 2. GET /search
  const search = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/search?checkIn=2026-11-01&checkOut=2026-11-05',
    method: 'GET',
  });
  console.log('GET /search status:', search.statusCode, search.body.includes('Available Accommodations') ? 'SUCCESS' : 'FAILED');

  // 3. GET /book
  const book = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/book?room_id=1&checkIn=2026-11-01&checkOut=2026-11-05',
    method: 'GET',
  });
  console.log('GET /book status:', book.statusCode, book.body.includes('Complete Your Reservation') ? 'SUCCESS' : 'FAILED');

  // 4. GET /login
  const loginGet = await request({ hostname: 'localhost', port: 3000, path: '/login', method: 'GET' });
  console.log('GET /login status:', loginGet.statusCode, loginGet.body.includes('Authorize & Log In') ? 'SUCCESS' : 'FAILED');

  // 5. POST /auth/login
  const loginPayload = 'email=allan%40gmail.com&password=1177';
  const loginPost = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(loginPayload),
      },
    },
    loginPayload
  );
  console.log('POST /auth/login status:', loginPost.statusCode, loginPost.headers.location);

  const cookie = loginPost.headers['set-cookie'] ? loginPost.headers['set-cookie'][0].split(';')[0] : '';
  console.log('Session Cookie received:', !!cookie);

  // 6. GET /dashboard with cookie
  const dash = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/dashboard',
    method: 'GET',
    headers: { Cookie: cookie },
  });
  console.log('GET /dashboard status:', dash.statusCode, dash.body.includes('Operational Staff Desk') ? 'SUCCESS' : 'FAILED');

  // 7. GET /dashboard/categories
  const cat = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/dashboard/categories',
    method: 'GET',
    headers: { Cookie: cookie },
  });
  console.log('GET /dashboard/categories status:', cat.statusCode, cat.body.includes('Inventory Categories Manager') ? 'SUCCESS' : 'FAILED');

  // 8. GET /dashboard/rooms
  const rooms = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/dashboard/rooms',
    method: 'GET',
    headers: { Cookie: cookie },
  });
  console.log('GET /dashboard/rooms status:', rooms.statusCode, rooms.body.includes('Hotel Rooms Master CRUD') ? 'SUCCESS' : 'FAILED');

  // 9. GET /dashboard/services
  const serv = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/dashboard/services',
    method: 'GET',
    headers: { Cookie: cookie },
  });
  console.log('GET /dashboard/services status:', serv.statusCode, serv.body.includes('Add-on Services CRUD Manager') ? 'SUCCESS' : 'FAILED');

  // 10. GET /dashboard/staff
  const staff = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/dashboard/staff',
    method: 'GET',
    headers: { Cookie: cookie },
  });
  console.log('GET /dashboard/staff status:', staff.statusCode, staff.body.includes('Staff Account & Privilege Manager') ? 'SUCCESS' : 'FAILED');

  // 11. POST /book to test booking creation
  const bookPayload = 'room_id=1&checkIn=2026-11-01&checkOut=2026-11-05&guest_name=John+Doe&guest_email=john%40example.com&guest_phone=0712345678&guest_id_passport=A1234567&services=1&qty_service_1=2';
  const bookPost = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/book',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(bookPayload),
      },
    },
    bookPayload
  );
  console.log('POST /book status:', bookPost.statusCode, bookPost.body.includes('Reservation Confirmed!') ? 'SUCCESS' : 'FAILED');

  console.log('All automated endpoint tests finished!');
}

runTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
