import './elements/index.ts'
import './views/index.ts'

//@ts-ignore
BigInt.prototype.toJSON = function () {
    return Number(this);
};
