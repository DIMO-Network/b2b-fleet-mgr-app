import './elements/index.ts'
import './views/index.ts'
import './global-styles.ts'

//@ts-ignore
BigInt.prototype.toJSON = function () {
    return Number(this);
};
