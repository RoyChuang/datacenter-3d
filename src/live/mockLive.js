// Stand-in for a real telemetry feed (WebSocket / MQTT / REST polling).
// Calls onReading(id, { temp, humidity, time }) for every sensor at a fixed interval.
// `hotSpots` (sensor id -> typical °C, from site.yaml `mock.hotSpots`) keeps warning / alarm states visible
// in a demo; without it every sensor wanders around a normal room temperature.
export function startMockLive(points, onReading, { hotSpots = {}, intervalMs = 2000 } = {}) {
  const sensors = points.filter((p) => p.type === 'sensor');
  const base = new Map(sensors.map((s) => [s.id, hotSpots[s.id] ?? 22.5 + Math.random() * 2.5]));
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
