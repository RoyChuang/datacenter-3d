// Stand-in for a real telemetry feed (WebSocket / MQTT / REST polling).
// Calls onReading(id, { temp, humidity, time }) for every sensor at a fixed interval.
// A few fixed hot spots keep warning / alarm states visible in the demo.
const HOT_SPOTS = { 6: 28.6, 23: 28.9, 31: 31.2 }; // sensor index -> typical temperature

export function startMockLive(points, onReading, intervalMs = 2000) {
  const sensors = points.filter((p) => p.type === 'sensor');
  const base = new Map(sensors.map((s, i) => [s.id, HOT_SPOTS[i] ?? 22.5 + Math.random() * 2.5]));
  const state = new Map(sensors.map((s) => [s.id, { temp: base.get(s.id), humidity: 45 + Math.random() * 10 }]));

  const tick = () => {
    for (const s of sensors) {
      const v = state.get(s.id);
      // wander around the sensor's own typical value instead of drifting off
      v.temp += (base.get(s.id) - v.temp) * 0.15 + (Math.random() - 0.5) * 0.6;
      v.humidity = Math.min(65, Math.max(35, v.humidity + (Math.random() - 0.5) * 1.5));
      onReading(s.id, { temp: +v.temp.toFixed(1), humidity: +v.humidity.toFixed(0), time: new Date() });
    }
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);
}
