import { Utilities } from "./sensorUtilities";

// getting bugs from logistic and potentially random noise methods
// file to test with simple data

// Physical, fixed constraints
const MAX_ACCL = 5;
const VEL_ST_STATE = 0.95 * 50;
const RMS_NOISE = 16.25 * 10**(-3);

// ICs
const INIT_ACCL = 0;
const INIT_VEL = 0.05 * 50;
const INIT_DISP = 0;

// Time step
const DT = 500 // ms

// Logistic params
const K = 0.4; // growth rate factor
const T_INF = 12.5; // time of inflection (s)

// Setup dynamic motion variables
let accl = INIT_ACCL;
let vel = INIT_VEL;
let disp = INIT_DISP;

for (let t = 0; t < 30000; t += DT) {
  const velEstimate = (Utilities.logistic(
    (t / 1000), VEL_ST_STATE, K, T_INF)
  );
  console.log(`time: ${t} s\t -> \tlogst. velocity: ${vel} m/s\t`);

  accl = (velEstimate - vel) / (DT / 1000);
  accl = accl <= MAX_ACCL ? accl : MAX_ACCL;
  vel += accl * (DT / 1000);
  disp += vel * (DT / 1000);
  console.log(`|\taccl: ${accl} m/s² \tvel: ${vel} m/s \tdisp: ${disp} m\t\n`);
};
