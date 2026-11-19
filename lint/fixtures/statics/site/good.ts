// The intended way: a static member names its class, and this is an instance's; a function of its own, an object's
// method or a static field's initializer has a this that is not the static member's.
class Base {
  static readonly ORIGIN = 0;
}

export class Shape extends Base {
  static count = Shape.ORIGIN;
  static self = this;
  size = 1;
  static next(): number {
    return Shape.count + Base.ORIGIN;
  }
  static make(): object {
    return {
      grow(): object {
        return this;
      },
      bound: function (this: object): object {
        return this;
      },
      Inner: class {
        method(): object {
          return this;
        }
      },
    };
  }
  grown(): number {
    const read = (): number => this.size;
    return read() + super.constructor.length;
  }
}
