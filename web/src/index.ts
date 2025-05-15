import './elements/index.ts'

//@ts-ignore
BigInt.prototype.toJSON = function () {
    return Number(this);
};