import type { Component, Condition, InventoryItem, Project } from '../types';
import { uid } from '../lib/utils';

/*
 * DEMO DATA. All prices are approximate reference prices in INR for demonstration.
 * They are not live market prices. Electrical specs are simplified summaries; always
 * verify against the datasheet of the part you actually own.
 */
export const BUNDLED_COMPONENTS: Component[] = [
  { id: 'arduino-uno', name: 'Arduino Uno', category: 'Microcontrollers', description: 'ATmega328P board with 14 digital and 6 analog pins.', unitPrice: 650, weightGrams: 25, specs: '5V logic, 7–12V input, 20 mA per I/O pin', compatibility: '5V logic. Sensors must accept 5V signals or use a level shifter.' },
  { id: 'esp32', name: 'ESP32 Dev Board', category: 'Microcontrollers', description: 'Wi-Fi and Bluetooth microcontroller board.', unitPrice: 450, weightGrams: 10, specs: '3.3V logic (GPIO not 5V tolerant)', compatibility: '3.3V logic. Connecting 5V sensors directly can damage GPIO pins.' },
  { id: 'ultrasonic', name: 'Ultrasonic Sensor HC-SR04', category: 'Sensors', description: 'Distance measurement via ultrasonic echo.', unitPrice: 90, weightGrams: 8, specs: '5V supply, 2–400 cm range', compatibility: 'Echo output is 5V. Use a voltage divider with 3.3V boards.' },
  { id: 'soil-moisture', name: 'Soil Moisture Sensor', category: 'Sensors', description: 'Analog soil-moisture probe for watering systems.', unitPrice: 120, weightGrams: 10, specs: '3.3–5V, analog output', compatibility: 'Analog output. Corrosion shortens probe life.' },
  { id: 'dht11', name: 'DHT11 Temperature & Humidity Sensor', category: 'Sensors', description: 'Digital temperature and humidity sensor.', unitPrice: 110, weightGrams: 4, specs: '3–5.5V, 0–50 °C, ±2 °C', compatibility: 'Single-wire data line. Needs a pull-up resistor (about 10 kΩ).' },
  { id: 'pir', name: 'PIR Motion Sensor HC-SR501', category: 'Sensors', description: 'Passive infrared motion detector.', unitPrice: 80, weightGrams: 5, specs: '5–20V supply, digital output', compatibility: 'Needs about 30–60 s warm-up after power-on.' },
  { id: 'ldr', name: 'LDR Light Sensor', category: 'Sensors', description: 'Light-dependent resistor for dark/light sensing.', unitPrice: 20, weightGrams: 3, specs: 'Resistance falls as light increases', compatibility: 'Use in a voltage divider or with a transistor switch.' },
  { id: 'ir-obstacle', name: 'IR Obstacle Sensor', category: 'Sensors', description: 'Infrared proximity sensor with digital output.', unitPrice: 60, weightGrams: 3, specs: '3–5V, digital output, adjustable range', compatibility: 'Adjust the potentiometer for detection range.' },
  { id: 'servo', name: 'Servo Motor SG90', category: 'Motors & Actuators', description: 'Micro servo with 0–180° travel.', unitPrice: 140, weightGrams: 9, specs: '4.8–6V, 1.8 kg·cm, 0–180°', compatibility: 'Draws peak current. Power from an external 5V supply, not the Arduino 5V pin.' },
  { id: 'dc-motor', name: 'DC Geared Motor', category: 'Motors & Actuators', description: 'Low-voltage geared DC motor for wheels or lifts.', unitPrice: 120, weightGrams: 30, specs: '3–6V, approx. 100–200 RPM', compatibility: 'Needs a motor driver. Never drive directly from a GPIO pin.' },
  { id: 'motor-driver', name: 'L298N Motor Driver', category: 'Motors & Actuators', description: 'Dual H-bridge motor driver module.', unitPrice: 220, weightGrams: 30, specs: '5–35V motor supply, 2 A per channel', compatibility: 'Voltage drop of about 2V across the driver. Heat sink advised.' },
  { id: 'relay', name: '5V Relay Module', category: 'Motors & Actuators', description: 'Single-channel relay for switching external loads.', unitPrice: 70, weightGrams: 15, specs: '5V coil, check contact rating on label', compatibility: 'Confirm trigger level (active-low or active-high) and contact rating before switching loads.' },
  { id: 'water-pump', name: 'Mini Submersible Water Pump', category: 'Fluidics', description: 'Small 5V DC submersible pump.', unitPrice: 250, weightGrams: 40, specs: '3–5V DC, approx. 100–150 mA (typical)', compatibility: 'Verify voltage and current draw against the supply and relay.' },
  { id: 'tubing', name: 'Silicone Tubing (1 m set)', category: 'Fluidics', description: 'Flexible tubing for water delivery.', unitPrice: 60, weightGrams: 20, specs: '4 mm inner diameter (typical)', compatibility: 'Match tubing diameter to the pump outlet.' },
  { id: 'lcd16x2', name: '16x2 LCD Display (I2C)', category: 'Displays & Output', description: 'Character LCD with I2C backpack.', unitPrice: 180, weightGrams: 40, specs: '5V, 16 characters × 2 lines', compatibility: 'Confirm the I2C address (commonly 0x27 or 0x3F).' },
  { id: 'led', name: 'LED 5 mm', category: 'Displays & Output', description: 'Standard 5 mm indicator LED.', unitPrice: 2, weightGrams: 0.2, specs: 'About 2V forward voltage, 20 mA', compatibility: 'Always use a series resistor.' },
  { id: 'buzzer', name: 'Active Buzzer', category: 'Displays & Output', description: 'Self-oscillating buzzer for alerts.', unitPrice: 25, weightGrams: 3, specs: '3–5V DC', compatibility: 'Active buzzers have a fixed tone. Passive buzzers need PWM.' },
  { id: 'resistor', name: 'Resistor 220 Ω', category: 'Passives', description: 'Carbon film resistor, 220 ohm, 1/4 W.', unitPrice: 1, weightGrams: 0.1, specs: '220 Ω, 1/4 W', compatibility: '' },
  { id: 'jumper', name: 'Jumper Wires (per wire)', category: 'Wiring & Prototyping', description: 'Dupont jumper wires for breadboard prototyping.', unitPrice: 1, weightGrams: 0.5, specs: 'Male–male / male–female', compatibility: '' },
  { id: 'breadboard', name: 'Breadboard (830 points)', category: 'Wiring & Prototyping', description: 'Solderless prototyping board.', unitPrice: 150, weightGrams: 40, specs: '830 tie points', compatibility: '' },
  { id: 'battery-holder', name: 'Battery Holder (4 × AA)', category: 'Power', description: 'Holder for four AA cells.', unitPrice: 40, weightGrams: 15, specs: '6V nominal', compatibility: 'Check the current rating against the load.' },
  { id: 'power-supply', name: '5V 2A Power Adapter', category: 'Power', description: 'Regulated 5V DC adapter.', unitPrice: 200, weightGrams: 60, specs: '5V, 2 A', compatibility: 'Confirm total load (pump, relay, controller) stays below 2 A.' },
];

export const BUNDLED_PROJECTS: Project[] = [
  {
    id: 'plant-watering',
    name: 'Automatic Plant Watering System',
    aliases: ['Plant Watering System', 'Smart Watering System'],
    category: 'Home & Garden',
    description: 'Waters a plant automatically when the soil moisture drops below a threshold.',
    difficulty: 'Intermediate',
    durationMinutes: 180,
    newProductPrice: 1999,
    consumablesCost: 50,
    icon: 'sprout',
    requiresSpecCheck: true,
    requirements: [
      { componentId: 'arduino-uno', quantity: 1, alternatives: ['esp32'], critical: true },
      { componentId: 'soil-moisture', quantity: 1 },
      { componentId: 'relay', quantity: 1 },
      { componentId: 'water-pump', quantity: 1 },
      { componentId: 'tubing', quantity: 1 },
      { componentId: 'power-supply', quantity: 1 },
      { componentId: 'jumper', quantity: 10 },
      { componentId: 'breadboard', quantity: 1 },
    ],
    instructions: [
      'Read the pump’s rated voltage and current, and the power supply’s output, before wiring anything.',
      'Mount the soil moisture sensor in the pot. Connect VCC and GND to the 5V and GND rails, and its analog output to an analog pin.',
      'Connect the relay module’s signal pin to a digital pin, and power its coil from the 5V rail.',
      'Wire the pump through the relay’s switched contacts, powered from the external supply. Never power the pump from the Arduino 5V pin.',
      'Attach tubing to the pump outlet. Test the pump in a container of water before placing it near the plant.',
      'Upload a sketch that reads the sensor and switches the relay when the reading falls below a threshold you calibrate.',
      'Calibrate in dry and wet soil, run a short pump test, and check for leaks.',
    ],
    safety: [
      'Keep water away from powered electronics. Use a drip tray and a waterproof enclosure for the controller.',
      'Disconnect power before changing any wiring.',
      'Do not exceed the relay’s contact rating or the power supply’s current rating.',
      'Do not connect mains wiring yourself. Use a commercially rated adapter and seek a qualified electrician for any mains work.',
    ],
    compatibilityNotes: [
      'Relay trigger level (active-low or active-high) must match the sketch.',
      'Pump current draw must sit below the power supply rating with headroom.',
      'An ESP32 is 3.3V logic. Check sensor voltage levels before substituting it for the Arduino Uno.',
    ],
  },
  {
    id: 'weather-station',
    name: 'Mini Weather Station',
    aliases: ['Weather Station', 'Digital Weather Station'],
    category: 'Environment',
    description: 'Displays temperature and humidity readings on a small LCD.',
    difficulty: 'Beginner',
    durationMinutes: 150,
    newProductPrice: 2499,
    consumablesCost: 80,
    icon: 'cloud',
    requiresSpecCheck: false,
    requirements: [
      { componentId: 'arduino-uno', quantity: 1, alternatives: ['esp32'], critical: true },
      { componentId: 'dht11', quantity: 1, critical: true },
      { componentId: 'lcd16x2', quantity: 1 },
      { componentId: 'breadboard', quantity: 1 },
      { componentId: 'jumper', quantity: 15 },
      { componentId: 'power-supply', quantity: 1 },
    ],
    instructions: [
      'Wire the DHT11: VCC to 5V, GND to GND, data to a digital pin, with a pull-up resistor (about 10 kΩ) between data and VCC.',
      'Connect the I2C LCD to the Uno’s SDA and SCL pins, with 5V and GND.',
      'Install the DHT and I2C LCD libraries in the Arduino IDE.',
      'Upload a sketch that reads temperature and humidity every few seconds and prints them on the LCD.',
      'Compare readings with a reference thermometer.',
      'Place the sensor away from heat sources and direct sunlight.',
    ],
    safety: [
      'Power the system from USB or a 5V adapter only. Do not wire into mains.',
      'Keep the sensor away from heating elements.',
      'The DHT11 is a low-cost sensor (±2 °C). Do not treat its readings as calibrated instrumentation.',
    ],
    compatibilityNotes: [
      'DHT11 needs a pull-up resistor on the data line.',
      'Confirm the LCD’s I2C address before uploading the sketch.',
    ],
  },
  {
    id: 'smart-dustbin',
    name: 'Smart Dustbin',
    aliases: ['Smart Trash Bin', 'Automatic Dustbin'],
    category: 'Smart Home',
    description: 'Opens the lid automatically when a person approaches, using distance sensing and a servo.',
    difficulty: 'Intermediate',
    durationMinutes: 240,
    newProductPrice: 1899,
    consumablesCost: 60,
    icon: 'trash',
    requiresSpecCheck: true,
    requirements: [
      { componentId: 'arduino-uno', quantity: 1, alternatives: ['esp32'], critical: true },
      { componentId: 'ultrasonic', quantity: 1, critical: true },
      { componentId: 'servo', quantity: 1 },
      { componentId: 'jumper', quantity: 12 },
      { componentId: 'breadboard', quantity: 1 },
      { componentId: 'power-supply', quantity: 1 },
    ],
    instructions: [
      'Mount the HC-SR04 at the lid opening, facing into the approach area.',
      'Connect trigger and echo to two digital pins, with VCC to 5V and GND to GND.',
      'Power the SG90 from the external 5V supply, with a common ground to the Arduino GND. Connect its signal to a PWM pin.',
      'Upload a sketch that measures distance and rotates the lid open when an object is within about 20 cm.',
      'Test the lid mechanism without the bin first, and set the open angle and hold time.',
      'Attach the lid and secure the servo.',
      'Run a 30-minute test and check that the servo does not stall.',
    ],
    safety: [
      'Keep fingers clear of the servo arm and lid hinge.',
      'Do not run the servo from the Arduino 5V pin under load.',
      'Seal electronics from the waste area to prevent moisture and contamination.',
    ],
    compatibilityNotes: [
      'Verify the servo’s voltage and stall torque against the supply.',
      'The HC-SR04 echo pin outputs 5V. Use a divider with 3.3V boards.',
    ],
  },
  {
    id: 'obstacle-robot',
    name: 'Obstacle-Avoiding Robot',
    aliases: ['Obstacle Avoiding Robot', 'Robot Car'],
    category: 'Robotics',
    description: 'A two-wheel robot that drives forward and turns away from obstacles.',
    difficulty: 'Advanced',
    durationMinutes: 300,
    newProductPrice: 2499,
    consumablesCost: 120,
    icon: 'bot',
    requiresSpecCheck: true,
    requirements: [
      { componentId: 'arduino-uno', quantity: 1, alternatives: ['esp32'], critical: true },
      { componentId: 'ultrasonic', quantity: 1, critical: true },
      { componentId: 'motor-driver', quantity: 1 },
      { componentId: 'dc-motor', quantity: 2 },
      { componentId: 'battery-holder', quantity: 1 },
      { componentId: 'jumper', quantity: 15 },
      { componentId: 'breadboard', quantity: 1 },
    ],
    instructions: [
      'Mount the two DC motors on the chassis and check that the gearing and wheel size suit your build.',
      'Connect the L298N outputs to the motors. Power the driver’s motor supply from the battery holder, and check the motor rating against the battery voltage.',
      'Connect the enable pins to PWM pins and the direction pins to digital pins.',
      'Mount the HC-SR04 at the front of the chassis, facing forward.',
      'Upload code that drives forward, and when an obstacle is within about 20 cm, stops, reverses briefly, and turns.',
      'Test with the wheels off the ground first.',
      'Test on the floor at low speed.',
    ],
    safety: [
      'Keep the robot off the ground while testing motors.',
      'The L298N gets hot. Ensure ventilation and use a heat sink.',
      'Never short battery terminals. Remove batteries when the robot is stored.',
      'Verify all motor and driver ratings against their datasheets before powering up.',
    ],
    compatibilityNotes: [
      'L298N voltage drop reduces the voltage available to the motors.',
      'Confirm motor voltage and current ratings before choosing the battery.',
    ],
  },
  {
    id: 'led-emergency',
    name: 'LED Emergency Light',
    aliases: ['Emergency Light', 'LED Night Light'],
    category: 'Lighting',
    description: 'A battery-powered LED light that switches on in darkness.',
    difficulty: 'Beginner',
    durationMinutes: 60,
    newProductPrice: 599,
    consumablesCost: 20,
    icon: 'bulb',
    requiresSpecCheck: false,
    requirements: [
      { componentId: 'led', quantity: 4 },
      { componentId: 'resistor', quantity: 4 },
      { componentId: 'ldr', quantity: 1 },
      { componentId: 'battery-holder', quantity: 1 },
      { componentId: 'breadboard', quantity: 1 },
      { componentId: 'jumper', quantity: 6 },
    ],
    instructions: [
      'Wire each LED in series with a 220 Ω resistor. Check the LED polarity before connecting.',
      'Connect the LED branches in parallel across the battery holder.',
      'Plan the LDR circuit using a voltage divider and a transistor switch. Test it with a multimeter before connecting the LEDs.',
      'Insert the batteries and check the brightness and total current draw.',
      'Test the light in a dark room, then in daylight.',
    ],
    safety: [
      'Observe LED polarity. Reversed LEDs will not light.',
      'Do not exceed the battery holder’s rated current.',
      'Do not connect any mains supply to this build.',
    ],
    compatibilityNotes: [
      'The LDR transistor circuit needs verification with a multimeter before use.',
    ],
  },
  {
    id: 'temp-monitor',
    name: 'Temperature Monitoring System',
    aliases: ['Digital Temperature Monitor', 'Temperature Monitor'],
    category: 'Environment',
    description: 'Reads temperature and raises an audible and visual alert above a set limit.',
    difficulty: 'Beginner',
    durationMinutes: 120,
    newProductPrice: 1299,
    consumablesCost: 40,
    icon: 'thermo',
    requiresSpecCheck: false,
    requirements: [
      { componentId: 'arduino-uno', quantity: 1, alternatives: ['esp32'], critical: true },
      { componentId: 'dht11', quantity: 1, critical: true },
      { componentId: 'lcd16x2', quantity: 1 },
      { componentId: 'buzzer', quantity: 1 },
      { componentId: 'breadboard', quantity: 1 },
      { componentId: 'jumper', quantity: 8 },
      { componentId: 'power-supply', quantity: 1 },
    ],
    instructions: [
      'Wire the DHT11 with a pull-up resistor on the data line.',
      'Connect the I2C LCD to the SDA and SCL pins.',
      'Connect the buzzer to a digital pin through a suitable driver if your buzzer requires it.',
      'Upload a sketch that prints the temperature and sounds the buzzer above your chosen limit.',
      'Test by warming the sensor gently and checking the alarm threshold.',
    ],
    safety: [
      'Do not place the sensor near heating elements or flames.',
      'Power from USB or a 5V adapter only.',
    ],
    compatibilityNotes: [
      'DHT11 requires a pull-up resistor on the data line.',
    ],
  },
  {
    id: 'motion-alarm',
    name: 'Motion Alarm',
    aliases: ['Motion Detector', 'PIR Alarm'],
    category: 'Security',
    description: 'Sounds a buzzer and lights an LED when motion is detected.',
    difficulty: 'Beginner',
    durationMinutes: 90,
    newProductPrice: 899,
    consumablesCost: 30,
    icon: 'radar',
    requiresSpecCheck: false,
    requirements: [
      { componentId: 'arduino-uno', quantity: 1, alternatives: ['esp32'], critical: true },
      { componentId: 'pir', quantity: 1, critical: true },
      { componentId: 'buzzer', quantity: 1 },
      { componentId: 'led', quantity: 2 },
      { componentId: 'resistor', quantity: 2 },
      { componentId: 'jumper', quantity: 8 },
      { componentId: 'power-supply', quantity: 1 },
    ],
    instructions: [
      'Connect the PIR output to a digital pin and power it from the 5V rail.',
      'Connect the buzzer and each LED to digital pins. Use a series resistor for each LED.',
      'Upload a sketch that triggers the alarm on motion and holds it for a set time.',
      'Allow about 60 seconds for the PIR to warm up, then test by walking in front of it.',
    ],
    safety: [
      'Keep the power supply at a safe distance from the breadboard and do not short the rails.',
      'Do not connect the alarm to mains wiring.',
    ],
    compatibilityNotes: [
      'PIR sensors need a warm-up period after power-on.',
    ],
  },
];



/* ---------------------------------------------------------------------------
 * Live catalogue. Pages and the matching engine read these exports. At startup
 * the app replaces them with the database catalogue (see replaceCatalogue).
 * Until then they hold the bundled demo data, so offline demos keep working.
 * ------------------------------------------------------------------------- */
export const COMPONENTS: Component[] = [...BUNDLED_COMPONENTS];
export const PROJECTS: Project[] = [...BUNDLED_PROJECTS];
export const COMPONENTS_BY_ID: Record<string, Component> = {};
export const PROJECTS_BY_ID: Record<string, Project> = {};

export type CatalogueSource = 'database' | 'bundled';
export const catalogueState: { source: CatalogueSource; loadedAt: string | null } = {
  source: 'bundled',
  loadedAt: null,
};

export function replaceCatalogue(input: { components: Component[]; projects: Project[]; source: CatalogueSource }) {
  COMPONENTS.length = 0;
  for (const c of input.components) COMPONENTS.push(c);
  PROJECTS.length = 0;
  for (const p of input.projects) PROJECTS.push(p);
  for (const k of Object.keys(COMPONENTS_BY_ID)) delete COMPONENTS_BY_ID[k];
  for (const c of input.components) COMPONENTS_BY_ID[c.id] = c;
  for (const k of Object.keys(PROJECTS_BY_ID)) delete PROJECTS_BY_ID[k];
  for (const p of input.projects) PROJECTS_BY_ID[p.id] = p;
  catalogueState.source = input.source;
  catalogueState.loadedAt = new Date().toISOString();
}

export function useBundledCatalogue() {
  replaceCatalogue({ components: BUNDLED_COMPONENTS, projects: BUNDLED_PROJECTS, source: 'bundled' });
}

replaceCatalogue({ components: BUNDLED_COMPONENTS, projects: BUNDLED_PROJECTS, source: 'bundled' });

/** Sample kit matching the example inventory in the brief. Created fresh on each call. */
const SAMPLE_SEED: { componentId: string; quantity: number; condition: Condition; notes?: string }[] = [
  { componentId: 'arduino-uno', quantity: 1, condition: 'Working', notes: 'From an old robotics kit' },
  { componentId: 'ultrasonic', quantity: 2, condition: 'Working' },
  { componentId: 'led', quantity: 10, condition: 'Working' },
  { componentId: 'resistor', quantity: 20, condition: 'Working' },
  { componentId: 'servo', quantity: 1, condition: 'Working' },
  { componentId: 'jumper', quantity: 15, condition: 'Working' },
  { componentId: 'breadboard', quantity: 1, condition: 'Working' },
  { componentId: 'dht11', quantity: 1, condition: 'Working' },
  { componentId: 'dc-motor', quantity: 2, condition: 'Working' },
];

export function sampleInventory(): InventoryItem[] {
  const now = new Date().toISOString();
  return SAMPLE_SEED.flatMap((s) => {
    const c = COMPONENTS_BY_ID[s.componentId];
    if (!c) return [];
    return [{
      id: uid(),
      componentId: c.id,
      name: c.name,
      category: c.category,
      quantity: s.quantity,
      condition: s.condition,
      specs: c.specs,
      notes: s.notes ?? '',
      source: 'Sample kit',
      addedAt: now,
    }];
  });
}
