import { Sensor } from '../baseSensor';
import { LiveReading, Readings, Utilities } from '../../index';

export class Temperature extends Sensor {
  protected temperature: number;
  protected temp_init: number;

  constructor(data: LiveReading) {
    super(data);
    this.temp_init = Utilities.average(Object.values(data.readings)); // initial temperature
    this.temperature = this.temp_init; // dynamic value, set to initial temp. upon instantiation
  }

  getData(t: number): Readings {
    // const readings = // ... insert main main logic here
    // this.temperature = Utilities.average(readings); // take thermistor values' average
    // return readings; //
    return {};
  }
}
