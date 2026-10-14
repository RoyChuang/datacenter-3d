// Stand-in for a real telemetry feed (WebSocket / MQTT / REST polling).
// Calls onReading(id, { temp, humidity, time }) for every sensor at a fixed interval.
export function startMockLive(points, onReading, intervalMs = 2000) {
  const sensors = points.filter((p) => p.type === 'sensor');
  const state = new Map(sensors.map((s) => [s.id, { temp: 22 + Math.random() * 4, humidity: 45 + Math.random() * 10 }]));

  const tick = () => {
    for (const s of sensors) {
      const v = state.get(s.id);
      v.temp = Math.min(33, Math.max(19, v.temp + (Math.random() - 0.48) * 0.8));
      v.humidity = Math.min(65, Math.max(35, v.humidity + (Math.random() - 0.5) * 1.5));
      onReading(s.id, { temp: +v.temp.toFixed(1), humidity: +v.humidity.toFixed(0), time: new Date() });
    }
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);
}
