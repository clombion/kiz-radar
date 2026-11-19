// What house/statics refuses, everywhere: this or super in a static method, accessor or block, an arrow function's or a
// nested class's field's there too.
class Base {
  static readonly ORIGIN = 0;
  static start(): number {
    return Base.ORIGIN;
  }
}

export class Shape extends Base {
  static count = 0;
  static {
    this.count = 1; // refused
  }
  static next(): number {
    return this.count + 1; // refused
  }
  static later(): () => number {
    return () => this.count; // refused
  }
  static nested(): object {
    return class {
      own = this; // refused
    };
  }
  static get size(): number {
    return this.count; // refused
  }
  static set size(n: number) {
    this.count = n; // refused
  }
  static #hidden(): number {
    return this.count; // refused
  }
  static shown(): number {
    return Shape.#hidden();
  }
  static first(): number {
    return super.start(); // refused
  }
  static {
    super.start(); // refused
  }
}
