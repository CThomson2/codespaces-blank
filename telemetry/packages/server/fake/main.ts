
// types & pod data
import { 
  pods,
  Pod,
  Measurement,
  RangeMeasurement,
  LiveReading,
  SensorData,
  RunData,
  sensors,
  SensorInstance
} from './src/index'

// data gen simulation utilities and complentary files
// import Sensors from './sensors';
import { DataManager } from './data-manager';


// TS error not recognising mqtt, will fix later
// import mqtt from 'mqtt';

// const client = mqtt.connect('mqtt://localhost:1883');

/**
 * Gets all of the measurements from the `pods.ts` file that we want to generate data for. (Currently excludes enum measurements)
 * Optionally could include a whitelist/blacklist of measurements to generate data for.
 */
export const measurements = (Object.values(pods) as Pod[]).reduce(
  (acc, pod) => (
    Object.entries(pod.measurements).forEach(([key, measurement]) => {
      if (measurement.format === 'enum') return;
      acc[key] = measurement;
    }),
    acc
  ),
  {} as Record<string, RangeMeasurement>,
);

export const sensorData: Record<string, LiveReading> = {}

// helper functions
/**
 * counts quantity of sensors of that type, categorised by the variable of measurement
 * @param podData a key - value item from the measurements object
 * @param currentKey the sensor data's key (effectively its unique ID)
 * @returns sensor quantity
 */
const countSensors = <T extends Pod['measurements']>(podData: T, currentKey: string): number => {
  return Object.values(podData).filter( (sensor: Measurement) => {
    return sensor.key.startsWith(currentKey) && !sensor.key.endsWith('avg');
  }).length;
}

/**
 * Gets an arbitrary initial value for each reading
 * Testing functionTo be replaced with user defined params fetched from GUI
 * @param podData a key - value item from the measurements object
 * @param currentKey the sensor data's key (effectively its unique ID)
 * @returns initial value for a given sensor/measurement
 */
const getInitialValue = <T extends Pod['measurements']>(data: RangeMeasurement): number => {
  // this function is only called once for each type, using the first sensor of that type
  // e.g. 'accelerometer_1', so the suffix is removed
  switch(data.key.replace(/_[^_]*\d$/, '')) {
    case 'accelerometer':
    case 'acceleration':
    case 'displacement':
    case 'hall_effect':
    case 'levitation_height':
    case 'keyence':
      return 0;
    case 'velocity':
      // Initial velocity (t = 0) must be > 0 by definition, i.e. t = 0 being the start of the run
      // This also aids in smoothly transitioning into the asymptotic logistic curve velocity follows
      return data.limits.critical.high * 0.1;
    case 'thermistor':
      return 25;
    case 'power_line_resistance':
      return 10;
    default: 
      if (data.key.startsWith('pressure')) { break; }
    }
  // reservoir pressure
  if (data.key.match(/(push|pull|brake)(?!.*reservoir)/)) { return 1; }
  // pneumatic and brake pressure
  if (data.key.endsWith('reservoir')) { return 5; }
  
  else {
    console.log('Unrecognised sensor', data);
    const { low, high } = data.limits.critical;
    return Math.floor(Math.random() * (high - low)) + low;
  }
}

// create categorised object of sensor types and their respective measurements
for (const [name, data] of Object.entries(measurements)) {
  // don't overwrite if sensor already exists
  if (sensorData[data.type]) continue;
  data.key = data.key.replace(/_[^_]*\d$/, '');

  // fill the properties of the current sensor object
  sensorData[data.type] = {
    ...data as Omit<RangeMeasurement, 'name'>,
    // count the number of sensors of current type e.g. pressure, motion, etc.
    quantity: countSensors(measurements, data.key.replace(/_.*/, '')),
    // create an object of live data for each sensor type
    readings: Object.fromEntries(Object.keys(measurements)
      .filter( (name) => !name.endsWith('avg') && measurements[name].type == data.type)
      .map( el => [el, getInitialValue(measurements[el])])
    )
  } as Omit<LiveReading, 'name'>;

}

// Setup initial conditions for simulation
const initialConditions: SensorData = {}

for (const [sensor, data] of Object.entries(sensorData)) {
  initialConditions[sensor] = data.readings;
}

// instantiate DataManager instance
const dataManager = DataManager.getInstance(initialConditions)


/**
 * Main runtime loop function that generates data series
 * @param runTime simulation time in ms (not real time, based on sensor timesteps)
 * @param random option to simulate random data - later to be replaced with a config object
 * which allows user to randomise select sensor readings. Default is false
 * @param specific an array of specific sensor readings to simulate. Default is false 
 * i.e. simulate all sensors
 * @returns 
 */
const generateDataSeries: void | any = (
  runTime: number,
  random: boolean = false,
  specific: false | string[] = false,
) => {
  // Create a deep copy so as not to reference the object in memory
  // Allows interdependent sensor calculations to reference data at the correct timestep
  const currentData: SensorData = JSON.parse(
    JSON.stringify(dataManager.data),
  );
  
  // store the predefined sampling times of each sensor in accessible object
  const samplingTimes: Record<string, number> = {};
  Object.entries(sensorData).forEach( ([ name, sensor ]) => {
    samplingTimes[name] = sensor.sampling_time;
  });
  // create object to store the next sampling time for each sensor, initialised to the first timestep
  const nextSamplingTimes: typeof samplingTimes = {...samplingTimes}
    
  let t = 0;
  
  if (random) {
    while (t <= runTime) {
      const newData = dataManager.data;
      t = Math.min(...Object.values(nextSamplingTimes));
      // Set up loop to run for the specified time (will configure individual sensor timesteps later)
      // Section for randomised data generation
      // Because the data is random, a second copy of the data object to be referenced for temporally 
      //   accurate results is not needed
      for (const sensor in newData) {
        if (t < nextSamplingTimes[sensor]) { continue; }
        for (const unit in newData[sensor]) {
          // Get new randomised values and add noise to each value
          // currentData is modified directly as there are no interdependencies for randomised data
          newData[sensor][unit] = sensors.SensorLogic.getRandomValue(
            measurements[unit].limits, measurements[unit].format
            ) + sensors.SensorLogic.addRandomNoise(measurements[unit].rms_noise);
        }
        // Set the next sampling time for the sensor
        nextSamplingTimes[sensor] += samplingTimes[sensor];
      }
      // set next timestep to the sampling time to come soonest
      // t += Math.min(...Object.values(samplingTimes));
      dataManager.data = newData;
      // console.log(t, newData)
      // console.log();
    }
    return dataManager.storedPodData;
  }

  // ## Sensor-specific functionality ## //
  
  // Create object to store class instances
  const instances: Record<string, any> = {};

  // instantiate each sensor class (move inside main function later)
  Object.values(sensors).forEach( (sens: any) => {
    // ignore if it's the top level class
    if (Object.getPrototypeOf(sens.prototype) == Object.prototype) {return; }
    const name = sens.name as string;
    const instance: SensorInstance<typeof sensors[keyof typeof sensors]> 
      = new sens(sensorData[sens.name.toLowerCase()]);
    instances[name.toLowerCase()] = instance;
  });
  
  while (t <= runTime) {
    t = Math.min(...Object.values(nextSamplingTimes));
    const newData = {...currentData};
    
    for (const sensor in newData) {
      if (t < nextSamplingTimes[sensor]) { continue; }
      newData[sensor] = instances[sensor].update(t);
      for (const unit in newData[sensor]) {
        // run inner loop for each sensor's reading, referring to current data and changing newData
        
      }
      nextSamplingTimes[sensor] += samplingTimes[sensor];
    }
    dataManager.data = newData;



  instances.Motion.time = 500;


  }
}

// generateDataSeries(1500, true);
// console.log(generateDataSeries(1500, true));
console.log(generateDataSeries(1500, true).length);