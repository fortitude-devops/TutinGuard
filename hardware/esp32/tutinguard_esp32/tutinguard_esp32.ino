// TutinGuard — ESP32 demo detector (smoke MQ-2 + temperature DS18B20 + optional flame sensor).
// Sends raw readings every 2 s to POST /api/ingest. All thresholds live on the server
// (adaptive baseline, warm-up after reconnect, range check — backend/app/quality.py), so the board stays simple.
//
// Libraries (Arduino IDE → Library Manager): OneWire, DallasTemperature. Board: "ESP32 Dev Module".
#include <WiFi.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ---------- settings ----------
const char* WIFI_SSID   = "YOUR_WIFI";
const char* WIFI_PASS   = "YOUR_PASSWORD";
const char* SERVER      = "http://192.168.1.10:8000";   // computer running docker compose (same Wi-Fi)
const char* INGEST_TOKEN = "";                           // = INGEST_TOKEN from .env (empty if not set)
const char* SITE_ID     = "office-01";
const char* DEVICE_ID   = "ESP-01";                      // create it first: app → Objects → Detector (type "Multisensor")
const int PIN_MQ2   = 34;   // MQ-2 AO  → GPIO34 (ADC1, input only). Power the module from 5 V, AO through a 10k/20k divider!
const int PIN_DS18  = 4;    // DS18B20 DQ → GPIO4, 4.7 kΩ pull-up to 3.3 V
const int PIN_FLAME = 27;   // flame sensor DO → GPIO27 (LOW = flame on most KY-026 modules); leave unconnected if absent
const int PIN_LED   = 2;    // on-board LED blinks on every successful send
const bool HAS_FLAME = false;
// --------------------------------

OneWire oneWire(PIN_DS18);
DallasTemperature ds(&oneWire);
uint32_t seq = 0;

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Wi-Fi");
  for (int i = 0; i < 60 && WiFi.status() != WL_CONNECTED; i++) { delay(500); Serial.print('.'); }
  Serial.println(WiFi.status() == WL_CONNECTED ? " ok " + WiFi.localIP().toString() : " FAILED");
}

int readSmoke() {             // average 16 samples to calm the ADC noise
  long s = 0;
  for (int i = 0; i < 16; i++) { s += analogRead(PIN_MQ2); delay(2); }
  return s / 16;
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED, OUTPUT);
  if (HAS_FLAME) pinMode(PIN_FLAME, INPUT_PULLUP);
  analogSetPinAttenuation(PIN_MQ2, ADC_11db);   // 0…3.3 V range
  ds.begin();
  connectWifi();
  Serial.println("MQ-2 heats up ~60 s; the server ignores its alarms during warm-up anyway.");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWifi();
  ds.requestTemperatures();
  float t = ds.getTempCByIndex(0);                 // -127 = sensor missing → the server drops it (range check)
  int smoke = readSmoke();
  bool flame = HAS_FLAME && digitalRead(PIN_FLAME) == LOW;

  String body = String("{\"site_id\":\"") + SITE_ID + "\",\"device_id\":\"" + DEVICE_ID + "\",\"device_type\":\"multi\",\"model\":\"ESP32 + MQ-2 + DS18B20\",\"seq\":" + (++seq) +
                ",\"values\":{\"smoke_raw\":" + smoke + ",\"temp_c\":" + String(t, 1) + (HAS_FLAME ? String(",\"flame\":") + (flame ? 1 : 0) : "") + "}}";
  HTTPClient http;
  http.begin(String(SERVER) + "/api/ingest");
  http.addHeader("Content-Type", "application/json");
  if (strlen(INGEST_TOKEN)) http.addHeader("X-Ingest-Token", INGEST_TOKEN);
  int code = http.POST(body);
  http.end();
  Serial.printf("smoke=%d temp=%.1f flame=%d -> HTTP %d\n", smoke, t, flame, code);
  if (code == 200) { digitalWrite(PIN_LED, HIGH); delay(40); digitalWrite(PIN_LED, LOW); }
  delay(2000);
}
