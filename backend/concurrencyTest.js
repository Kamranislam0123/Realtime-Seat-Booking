const URL = "http://localhost:5000/api/bookings";

// Pass a valid JWT as TOKEN when running this test.
const TOKEN = process.env.TOKEN;

if (!TOKEN) {
  throw new Error("Set TOKEN to a valid JWT before running this test.");
}

async function testBooking() {
  const requests = [];

  for (let i = 1; i <= 100; i++) {
    requests.push(
      fetch(URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TOKEN}`
        },
        body: JSON.stringify({
          seat_id: 9
        })
      })
    );
  }

  const responses = await Promise.all(requests);

  const results = await Promise.all(
    responses.map(async (res) => ({
      status: res.status,
      body: await res.json()
    }))
  );

  const successful = results.filter((r) => r.status === 201);
  const failed = results.filter((r) => r.status === 409);
  const unauthorized = results.filter((r) => r.status === 401);

  console.log("Total Requests:", results.length);
  console.log("Successful Bookings:", successful.length);
  console.log("Rejected Bookings (seat already booked):", failed.length);
  console.log("Unauthorized:", unauthorized.length);
  console.log(
    "Unexpected Responses:",
    results.length - successful.length - failed.length - unauthorized.length
  );
}

testBooking().catch(console.error);
